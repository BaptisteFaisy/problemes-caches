/**
 * Consommateur : traitement d'un ticket et d'un lot d'amorçage (`consumer.ts`, §14).
 *
 * `processTicket` déroule le parcours « À l'arrivée d'un ticket » du §14 :
 *   1. lecture du ticket (`fetchIssue`, repli silencieux si 404) ;
 *   2. indices certains (`extractHardClues`) enrichis par le Teamwork Graph (§14) ;
 *   3. signature en cache par `sourceHash`, sinon extraction par le modèle (§8.2) ;
 *   4. enregistrement de `ticket_fact` et `signature` (§15) ;
 *   5. rattachement aux problèmes ouverts (`matchTicket`, §8.4) et appartenance ;
 *   6. compteurs de la grappe du ticket (`computeCluster`, §8.5) et flambée (§8.6) ;
 *   7. régression d'un problème corrigé ou vérifié de même signature (§7.5, §18).
 *
 * Aucune conversion n'est réécrite ici : les faits, les heures et les lots
 * viennent de `sync.ts`, les calculs de `src/core/*` (règle « zéro duplication »).
 */

import { clusterIdOf, computeCluster } from '../core/cluster.ts';
import { detectRegression } from '../core/lifecycle.ts';
import { matchTicket } from '../core/matching.ts';
import { buildSignature, extractHardClues, sourceHash } from '../core/signature.ts';
import { detectSurge } from '../core/surge.ts';
import { defaultSettings } from '../core/types.ts';
import type {
  BootstrapProgress,
  Cluster,
  HardClues,
  MatchResult,
  Membership,
  Problem,
  Settings,
  TicketFact,
  TicketSignature,
  Vocabulary,
} from '../core/types.ts';
import {
  findByHash,
  getBootstrapProgress,
  getCluster,
  getSettings,
  listActiveSurges,
  listClusters,
  listOpenProblems,
  listProblems,
  listTerms,
  updateProblemState,
  upsertBootstrapProgress,
  upsertCluster,
  upsertMembership,
  upsertSignature,
  upsertSurge,
  upsertTicketFact,
} from '../platform/db/repos.ts';
import { organizationOf, requestTypeOf, serviceOf } from '../platform/field.ts';
import { enrichClues } from '../platform/graph.ts';
import { fetchIssue } from '../platform/jira.ts';
import type { JiraIssue } from '../platform/jira-types.ts';
import { compareTicketToProblem, extractSignature } from '../platform/llm.ts';
import { logShort, shortError } from '../platform/log.ts';
import { nextBootstrapBatch } from './bootstrap.ts';
import {
  extractTicketText,
  keyOf,
  readTicketFact,
  registerFollowedProject,
  splitSurgeDates,
  ticketsForSignature,
  windowTicketsOf,
} from './sync.ts';

/** Lot d'amorçage reçu par le consommateur (§14, PC-10). */
export interface BootstrapPayload {
  projectId: string;
  projectKey: string;
  issueIds: string[];
}

/** Langue du projet : la signature s'écrit dans cette langue (§18). */
const PROJECT_LANGUAGE = 'fr' as const;

// ---------------------------------------------------------------------------
// Ticket arrivé (§14, PC-07)
// ---------------------------------------------------------------------------

/** Traite un ticket : extraction, rattachement, grappe, flambée, régression. */
export async function processTicket(issueId: string, now?: string): Promise<MatchResult> {
  const at = now ?? new Date().toISOString();
  const issue = await fetchIssue(issueId);
  if (!issue) {
    logShort('processTicket : ticket illisible, aucun rattachement');
    return emptyFallbackMatch();
  }
  const projectId = issue.fields.project?.id ?? '';
  const settings = (await getSettings(projectId)) ?? defaultSettings(projectId, issue.fields.project?.key ?? '');
  registerFollowedProject(settings.projectId);
  const text = extractTicketText(issue);
  const clues = await extractAndEnrichClues(issue, text);
  const fact = await persistTicketFact(issue, settings.projectId, clues);
  const sig = await resolveAndPersistSignature(issue.id, settings, text, clues, at);
  const match = await matchAndAttach(sig, fact, settings, text, at);
  // §18 : une signature indéterminée n'est jamais regroupée d'office, elle ne
  // forme donc ni grappe ni flambée ; le rattachement reste un geste humain.
  if (!sig.undetermined) {
    await updateClusterAndSurge(sig, settings, at);
    await checkRegression(settings.projectId, sig, at);
  }
  return match;
}

