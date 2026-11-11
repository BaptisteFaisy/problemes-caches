/**
 * Tests des parties pures du lot WP-J : construction des prompts, parsing du
 * JSON rendu par le modèle, repli déterministe et clé de cache (§8.2, §8.4, §7.4).
 *
 * Aucun appel réseau : le client de conversation est injecté (`LlmDeps.chat`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { HardClues, Problem, Term, Vocabulary } from '../core/types.ts';
import type { ChatOptions, DraftStats, LlmChat, LlmSignatureInput, PromptMessage } from './jira-types.ts';
import {
  buildSignaturePrompt,
  cacheKeyFor,
  compareTicketToProblem,
  draftAnswer,
  draftCustomerUpdate,
  extractJsonObject,
  extractSignature,
  fallbackCompare,
  fallbackCustomerUpdate,
  fallbackDraftAnswer,
  fallbackSignature,
  fingerprint,
  parseCompareJson,
  parseCustomerUpdateJson,
  parseSignatureJson,
} from './llm.ts';

/** Terme du vocabulaire (§8.3). */
function term(id: string, kind: 'system' | 'symptom', label: string): Term {
  return { id, projectId: 'SUP', kind, label, mergedInto: null, aliases: [], createdAt: '2026-11-01T00:00:00Z' };
}

const VOCABULARY: Vocabulary = {
  systems: [term('sys-remote', 'system', 'remote access'), term('sys-print', 'system', 'printing')],
  symptoms: [term('sym-cut', 'symptom', 'connection drops'), term('sym-slow', 'symptom', 'slow page')],
};

const CLUES: HardClues = {
  requestType: 'Incident',
  service: 'VPN',
  component: 'gateway',
  errorCodes: ['ERR-1234'],
  product: null,
  version: '2.1',
  os: 'Windows 11',
  assetIds: [],
  organization: 'Acme',
};

const PROBLEM: Problem = {
  id: 'prb-1',
  projectId: 'p-sup',
  projectKey: 'SUP',
  issueKey: 'PRB-12',
  clusterId: 'clu-1',
  systemId: 'sys-remote',
  symptomId: 'sym-cut',
  triggerText: 'after the VPN update',
  state: 'confirmed',
  cause: 'VPN client crash',
  workaround: 'Reconnect twice.',
  workaroundUrl: null,
  fixIssueKey: 'NET-42',
  fixedAt: null,
  watchUntil: null,
  regression: false,
  publishedToPortal: false,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-11-10T08:00:00Z',
};

const STATS: DraftStats = { openTickets: 17, meToo: 23, hours: 8.5, people: 23, fixDate: '2026-12-01' };

/** Appel enregistré, pour vérifier prompts et options du modèle. */
interface RecordedCall {
  messages: PromptMessage[];
  options: ChatOptions;
}

/** Client de conversation factice : rend les réponses données, dans l'ordre. */
function fakeChat(replies: (string | Error)[], calls: RecordedCall[] = []): LlmChat {
  return async (messages, options) => {
    calls.push({ messages, options });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return reply ?? '';
  };
}

/** Entrée d'extraction de signature (§8.2). */
function signatureInput(text: string, cache?: Map<string, unknown>): LlmSignatureInput {
  const input: LlmSignatureInput = { text, vocabulary: VOCABULARY, hardClues: CLUES, projectLanguage: 'fr' };
  if (cache) input.cache = cache as LlmSignatureInput['cache'];
  return input;
}

