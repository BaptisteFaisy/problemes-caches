/**
 * Aides pures de la couche plateforme — aucun appel réseau, aucune horloge.
 *
 * Deux familles d'aides vivent ici, pour une seule implémentation de chacune
 * (règle « zéro duplication ») : les **champs** (traduire une réponse Jira ou
 * JSM en information utile) et les **fabriques de messages** (prompts du
 * modèle §8.2/§8.4 et gabarits déterministes §7.4).
 *
 * Le réseau vit dans `jira.ts` et `graph.ts` (§14) ; la mise en forme
 * d'interface dans `src/ui/format.ts`.
 */

import type { CustomerUpdateDraft, HardClues, Problem, Vocabulary } from '../core/types.ts';
import type { Locale } from '../ui/i18n/index.ts';
import { formatHours, formatInt } from '../ui/format.ts';
import type {
  DraftStats,
  JiraIssue,
  JiraIssueFields,
  JiraWorklog,
  JsmRequestDetails,
  JsmSlaCycle,
  LlmSignatureInput,
  PromptMessage,
} from './jira-types.ts';

// ---- Champs Jira et JSM ----

/** Profondeur maximale de parcours d'un document ADF (garde-fou). */
const MAX_DEPTH = 12;

/** Noms candidats du type de demande JSM dans les champs du ticket. */
const REQUEST_TYPE_NAMES = ['Request type', 'Request Type', 'requesttype', 'Type de demande'] as const;

/** Noms candidats du service affecté. */
const SERVICE_NAMES = ['Service', 'Service name', 'Service Name', 'service'] as const;

/** Noms candidats de l'organisation cliente. */
const ORGANIZATION_NAMES = ['Organization', 'Organisation', 'Customer', 'Organization name'] as const;

/**
 * Texte d'une valeur Jira : chaîne simple, objet `{value}`, `{text}` ou
 * document ADF. Les objets `{name}` (composant, type de demande) sont lus aussi.
 */
export function textOf(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > MAX_DEPTH) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => textOf(item, depth + 1))
      .filter((part) => part.length > 0)
      .join(' ')
      .trim();
  }
  if (typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['value', 'text', 'name', 'content'] as const) {
    if (record[key] === undefined) continue;
    const text = textOf(record[key], depth + 1);
    if (text.length > 0) return text;
  }
  return '';
}

/**
 * Texte d'un document ADF (description d'un ticket) : les blocs sont rendus
 * ligne par ligne, les sauts de ligne respectés.
 */
export function adfToText(node: unknown, depth = 0): string {
  if (node === null || node === undefined || depth > MAX_DEPTH) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) {
    return node
      .map((item) => adfToText(item, depth + 1))
      .filter((part) => part.length > 0)
      .join('\n')
      .trim();
  }
  if (typeof node !== 'object') return '';
  const record = node as Record<string, unknown>;
  const type = typeof record['type'] === 'string' ? (record['type'] as string) : '';
  if (type === 'text') return typeof record['text'] === 'string' ? record['text'] : '';
  if (type === 'hardBreak') return '\n';
  return adfToText(record['content'], depth + 1);
}

/**
 * Première valeur non vide parmi des noms de champs candidats ; la recherche
 * exacte passe avant la recherche insensible à la casse.
 */
