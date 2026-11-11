/**
 * Appels réseau Atlassian — Jira et Jira Service Management (§14).
 *
 * **Tout** appel réseau de l'app passe par ce fichier : rien n'est appelé
 * ailleurs, et rien ne sort d'Atlassian (§17).
 *
 * Règles tenues ici :
 * - les écritures passent au nom de l'app (`asApp()`), les lectures qui doivent
 *   refléter les droits d'une personne passent au nom de l'utilisateur
 *   (`asUser()`, §14 et PC-13) ;
 * - un scope manquant ou un 403 ne fait jamais échouer un écran : on rend
 *   `null`, `false` ou `[]`, et on journalise court (`logShort`) ;
 * - la synthèse quotidienne n'est publiée qu'**une fois par jour** sur le
 *   ticket de problème : propriété d'app d'abord (garde), commentaire ensuite (§10).
 */

import { asApp, asUser, route } from '@forge/api';
import type { RequestInit, Route } from '@forge/api';

import type { Problem, ProblemBill } from '../core/types';
import { parseIso } from '../core/time';
import { logShort, shortError } from './log';
import { chunkArray, slaBreached, toAdf, worklogSecondsOf } from './field';
import type {
  DailySummaryProperty,
  JiraCreatedIssue,
  JiraIssue,
  JiraIssueTypeMeta,
  JiraSearchResponse,
  JiraWorklog,
  JsmOrganization,
  JsmRequestDetails,
  JsmRequestType,
  JsmValues,
  ProblemBillProperty,
  ProblemIssueInput,
  ProblemSignatureProperty,
} from './jira-types';

/** Propriété d'app tenant l'addition du problème (§10). */
export const BILL_PROPERTY = 'problemes-caches.problem-bill';

/** Propriété d'app marquant la synthèse quotidienne déjà publiée (§10). */
export const SUMMARY_PROPERTY = 'problemes-caches.daily-summary';

/** Propriété d'app tenant la signature du problème (unicité, §10). */
export const SIGNATURE_PROPERTY = 'problemes-caches.problem-signature';

/** Étiquette posée sur les tickets de problème : ils sont ainsi reconnaissables. */
export const PROBLEM_LABEL = 'problemes-caches';

/** Nombre maximal de tickets renvoyés par une recherche. */
const MAX_SEARCH_RESULTS = 100;

/** Nombre maximal de tickets dont on teste la visibilité d'un coup (PC-13). */
const VISIBILITY_CHUNK = 50;

/** Nombre maximal de tickets dont on teste la visibilité au total. */
const MAX_VISIBILITY_IDS = 500;

/** Nombre maximal de problèmes ouverts examinés pour l'unicité (§10). */
const MAX_PROBLEM_CANDIDATES = 20;

/** Durée de vie du cache mémoire des métadonnées de projet. */
const META_TTL_MS = 300_000;

/** Champs demandés lors d'une recherche : le strict nécessaire au domaine. */
const SEARCH_FIELDS =
  'summary,description,status,issuetype,project,reporter,created,updated,resolutiondate,labels,components,worklog,timespent,issuelinks';

/** Chemins fixes de l'API Jira (§14). */
const SEARCH_JQL_ROUTE = route`/rest/api/3/search/jql`;
const CREATE_ISSUE_ROUTE = route`/rest/api/3/issue`;
const ISSUE_LINK_ROUTE = route`/rest/api/3/issueLink`;
const MYSELF_ROUTE = route`/rest/api/3/myself`;

/** Ce que l'on demande à l'API, et dans quel nom. */
type JiraScope = 'app' | 'user';

/** Réponse brute d'un appel Jira, normalisée. */
interface JiraCall {
  ok: boolean;
  status: number;
  data: unknown;
}

/** Cache mémoire court (métadonnées de projet, compte courant). */
const metaCache = new Map<string, { at: number; value: unknown }>();

// ---------------------------------------------------------------------------
// Bas niveau
// ---------------------------------------------------------------------------

