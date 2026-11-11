/**
 * Tests du lot WP-D — flambées (§8.6).
 * Déterministes : toutes les dates sont figées, aucune horloge n'est lue.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { baselineFor, detectSurge, surgeFactor } from './surge';
import type { SurgeInput } from './surge';
import type { Surge } from './types';

/** Instant de référence : tout le temps relatif part de là. */
const NOW = '2026-03-01T12:00:00.000Z';

/** Fenêtre de flambée : deux heures, comme au cahier (§8.6). */
const WINDOW_MINUTES = 120;

/** Événement situé `minutes` minutes avant `NOW`. */
function minutesAgo(minutes: number): { at: string } {
  return { at: new Date(Date.parse(NOW) - minutes * 60_000).toISOString() };
}

/** Historique régulier : un ticket par fenêtre de deux heures sur les dix dernières. */
function regularHistory(): { at: string }[] {
  return [120, 240, 360, 480, 600].map((m) => minutesAgo(m));
}

/** Entrée de détection de flambée, avec la fenêtre et le facteur du cahier. */
function surgeInput(extra: Partial<SurgeInput> = {}): SurgeInput {
  return {
    clusterId: 'CL-1',
    projectId: 'PRJ',
    recent: [minutesAgo(5), minutesAgo(10), minutesAgo(15)],
    history: regularHistory(),
    windowMinutes: WINDOW_MINUTES,
    factor: 3,
    now: NOW,
    ...extra,
  };
}

test('surgeFactor : rapport taux/base arrondi à deux décimales', () => {
  assert.equal(surgeFactor(3, 1), 3);
  assert.equal(surgeFactor(6, 2), 3);
  assert.equal(surgeFactor(7, 3), 2.33);
  assert.equal(surgeFactor(1, 4), 0.25);
});

test('surgeFactor : jamais de division par zéro', () => {
  assert.equal(surgeFactor(3, 0), 0);
  assert.equal(surgeFactor(3, -1), 0);
  assert.equal(surgeFactor(Number.NaN, 1), 0);
});

test('baselineFor : un historique vide retombe sur le plancher de 1', () => {
  assert.equal(baselineFor([], WINDOW_MINUTES, NOW), 1);
});

test('baselineFor : la moyenne par fenêtre est calculée sur l\'historique', () => {
  // 10 tickets sur 10 fenêtres de 60 minutes → 1 ticket par fenêtre.
  const history = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600].map((m) => minutesAgo(m));
  assert.equal(baselineFor(history, 60, NOW), 1);
  // 12 tickets dans la seule heure qui précède → 12 par fenêtre.
  const dense = Array.from({ length: 12 }, () => minutesAgo(30));
  assert.equal(baselineFor(dense, 60, NOW), 12);
});

test('baselineFor : la base ne descend jamais sous 1', () => {
  const sparse = [minutesAgo(60 * 24 * 30)];
  assert.equal(baselineFor(sparse, WINDOW_MINUTES, NOW), 1);
});

test('detectSurge : une flambée exactement trois fois la base se déclenche', () => {
  const surge = detectSurge(surgeInput());
  assert.ok(surge);
  assert.equal(surge?.rate, 3);
  assert.equal(surge?.baseline, 1);
  assert.equal(surge?.factor, 3);
  assert.equal(surge?.clusterId, 'CL-1');
  assert.equal(surge?.projectId, 'PRJ');
  assert.equal(surge?.startedAt, NOW);
  assert.equal(surge?.expected, false);
  assert.equal(surge?.incidentKey, null);
});

test('detectSurge : en dessous du triple, rien ne se déclenche', () => {
  const surge = detectSurge(surgeInput({ recent: [minutesAgo(5), minutesAgo(10)] }));
  assert.equal(surge, null);
});

test('detectSurge : un historique vide laisse le plancher à 1', () => {
  const surge = detectSurge(surgeInput({ history: [] }));
  assert.ok(surge);
  assert.equal(surge?.baseline, 1);
  assert.equal(surge?.rate, 3);
});

test('detectSurge : les tickets hors de la fenêtre ne comptent pas', () => {
  const surge = detectSurge(surgeInput({ recent: [minutesAgo(200), minutesAgo(300)] }));
  assert.equal(surge, null);
});

test('detectSurge : une flambée déjà ouverte n\'est pas redéclenchée', () => {
  const existing: Surge = {
    id: 'S-1',
    clusterId: 'CL-1',
    projectId: 'PRJ',
    startedAt: '2026-02-28T09:00:00.000Z',
    rate: 6,
    baseline: 1,
    factor: 6,
    incidentKey: 'INC-1',
    expected: false,
  };
  assert.equal(detectSurge(surgeInput({ existing })), null);
  assert.equal(detectSurge(surgeInput({ existing: { ...existing, expected: true } })), null);
});

test('detectSurge : l\'identifiant de flambée est déterministe', () => {
  const first = detectSurge(surgeInput());
  const second = detectSurge(surgeInput());
  assert.equal(first?.id, second?.id);
  assert.match(first?.id ?? '', /^[0-9a-f]{16}$/);
});

test('detectSurge : le seuil de déclenchement vient du facteur fourni', () => {
  const surge = detectSurge(surgeInput({ factor: 4 }));
  assert.equal(surge, null);
  const loose = detectSurge(surgeInput({ factor: 2 }));
  assert.ok(loose);
  assert.equal(loose?.factor, 3);
});
