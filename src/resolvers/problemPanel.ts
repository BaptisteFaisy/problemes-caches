/**
 * Resolver du panneau fiche problème (§13 écran 3, PC-05).
 *
 * Expose : `getProblemPanel`.
 */

import { computeTrend } from '../core/bill.ts';
import type { BillPeriod, ProblemBill, Term, Trend } from '../core/types.ts';
import {
  countTicketsByDay,
  getBill,
  getProblem,
  getTerm,
  listMembershipsByProblem,
  listMeTooByProblem,
} from '../platform/db/repos.ts';
import { visibleToCurrentUser } from '../platform/jira.ts';
import type { ProblemPanelData, TicketPoint } from '../ui/api.ts';
import { asRecord, readString } from './helpers.ts';

type ResolverReq = { payload?: unknown; context?: unknown };

export async function getProblemPanel(req: ResolverReq): Promise<ProblemPanelData> {
  const p = asRecord(req.payload);
  const problemId = readString(p, 'problemId');
  const problem = await getProblem(problemId);
  if (!problem) throw new Error(`Problème introuvable : ${problemId}`);
  const [bill30, bill90] = await Promise.all([
    getBill(problem.id, '30d'),
    getBill(problem.id, '90d'),
  ]);
  const bills: Record<BillPeriod, ProblemBill | null> = { '30d': bill30, '90d': bill90 };
  const trend: Trend | null = bill30 ? computeTrend(bill90, bill30) : null;
  const rawCurve = await countTicketsByDay(problem.projectId, problem.id, 90);
  const curve: TicketPoint[] = rawCurve.map((pt) => ({ day: pt.day, count: pt.count }));
  const allMemberships = await listMembershipsByProblem(problem.id, { attachedOnly: true });
  const visibleIds = await visibleToCurrentUser(allMemberships.map((m) => m.issueId));
  const visibleMemberships = allMemberships.filter(
    (m) => visibleIds.has(m.issueId) || visibleIds.has(m.issueKey),
  );
  const hiddenCount = allMemberships.length - visibleMemberships.length;
  const meToo = await listMeTooByProblem(problem.id);
  const [systemTerm, symptomTerm] = await Promise.all([
    getTerm(problem.systemId),
    getTerm(problem.symptomId),
  ]);
  const vocabulary = { system: systemTerm, symptom: symptomTerm };
  return {
    problem,
    bills,
    trend,
    curve,
    memberships: visibleMemberships,
    meToo,
    vocabulary,
    hiddenCount: Math.max(0, hiddenCount),
  };
}
