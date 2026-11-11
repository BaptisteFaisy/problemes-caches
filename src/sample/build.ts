/**
 * Construction du jeu d'exemple — fonctions publiques déterministes (PC-12, §20).
 *
 * Découpage de `dataset.ts` pour rester sous la règle des 500 lignes
 * (règle user 2026-10-24, Couche 0). Ce fichier assemble les faits de tickets
 * et les signatures attendues à partir des slots générés par `dataset.ts`.
 */

import type { HardClues, TicketFact } from '../core/types.ts';
import { UNDETERMINED_ID } from '../core/types.ts';
import { addDays, round2 } from '../core/time.ts';
import {
  ALL_GROUPS,
  FIRST_NAMES,
  LAST_NAMES,
  ORGANIZATIONS,
  SAMPLE_ANCHOR_ISO,
  SAMPLE_ID_PREFIX,
  SAMPLE_MINUTES_PER_TOUCH,
  SAMPLE_PROJECT_KEY,
  SAMPLE_SUMMARY_MAX,
  SAMPLE_TICKET_COUNT,
  SAMPLE_WINDOW_DAYS,
  interleave,
  mulberry32,
  toSlots,
} from './dataset.ts';
import type { SampleDataset, SampleGroupSpec, SampleTicket, Slot } from './dataset.ts';

/** Construit les indices certains d'un ticket d'exemple à partir de son groupe. */
function buildClues(spec: SampleGroupSpec): HardClues {
  return {
    requestType: spec.requestType,
    service: spec.service ?? null,
    component: spec.component ?? null,
    errorCodes: spec.key === 'remote-access' ? ['ERR-4402'] : [],
    product: spec.product ?? null,
    version: spec.version ?? null,
    os: spec.os ?? null,
    assetIds: spec.assetId ? [spec.assetId] : [],
    organization: null,
  };
}

/** Date ISO d'un jour donné dans la fenêtre de 60 jours (§20). */
function dateOf(day: number, time: string): string {
  const deltaDays = -(SAMPLE_WINDOW_DAYS - 1 - day);
  const base = addDays(SAMPLE_ANCHOR_ISO, deltaDays);
  return `${base.slice(0, 10)}T${time}:00.000Z`;
}

/** Construit un ticket complet à partir d'un slot et du générateur aléatoire. */
function buildTicket(slot: Slot, index: number, rand: () => number): SampleTicket {
  const issueId = `${SAMPLE_ID_PREFIX}${index + 1}`;
  const issueKey = `${SAMPLE_PROJECT_KEY}-${index + 1}`;
  const reporter = `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`;
  const organization = ORGANIZATIONS[Math.floor(rand() * ORGANIZATIONS.length)] ?? null;
  const createdAt = dateOf(slot.day, slot.time);
  const touches = 1 + Math.floor(rand() * 4);
  const hasLogged = rand() > 0.6;
  const loggedSeconds = hasLogged ? touches * SAMPLE_MINUTES_PER_TOUCH * 60 : null;
  const summary = slot.text.slice(0, SAMPLE_SUMMARY_MAX);
  const isUndetermined = slot.spec.key === 'undetermined';
  const isRestricted = slot.spec.key === 'restricted';
  const clues = buildClues(slot.spec);
  clues.organization = organization;

  return {
    issueId,
    issueKey,
    projectId: 'sample-project-sup',
    projectKey: SAMPLE_PROJECT_KEY,
    requestType: slot.spec.requestType,
    service: slot.spec.service ?? null,
    component: slot.spec.component ?? null,
    reporter,
    organization,
    createdAt,
    resolvedAt: slot.day < 50 ? dateOf(slot.day + 2, '17:00') : null,
    touches,
    loggedSeconds,
    reopened: rand() < 0.1,
    escalated: rand() < 0.08,
    slaBreached: rand() < 0.12,
    visible: !isRestricted,
    summary,
    group: slot.spec.group,
    variant: slot.spec.key,
    kind: slot.spec.kind,
    systemId: isUndetermined ? UNDETERMINED_ID : slot.spec.systemId,
    symptomId: isUndetermined ? UNDETERMINED_ID : slot.spec.symptomId,
    triggerText: isUndetermined ? '' : slot.spec.triggerText,
    undetermined: isUndetermined,
    language: slot.language,
    hardClues: clues,
  };
}

/**
 * Construit les 120 tickets du jeu d'exemple de façon strictement reproductible.
 * Deux appels avec la même graine rendent le même jeu au bit près (§21, PC-12).
 */
export function buildDataset(seed = 20261222): SampleDataset {
  const rand = mulberry32(seed);
  const order = interleave();
  const slots = toSlots(order);
  const tickets: SampleTicket[] = slots.map((slot, index) => buildTicket(slot, index, rand));

  return {
    tickets,
    expectedClusters: 4,
    expectedProblems: ['remote-access', 'printer-floor-3', 'duplicate-invoice'],
  };
}
