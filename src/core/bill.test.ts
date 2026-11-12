/**
 * Tests de l'addition (§9) : heures, personnes, organisations, euros, tendance
 * et fusion. Déterministes : aucune horloge, aucune I/O, dates fixes.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { aggregateIssueContext, computeBill, computeTrend, hoursOf, mergeBills } from './bill';
import type { BillInput, BillMeToo, BillTicket } from './bill';
import { DEFAULT_MINUTES_PER_TOUCH } from './constants';
import type { ProblemBill } from './types';

const NOW = '2026-11-11T09:00:00.000Z';

/** Ticket type : deux interventions, rien de saisi, visible. */
function ticket(overrides: Partial<BillTicket> = {}): BillTicket {
  return {
    issueId: 'PRJ-1',
    reporter: 'u1',
    organization: null,
    loggedSeconds: null,
    touches: 2,
    reopened: false,
    escalated: false,
    slaBreached: false,
    visible: true,
    ...overrides,
  };
}

/** Entrées d'addition type : rien dedans, tout vient des surcharges. */
function billInput(overrides: Partial<BillInput> = {}): BillInput {
  return {
    problemId: 'PRB-1',
    period: '30d',
    tickets: [],
    meToo: [],
    minutesPerTouch: DEFAULT_MINUTES_PER_TOUCH,
    hourRateEur: null,
    now: NOW,
    ...overrides,
  };
}

/** Addition type, pour les tests de tendance et de fusion. */
function bill(overrides: Partial<ProblemBill> = {}): ProblemBill {
  return {
    problemId: 'PRB-1',
    period: '30d',
    tickets: 0,
    hours: 0,
    people: 0,
    orgs: 0,
    slaBreaches: 0,
    reopens: 0,
    escalations: 0,
    meToo: 0,
    hoursMethod: 'touches',
    minutesPerTouch: DEFAULT_MINUTES_PER_TOUCH,
    eur: null,
    hourRateEur: null,
    hiddenCount: 0,
    computedAt: NOW,
    ...overrides,
  };
}

const ME_TOO: BillMeToo = { accountId: 'u9', organization: null };

test('§9 heures : temps saisi quand chaque ticket en porte', () => {
  const result = hoursOf(
    [ticket({ loggedSeconds: 3600 }), ticket({ issueId: 'PRJ-2', loggedSeconds: 1800 })],
    10,
  );
  assert.equal(result.method, 'logged');
  assert.equal(result.hours, 1.5);
});

test('§9 heures : estimation par interventions quand rien n’est saisi', () => {
  const result = hoursOf([ticket({ touches: 3 }), ticket({ issueId: 'PRJ-2', touches: 6 })], 10);
  assert.equal(result.method, 'touches');
  assert.equal(result.hours, 1.5);
});

test('§9 heures mixtes : chaque ticket compte à sa façon', () => {
  const result = hoursOf(
    [ticket({ loggedSeconds: 3600, touches: 99 }), ticket({ issueId: 'PRJ-2', touches: 6 })],
    10,
  );
  assert.equal(result.method, 'mixed');
  assert.equal(result.hours, 2);
});

test('§9 la durée moyenne réglable change le chiffre', () => {
  assert.equal(hoursOf([ticket({ touches: 3 })], 20).hours, 1);
  assert.equal(hoursOf([ticket({ touches: 3 })], 30).hours, 1.5);
});

test('§9 aucun ticket : 0 h, méthode la plus sûre', () => {
  const result = hoursOf([], 10);
  assert.equal(result.hours, 0);
  assert.equal(result.method, 'logged');
});

