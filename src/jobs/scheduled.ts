/**
 * Recalcul quotidien nocturne (`scheduled.ts`, §10, §14, PC-03, PC-06, PC-17).
 *
 * Chaque nuit, le `scheduledTrigger` exécute `nightlyRecalc`, qui pour chaque
 * projet suivi :
 *   - recalcule les grappes sur la fenêtre glissante de 30 jours
 *     (`computeCluster`) ; une grappe au-dessus du seuil passe en `suspect`
 *     avec son `thresholdHit` (§8.5) ;
 *   - recalcule l'addition sur 30 j **et** 90 j de chaque problème, chaque
 *     période ne comptant que ses propres tickets (`computeBill`, `replaceBill`, §9) ;
 *   - publie la synthèse quotidienne **unique** sur le ticket de problème
 *     (`publishDailySummary`, §10 : jamais un commentaire par ticket rattaché) ;
 *   - fait passer à `verified` les problèmes corrigés dont la surveillance est
 *     écoulée sans nouveau ticket (`watchElapsed`, §7.4) ;
 *   - relance l'amorçage restant (§14, PC-10).
 */

import { computeBill } from '../core/bill.ts';
import type { BillTicket } from '../core/bill.ts';
import { computeCluster } from '../core/cluster.ts';
import { watchElapsed } from '../core/lifecycle.ts';
import { addDays } from '../core/time.ts';
import { signatureKey } from '../core/types.ts';
import type { BillPeriod, Problem, ProblemBill, Settings, TicketFact } from '../core/types.ts';
import {
  getSettings,
  listClusters,
  listFactsByIds,
  listMeTooByProblem,
  listMembershipsByProblem,
  listProblems,
  listSignatures,
  listTicketFacts,
  replaceBill,
  updateProblemState,
  upsertCluster,
} from '../platform/db/repos.ts';
import { publishDailySummary, setProblemProperty } from '../platform/jira.ts';
import { logShort, shortError } from '../platform/log.ts';
import { nextBootstrapBatch } from './bootstrap.ts';
import { billTicketOf, followedProjectIds, registerFollowedProject, windowTicketsOf } from './sync.ts';

/**
 * Recalcul nocturne complet (§14).
 * `projectIds` désigne explicitement les projets à traiter ; à défaut, ceux
 * mémorisés par l'instance sont utilisés.
 */
export async function nightlyRecalc(projectIds?: readonly string[]): Promise<void> {
  const now = new Date().toISOString();
  const targets = projectIds && projectIds.length > 0 ? [...projectIds] : followedProjectIds();
  if (targets.length === 0) {
    logShort('nightlyRecalc : aucun projet suivi connu');
    return;
  }
  for (const projectId of targets) {
    registerFollowedProject(projectId);
    try {
      await processProjectNightly(projectId, now);
    } catch (error) {
      logShort(`nightlyRecalc ${projectId} : ${shortError(error)}`);
    }
  }
  logShort(`nightlyRecalc terminé sur ${targets.length} projet(s)`);
}

/** Étapes nocturnes d'un projet : grappes, additions, synthèse, surveillance. */
export async function processProjectNightly(projectId: string, now: string): Promise<void> {
  const settings = await getSettings(projectId);
  if (!settings) return;
  await recalcProjectClusters(settings, now);
  await recalcProjectProblems(settings, now);
  await verifyWatchedProblems(projectId, now);
  await nextBootstrapBatch(projectId, settings.projectKey);
}

// ---------------------------------------------------------------------------
// Grappes et suspects (§8.5)
// ---------------------------------------------------------------------------