const VALID_SIGNATURE = JSON.stringify({
  system: 'remote access',
  symptom: 'connection drops',
  trigger: 'after the VPN update',
  undetermined: false,
  language: 'fr',
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

test('buildSignaturePrompt : vocabulaire, langue, indices certains et texte borné', () => {
  const long = 'a'.repeat(4000);
  const messages = buildSignaturePrompt(signatureInput(long));
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, 'system');
  assert.match(messages[0]?.content ?? '', /JSON object/);
  assert.match(messages[0]?.content ?? '', /known vocabulary/i);
  const user = messages[1]?.content ?? '';
  assert.match(user, /Project language: fr/);
  assert.match(user, /remote access \| printing/);
  assert.match(user, /connection drops \| slow page/);
  assert.match(user, /ERR-1234/);
  assert.match(user, /service=VPN/);
  // Le texte soumis au modèle est borné (§8.2).
  assert.ok(user.length <= 4000);
  assert.ok(!user.includes('a'.repeat(1600)));
});

test('buildSignaturePrompt : température 0 demandée au modèle (§8.2)', async () => {
  const calls: RecordedCall[] = [];
  await extractSignature(signatureInput('the vpn drops every morning after the update', new Map()), {
    chat: fakeChat([VALID_SIGNATURE], calls),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.options.temperature, 0);
});

// ---------------------------------------------------------------------------
// Parsing du JSON rendu par le modèle
// ---------------------------------------------------------------------------

test('extractJsonObject : JSON nu, dans une clôture de code, ou entouré de prose', () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Voici la réponse : {"a":1} — voilà.'), { a: 1 });
  assert.equal(extractJsonObject('pas de JSON ici'), null);
  assert.equal(extractJsonObject('{"a":}'), null);
});

test('parseSignatureJson : sortie valide, indéterminée, ou refusée', () => {
  const parsed = parseSignatureJson(VALID_SIGNATURE);
  assert.deepEqual(parsed, {
    system: 'remote access',
    symptom: 'connection drops',
    trigger: 'after the VPN update',
    undetermined: false,
    language: 'fr',
  });
  assert.deepEqual(parseSignatureJson('{"system":"","symptom":"","trigger":"","undetermined":true}'), {
    system: '',
    symptom: '',
    trigger: '',
    undetermined: true,
    language: null,
  });
  // Un système ou un symptôme manquant n'est pas une signature exploitable.
  assert.equal(parseSignatureJson('{"system":"vpn"}'), null);
  assert.equal(parseSignatureJson('[]'), null);
  assert.equal(parseSignatureJson('rien'), null);
});

test('parseCompareJson : réponse oui/non avec justification, sinon refus (§8.4)', () => {
  assert.deepEqual(parseCompareJson('{"same": true, "rationale": "Same trigger."}'), {
    same: true,
    rationale: 'Same trigger.',
  });
  assert.deepEqual(parseCompareJson('{"same":false,"rationale":"Different system."}'), {
    same: false,
    rationale: 'Different system.',
  });
  assert.equal(parseCompareJson('{"same":"yes","rationale":"x"}'), null);
  assert.equal(parseCompareJson('{"same":true}'), null);
  assert.equal(parseCompareJson('bof'), null);
});

test('parseCustomerUpdateJson : sujet et corps obligatoires', () => {
  assert.deepEqual(parseCustomerUpdateJson('{"subject":"Update","body":"Hello."}'), {
    subject: 'Update',
    body: 'Hello.',
  });
  assert.equal(parseCustomerUpdateJson('{"subject":"Update"}'), null);
  assert.equal(parseCustomerUpdateJson('texte libre'), null);
});

// ---------------------------------------------------------------------------
// Clé de cache (§8.2)
// ---------------------------------------------------------------------------

test('cacheKeyFor : stable, sensible au texte et à la langue', () => {
  assert.equal(cacheKeyFor('même texte', 'fr'), cacheKeyFor('même texte', 'fr'));
  assert.notEqual(cacheKeyFor('même texte', 'fr'), cacheKeyFor('autre texte', 'fr'));
  assert.notEqual(cacheKeyFor('même texte', 'fr'), cacheKeyFor('même texte', 'en'));
  assert.equal(fingerprint(''), fingerprint(''));
  assert.notEqual(fingerprint('a'), fingerprint('b'));
});

// ---------------------------------------------------------------------------
// Repli déterministe
// ---------------------------------------------------------------------------

test('fallbackSignature : vocabulaire d\'abord, indices certains ensuite, indéterminée si vide', () => {
  const matched = fallbackSignature(
    signatureInput('Le remote access tombe en panne : connection drops after the VPN update.'),
  );
  assert.equal(matched.system, 'remote access');
  assert.equal(matched.symptom, 'connection drops');
  assert.equal(matched.undetermined, false);
  assert.equal(matched.language, 'fr');

  const fromClues = fallbackSignature(
    signatureInput('Un incident inconnu sans aucun terme connu du vocabulaire du projet.'),
  );
  assert.equal(fromClues.system, 'VPN');
  assert.equal(fromClues.symptom, 'ERR-1234');
  assert.equal(fromClues.undetermined, false);

  const undetermined = fallbackSignature(signatureInput('ça ne marche pas'));
  assert.equal(undetermined.undetermined, true);
});

test('fallbackCompare : le déclencheur connu doit apparaître dans le texte', () => {
  const same = fallbackCompare('the vpn drops after the VPN update every morning', PROBLEM);
  assert.equal(same.same, true);
  assert.ok(same.rationale.length > 0);
  const different = fallbackCompare('imprimante en panne au troisième étage', PROBLEM);
  assert.equal(different.same, false);
  assert.ok(different.rationale.length > 0);
});

test('fallbackDraftAnswer et fallbackCustomerUpdate : gabarits bilingues, jamais vides (§7.4)', () => {
  const answer = fallbackDraftAnswer(PROBLEM, 'vpn coupé', 'fr');
  assert.match(answer, /problème connu/);
  assert.match(answer, /Contournement : Reconnect twice\./);
  assert.match(fallbackDraftAnswer(PROBLEM, 'vpn down', 'en'), /known problem/);

  const draft = fallbackCustomerUpdate(PROBLEM, STATS, 'fr');
  assert.equal(draft.source, 'template');
  assert.equal(draft.problemKey, 'PRB-12');
  assert.equal(draft.openTickets, 17);
  assert.equal(draft.meToo, 23);
  assert.match(draft.body, /17 demandes ouvertes/);
  assert.match(draft.body, /23 « moi aussi »/);
  assert.match(draft.body, /Correctif prévu : 2026-12-01/);
  assert.match(fallbackCustomerUpdate(PROBLEM, STATS, 'en').body, /17 open requests/);
});

// ---------------------------------------------------------------------------
// extractSignature : cache et repli
// ---------------------------------------------------------------------------

test('extractSignature : un ticket n’est soumis qu’une fois, sauf si son texte change (§8.2)', async () => {
  const cache = new Map<string, unknown>();
  const calls: RecordedCall[] = [];
  const deps = { chat: fakeChat([VALID_SIGNATURE], calls), cache: cache as LlmSignatureInput['cache'] };

  const first = await extractSignature(signatureInput('vpn drops after the update, every morning', cache), deps);
  assert.equal(first.system, 'remote access');
  assert.equal(calls.length, 1);

  const second = await extractSignature(signatureInput('vpn drops after the update, every morning', cache), deps);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1, 'le cache évite un second appel au modèle');

  const changed = await extractSignature(signatureInput('vpn drops after the update, and also at night', cache), deps);
  assert.equal(calls.length, 2, 'une description modifiée est resoumise');
  assert.equal(changed.system, 'remote access');
});