test('§9 addition : tickets, heures, drapeaux et période', () => {
  const result = computeBill(
    billInput({
      period: '90d',
      tickets: [
        ticket({ loggedSeconds: 7200, slaBreached: true }),
        ticket({ issueId: 'PRJ-2', reporter: 'u2', loggedSeconds: 3600, reopened: true }),
        ticket({ issueId: 'PRJ-3', reporter: 'u3', loggedSeconds: 3600, reopened: true, escalated: true }),
      ],
      minutesPerTouch: 10,
    }),
  );
  assert.equal(result.problemId, 'PRB-1');
  assert.equal(result.period, '90d');
  assert.equal(result.tickets, 3);
  assert.equal(result.hours, 4);
  assert.equal(result.hoursMethod, 'logged');
  assert.equal(result.slaBreaches, 1);
  assert.equal(result.reopens, 2);
  assert.equal(result.escalations, 1);
  assert.equal(result.computedAt, NOW);
});

test('§18 personnes : demandeurs distincts plus « moi aussi », sans double compte', () => {
  const result = computeBill(
    billInput({
      tickets: [
        ticket({ reporter: 'u1' }),
        ticket({ issueId: 'PRJ-2', reporter: 'u2' }),
        ticket({ issueId: 'PRJ-3', reporter: 'u1' }),
      ],
      meToo: [
        { accountId: 'u1', organization: null },
        { accountId: 'u3', organization: null },
        { accountId: 'U3', organization: null },
      ],
    }),
  );
  assert.equal(result.people, 3);
  assert.equal(result.meToo, 3);
});

test('§9 organisations distinctes, « moi aussi » compris', () => {
  const result = computeBill(
    billInput({
      tickets: [
        ticket({ organization: 'Acme' }),
        ticket({ issueId: 'PRJ-2', reporter: 'u2', organization: 'acme ' }),
        ticket({ issueId: 'PRJ-3', reporter: 'u3', organization: null }),
      ],
      meToo: [{ accountId: 'u4', organization: 'Globex' }, ME_TOO],
    }),
  );
  assert.equal(result.orgs, 2);
});

test('§9 euros : heures × taux, taux recopié pour afficher la méthode (§17)', () => {
  const withRate = computeBill(
    billInput({ tickets: [ticket({ touches: 12 })], hourRateEur: 60 }),
  );
  assert.equal(withRate.hours, 2);
  assert.equal(withRate.eur, 120);
  assert.equal(withRate.hourRateEur, 60);
  assert.equal(withRate.minutesPerTouch, DEFAULT_MINUTES_PER_TOUCH);
});

test('§9 euros : null tant que le taux n’est pas saisi', () => {
  const withoutRate = computeBill(billInput({ tickets: [ticket({ touches: 12 })] }));
  assert.equal(withoutRate.eur, null);
  assert.equal(withoutRate.hourRateEur, null);
});

test('PC-13 tickets masqués : comptés dans l’addition, jamais listés', () => {
  const result = computeBill(
    billInput({
      tickets: [
        ticket({ loggedSeconds: 3600 }),
        ticket({ issueId: 'PRJ-2', reporter: 'u2', loggedSeconds: 3600, visible: false }),
      ],
      meToo: [ME_TOO],
    }),
  );
  assert.equal(result.tickets, 2);
  assert.equal(result.hours, 2);
  assert.equal(result.people, 3);
  assert.equal(result.hiddenCount, 1);
});

test('§19.6 retirer un ticket diminue l’addition d’autant', () => {
  const three = [
    ticket({ loggedSeconds: 3600, slaBreached: true }),
    ticket({ issueId: 'PRJ-2', reporter: 'u2', loggedSeconds: 7200 }),
    ticket({ issueId: 'PRJ-3', reporter: 'u3', loggedSeconds: 1800, visible: false }),
  ];
  const before = computeBill(billInput({ tickets: three, meToo: [ME_TOO] }));
  const after = computeBill(billInput({ tickets: three.slice(0, 2), meToo: [ME_TOO] }));
  assert.equal(before.hours - after.hours, 0.5);
  assert.equal(before.tickets - after.tickets, 1);
  assert.equal(before.people - after.people, 1);
  assert.equal(before.hiddenCount - after.hiddenCount, 1);
});

