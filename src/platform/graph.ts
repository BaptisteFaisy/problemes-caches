/**
 * Teamwork Graph (§14) : l'app **consomme** le graphe pour enrichir les indices
 * certains (service lié à un incident, ticket lié à un incident, objet
 * d'inventaire lié à un ticket, organisation cliente).
 *
 * Deux règles du cahier :
 * - l'API ne s'appelle qu'**au nom d'un utilisateur** (`asUser()`) ;
 * - ces lectures se font à l'ouverture des écrans et sont **mises en cache**.
 *
 * Le cache est une `Map` en mémoire, son durée de vie est courte et elle est
 * **injectée** : l'orchestration (lot WP-K) choisit la durée, les tests
 * n'utilisent pas de cache du tout.
 */

import { asUser } from '@forge/api';

import type { HardClues } from '../core/types';
import { logShort, shortError } from './log';

/** Durée de vie du cache par défaut (courte : §14). */
export const DEFAULT_GRAPH_TTL_MS = 5 * 60_000;

/** Entrée de cache : les indices enrichis et l'instant de leur lecture. */
export interface GraphCacheEntry {
  at: number;
  clues: HardClues;
}

/** Options d'enrichissement : cache injecté, durée de vie, instant de référence. */
export interface GraphOptions {
  /** Cache injecté ; sans cache, chaque lecture part sur le graphe. */
  cache?: Map<string, GraphCacheEntry>;
  /** Durée de vie d'une entrée, en millisecondes. */
  ttlMs?: number;
  /** Instant de référence (ms) ; par défaut l'horloge du runtime. */
  now?: number;
}

/** Ce que le graphe sait d'un ticket (relations de §14). */
export interface GraphIssue {
  id?: string;
  key?: string;
  incident?: { id?: string; key?: string; name?: string } | null;
  service?: { id?: string; name?: string } | null;
  organization?: { id?: string; name?: string } | null;
  inventory?: { id?: string; name?: string }[] | null;
}

/**
 * Requête du graphe : ce qu'on demande pour enrichir un ticket. L'API est en
 * Preview (§16) : si le schéma diffère, elle rend des erreurs et les indices
 * sont alors rendus tels quels, sans casser l'écran (§14).
 */
const ISSUE_CONTEXT_QUERY = `query HiddenProblemsIssueContext($id: ID!) {
  issue(id: $id) {
    id
    key
    incident { id key name }
    service { id name }
    organization { id name }
    inventory { id name }
  }
}`;

/**
 * Enrichit les indices certains d'un ticket avec ce que le graphe sait de lui.
 *
 * Jamais d'échec : si le graphe ne répond pas, les indices sont rendus tels
 * qu'ils étaient (§14 : un écran ne casse pas pour une lecture manquante).
 */
export async function enrichClues(
  issueId: string,
  clues: HardClues,
  options: GraphOptions = {},
): Promise<HardClues> {
  const cache = options.cache;
  const ttl = options.ttlMs ?? DEFAULT_GRAPH_TTL_MS;
  const now = options.now ?? Date.now();
  const cached = cache?.get(issueId);
  if (cached && now - cached.at < ttl) return cached.clues;
  const enriched = await readGraphClues(issueId, clues);
  if (cache) cache.set(issueId, { at: now, clues: enriched });
  return enriched;
}

/** Lecture du graphe au nom de l'utilisateur, sans cache. */
async function readGraphClues(issueId: string, clues: HardClues): Promise<HardClues> {
  try {
    const response = await asUser().requestTeamworkGraph(ISSUE_CONTEXT_QUERY, { id: issueId });
    if (!response.ok) {
      logShort(`graph : HTTP ${response.status}`);
      return clues;
    }
    const payload = (await response.json().catch(() => null)) as GraphPayload | null;
    if (!payload) return clues;
    if (payload.errors?.length) {
      logShort(`graph : ${payload.errors.length} erreur(s)`);
      return clues;
    }
    return applyGraphIssue(clues, payload.data?.issue ?? null);
  } catch (error) {
    logShort(`graph : ${shortError(error)}`);
    return clues;
  }
}

/** Réponse du graphe (GraphQL). */
interface GraphPayload {
  data?: { issue?: GraphIssue | null };
  errors?: { message?: string }[];
}

/** Applique ce que le graphe sait : service, organisation, objets d'inventaire. */
export function applyGraphIssue(clues: HardClues, issue: GraphIssue | null): HardClues {
  if (!issue) return clues;
  const enriched: HardClues = {
    ...clues,
    service: issue.service?.name ?? clues.service,
    organization: issue.organization?.name ?? clues.organization,
    assetIds: mergeAssets(clues.assetIds, issue.inventory),
  };
  return enriched;
}

/** Fusionne les objets d'inventaire connus avec ceux du graphe, sans doublon. */
function mergeAssets(known: readonly string[], inventory: GraphIssue['inventory']): string[] {
  const merged = [...known];
  for (const item of inventory ?? []) {
    const label = item?.name ?? item?.id;
    if (label && !merged.includes(label)) merged.push(label);
  }
  return merged;
}
