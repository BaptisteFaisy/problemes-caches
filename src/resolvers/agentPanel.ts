/**
 * Resolvers du panneau de l'agent (§7.2, §13 écran 1, PC-08).
 *
 * Expose : `getAgentPanel`, `attachAndDraft`, `detachTicket`.
 *
 * Le panneau **lit** ce que la base a enregistré (règle 4) : reconnaissance
 * par `matchTicket` (core pur, comparateur modèle injecté), rattachements
 * existants, addition stockée. Rattacher ou retirer recalcule l'addition
 * (§19.6) via le module partagé `recalc.ts`.
 */

import { matchTicket, rankCandidates } from '../core/matching';
import type {
  Cluster,
  MatchResult,
  Membership,
  Problem,
  Settings,
  TicketFact,
  TicketSignature,
} from '../core/types';
import {
  getBill,
  getProblem,
  getSignature,
  getTicketFact,
  listClusters,
  listMembershipsByIssue,
  listOpenProblems,
  upsertMembership,
  detachMembership,
} from '../platform/db/repos';
import { currentAccountId, linkIssues } from '../platform/jira';
import { compareTicketToProblem, draftAnswer } from '../platform/llm';
import { logShort, shortError } from '../platform/log';
import type { AgentPanelData, AttachResult } from '../ui/api';
import { asRecord, extractLocale, readString } from './helpers';
import { loadProjectSettings, recalculateAllBills } from './recalc';

type ResolverReq = { payload?: unknown; context?: unknown };

/** Comparateur modèle injecté dans le domaine pur (§8.4, marche 2). */
function modelCompare(ticketText: string, problem: Problem) {
  return compareTicketToProblem(ticketText, problem);
}

export async function getAgentPanel(req: ResolverReq): Promise<AgentPanelData> {
  const p = asRecord(req.payload);
  const issueId = readString(p, 'issueId');
  const issueKey = readString(p, 'issueKey');
  if (!issueId) throw new Error('issueId est requis pour le panneau de l’agent');
  const fact = await getTicketFact(issueId);
  const projectId = fact?.projectId ?? readString(asRecord(req.context), 'projectId');
  const projectKey = fact?.projectKey ?? issueKey.split('-')[0] ?? '';
  const settings = await loadProjectSettings(projectId, projectKey);
  const memberships = await listMembershipsByIssue(issueId);
  const membership = memberships.find((m) => m.attached && !m.rejected) ?? null;
  const pendingProposals = memberships.filter((m) => !m.attached && !m.rejected);
  const sig = await getSignature(issueId);
  const match = await matchFor(sig, projectId, fact, settings);
  const alternatives = await alternativesFor(sig, projectId, fact, settings, match);
  const targetProblemId = membership?.problemId ?? match.problem?.id ?? null;
  const bill = targetProblemId ? await getBill(targetProblemId, '30d') : null;
  return { settings, match, membership, alternatives, bill, pendingProposals };
}

/** Reconnaissance du ticket (§8.4) ; sans signature, aucun rapprochement (§18). */
async function matchFor(
  sig: TicketSignature | null,
  projectId: string,
  fact: TicketFact | null,
  settings: Settings,
): Promise<MatchResult> {
  if (!sig) {
    return {
      step: 'none',
      problem: null,
      cluster: null,
      confidence: 'low',
      basis: 'rule',
      rationale: 'Ticket pas encore indexé : aucune signature connue.',
      auto: false,
      undetermined: false,
      proposedAnswer: null,
    };
  }
  const [openProblems, clusters] = await Promise.all([
    listOpenProblems(projectId),
    listClusters(projectId),
  ]);
  return matchTicket({
    signature: sig,
    openProblems,
    clusters,
    facts: fact ? [fact] : [],
    compare: modelCompare,
    settings,
  });
}

/** Autres problèmes plausibles, proposés sans rattachement (§18), 3 au plus. */
async function alternativesFor(
  sig: TicketSignature | null,
  projectId: string,
  fact: TicketFact | null,
  settings: Settings,
  best: MatchResult,
): Promise<MatchResult[]> {
  if (!sig || sig.undetermined) return [];
  try {
    const [openProblems, clusters] = await Promise.all([
      listOpenProblems(projectId),
      listClusters(projectId),
    ]);
    const ranked = await rankCandidates({
      signature: sig,
      openProblems,
      clusters,
      facts: fact ? [fact] : [],
      compare: modelCompare,
      settings,
    });
    return ranked.filter((alt) => alt.problem?.id !== best.problem?.id).slice(0, 3);
  } catch (error) {
    logShort(`getAgentPanel alternatives : ${shortError(error)}`);
    return [];
  }
}

export async function attachAndDraft(req: ResolverReq): Promise<AttachResult> {
  const p = asRecord(req.payload);
  const issueId = readString(p, 'issueId');
  const problemId = readString(p, 'problemId');
  if (!issueId || !problemId) throw new Error('issueId et problemId sont requis');
  const problem = await getProblem(problemId);
  if (!problem) throw new Error(`Problème introuvable : ${problemId}`);
  const fact = await getTicketFact(issueId);
  const now = new Date().toISOString();
  const accountId = (await currentAccountId()) ?? 'agent';
  const membership: Membership = {
    issueId,
    issueKey: fact?.issueKey ?? issueId,
    problemId,
    basis: 'human',
    confidence: 'high',
    rationale: 'Rattaché à la main par l’agent (§8.4).',
    proposedAt: now,
    confirmedBy: accountId,
    confirmedAt: now,
    rejected: false,
    rejectedBy: null,
    attached: true,
  };
  await upsertMembership(membership, problem.projectId);
  if (problem.issueKey && fact?.issueKey) {
    await linkIssues(fact.issueKey, problem.issueKey, 'Relates');
  }
  await recalculateAllBills(problemId, now);
  const locale = extractLocale(req.context);
  const proposedAnswer = await draftAnswer(problem, fact?.summary ?? '', locale);
  return { membership, proposedAnswer };
}

export async function detachTicket(req: ResolverReq): Promise<void> {
  const p = asRecord(req.payload);
  const issueId = readString(p, 'issueId');
  const problemId = readString(p, 'problemId');
  if (!issueId || !problemId) throw new Error('issueId et problemId sont requis');
  await detachMembership(issueId, problemId);
  // §19.6 : retirer un ticket diminue l'addition d'autant, rien de plus.
  await recalculateAllBills(problemId);
}
