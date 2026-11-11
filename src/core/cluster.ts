/**
 * Grappes, seuils de naissance d'un suspect et demandes récurrentes (§8.5, §18).
 *
 * Module **pur** : aucun import `@forge/*`, aucune I/O, aucune horloge implicite
 * (l'heure arrive toujours en paramètre `now`, §8.5).
 *
 * Les heures d'un ticket sont **déjà calculées** en amont : temps saisi s'il
 * existe, sinon `touches × minutesPerTouch / 60` (§9, `hoursOf` du lot WP-F).
 * `TicketInWindow.hours` porte donc ce résultat : ici on l'additionne, on ne le
 * recalcule jamais (règle « zéro duplication »).
 */

import { createHash } from 'node:crypto';

import { SUSPECT_WINDOW_DAYS } from './constants.ts';
import { addDays, parseIso, round2 } from './time.ts';
import type { Cluster, ClusterStatus, Thresholds, ThresholdHit } from './types.ts';
import { signatureKey } from './types.ts';

// ---------------------------------------------------------------------------
// Contrats du lot WP-C (§8.5, §18)
// ---------------------------------------------------------------------------

/** Un ticket retenu dans le calcul d'une grappe. */
export interface TicketInWindow {
  issueId: string;
  reporter: string | null;
  /** Heures déjà calculées en amont (§9) — ni temps saisi, ni estimation retouchée ici. */
  hours: number;
  createdAt: string;
}

/** Entrée du calcul d'une grappe : signature, tickets observés, seuils, heure. */
export interface ClusterInput {
  projectId: string;
  systemId: string;
  symptomId: string;
  triggerText: string;
  tickets: readonly TicketInWindow[];
  thresholds: Thresholds;
  now: string;
  /** Statut déjà porté par la grappe en base (un humain l'a peut-être posé). */
  status?: ClusterStatus;
  /**
   * Nature de la demande, quand elle est connue (§18). Absent du contrat
   * d'origine : sans lui, la détection de récurrence s'appuie sur le texte du
   * déclencheur, qui porte la même information (« réinitialisation de mot de
   * passe »).
   */
  requestType?: string | null;
}

// ---------------------------------------------------------------------------
// Demandes récurrentes (§18)
// ---------------------------------------------------------------------------

/**
 * Nombre de tickets minimal pour qu'une demande répétée soit considérée comme
 * récurrente : une fois n'est pas une récurrence (§18).
 */
export const RECURRING_MIN_TICKETS = 3;

/**
 * Types de demandes de service répétées mais normales : elles forment une
 * grappe coûteuse **sans défaut**, candidate à l'automatisation (§18).
 */
export const RECURRING_REQUEST_TYPES: readonly string[] = [
  'password reset',
  'reset password',
  'mot de passe',
  'réinitialisation de mot de passe',
  'reinitialisation mot de passe',
  'réinitialisation du mot de passe',
  'account unlock',
  'unlock account',
  'déblocage de compte',
  'deblocage de compte',
  'licence',
  'license',
  'licence key',
  'clé de licence',
  'onboarding',
  'offboarding',
  'installation de poste',
  'nouveau poste',
  'changement de poste',
  'demande de matériel',
  'demande de materiel',
  'demande d\'équipement',
  'demande d\'equipement',
  'equipment request',
  'formation',
  'training',
  'demande de formation',
  'création de compte',
  'creation de compte',
];

/**
 * Mots-clés qui signalent une demande de service répétée mais normale (§18).
 * Volontairement étroits : un défaut réel (accès coupé, licence en erreur)
 * ne doit jamais être classé « demandes récurrentes ».
 */
export const RECURRING_REQUEST_KEYWORDS: readonly string[] = [
  'password',
  'mot de passe',
  'réinitialis',
  'reinitialis',
  'reset',
  'unlock',
  'déblocage',
  'deblocage',
  'onboarding',
  'offboarding',
  'nouveau poste',
  'changement de poste',
  'demande de matériel',
  'demande de materiel',
  'demande d\'équipement',
  'demande d\'equipement',
  'formation',
  'training',
  'création de compte',
  'creation de compte',
];

// ---------------------------------------------------------------------------
// Identité de grappe (§8.5)
// ---------------------------------------------------------------------------

/** Empreinte courte et stable : 16 premiers caractères d'un sha256 (§8.5). */
export function shortHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Identifiant de grappe : empreinte de `projectId|signatureKey(...)`.
 * Déterministe et stable : deux tickets de même origine obtiennent la même
 * grappe, quel que soit le jour du calcul (§8.5).
 */
export function clusterIdOf(
  projectId: string,
  systemId: string,
  symptomId: string,
  triggerText: string,
): string {
  return shortHash(`${projectId}|${signatureKey(systemId, symptomId, triggerText)}`);
}

// ---------------------------------------------------------------------------
// Seuils (§8.5)
// ---------------------------------------------------------------------------

/**
 * Premier seuil franchi, dans l'ordre tickets → heures → personnes (§8.5).
 * `null` quand la grappe reste sous tous les seuils.
 */
export function isOverThreshold(
  counts: { tickets: number; hours: number; people: number },
  th: Thresholds,
): ThresholdHit | null {
  if (counts.tickets >= th.tickets) return 'tickets';
  if (counts.hours >= th.hours) return 'hours';
  if (counts.people >= th.people) return 'people';
  return null;
}

// ---------------------------------------------------------------------------
// Grappe (§8.5)
// ---------------------------------------------------------------------------

