/**
 * Implémentation des 7 actions Rovo et outils MCP (§12).
 *
 * Contrat : chaque action reçoit un `JsonPayload` et rend `ActionEnvelope<T>`.
 * Une action ne jette JAMAIS : toute erreur est captée par `run(...)` et
 * rendue sous la forme `{ ok: false, error: "..." }` (§12).
 *
 * Règles métier :
 * - §12 : `match-known-problem` accepte un texte libre OU une issueKey ;
 * - §17 : aucun classement d'agents ; tickets restreints masqués (PC-13) ;
 * - §19.6 : le rejet d'un rattachement recalcule l'addition ;
 * - §6, §17 : les brouillons clients ne sont jamais envoyés automatiquement.
 */

import { computeBill, computeTrend } from '../core/bill';
import { matchTicket, rankCandidates } from '../core/matching';
import { buildSignature, extractHardClues } from '../core/signature';
import { type BillPeriod, type Problem, type ProblemBill, type TicketSignature } from '../core/types';
import { compareTicketToProblem, draftCustomerUpdate } from '../platform/llm';
import { fetchIssue, visibleToCurrentUser } from '../platform/jira';
import {
  countMeToo,
  getBill,
  getCluster,
  getMembership,
  getProblem,
  getProblemByIssueKey,
  getSettings,
  getSignature,
  getTicketFact,
  listActiveSurges,
  listClusters,
  listFactsByIds,
  listMembershipsByProblem,
  listOpenProblems,
  listTerms,
  listTopProblemsByHours,
  rejectMembership,
  replaceBill,
  confirmMembership as repoConfirmMembership,
} from '../platform/db/repos';
import {
  optionalNumber,
  optionalText,
  requireBoolean,
  requireText,
  run,
  type ActionEnvelope,
  type JsonPayload,
} from './result';
import { agentContext, formatProblemSummary, otherPeriod, periodOfDays, rankByCost } from './agent';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

async function resolveProblem(problemKey: string): Promise<Problem> {
  const byKey = await getProblemByIssueKey(problemKey);
  if (byKey) return byKey;
  const byId = await getProblem(problemKey);
  if (byId) return byId;
  throw new Error(`Problème introuvable : ${problemKey}`);
}

async function buildSignatureFromText(text: string, projectKey: string): Promise<TicketSignature> {
  const hardClues = extractHardClues({ text });
  const terms = await listTerms(projectKey).catch(() => []);
  const lower = text.toLowerCase();
  const system = terms.find((t) => t.kind === 'system' && lower.includes(t.label.toLowerCase()))?.id ?? 'system-auto';
  const symptom = terms.find((t) => t.kind === 'symptom' && lower.includes(t.label.toLowerCase()))?.id ?? 'symptom-auto';
  const now = new Date().toISOString();
  return buildSignature(
    {
      issueId: `mcp_${Date.now()}`,
      systemId: system,
      symptomId: symptom,
      triggerText: text,
      hardClues,
      sourceText: text,
      language: 'fr',
    },
    now,
  );
}

interface TargetResolution {
  targetText: string;
  resolvedProjectId: string;
  signature: TicketSignature | null;
}

async function resolveMatchTarget(payload: JsonPayload): Promise<TargetResolution> {
  const text = optionalText(payload, 'text');
  const issueKey = optionalText(payload, 'issueKey');
  const projectKeyParam = optionalText(payload, 'projectKey');
  if (!text && !issueKey) throw new Error('Entrée requise : « text » ou « issueKey » (§12)');

  let targetText = text ?? '';
  let resolvedProjectId = projectKeyParam ?? '';
  let signature: TicketSignature | null = null;

  if (issueKey) {
    const fact = await getTicketFact(issueKey).catch(() => null);
    if (fact) {
      resolvedProjectId = resolvedProjectId || fact.projectId;
      targetText = targetText || fact.summary;
    }
    const issue = await fetchIssue(issueKey);
    if (issue) {
      resolvedProjectId = resolvedProjectId || issue.fields.project?.key || issue.fields.project?.id || '';
      targetText = targetText || issue.fields.summary || '';
    }
    signature = await getSignature(issue?.id ?? issueKey).catch(() => null);
  }

  if (!signature) {
    signature = await buildSignatureFromText(targetText, resolvedProjectId);
  }
  return { targetText, resolvedProjectId, signature };
}

// ---------------------------------------------------------------------------
// 1. match-known-problem (§12)
// ---------------------------------------------------------------------------

