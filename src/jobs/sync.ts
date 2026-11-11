/**
 * Synchronisation et conversions partagées des faits de tickets (`sync.ts`).
 *
 * Deux rôles, une seule implémentation de chacun (règle « zéro duplication ») :
 * - `syncTicketFacts` rafraîchit les faits des tickets listés depuis Jira et JSM
 *   (§14, PC-01) ;
 * - `readTicketFact` / `buildTicketFact` construisent le fait normalisé, et sont
 *   réutilisés par le consommateur à l'arrivée d'un ticket (§14) ;
 * - les conversions `fait → ticket de fenêtre / ticket d'addition` servent au
 *   consommateur et à la nuit (§8.5, §9).
 *
 * Les heures d'un ticket ne sont **jamais** recalculées ici : elles viennent de
 * `hoursOf` (`core/bill.ts`) — temps saisi prioritaire, sinon interventions ×
 * durée moyenne réglable (§9).
 */

import { hoursOf } from '../core/bill.ts';
import type { BillTicket } from '../core/bill.ts';
import type { TicketInWindow } from '../core/cluster.ts';
import { signatureKey } from '../core/types.ts';
import type { Settings, TicketFact } from '../core/types.ts';
import {
  listFactsByIds,
  listSignatures,
  upsertTicketFacts,
} from '../platform/db/repos.ts';
import {
  adfToText,
  mapWithLimit,
  organizationOf,
  requestTypeOf,
  serviceOf,
  worklogSeconds,
} from '../platform/field.ts';
import {
  fetchIssue,
  readLoggedSeconds,
  readRequestDetails,
  readSlaBreaches,
} from '../platform/jira.ts';
import type { JiraIssue } from '../platform/jira-types.ts';

/** Limite d'appels simultanés lors de la synchronisation (débit borné, §16). */
const SYNC_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Registre des projets suivis (§14)
// ---------------------------------------------------------------------------

/**
 * Projets suivis connus de l'instance.
 *
 * Contrat manquant côté WP-H : `repos/settings.ts` n'expose pas de
 * `listSettings()` et `nightlyRecalc()` n'a pas d'argument. Les projets sont
 * donc mémorisés ici — à chaque ticket traité, lot amorcé ou réglage enregistré
 * — et la nuit les reprend ; elle accepte aussi une liste explicite.
 */
const followedProjects = new Set<string>();

/** Mémorise un projet suivi, pour le recalcul nocturne (§14). */
export function registerFollowedProject(projectId: string): void {
  const trimmed = (projectId ?? '').trim();
  if (trimmed) followedProjects.add(trimmed);
}

/** Projets suivis mémorisés, triés (nuit et tests). */
export function followedProjectIds(): string[] {
  return [...followedProjects].sort();
}

// ---------------------------------------------------------------------------
// Conversions partagées (§8.2, §8.5, §8.6, §9)
// ---------------------------------------------------------------------------

/** Texte d'un ticket : résumé puis description, l'empreinte porte dessus (§8.2). */
export function extractTicketText(issue: JiraIssue): string {
  const summary = (issue.fields.summary ?? '').trim();
  const description = adfToText(issue.fields.description);
  return [summary, description].filter((part) => part.length > 0).join('\n');
}

/** Ticket réduit à ce que l'addition consomme (§9). */
export function billTicketOf(fact: TicketFact): BillTicket {
  return {
    issueId: fact.issueId,
    reporter: fact.reporter,
    organization: fact.organization,
    loggedSeconds: fact.loggedSeconds,
    touches: fact.touches,
    reopened: fact.reopened,
    escalated: fact.escalated,
    slaBreached: fact.slaBreached,
    visible: fact.visible,
  };
}

/** Heures d'un ticket : temps saisi s'il existe, sinon interventions (§9). */
export function ticketHours(fact: TicketFact, minutesPerTouch: number): number {
  return hoursOf([billTicketOf(fact)], minutesPerTouch).hours;
}

/** Tickets d'une fenêtre glissante, heures déjà calculées (§8.5). */
export function windowTicketsOf(
  facts: readonly TicketFact[],
  settings: Settings,
): TicketInWindow[] {
  return facts.map((fact) => ({
    issueId: fact.issueId,
    reporter: fact.reporter,
    hours: ticketHours(fact, settings.minutesPerTouch),
    createdAt: fact.createdAt,
  }));
}