test('§9 tendance : hausse, baisse et stabilité sous 5 %', () => {
  const up = computeTrend(bill({ tickets: 10 }), bill({ tickets: 15 }));
  assert.equal(up.direction, 'up');
  assert.equal(up.deltaPercent, 50);
  const down = computeTrend(bill({ tickets: 20 }), bill({ tickets: 10 }));
  assert.equal(down.direction, 'down');
  assert.equal(down.deltaPercent, -50);
  const flat = computeTrend(bill({ tickets: 100 }), bill({ tickets: 102 }));
  assert.equal(flat.direction, 'flat');
  assert.equal(flat.deltaPercent, 2);
});

test('§9 tendance : période précédente absente ou vide, pourcentage impossible', () => {
  const noHistory = computeTrend(null, bill({ tickets: 4 }));
  assert.equal(noHistory.previous, 0);
  assert.equal(noHistory.current, 4);
  assert.equal(noHistory.deltaPercent, null);
  assert.equal(noHistory.direction, 'up');
  const emptyBefore = computeTrend(bill({ tickets: 0 }), bill({ tickets: 0 }));
  assert.equal(emptyBefore.deltaPercent, null);
  assert.equal(emptyBefore.direction, 'flat');
});

test('§18 fusion : les postes s’additionnent, les personnes ne se cumulent pas', () => {
  const merged = mergeBills([
    bill({ problemId: 'PRB-1', tickets: 7, hours: 12.5, people: 9, orgs: 2, slaBreaches: 1, reopens: 2, hiddenCount: 1 }),
    bill({ problemId: 'PRB-2', tickets: 4, hours: 3, people: 5, orgs: 3, escalations: 1, meToo: 6, hiddenCount: 2 }),
  ]);
  assert.equal(merged.problemId, 'PRB-1');
  assert.equal(merged.tickets, 11);
  assert.equal(merged.hours, 15.5);
  assert.equal(merged.people, 9);
  assert.equal(merged.orgs, 5);
  assert.equal(merged.slaBreaches, 1);
  assert.equal(merged.reopens, 2);
  assert.equal(merged.escalations, 1);
  assert.equal(merged.meToo, 6);
  assert.equal(merged.hiddenCount, 3);
});

test('§17 fusion : méthode forcée à « mixte », euros recalculés au taux connu', () => {
  const merged = mergeBills([
    bill({ hours: 2, hoursMethod: 'logged', hourRateEur: null }),
    bill({ hours: 3, hoursMethod: 'touches', hourRateEur: 40 }),
  ]);
  assert.equal(merged.hoursMethod, 'mixed');
  assert.equal(merged.hourRateEur, 40);
  assert.equal(merged.eur, 200);
  const noRate = mergeBills([bill({ hours: 2 }), bill({ hours: 3 })]);
  assert.equal(noRate.eur, null);
});

test('§18 fusion : rien à fusionner rend une addition vide', () => {
  const merged = mergeBills([]);
  assert.equal(merged.tickets, 0);
  assert.equal(merged.hours, 0);
  assert.equal(merged.people, 0);
  assert.equal(merged.minutesPerTouch, DEFAULT_MINUTES_PER_TOUCH);
});

test('§18 contexte développeur : heures additionnées, personnes au maximum', () => {
  const totals = aggregateIssueContext([
    bill({ hours: 61, people: 38 }),
    bill({ hours: 12, people: 7 }),
  ]);
  assert.equal(totals.hoursPerMonth, 73);
  // Une personne touchée par deux problèmes liés ne compte pas deux fois.
  assert.equal(totals.people, 38);
});

test('§18 contexte développeur : additions manquantes ignorées, liste vide à zéro', () => {
  const trous = aggregateIssueContext([null, bill({ hours: 4, people: 3 }), undefined]);
  assert.deepEqual(trous, { hoursPerMonth: 4, people: 3 });
  assert.deepEqual(aggregateIssueContext([]), { hoursPerMonth: 0, people: 0 });
});