/** Appel Jira qui n'échoue jamais : il rend l'état et la donnée, ou rien. */
async function call(path: Route, init: RequestInit | undefined, scope: JiraScope, label: string): Promise<JiraCall> {
  try {
    const response =
      scope === 'user' ? await asUser().requestJira(path, init) : await asApp().requestJira(path, init);
    if (!response.ok) return { ok: false, status: response.status, data: null };
    const data = await response.json().catch(() => null);
    return { ok: true, status: response.status, data };
  } catch (error) {
    logShort(`jira ${label} : ${shortError(error)}`);
    return { ok: false, status: 0, data: null };
  }
}

/** Appel Jira rendu en JSON ; `null` quand l'appel échoue. */
async function requestJson<T>(
  path: Route,
  init: RequestInit | undefined,
  scope: JiraScope,
  label: string,
): Promise<T | null> {
  const result = await call(path, init, scope, label);
  if (!result.ok) {
    logShort(`jira ${label} : HTTP ${result.status}`);
    return null;
  }
  return (result.data ?? null) as T | null;
}

/** Appel Jira dont on ne garde que la réussite (écritures). */
async function requestOk(
  path: Route,
  init: RequestInit | undefined,
  scope: JiraScope,
  label: string,
): Promise<boolean> {
  const result = await call(path, init, scope, label);
  if (!result.ok) {
    logShort(`jira ${label} : HTTP ${result.status}`);
    return false;
  }
  return true;
}

/** Corps JSON pour une écriture. */
function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** Texte simple en document ADF (commentaires, descriptions) : voir `field.ts`. */
export { toAdf } from './field';

/** Découpe et parallélisme borné (débit, §16) : voir `field.ts`. */
export { chunkArray, mapWithLimit } from './field';

