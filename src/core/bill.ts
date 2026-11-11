/**
 * L'addition (§9) — le coût chiffré d'un problème récurrent.
 *
 * Module pur : aucun import `@forge/*`, aucune I/O, aucune horloge implicite
 * (l'heure arrive en paramètre, `now`). Chaque poste de l'addition est calculé
 * ici une seule fois ; l'interface et les résolveurs ne font qu'afficher.
 *
 * Règles métier du cahier :
 *
 * - §9 : temps saisi prioritaire, sinon interventions × durée moyenne réglable.
 *   La méthode et la durée moyenne utilisées partent avec le chiffre (§17).
 * - §18 : une personne qui a aussi un ticket compte une fois, jamais deux.
 * - PC-13 : les tickets masqués comptent dans l'addition mais ne sont jamais listés.
 * - §19.6 : retirer un ticket diminue l'addition d'autant, rien de plus.
 */

import { DEFAULT_MINUTES_PER_TOUCH } from './constants';
import { clamp, round2 } from './time';
import type { BillPeriod, HoursMethod, ProblemBill, Trend } from './types';

/** Ticket réduit à ce qu'il faut pour chiffrer (§9). */
export interface BillTicket {
  issueId: string;
  reporter: string | null;
  organization: string | null;
  loggedSeconds: number | null;
  touches: number;
  reopened: boolean;
  escalated: boolean;
  slaBreached: boolean;
  visible: boolean;
}

/** « Moi aussi » du portail : une personne, et son organisation si connue (§7.3). */
export interface BillMeToo {
  accountId: string;
  organization: string | null;
}

/** Tout ce qu'il faut pour établir l'addition d'un problème sur une période (§9). */
export interface BillInput {
  problemId: string;
  period: BillPeriod;
  tickets: readonly BillTicket[];
  meToo: readonly BillMeToo[];
  minutesPerTouch: number;
  hourRateEur: number | null;
  now: string;
}

/** Borne haute sûre pour les compteurs venus de la base. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * Clé d'identité : le même compte ou la même organisation ne compte qu'une
 * fois, quelle que soit sa casse (§18, sans double compte).
 */
function identityKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Heures d'un ticket issues du temps saisi, jamais négatives. */
function loggedHours(ticket: BillTicket): number {
  if (ticket.loggedSeconds === null) return 0;
  return clamp(ticket.loggedSeconds, 0, MAX_SAFE) / 3600;
}

/** Heures estimées d'un ticket : interventions × durée moyenne (§9). */
function touchHours(ticket: BillTicket, minutesPerTouch: number): number {
  const touches = clamp(ticket.touches, 0, MAX_SAFE);
  const minutes = clamp(minutesPerTouch, 0, MAX_SAFE);
  return (touches * minutes) / 60;
}

/** Heures d'un ticket : temps saisi s'il existe, sinon estimation (§9). */
function hoursOfTicket(ticket: BillTicket, minutesPerTouch: number): number {
  if (ticket.loggedSeconds !== null) return loggedHours(ticket);
  return touchHours(ticket, minutesPerTouch);
}

/** Somme des heures d'un lot de tickets. */
function sumHours(tickets: readonly BillTicket[], minutesPerTouch: number): number {
  return tickets.reduce((total, ticket) => total + hoursOfTicket(ticket, minutesPerTouch), 0);
}

/**
 * Heures de support d'un lot de tickets et méthode employée (§9).
 *
 * - `logged` : tous les tickets portent du temps saisi (et aucun ticket : il
 *   n'y a alors ni saisie ni estimation, on affiche la méthode la plus sûre).
 * - `touches` : aucun temps saisi, tout vient des interventions × durée moyenne.
 * - `mixed` : les deux méthodes cohabitent dans le lot.
 */
export function hoursOf(
  tickets: readonly BillTicket[],
  minutesPerTouch: number,
): { hours: number; method: HoursMethod } {
  const logged = tickets.filter((ticket) => ticket.loggedSeconds !== null).length;
  const hours = round2(sumHours(tickets, minutesPerTouch));
  if (logged === tickets.length) return { hours, method: 'logged' };
  if (logged === 0) return { hours, method: 'touches' };
  return { hours, method: 'mixed' };
}

/** Personnes touchées : demandeurs distincts plus « moi aussi » distincts (§9, §18). */
function countPeople(tickets: readonly BillTicket[], meToo: readonly BillMeToo[]): number {
  const people = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.reporter) people.add(identityKey(ticket.reporter));
  }
  for (const signal of meToo) {
    const key = identityKey(signal.accountId);
    if (key) people.add(key);
  }
  return people.size;
}

/** Organisations clientes distinctes, tickets et « moi aussi » confondus (§9). */
function countOrgs(tickets: readonly BillTicket[], meToo: readonly BillMeToo[]): number {
  const orgs = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.organization) orgs.add(identityKey(ticket.organization));
  }
  for (const signal of meToo) {
    if (signal.organization) orgs.add(identityKey(signal.organization));
  }
  return orgs.size;
}

/** Somme d'un drapeau sur les tickets : SLA rompus, réouvertures, escalades (§9). */
function countFlag(tickets: readonly BillTicket[], flag: (ticket: BillTicket) => boolean): number {
  return tickets.filter((ticket) => flag(ticket)).length;
}

/**
 * Addition complète d'un problème sur une période (§9).
 *
 * Les tickets masqués (PC-13) pèsent dans tous les postes : un lecteur sans
 * accès voit « 1 élément masqué », mais le coût reste le vrai coût.
 */
