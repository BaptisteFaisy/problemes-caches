/**
 * Tests du rattachement (§8.4) — déterministes, sans réseau.
 * Le comparateur à modèle est toujours un faux injecté.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAutoAttach, matchTicket, rankCandidates } from './matching.ts';
import type { CompareFn, MatchInput } from './matching.ts';
import { defaultSettings } from './types.ts';
import type { Cluster, Problem, TicketFact, TicketSignature } from './types.ts';

/** Comparateur qui répond oui, et compte ses appels. */
function yesCompare(rationale: string, calls: string[] = []): CompareFn {
  return async (_text, problem) => {
    calls.push(problem.id);
    return { same: true, rationale };
  };
}

/** Comparateur qui répond non. */
function noCompare(calls: string[] = []): CompareFn {
  return async (_text, problem) => {
    calls.push(problem.id);
    return { same: false, rationale: 'Ce n’est pas la même panne.' };
  };
}

/** Comparateur qui jette : l’appelant ne doit jamais le voir (§8.4). */
function throwingCompare(calls: string[] = []): CompareFn {
  return async (_text, problem) => {
    calls.push(problem.id);
    throw new Error('modèle indisponible');
  };
}

function makeProblem(over: Partial<Problem> = {}): Problem {
  return {
    id: 'PRB-1',
    projectId: 'P1',
    projectKey: 'SVC',
    issueKey: 'PRB-1',
    clusterId: 'CL-1',
    systemId: 'vpn',
    symptomId: 'coupure',
    triggerText: 'après mise à jour',
    state: 'confirmed',
    cause: null,
    workaround: 'Réinstaller le profil VPN',
    workaroundUrl: null,
    fixIssueKey: null,
    fixedAt: null,
    watchUntil: null,
    regression: false,
    publishedToPortal: false,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-20T09:00:00.000Z',
    ...over,
  };
}

function makeSignature(over: Partial<TicketSignature> = {}): TicketSignature {
  return {
    issueId: 'T-1',
    systemId: 'vpn',
    symptomId: 'coupure',
    triggerText: 'après mise à jour',
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
    extractedAt: '2026-11-11T08:00:00.000Z',
    sourceHash: 'abc123',
    undetermined: false,
    language: 'fr',
    ...over,
  };
}

function makeFact(over: Partial<TicketFact> = {}): TicketFact {
  return {
    issueId: 'T-1',
    issueKey: 'T-1',
    projectId: 'P1',
    projectKey: 'SVC',
    requestType: null,
    service: null,
    component: null,
    reporter: null,
    organization: null,
    createdAt: '2026-11-11T08:00:00.000Z',
    resolvedAt: null,
    touches: 1,
    loggedSeconds: null,
    reopened: false,
    escalated: false,
    slaBreached: false,
    visible: true,
    summary: 'Mon accès distant coupe toutes les dix minutes depuis ce matin.',
    ...over,
  };
}

function makeCluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: 'CL-1',
    projectId: 'P1',
    systemId: 'vpn',
    symptomId: 'coupure',
    triggerText: 'après mise à jour',
    tickets30d: 12,
    hours30d: 6,
    people30d: 11,
    status: 'problem',
    firstSeenAt: '2026-10-01T09:00:00.000Z',
    lastSeenAt: '2026-11-11T08:00:00.000Z',
    overThreshold: true,
    thresholdHit: 'tickets',
    ...over,
  };
}

function makeInput(over: Partial<MatchInput> = {}): MatchInput {
  return {
    signature: makeSignature(),
    openProblems: [],
    clusters: [],
    facts: [makeFact()],
    settings: defaultSettings('P1', 'SVC'),
    ...over,
  };
}