/** Indices certains, enrichis par le graphe quand il répond (§8.2, §14). */
async function extractAndEnrichClues(issue: JiraIssue, text: string): Promise<HardClues> {
  const raw = extractHardClues({
    text,
    requestType: requestTypeOf(issue),
    service: serviceOf(issue),
    component: issue.fields.components?.[0]?.name ?? null,
    organization: organizationOf(issue),
  });
  return enrichClues(issue.id, raw);
}

/** Enregistre les faits du ticket (§15). */
async function persistTicketFact(issue: JiraIssue, projectId: string, clues: HardClues): Promise<TicketFact> {
  const fact = await readTicketFact(issue, projectId);
  // Indices certains enrichis par le graphe (§14) : ils priment sur les champs bruts.
  const enriched: TicketFact = {
    ...fact,
    requestType: clues.requestType,
    service: clues.service,
    component: clues.component,
    organization: clues.organization,
  };
  await upsertTicketFact(enriched);
  return enriched;
}

/** Vocabulaire tenu du projet : le modèle choisit d'abord dedans (§8.2, §8.3). */
export async function loadVocabulary(projectId: string): Promise<Vocabulary> {
  const terms = await listTerms(projectId);
  return {
    systems: terms.filter((term) => term.kind === 'system'),
    symptoms: terms.filter((term) => term.kind === 'symptom'),
  };
}

/** Signature en cache par empreinte du texte, sinon extraction par le modèle (§8.2). */
async function resolveAndPersistSignature(
  issueId: string,
  settings: Settings,
  text: string,
  clues: HardClues,
  now: string,
): Promise<TicketSignature> {
  const cached = await findByHash(sourceHash(text));
  if (cached) {
    const reused: TicketSignature = { ...cached, issueId, extractedAt: now };
    await upsertSignature(reused, settings.projectId);
    return reused;
  }
  const llm = await extractSignature({
    text,
    vocabulary: await loadVocabulary(settings.projectId),
    hardClues: clues,
    projectLanguage: PROJECT_LANGUAGE,
  });
  const sig = buildSignature(
    {
      issueId,
      systemId: llm.system || 'undetermined',
      symptomId: llm.symptom || 'undetermined',
      triggerText: llm.trigger,
      hardClues: clues,
      sourceText: text,
      language: llm.language,
    },
    now,
  );
  await upsertSignature(sig, settings.projectId);
  return sig;
}

// ---------------------------------------------------------------------------
// Rattachement (§8.4) et appartenance (§15)
// ---------------------------------------------------------------------------

/** Confiance élevée → rattachement fait d'office ; moyenne → proposé (§8.4). */
export function attachedFor(confidence: string, undetermined: boolean): boolean {
  return confidence === 'high' && !undetermined;
}

/** Appartenance d'un ticket à un problème ; `null` quand aucun problème n'est retenu. */
export function membershipOf(
  sig: TicketSignature,
  fact: TicketFact,
  match: MatchResult,
  now: string,
): Membership | null {
  if (!match.problem) return null;
  return {
    issueId: sig.issueId,
    issueKey: fact.issueKey,
    problemId: match.problem.id,
    basis: match.basis,
    confidence: match.confidence,
    rationale: match.rationale,
    proposedAt: now,
    confirmedBy: null,
    confirmedAt: null,
    rejected: false,
    rejectedBy: null,
    attached: attachedFor(match.confidence, match.undetermined),
  };
}

/** Exécute `matchTicket` puis enregistre l'appartenance retenue (§8.4). */
async function matchAndAttach(
  sig: TicketSignature,
  fact: TicketFact,
  settings: Settings,
  text: string,
  now: string,
): Promise<MatchResult> {
  const openProblems = await listOpenProblems(settings.projectId);
  const clusters = await listClusters(settings.projectId);
  const compare = (ticketText: string, problem: Problem) => compareTicketToProblem(ticketText, problem);
  const match = await matchTicket({ signature: sig, openProblems, clusters, facts: [fact], compare, settings });
  const membership = membershipOf(sig, fact, match, now);
  if (membership) await upsertMembership(membership, settings.projectId);
  logShort(`rattachement ${match.step} (${match.confidence}) sur ${text.length} caractères`);
  return match;
}

// ---------------------------------------------------------------------------
// Grappe (§8.5) et flambée (§8.6)
// ---------------------------------------------------------------------------

/** Recalcule la seule grappe du ticket, puis vérifie le seuil de flambée. */
async function updateClusterAndSurge(sig: TicketSignature, settings: Settings, now: string): Promise<void> {
  const facts = await ticketsForSignature(settings.projectId, keyOf(sig));
  const clusterId = clusterIdOf(settings.projectId, sig.systemId, sig.symptomId, sig.triggerText);
  const previous = await getCluster(clusterId);
  const cluster = computeCluster({
    projectId: settings.projectId,
    systemId: sig.systemId,
    symptomId: sig.symptomId,
    triggerText: sig.triggerText,
    tickets: windowTicketsOf(facts, settings),
    thresholds: settings.thresholds,
    now,
    status: previous?.status,
  });
  await upsertCluster(cluster);
  await checkSurge(cluster, facts, settings, now);
}

