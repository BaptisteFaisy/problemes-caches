/**
 * Tests du lot WP-C — grappes, seuils, demandes récurrentes (§8.5, §18).
 * Déterministes : toutes les dates sont figées, aucune horloge n'est lue.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyRecurring,
  clusterIdOf,
  computeCluster,
  isOverThreshold,
  RECURRING_MIN_TICKETS,
  RECURRING_REQUEST_TYPES,
} from './cluster';
import type { ClusterInput, TicketInWindow } from './cluster';
import { DEFAULT_THRESHOLDS } from './constants';
import { addDays } from './time';
import type { Thresholds } from './types';

/** Instant de référence : tout le temps relatif part de là. */
const NOW = '2026-03-01T12:00:00.000Z';

/** Seuils du projet (§8.5). */
const THRESHOLDS: Thresholds = { ...DEFAULT_THRESHOLDS, windowDays: 30 };

/** Ticket d'il y a `days` jours, `hours` heures de traitement. */
function ticket(days: number, hours: number, reporter: string | null, index: number): TicketInWindow {
  return {
    issueId: `T-${index}`,
    reporter,
    hours,
    createdAt: addDays(NOW, -days),
  };
}

/** Cinq tickets du même jour, de demandeurs distincts. */
function fiveTickets(): TicketInWindow[] {
  return [0, 1, 2, 3, 4].map((i) => ticket(1, 1, `user-${i}`, i));
}

/** Entrée de calcul de grappe, avec les seuils du projet. */
function clusterInput(tickets: readonly TicketInWindow[], extra: Partial<ClusterInput> = {}): ClusterInput {
  return {
    projectId: 'PRJ',
    systemId: 'sys-vpn',
    symptomId: 'sym-cut',
    triggerText: 'Après mise à jour',
    tickets,
    thresholds: THRESHOLDS,
    now: NOW,
    ...extra,
  };
}

