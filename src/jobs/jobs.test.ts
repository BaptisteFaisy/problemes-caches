/**
 * Tests du lot WP-K — orchestration (`jobs.test.ts`).
 *
 * Seuls les flux **purs** sont testés ici : décisions de resoumission (§8.2),
 * rattachement d'office ou proposé (§8.4), heures d'un ticket (§9), fenêtre de
 * flambée (§8.6), découpage des périodes d'addition (§9), lots de 50 (§14) et
 * robustesse des déclencheurs face à un événement illisible (§14, PC-07).
 * Les I/O (SQL, Jira, modèle) ne sont jamais appelées : aucun test ne touche
 * la base ni le réseau.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BOOTSTRAP_BATCH, BOOTSTRAP_DAYS } from '../core/constants.ts';
import { defaultSettings } from '../core/types.ts';
import type { MatchResult, Problem, Settings, TicketFact, TicketSignature } from '../core/types.ts';
import { chunkArray } from '../platform/field.ts';
import type { JiraIssue } from '../platform/jira-types.ts';
import { attachedFor, membershipOf, parseBootstrapPayload } from './consumer.ts';
import { billForPeriod, nightlyRecalc } from './scheduled.ts';
import {
  billTicketOf,
  extractTicketText,
  followedProjectIds,
  splitSurgeDates,
  syncTicketFacts,
  registerFollowedProject,
  ticketHours,
  windowTicketsOf,
} from './sync.ts';
import { issueIdOf, issueKeyOf, issueCommented, issueCreated, issueUpdated, shouldResubmit } from './triggers.ts';

/** Réglages de test : durée moyenne d'intervention de 10 minutes (§9). */
const SETTINGS: Settings = defaultSettings('proj-1', 'SUP');

/** Fait de ticket minimal, heures et dates maîtrisées (§9, §15). */
function fact(overrides: Partial<TicketFact> = {}): TicketFact {
  return {
    issueId: '10001',
    issueKey: 'SUP-1',
    projectId: 'proj-1',
    projectKey: 'SUP',
    requestType: null,
    service: null,
    component: null,
    reporter: 'agent-1',
    organization: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    resolvedAt: null,
    touches: 1,
    loggedSeconds: null,
    reopened: false,
    escalated: false,
    slaBreached: false,
    visible: true,
    summary: 'Le VPN coupe',
    ...overrides,
  };
}

/** Signature déterminée de test (§8.2). */
function signature(overrides: Partial<TicketSignature> = {}): TicketSignature {
  return {
    issueId: '10001',
    systemId: 'vpn',
    symptomId: 'deconnexion',
    triggerText: 'après mise à jour du poste',
    hardClues: {
      requestType: null,
      service: null,
      component: null,
      errorCodes: [],
      product: null,
      version: null,
      os: null,
      assetIds: [],
      organization: null,
    },
    extractedAt: '2026-11-01T10:00:00.000Z',
    sourceHash: 'hash-1',
    undetermined: false,
    language: 'fr',
    ...overrides,
  };
}

/** Résultat de rattachement de test (§8.4). */
function match(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    step: 'same-signature',
    problem: null,
    cluster: null,
    confidence: 'high',
    basis: 'rule',
    rationale: 'Signature identique.',
    auto: true,
    undetermined: false,
    proposedAnswer: null,
    ...overrides,
  };
}

test('§14 aucun projet suivi : la nuit ne touche ni base ni réseau', async () => {
  await assert.doesNotReject(() => nightlyRecalc());
  assert.deepEqual(followedProjectIds(), []);
});

test('§14 déclencheurs : événements illisibles rendent la main sans jeter', async () => {
  await assert.doesNotReject(async () => {
    await issueCreated(null);
    await issueCreated({});
    await issueUpdated(undefined);
    await issueUpdated({ issue: {} });
    await issueCommented(null);
    await issueCommented({ comment: { id: '9' } });
  });
});