describe('§8.4 — marche 1 : même signature complète', () => {
  it('rattache d’office, confiance élevée, base règle', async () => {
    const calls: string[] = [];
    const result = await matchTicket(
      makeInput({ openProblems: [makeProblem()], clusters: [makeCluster()], compare: yesCompare('x', calls) }),
    );
    assert.equal(result.step, 'same-signature');
    assert.equal(result.confidence, 'high');
    assert.equal(result.basis, 'rule');
    assert.equal(result.auto, true);
    assert.equal(result.problem?.id, 'PRB-1');
    assert.equal(result.undetermined, false);
    assert.equal(isAutoAttach(result), true);
    assert.match(result.rationale, /Signature identique/);
    assert.equal(calls.length, 0, 'le comparateur n’est pas appelé quand la signature suffit');
  });

  it('prime sur la marche 3 (indice certain partagé)', async () => {
    const result = await matchTicket(
      makeInput({
        signature: makeSignature({ hardClues: { ...makeSignature().hardClues, errorCodes: ['ERR-1234'] } }),
        openProblems: [makeProblem()],
        clusters: [makeCluster({ triggerText: 'après mise à jour ERR-1234' })],
      }),
    );
    assert.equal(result.step, 'same-signature');
    assert.equal(result.confidence, 'high');
  });

  it('joint la grappe et propose le contournement validé (§7.2, PC-08)', async () => {
    const result = await matchTicket(makeInput({ openProblems: [makeProblem()], clusters: [makeCluster()] }));
    assert.equal(result.cluster?.id, 'CL-1');
    assert.equal(result.proposedAnswer, 'Réinstaller le profil VPN');
  });
});

describe('§8.4 — marche 2 : même système, symptôme proche', () => {
  const problem = makeProblem({ triggerText: 'le matin' });

  it('propose sans rattacher d’office quand le comparateur dit oui', async () => {
    const result = await matchTicket(
      makeInput({ openProblems: [problem], compare: yesCompare('Les deux tickets décrivent la même coupure VPN.') }),
    );
    assert.equal(result.step, 'similar-symptom');
    assert.equal(result.confidence, 'medium');
    assert.equal(result.basis, 'similarity');
    assert.equal(result.auto, false);
    assert.equal(isAutoAttach(result), false);
    assert.match(result.rationale, /même coupure VPN/);
    assert.match(result.rationale, /vpn/);
  });

  it('remet au comparateur le texte du ticket, pas un texte inventé', async () => {
    let seen = '';
    const compare: CompareFn = async (text) => {
      seen = text;
      return { same: true, rationale: 'ok' };
    };
    await matchTicket(makeInput({ openProblems: [problem], compare }));
    assert.equal(seen, 'Mon accès distant coupe toutes les dix minutes depuis ce matin.');
  });

  it('redescend quand le comparateur dit non', async () => {
    const result = await matchTicket(makeInput({ openProblems: [problem], compare: noCompare() }));
    assert.equal(result.step, 'none');
    assert.equal(result.problem, null);
    assert.equal(result.auto, false);
  });

  it('redescend vers la marche 3 quand le comparateur dit non mais qu’un code est partagé', async () => {
    const result = await matchTicket(
      makeInput({
        signature: makeSignature({ hardClues: { ...makeSignature().hardClues, errorCodes: ['ERR-1234'] } }),
        openProblems: [makeProblem({ triggerText: 'échec ERR-1234 au démarrage' })],
        compare: noCompare(),
      }),
    );
    assert.equal(result.step, 'shared-clue');
    assert.equal(result.confidence, 'high');
  });

  it('ne jette jamais quand le comparateur jette', async () => {
    const calls: string[] = [];
    const result = await matchTicket(makeInput({ openProblems: [problem], compare: throwingCompare(calls) }));
    assert.equal(calls.length, 1);
    assert.equal(result.step, 'none');
    assert.equal(result.problem, null);
  });

  it('passe à la marche 3 quand le comparateur jette et qu’un objet d’inventaire est partagé', async () => {
    const result = await matchTicket(
      makeInput({
        signature: makeSignature({ hardClues: { ...makeSignature().hardClues, assetIds: ['PRINTER-3F'] } }),
        openProblems: [makeProblem({ triggerText: 'bourrage sur PRINTER-3F' })],
        compare: throwingCompare(),
      }),
    );
    assert.equal(result.step, 'shared-clue');
    assert.match(result.rationale, /PRINTER-3F/);
  });

  it('ne consulte pas le comparateur d’un autre système', async () => {
    const calls: string[] = [];
    const result = await matchTicket(
      makeInput({ openProblems: [makeProblem({ id: 'PRB-9', systemId: 'impression' })], compare: yesCompare('x', calls) }),
    );
    assert.equal(calls.length, 0);
    assert.equal(result.step, 'none');
  });
});

