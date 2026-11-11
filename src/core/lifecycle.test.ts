/**
 * Tests du cycle de vie (§5) et de la surveillance (§7.4, §7.5).
 * Déterministes : dates fixes, aucune horloge, aucune I/O.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  canTransition,
  detectRegression,
  nextState,
  startWatching,
  watchElapsed,
  watchWindow,
} from './lifecycle.ts';
import { addDays } from './time.ts';
import { defaultSettings } from './types.ts';
import type { Problem, Settings } from './types.ts';

const NOW = '2026-11-01T08:00:00.000Z';
const SETTINGS: Settings = { ...defaultSettings('PROJ', 'PRJ'), watchDays: 14 };

/** Problème type : corrigé le 1er novembre, rien d’autre de renseigné. */
function problem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'PRB-12',
    projectId: 'PROJ',
    projectKey: 'PRJ',
    issueKey: 'PRJ-12',
    clusterId: 'CL-1',
    systemId: 'sys-vpn',
    symptomId: 'sym-coupe',
    triggerText: 'acces distant coupe',
    state: 'fixed',
    cause: null,
    workaround: null,
    workaroundUrl: null,
    fixIssueKey: null,
    fixedAt: null,
    watchUntil: null,
    regression: false,
    publishedToPortal: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test('§5 parcours complet : suspect jusqu’à vérifié', () => {
  assert.equal(nextState('suspect', 'confirm'), 'confirmed');
  assert.equal(nextState('confirmed', 'set-cause'), 'cause-known');
  assert.equal(nextState('cause-known', 'publish-workaround'), 'workaround-published');
  assert.equal(nextState('workaround-published', 'deliver-fix'), 'fixed');
  assert.equal(nextState('fixed', 'watch-elapsed'), 'verified');
});

test('§5 événement inapplicable : l’état ne bouge pas', () => {
  assert.equal(nextState('suspect', 'deliver-fix'), 'suspect');
  assert.equal(nextState('confirmed', 'watch-elapsed'), 'confirmed');
  assert.equal(nextState('fixed', 'set-cause'), 'fixed');
  assert.equal(nextState('verified', 'confirm'), 'verified');
});

test('§7.5 corrigé ou vérifié + nouveau ticket : régression', () => {
  assert.equal(nextState('fixed', 'new-ticket'), 'regression');
  assert.equal(nextState('verified', 'new-ticket'), 'regression');
  assert.equal(nextState('suspect', 'new-ticket'), 'suspect');
  assert.equal(nextState('confirmed', 'new-ticket'), 'confirmed');
});

test('§5 régression : retour à confirmé', () => {
  assert.equal(nextState('regression', 'new-ticket'), 'confirmed');
  assert.equal(nextState('regression', 'confirm'), 'confirmed');
  assert.equal(nextState('regression', 'deliver-fix'), 'regression');
});

test('§7.4 clôture et réouverture décidées par un humain', () => {
  assert.equal(nextState('fixed', 'close'), 'verified');
  assert.equal(nextState('verified', 'reopen'), 'confirmed');
  assert.equal(nextState('suspect', 'close'), 'suspect');
});

test('§5 transitions autorisées et refusées', () => {
  assert.equal(canTransition('suspect', 'confirmed'), true);
  assert.equal(canTransition('fixed', 'verified'), true);
  assert.equal(canTransition('fixed', 'regression'), true);
  assert.equal(canTransition('suspect', 'fixed'), false);
  assert.equal(canTransition('confirmed', 'suspect'), false);
  assert.equal(canTransition('verified', 'verified'), false);
  assert.equal(canTransition('verified', 'regression'), true);
});

test('§7.4 fenêtre de surveillance : correction plus les jours réglés', () => {
  assert.equal(watchWindow(NOW, 14), addDays(NOW, 14));
  assert.equal(watchWindow(NOW, 0), NOW);
});

test('§7.4 début de surveillance : état corrigé, dates renseignées', () => {
  const watching = startWatching(problem({ state: 'workaround-published' }), SETTINGS, NOW);
  assert.equal(watching.state, 'fixed');
  assert.equal(watching.fixedAt, NOW);
  assert.equal(watching.watchUntil, addDays(NOW, 14));
  assert.equal(watching.updatedAt, NOW);
  assert.equal(watching.issueKey, 'PRJ-12');
});

test('§7.5 régression au neuvième jour, dans la fenêtre de quatorze jours', () => {
  const watching = startWatching(problem(), SETTINGS, NOW);
  const dayNine = addDays(NOW, 9);
  assert.equal(detectRegression(watching, dayNine), true);
  assert.equal(watchElapsed(watching, dayNine), false);
  assert.equal(nextState(watching.state, 'new-ticket'), 'regression');
  assert.equal(nextState('regression', 'new-ticket'), 'confirmed');
});

test('§7.5 pas de régression avant la correction, ni sans date de correction', () => {
  const watching = startWatching(problem(), SETTINGS, NOW);
  assert.equal(detectRegression(watching, addDays(NOW, -1)), false);
  assert.equal(detectRegression(watching, NOW), false);
  assert.equal(detectRegression(problem({ state: 'suspect', fixedAt: NOW }), addDays(NOW, 3)), false);
  assert.equal(detectRegression(problem({ state: 'fixed', fixedAt: null }), addDays(NOW, 3)), false);
  assert.equal(detectRegression(problem({ state: 'verified', fixedAt: NOW }), addDays(NOW, 30)), true);
});

test('§7.4 surveillance écoulée : le problème passe à vérifié', () => {
  const watching = startWatching(problem(), SETTINGS, NOW);
  const dayFifteen = addDays(NOW, 15);
  assert.equal(watchElapsed(watching, dayFifteen), true);
  assert.equal(watchElapsed(watching, addDays(NOW, 14)), true);
  assert.equal(nextState(watching.state, 'watch-elapsed'), 'verified');
  assert.equal(watchElapsed(problem({ state: 'verified', watchUntil: NOW }), dayFifteen), false);
  assert.equal(watchElapsed(problem({ state: 'fixed', watchUntil: null }), dayFifteen), false);
});
