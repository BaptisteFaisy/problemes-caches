/**
 * Tests des actions Rovo et outils MCP (§12).
 *
 * Vérifie les parties pures :
 * - validation des entrées (manquantes, mauvais types) ;
 * - enveloppe { ok: true, data } ou { ok: false, error } ;
 * - une action ne jette JAMAIS (règle dure §12) ;
 * - logique pure : parsing days, format des retours.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actionConfirmMembership,
  actionDraftCustomerUpdate,
  actionGetProblem,
  actionGetSurges,
  actionListSuspects,
  actionListTopProblems,
  actionMatchKnownProblem,
} from './actions.ts';
import {
  optionalNumber,
  optionalText,
  requireBoolean,
  requireText,
  run,
  messageOf,
} from './result.ts';
import {
  agentContext,
  formatProblemSummary,
  otherPeriod,
  periodOfDays,
  rankByCost,
} from './agent.ts';
import { defaultSettings, type Problem, type ProblemBill } from '../core/types.ts';

describe('mcp/agent.ts — contexte, période, tri par coût et gabarits (§12)', () => {
  it('periodOfDays convertit days → période (30 ou 90, défaut 30)', () => {
    assert.equal(periodOfDays(30), '30d');
    assert.equal(periodOfDays(1), '30d');
    assert.equal(periodOfDays(59), '30d');
    assert.equal(periodOfDays(60), '90d');
    assert.equal(periodOfDays(90), '90d');
  });

  it('otherPeriod bascule d’une fenêtre à l’autre (§9)', () => {
    assert.equal(otherPeriod('30d'), '90d');
    assert.equal(otherPeriod('90d'), '30d');
  });

  it('rankByCost trie par heures décroissantes, puis tickets', () => {
    const bills = [
      { hours: 5, tickets: 10 },
      { hours: 20, tickets: 3 },
      { hours: 5, tickets: 12 },
    ];
    const ranked = rankByCost(bills);
    assert.deepEqual(ranked.map((b) => b.hours), [20, 5, 5]);
    assert.equal(ranked[1]?.tickets, 12);
    assert.equal(ranked[2]?.tickets, 10);
    assert.equal(bills[0]?.hours, 5, 'le tableau d’origine n’est pas muté');
  });

  it('agentContext retombe sur les réglages par défaut sans base (§8.5)', () => {
    const ctx = agentContext('SUP', null);
    assert.equal(ctx.projectKey, 'SUP');
    assert.equal(ctx.locale, 'en');
    assert.deepEqual(ctx.settings, defaultSettings('SUP', 'SUP'));
    assert.equal(ctx.thresholds.tickets, 5);
  });

  it('agentContext conserve les réglages existants et la langue fr', () => {
    const settings = { ...defaultSettings('10001', 'SUP'), minutesPerTouch: 15 };
    const ctx = agentContext('SUP', settings, 'fr-FR');
    assert.equal(ctx.locale, 'fr');
    assert.equal(ctx.settings.minutesPerTouch, 15);
  });

  function makeProblem(): Problem {
    return {
      id: 'PRB-1',
      projectId: '10001',
      projectKey: 'SUP',
      issueKey: 'PRB-12',
      clusterId: 'CL-1',
      systemId: 'vpn',
      symptomId: 'coupure',
      triggerText: 'après mise à jour',
      state: 'confirmed',
      cause: null,
      workaround: null,
      workaroundUrl: null,
      fixIssueKey: null,
      fixedAt: null,
      watchUntil: null,
      regression: false,
      publishedToPortal: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-20T09:00:00.000Z',
    };
  }

  function makeBill(): ProblemBill {
    return {
      problemId: 'PRB-1',
      period: '30d',
      tickets: 43,
      hours: 61,
      people: 38,
      orgs: 4,
      slaBreaches: 2,
      reopens: 1,
      escalations: 0,
      meToo: 23,
      hoursMethod: 'mixed',
      minutesPerTouch: 10,
      eur: null,
      hourRateEur: null,
      hiddenCount: 0,
      computedAt: '2026-11-11T09:00:00.000Z',
    };
  }

  it('formatProblemSummary rend un gabarit lisible, avec ou sans addition (§12)', () => {
    const fr = formatProblemSummary(makeProblem(), makeBill(), 'fr');
    assert.match(fr, /PRB-12/);
    assert.match(fr, /Confirmé/);
    assert.match(fr, /43 tickets/);
    assert.match(fr, /38 personnes/);
    const en = formatProblemSummary(makeProblem(), null, 'en');
    assert.match(en, /PRB-12 \(Confirmed\)/);
    assert.equal(en.includes('tickets'), false);
  });
});

describe('mcp/result.ts — enveloppe et validation des entrées', () => {
  it('requireText rend le texte nettoyé', () => {
    assert.equal(requireText({ key: '  valeur  ' }, 'key'), 'valeur');
  });

  it('requireText jette si clé absente ou vide', () => {
    assert.throws(() => requireText({}, 'key'), /paramètre « key » requis/);
    assert.throws(() => requireText({ key: '   ' }, 'key'), /paramètre « key » requis/);
    assert.throws(() => requireText({ key: 123 as unknown as string }, 'key'), /paramètre « key » requis/);
  });

  it('optionalText rend le texte nettoyé ou null', () => {
    assert.equal(optionalText({ key: '  test  ' }, 'key'), 'test');
    assert.equal(optionalText({}, 'key'), null);
    assert.equal(optionalText({ key: '   ' }, 'key'), null);
    assert.equal(optionalText({ key: 42 as unknown as string }, 'key'), null);
  });

  it('requireBoolean valide strictement les booléens', () => {
    assert.equal(requireBoolean({ confirmed: true }, 'confirmed'), true);
    assert.equal(requireBoolean({ confirmed: false }, 'confirmed'), false);
    assert.throws(() => requireBoolean({ confirmed: 'true' as unknown as boolean }, 'confirmed'), /booléen/);
    assert.throws(() => requireBoolean({}, 'confirmed'), /booléen/);
  });

  it('optionalNumber applique fallback et borne max', () => {
    assert.equal(optionalNumber({ days: 30 }, 'days', 30, 90), 30);
    assert.equal(optionalNumber({ days: 90 }, 'days', 30, 90), 90);
    assert.equal(optionalNumber({ days: 120 }, 'days', 30, 90), 90);
    assert.equal(optionalNumber({ days: -5 }, 'days', 30, 90), 30);
    assert.equal(optionalNumber({}, 'days', 30, 90), 30);
    assert.equal(optionalNumber({ days: 'invalid' as unknown as number }, 'days', 30, 90), 30);
  });

  it('messageOf extrait le texte de toute erreur', () => {
    assert.equal(messageOf(new Error('boom')), 'boom');
    assert.equal(messageOf('chaine'), 'chaine');
    assert.equal(messageOf(null), 'erreur inconnue');
  });

  it('run capte les exceptions et rend { ok: false, error }', async () => {
    const envelope = await run(async () => {
      throw new Error('échec interne simulé');
    });
    assert.equal(envelope.ok, false);
    if (!envelope.ok) {
      assert.equal(envelope.error, 'échec interne simulé');
    }
  });

  it('run encapsule la réussite dans { ok: true, data }', async () => {
    const envelope = await run(async () => ({ resultat: 42 }));
    assert.equal(envelope.ok, true);
    if (envelope.ok) {
      assert.deepEqual(envelope.data, { resultat: 42 });
    }
  });
});

describe('mcp/actions.ts — les 7 actions ne jettent jamais', () => {
  it('actionMatchKnownProblem rend une erreur propre sans text ni issueKey', async () => {
    const res = await actionMatchKnownProblem({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /text.*issueKey/i);
    }
  });

  it('actionListTopProblems rend une erreur propre sans projectKey', async () => {
    const res = await actionListTopProblems({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /projectKey/);
    }
  });

  it('actionGetProblem rend une erreur propre sans problemKey', async () => {
    const res = await actionGetProblem({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /problemKey/);
    }
  });

  it('actionListSuspects rend une erreur propre sans projectKey', async () => {
    const res = await actionListSuspects({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /projectKey/);
    }
  });

  it('actionGetSurges rend une erreur propre sans projectKey', async () => {
    const res = await actionGetSurges({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /projectKey/);
    }
  });

  it('actionDraftCustomerUpdate rend une erreur propre sans problemKey', async () => {
    const res = await actionDraftCustomerUpdate({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /problemKey/);
    }
  });

  it('actionConfirmMembership rend une erreur propre avec paramètres manquants', async () => {
    const res1 = await actionConfirmMembership({});
    assert.equal(res1.ok, false);
    const res2 = await actionConfirmMembership({ issueKey: 'SUP-1' });
    assert.equal(res2.ok, false);
    const res3 = await actionConfirmMembership({ issueKey: 'SUP-1', problemKey: 'PRB-1' });
    assert.equal(res3.ok, false);
  });

  it('actionConfirmMembership refuse une chaîne pour confirmed', async () => {
    const res = await actionConfirmMembership({
      issueKey: 'SUP-1',
      problemKey: 'PRB-1',
      confirmed: 'true' as unknown as boolean,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /booléen/);
    }
  });
});
