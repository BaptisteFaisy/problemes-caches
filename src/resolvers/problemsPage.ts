/**
 * Resolvers de la page « Problèmes » d'une file JSM (§7.1, §13 écran 2, PC-09).
 *
 * Expose : `getProblemsPage`, `confirmSuspect`, `rejectSuspect`,
 * `splitCluster`, `mergeProblems`, `updateProblem`.
 *
 * Règle 4 : la page lit les grappes, additions et flambées déjà écrites par
 * les traitements (consumer, nuit) ; elle ne recalcule les additions qu'après
 * un geste humain qui change les rattachements (§19.6), via `recalc.ts`.
 */

import { mergeBills } from '../core/bill.ts';
import { clusterIdOf } from '../core/cluster.ts';
import { canTransition, startWatching } from '../core/lifecycle.ts';
import type {
  Cluster,
  Problem,
  ProblemBill,
  ProblemState,
  TicketSignature,
} from '../core/types.ts';
import { signatureKey } from '../core/types.ts';
import {
  detachMembership,
  getBill,
  getCluster,
  getProblem,
  getSignature,
  getTicketFact,
  listActiveSurges,
  listClusters,
  listFactsByIds,
  listMembershipsByProblem,
  listProblems,
  listSignatures,
  listTicketFacts,
  replaceBill,
  updateProblemState,
  upsertCluster,
  upsertMembership,
  upsertProblem,
  upsertSignature,
} from '../platform/db/repos.ts';
import { createProblemIssue, currentAccountId, linkIssues } from '../platform/jira.ts';
import type { ClusterLine, ProblemPatch, ProblemsPageData } from '../ui/api.ts';
import { asRecord, buildDataQuality, readString, readStringArray } from './helpers.ts';
import { getBillAndTrend, loadProjectSettings, recalculateAllBills } from './recalc.ts';

type ResolverReq = { payload?: unknown; context?: unknown };

/** Tickets d'exemple affichés par ligne de grappe (modal de scission, §13). */
const SAMPLE_KEYS_LIMIT = 5;

/** Tickets sans rattachement affichés en bas de page (§13 écran 2). */
const UNATTACHED_SCAN_LIMIT = 30;
const UNATTACHED_LIMIT = 10;

export async function getProblemsPage(req: ResolverReq): Promise<ProblemsPageData> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  const projectKey = readString(p, 'projectKey');
  if (!projectId) throw new Error('projectId est requis pour la page Problèmes');
  const settings = await loadProjectSettings(projectId, projectKey);
  const [clusters, problems, surges, quality, signatures] = await Promise.all([
    listClusters(projectId),
    listProblems(projectId),
    listActiveSurges(projectId),
    buildDataQuality(projectId, settings),
    listSignatures(projectId),
  ]);
  const sampleKeys = await sampleKeysByCluster(projectId, signatures);
  const suspects = await toLines(clusters.filter((c) => c.status === 'suspect'), problems, sampleKeys);
  const recurring = await toLines(clusters.filter((c) => c.status === 'recurring'), problems, sampleKeys);
  const problemLines = await toLines(
    clusters.filter((c) => c.status === 'problem'),
    problems,
    sampleKeys,
  );
  const withProblem = problemLines.filter((line) => line.problem !== null);
  const unattached = await buildUnattached(projectId, signatures);
  return {
    settings,
    suspects,
    problems: byCost(withProblem, problems),
    recurring,
    surges,
    unattached,
    quality,
  };
}

/** Clés de tickets par grappe : signatures → identifiant de grappe (§8.5). */
async function sampleKeysByCluster(
  projectId: string,
  signatures: TicketSignature[],
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  for (const sig of signatures) {
    const id = clusterIdOf(projectId, sig.systemId, sig.symptomId, sig.triggerText);
    const keys = grouped.get(id) ?? [];
    if (keys.length < SAMPLE_KEYS_LIMIT) keys.push(sig.issueId);
    grouped.set(id, keys);
  }
  const facts = await listFactsByIds([...grouped.values()].flat());
  const keyOf = new Map(facts.map((f) => [f.issueId, f.issueKey]));
  const named = new Map<string, string[]>();
  for (const [id, ids] of grouped) {
    named.set(id, ids.map((issueId) => keyOf.get(issueId) ?? issueId));
  }
  return named;
}

