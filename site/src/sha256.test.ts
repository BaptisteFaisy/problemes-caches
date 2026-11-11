import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash as nodeCreateHash } from 'node:crypto';
import { createHash, sha256Hex } from './sha256';

/**
 * Le site de démonstration calcule les mêmes identifiants que l'app dans Jira :
 * ces tests comparent le SHA-256 pur TypeScript à celui de `node:crypto` sur des
 * entrées variées (ASCII, accents, texte vide, texte long, multioctet).
 */

const CAS: readonly string[] = [
  '',
  'abc',
  'VPN · déconnexion · après mise à jour du poste',
  'Accès distant qui décroche au bout de quelques minutes',
  'Remote access keeps dropping every ten minutes',
  'imprimante|hors service|3e étage',
  'x'.repeat(55),   // borne du rembourrage sans octet supplémentaire
  'y'.repeat(56),   // bascule sur un bloc de rembourrage complet
  'z'.repeat(64),   // exactement un bloc
  'é'.repeat(40),   // plusieurs octets par caractère (UTF-8)
];

test('sha256Hex donne exactement l’empreinte de node:crypto', () => {
  for (const texte of CAS) {
    const attendu = nodeCreateHash('sha256').update(texte, 'utf8').digest('hex');
    assert.equal(sha256Hex(texte), attendu, `empreinte différente pour ${JSON.stringify(texte.slice(0, 24))}`);
  }
});

test('createHash imite l’API de node:crypto (update + digest hex)', () => {
  for (const texte of CAS) {
    const attendu = nodeCreateHash('sha256').update(texte, 'utf8').digest('hex');
    assert.equal(createHash('sha256').update(texte, 'utf8').digest('hex'), attendu);
  }
});

test('createHash accepte plusieurs update successifs', () => {
  const attendu = nodeCreateHash('sha256').update('grappe', 'utf8').update('|VPN', 'utf8').digest('hex');
  const obtenu = createHash('sha256').update('grappe').update('|VPN').digest('hex');
  assert.equal(obtenu, attendu);
});

test('un algorithme inconnu est refusé, pas deviné', () => {
  assert.throws(() => createHash('md5'), /md5/);
});

test('l’empreinte tronquée utilisée par clusterIdOf est stable', () => {
  const texte = 'PRJ|sys-vpn|sym-deconnexion|après mise à jour du poste';
  assert.equal(sha256Hex(texte).slice(0, 16), nodeCreateHash('sha256').update(texte, 'utf8').digest('hex').slice(0, 16));
});