test('§14 déclencheurs : identifiant et clé extraits de l’événement', () => {
  const event = { issue: { id: '10001', key: 'SUP-1' } };
  assert.equal(issueIdOf(event), '10001');
  assert.equal(issueKeyOf(event), 'SUP-1');
  assert.equal(issueIdOf({ issueId: '10002' }), '10002');
  assert.equal(issueIdOf({ issue: { key: 'SUP-3' } }), null);
  assert.equal(issueKeyOf({ issue: { id: '1' } }), null);
});

test('§8.2 extraction du texte : résumé puis description ADF', () => {
  const issue = {
    id: '10001',
    key: 'SUP-1',
    fields: {
      summary: 'Le VPN coupe toutes les dix minutes',
      description: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erreur 0x80070005' }] }],
      },
    },
  } as unknown as JiraIssue;
  const text = extractTicketText(issue);
  assert.ok(text.startsWith('Le VPN coupe'));
  assert.ok(text.includes('0x80070005'));
  assert.equal(extractTicketText({ id: '1', key: 'K-1', fields: {} } as JiraIssue), '');
});

test('§8.2 resoumission : une seule fois, sauf si le texte a changé', () => {
  assert.equal(shouldResubmit(null, 'h1'), true);
  assert.equal(shouldResubmit('h1', 'h1'), false);
  assert.equal(shouldResubmit('h1', 'h2'), true);
});