/** Lignes de grappes avec addition, tendance et problème confirmé éventuel. */
async function toLines(
  clusterList: Cluster[],
  problems: Problem[],
  sampleKeys: Map<string, string[]>,
): Promise<ClusterLine[]> {
  const problemByCluster = new Map(problems.map((pr) => [pr.clusterId, pr]));
  const lines: ClusterLine[] = [];
  for (const cluster of clusterList) {
    const problem = problemByCluster.get(cluster.id) ?? null;
    const { bill, trend } = problem
      ? await getBillAndTrend(problem.id)
      : { bill: null, trend: null };
    lines.push({
      cluster,
      bill,
      trend,
      problem,
      thresholdHit: cluster.thresholdHit,
      sampleKeys: sampleKeys.get(cluster.id) ?? [],
    });
  }
  return lines;
}

/** Problèmes confirmés sans grappe en base : ligne de repli (§13 écran 2). */
function byCost(lines: ClusterLine[], problems: Problem[]): ClusterLine[] {
  const known = new Set(lines.map((line) => line.problem?.id));
  const orphanClusters = problems.filter((pr) => !known.has(pr.id)).map(clusterOfProblem);
  const orphans: ClusterLine[] = orphanClusters.map((cluster) => ({
    cluster,
    bill: null,
    trend: null,
    problem: problems.find((pr) => pr.clusterId === cluster.id) ?? null,
    thresholdHit: cluster.thresholdHit,
    sampleKeys: [],
  }));
  return [...lines, ...orphans].sort((a, b) => (b.bill?.hours ?? 0) - (a.bill?.hours ?? 0));
}

function clusterOfProblem(problem: Problem): Cluster {
  return {
    id: problem.clusterId,
    projectId: problem.projectId,
    systemId: problem.systemId,
    symptomId: problem.symptomId,
    triggerText: problem.triggerText,
    tickets30d: 0,
    hours30d: 0,
    people30d: 0,
    status: 'problem',
    firstSeenAt: problem.createdAt,
    lastSeenAt: problem.updatedAt,
    overThreshold: true,
    thresholdHit: 'tickets',
  };
}

/** Tickets récents sans signature exploitable : aucun rattachement possible (§18). */
async function buildUnattached(
  projectId: string,
  signatures: TicketSignature[],
): Promise<{ issueKey: string; issueId: string; summary: string }[]> {
  const signed = new Set(signatures.filter((s) => !s.undetermined).map((s) => s.issueId));
  const facts = await listTicketFacts(projectId, undefined, UNATTACHED_SCAN_LIMIT);
  return facts
    .filter((fact) => !signed.has(fact.issueId))
    .slice(0, UNATTACHED_LIMIT)
    .map((fact) => ({ issueKey: fact.issueKey, issueId: fact.issueId, summary: fact.summary }));
}

// ---------------------------------------------------------------------------
// Gestes humains sur les suspects et les problèmes (§7.1, §5, §18)
// ---------------------------------------------------------------------------

