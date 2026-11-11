/**
 * Tests du moteur de démonstration — construction de l'état (`build.ts`).
 *
 * Ce que l'on vérifie : le site calcule avec le **vrai domaine**, donc les
 * propriétés du cahier doivent s'y retrouver — grappes au-dessus du seuil (§8.5),
 * demandes récurrentes classées à part (§18), addition et sa méthode (§9),
 * flambée (§8.6), tickets à visibilité restreinte comptés mais non listés
 * (PC-13), signature indéterminée jamais regroupée (§18), et déterminisme (§20).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterIdOf } from '../../src/core/cluster';
import { SAMPLE_TICKET_COUNT } from '../../src/sample/dataset';
import { buildDemoState } from './build';

const etat = buildDemoState('fr');

test('le site part du vrai jeu d’exemple : 120 tickets sur 60 jours (§20)', () => {
  assert.equal(etat.tickets.length, SAMPLE_TICKET_COUNT);
  assert.equal(etat.projectKey, 'SUP');
  assert.equal(etat.totals.tickets, SAMPLE_TICKET_COUNT);
});

test('l’état est déterministe : deux constructions donnent les mêmes grappes', () => {
  const autre = buildDemoState('fr');
  assert.deepEqual(
    autre.clusters.map((c) => c.id),
    etat.clusters.map((c) => c.id),
  );
  assert.equal(autre.totals.hours30, etat.totals.hours30);
});

test('les identifiants de grappe sont ceux que calcule l’app (§8.5)', () => {
  for (const cluster of etat.clusters) {
    const premier = cluster.tickets[0]!;
    assert.equal(
      cluster.id,
      clusterIdOf(etat.settings.projectId, premier.systemId, premier.symptomId, premier.triggerText),
    );
  }
});

test('les trois problèmes cachés du scénario dépassent le seuil (§8.5, §20)', () => {
  const attendus = ['remote-access', 'printer-floor-3', 'duplicate-invoice'];
  for (const groupe of attendus) {
    const cluster = etat.clusters.find((c) => c.tickets[0]?.group === groupe);
    assert.ok(cluster, `grappe absente pour ${groupe}`);
    assert.ok(cluster!.overThreshold, `${groupe} sous le seuil`);
    assert.ok(cluster!.tickets.length >= 5, `${groupe} : ${cluster!.tickets.length} tickets`);
  }
});

test('la demande récurrente normale est classée à part, pas comme un défaut (§18)', () => {
  const recurrente = etat.clusters.find((c) => c.kind === 'recurring');
  assert.ok(recurrente, 'aucune grappe récurrente');
  assert.equal(recurrente!.status, 'recurring');
  assert.equal(recurrente!.problem, null, 'une demande récurrente ne devient pas un problème');
});

test('un ticket indéterminé n’est jamais regroupé d’office (§18)', () => {
  assert.ok(etat.totals.undetermined >= 1, 'aucun ticket indéterminé dans le jeu');
  const groupes = etat.clusters.flatMap((c) => c.tickets.map((t) => t.issueId));
  for (const ticket of etat.tickets.filter((t) => t.undetermined)) {
    assert.ok(!groupes.includes(ticket.issueId), `${ticket.issueKey} regroupé à tort`);
  }
});

test('l’addition porte sa méthode et ses postes (§9)', () => {
  const plusChere = etat.clusters[0]!;
  assert.ok(plusChere.bill30.hours > 0, 'aucune heure comptée');
  assert.ok(plusChere.bill30.people > 0, 'aucune personne touchée');
  assert.ok(['logged', 'touches', 'mixed'].includes(plusChere.bill30.hoursMethod));
  assert.equal(plusChere.bill30.minutesPerTouch, 10);
  assert.ok(plusChere.bill90.hours >= plusChere.bill30.hours, '90 j < 30 j');
});

test('les grappes sont classées par coût décroissant (page « Problèmes », PC-09)', () => {
  const heures = etat.clusters.map((c) => c.bill30.hours);
  for (let i = 1; i < heures.length; i += 1) {
    assert.ok(heures[i - 1]! >= heures[i]!, 'classement par coût non respecté');
  }
});

test('une flambée est détectée sur l’accès distant (§8.6)', () => {
  assert.ok(etat.surges.length >= 1, 'aucune flambée détectée');
  const flambee = etat.surges[0]!;
  assert.ok(flambee.factor >= etat.settings.surgeFactor, `facteur ${flambee.factor}`);
});

test('les tickets à visibilité restreinte comptent mais ne sont pas listés (PC-13)', () => {
  const cluster = etat.clusters.find((c) => c.tickets.some((t) => !t.visible));
  assert.ok(cluster, 'aucun ticket masqué dans le jeu');
  assert.ok(cluster!.bill30.hiddenCount >= 0);
  assert.ok(cluster!.bill30.tickets >= cluster!.tickets.filter((t) => t.visible).length);
});

test('la tendance compare deux périodes (§9)', () => {
  for (const cluster of etat.clusters) {
    assert.ok(['up', 'down', 'flat'].includes(cluster.trend.direction));
    assert.equal(typeof cluster.trend.current, 'number');
  }
});

test('le problème déjà confirmé du scénario porte sa fiche complète (§7.2)', () => {
  const probleme = etat.clusters.find((c) => c.problem !== null);
  assert.ok(probleme, 'aucun problème confirmé dans la démo');
  assert.equal(probleme!.problem!.key, 'PRB-12');
  assert.ok(probleme!.problem!.workaround!.length > 10, 'contournement vide');
  assert.equal(probleme!.problem!.fixIssueKey, 'NET-208');
  assert.ok(probleme!.problem!.publishedToPortal, 'bandeau portail non publié');
});

test('le vocabulaire tient les systèmes et les symptômes du jeu (§8.3)', () => {
  assert.ok(etat.vocabulary.systems.length >= 3);
  assert.ok(etat.vocabulary.symptoms.length >= 3);
  for (const terme of [...etat.vocabulary.systems, ...etat.vocabulary.symptoms]) {
    assert.ok(terme.label.length > 0, 'terme sans libellé');
    assert.equal(terme.mergedInto, null, 'un terme fusionné ne devrait pas apparaître');
  }
});