test('clusterIdOf : empreinte sha256 tronquée à 16 caractères, stable', () => {
  const id = clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', 'Après mise à jour');
  assert.equal(id.length, 16);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(id, clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', 'Après mise à jour'));
});

test('clusterIdOf : deux projets ou deux signatures donnent deux grappes', () => {
  const base = clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', 'Après mise à jour');
  assert.notEqual(base, clusterIdOf('PRJ2', 'sys-vpn', 'sym-cut', 'Après mise à jour'));
  assert.notEqual(base, clusterIdOf('PRJ', 'sys-impressante', 'sym-cut', 'Après mise à jour'));
  assert.notEqual(base, clusterIdOf('PRJ', 'sys-vpn', 'sym-bloc', 'Après mise à jour'));
});

test('clusterIdOf : le déclencheur est normalisé (casse et espaces)', () => {
  const base = clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', 'Après mise à jour');
  assert.equal(base, clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', '  APRÈS   mise  à jour '));
});

test('computeCluster : seuil de 5 tickets atteint pile → suspect', () => {
  const cluster = computeCluster(clusterInput(fiveTickets()));
  assert.equal(cluster.tickets30d, 5);
  assert.equal(cluster.hours30d, 5);
  assert.equal(cluster.people30d, 5);
  assert.equal(cluster.overThreshold, true);
  assert.equal(cluster.thresholdHit, 'tickets');
  assert.equal(cluster.status, 'suspect');
});

test('computeCluster : juste en dessous du seuil → watching', () => {
  const cluster = computeCluster(clusterInput(fiveTickets().slice(0, 4)));
  assert.equal(cluster.tickets30d, 4);
  assert.equal(cluster.overThreshold, false);
  assert.equal(cluster.thresholdHit, null);
  assert.equal(cluster.status, 'watching');
});

test('computeCluster : un ticket de 31 jours est hors de la fenêtre', () => {
  const tickets = [...fiveTickets(), ticket(31, 2, 'user-ancien', 9)];
  const cluster = computeCluster(clusterInput(tickets));
  assert.equal(cluster.tickets30d, 5);
  assert.equal(cluster.hours30d, 5);
  assert.equal(cluster.overThreshold, true);
});

test('computeCluster : le ticket de 30 jours pile est dans la fenêtre', () => {
  const tickets = [...fiveTickets().slice(0, 4), ticket(30, 1, 'user-30', 8)];
  const cluster = computeCluster(clusterInput(tickets));
  assert.equal(cluster.tickets30d, 5);
  assert.equal(cluster.status, 'suspect');
});

test('computeCluster : les personnes distinctes ne sont comptées qu\'une fois', () => {
  const tickets = fiveTickets().map((t) => ({ ...t, reporter: 'user-1' }));
  const cluster = computeCluster(clusterInput(tickets));
  assert.equal(cluster.people30d, 1);
  assert.equal(cluster.tickets30d, 5);
  assert.equal(cluster.thresholdHit, 'tickets');
});

test('computeCluster : les heures de la fenêtre sont cumulées', () => {
  const tickets = [0, 1, 2, 3].map((i) => ticket(2, 1.5, `user-${i}`, i));
  const cluster = computeCluster(clusterInput(tickets));
  assert.equal(cluster.hours30d, 6);
  assert.equal(cluster.overThreshold, false);
});

test('computeCluster : les bornes de la grappe suivent les tickets', () => {
  const tickets = [...fiveTickets(), ticket(20, 1, 'user-20', 7)];
  const cluster = computeCluster(clusterInput(tickets));
  assert.equal(cluster.firstSeenAt, addDays(NOW, -20));
  assert.equal(cluster.lastSeenAt, addDays(NOW, -1));
  assert.equal(cluster.id, clusterIdOf('PRJ', 'sys-vpn', 'sym-cut', 'Après mise à jour'));
});

test('computeCluster : un problème déjà reconnu garde son statut', () => {
  const cluster = computeCluster(clusterInput(fiveTickets(), { status: 'problem' }));
  assert.equal(cluster.status, 'problem');
  assert.equal(cluster.overThreshold, true);
});

test('computeCluster : un rejet humain est conservé, jamais décidé ici', () => {
  const dismissed = computeCluster(clusterInput(fiveTickets(), { status: 'dismissed' }));
  assert.equal(dismissed.status, 'dismissed');
  const fresh = computeCluster(clusterInput(fiveTickets()));
  assert.notEqual(fresh.status, 'dismissed');
});

test('computeCluster : une demande récurrente est classée à part', () => {
  const tickets = [0, 1, 2, 3, 4, 5].map((i) => ticket(3, 0.2, `user-${i}`, i));
  const cluster = computeCluster(
    clusterInput(tickets, { triggerText: 'réinitialisation de mot de passe' }),
  );
  assert.equal(cluster.overThreshold, true);
  assert.equal(cluster.status, 'recurring');
});

test('isOverThreshold : l\'ordre est tickets → heures → personnes', () => {
  assert.equal(isOverThreshold({ tickets: 5, hours: 0, people: 0 }, THRESHOLDS), 'tickets');
  assert.equal(isOverThreshold({ tickets: 1, hours: 10, people: 0 }, THRESHOLDS), 'hours');
  assert.equal(isOverThreshold({ tickets: 1, hours: 1, people: 10 }, THRESHOLDS), 'people');
  assert.equal(isOverThreshold({ tickets: 4, hours: 9, people: 9 }, THRESHOLDS), null);
});

test('isOverThreshold : un seuil personnalisé est respecté', () => {
  const thresholds: Thresholds = { tickets: 20, hours: 3, people: 50, windowDays: 30 };
  assert.equal(isOverThreshold({ tickets: 2, hours: 3.5, people: 1 }, thresholds), 'hours');
  assert.equal(isOverThreshold({ tickets: 20, hours: 0, people: 0 }, thresholds), 'tickets');
});

test('classifyRecurring : une demande de service répétée mais normale', () => {
  assert.equal(
    classifyRecurring({ requestType: 'Réinitialisation de mot de passe', tickets: 12, overThreshold: true }),
    true,
  );
  assert.equal(classifyRecurring({ requestType: 'Password reset', tickets: 12, overThreshold: true }), true);
});

test('classifyRecurring : un défaut n\'est jamais une demande récurrente', () => {
  assert.equal(
    classifyRecurring({ requestType: 'Accès distant indisponible', tickets: 12, overThreshold: true }),
    false,
  );
  assert.equal(classifyRecurring({ requestType: null, tickets: 12, overThreshold: true }), false);
});

test('classifyRecurring : une demande isolée ou peu coûteuse reste ordinaire', () => {
  assert.equal(
    classifyRecurring({ requestType: 'Réinitialisation de mot de passe', tickets: 1, overThreshold: false }),
    false,
  );
  assert.equal(
    classifyRecurring({
      requestType: 'Réinitialisation de mot de passe',
      tickets: RECURRING_MIN_TICKETS,
      overThreshold: false,
    }),
    false,
  );
});

test('classifyRecurring : la liste des demandes récurrentes est exportée', () => {
  assert.ok(RECURRING_REQUEST_TYPES.includes('réinitialisation de mot de passe'));
  assert.ok(RECURRING_REQUEST_TYPES.length >= 10);
});