export function pickField(fields: JiraIssueFields | undefined, names: readonly string[]): unknown {
  if (!fields) return undefined;
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(fields)) lowered.set(key.toLowerCase(), value);
  for (const name of names) {
    const value = lowered.get(name.toLowerCase());
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** Texte d'un champ parmi des noms candidats. */
export function fieldText(fields: JiraIssueFields | undefined, names: readonly string[]): string | null {
  const text = textOf(pickField(fields, names));
  return text.length > 0 ? text : null;
}

/** Type de demande : l'API JSM d'abord, puis les champs du ticket. */
export function requestTypeOf(
  issue: JiraIssue | null | undefined,
  details?: JsmRequestDetails | null,
): string | null {
  const fromApi = details?.requestType?.name;
  if (fromApi && fromApi.trim().length > 0) return fromApi.trim();
  return fieldText(issue?.fields, REQUEST_TYPE_NAMES);
}

/** Service affecté : champ du ticket ou composante. */
export function serviceOf(issue: JiraIssue | null | undefined): string | null {
  const named = fieldText(issue?.fields, SERVICE_NAMES);
  if (named) return named;
  const components = issue?.fields?.components ?? [];
  const first = components[0];
  return first?.name ? first.name : null;
}

/** Organisation cliente : l'API JSM d'abord, puis les champs du ticket. */
export function organizationOf(
  issue: JiraIssue | null | undefined,
  details?: JsmRequestDetails | null,
): string | null {
  const fromApi = details?.organization?.name;
  if (fromApi && fromApi.trim().length > 0) return fromApi.trim();
  return fieldText(issue?.fields, ORGANIZATION_NAMES);
}

/** Temps saisi sur un ticket (§9) ; `null` quand rien n'est saisi. */
export function worklogSeconds(issue: JiraIssue | null | undefined): number | null {
  return worklogSecondsOf(issue?.fields?.worklog);
}

/** Temps saisi à partir du journal de travail seul ; `null` quand il est vide. */
export function worklogSecondsOf(worklog: JiraWorklog | null | undefined): number | null {
  if (!worklog) return null;
  const logs = worklog.worklogs ?? [];
  const summed = logs.reduce(
    (total, log) => total + (typeof log.timeSpentSeconds === 'number' ? log.timeSpentSeconds : 0),
    0,
  );
  const total = typeof worklog.totalTimeSpentSeconds === 'number' ? worklog.totalTimeSpentSeconds : summed;
  return total > 0 ? total : null;
}

/** Le ticket est-il encore ouvert ? (§5) */
export function isOpenIssue(issue: JiraIssue | null | undefined): boolean {
  const category = issue?.fields?.status?.statusCategory?.key;
  if (!category) return true;
  return category !== 'done';
}

/** Délai de service rompu ? Un cycle avec `breachTime` non nul (§9). */
export function slaBreached(details: JsmRequestDetails | null | undefined): boolean {
  const agreement = details?.serviceLevelAgreement;
  if (!agreement) return false;
  const cycles: JsmSlaCycle[] = [];
  const current = agreement.currentAgreement;
  if (current?.ongoingCycle) cycles.push(current.ongoingCycle);
  if (current?.pausedCycle) cycles.push(current.pausedCycle);
  cycles.push(...(current?.completedCycles ?? []));
  for (const previous of agreement.previousAgreements ?? []) {
    cycles.push(...(previous.completedCycles ?? []));
  }
  return cycles.some((cycle) => Boolean(cycle.breachTime));
}

// ---- Utilitaires purs partagés ----

/** Texte simple en document ADF (commentaires, descriptions de tickets). */
export function toAdf(text: string): Record<string, unknown> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({ type: 'paragraph', content: [{ type: 'text', text: block }] }));
  return { type: 'doc', version: 1, content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }] };
}

/** Découpe un tableau en morceaux de taille bornée (débit, §16). */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, size);
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += step) {
    chunks.push(items.slice(index, index + step));
  }
  return chunks;
}

/** Exécute des tâches en parallèle, sans jamais dépasser `limit` à la fois (§16). */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  const workers = Math.max(1, Math.min(limit, queue.length || 1));
  const runners = Array.from({ length: workers }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      results.push(await task(item));
    }
  });
  await Promise.all(runners);
  return results;
}

// ---- Messages du modèle (§8.2, §8.4) et gabarits déterministes (§7.4) ----

/** Longueur maximale du texte soumis au modèle (§8.2 : texte borné). */
export const MAX_SIGNATURE_CHARS = 1500;