/** Échappe une valeur destinée à une chaîne JQL. */
function escapeJql(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Lectures Jira
// ---------------------------------------------------------------------------

/** Ticket Jira complet ; `null` s'il est introuvable ou interdit. */
export async function fetchIssue(issueIdOrKey: string): Promise<JiraIssue | null> {
  const path = route`/rest/api/3/issue/${issueIdOrKey}?fields=*all`;
  return requestJson<JiraIssue>(path, undefined, 'app', 'lecture ticket');
}

/** Recherche de tickets dans un projet (JQL libre, filtré par projet). */
export async function searchTickets(projectKey: string, jql: string, limit = 50): Promise<JiraIssue[]> {
  const filter = jql.trim();
  const projectFilter = `project = "${escapeJql(projectKey)}"`;
  const query = filter.length > 0 ? `${projectFilter} AND (${filter})` : projectFilter;
  const maxResults = Math.min(Math.max(1, limit), MAX_SEARCH_RESULTS);
  const body = { jql: query, maxResults, fields: SEARCH_FIELDS };
  let result = await requestJson<JiraSearchResponse>(SEARCH_JQL_ROUTE, jsonInit('POST', body), 'app', 'recherche');
  if (!result) {
    const fallback = route`/rest/api/3/search?jql=${query}&maxResults=${maxResults}&fields=${SEARCH_FIELDS}`;
    result = await requestJson<JiraSearchResponse>(fallback, undefined, 'app', 'recherche');
  }
  return result?.issues ?? [];
}

/** Temps saisi sur un ticket (§9) ; `null` quand rien n'est saisi ou inaccessible. */
export async function readLoggedSeconds(issueId: string): Promise<number | null> {
  const path = route`/rest/api/3/issue/${issueId}/worklog`;
  const worklog = await requestJson<JiraWorklog>(path, undefined, 'app', 'temps saisi');
  return worklogSecondsOf(worklog);
}

// ---------------------------------------------------------------------------
// Lectures JSM
// ---------------------------------------------------------------------------

/** Détail d'une demande JSM ; `null` si le scope manque ou si le 403 tombe. */
export async function readRequestDetails(issueId: string): Promise<JsmRequestDetails | null> {
  const path = route`/rest/servicedeskapi/request/${issueId}`;
  return requestJson<JsmRequestDetails>(path, undefined, 'app', 'détail de demande');
}

/** Délai de service rompu sur un ticket (§9) ; `false` si l'information manque. */
export async function readSlaBreaches(issueId: string): Promise<boolean> {
  return slaBreached(await readRequestDetails(issueId));
}

/** Types de demande du centre de service ; `[]` si le scope manque. */
export async function listRequestTypes(projectKey: string): Promise<{ id: string; name: string }[]> {
  const path = route`/rest/servicedeskapi/servicedesk/${projectKey}/requesttype`;
  const data = await requestJson<JsmValues<JsmRequestType>>(path, undefined, 'app', 'types de demande');
  return (data?.values ?? [])
    .filter((value) => Boolean(value?.id) && Boolean(value?.name))
    .map((value) => ({ id: value.id, name: value.name }));
}

/** Organisations clientes du centre de service ; `[]` si le scope manque. */
export async function listOrganizations(serviceDeskId: string): Promise<{ id: string; name: string }[]> {
  const path = route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/organization`;
  const data = await requestJson<JsmValues<JsmOrganization>>(path, undefined, 'app', 'organisations');
  return (data?.values ?? [])
    .filter((value) => Boolean(value?.id) && Boolean(value?.name))
    .map((value) => ({ id: value.id, name: value.name }));
}

// ---------------------------------------------------------------------------
// Propriétés d'application (§10)
// ---------------------------------------------------------------------------

/** Valeur d'une propriété d'application ; `null` si elle n'existe pas. */
export async function readIssueProperty(issueKey: string, propertyKey: string): Promise<unknown | null> {
  const path = route`/rest/api/3/issue/${issueKey}/properties/${propertyKey}`;
  return requestJson<unknown>(path, undefined, 'app', 'propriété');
}

/** Écrit une propriété d'application (remplace l'ancienne valeur). */
export async function writeIssueProperty(issueKey: string, propertyKey: string, value: unknown): Promise<boolean> {
  const path = route`/rest/api/3/issue/${issueKey}/properties/${propertyKey}`;
  return requestOk(path, jsonInit('PUT', value), 'app', 'propriété');
}

/** Pose l'addition du problème sur son ticket (§10). */
export async function setProblemProperty(issueKey: string, bill: ProblemBill): Promise<void> {
  const value: ProblemBillProperty = {
    problemId: bill.problemId,
    period: bill.period,
    computedAt: bill.computedAt,
    bill,
  };
  await writeIssueProperty(issueKey, BILL_PROPERTY, value);
}

// ---------------------------------------------------------------------------
// Écritures Jira
// ---------------------------------------------------------------------------

/** Lien entre deux tickets (§10) : chaque ticket rattaché est lié au problème. */
export async function linkIssues(inward: string, outward: string, type = 'Relates'): Promise<void> {
  const body = { type: { name: type }, inwardIssue: { key: inward }, outwardIssue: { key: outward } };
  await requestOk(ISSUE_LINK_ROUTE, jsonInit('POST', body), 'app', 'lien de tickets');
}

/**
 * Commentaire interne : il ne part **que** sur le ticket de problème, jamais
 * sur une demande client (§7.4 : un humain envoie les messages au client).
 */
export async function addInternalComment(issueKey: string, body: string): Promise<void> {
  const path = route`/rest/api/3/issue/${issueKey}/comment`;
  await requestOk(path, jsonInit('POST', { body: toAdf(body) }), 'app', 'commentaire interne');
}

// ---------------------------------------------------------------------------
// Unicité et création du ticket de problème (§10)
// ---------------------------------------------------------------------------

/** Type de ticket du projet : celui « Problème » s'il existe, sinon les réglages. */
async function resolveIssueTypeId(projectKey: string, settingsType: string | null): Promise<string | null> {
  const meta = await readIssueTypes(projectKey);
  const types = meta.issueTypes ?? [];
  const project = types.find((type) => {
    const name = normalizeLabel(type.name);
    return name === 'problem' || name === 'probleme';
  });
  if (project) return project.id;
  if (settingsType) {
    const wanted = normalizeLabel(settingsType);
    const match = types.find((type) => normalizeLabel(type.name) === wanted);
    if (match) return match.id;
  }
  return null;
}

/** Types de ticket utilisables dans le projet (mis en cache, TTL court). */
async function readIssueTypes(projectKey: string): Promise<JiraIssueTypeMeta> {
  const cached = readMeta(`types:${projectKey}`);
  if (cached) return cached as JiraIssueTypeMeta;
  const path = route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`;
  const meta = (await requestJson<JiraIssueTypeMeta>(path, undefined, 'app', 'types de ticket')) ?? {};
  writeMeta(`types:${projectKey}`, meta);
  return meta;
}

/** Normalise un libellé pour comparer deux noms de types. */
function normalizeLabel(value: string): string {
  const stripped = value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  return stripped.trim().toLowerCase();
}

/**
 * Problème ouvert de même signature ou de même système : l'app doit proposer
 * la fusion plutôt que de créer un second ticket (§10, unicité).
 */
export async function findOpenProblemForSignature(
  projectKey: string,
  signatureKey: string | null,
  systemId: string | null,
): Promise<JiraIssue | null> {
  if (!signatureKey && !systemId) return null;
  const jql = `labels = "${PROBLEM_LABEL}" AND statusCategory != Done`;
  const candidates = await searchTickets(projectKey, jql, MAX_PROBLEM_CANDIDATES);
  for (const candidate of candidates) {
    const stored = (await readIssueProperty(candidate.key, SIGNATURE_PROPERTY)) as ProblemSignatureProperty | null;
    if (!stored) continue;
    if (signatureKey && stored.signatureKey === signatureKey) return candidate;
    if (systemId && stored.systemId === systemId) return candidate;
  }
  return null;
}

/**
 * Crée le ticket de problème (§10). Avant toute création, l'app cherche un
 * problème ouvert de même signature ou de même système : s'il en existe un, il
 * ne crée rien et rend la clé de l'existant — l'appelant propose la fusion.
 */
export async function createProblemIssue(
  projectKey: string,
  input: ProblemIssueInput,
): Promise<{ key: string; id: string }> {
  const existing = await findOpenProblemForSignature(projectKey, input.signatureKey ?? null, input.systemId ?? null);
  if (existing) {
    logShort(`problème déjà présent ${existing.key} : pas de second ticket (unicité)`);
    return { key: existing.key, id: existing.id };
  }
  const issueTypeId = await resolveIssueTypeId(projectKey, input.issueTypeName ?? null);
  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    summary: input.summary,
    description: toAdf(input.description),
    labels: [PROBLEM_LABEL, ...(input.labels ?? [])],
  };
  if (issueTypeId) fields['issuetype'] = { id: issueTypeId };
  const signature: ProblemSignatureProperty = {
    signatureKey: input.signatureKey ?? null,
    systemId: input.systemId ?? null,
    symptomId: input.symptomId ?? null,
    triggerText: input.triggerText ?? null,
  };
  const body = { fields, properties: [{ key: SIGNATURE_PROPERTY, value: signature }] };
  const created = await requestJson<JiraCreatedIssue>(CREATE_ISSUE_ROUTE, jsonInit('POST', body), 'app', 'ticket de problème');
  if (!created?.key) throw new Error('createProblemIssue : Jira n’a pas créé le ticket de problème');
  return { key: created.key, id: created.id };
}