describe('§8.4 — marche 3 : indice certain partagé', () => {
  it('rattache d’office sur un code d’erreur commun, textes différents', async () => {
    const signature = makeSignature({
      systemId: 'poste',
      symptomId: 'lenteur',
      triggerText: 'depuis hier',
      hardClues: { ...makeSignature().hardClues, errorCodes: ['ERR-1234'] },
    });
    const result = await matchTicket(
      makeInput({
        signature,
        openProblems: [makeProblem({ triggerText: 'échec ERR-1234 au démarrage du poste' })],
      }),
    );
    assert.equal(result.step, 'shared-clue');
    assert.equal(result.confidence, 'high');
    assert.equal(result.basis, 'rule');
    assert.equal(result.auto, true);
    assert.equal(isAutoAttach(result), true);
    assert.match(result.rationale, /ERR-1234/);
  });

  it('rattache d’office sur un objet d’inventaire commun', async () => {
    const signature = makeSignature({
      systemId: 'impression',
      symptomId: 'bourrage',
      triggerText: 'le matin',
      hardClues: { ...makeSignature().hardClues, assetIds: ['PRINTER-3F'] },
    });
    const result = await matchTicket(
      makeInput({ signature, openProblems: [makeProblem({ systemId: 'impression', symptomId: 'bourrage', triggerText: 'étage 3' })] }),
    );
    assert.equal(result.step, 'none', 'sans indice partagé, pas de rattachement');
    const shared = await matchTicket(
      makeInput({
        signature,
        openProblems: [makeProblem({ systemId: 'impression', symptomId: 'bourrage', triggerText: 'PRINTER-3F de l’étage 3' })],
      }),
    );
    assert.equal(shared.step, 'shared-clue');
    assert.match(shared.rationale, /inventaire/);
  });

  it('ne confond pas un code d’erreur avec un autre plus long', async () => {
    const signature = makeSignature({ hardClues: { ...makeSignature().hardClues, errorCodes: ['ERR-123'] } });
    const result = await matchTicket(
      makeInput({ signature, openProblems: [makeProblem({ systemId: 'autre', triggerText: 'échec ERR-1234' })] }),
    );
    assert.equal(result.step, 'none');
  });

  it('lit aussi les indices dans le ticket de problème et sa grappe (§10)', async () => {
    const signature = makeSignature({ hardClues: { ...makeSignature().hardClues, errorCodes: ['0x80070005'] } });
    const result = await matchTicket(
      makeInput({
        signature,
        openProblems: [makeProblem({ systemId: 'poste', triggerText: 'accès refusé' })],
        clusters: [makeCluster({ triggerText: '0x80070005 après mise à jour' })],
      }),
    );
    assert.equal(result.step, 'shared-clue');
    assert.match(result.rationale, /0x80070005/);
  });
});

describe('§8.4 — aucun rattachement', () => {
  it('rend « none » quand aucun problème n’est ouvert', async () => {
    const result = await matchTicket(makeInput());
    assert.equal(result.step, 'none');
    assert.equal(result.problem, null);
    assert.equal(result.cluster, null);
    assert.equal(result.auto, false);
    assert.equal(result.undetermined, false);
    assert.equal(isAutoAttach(result), false);
  });

  it('rend « none » pour un ticket sans rapport (recette §19, point 5)', async () => {
    const result = await matchTicket(
      makeInput({
        signature: makeSignature({ systemId: 'paie', symptomId: 'bulletin', triggerText: 'ce mois-ci' }),
        openProblems: [makeProblem()],
        facts: [makeFact({ summary: 'Mon bulletin de paie n’est pas arrivé.' })],
        compare: noCompare(),
      }),
    );
    assert.equal(result.step, 'none');
    assert.equal(result.problem, null);
    assert.equal(result.proposedAnswer, null);
  });

  it('ignore les problèmes d’un autre projet', async () => {
    const result = await matchTicket(makeInput({ openProblems: [makeProblem({ projectId: 'AUTRE' })] }));
    assert.equal(result.step, 'none');
  });
});