/** Recalcule chaque grappe du projet sur la fenêtre glissante (§8.5, PC-03). */
async function recalcProjectClusters(settings: Settings, now: string): Promise<void> {
  const since = addDays(now, -settings.thresholds.windowDays);
  const facts = await listTicketFacts(settings.projectId, since);
  const signatures = await listSignatures(settings.projectId);
  for (const cluster of await listClusters(settings.projectId)) {
    const key = signatureKey(cluster.systemId, cluster.symptomId, cluster.triggerText);
    const issueIds = new Set(
      signatures
        .filter((sig) => signatureKey(sig.systemId, sig.symptomId, sig.triggerText) === key)
        .map((sig) => sig.issueId),
    );
    const clusterFacts = facts.filter((fact) => issueIds.has(fact.issueId));
    const updated = computeCluster({
      projectId: settings.projectId,
      systemId: cluster.systemId,
      symptomId: cluster.symptomId,
      triggerText: cluster.triggerText,
      tickets: windowTicketsOf(clusterFacts, settings),
      thresholds: settings.thresholds,
      now,
      status: cluster.status,
    });
    await upsertCluster(updated);
  }
}

// ---------------------------------------------------------------------------
// Additions et synthèse (§9, §10)
// ---------------------------------------------------------------------------

/** Recalcule les additions de chaque problème et publie la synthèse du jour. */
async function recalcProjectProblems(settings: Settings, now: string): Promise<void> {
  for (const problem of await listProblems(settings.projectId)) {
    try {
      await recalcProblem(problem, settings, now);
    } catch (error) {
      logShort(`addition ${problem.id} : ${shortError(error)}`);
    }
  }
}

/** Addition 30 j et 90 j d'un problème, puis propriété et synthèse (§9, §10). */
async function recalcProblem(problem: Problem, settings: Settings, now: string): Promise<void> {
  const memberships = await listMembershipsByProblem(problem.id, { attachedOnly: true });
  const facts = await listFactsByIds(memberships.map((m) => m.issueId));
  const meToo = await listMeTooByProblem(problem.id);
  const bill30 = billForPeriod(problem.id, '30d', facts, meToo, settings, now);
  const bill90 = billForPeriod(problem.id, '90d', facts, meToo, settings, now);
  await replaceBill(bill30, settings.projectId);
  await replaceBill(bill90, settings.projectId);
  if (!problem.issueKey) return;
  await setProblemProperty(problem.issueKey, bill30);
  await publishDailySummary(problem, bill30);
}

/**
 * Addition d'une période : seuls les tickets créés dans la période comptent,
 * sinon 30 j et 90 j donneraient le même chiffre (§9).
 */
export function billForPeriod(
  problemId: string,
  period: BillPeriod,
  facts: readonly TicketFact[],
  meToo: readonly { accountId: string; organization: string | null }[],
  settings: Settings,
  now: string,
): ProblemBill {
  const days = period === '30d' ? 30 : 90;
  const since = addDays(now, -days);
  const tickets: BillTicket[] = facts.filter((fact) => fact.createdAt >= since).map(billTicketOf);
  return computeBill({
    problemId,
    period,
    tickets,
    meToo,
    minutesPerTouch: settings.minutesPerTouch,
    hourRateEur: settings.hourRateEur,
    now,
  });
}

// ---------------------------------------------------------------------------
// Surveillance (§7.4, PC-17)
// ---------------------------------------------------------------------------

/**
 * Problèmes corrigés dont la surveillance est écoulée → vérifiés (§7.4).
 *
 * « Sans nouveau ticket » est déjà garanti : un ticket de même signature arrivé
 * pendant la surveillance fait passer le problème en `regression` à l'arrivée
 * (`consumer.ts`, §7.5), il n'est donc plus dans l'état `fixed` lu ici.
 */
async function verifyWatchedProblems(projectId: string, now: string): Promise<void> {
  for (const problem of await listProblems(projectId, 'fixed')) {
    if (!watchElapsed(problem, now)) continue;
    await updateProblemState(problem.id, 'verified', { updatedAt: now });
    logShort(`problème ${problem.issueKey ?? problem.id} : surveillance écoulée, vérifié`);
  }
}