/** §7.1 étape 4 : confirmation d'une grappe suspecte en problème unique (§10). */
export async function confirmSuspect(req: ResolverReq): Promise<{ problemKey: string }> {
  const p = asRecord(req.payload);
  const clusterId = readString(p, 'clusterId');
  const removeIssueIds = readStringArray(p, 'removeIssueIds');
  const cluster = await getCluster(clusterId);
  if (!cluster) throw new Error(`Grappe introuvable : ${clusterId}`);
  const settings = await loadProjectSettings(cluster.projectId, '');
  const sigKey = signatureKey(cluster.systemId, cluster.symptomId, cluster.triggerText);
  const created = await createProblemIssue(settings.projectKey || cluster.projectId, {
    summary: `${cluster.systemId} · ${cluster.symptomId} — ${cluster.triggerText}`,
    description:
      `Problème confirmé depuis une grappe suspecte.\n` +
      `Signature : ${sigKey}\n` +
      `Tickets sur ${settings.thresholds.windowDays} jours : ${cluster.tickets30d}`,
    issueTypeName: settings.problemIssueType,
    signatureKey: sigKey,
    systemId: cluster.systemId,
    symptomId: cluster.symptomId,
    triggerText: cluster.triggerText,
  });
  const now = new Date().toISOString();
  const problem: Problem = {
    id: `prob_${cluster.id}`,
    projectId: cluster.projectId,
    projectKey: settings.projectKey,
    issueKey: created.key,
    clusterId: cluster.id,
    systemId: cluster.systemId,
    symptomId: cluster.symptomId,
    triggerText: cluster.triggerText,
    state: 'confirmed',
    cause: null,
    workaround: null,
    workaroundUrl: null,
    fixIssueKey: null,
    fixedAt: null,
    watchUntil: null,
    regression: false,
    publishedToPortal: false,
    createdAt: now,
    updatedAt: now,
  };
  await upsertProblem(problem);
  await upsertCluster({ ...cluster, status: 'problem' });
  await attachClusterTickets(problem, cluster, removeIssueIds, now);
  await recalculateAllBills(problem.id, now);
  return { problemKey: created.key };
}

/** Rattache les tickets de la grappe, sauf ceux retirés par l'humain (§7.1, §18). */
async function attachClusterTickets(
  problem: Problem,
  cluster: Cluster,
  removeIssueIds: string[],
  now: string,
): Promise<void> {
  const signatures = await listSignatures(cluster.projectId);
  const clusterKey = signatureKey(cluster.systemId, cluster.symptomId, cluster.triggerText);
  const removed = new Set(removeIssueIds);
  const accountId = (await currentAccountId()) ?? 'agent';
  for (const sig of signatures) {
    if (signatureKey(sig.systemId, sig.symptomId, sig.triggerText) !== clusterKey) continue;
    const isRemoved = removed.has(sig.issueId);
    const fact = await getTicketFact(sig.issueId);
    await upsertMembership(
      {
        issueId: sig.issueId,
        issueKey: fact?.issueKey ?? sig.issueId,
        problemId: problem.id,
        basis: 'human',
        confidence: 'high',
        rationale: isRemoved
          ? 'Retiré par l’agent à la confirmation de la grappe (§7.1).'
          : 'Confirmé avec la grappe (§7.1).',
        proposedAt: now,
        confirmedBy: isRemoved ? null : accountId,
        confirmedAt: isRemoved ? null : now,
        rejected: isRemoved,
        rejectedBy: isRemoved ? accountId : null,
        attached: !isRemoved,
      },
      cluster.projectId,
    );
    if (!isRemoved && fact?.issueKey && problem.issueKey) {
      await linkIssues(fact.issueKey, problem.issueKey, 'Relates');
    }
  }
}

/** Rejet d'un suspect : la grappe passe à `dismissed` et sort des alertes (§8.5). */
export async function rejectSuspect(req: ResolverReq): Promise<void> {
  const p = asRecord(req.payload);
  const clusterId = readString(p, 'clusterId');
  const cluster = await getCluster(clusterId);
  if (!cluster) throw new Error(`Grappe introuvable : ${clusterId}`);
  await upsertCluster({ ...cluster, status: 'dismissed' });
}

/** Scission d'une grappe : deux causes, deux signatures distinctes (§18). */
export async function splitCluster(req: ResolverReq): Promise<{ clusterId: string }> {
  const p = asRecord(req.payload);
  const clusterId = readString(p, 'clusterId');
  const issueIds = readStringArray(p, 'issueIds');
  const triggerText = readString(p, 'triggerText');
  const cluster = await getCluster(clusterId);
  if (!cluster) throw new Error(`Grappe introuvable : ${clusterId}`);
  if (!triggerText) throw new Error('Le déclencheur de la nouvelle grappe est requis');
  const now = new Date().toISOString();
  const newId = clusterIdOf(cluster.projectId, cluster.systemId, cluster.symptomId, triggerText);
  await upsertCluster({
    ...cluster,
    id: newId,
    triggerText,
    tickets30d: issueIds.length,
    hours30d: 0,
    people30d: 0,
    status: 'watching',
    overThreshold: false,
    thresholdHit: null,
    firstSeenAt: now,
    lastSeenAt: now,
  });
  for (const issueId of issueIds) {
    const sig = await getSignature(issueId);
    if (sig) await upsertSignature({ ...sig, triggerText }, cluster.projectId);
  }
  return { clusterId: newId };
}

