/**
 * Tests du jeu d'exemple (PC-12, §19, §20, §21).
 *
 * Le jeu est ce que les juges voient en premier : il doit être reproductible,
 * contenir les trois problèmes cachés annoncés, une demande récurrente
 * normale, une flambée visible, et les cas limites du §18 (ticket d'une ligne,
 * ticket à visibilité restreinte).
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DAY_MS } from '../core/time';
import { signatureKey } from '../core/types';
import { buildDataset } from './build';
import {
  SAMPLE_ANCHOR_ISO,
  SAMPLE_ID_PREFIX,
  SAMPLE_SUMMARY_MAX,
  SAMPLE_SURGE_DAY,
  SAMPLE_TICKET_COUNT,
  SAMPLE_WINDOW_DAYS,
} from './dataset';

const dataset = buildDataset();
const tickets = dataset.tickets;

/** Empreinte du jeu complet : deux appels doivent donner la même. */
function fingerprint(): string {
  return createHash('sha256').update(JSON.stringify(tickets)).digest('hex');
}

test('le jeu est déterministe : deux constructions donnent la même empreinte', () => {
  assert.equal(fingerprint(), createHash('sha256').update(JSON.stringify(buildDataset().tickets)).digest('hex'));
});

test('120 tickets, étalés sur 60 jours (§20)', () => {
  assert.equal(tickets.length, SAMPLE_TICKET_COUNT);
  const anchor = Date.parse(SAMPLE_ANCHOR_ISO);
  const start = anchor - (SAMPLE_WINDOW_DAYS - 1) * DAY_MS;
  for (const ticket of tickets) {
    const at = Date.parse(ticket.createdAt);
    assert.ok(at >= start - DAY_MS, `ticket trop ancien : ${ticket.issueKey}`);
    assert.ok(at <= anchor + DAY_MS, `ticket hors fenêtre : ${ticket.issueKey}`);
  }
});

test('chaque jour de la fenêtre compte au moins un ticket', () => {
  const days = new Set(tickets.map((ticket) => ticket.createdAt.slice(0, 10)));
  assert.ok(days.size >= SAMPLE_WINDOW_DAYS - 2, `jours couverts : ${days.size}`);
});

test('les trois problèmes cachés attendus sont présents (§20)', () => {
  assert.deepEqual(dataset.expectedProblems, ['remote-access', 'printer-floor-3', 'duplicate-invoice']);
  for (const label of dataset.expectedProblems) {
    const count = tickets.filter((ticket) => ticket.group === label).length;
    assert.ok(count >= 5, `${label} : seulement ${count} tickets`);
  }
});

test('accès distant : au moins dix tickets pour une même panne, mots différents (§19.1)', () => {
  const group = tickets.filter((ticket) => ticket.group === 'remote-access');
  assert.ok(group.length >= 10, `${group.length} tickets`);
  const texts = new Set(group.map((ticket) => ticket.summary));
  assert.equal(texts.size, group.length, 'chaque ticket raconte la panne avec ses mots');
  const signatures = new Set(group.map((t) => signatureKey(t.systemId, t.symptomId, t.triggerText)));
  assert.equal(signatures.size, 1, 'une seule signature attendue pour toute la grappe');
});

test('au moins un ticket français et un anglais partagent la même signature (§18)', () => {
  const group = tickets.filter((ticket) => ticket.group === 'remote-access');
  assert.ok(group.some((ticket) => ticket.language === 'fr'), 'aucun ticket français');
  assert.ok(group.some((ticket) => ticket.language === 'en'), 'aucun ticket anglais');
});

test('la demande récurrente normale est présente et distincte (§18)', () => {
  const recurring = tickets.filter((ticket) => ticket.kind === 'recurring');
  assert.ok(recurring.length >= 5, `${recurring.length} tickets récurrents`);
  assert.ok(
    recurring.every((ticket) => signatureKey(ticket.systemId, ticket.symptomId, ticket.triggerText)
      !== signatureKey('sys-remote-access', 'sym-connection-drop', 'après la mise à jour du poste')),
    'la demande récurrente ne doit pas partager la signature d’un problème',
  );
});

test('une flambée visible sur deux heures (§8.6)', () => {
  const burst = tickets.filter((ticket) => {
    const day = Math.round((Date.parse(SAMPLE_ANCHOR_ISO) - Date.parse(ticket.createdAt)) / DAY_MS);
    return ticket.group === 'remote-access' && day === SAMPLE_WINDOW_DAYS - 1 - SAMPLE_SURGE_DAY;
  });
  const hours = burst.map((ticket) => ticket.createdAt.slice(11, 16)).sort();
  assert.ok(burst.length >= 5, `${burst.length} tickets dans la flambée`);
  assert.ok(hours[0]! < '11:00' && hours[hours.length - 1]! < '12:00', 'la flambée déborde deux heures');
});

test('un ticket à visibilité restreinte (PC-13)', () => {
  assert.ok(tickets.some((ticket) => ticket.visible === false), 'aucun ticket masqué');
});

test('un ticket d’une ligne, signature indéterminée (§18)', () => {
  const undetermined = tickets.filter((ticket) => ticket.undetermined);
  assert.ok(undetermined.length >= 1, 'aucun ticket indéterminé');
  assert.ok(undetermined.every((ticket) => ticket.summary.length < 40), 'texte trop long pour un indéterminé');
});

test('heures : du temps saisi et des tickets sans temps (méthode « mixed », §9)', () => {
  assert.ok(tickets.some((ticket) => ticket.loggedSeconds !== null), 'aucun temps saisi');
  assert.ok(tickets.some((ticket) => ticket.loggedSeconds === null), 'tous les tickets ont du temps saisi');
  assert.ok(tickets.some((ticket) => ticket.reopened), 'aucune réouverture');
  assert.ok(tickets.some((ticket) => ticket.escalated), 'aucune escalade');
  assert.ok(tickets.some((ticket) => ticket.slaBreached), 'aucun délai dépassé');
});

test('aucun résumé au-delà de la borne de la colonne (§15)', () => {
  assert.ok(tickets.every((ticket) => ticket.summary.length <= SAMPLE_SUMMARY_MAX));
});

test('identifiants uniques et préfixés : le retrait ne touche que le jeu (§21)', () => {
  const ids = new Set(tickets.map((ticket) => ticket.issueId));
  assert.equal(ids.size, tickets.length, 'identifiants en double');
  assert.ok(tickets.every((ticket) => ticket.issueId.startsWith(SAMPLE_ID_PREFIX)));
});

test('plusieurs demandeurs et organisations distincts (§9)', () => {
  assert.ok(new Set(tickets.map((ticket) => ticket.reporter)).size > 10);
  assert.ok(new Set(tickets.map((ticket) => ticket.organization)).size > 3);
});

test('quatre grappes attendues : trois problèmes + une demande récurrente', () => {
  assert.equal(dataset.expectedClusters, 4);
});