// ---------------------------------------------------------------------------
// Synthèse quotidienne (§10)
// ---------------------------------------------------------------------------

/** Jour de publication, déduit de l'heure de calcul (aucune horloge ici). */
function dayKey(iso: string | null | undefined): string | null {
  const parsed = parseIso(iso);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

/**
 * Synthèse quotidienne : **une** par jour sur le ticket de problème, dans une
 * propriété d'app et un commentaire — jamais un commentaire par ticket
 * rattaché (§10).
 */
export async function publishDailySummary(problem: Problem, bill: ProblemBill): Promise<void> {
  const issueKey = problem.issueKey;
  if (!issueKey) {
    logShort('synthèse quotidienne : pas de ticket de problème');
    return;
  }
  const day = dayKey(bill.computedAt) ?? dayKey(problem.updatedAt);
  if (!day) {
    logShort('synthèse quotidienne : date de calcul inconnue');
    return;
  }
  const stored = (await readIssueProperty(issueKey, SUMMARY_PROPERTY)) as DailySummaryProperty | null;
  if (stored?.lastPublishedOn === day) {
    logShort('synthèse quotidienne déjà publiée aujourd’hui');
    return;
  }
  const value: DailySummaryProperty = {
    lastPublishedOn: day,
    computedAt: bill.computedAt,
    problemKey: issueKey,
    bill,
  };
  const written = await writeIssueProperty(issueKey, SUMMARY_PROPERTY, value);
  if (!written) {
    logShort('synthèse quotidienne : garde non écrite, pas de commentaire');
    return;
  }
  await addInternalComment(issueKey, buildDailySummary(problem, bill, day));
}

/** Texte de la synthèse quotidienne (lisibilité : chaque chiffre a sa méthode). */
export function buildDailySummary(problem: Problem, bill: ProblemBill, day: string): string {
  const lines = [
    `Hidden Problems — daily summary (${day})`,
    `Problem: ${problem.issueKey ?? problem.id}`,
  ];
  if (problem.triggerText) lines.push(`Signature trigger: ${problem.triggerText}`);
  lines.push(`State: ${problem.state}`);
  lines.push(
    `Tickets: ${bill.tickets} · People: ${bill.people} · Support: ${bill.hours} h (${methodOf(bill)})`,
  );
  if (problem.cause) lines.push(`Cause: ${problem.cause}`);
  if (problem.workaround) lines.push(`Workaround: ${problem.workaround}`);
  if (problem.fixIssueKey) lines.push(`Fix: ${problem.fixIssueKey}`);
  return lines.join('\n');
}

/** Méthode de calcul des heures, en clair (§9, §17). */
function methodOf(bill: ProblemBill): string {
  if (bill.hoursMethod === 'logged') return 'logged time';
  if (bill.hoursMethod === 'mixed') return 'logged time where available, counted touches otherwise';
  const touches = Math.max(1, Math.round((bill.hours * 60) / Math.max(1, bill.minutesPerTouch)));
  return `${touches} agent touches × ${bill.minutesPerTouch} min`;
}

// ---------------------------------------------------------------------------
// Visibilité et compte courant (PC-13)
// ---------------------------------------------------------------------------

/** JQL listant des tickets par identifiant numérique ou par clé. */
function idsToJql(ids: readonly string[]): string {
  const numeric = ids.every((id) => /^\d+$/.test(id));
  if (numeric) return `id in (${ids.join(', ')})`;
  return `key in (${ids.map((id) => `"${escapeJql(id)}"`).join(', ')})`;
}

/**
 * Tickets que l'utilisateur courant peut ouvrir (PC-13). Les autres restent
 * comptés dans l'addition, mais ne seront jamais affichés.
 */
export async function visibleToCurrentUser(issueIds: readonly string[]): Promise<Set<string>> {
  const visible = new Set<string>();
  const wanted = issueIds.filter((id) => id.trim().length > 0).slice(0, MAX_VISIBILITY_IDS);
  for (const chunk of chunkArray(wanted, VISIBILITY_CHUNK)) {
    const jql = idsToJql(chunk);
    if (!jql) continue;
    const body = { jql, maxResults: chunk.length };
    const result = await requestJson<JiraSearchResponse>(SEARCH_JQL_ROUTE, jsonInit('POST', body), 'user', 'visibilité');
    for (const issue of result?.issues ?? []) {
      visible.add(issue.id);
      visible.add(issue.key);
    }
  }
  return visible;
}

/** Compte Atlassian de l'utilisateur courant ; `null` hors contexte utilisateur. */
export async function currentAccountId(): Promise<string | null> {
  const cached = readMeta('accountId');
  if (typeof cached === 'string') return cached;
  const me = await requestJson<{ accountId?: string }>(MYSELF_ROUTE, undefined, 'user', 'compte courant');
  const accountId = me?.accountId ?? null;
  if (accountId) writeMeta('accountId', accountId);
  return accountId;
}

// ---------------------------------------------------------------------------
// Cache mémoire court
// ---------------------------------------------------------------------------

/** Valeur en cache, si elle n'a pas expiré. */
function readMeta(key: string): unknown {
  const entry = metaCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > META_TTL_MS) {
    metaCache.delete(key);
    return null;
  }
  return entry.value;
}

/** Écrit une valeur en cache. */
function writeMeta(key: string, value: unknown): void {
  metaCache.set(key, { at: Date.now(), value });
}