/** Problème ouvert de test (§5, §10). */
function problemFixture(): Problem {
  return {
    id: 'prb-1',
    projectId: 'proj-1',
    projectKey: 'SUP',
    issueKey: 'PRB-1',
    clusterId: 'cl-1',
    systemId: 'vpn',
    symptomId: 'deconnexion',
    triggerText: 'après mise à jour du poste',
    state: 'confirmed',
    cause: null,
    workaround: 'réinstaller le profil VPN',
    workaroundUrl: null,
    fixIssueKey: null,
    fixedAt: null,
    watchUntil: null,
    regression: false,
    publishedToPortal: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

test('§8.4 appartenance : confiance élevée rattachée d’office, moyenne proposée', () => {
  const problem = problemFixture();
  const high = membershipOf(signature(), fact(), match({ problem }), '2026-11-01T10:00:00.000Z');
  assert.equal(high?.attached, true);
  assert.equal(high?.problemId, 'prb-1');
  assert.equal(high?.basis, 'rule');

  const medium = membershipOf(
    signature(),
    fact(),
    match({ problem, confidence: 'medium', basis: 'similarity', auto: false }),
    '2026-11-01T10:00:00.000Z',
  );
  assert.equal(medium?.attached, false);
  assert.equal(medium?.confidence, 'medium');

  const undetermined = membershipOf(
    signature({ undetermined: true }),
    fact(),
    match({ problem, undetermined: true }),
    '2026-11-01T10:00:00.000Z',
  );
  assert.equal(undetermined?.attached, false);
  assert.equal(membershipOf(signature(), fact(), match(), '2026-11-01T10:00:00.000Z'), null);
});

test('§8.4 rattachement d’office : jamais sans confiance élevée (§18)', () => {
  assert.equal(attachedFor('high', false), true);
  assert.equal(attachedFor('high', true), false);
  assert.equal(attachedFor('medium', false), false);
  assert.equal(attachedFor('low', false), false);
});

test('§9 heures d’un ticket : temps saisi prioritaire, sinon interventions', () => {
  assert.equal(ticketHours(fact({ loggedSeconds: 5400 }), SETTINGS.minutesPerTouch), 1.5);
  assert.equal(ticketHours(fact({ loggedSeconds: null, touches: 3 }), SETTINGS.minutesPerTouch), 0.5);
  const window = windowTicketsOf([fact({ touches: 2 }), fact({ issueId: 'b', loggedSeconds: 3600 })], SETTINGS);
  assert.equal(window.length, 2);
  assert.equal(window[0]?.hours, 0.33); // round2 de core/time.ts (§9)
  assert.equal(window[1]?.hours, 1);
  assert.equal(billTicketOf(fact()).visible, true);
});

test('§8.6 fenêtre de flambée : récent dans la fenêtre, historique avant', () => {
  const now = '2026-11-01T12:00:00.000Z';
  const facts = [
    fact({ issueId: 'a', createdAt: '2026-11-01T11:30:00.000Z' }),
    fact({ issueId: 'b', createdAt: '2026-11-01T11:59:00.000Z' }),
    fact({ issueId: 'c', createdAt: '2026-11-01T08:00:00.000Z' }),
    fact({ issueId: 'd', createdAt: '2026-11-02T09:00:00.000Z' }),
  ];
  const { recent, history } = splitSurgeDates(facts, 120, now);
  assert.equal(recent.length, 2);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.at, '2026-11-01T08:00:00.000Z');
});

test('§14 lot d’amorçage : lecture du payload, avec ou sans enveloppe', () => {
  const body = { projectId: 'proj-1', projectKey: 'SUP', issueIds: ['1', '2'] };
  assert.deepEqual(parseBootstrapPayload(body), body);
  assert.deepEqual(parseBootstrapPayload({ body }), body);
  assert.equal(parseBootstrapPayload(null), null);
  assert.equal(parseBootstrapPayload({ projectId: 'p' }), null);
  assert.equal(parseBootstrapPayload({ projectId: 'p', projectKey: 'K', issueIds: [] }), null);
  assert.deepEqual(
    parseBootstrapPayload({ projectId: 'p', projectKey: 'K', issueIds: ['1', 2, '3'] })?.issueIds,
    ['1', '3'],
  );
});

test('§14 lots de 50 tickets et 90 jours d’historique (PC-10)', () => {
  assert.equal(BOOTSTRAP_BATCH, 50);
  assert.equal(BOOTSTRAP_DAYS, 90);
  const ids = Array.from({ length: 120 }, (_, index) => String(index));
  const batches = chunkArray(ids, BOOTSTRAP_BATCH);
  assert.deepEqual(batches.map((batch) => batch.length), [50, 50, 20]);
});

test('§9 addition : la période 30 j exclut ce que la période 90 j compte', () => {
  const now = '2026-11-01T00:00:00.000Z';
  const facts = [
    fact({ issueId: 'recent', createdAt: '2026-10-20T00:00:00.000Z', touches: 6 }),
    fact({ issueId: 'ancien', createdAt: '2026-09-01T00:00:00.000Z', touches: 6 }),
  ];
  const bill30 = billForPeriod('prb-1', '30d', facts, [], SETTINGS, now);
  const bill90 = billForPeriod('prb-1', '90d', facts, [], SETTINGS, now);
  assert.equal(bill30.tickets, 1);
  assert.equal(bill90.tickets, 2);
  assert.ok(bill90.hours > bill30.hours);
  assert.equal(bill30.period, '30d');
  assert.equal(bill90.minutesPerTouch, SETTINGS.minutesPerTouch);
});

test('§9 addition : les « moi aussi » comptent dans les personnes touchées (§18)', () => {
  const now = '2026-11-01T00:00:00.000Z';
  const bill = billForPeriod(
    'prb-1',
    '30d',
    [fact({ createdAt: '2026-10-20T00:00:00.000Z', reporter: 'agent-1' })],
    [{ accountId: 'agent-1', organization: null }, { accountId: 'autre', organization: 'ACME' }],
    SETTINGS,
    now,
  );
  assert.equal(bill.tickets, 1);
  assert.equal(bill.meToo, 2);
  assert.equal(bill.people, 2);
  assert.equal(bill.orgs, 1);
});

test('§14 registres et replis : projets suivis, lot suivant, liste vide', async () => {
  registerFollowedProject('proj-2');
  registerFollowedProject('proj-1');
  registerFollowedProject('proj-2');
  registerFollowedProject('  ');
  assert.deepEqual(followedProjectIds(), ['proj-1', 'proj-2']);
  assert.equal(await syncTicketFacts('proj-1', []), 0);
});
