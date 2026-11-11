/**
 * Tests WP-B — vocabulaire tenu (§8.3) : résolution, fusions, scission,
 * renommage et proposition de terme neuf.
 *
 * Tests déterministes, sans réseau : `node --test --experimental-strip-types`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Term, TermKind, Vocabulary } from './types.ts';
import {
  followMerge,
  normalizeLabel,
  planMerge,
  planSplit,
  renamePlan,
  resolveTermId,
  suggestNewTerm,
  termLabel,
} from './vocabulary.ts';

const NOW = '2026-11-11T08:00:00.000Z';
const PROJECT = 'PRJ-1';

/** Fabrique un terme, alias vides par défaut. */
function term(id: string, label: string, kind: TermKind = 'system', aliases: string[] = [], mergedInto: string | null = null): Term {
  return { id, projectId: PROJECT, kind, label, mergedInto, aliases, createdAt: NOW };
}

/** Vocabulaire de test : deux systèmes, deux symptômes. */
function vocab(): Vocabulary {
  return {
    systems: [
      term('sys-vpn', 'Accès distant', 'system', ['VPN', 'tunnel']),
      term('sys-impr', 'Imprimante', 'system'),
    ],
    symptoms: [
      term('sym-coupe', 'Coupure', 'symptom', ['déconnexion']),
      term('sym-lent', 'Lenteur', 'symptom'),
    ],
  };
}

// --- Normalisation et résolution (§8.3) ------------------------------------

test('la normalisation ignore casse, accents et espaces', () => {
  assert.equal(normalizeLabel('  Accès   Distant '), 'acces distant');
  assert.equal(normalizeLabel('ÉCRAN'), 'ecran');
  assert.equal(normalizeLabel(null), '');
});

test('resolveTermId trouve le libellé exact, quelle que soit la graphie', () => {
  const v = vocab();
  assert.equal(resolveTermId(v, 'system', 'Accès distant'), 'sys-vpn');
  assert.equal(resolveTermId(v, 'system', 'acces   distant'), 'sys-vpn');
  assert.equal(resolveTermId(v, 'system', 'ACCÈS DISTANT'), 'sys-vpn');
  assert.equal(resolveTermId(v, 'symptom', 'Coupure'), 'sym-coupe');
});

test('resolveTermId retombe sur les alias', () => {
  const v = vocab();
  assert.equal(resolveTermId(v, 'system', 'vpn'), 'sys-vpn');
  assert.equal(resolveTermId(v, 'symptom', 'Déconnexion'), 'sym-coupe');
});

test('resolveTermId rend null pour un terme inconnu', () => {
  const v = vocab();
  assert.equal(resolveTermId(v, 'system', 'facture'), null);
  assert.equal(resolveTermId(v, 'symptom', ''), null);
});

test('resolveTermId ne confond pas les natures de terme', () => {
  const v = vocab();
  assert.equal(resolveTermId(v, 'symptom', 'Imprimante'), null);
});

// --- Chaîne de fusions et cycles (§8.3, §18) -------------------------------

test('followMerge suit une chaîne de trois termes', () => {
  const terms = [
    term('a', 'A', 'system', [], 'b'),
    term('b', 'B', 'system', [], 'c'),
    term('c', 'C', 'system'),
  ];
  assert.equal(followMerge(terms, 'a'), 'c');
  assert.equal(followMerge(terms, 'b'), 'c');
  assert.equal(followMerge(terms, 'c'), 'c');
});

test('followMerge détecte un cycle sans boucle infinie', () => {
  const terms = [
    term('a', 'A', 'system', [], 'b'),
    term('b', 'B', 'system', [], 'a'),
  ];
  assert.equal(followMerge(terms, 'a'), 'a');
  assert.equal(followMerge(terms, 'b'), 'b');
});

test('followMerge rend l’identifiant inconnu tel quel', () => {
  assert.equal(followMerge([term('a', 'A')], 'zzz'), 'zzz');
});

test('resolveTermId suit la fusion : le libellé du terme absorbé rend le survivant', () => {
  const v: Vocabulary = {
    systems: [
      term('sys-vpn', 'Accès distant', 'system', [], 'sys-reseau'),
      term('sys-reseau', 'Réseau', 'system', ['accès distant']),
    ],
    symptoms: [],
  };
  assert.equal(resolveTermId(v, 'system', 'Accès distant'), 'sys-reseau');
  assert.equal(termLabel(v, 'system', 'sys-vpn'), 'Réseau');
});

