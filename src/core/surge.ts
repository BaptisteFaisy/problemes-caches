/**
 * Flambées (§8.6) — module **pur**.
 *
 * Une signature dont le nombre de tickets sur la fenêtre dépasse trois fois sa
 * moyenne habituelle déclenche une alerte : c'est probablement un incident
 * majeur en train de naître (§8.6). L'heure arrive en paramètre `now` ; aucune
 * horloge implicite, aucune I/O.
 *
 * Unité : le **taux** et la **base** sont exprimés en tickets par fenêtre de
 * `windowMinutes`, donc directement comparables ; le facteur est leur rapport
 * arrondi à deux décimales (`round2` de `src/core/time.ts`).
 */

import { shortHash } from './cluster';
import { SURGE_FACTOR, SURGE_WINDOW_MINUTES } from './constants';
import { parseIso, round2 } from './time';
import type { Surge } from './types';

/** Entrée du calcul d'une flambée (§8.6). */
export interface SurgeInput {
  clusterId: string;
  projectId: string;
  /** Tickets des `windowMinutes` dernières minutes (§8.6). */
  recent: readonly { at: string }[];
  /** Historique des fenêtres précédentes, en excluant la fenêtre courante. */
  history: readonly { at: string }[];
  windowMinutes: number;
  /** Facteur de déclenchement : trois fois la moyenne habituelle par défaut (§8.6). */
  factor: number;
  now: string;
  /** Flambée déjà ouverte pour cette grappe : on ne redéclenche pas. */
  existing?: Surge | null;
}

/**
 * Détecte une flambée (§8.6).
 * Rend `null` quand le taux n'atteint pas `baseline × factor`, quand aucune
 * fenêtre n'est observée, ou quand une flambée est déjà ouverte pour la grappe.
 */
export function detectSurge(input: SurgeInput): Surge | null {
  // §8.6 : une flambée ouverte n'est pas redéclenchée (une « attendue » non plus).
  if (input.existing) return null;
  const windowMs = windowMsOf(input.windowMinutes);
  const rate = countInWindow(input.recent, input.now, windowMs);
  const baseline = baselineFor(input.history, input.windowMinutes, input.now);
  const factor = input.factor > 0 ? input.factor : SURGE_FACTOR;
  if (rate < baseline * factor) return null;
  return {
    id: shortHash(`${input.clusterId}|${input.now}`),
    clusterId: input.clusterId,
    projectId: input.projectId,
    startedAt: input.now,
    rate,
    baseline,
    factor: surgeFactor(rate, baseline),
    incidentKey: null,
    expected: false,
  };
}

/** Facteur observé d'une flambée : taux divisé par la base, arrondi (§8.6). */
export function surgeFactor(rate: number, baseline: number): number {
  if (!Number.isFinite(rate) || !Number.isFinite(baseline) || baseline <= 0) return 0;
  return round2(rate / baseline);
}

/**
 * Base habituelle : nombre moyen de tickets par fenêtre sur la période couverte
 * par l'historique (§8.6). Plancher à 1 — jamais de division par zéro, et une
 * grappe au repos ne déclenche jamais seule une flambée.
 */
export function baselineFor(
  history: readonly { at: string }[],
  windowMinutes: number,
  now: string,
): number {
  const nowMs = timeOf(now);
  if (nowMs === null) return 1;
  const windowMs = windowMsOf(windowMinutes);
  const times: number[] = [];
  for (const entry of history) {
    const time = timeOf(entry.at);
    if (time !== null && time <= nowMs) times.push(time);
  }
  if (times.length === 0) return 1;
  let oldest = Number.POSITIVE_INFINITY;
  for (const time of times) if (time < oldest) oldest = time;
  const windows = Math.max(1, Math.ceil((nowMs - oldest) / windowMs));
  return Math.max(1, round2(times.length / windows));
}

// ---------------------------------------------------------------------------
// Helpers internes (§8.6)
// ---------------------------------------------------------------------------

/** Durée d'une fenêtre en millisecondes ; valeur par défaut si absente (§8.6). */
function windowMsOf(windowMinutes: number): number {
  const minutes = Number.isFinite(windowMinutes) && windowMinutes > 0 ? windowMinutes : SURGE_WINDOW_MINUTES;
  return Math.max(1, Math.round(minutes)) * 60_000;
}

/** Nombre d'événements tombés dans la fenêtre `[now - windowMs, now]`. */
function countInWindow(entries: readonly { at: string }[], now: string, windowMs: number): number {
  const nowMs = timeOf(now);
  if (nowMs === null) return 0;
  let count = 0;
  for (const entry of entries) {
    const time = timeOf(entry.at);
    if (time !== null && time <= nowMs && time >= nowMs - windowMs) count += 1;
  }
  return count;
}

/** Instant lisible, ou `null` si la date est illisible. */
function timeOf(value: string): number | null {
  const date = parseIso(value);
  return date ? date.getTime() : null;
}