export function computeBill(input: BillInput): ProblemBill {
  const { tickets, meToo, minutesPerTouch, hourRateEur } = input;
  const { hours, method } = hoursOf(tickets, minutesPerTouch);
  return {
    problemId: input.problemId,
    period: input.period,
    tickets: tickets.length,
    hours,
    people: countPeople(tickets, meToo),
    orgs: countOrgs(tickets, meToo),
    slaBreaches: countFlag(tickets, (ticket) => ticket.slaBreached),
    reopens: countFlag(tickets, (ticket) => ticket.reopened),
    escalations: countFlag(tickets, (ticket) => ticket.escalated),
    meToo: meToo.length,
    hoursMethod: method,
    minutesPerTouch,
    eur: hourRateEur === null ? null : round2(hours * hourRateEur),
    hourRateEur,
    hiddenCount: countFlag(tickets, (ticket) => !ticket.visible),
    computedAt: input.now,
  };
}

/**
 * Tendance de l'addition : comparaison des deux dernières périodes (§9).
 *
 * Elle porte sur le nombre de tickets, le seul poste comparable d'une période
 * à l'autre : les heures dépendent du temps saisi, qui arrive plus tard, et les
 * personnes dépendent des « moi aussi », qui ne reviennent pas en arrière.
 *
 * `deltaPercent` vaut `null` quand la période précédente est vide (division
 * impossible) ; la direction reste lisible par comparaison directe. `flat`
 * tant que l'écart reste sous 5 %.
 */
export function computeTrend(previous: ProblemBill | null, current: ProblemBill): Trend {
  const previousCount = previous ? previous.tickets : 0;
  const currentCount = current.tickets;
  const deltaPercent =
    previousCount === 0 ? null : round2(((currentCount - previousCount) / previousCount) * 100);
  return {
    previous: previousCount,
    current: currentCount,
    direction: directionOf(previousCount, currentCount, deltaPercent),
    deltaPercent,
  };
}

/** Direction de la tendance : pourcentage quand il existe, sinon comparaison (§9). */
function directionOf(
  previousCount: number,
  currentCount: number,
  deltaPercent: number | null,
): 'up' | 'down' | 'flat' {
  if (deltaPercent === null) {
    if (currentCount > previousCount) return 'up';
    if (currentCount < previousCount) return 'down';
    return 'flat';
  }
  if (Math.abs(deltaPercent) < 5) return 'flat';
  return deltaPercent > 0 ? 'up' : 'down';
}

/** Addition vide, rendue quand il n'y a rien à fusionner. */
function emptyBill(): ProblemBill {
  return {
    problemId: '',
    period: '30d',
    tickets: 0,
    hours: 0,
    people: 0,
    orgs: 0,
    slaBreaches: 0,
    reopens: 0,
    escalations: 0,
    meToo: 0,
    hoursMethod: 'touches',
    minutesPerTouch: DEFAULT_MINUTES_PER_TOUCH,
    eur: null,
    hourRateEur: null,
    hiddenCount: 0,
    computedAt: '',
  };
}

/** Somme d'une liste de nombres. */
function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Dernière date ISO d'une liste, ou `null` si la liste est vide. */
function latestAt(values: readonly string[]): string | null {
  return values.length === 0 ? null : values.slice().sort().at(-1) ?? null;
}

/**
 * Fusion des additions de deux problèmes qui n'en font qu'un (§18).
 *
 * Limite assumée, documentée ici parce qu'elle pèse sur les chiffres :
 * l'addition ne porte que des compteurs, pas les listes de tickets, de
 * personnes ni d'organisations. Un ticket rattaché aux deux problèmes serait
 * donc compté deux fois, et une organisation cliente commune aussi. Pour les
 * personnes, on prend le plus grand des deux compteurs : c'est la borne basse
 * de l'ensemble réel, jamais un double compte. Une fusion définitive repasse
 * par `computeBill` avec les tickets réunis dès que la base le permet (§19.7).
 *
 * `hoursMethod` est forcée à `mixed` : après fusion, on ne sait plus si chaque
 * ticket portait du temps saisi, et l'afficher « temps saisi » serait mentir (§17).
 */
export function mergeBills(bills: readonly ProblemBill[]): ProblemBill {
  const first = bills[0];
  if (!first) return emptyBill();
  const hours = round2(sum(bills.map((bill) => bill.hours)));
  const hourRateEur = bills.find((bill) => bill.hourRateEur !== null)?.hourRateEur ?? null;
  return {
    ...emptyBill(),
    problemId: first.problemId,
    period: first.period,
    tickets: sum(bills.map((bill) => bill.tickets)),
    hours,
    people: Math.max(...bills.map((bill) => bill.people)),
    orgs: sum(bills.map((bill) => bill.orgs)),
    slaBreaches: sum(bills.map((bill) => bill.slaBreaches)),
    reopens: sum(bills.map((bill) => bill.reopens)),
    escalations: sum(bills.map((bill) => bill.escalations)),
    meToo: sum(bills.map((bill) => bill.meToo)),
    hoursMethod: 'mixed',
    minutesPerTouch: Math.max(...bills.map((bill) => bill.minutesPerTouch)),
    eur: hourRateEur === null ? null : round2(hours * hourRateEur),
    hourRateEur,
    hiddenCount: sum(bills.map((bill) => bill.hiddenCount)),
    computedAt: latestAt(bills.map((bill) => bill.computedAt)) ?? first.computedAt,
  };
}