/** Prompt d'extraction : le vocabulaire du projet passe avant toute invention. */
export function buildSignaturePrompt(input: LlmSignatureInput): PromptMessage[] {
  const system = [
    'You extract a signature from a support ticket.',
    'Answer with ONE JSON object and nothing else:',
    '{"system": string, "symptom": string, "trigger": string, "undetermined": boolean}',
    'Rules:',
    '- Choose the system and the symptom in the known vocabulary whenever one fits.',
    '- Only invent a new term when no known term fits.',
    '- The trigger is the condition that makes the problem appear (short phrase, 120 characters max).',
    '- If the text is too short or too vague ("it does not work"), answer undetermined true with empty values.',
    '- Write the three values in the project language.',
  ].join('\n');
  const user = [
    `Project language: ${input.projectLanguage}`,
    vocabularyBlock(input.vocabulary),
    cluesBlock(input.hardClues),
    'Ticket text:',
    (input.text ?? '').slice(0, MAX_SIGNATURE_CHARS),
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Vocabulaire rendu au modèle, une ligne par nature de terme (§8.3). */
function vocabularyBlock(vocabulary: Vocabulary): string {
  const systems = labelsOf(vocabulary?.systems);
  const symptoms = labelsOf(vocabulary?.symptoms);
  return [
    `Known systems: ${systems.length > 0 ? systems.join(' | ') : '(none)'}`,
    `Known symptoms: ${symptoms.length > 0 ? symptoms.join(' | ') : '(none)'}`,
  ].join('\n');
}

/** Libellés utiles d'une liste de termes. */
function labelsOf(terms: readonly { label: string }[] | undefined): string[] {
  return (terms ?? []).map((term) => term.label.trim()).filter((label) => label.length > 0);
}

/** Indices certains rendus au modèle (§8.2). */
function cluesBlock(clues: HardClues): string {
  const parts = [
    `service=${clues.service ?? ''}`,
    `component=${clues.component ?? ''}`,
    `request type=${clues.requestType ?? ''}`,
    `product=${clues.product ?? ''}`,
    `version=${clues.version ?? ''}`,
    `os=${clues.os ?? ''}`,
    `organization=${clues.organization ?? ''}`,
    `error codes=${clues.errorCodes.join(', ')}`,
  ];
  return `Certain clues: ${parts.join('; ')}`;
}

/** Prompt de comparaison : la fiche du problème et le texte du ticket (§8.4). */
export function buildComparePrompt(ticketText: string, problem: Problem): PromptMessage[] {
  const system = [
    'You compare a support ticket with a known problem.',
    'Answer with ONE JSON object and nothing else: {"same": boolean, "rationale": string}',
    'Rules:',
    '- Answer true only when the ticket describes the same underlying cause.',
    '- The rationale is ONE short sentence that justifies the answer.',
    '- Never invent a fact that is not in the ticket or in the problem sheet.',
  ].join('\n');
  const user = [
    [
      'Known problem:',
      `key: ${problem.issueKey ?? problem.id}`,
      `state: ${problem.state}`,
      `system: ${problem.systemId}`,
      `symptom: ${problem.symptomId}`,
      `trigger: ${problem.triggerText}`,
      `cause: ${problem.cause ?? ''}`,
      `workaround: ${problem.workaround ?? ''}`,
    ].join('\n'),
    'Ticket text:',
    ticketText.slice(0, MAX_SIGNATURE_CHARS),
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Prompt du brouillon de réponse (§7.4). */
export function buildDraftAnswerPrompt(
  problem: Problem,
  ticketSummary: string,
  locale: Locale,
): PromptMessage[] {
  const system = [
    `You write the answer an agent will review before sending to a customer. Write in ${locale}.`,
    'Rules:',
    '- Four short sentences maximum.',
    '- Never promise a date that is not confirmed in the problem sheet.',
    '- Say that the request is already followed as a known problem.',
  ].join('\n');
  const user = [
    [
      `Problem: ${problem.issueKey ?? problem.id}`,
      `state: ${problem.state}`,
      `trigger: ${problem.triggerText}`,
      `cause: ${problem.cause ?? ''}`,
      `workaround: ${problem.workaround ?? ''}`,
      `fix: ${problem.fixIssueKey ?? ''}`,
    ].join('\n'),
    'Ticket:',
    ticketSummary.slice(0, MAX_SIGNATURE_CHARS),
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Prompt du brouillon client : un objet JSON, sinon le gabarit prend le relais (§7.4). */
export function buildCustomerUpdatePrompt(
  problem: Problem,
  stats: DraftStats,
  locale: Locale,
): PromptMessage[] {
  const system = [
    `You write a grouped message for the customers affected by a known problem. Write in ${locale}.`,
    'Answer with ONE JSON object and nothing else: {"subject": string, "body": string}',
    'Rules:',
    '- The body is plain text, a few lines, addressed to the customers.',
    '- Never promise a date that is not confirmed in the problem sheet.',
    '- Do not name the agents and do not name the customers.',
  ].join('\n');
  const user = [
    [
      `Problem: ${problem.issueKey ?? problem.id}`,
      `state: ${problem.state}`,
      `trigger: ${problem.triggerText}`,
      `cause: ${problem.cause ?? ''}`,
      `workaround: ${problem.workaround ?? ''}`,
      `fix: ${problem.fixIssueKey ?? ''}`,
      `open requests: ${stats.openTickets}`,
      `me too: ${stats.meToo}`,
      `people: ${stats.people}`,
      `support hours: ${stats.hours}`,
      `fix date: ${stats.fixDate ?? ''}`,
    ].join('\n'),
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Ligne de gabarit localisée (contournement, correctif) ; vide si sans valeur. */
function labeled(locale: Locale, frLabel: string, enLabel: string, value: string): string {
  if (!value) return '';
  return locale === 'fr' ? `${frLabel} : ${value}` : `${enLabel}: ${value}`;
}

/**
 * Repli par gabarit du brouillon de réponse (§7.4). Le résumé du ticket n'y
 * figure pas : le gabarit ne cite aucun texte de client (§17, vie privée).
 */
export function fallbackDraftAnswer(
  problem: Problem,
  ticketSummary: string,
  locale: Locale,
): string {
  const symptom = problem.triggerText || problem.symptomId || problem.systemId;
  const workaround = labeled(locale, 'Contournement', 'Workaround', problem.workaround ?? '');
  const lines = locale === 'fr'
    ? [
        'Bonjour,',
        '',
        `Nous suivons un problème connu qui correspond à votre demande : ${symptom}.`,
        workaround,
        'Notre équipe s’en occupe ; nous mettrons cette demande à jour dès que nous aurons du nouveau.',
        '',
        '— Support',
      ]
    : [
        'Hello,',
        '',
        `We are working on a known problem that matches your request: ${symptom}.`,
        workaround,
        'Our team is on it; we will update this request as soon as we have news.',
        '',
        '— Support',
      ];
  return lines.filter((line, index) => line.length > 0 || index === 0).join('\n');
}

/** Repli par gabarit du brouillon client (§7.4) : jamais envoyé par l'app. */
export function fallbackCustomerUpdate(
  problem: Problem,
  stats: DraftStats,
  locale: Locale,
): CustomerUpdateDraft {
  const key = problem.issueKey ?? problem.id;
  const symptom = problem.triggerText || problem.symptomId || problem.systemId;
  const workaround = labeled(locale, 'Contournement', 'Workaround', problem.workaround ?? '');
  const fix = labeled(locale, 'Correctif prévu', 'Fix planned', stats.fixDate ?? '');
  const body = updateBody(locale, {
    key,
    symptom,
    workaround,
    fix,
    tickets: formatInt(locale, stats.openTickets),
    meToo: formatInt(locale, stats.meToo),
    hours: formatHours(locale, stats.hours),
  });
  const subject = locale === 'fr' ? `Point sur le problème connu ${key}` : `Update on known problem ${key}`;
  return {
    problemKey: key,
    subject,
    body,
    openTickets: stats.openTickets,
    meToo: stats.meToo,
    source: 'template',
  };
}

/** Données du gabarit client (§7.4). */
interface UpdateBodyData {
  key: string;
  symptom: string;
  workaround: string;
  fix: string;
  tickets: string;
  meToo: string;
  hours: string;
}

/** Corps du brouillon client, dans la langue demandée (§7.4). */
function updateBody(locale: Locale, data: UpdateBodyData): string {
  const symptomLine = locale === 'fr' ? `Symptôme : ${data.symptom}` : `Symptom: ${data.symptom}`;
  const lines = locale === 'fr'
    ? [
        'Bonjour,',
        `Nous suivons un problème connu (${data.key}) qui touche votre service.`,
        'Ce que nous savons :',
        `- ${data.tickets} demandes ouvertes et ${data.meToo} « moi aussi » sont regroupées sous ce problème.`,
        `- Temps de support à ce jour : ${data.hours}.`,
        symptomLine,
        data.workaround,
        data.fix,
        'Notre équipe s’en occupe ; nous vous tiendrons informés.',
        '— Support',
      ]
    : [
        'Hello,',
        `We are working on a known problem (${data.key}) that affects your service.`,
        'What we know so far:',
        `- ${data.tickets} open requests and ${data.meToo} additional “me too” reports are grouped under this problem.`,
        `- Support time so far: ${data.hours}.`,
        symptomLine,
        data.workaround,
        data.fix,
        'Our team is working on it; we will keep you informed.',
        '— Support',
      ];
  return lines.filter((line) => line.length > 0).join('\n');
}
