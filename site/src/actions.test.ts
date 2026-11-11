/**
 * Tests des interactions de la démonstration (`actions.ts`).
 *
 * On y vérifie les points de recette du cahier qui sont visibles sur le site :
 * confirmation d'une grappe en problème unique (§7.1, §19.3), retrait d'un
 * ticket qui diminue l'addition d'autant (§19.6), « moi aussi » qui compte une
 * personne sans créer de ticket (§7.3), rejet qui ne reproposera plus la grappe,
 * et reconnaissance d'un texte libre (§8.4, §19.10).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMeToo,
  confirmSuspect,
  detachTicket,
  matchText,
  rejectSuspect,
  withLocale,
  withPeriod,
} from './actions';
import { buildDemoState } from './build';

const etat = buildDemoState('fr');

/** Grappe la plus coûteuse qui n'est pas encore un problème. */
function suspect() {
  return etat.clusters.find((c) => c.status === 'suspect' && c.tickets.length >= 2)!;
}

test('confirmer une grappe crée un ticket de problème unique et lie les tickets (§7.1)', () => {
  const cible = suspect();
  const apres = confirmSuspect(etat, cible.id, []);
  const confirmee = apres.clusters.find((c) => c.id === cible.id)!;
  assert.ok(confirmee.problem, 'aucun problème créé');
  assert.match(confirmee.problem!.key, /^PRB-\d+$/);
  assert.equal(confirmee.status, 'problem');
  assert.equal(confirmee.tickets.length, cible.tickets.length, 'tickets perdus à la confirmation');
});

test('confirmer en retirant des tickets ne lie que ceux qui restent (§7.1 étape 4)', () => {
  const cible = suspect();
  const retire = cible.tickets[0]!.issueKey;
  const apres = confirmSuspect(etat, cible.id, [retire]);
  const confirmee = apres.clusters.find((c) => c.id === cible.id)!;
  assert.equal(confirmee.tickets.length, cible.tickets.length - 1);
  assert.ok(!confirmee.tickets.some((t) => t.issueKey === retire));
  assert.ok(confirmee.bill30.tickets <= cible.bill30.tickets, 'l’addition n’a pas diminué');
});

test('retirer un ticket diminue l’addition d’autant (§19.6)', () => {
  const cible = etat.clusters.find((c) => c.tickets.length >= 3)!;
  const avant = cible.bill90.tickets;
  const apres = detachTicket(etat, cible.id, cible.tickets[0]!.issueKey);
  const modifiee = apres.clusters.find((c) => c.id === cible.id)!;
  assert.equal(modifiee.bill90.tickets, avant - 1);
  assert.equal(modifiee.tickets.length, cible.tickets.length - 1);
});

test('rejeter une grappe la sort des propositions (§7.1)', () => {
  const cible = suspect();
  const apres = rejectSuspect(etat, cible.id);
  const rejetee = apres.clusters.find((c) => c.id === cible.id)!;
  assert.equal(rejetee.status, 'dismissed');
  assert.equal(apres.totals.suspects, etat.totals.suspects - 1);
});

test('« moi aussi » compte une personne sans créer de ticket (§7.3, PC-16)', () => {
  const cible = etat.clusters.find((c) => c.problem !== null)!;
  const avant = cible.bill30.people;
  const ticketsAvant = cible.bill30.tickets;
  const apres = addMeToo(etat, cible.id, 'Lucas Testeur', 'Groupe Lumière');
  const modifiee = apres.clusters.find((c) => c.id === cible.id)!;
  assert.equal(modifiee.problem!.meToo.length, cible.problem!.meToo.length + 1);
  assert.equal(modifiee.bill30.tickets, ticketsAvant, 'un « moi aussi » ne crée pas de ticket');
  assert.ok(modifiee.bill30.people >= avant, 'la personne n’est pas comptée');
});

test('reconnaître un texte libre retrouve la bonne grappe (§8.4, §19.10)', () => {
  const resultat = matchText(etat, 'Mon accès distant coupe toutes les dix minutes depuis la mise à jour du poste.');
  assert.ok(resultat.cluster, 'aucune grappe reconnue');
  assert.equal(resultat.cluster!.tickets[0]!.group, 'remote-access');
  assert.ok(['high', 'medium'].includes(resultat.confidence));
  assert.ok(resultat.rationale.length > 10, 'justification absente (§17)');
  assert.equal(resultat.usedDemoComparator, true, 'le comparateur de démo doit être signalé');
});

test('un texte sans rapport n’est rattaché à rien (§19.5)', () => {
  const resultat = matchText(etat, 'Commande de deux souris sans fil pour le poste de la comptabilité.');
  assert.equal(resultat.cluster, null);
  assert.equal(resultat.confidence, 'low');
  assert.equal(resultat.auto, false);
});

test('un texte vide ne déclenche aucun rattachement d’office (§18)', () => {
  const resultat = matchText(etat, '   ');
  assert.equal(resultat.cluster, null);
  assert.equal(resultat.auto, false);
});

test('la réponse proposée n’est qu’un brouillon, jamais un envoi (§6, §17)', () => {
  const resultat = matchText(etat, 'Le VPN se déconnecte sans arrêt depuis la mise à jour de mon PC.');
  if (resultat.proposedAnswer !== null) {
    assert.ok(resultat.proposedAnswer.length > 20);
    assert.ok(!/envoyé|sent automatically/i.test(resultat.proposedAnswer));
  }
  assert.equal(typeof resultat.auto, 'boolean');
});

test('changer de période bascule l’addition affichée (§9)', () => {
  const apres = withPeriod(etat, '90d');
  assert.equal(apres.period, '90d');
  assert.equal(etat.period, '30d', 'l’état précédent ne doit pas être muté');
});

test('changer de langue rend un état dans l’autre langue (§17)', () => {
  const anglais = withLocale(etat, 'en');
  assert.equal(anglais.locale, 'en');
  assert.equal(anglais.tickets.length, etat.tickets.length);
  const probleme = anglais.clusters.find((c) => c.problem !== null);
  assert.ok(probleme!.problem!.workaround!.length > 10);
});

test('les interactions ne mutent jamais l’état reçu (rendu prévisible)', () => {
  const avant = JSON.stringify(etat.clusters.map((c) => [c.id, c.status, c.tickets.length]));
  confirmSuspect(etat, suspect().id, []);
  rejectSuspect(etat, suspect().id);
  addMeToo(etat, etat.clusters.find((c) => c.problem)!.id, 'X', null);
  assert.equal(JSON.stringify(etat.clusters.map((c) => [c.id, c.status, c.tickets.length])), avant);
});
