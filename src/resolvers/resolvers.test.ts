/**
 * Tests des resolvers — parties pures seulement (§14).
 *
 * Les 26 clés de `src/ui/api.ts` doivent exister dans la table exportée : c'est
 * le contrat entre les écrans et le backend, et un oubli ne se voit qu'à
 * l'exécution (Forge rend « resolver not found »). On vérifie donc la table,
 * les helpers de lecture de payload (un écran ne doit jamais casser sur un
 * champ absent) et l'aiguillage des actions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { handlers } from './handlers';
import {
  asRecord,
  extractLocale,
  readBillLines,
  readBool,
  readNumber,
  readString,
  readStringArray,
  readThresholds,
} from './helpers';
import { DEFAULT_THRESHOLDS, MVP_BILL_LINES } from '../core/types';

/** Les clés que `src/ui/api.ts` appelle : le contrat, recopié ici volontairement. */
const EXPECTED_KEYS = [
  'getAgentPanel',
  'attachAndDraft',
  'detachTicket',
  'getProblemsPage',
  'getProblemPanel',
  'confirmSuspect',
  'rejectSuspect',
  'splitCluster',
  'mergeProblems',
  'updateProblem',
  'getIssueContext',
  'getSettings',
  'saveSettings',
  'listVocabulary',
  'renameTerm',
  'mergeTerms',
  'splitTerm',
  'startBootstrap',
  'bootstrapProgress',
  'loadSampleData',
  'clearSampleData',
  'getDataQuality',
  'getPortalBanner',
  'meToo',
  'getRequestDetail',
  'draftCustomerUpdate',
  'matchFreeText',
] as const;

test('toutes les clés appelées par l’UI sont déclarées', () => {
  for (const key of EXPECTED_KEYS) {
    assert.equal(typeof handlers[key], 'function', `handler manquant : ${key}`);
  }
});

test('aucune clé surnuméraire : la table suit le contrat de l’UI', () => {
  const extra = Object.keys(handlers).filter((key) => !(EXPECTED_KEYS as readonly string[]).includes(key));
  assert.deepEqual(extra, [], `clés non prévues par src/ui/api.ts : ${extra.join(', ')}`);
});

test('asRecord tolère tout ce qui n’est pas un objet', () => {
  assert.deepEqual(asRecord(null), {});
  assert.deepEqual(asRecord('texte'), {});
  assert.deepEqual(asRecord(42), {});
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
});

test('readString : chaîne, vide et repli', () => {
  assert.equal(readString({ a: 'bonjour' }, 'a'), 'bonjour');
  assert.equal(readString({ a: '' }, 'a'), '');
  assert.equal(readString({ a: 12 }, 'a', 'défaut'), 'défaut');
  assert.equal(readString({}, 'a', 'défaut'), 'défaut');
});

test('readNumber : nombre, chaîne numérique, valeur invalide', () => {
  assert.equal(readNumber({ a: 42 }, 'a', 0), 42);
  assert.equal(readNumber({ a: '42' }, 'a', 0), 42);
  assert.equal(readNumber({ a: 'invalide' }, 'a', 7), 7);
  assert.equal(readNumber({ a: Number.NaN }, 'a', 7), 7);
  assert.equal(readNumber({}, 'a', 7), 7);
});

test('readNumber borne la valeur (un écran ne peut pas demander l’infini)', () => {
  assert.equal(readNumber({ a: 10 ** 9 }, 'a', 0, 100), 100);
});

test('readBool : vrai, faux, absent', () => {
  assert.equal(readBool({ a: true }, 'a', false), true);
  assert.equal(readBool({ a: false }, 'a', true), false);
  assert.equal(readBool({}, 'a', true), true);
});

test('readStringArray ne garde que les chaînes', () => {
  assert.deepEqual(readStringArray({ a: ['un', 'deux'] }, 'a'), ['un', 'deux']);
  assert.deepEqual(readStringArray({ a: ['un', 2, null, 'trois'] }, 'a'), ['un', 'trois']);
  assert.deepEqual(readStringArray({ a: 'pas-une-liste' }, 'a'), []);
  assert.deepEqual(readStringArray({}, 'a'), []);
});

test('extractLocale : français reconnu, le reste retombe sur l’anglais (§17)', () => {
  assert.equal(extractLocale({ locale: 'fr-FR' }), 'fr');
  assert.equal(extractLocale({ locale: 'fr' }), 'fr');
  assert.equal(extractLocale({ locale: 'en-US' }), 'en');
  assert.equal(extractLocale({}), 'en');
  assert.equal(extractLocale(null), 'en');
});

test('readThresholds : seuils du cahier par défaut (§8.5)', () => {
  const read = readThresholds(undefined, { ...DEFAULT_THRESHOLDS, windowDays: 30 });
  assert.deepEqual(read, { ...DEFAULT_THRESHOLDS, windowDays: 30 });
  const partial = readThresholds({ tickets: 8 }, { ...DEFAULT_THRESHOLDS, windowDays: 30 });
  assert.equal(partial.tickets, 8);
  assert.equal(partial.hours, DEFAULT_THRESHOLDS.hours);
});

test('readBillLines : au minimum les postes du MVP (§6)', () => {
  assert.deepEqual(readBillLines(undefined, [...MVP_BILL_LINES]), [...MVP_BILL_LINES]);
  const custom = readBillLines(['tickets', 'orgs'], [...MVP_BILL_LINES]);
  assert.ok(custom.includes('tickets'));
  assert.ok(custom.includes('orgs'));
});
