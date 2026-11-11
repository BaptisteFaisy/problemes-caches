/**
 * Resolvers d'actions transverses (§12, §13 écran 4, PC-10, PC-12, PC-20).
 *
 * Expose : `getIssueContext`, `draftCustomerUpdate`, `matchFreeText`,
 * `startBootstrap`, `bootstrapProgress`, `loadSampleData`, `clearSampleData`.
 */

import { matchTicket } from '../core/matching';
import { buildSignature, extractHardClues } from '../core/signature';
import type { BootstrapProgress, CustomerUpdateDraft, TicketSignature } from '../core/types';
import { defaultSettings } from '../core/types';
import {
  countMeToo,
  getBill,
  getBootstrapProgress,
  getProblem,
  getSettings,
  listClusters,
  listMembershipsByProblem,
  listOpenProblems,
  listTerms,
  upsertBootstrapProgress,
  upsertSettings,
  upsertSignature,
  upsertTicketFacts,
} from '../platform/db/repos';
import { fetchIssue, searchTickets } from '../platform/jira';
import { clearSample, loadSample } from '../sample/load';
import {
  compareTicketToProblem,
  draftCustomerUpdate as llmDraftCustomerUpdate,
  extractSignature,
} from '../platform/llm';
import { logShort, shortError } from '../platform/log';
import type { IssueContextData } from '../ui/api';
import type { MatchResult } from '../core/types';
import type { Locale } from '../ui/i18n/index';
import { asRecord, extractLocale, readString } from './helpers';
import { loadProjectSettings } from './recalc';

type ResolverReq = { payload?: unknown; context?: unknown };

/** Clé du projet de service fictif du jeu d'exemple (§20). */
const SAMPLE_PROJECT_KEY = 'SUP';

/** Encart « Ce que ce bug coûte » sur le ticket de l'équipe qui corrige (§13 écran 4, PC-20). */
export async function getIssueContext(req: ResolverReq): Promise<IssueContextData> {
  const p = asRecord(req.payload);
  const issueId = readString(p, 'issueId');
  if (!issueId) return { problems: [], hoursPerMonth: 0, people: 0 };
  const issue = await fetchIssue(issueId);
  const projectId = issue?.fields?.project?.id ?? '';
  const issueKey = issue?.key ?? readString(p, 'issueKey');
  if (!projectId || !issueKey) return { problems: [], hoursPerMonth: 0, people: 0 };
  const problems = (await listOpenProblems(projectId)).filter((pr) => pr.fixIssueKey === issueKey);
  const entries: { problem: (typeof problems)[number]; bill: Awaited<ReturnType<typeof getBill>>; people: number }[] = [];
  let hoursPerMonth = 0;
  let people = 0;
  for (const problem of problems) {
    const bill = await getBill(problem.id, '30d');
    hoursPerMonth += bill?.hours ?? 0;
    // Personnes : le max des additions, jamais la somme — une personne
    // touchée par deux problèmes liés ne compte pas deux fois (§18).
    people = Math.max(people, bill?.people ?? 0);
    entries.push({ problem, bill, people: bill?.people ?? 0 });
  }
  return { problems: entries, hoursPerMonth, people };
}

/** Brouillon de message groupé (§7.4, PC-18) : préparé, jamais envoyé par l'app. */
export async function draftCustomerUpdate(req: ResolverReq): Promise<CustomerUpdateDraft> {
  const p = asRecord(req.payload);
  const problemId = readString(p, 'problemId');
  const problem = await getProblem(problemId);
  if (!problem) throw new Error(`Problème introuvable : ${problemId}`);
  const [memberships, meTooCount, bill] = await Promise.all([
    listMembershipsByProblem(problem.id, { attachedOnly: true }),
    countMeToo(problem.id),
    getBill(problem.id, '30d'),
  ]);
  const locale = extractLocale(req.context);
  return llmDraftCustomerUpdate(
    problem,
    {
      openTickets: memberships.length,
      meToo: meTooCount,
      hours: bill?.hours ?? 0,
      people: bill?.people ?? 0,
      fixDate: problem.fixedAt,
    },
    locale,
  );
}

/** Texte libre → problème connu (§12) : même échelle de rattachement que le panneau (§8.4). */
export async function matchFreeText(req: ResolverReq): Promise<MatchResult> {
  const p = asRecord(req.payload);
  const text = readString(p, 'text');
  const projectKey = readString(p, 'projectKey');
  if (!text) throw new Error('text est requis pour la recherche libre');
  const locale = extractLocale(req.context);
  const projectId = await resolveProjectId(req, projectKey);
  const signature = await signatureForFreeText(text, projectId, locale);
  const settings = await loadProjectSettings(projectId, projectKey);
  const [openProblems, clusters] = await Promise.all([
    listOpenProblems(projectId),
    listClusters(projectId),
  ]);
  return matchTicket({
    signature,
    openProblems,
    clusters,
    facts: [],
    compare: (ticketText, problem) => compareTicketToProblem(ticketText, problem),
    settings,
  });
}

/** Signature d'un texte libre : vocabulaire du projet d'abord (§8.2), rien n'est écrit en base. */
async function signatureForFreeText(
  text: string,
  projectId: string,
  locale: Locale,
): Promise<TicketSignature> {
  const terms = projectId ? await listTerms(projectId) : [];
  const extracted = await extractSignature({
    text,
    vocabulary: {
      systems: terms.filter((term) => term.kind === 'system'),
      symptoms: terms.filter((term) => term.kind === 'symptom'),
    },
    hardClues: extractHardClues({ text }),
    projectLanguage: locale,
  });
  return buildSignature({
    issueId: `free-text-${Date.now()}`,
    systemId: extracted.system,
    symptomId: extracted.symptom,
    triggerText: extracted.trigger,
    hardClues: extractHardClues({ text }),
    sourceText: text,
    language: extracted.language,
  }, new Date().toISOString());
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

/** Initialisation des 90 jours d'historique (PC-10) : la progression est amorcée, le lot WP-K traite. */
export async function startBootstrap(req: ResolverReq): Promise<BootstrapProgress> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  if (!projectId) throw new Error('projectId est requis pour l’initialisation');
  const existing = await getBootstrapProgress(projectId);
  if (existing && !existing.finished) return existing;
  const now = new Date().toISOString();
  const progress: BootstrapProgress = {
    projectId,
    total: 0,
    done: 0,
    failed: 0,
    startedAt: now,
    updatedAt: now,
    finished: false,
  };
  await upsertBootstrapProgress(progress);
  return progress;
}

/** Avancement de l'initialisation (PC-10) ; `null` avant tout démarrage. */
export async function bootstrapProgress(req: ResolverReq): Promise<BootstrapProgress | null> {
  const p = asRecord(req.payload);
  return getBootstrapProgress(readString(p, 'projectId'));
}

/** Jeu d'exemple (PC-12, §21) : 60 jours de tickets fictifs injectés en base. */
export async function loadSampleData(req: ResolverReq): Promise<{ tickets: number }> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  const projectKey = readString(p, 'projectKey') || SAMPLE_PROJECT_KEY;
  return loadSample(projectId, projectKey);
}

/** Retrait du jeu d'exemple : seuls les identifiants préfixés sont supprimés (PC-12). */
export async function clearSampleData(req: ResolverReq): Promise<void> {
  const p = asRecord(req.payload);
  await clearSample(readString(p, 'projectId'));
}