/** Vérifie le seuil de flambée et enregistre l'alerte (§8.6, PC-14). */
async function checkSurge(
  cluster: Cluster,
  facts: readonly TicketFact[],
  settings: Settings,
  now: string,
): Promise<void> {
  const active = await listActiveSurges(settings.projectId);
  const existing = active.find((surge) => surge.clusterId === cluster.id) ?? null;
  const { recent, history } = splitSurgeDates(facts, settings.surgeWindowMinutes, now);
  const surge = detectSurge({
    clusterId: cluster.id,
    projectId: settings.projectId,
    recent,
    history,
    windowMinutes: settings.surgeWindowMinutes,
    factor: settings.surgeFactor,
    now,
    existing,
  });
  if (!surge) return;
  await upsertSurge(surge);
  logShort(`flambée sur la grappe ${cluster.id} (facteur ${surge.factor})`);
}

// ---------------------------------------------------------------------------
// Régression (§7.5, §18, PC-17)
// ---------------------------------------------------------------------------

/** Un ticket de même signature sur un problème corrigé ou vérifié = régression. */
async function checkRegression(projectId: string, sig: TicketSignature, now: string): Promise<void> {
  const key = keyOf(sig);
  for (const problem of await listProblems(projectId)) {
    if (problem.state !== 'fixed' && problem.state !== 'verified') continue;
    if (keyOf(problem) !== key) continue;
    if (!detectRegression(problem, now)) continue;
    await updateProblemState(problem.id, 'regression', { regression: true, updatedAt: now });
    logShort(`régression sur le problème ${problem.issueKey ?? problem.id}`);
  }
}

// ---------------------------------------------------------------------------
// Lot d'amorçage (§14, PC-10)
// ---------------------------------------------------------------------------

/**
 * Traite un lot de 50 tickets d'initialisation et avance `bootstrap_progress`.
 *
 * Budget : la fonction de consommateur dispose de 900 s (`manifest.yml`) et le
 * débit du modèle est borné à 90 requêtes/min par `platform/llm.ts` (§14, §16) :
 * un lot de 50 tickets traité séquentiellement tient dans les deux limites.
 */
export async function bootstrapBatch(payload: unknown): Promise<void> {
  const batch = parseBootstrapPayload(payload);
  if (!batch) {
    logShort('bootstrapBatch : lot invalide, rien à faire');
    return;
  }
  const progress = await getBootstrapProgress(batch.projectId);
  if (!progress) return;
  const outcome = await runBatch(batch.issueIds);
  const done = progress.done + outcome.done;
  const failed = progress.failed + outcome.failed;
  const updated: BootstrapProgress = {
    ...progress,
    done,
    failed,
    updatedAt: new Date().toISOString(),
    finished: done + failed >= progress.total,
  };
  await upsertBootstrapProgress(updated);
  if (!updated.finished) await nextBootstrapBatch(batch.projectId, batch.projectKey);
}

/** Traite les tickets d'un lot ; un ticket en échec ne bloque pas les suivants. */
async function runBatch(issueIds: readonly string[]): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const issueId of issueIds) {
    try {
      await processTicket(issueId);
      done += 1;
    } catch (error) {
      logShort(`bootstrapBatch : ticket en échec (${shortError(error)})`);
      failed += 1;
    }
  }
  return { done, failed };
}

/** Lit un lot d'amorçage reçu par la file (`body` Forge ou corps nu) ; `null` si invalide. */
export function parseBootstrapPayload(payload: unknown): BootstrapPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const body = (record['body'] ?? record) as Record<string, unknown>;
  const projectId = typeof body['projectId'] === 'string' ? body['projectId'] : '';
  const projectKey = typeof body['projectKey'] === 'string' ? body['projectKey'] : '';
  const raw = body['issueIds'];
  const issueIds = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  if (!projectId || !projectKey || issueIds.length === 0) return null;
  return { projectId, projectKey, issueIds };
}

/** Résultat vide quand le ticket est illisible : jamais rattaché d'office (§18). */
export function emptyFallbackMatch(): MatchResult {
  return {
    step: 'none',
    problem: null,
    cluster: null,
    confidence: 'low',
    basis: 'rule',
    rationale: 'Ticket illisible : aucun rattachement possible.',
    auto: false,
    undetermined: true,
    proposedAnswer: null,
  };
}