/**
 * Calcule une grappe : compteurs sur la fenêtre glissante et statut.
 * La fenêtre vaut `thresholds.windowDays` jours (30 par défaut, §8.5).
 */
export function computeCluster(input: ClusterInput): Cluster {
  const windowDays = input.thresholds.windowDays > 0 ? input.thresholds.windowDays : SUSPECT_WINDOW_DAYS;
  const windowStart = addDays(input.now, -windowDays);
  const inWindow = input.tickets.filter((t) => isWithin(t.createdAt, windowStart, input.now));
  const counts = countCluster(inWindow);
  const thresholdHit = isOverThreshold(counts, input.thresholds);
  const overThreshold = thresholdHit !== null;
  const requestType = input.requestType ?? input.triggerText;
  return {
    id: clusterIdOf(input.projectId, input.systemId, input.symptomId, input.triggerText),
    projectId: input.projectId,
    systemId: input.systemId,
    symptomId: input.symptomId,
    triggerText: input.triggerText,
    tickets30d: counts.tickets,
    hours30d: counts.hours,
    people30d: counts.people,
    status: resolveStatus(input.status, requestType, counts.tickets, overThreshold),
    firstSeenAt: firstSeenAt(input.tickets, input.now),
    lastSeenAt: lastSeenAt(input.tickets, input.now),
    overThreshold,
    thresholdHit,
  };
}

/**
 * Statut de la grappe (§8.5, §18).
 * `dismissed` n'est jamais décidé ici : c'est un geste humain, on se contente
 * de conserver le statut déjà posé ; `problem` de même.
 */
export function resolveStatus(
  current: ClusterStatus | undefined,
  requestType: string | null,
  tickets: number,
  overThreshold: boolean,
): ClusterStatus {
  if (current === 'problem') return 'problem';
  if (current === 'dismissed') return 'dismissed';
  if (classifyRecurring({ requestType, tickets, overThreshold })) return 'recurring';
  if (overThreshold) return 'suspect';
  return 'watching';
}

// ---------------------------------------------------------------------------
// Récurrence (§18)
// ---------------------------------------------------------------------------

/**
 * Une demande de service répétée mais normale (réinitialisation de mot de
 * passe) forme une grappe coûteuse **sans défaut** : elle est classée à part,
 * « demandes récurrentes », candidate à l'automatisation plutôt qu'à la
 * correction (§18).
 */
export function classifyRecurring(input: {
  requestType: string | null;
  tickets: number;
  overThreshold: boolean;
}): boolean {
  if (!isRecurringRequestType(input.requestType)) return false;
  if (input.tickets < RECURRING_MIN_TICKETS) return false;
  return input.overThreshold;
}

/** Le type de demande correspond-il aux demandes récurrentes connues (§18) ? */
export function isRecurringRequestType(requestType: string | null | undefined): boolean {
  const label = (requestType ?? '').trim().toLowerCase();
  if (!label) return false;
  if (RECURRING_REQUEST_TYPES.includes(label)) return true;
  return RECURRING_REQUEST_KEYWORDS.some((keyword) => label.includes(keyword));
}

// ---------------------------------------------------------------------------
// Helpers internes (§8.5)
// ---------------------------------------------------------------------------

/** Le ticket est-il dans la fenêtre glissante `[windowStart, now]` ? */
function isWithin(createdAt: string, windowStart: string, now: string): boolean {
  const at = parseIso(createdAt);
  const start = parseIso(windowStart);
  const end = parseIso(now);
  if (!at || !start || !end) return false;
  return at.getTime() >= start.getTime() && at.getTime() <= end.getTime();
}

/** Tickets, heures cumulées et personnes distinctes de la fenêtre (§8.5). */
function countCluster(tickets: readonly TicketInWindow[]): {
  tickets: number;
  hours: number;
  people: number;
} {
  const hours = tickets.reduce((sum, t) => sum + (Number.isFinite(t.hours) ? t.hours : 0), 0);
  return { tickets: tickets.length, hours: round2(hours), people: distinctReporters(tickets) };
}

/** Demandeurs distincts : un même demandeur ne compte qu'une fois (§8.5). */
function distinctReporters(tickets: readonly TicketInWindow[]): number {
  const seen = new Set<string>();
  for (const ticket of tickets) {
    const reporter = (ticket.reporter ?? '').trim().toLowerCase();
    if (reporter) seen.add(reporter);
  }
  return seen.size;
}

/** Premier instant observé par la grappe, ou `now` si la grappe est vide. */
function firstSeenAt(tickets: readonly TicketInWindow[], fallback: string): string {
  let min = Number.POSITIVE_INFINITY;
  for (const time of ticketTimes(tickets)) if (time < min) min = time;
  return Number.isFinite(min) ? new Date(min).toISOString() : fallback;
}

/** Dernier instant observé par la grappe, ou `now` si la grappe est vide. */
function lastSeenAt(tickets: readonly TicketInWindow[], fallback: string): string {
  let max = Number.NEGATIVE_INFINITY;
  for (const time of ticketTimes(tickets)) if (time > max) max = time;
  return Number.isFinite(max) ? new Date(max).toISOString() : fallback;
}

/** Instants lisibles des tickets ; les dates illisibles sont ignorées. */
function ticketTimes(tickets: readonly TicketInWindow[]): number[] {
  const times: number[] = [];
  for (const ticket of tickets) {
    const date = parseIso(ticket.createdAt);
    if (date) times.push(date.getTime());
  }
  return times;
}