export async function actionMatchKnownProblem(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const { resolvedProjectId, signature } = await resolveMatchTarget(payload);
    const openProblems = await listOpenProblems(resolvedProjectId).catch(() => []);
    const clusters = await listClusters(resolvedProjectId).catch(() => []);
    // Contexte de l'agent (§12) : réglages lus en base, seuils par défaut sinon.
    const ctx = agentContext(resolvedProjectId, await getSettings(resolvedProjectId).catch(() => null));
    const settings = ctx.settings;

    const matchInput = {
      signature: signature!,
      openProblems,
      clusters,
      facts: [],
      compare: (tText: string, prob: Problem) => compareTicketToProblem(tText, prob),
      settings,
    };

    const best = await matchTicket(matchInput);
    const ranked = await rankCandidates(matchInput);
    const alternatives = ranked.filter((cand) => cand.problem?.id !== best.problem?.id);

    return {
      matched: Boolean(best.problem),
      problemKey: best.problem?.issueKey ?? best.problem?.id ?? null,
      problem: best.problem,
      confidence: best.confidence,
      basis: best.basis,
      rationale: best.rationale,
      workaround: best.proposedAnswer ?? best.problem?.workaround ?? null,
      alternatives: alternatives.map((alt) => ({
        problemKey: alt.problem?.issueKey ?? alt.problem?.id ?? null,
        confidence: alt.confidence,
        basis: alt.basis,
        rationale: alt.rationale,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// 2. list-top-problems (§12)
// ---------------------------------------------------------------------------

export async function actionListTopProblems(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const projectKey = requireText(payload, 'projectKey');
    const days = optionalNumber(payload, 'days', 30, 90);
    // Conversion `days` → période (§9, §12) : une seule implémentation, dans `agent.ts`.
    const period: BillPeriod = periodOfDays(days);
    const ctx = agentContext(projectKey, await getSettings(projectKey).catch(() => null));

    const bills = rankByCost(await listTopProblemsByHours(projectKey, period, 20));
    const result = await Promise.all(
      bills.map(async (bill) => {
        const problem = await getProblem(bill.problemId).catch(() => null);
        const previous = await getBill(bill.problemId, otherPeriod(period)).catch(() => null);
        const trend = computeTrend(previous, bill);
        return {
          problemKey: problem?.issueKey ?? bill.problemId,
          problemId: bill.problemId,
          system: problem?.systemId ?? '',
          symptom: problem?.symptomId ?? '',
          trigger: problem?.triggerText ?? '',
          state: problem?.state ?? 'confirmed',
          tickets: bill.tickets,
          hours: bill.hours,
          people: bill.people,
          hoursMethod: bill.hoursMethod,
          eur: bill.eur,
          trend: {
            direction: trend.direction,
            deltaPercent: trend.deltaPercent,
            previous: trend.previous,
            current: trend.current,
          },
          summary: problem ? formatProblemSummary(problem, bill, ctx.locale) : null,
        };
      }),
    );
    return { projectKey, period, days, problems: result };
  });
}

// ---------------------------------------------------------------------------
// 3. get-problem (§12)
// ---------------------------------------------------------------------------

export async function actionGetProblem(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const problemKey = requireText(payload, 'problemKey');
    const problem = await resolveProblem(problemKey);
    const bill30d = await getBill(problem.id, '30d').catch(() => null);
    const bill90d = await getBill(problem.id, '90d').catch(() => null);
    const cluster = await getCluster(problem.clusterId).catch(() => null);
    const memberships = await listMembershipsByProblem(problem.id, { attachedOnly: true }).catch(() => []);
    const meTooCount = await countMeToo(problem.id).catch(() => 0);

    const issueIds = memberships.map((m) => m.issueId);
    const visibleSet = await visibleToCurrentUser(issueIds).catch(() => new Set<string>());
    const visibleTickets = memberships.filter((m) => visibleSet.has(m.issueId) || visibleSet.has(m.issueKey)).map((m) => m.issueKey);

    return {
      problemKey: problem.issueKey ?? problem.id,
      problemId: problem.id,
      state: problem.state,
      signature: {
        systemId: problem.systemId,
        symptomId: problem.symptomId,
        triggerText: problem.triggerText,
      },
      system: problem.systemId,
      symptom: problem.symptomId,
      trigger: problem.triggerText,
      cause: problem.cause,
      workaround: problem.workaround,
      workaroundUrl: problem.workaroundUrl,
      fixIssueKey: problem.fixIssueKey,
      fixedAt: problem.fixedAt,
      bill30d,
      bill90d,
      bills: { '30d': bill30d, '90d': bill90d },
      attachedTicketsCount: memberships.length,
      attachedCount: memberships.length,
      visibleTickets,
      hiddenCount: memberships.length - visibleTickets.length,
      meTooCount,
      meToo: meTooCount,
      cluster,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. list-suspects (§12)
// ---------------------------------------------------------------------------

export async function actionListSuspects(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const projectKey = requireText(payload, 'projectKey');
    const clusters = await listClusters(projectKey, 'suspect');
    return {
      projectKey,
      suspects: clusters.map((cluster) => ({
        clusterId: cluster.id,
        system: cluster.systemId,
        symptom: cluster.symptomId,
        trigger: cluster.triggerText,
        signature: {
          systemId: cluster.systemId,
          symptomId: cluster.symptomId,
          triggerText: cluster.triggerText,
        },
        tickets30d: cluster.tickets30d,
        hours30d: cluster.hours30d,
        people30d: cluster.people30d,
        thresholdHit: cluster.thresholdHit,
        firstSeenAt: cluster.firstSeenAt,
        lastSeenAt: cluster.lastSeenAt,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// 5. get-surges (§12)
// ---------------------------------------------------------------------------

export async function actionGetSurges(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const projectKey = requireText(payload, 'projectKey');
    const surges = await listActiveSurges(projectKey);
    return {
      projectKey,
      surges: surges.map((s) => ({
        surgeId: s.id,
        clusterId: s.clusterId,
        rate: s.rate,
        baseline: s.baseline,
        factor: s.factor,
        startedAt: s.startedAt,
        incidentKey: s.incidentKey,
        expected: s.expected,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// 6. draft-customer-update (§12)
// ---------------------------------------------------------------------------

export async function actionDraftCustomerUpdate(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const problemKey = requireText(payload, 'problemKey');
    const problem = await resolveProblem(problemKey);
    const bill = await getBill(problem.id, '30d').catch(() => null);
    const meTooTotal = await countMeToo(problem.id).catch(() => 0);
    const memberships = await listMembershipsByProblem(problem.id, { attachedOnly: true }).catch(() => []);

    const stats = {
      openTickets: memberships.length,
      meToo: meTooTotal,
      hours: bill?.hours ?? 0,
      people: bill?.people ?? 0,
      fixDate: problem.fixedAt ?? null,
    };
    return draftCustomerUpdate(problem, stats, 'fr');
  });
}

// ---------------------------------------------------------------------------
// 7. confirm-membership (§12, §19.6)
// ---------------------------------------------------------------------------

export async function actionConfirmMembership(payload: JsonPayload): Promise<ActionEnvelope<unknown>> {
  return run(async () => {
    const issueKey = requireText(payload, 'issueKey');
    const problemKey = requireText(payload, 'problemKey');
    const confirmed = requireBoolean(payload, 'confirmed');
    const problem = await resolveProblem(problemKey);
    const membership = await getMembership(issueKey, problem.id);
    const issueId = membership?.issueId ?? issueKey;
    const now = new Date().toISOString();

    if (confirmed) {
      await repoConfirmMembership(issueId, problem.id, 'agent-mcp', now);
      return {
        updated: true,
        issueKey,
        problemKey,
        status: 'confirmed',
        confirmed: true,
        billRecalculated: false,
      };
    }

    await rejectMembership(issueId, problem.id, 'agent-mcp');
    await recalculateProblemBill(problem, now);
    return {
      updated: true,
      issueKey,
      problemKey,
      status: 'rejected',
      confirmed: false,
      billRecalculated: true,
    };
  });
}

async function recalculateProblemBill(problem: Problem, now: string): Promise<void> {
  const memberships = await listMembershipsByProblem(problem.id, { attachedOnly: true }).catch(() => []);
  const issueIds = memberships.map((m) => m.issueId);
  const facts = await listFactsByIds(issueIds).catch(() => []);
  const settings = agentContext(problem.projectId, await getSettings(problem.projectId).catch(() => null)).settings;

  const billTickets = facts.map((fact) => ({
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

  for (const period of ['30d', '90d'] as const) {
    const updatedBill: ProblemBill = computeBill({
      problemId: problem.id,
      period,
      tickets: billTickets,
      meToo: [],
      minutesPerTouch: settings.minutesPerTouch,
      hourRateEur: settings.hourRateEur,
      now,
    });
    await replaceBill(updatedBill, problem.projectId).catch(() => undefined);
  }
}