test('extractSignature : sortie illisible ou erreur du modèle → repli déterministe, jamais mis en cache', async () => {
  const cache = new Map<string, unknown>();
  const typed = cache as LlmSignatureInput['cache'];
  const calls: RecordedCall[] = [];
  const garbage = await extractSignature(signatureInput('remote access connection drops every single morning', cache), {
    chat: fakeChat(['je ne sais pas répondre en JSON'], calls),
    cache: typed,
  });
  assert.equal(garbage.system, 'remote access');
  assert.equal(garbage.undetermined, false);
  assert.equal(cache.size, 0, 'un repli n’est pas mis en cache : on réessaiera');

  const failing = await extractSignature(signatureInput('remote access connection drops every single morning', cache), {
    chat: fakeChat([new Error('rate limited')], calls),
    cache: typed,
  });
  assert.equal(failing.system, 'remote access');
  assert.equal(cache.size, 0);
});

test('extractSignature : le modèle peut répondre « indéterminé » (§18)', async () => {
  const result = await extractSignature(signatureInput('ça ne marche pas', new Map()), {
    chat: fakeChat(['{"system":"","symptom":"","trigger":"","undetermined":true}']),
  });
  assert.equal(result.undetermined, true);
  assert.equal(result.system, '');
});

// ---------------------------------------------------------------------------
// compareTicketToProblem
// ---------------------------------------------------------------------------

test('compareTicketToProblem : réponse du modèle, puis repli si elle est illisible', async () => {
  const model = await compareTicketToProblem('vpn coupé après la mise à jour', PROBLEM, {
    chat: fakeChat(['{"same":true,"rationale":"Same trigger and same system."}']),
  });
  assert.deepEqual(model, { same: true, rationale: 'Same trigger and same system.' });

  const garbage = await compareTicketToProblem('after the VPN update, the vpn drops', PROBLEM, {
    chat: fakeChat(['peut-être']),
  });
  assert.equal(garbage.same, true, 'le déclencheur connu est présent dans le texte');

  const broken = await compareTicketToProblem('imprimante en panne', PROBLEM, {
    chat: fakeChat([new Error('model unavailable')]),
  });
  assert.equal(broken.same, false);
  assert.ok(broken.rationale.length > 0);
});

// ---------------------------------------------------------------------------
// Brouillons (§7.4) — jamais envoyés
// ---------------------------------------------------------------------------

test('draftAnswer : texte du modèle, sinon gabarit déterministe', async () => {
  const fromModel = await draftAnswer(PROBLEM, 'vpn coupé', 'fr', {
    chat: fakeChat(['  Bonjour, votre demande est rattachée à PRB-12.  ']),
  });
  assert.equal(fromModel, 'Bonjour, votre demande est rattachée à PRB-12.');

  const fromTemplate = await draftAnswer(PROBLEM, 'vpn coupé', 'fr', {
    chat: fakeChat([new Error('timeout')]),
  });
  assert.match(fromTemplate, /problème connu/);
});

test('draftCustomerUpdate : source « model » sur un JSON valide, « template » sinon', async () => {
  const fromModel = await draftCustomerUpdate(PROBLEM, STATS, 'en', {
    chat: fakeChat(['{"subject":"Update on PRB-12","body":"We are working on it."}']),
  });
  assert.equal(fromModel.source, 'model');
  assert.equal(fromModel.subject, 'Update on PRB-12');
  assert.equal(fromModel.body, 'We are working on it.');
  assert.equal(fromModel.problemKey, 'PRB-12');
  assert.equal(fromModel.openTickets, 17);
  assert.equal(fromModel.meToo, 23);

  const fromTemplate = await draftCustomerUpdate(PROBLEM, STATS, 'en', {
    chat: fakeChat(['{"subject":"sans corps"}']),
  });
  assert.equal(fromTemplate.source, 'template');
  assert.equal(fromTemplate.problemKey, 'PRB-12');
  assert.match(fromTemplate.body, /17 open requests/);
});