/** Fusion de problèmes (§18) : le premier survit, les additions sont fusionnées. */
export async function mergeProblems(req: ResolverReq): Promise<{ problemKey: string }> {
  const p = asRecord(req.payload);
  const problemIds = readStringArray(p, 'problemIds');
  const keeperId = problemIds[0];
  if (!keeperId || problemIds.length < 2) {
    throw new Error('mergeProblems : au moins deux identifiants de problèmes sont requis');
  }
  const keeper = await getProblem(keeperId);
  if (!keeper) throw new Error(`Problème introuvable : ${keeperId}`);
  const now = new Date().toISOString();
  await absorbProblems(keeper, problemIds.slice(1), now);
  await mergePeriodBills(keeper, problemIds.slice(1));
  return { problemKey: keeper.issueKey ?? keeper.id };
}

/** Les tickets des problèmes absorbés rejoignent le survivant (§18). */
async function absorbProblems(keeper: Problem, otherIds: string[], now: string): Promise<void> {
  for (const otherId of otherIds) {
    const memberships = await listMembershipsByProblem(otherId);
    for (const m of memberships) {
      await detachMembership(m.issueId, otherId);
      await upsertMembership(
        { ...m, problemId: keeper.id, attached: !m.rejected, proposedAt: now },
        keeper.projectId,
      );
      if (!m.rejected && keeper.issueKey && m.issueKey) {
        await linkIssues(m.issueKey, keeper.issueKey, 'Relates');
      }
    }
    // État « vérifié » + cause : le problème absorbé sort des problèmes ouverts (§5).
    await updateProblemState(otherId, 'verified', {
      cause: `Fusionné dans ${keeper.issueKey ?? keeper.id} (§18).`,
      updatedAt: now,
    });
  }
}

/** Additions fusionnées sans double compte, période par période (§18, §9). */
async function mergePeriodBills(keeper: Problem, otherIds: string[]): Promise<void> {
  for (const period of ['30d', '90d'] as const) {
    const bills: ProblemBill[] = [];
    for (const id of [keeper.id, ...otherIds]) {
      const bill = await getBill(id, period);
      if (bill) bills.push(bill);
    }
    if (bills.length > 1) {
      await replaceBill({ ...mergeBills(bills), problemId: keeper.id }, keeper.projectId);
    }
  }
}

/** Patchs humains sur un problème (§5, §10) : cause, contournement, correctif, portail. */
export async function updateProblem(req: ResolverReq): Promise<Problem> {
  const p = asRecord(req.payload);
  const problemId = readString(p, 'problemId');
  const patch = asRecord(p['patch']) as ProblemPatch;
  const problem = await getProblem(problemId);
  if (!problem) throw new Error(`Problème introuvable : ${problemId}`);
  const target = (patch.state ?? problem.state) as ProblemState;
  if (target !== problem.state && !canTransition(problem.state, target)) {
    throw new Error(`Transition refusée (§5) : ${problem.state} → ${target}`);
  }
  const now = new Date().toISOString();
  const watched = target === 'fixed' && !problem.fixedAt
    ? startWatching(problem, await loadProjectSettings(problem.projectId, problem.projectKey), now)
    : null;
  await updateProblemState(problemId, target, {
    ...patch,
    ...(watched ? { fixedAt: watched.fixedAt, watchUntil: watched.watchUntil } : {}),
    updatedAt: now,
  });
  const updated = await getProblem(problemId);
  return updated ?? { ...problem, state: target };
}
