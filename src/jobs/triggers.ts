/**
 * Déclencheurs Jira (`triggers.ts`, §14, PC-07).
 *
 * Trois événements, trois gestes :
 * - `issueCreated` (`avi:jira:created:issue`) : extrait issueId / issueKey /
 *   projectKey et confie le ticket au consommateur, pour une reconnaissance
 *   en moins de 30 s (PC-07) ;
 * - `issueUpdated` (`avi:jira:updated:issue`) : ne resoumet le ticket au modèle
 *   que si `summary` ou `description` ont changé, décision prise sur
 *   `sourceHash` (§8.2 étape 3) ;
 * - `issueCommented` (`avi:jira:commented:issue`) : met à jour le compteur
 *   d'interventions `touches` et le temps saisi s'il existe (§9).
 *
 * Aucun de ces déclencheurs ne jette : un événement illisible est journalisé
 * court et la fonction rend la main (§14, budget de 30 s).
 */

import { sourceHash } from '../core/signature';
import type { TicketFact } from '../core/types';
import { getSignature, getTicketFact, upsertTicketFact } from '../platform/db/repos';
import { fetchIssue, readLoggedSeconds } from '../platform/jira';
import { logShort, shortError } from '../platform/log';
import { processTicket } from './consumer';
import { extractTicketText } from './sync';

/** Événement Jira reçu par un déclencheur Forge (§14). */
export interface JiraEventPayload {
  issue?: { id?: string; key?: string; fields?: Record<string, unknown> };
  comment?: { id?: string; body?: unknown };
  changelog?: { items?: { field?: string; fromString?: string; toString?: string }[] };
  [key: string]: unknown;
}

/** Identifiant du ticket porté par un événement ; `null` si absent. */
export function issueIdOf(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const payload = event as JiraEventPayload;
  const fromIssue = payload.issue?.id;
  if (typeof fromIssue === 'string' && fromIssue.length > 0) return fromIssue;
  const direct = payload['issueId'];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  return null;
}

/** Clé du ticket portée par un événement ; `null` si absente. */
export function issueKeyOf(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const key = (event as JiraEventPayload).issue?.key;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/** Clé du projet portée par un événement ; `null` si absente (§14). */
export function projectKeyOf(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const fields = (event as JiraEventPayload).issue?.fields;
  const project = fields?.['project'];
  if (project && typeof project === 'object') {
    const key = (project as Record<string, unknown>)['key'];
    if (typeof key === 'string' && key.length > 0) return key;
  }
  const direct = (event as JiraEventPayload)['projectKey'];
  return typeof direct === 'string' && direct.length > 0 ? direct : null;
}

/**
 * Faut-il resoumettre le ticket au modèle (§8.2 étape 3) ?
 * Seule une empreinte différente de celle déjà en cache le justifie.
 */
export function shouldResubmit(cachedHash: string | null, nextHash: string): boolean {
  if (!cachedHash) return true;
  return cachedHash !== nextHash;
}

/** Déclencheur création de ticket : reconnaissance immédiate (PC-07, §14). */
export async function issueCreated(event: unknown): Promise<void> {
  const issueId = issueIdOf(event);
  if (!issueId) {
    logShort('issueCreated : événement sans identifiant de ticket');
    return;
  }
  try {
    // Le déclencheur est une fonction asynchrone : son budget de 900 s (§16)
    // laisse toute la place au parcours du §14, bien en deçà des 30 s (PC-07).
    // Le `manifest.yml` (gelé) ne déclare qu'une file, réservée aux lots
    // d'amorçage : le ticket est donc traité ici, en une seule tâche.
    const match = await processTicket(issueId);
    logShort(`issueCreated ${issueKeyOf(event) ?? issueId} (${projectKeyOf(event) ?? '?'}) : ${match.step}`);
  } catch (error) {
    logShort(`issueCreated : ${shortError(error)}`);
  }
}

/** Déclencheur modification : resoumission seulement si le texte a changé (§8.2). */
export async function issueUpdated(event: unknown): Promise<void> {
  const issueId = issueIdOf(event);
  if (!issueId) return;
  try {
    const issue = await fetchIssue(issueId);
    if (!issue) return;
    const hash = sourceHash(extractTicketText(issue));
    const cached = await getSignature(issueId);
    if (!shouldResubmit(cached?.sourceHash ?? null, hash)) {
      logShort('issueUpdated : texte inchangé, pas de resoumission');
      return;
    }
    await processTicket(issueId);
  } catch (error) {
    logShort(`issueUpdated : ${shortError(error)}`);
  }
}

/**
 * Déclencheur commentaire : une intervention de plus, et le temps saisi
 * éventuellement rattaché au ticket (§9).
 */
export async function issueCommented(event: unknown): Promise<void> {
  const issueId = issueIdOf(event);
  if (!issueId) return;
  try {
    const fact = await getTicketFact(issueId);
    if (!fact) return;
    const logged = (await readLoggedSeconds(issueId)) ?? fact.loggedSeconds;
    const updated: TicketFact = { ...fact, touches: fact.touches + 1, loggedSeconds: logged };
    await upsertTicketFact(updated);
  } catch (error) {
    logShort(`issueCommented : ${shortError(error)}`);
  }
}