/** Faits des tickets d'une seule signature : c'est la grappe, rien d'autre (§8.5). */
export async function ticketsForSignature(
  projectId: string,
  key: string,
): Promise<TicketFact[]> {
  const signatures = await listSignatures(projectId);
  const issueIds = signatures
    .filter((sig) => signatureKey(sig.systemId, sig.symptomId, sig.triggerText) === key)
    .map((sig) => sig.issueId);
  return issueIds.length > 0 ? listFactsByIds(issueIds) : [];
}

/**
 * Sépare les dates d'une grappe en fenêtre courante et historique (§8.6) :
 * `recent` porte les tickets de la fenêtre de flambée, `history` les précédents.
 */
export function splitSurgeDates(
  facts: readonly TicketFact[],
  windowMinutes: number,
  now: string,
): { recent: { at: string }[]; history: { at: string }[] } {
  const windowMs = Math.max(1, windowMinutes) * 60_000;
  const nowMs = new Date(now).getTime();
  const recent: { at: string }[] = [];
  const history: { at: string }[] = [];
  if (Number.isNaN(nowMs)) return { recent, history };
  for (const fact of facts) {
    const at = new Date(fact.createdAt).getTime();
    if (Number.isNaN(at) || at > nowMs) continue;
    if (at >= nowMs - windowMs) recent.push({ at: fact.createdAt });
    else history.push({ at: fact.createdAt });
  }
  return { recent, history };
}

// ---------------------------------------------------------------------------
// Lecture des faits (§14, §15, PC-01)
// ---------------------------------------------------------------------------

/**
 * Fait normalisé d'un ticket (§15).
 * `existing` préserve ce que l'app sait déjà : interventions, réouvertures et
 * escalades viennent des événements, pas d'une relecture du ticket (§9).
 */
export function buildTicketFact(
  issue: JiraIssue,
  projectId: string,
  input: {
    requestType: string | null;
    organization: string | null;
    loggedSeconds: number | null;
    slaBreached: boolean;
    existing?: TicketFact | null;
  },
): TicketFact {
  const fields = issue.fields;
  const previous = input.existing ?? null;
  return {
    issueId: issue.id,
    issueKey: issue.key,
    projectId: fields.project?.id ?? projectId,
    projectKey: fields.project?.key ?? '',
    requestType: input.requestType,
    service: serviceOf(issue),
    component: fields.components?.[0]?.name ?? null,
    reporter: fields.reporter?.accountId ?? fields.reporter?.displayName ?? null,
    organization: input.organization,
    createdAt: fields.created ?? new Date().toISOString(),
    resolvedAt: fields.resolutiondate ?? null,
    touches: previous ? previous.touches : 1,
    loggedSeconds: input.loggedSeconds,
    reopened: previous ? previous.reopened : false,
    escalated: previous ? previous.escalated : false,
    slaBreached: input.slaBreached,
    visible: previous ? previous.visible : true,
    summary: fields.summary ?? '',
  };
}

/** Lit Jira et JSM puis construit le fait du ticket (§14, PC-01). */
export async function readTicketFact(
  issue: JiraIssue,
  projectId: string,
  existing?: TicketFact | null,
): Promise<TicketFact> {
  const details = await readRequestDetails(issue.id);
  const logged = (await readLoggedSeconds(issue.id)) ?? worklogSeconds(issue);
  return buildTicketFact(issue, projectId, {
    requestType: requestTypeOf(issue, details),
    organization: organizationOf(issue, details),
    loggedSeconds: logged,
    slaBreached: await readSlaBreaches(issue.id),
    existing,
  });
}

/** Rafraîchit les faits des tickets listés ; rend le nombre de tickets traités. */
export async function syncTicketFacts(
  projectId: string,
  issueIds: readonly string[],
): Promise<number> {
  if (issueIds.length === 0) return 0;
  const known = new Map((await listFactsByIds(issueIds)).map((fact) => [fact.issueId, fact]));
  const tasks = issueIds.map((issueId) => async () => syncSingleTicket(projectId, issueId, known.get(issueId) ?? null));
  const results = await mapWithLimit(tasks, SYNC_CONCURRENCY, (run) => run());
  const facts = results.filter((fact): fact is TicketFact => fact !== null);
  if (facts.length > 0) await upsertTicketFacts(facts);
  return facts.length;
}

/** Synchronise un ticket : lecture Jira, puis fait normalisé (§14). */
async function syncSingleTicket(
  projectId: string,
  issueId: string,
  existing: TicketFact | null,
): Promise<TicketFact | null> {
  const issue = await fetchIssue(issueId);
  return issue ? readTicketFact(issue, projectId, existing) : null;
}
