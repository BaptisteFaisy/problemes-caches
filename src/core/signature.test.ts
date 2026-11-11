/**
 * Tests WP-A — indices certains, empreinte du texte source et signature (§8.2, §18).
 *
 * Tests déterministes, sans réseau : `node --test --experimental-strip-types`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UNDETERMINED_ID } from './constants';
import {
  buildSignature,
  detectOs,
  detectVersion,
  extractErrorCodes,
  extractHardClues,
  isUndetermined,
  sourceHash,
} from './signature';
import type { HardClues } from './types';

const EMPTY_CLUES: HardClues = {
  requestType: null,
  service: null,
  component: null,
  errorCodes: [],
  product: null,
  version: null,
  os: null,
  assetIds: [],
  organization: null,
};

// --- Indices certains (§8.2 étape 1) ---------------------------------------

test('les champs fournis par la plate-forme sont repris tels quels', () => {
  const clues = extractHardClues({
    requestType: 'Incident',
    service: 'Bureautique',
    component: 'Imprimante',
    product: 'Office',
    version: 'v12.3',
    os: 'Windows 11',
    organization: 'ACME',
    assets: ['PRINTER-42'],
    text: 'Impossible d imprimer depuis le 3e étage',
  });
  assert.equal(clues.requestType, 'Incident');
  assert.equal(clues.service, 'Bureautique');
  assert.equal(clues.component, 'Imprimante');
  assert.equal(clues.product, 'Office');
  assert.equal(clues.version, 'v12.3');
  assert.equal(clues.os, 'Windows 11');
  assert.equal(clues.organization, 'ACME');
  assert.deepEqual(clues.assetIds, ['PRINTER-42']);
});

test('les champs absents ou vides valent null', () => {
  const clues = extractHardClues({ requestType: '  ', service: null, text: '' });
  assert.equal(clues.requestType, null);
  assert.equal(clues.service, null);
  assert.equal(clues.component, null);
  assert.equal(clues.product, null);
  assert.equal(clues.organization, null);
  assert.deepEqual(clues.assetIds, []);
  assert.deepEqual(clues.errorCodes, []);
});

test('les codes d’erreur sont repérés par motif', () => {
  const codes = extractErrorCodes(
    'ERR-1234 puis 0x80070005, HTTP 500, ORA-01234, EACCES, ENOENT, ' +
      'java.lang.NullPointerException, System.NullReferenceException, com.foo.Bar',
  );
  assert.ok(codes.includes('ERR-1234'));
  assert.ok(codes.includes('0x80070005'));
  assert.ok(codes.includes('HTTP 500'));
  assert.ok(codes.includes('ORA-01234'));
  assert.ok(codes.includes('EACCES'));
  assert.ok(codes.includes('ENOENT'));
  assert.ok(codes.includes('java.lang.NullPointerException'));
  assert.ok(codes.includes('System.NullReferenceException'));
  assert.ok(codes.includes('com.foo.Bar'));
});

test('deux codes d’erreur dans le même texte donnent deux entrées', () => {
  const codes = extractErrorCodes('Le poste affiche ERR-1234 puis HTTP 404 ce matin');
  assert.equal(codes.length, 2);
  assert.ok(codes.includes('ERR-1234'));
  assert.ok(codes.includes('HTTP 404'));
});

test('la liste des codes est bornée à dix entrées, triée et sans doublon', () => {
  const text = Array.from({ length: 14 }, (_, i) => `ERR-${1000 + i}`).join(' ');
  const codes = extractErrorCodes(text);
  assert.equal(codes.length, 10);
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(new Set(codes).size, codes.length);
});

test('un même code répété n’apparaît qu’une fois', () => {
  const codes = extractErrorCodes('ERR-1234 puis encore ERR-1234');
  assert.deepEqual(codes, ['ERR-1234']);
});

test('un statut HTTP est rendu de façon canonique', () => {
  assert.deepEqual(extractErrorCodes('la requête renvoie http 404'), ['HTTP 404']);
  assert.deepEqual(extractErrorCodes('erreur 503 sur le portail'), ['HTTP 503']);
});

test('la version est repérée dans le texte', () => {
  assert.equal(detectVersion('client en v12.3'), '12.3');
  assert.equal(detectVersion('version 12.3.1 installée'), '12.3.1');
  assert.equal(detectVersion('aucune version indiquée'), null);
});

test('le système d’exploitation et sa version sont repérés', () => {
  assert.equal(detectOs('sous Windows 11 uniquement'), 'Windows 11');
  assert.equal(detectOs('un macOS 14.2 lent'), 'macOS 14.2');
  assert.equal(detectOs('téléphone Android 13'), 'Android 13');
  assert.equal(detectOs('iOS 17.1 bloque'), 'iOS 17.1');
  assert.equal(detectOs('poste sous Linux'), 'Linux');
  assert.equal(detectOs('rien de connu'), null);
});

test('le texte complète les indices quand la plate-forme n’en a pas', () => {
  const clues = extractHardClues({ text: 'après mise à jour v12.3 sous Windows 11 : HTTP 500' });
  assert.equal(clues.version, '12.3');
  assert.equal(clues.os, 'Windows 11');
  assert.deepEqual(clues.errorCodes, ['HTTP 500']);
});

test('les objets d’inventaire sont triés, sans doublon et bornés à dix', () => {
  const clues = extractHardClues({
    text: '',
    assets: ['PR-9', 'PR-1', 'PR-9', ...Array.from({ length: 9 }, (_, i) => `PC-${i}`)],
  });
  assert.equal(clues.assetIds.length, 10);
  assert.deepEqual(clues.assetIds, [...clues.assetIds].sort());
  assert.equal(new Set(clues.assetIds).size, clues.assetIds.length);
});

// --- Empreinte du texte source (§8.2 étape 3) -------------------------------

test('l’empreinte du texte est stable et insensible à la casse et aux espaces', () => {
  assert.equal(sourceHash('Panne  sur  le  VPN'), sourceHash('panne sur le vpn'));
  assert.equal(sourceHash('Panne sur le VPN').length, 64);
  assert.match(sourceHash('Panne sur le VPN'), /^[0-9a-f]{64}$/);
});

test('l’empreinte change quand le texte change', () => {
  assert.notEqual(sourceHash('panne sur le vpn'), sourceHash('panne sur le wifi'));
});

test('l’empreinte ne dépend pas des espaces en trop', () => {
  assert.equal(sourceHash('  panne   sur   le vpn  '), sourceHash('panne sur le vpn'));
});

// --- Signature indéterminée (§18) ------------------------------------------

test('une signature indéterminée est repérée par son identifiant', () => {
  assert.equal(
    isUndetermined({ systemId: UNDETERMINED_ID, symptomId: 'sym-1', triggerText: 'impression en échec' }),
    true,
  );
  assert.equal(
    isUndetermined({ systemId: 'sys-1', symptomId: UNDETERMINED_ID, triggerText: 'impression en échec' }),
    true,
  );
});

test('un texte utile trop court rend la signature indéterminée', () => {
  assert.equal(isUndetermined({ systemId: 'sys-1', symptomId: 'sym-1', triggerText: 'ça va pas' }), true);
  assert.equal(isUndetermined({ systemId: 'sys-1', symptomId: 'sym-1', triggerText: '' }), true);
  assert.equal(isUndetermined({ systemId: 'sys-1', symptomId: 'sym-1', triggerText: '   panne  ' }), true);
});

test('un texte utile suffisant rend la signature déterminée', () => {
  assert.equal(
    isUndetermined({ systemId: 'sys-1', symptomId: 'sym-1', triggerText: 'impossible de imprimer au 3e étage' }),
    false,
  );
});

// --- Signature figée --------------------------------------------------------

test('la signature figée porte l’instant, l’empreinte et le tri du texte', () => {
  const signature = buildSignature(
    {
      issueId: 'ISSUE-1',
      systemId: 'sys-1',
      symptomId: 'sym-1',
      triggerText: '  Impossible   d imprimer  ',
      hardClues: EMPTY_CLUES,
      sourceText: 'Impossible d imprimer',
      language: 'fr',
    },
    '2026-11-11T08:00:00.000Z',
  );
  assert.equal(signature.issueId, 'ISSUE-1');
  assert.equal(signature.extractedAt, '2026-11-11T08:00:00.000Z');
  assert.equal(signature.triggerText, 'impossible d imprimer');
  assert.equal(signature.sourceHash, sourceHash('Impossible d imprimer'));
  assert.equal(signature.undetermined, false);
  assert.equal(signature.language, 'fr');
});

test('une signature sans langue est notée sans langue', () => {
  const signature = buildSignature(
    {
      issueId: 'ISSUE-2',
      systemId: UNDETERMINED_ID,
      symptomId: UNDETERMINED_ID,
      triggerText: 'ça ne marche pas',
      hardClues: EMPTY_CLUES,
      sourceText: 'ça ne marche pas',
    },
    '2026-11-11T08:00:00.000Z',
  );
  assert.equal(signature.undetermined, true);
  assert.equal(signature.language, null);
});