// --- Fusion, scission, renommage (§8.3) ------------------------------------

test('planMerge marque mergedInto sur tous sauf le terme conservé', () => {
  const terms = [
    term('sys-vpn', 'Accès distant', 'system', ['VPN']),
    term('sys-tunnel', 'Tunnel', 'system', ['IPsec']),
    term('sys-impr', 'Imprimante', 'system'),
  ];
  const planned = planMerge(terms, ['sys-vpn', 'sys-tunnel'], 'sys-vpn');
  const byId = new Map(planned.map((t) => [t.id, t]));
  assert.equal(byId.get('sys-vpn')?.mergedInto, null);
  assert.equal(byId.get('sys-tunnel')?.mergedInto, 'sys-vpn');
  assert.equal(byId.get('sys-impr')?.mergedInto, null);
  assert.equal(planned.length, 3);
});

test('planMerge fusionne les alias sur le terme conservé', () => {
  const terms = [
    term('sys-vpn', 'Accès distant', 'system', ['VPN']),
    term('sys-tunnel', 'Tunnel', 'system', ['IPsec']),
  ];
  const [kept] = planMerge(terms, ['sys-tunnel', 'sys-vpn'], 'sys-vpn');
  assert.ok(kept);
  assert.deepEqual(kept?.aliases, ['IPsec', 'Tunnel', 'VPN']);
  assert.equal(kept?.label, 'Accès distant');
});

test('planMerge ne recalcule rien : seuls des termes sont rendus', () => {
  const terms = [term('a', 'A'), term('b', 'B')];
  const planned = planMerge(terms, ['a', 'b'], 'a');
  assert.deepEqual(
    Object.keys(planned[0] ?? {}).sort(),
    ['aliases', 'createdAt', 'id', 'kind', 'label', 'mergedInto', 'projectId'],
  );
});

test('planSplit crée un terme neuf et garde l’ancien intact', () => {
  const original = term('sym-coupe', 'Coupure', 'symptom', ['déconnexion']);
  const { kept, created } = planSplit(original, 'Coupure après mise à jour', NOW);
  assert.equal(kept.id, 'sym-coupe');
  assert.equal(kept.label, 'Coupure');
  assert.deepEqual(kept.aliases, ['déconnexion']);
  assert.notEqual(created.id, kept.id);
  assert.equal(created.label, 'Coupure après mise à jour');
  assert.equal(created.kind, 'symptom');
  assert.equal(created.projectId, PROJECT);
  assert.equal(created.mergedInto, null);
  assert.deepEqual(created.aliases, []);
  assert.equal(created.createdAt, NOW);
});

test('renamePlan ajoute l’ancien libellé aux alias', () => {
  const renamed = renamePlan(term('sys-vpn', 'Accès distant', 'system', ['VPN']), 'Accès à distance');
  assert.equal(renamed.label, 'Accès à distance');
  assert.deepEqual(renamed.aliases, ['Accès distant', 'VPN']);
  assert.equal(renamed.id, 'sys-vpn');
});

test('suggestNewTerm propose un terme neuf, jamais un compteur', () => {
  const suggested = suggestNewTerm(PROJECT, 'symptom', '  Facture en double  ', NOW);
  assert.equal(suggested.label, 'Facture en double');
  assert.equal(suggested.kind, 'symptom');
  assert.equal(suggested.projectId, PROJECT);
  assert.equal(suggested.createdAt, NOW);
  assert.equal(suggested.mergedInto, null);
  assert.deepEqual(suggested.aliases, []);
  assert.match(suggested.id, /^term_[0-9a-f]{12}$/);
});

test('suggestNewTerm est déterministe : mêmes entrées, même identifiant', () => {
  const a = suggestNewTerm(PROJECT, 'system', 'Imprimante', NOW);
  const b = suggestNewTerm(PROJECT, 'system', 'imprimante', NOW);
  const c = suggestNewTerm(PROJECT, 'system', 'Imprimante', '2026-11-12T08:00:00.000Z');
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

// --- Libellé courant -------------------------------------------------------

test('termLabel rend le libellé, ou une chaîne vide si le terme est inconnu', () => {
  const v = vocab();
  assert.equal(termLabel(v, 'system', 'sys-impr'), 'Imprimante');
  assert.equal(termLabel(v, 'symptom', 'sym-lent'), 'Lenteur');
  assert.equal(termLabel(v, 'system', 'inconnu'), '');
});
