/**
 * Forge LLM (§8.2 signature, §8.4 comparaison, §7.4 brouillons).
 *
 * Trois règles du cahier gouvernent ce module :
 * - **température 0** et sortie JSON stricte pour la signature (§8.2) ;
 * - **cache par empreinte** : un ticket n'est soumis qu'une fois, sauf si sa
 *   description change (§8.2) ;
 * - **repli déterministe** : quand le modèle échoue ou rend du JSON invalide,
 *   on rend un gabarit, jamais une exception. Un brouillon n'est jamais
 *   envoyé : un humain l'envoie (§7.4, §17).
 *
 * Le modèle est joint par un import dynamique : le module reste chargeable hors
 * runtime Forge (les tests), et le bundle Forge l'embarque normalement.
 *
 * Les prompts et les gabarits sont des fabriques pures : elles vivent dans
 * `field.ts` (zéro duplication) et sont réexportées ici.
 */

import type { Prompt } from '@forge/llm';

import type { CustomerUpdateDraft, HardClues, Problem } from '../core/types.ts';
import { normalizeTrigger } from '../core/types.ts';
import type { Locale } from '../ui/i18n/index.ts';
import { logShort, shortError } from './log.ts';
import {
  MAX_SIGNATURE_CHARS,
  buildComparePrompt,
  buildCustomerUpdatePrompt,
  buildDraftAnswerPrompt,
  buildSignaturePrompt,
  fallbackCustomerUpdate,
  fallbackDraftAnswer,
} from './field.ts';
import type {
  ChatOptions,
  DraftStats,
  LlmChat,
  LlmDeps,
  LlmSignature,
  LlmSignatureInput,
  PromptMessage,
} from './jira-types.ts';

/** Messages et gabarits du modèle : réexportés pour la couche appelante. */
export type {
  ChatOptions,
  DraftStats,
  LlmChat,
  LlmDeps,
  LlmSignature,
  LlmSignatureInput,
  PromptMessage as LlmMessage,
} from './jira-types.ts';
/** Constantes et fabriques du modèle : réexportées depuis `field.ts`. */
export { MAX_SIGNATURE_CHARS } from './field.ts';
export {
  buildComparePrompt,
  buildCustomerUpdatePrompt,
  buildDraftAnswerPrompt,
  buildSignaturePrompt,
  fallbackCustomerUpdate,
  fallbackDraftAnswer,
} from './field.ts';

/** Modèle Forge déclaré dans le manifeste (`llm` de `manifest.yml`). */
export const DEFAULT_MODEL = 'claude';

/** Longueur maximale d'un brouillon renvoyé. */
export const MAX_DRAFT_CHARS = 1500;

/** Débit : 100 requêtes/min par installation, on reste sous la limite (§16). */
export const MAX_CALLS_PER_MINUTE = 90;

/** Fenêtre de débit, en millisecondes (§16). */
const RATE_WINDOW_MS = 60_000;

/** Attente maximale : on ne retarde jamais un ticket au-delà du délai (§17, PC-07). */
const MAX_RATE_WAIT_MS = 10_000;

/** Instants des derniers appels, pour borner le débit (§16). */
const callTimes: number[] = [];

/** Modèle effectivement utilisé (mémorisé après un changement). */
let resolvedModel: string | null = null;

// ---------------------------------------------------------------------------
// Extraction de signature (§8.2)
// ---------------------------------------------------------------------------

/**
 * Ramène le texte d'un ticket au triplet système / symptôme / déclencheur.
 *
 * Le modèle choisit **d'abord** dans le vocabulaire fourni ; un terme nouveau
 * n'est créé que si aucun ne convient. La température est 0 et le résultat est
 * mis en cache par empreinte du texte : un ticket n'est soumis qu'une fois,
 * sauf modification de sa description.
 */
export async function extractSignature(
  input: LlmSignatureInput,
  deps: LlmDeps = {},
): Promise<LlmSignature> {
  const text = (input.text ?? '').slice(0, MAX_SIGNATURE_CHARS);
  const cache = deps.cache ?? input.cache;
  const key = cacheKeyFor(text, input.projectLanguage);
  const cached = cache?.get(key);
  if (cached) return cached;
  const messages = buildSignaturePrompt({ ...input, text });
  try {
    const raw = await callModel(deps, messages, { temperature: 0, maxTokens: 400 });
    const parsed = parseSignatureJson(raw);
    if (!parsed) {
      logShort('llm : signature illisible, repli déterministe');
      return fallbackSignature({ ...input, text });
    }
    cache?.set(key, parsed);
    return parsed;
  } catch (error) {
    logShort(`llm : signature ${shortError(error)}`);
    return fallbackSignature({ ...input, text });
  }
}

/** Sortie du modèle ramenée à une signature ; `null` si elle est illisible. */
export function parseSignatureJson(raw: string): LlmSignature | null {
  const record = asRecord(extractJsonObject(raw));
  if (!record) return null;
  const undetermined = record['undetermined'] === true;
  const language = typeof record['language'] === 'string' ? record['language'] : null;
  if (undetermined) return { system: '', symptom: '', trigger: '', undetermined: true, language };
  const system = asText(record['system']);
  const symptom = asText(record['symptom']);
  if (!system || !symptom) return null;
  return { system, symptom, trigger: asText(record['trigger']), undetermined: false, language };
}

