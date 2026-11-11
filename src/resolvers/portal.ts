/**
 * Resolvers du portail client (§7.3, §13 écrans 6 et 7, PC-15, PC-16, PC-19).
 *
 * Expose : `getPortalBanner`, `meToo`, `getRequestDetail`.
 *
 * §16 : le bandeau accepte les visiteurs anonymes et se replie sur les trois
 * problèmes les plus actifs quand le service consulté n'est pas connu.
 */

import type { MeToo, Problem } from '../core/types';
import {
  getBill,
  getProblem,
  insertMeToo,
  listFactsByIds,
  listMembershipsByProblem,
  listMembershipsByIssue,
  listProblems,
} from '../platform/db/repos';
import { currentAccountId, searchTickets } from '../platform/jira';
import type { PortalBannerData, RequestDetailData } from '../ui/api';
import { asRecord, readString } from './helpers';

type ResolverReq = { payload?: unknown; context?: unknown };

/** Nombre de problèmes affichés dans le bandeau (§16). */
const BANNER_LIMIT = 3;

/** Échantillon de tickets consultés pour rattacher un problème à un service. */
const SERVICE_SAMPLE = 5;

export async function getPortalBanner(req: ResolverReq): Promise<PortalBannerData> {
  const p = asRecord(req.payload);
  const projectKey = readString(p, 'projectKey');
  const service = readString(p, 'service') || null;
  const projectId = await resolveProjectId(req, projectKey);
  const published = (await listProblems(projectId)).filter(isBannerWorthy);
  const scored = await Promise.all(published.map(withActivity));
  scored.sort((a, b) => b.activity - a.activity);
  const filtered = service
    ? await filterByService(scored.map((entry) => entry.problem), service)
    : [];
  const chosen = (filtered.length > 0 ? filtered : scored.map((entry) => entry.problem)).slice(0, BANNER_LIMIT);
  return { problems: chosen.map(toBannerEntry), service };
}

/** Un problème vérifié n'alerte plus le portail (§5, §16). */
function isBannerWorthy(problem: Problem): boolean {
  return problem.publishedToPortal && problem.state !== 'verified';
}

/** Activité d'un problème : nombre de tickets de son addition 30 jours. */
async function withActivity(problem: Problem): Promise<{ problem: Problem; activity: number }> {
  const bill = await getBill(problem.id, '30d');
  return { problem, activity: bill?.tickets ?? 0 };
}

/** Problèmes dont un ticket rattaché porte le service consulté (§16). */
async function filterByService(problems: Problem[], service: string): Promise<Problem[]> {
  const wanted = service.trim().toLowerCase();
  const kept: Problem[] = [];
  for (const problem of problems) {
    const memberships = await listMembershipsByProblem(problem.id, { attachedOnly: true });
    const facts = await listFactsByIds(memberships.slice(0, SERVICE_SAMPLE).map((m) => m.issueId));
    if (facts.some((fact) => (fact.service ?? '').toLowerCase() === wanted)) kept.push(problem);
  }
  return kept;
}

/** Projet suivi : contexte du module d'abord, recherche Jira ensuite (§14). */
async function resolveProjectId(req: ResolverReq, projectKey: string): Promise<string> {
  const context = asRecord(req.context);
  const extension = asRecord(context['extension']);
  const project = asRecord(extension['project']);
  const fromContext = typeof project['id'] === 'string' ? project['id'] : '';
  if (fromContext) return fromContext;
  if (!projectKey) return '';
  const issues = await searchTickets(projectKey, '', 1);
  return issues[0]?.fields?.project?.id ?? projectKey;
}

/** Entrée du bandeau : libellés lisibles et contournement validé (§7.3). */
function toBannerEntry(problem: Problem): PortalBannerData['problems'][number] {
  return {
    problemKey: problem.issueKey ?? problem.id,
    systemLabel: problem.systemId,
    symptomLabel: problem.symptomId,
    workaround: problem.workaround,
    problemId: problem.id,
  };
}

export async function meToo(req: ResolverReq): Promise<void> {
  const p = asRecord(req.payload);
  const problemId = readString(p, 'problemId');
  const problem = await getProblem(problemId);
  if (!problem) throw new Error(`Problème introuvable : ${problemId}`);
  const accountId = await currentAccountId();
  if (!accountId) throw new Error('Compte requis pour signaler « Moi aussi » (§16)');
  const entry: MeToo = {
    problemId,
    accountId,
    displayName: accountId,
    organization: null,
    at: new Date().toISOString(),
  };
  await insertMeToo(entry);
}

/** Détail vide : la demande n'est rattachée à aucun problème connu (§13.7). */
function emptyRequestDetail(): RequestDetailData {
  return { problemKey: null, state: null, workaround: null, fixIssueKey: null, fixedAt: null };
}

export async function getRequestDetail(req: ResolverReq): Promise<RequestDetailData> {
  const p = asRecord(req.payload);
  const issueId = readString(p, 'issueId');
  if (!issueId) return emptyRequestDetail();
  const memberships = await listMembershipsByIssue(issueId);
  const attached = memberships.find((m) => m.attached && !m.rejected);
  if (!attached) return emptyRequestDetail();
  const problem = await getProblem(attached.problemId);
  if (!problem) return emptyRequestDetail();
  return {
    problemKey: problem.issueKey,
    state: problem.state,
    workaround: problem.workaround,
    fixIssueKey: problem.fixIssueKey,
    fixedAt: problem.fixedAt,
  };
}
