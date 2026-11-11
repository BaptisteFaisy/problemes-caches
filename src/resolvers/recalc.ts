/**
 * Reconstitution de l'addition d'un problème (§9, §19.6).
 *
 * Utilise uniquement les repos SQL et le domaine pur `computeBill` /
 * `computeTrend`. Aucun SQL écrit ici, aucune duplication d'addition
 * (règle 2) : c'est LA seule implémentation de recalcul côté resolvers.
 *
 * §9 : chaque période (30/90 jours) filtre les tickets rattachés sur sa
 * fenêtre glissante — sans filtre, les deux additions seraient identiques.
 */

import { computeBill, computeTrend } from '../core/bill.ts';
import type { BillTicket } from '../core/bill.ts';
import { addDays, parseIso } from '../core/time.ts';
import type { BillPeriod, ProblemBill, Settings, TicketFact, Trend } from '../core/types.ts';
import { defaultSettings } from '../core/types.ts';
import {
  getBill,
  getProblem,
  getSettings,
  listFactsByIds,
  listMembershipsByProblem,
  listMeTooByProblem,
  replaceBill,
} from '../platform/db/repos.ts';

/** Jours de fenêtre glissante par période d'addition (§9). */
const PERIOD_DAYS: Record<BillPeriod, number> = { '30d': 30, '90d': 90 };

/** Charge les réglages d'un projet avec repli par défaut (§13 écran 5). */
export async function loadProjectSettings(
  projectId: string,
  projectKey: string,
): Promise<Settings> {
  const stored = await getSettings(projectId);
  return stored ?? defaultSettings(projectId, projectKey);
}

/** Fait d'un ticket dans la fenêtre de la période (§9, PC-13 : les masqués comptent). */
function inWindow(fact: TicketFact, sinceIso: string): boolean {
  const at = parseIso(fact.createdAt);
  const since = parseIso(sinceIso);
  if (!at || !since) return false;
  return at.getTime() >= since.getTime();
}

/**
 * Reconstitue et persiste l'addition d'un problème pour une période donnée
 * (§9, §19.6, PC-06) : retirer un ticket diminue l'addition d'autant.
 */
export async function recalculateProblemBill(
  problemId: string,
  period: BillPeriod,
  now: string = new Date().toISOString(),
): Promise<ProblemBill | null> {
  const problem = await getProblem(problemId);
  if (!problem) return null;
  const settings = await loadProjectSettings(problem.projectId, problem.projectKey);
  const memberships = await listMembershipsByProblem(problemId, { attachedOnly: true });
  const facts = await listFactsByIds(memberships.map((m) => m.issueId));
  const since = addDays(now, -PERIOD_DAYS[period]);
  const billTickets: BillTicket[] = facts
    .filter((fact) => inWindow(fact, since))
    .map((fact) => ({
      issueId: fact.issueId,
      reporter: fact.reporter,
      organization: fact.organization,
      loggedSeconds: fact.loggedSeconds,
      touches: fact.touches,
      reopened: fact.reopened,
      escalated: fact.escalated,
      slaBreached: fact.slaBreached,
      visible: fact.visible,
    }));
  const meTooEntries = await listMeTooByProblem(problemId);
  const bill = computeBill({
    problemId,
    period,
    tickets: billTickets,
    meToo: meTooEntries.map((entry) => ({
      accountId: entry.accountId,
      organization: entry.organization,
    })),
    minutesPerTouch: settings.minutesPerTouch,
    hourRateEur: settings.hourRateEur,
    now,
  });
  await replaceBill(bill, problem.projectId);
  return bill;
}

/** Recalcule les deux périodes d'un problème (§9) : 30 jours puis 90 jours. */
export async function recalculateAllBills(problemId: string, now?: string): Promise<void> {
  const at = now ?? new Date().toISOString();
  await recalculateProblemBill(problemId, '30d', at);
  await recalculateProblemBill(problemId, '90d', at);
}

/**
 * Addition courante (30 jours) et tendance par rapport à la période
 * précédente stockée (§9).
 */
export async function getBillAndTrend(
  problemId: string,
): Promise<{ bill: ProblemBill | null; trend: Trend | null }> {
  const current = await getBill(problemId, '30d');
  const previous = await getBill(problemId, '90d');
  if (!current) return { bill: null, trend: null };
  return { bill: current, trend: computeTrend(previous, current) };
}