/**
 * Repli déterministe de la signature : on cherche un terme du vocabulaire
 * dans le texte, puis on s'appuie sur les indices certains (§8.2).
 */
export function fallbackSignature(input: LlmSignatureInput): LlmSignature {
  const text = (input.text ?? '').trim();
  const system = matchTerm(text, input.vocabulary?.systems) ?? firstClue(input.hardClues);
  const symptom = matchTerm(text, input.vocabulary?.symptoms) ?? input.hardClues?.errorCodes?.[0] ?? '';
  const trigger = firstSentence(text);
  const undetermined = isTooShort(text) || !system || !symptom;
  return { system, symptom, trigger, undetermined, language: input.projectLanguage };
}

/** Premier terme du vocabulaire dont le libellé apparaît dans le texte. */
function matchTerm(text: string, terms: readonly { label: string }[] | undefined): string | null {
  const haystack = text.toLowerCase();
  for (const term of terms ?? []) {
    const label = term.label.trim().toLowerCase();
    if (label.length >= 3 && haystack.includes(label)) return term.label.trim();
  }
  return null;
}

/** Premier indice certain disponible, dans l'ordre du cahier (§8.2). */
function firstClue(clues: HardClues | undefined): string {
  if (!clues) return '';
  return clues.service ?? clues.component ?? clues.requestType ?? '';
}

/** Première phrase du texte, limitée à 120 caractères. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const stop = flat.search(/[.!?\n]/);
  const sentence = stop > 0 ? flat.slice(0, stop) : flat;
  return sentence.slice(0, 120).trim();
}

/** Un texte trop court ne permet aucune signature (§18). */
function isTooShort(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  return words.length < 5;
}

// ---------------------------------------------------------------------------
// Comparaison ticket ↔ problème (§8.4)
// ---------------------------------------------------------------------------

/**
 * Le modèle compare un ticket à la fiche d'un problème et répond oui ou non,
 * avec une phrase de justification (§8.4). Repli déterministe si le modèle
 * échoue ou rend du JSON invalide.
 */
export async function compareTicketToProblem(
  ticketText: string,
  problem: Problem,
  deps: LlmDeps = {},
): Promise<{ same: boolean; rationale: string }> {
  const messages = buildComparePrompt(ticketText, problem);
  try {
    const raw = await callModel(deps, messages, { temperature: 0, maxTokens: 300 });
    const parsed = parseCompareJson(raw);
    if (!parsed) {
      logShort('llm : comparaison illisible, repli déterministe');
      return fallbackCompare(ticketText, problem);
    }
    return parsed;
  } catch (error) {
    logShort(`llm : comparaison ${shortError(error)}`);
    return fallbackCompare(ticketText, problem);
  }
}

/** Sortie du modèle ramenée à une réponse de comparaison ; `null` si invalide. */
export function parseCompareJson(raw: string): { same: boolean; rationale: string } | null {
  const record = asRecord(extractJsonObject(raw));
  if (!record) return null;
  const same = record['same'];
  if (typeof same !== 'boolean') return null;
  const rationale = asText(record['rationale']);
  if (!rationale) return null;
  return { same, rationale: rationale.slice(0, 300) };
}

/**
 * Repli déterministe de la comparaison : le ticket mentionne-t-il le
 * déclencheur connu ? Sinon, aucun rattachement automatique.
 */
export function fallbackCompare(
  ticketText: string,
  problem: Problem,
): { same: boolean; rationale: string } {
  const trigger = normalizeTrigger(problem.triggerText);
  const text = normalizeTrigger(ticketText);
  const same = trigger.length >= 12 && text.includes(trigger);
  return {
    same,
    rationale: same
      ? 'The ticket repeats the known trigger of the problem (deterministic fallback).'
      : 'No decisive clue without the model: the ticket is not attached automatically (deterministic fallback).',
  };
}

// ---------------------------------------------------------------------------
// Brouillons (§7.4, §17) — jamais envoyés
// ---------------------------------------------------------------------------

/**
 * Brouillon de réponse à un client : il n'est **jamais envoyé** par l'app, un
 * agent le relit et l'envoie (§7.4, §17).
 */
export async function draftAnswer(
  problem: Problem,
  ticketSummary: string,
  locale: Locale,
  deps: LlmDeps = {},
): Promise<string> {
  const messages = buildDraftAnswerPrompt(problem, ticketSummary, locale);
  try {
    const raw = await callModel(deps, messages, { temperature: 0, maxTokens: 600 });
    const text = raw.trim().slice(0, MAX_DRAFT_CHARS);
    if (text.length === 0) return fallbackDraftAnswer(problem, ticketSummary, locale);
    return text;
  } catch (error) {
    logShort(`llm : brouillon de réponse ${shortError(error)}`);
    return fallbackDraftAnswer(problem, ticketSummary, locale);
  }
}