describe('§18 — signature indéterminée', () => {
  it('n’est jamais rattachée d’office', async () => {
    const calls: string[] = [];
    const result = await matchTicket(
      makeInput({
        signature: makeSignature({ systemId: 'undetermined', symptomId: 'undetermined', triggerText: '', undetermined: true }),
        openProblems: [makeProblem()],
        compare: yesCompare('x', calls),
      }),
    );
    assert.equal(result.step, 'none');
    assert.equal(result.undetermined, true);
    assert.equal(result.auto, false);
    assert.equal(result.problem, null);
    assert.equal(isAutoAttach(result), false);
    assert.equal(calls.length, 0);
    assert.match(result.rationale, /indéterminée/);
  });

  it('ne propose aucun candidat automatique', async () => {
    const ranked = await rankCandidates(
      makeInput({ signature: makeSignature({ undetermined: true }), openProblems: [makeProblem()] }),
    );
    assert.deepEqual(ranked, []);
  });
});

describe('§18 — deux problèmes possibles', () => {
  const signature = makeSignature({ hardClues: { ...makeSignature().hardClues, errorCodes: ['ERR-1234'], assetIds: ['PRINTER-3F'] } });
  const probable = makeProblem();
  const other = makeProblem({
    id: 'PRB-2',
    issueKey: 'PRB-2',
    clusterId: 'CL-2',
    systemId: 'impression',
    symptomId: 'bourrage',
    triggerText: 'ERR-1234 sur PRINTER-3F',
  });

  it('classe les deux candidats, le plus probable en premier', async () => {
    const ranked = await rankCandidates(makeInput({ signature, openProblems: [other, probable] }));
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.problem?.id, 'PRB-1');
    assert.equal(ranked[0]?.step, 'same-signature');
    assert.equal(ranked[1]?.problem?.id, 'PRB-2');
    assert.equal(ranked[1]?.step, 'shared-clue');
  });

  it('matchTicket rend le plus probable, l’autre reste proposé à l’écran', async () => {
    const result = await matchTicket(makeInput({ signature, openProblems: [other, probable] }));
    assert.equal(result.problem?.id, 'PRB-1');
    assert.equal(result.step, 'same-signature');
  });

  it('classe deux candidats de même marche par nombre d’indices partagés', async () => {
    const ranked = await rankCandidates(
      makeInput({
        signature,
        openProblems: [
          makeProblem({ id: 'PRB-3', issueKey: 'PRB-3', systemId: 'impression', symptomId: 'bourrage', triggerText: 'ERR-1234' }),
          makeProblem({ id: 'PRB-4', issueKey: 'PRB-4', systemId: 'impression', symptomId: 'bourrage', triggerText: 'ERR-1234 sur PRINTER-3F' }),
        ],
      }),
    );
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.problem?.id, 'PRB-4');
    assert.equal(ranked[1]?.problem?.id, 'PRB-3');
  });

  it('liste aussi les candidats trouvés par le comparateur', async () => {
    const ranked = await rankCandidates(
      makeInput({
        signature: makeSignature({ triggerText: 'le matin' }),
        openProblems: [
          makeProblem({ triggerText: 'le matin' }),
          makeProblem({ id: 'PRB-5', issueKey: 'PRB-5', triggerText: 'le soir' }),
        ],
        compare: yesCompare('Même panne VPN.'),
      }),
    );
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.problem?.id, 'PRB-1');
    assert.equal(ranked[0]?.step, 'same-signature');
    assert.equal(ranked[1]?.problem?.id, 'PRB-5');
    assert.equal(ranked[1]?.step, 'similar-symptom');
  });
});

describe('isAutoAttach — rattachement d’office toujours réversible (§8.4, §18)', () => {
  it('vaut vrai seulement pour une confiance élevée non indéterminée', async () => {
    const high = await matchTicket(makeInput({ openProblems: [makeProblem()] }));
    const medium = await matchTicket(
      makeInput({ openProblems: [makeProblem({ triggerText: 'le matin' })], compare: yesCompare('Même panne.') }),
    );
    const undetermined = await matchTicket(makeInput({ signature: makeSignature({ undetermined: true }) }));
    assert.equal(isAutoAttach(high), true);
    assert.equal(isAutoAttach(medium), false);
    assert.equal(isAutoAttach(undetermined), false);
    assert.equal(isAutoAttach({ ...high, undetermined: true }), false);
    assert.equal(isAutoAttach({ ...high, auto: false }), false);
  });
});