/**
 * Brouillon groupé pour les personnes touchées par un problème (§7.4).
 * `source` dit si le texte vient du modèle ou d'un gabarit.
 */
export async function draftCustomerUpdate(
  problem: Problem,
  stats: DraftStats,
  locale: Locale,
  deps: LlmDeps = {},
): Promise<CustomerUpdateDraft> {
  const messages = buildCustomerUpdatePrompt(problem, stats, locale);
  try {
    const raw = await callModel(deps, messages, { temperature: 0, maxTokens: 800 });
    const parsed = parseCustomerUpdateJson(raw);
    if (!parsed) {
      logShort('llm : brouillon client illisible, gabarit déterministe');
      return fallbackCustomerUpdate(problem, stats, locale);
    }
    return {
      problemKey: problem.issueKey ?? problem.id,
      subject: parsed.subject,
      body: parsed.body,
      openTickets: stats.openTickets,
      meToo: stats.meToo,
      source: 'model',
    };
  } catch (error) {
    logShort(`llm : brouillon client ${shortError(error)}`);
    return fallbackCustomerUpdate(problem, stats, locale);
  }
}

/** Sortie du modèle ramenée à un objet `{subject, body}` ; `null` si invalide. */
export function parseCustomerUpdateJson(raw: string): { subject: string; body: string } | null {
  const record = asRecord(extractJsonObject(raw));
  if (!record) return null;
  const subject = asText(record['subject']);
  const body = asText(record['body']);
  if (!subject || !body) return null;
  return { subject: subject.slice(0, 200), body: body.slice(0, MAX_DRAFT_CHARS) };
}

// ---------------------------------------------------------------------------
// Cache, JSON, appel au modèle
// ---------------------------------------------------------------------------

/** Clé de cache d'une signature : empreinte du texte et langue du projet. */
export function cacheKeyFor(text: string, language: Locale): string {
  return `${language}:${fingerprint(text)}`;
}

/** Empreinte stable et rapide d'un texte (FNV-1a + longueur). */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

/** Objet JSON trouvé dans une réponse de modèle, code fences comprises. */
export function extractJsonObject(raw: string): unknown | null {
  const text = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/** Enveloppe JSON valide, ou `null`. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Texte court extrait d'une valeur JSON. */
function asText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 200);
}

/** Appel au modèle : client injecté, sinon Forge. */
async function callModel(
  deps: LlmDeps,
  messages: PromptMessage[],
  options: ChatOptions,
): Promise<string> {
  if (deps.chat) return deps.chat(messages, options);
  return chatWithForge(messages, options);
}

/** Appel au modèle Forge, avec repli sur le premier modèle actif si besoin. */
async function chatWithForge(messages: PromptMessage[], options: ChatOptions): Promise<string> {
  await waitForRateSlot();
  const llm = await import('@forge/llm');
  const model = resolvedModel ?? DEFAULT_MODEL;
  try {
    return readContent(await llm.chat({ model, ...forgeRequest(messages, options) }));
  } catch (error) {
    const fallback = resolvedModel ? null : await firstActiveModel(llm);
    if (!fallback || fallback === model) throw error;
    resolvedModel = fallback;
    logShort('llm : changement de modèle');
    return readContent(await llm.chat({ model: fallback, ...forgeRequest(messages, options) }));
  }
}

/** Corps de la requête envoyée à Forge. */
function forgeRequest(messages: PromptMessage[], options: ChatOptions): Omit<Prompt, 'model'> {
  const payload = messages.map((message) =>
    message.role === 'system'
      ? { role: 'system' as const, content: message.content }
      : { role: 'user' as const, content: message.content },
  );
  return {
    messages: payload,
    temperature: options.temperature,
    max_completion_tokens: options.maxTokens,
  };
}

/** Texte rendu par le modèle. */
function readContent(response: { choices?: { message?: { content?: unknown } }[] }): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        const record = asRecord(part);
        return record && typeof record['text'] === 'string' ? record['text'] : '';
      })
      .join('')
      .trim();
  }
  return '';
}

/** Premier modèle actif proposé par la plateforme. */
async function firstActiveModel(
  llm: { list: () => Promise<{ models?: { model: string; status?: string }[] }> },
): Promise<string | null> {
  try {
    const list = await llm.list();
    return list.models?.find((model) => model.status === 'active')?.model ?? null;
  } catch {
    return null;
  }
}

/** Attend un créneau de débit : 90 requêtes/min, sous la limite (§16). */
async function waitForRateSlot(): Promise<void> {
  const now = Date.now();
  for (;;) {
    const oldest = callTimes[0];
    if (oldest === undefined || now - oldest < RATE_WINDOW_MS) break;
    callTimes.shift();
  }
  if (callTimes.length < MAX_CALLS_PER_MINUTE) {
    callTimes.push(now);
    return;
  }
  const wait = (callTimes[0] ?? now) + RATE_WINDOW_MS - now;
  if (wait <= 0 || wait > MAX_RATE_WAIT_MS) {
    callTimes.push(now);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, wait));
  callTimes.push(Date.now());
}
