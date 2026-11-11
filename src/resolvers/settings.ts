/**
 * Resolvers des réglages et du vocabulaire tenu (§8.3, §13 écran 5, PC-02).
 *
 * Expose : `getSettings`, `saveSettings`, `listVocabulary`, `renameTerm`,
 * `mergeTerms`, `splitTerm`, `getDataQuality`.
 *
 * §8.3 : toute fusion regroupe les tickets concernés **sans rien recalculer** —
 * les signatures restent en place, la chaîne `merged_into` fait le lien.
 */

import type { DataQuality, Settings, Term, Vocabulary } from '../core/types.ts';
import { defaultSettings } from '../core/types.ts';
import { planMerge, planSplit, renamePlan } from '../core/vocabulary.ts';
import {
  applyTermMerge,
  getSettings as readSettings,
  getSignature,
  getTerm,
  listSignatures,
  listTerms,
  upsertSettings,
  upsertSignature,
  upsertTerm,
} from '../platform/db/repos.ts';
import type { VocabularyResult } from '../ui/api.ts';
import {
  asRecord,
  buildDataQuality,
  readBillLines,
  readBool,
  readNumber,
  readString,
  readStringArray,
  readThresholds,
  type JsonRecord,
} from './helpers.ts';

type ResolverReq = { payload?: unknown; context?: unknown };

export async function getSettings(req: ResolverReq): Promise<Settings> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  const stored = projectId ? await readSettings(projectId) : null;
  return stored ?? defaultSettings(projectId, projectKeyOf(req, stored));
}

/** Clé du projet : réglages connus d'abord, contexte du module ensuite. */
function projectKeyOf(req: ResolverReq, stored: Settings | null): string {
  if (stored) return stored.projectKey;
  const context = asRecord(req.context);
  const extension = asRecord(context['extension']);
  const project = asRecord(extension['project']);
  return typeof project['key'] === 'string' ? project['key'] : '';
}

export async function saveSettings(req: ResolverReq): Promise<Settings> {
  const p = asRecord(req.payload);
  const raw = asRecord(p['settings']);
  const projectId = readString(raw, 'projectId');
  if (!projectId) throw new Error('settings.projectId est requis');
  const stored = (await readSettings(projectId)) ?? defaultSettings(projectId, readString(raw, 'projectKey'));
  const next = sanitizeSettings(raw, stored);
  await upsertSettings(next);
  return next;
}

/** Réglages validés champ par champ : une valeur illisible garde l'ancienne (§13.5). */
function sanitizeSettings(raw: JsonRecord, fallback: Settings): Settings {
  const hourRateRaw = raw['hourRateEur'];
  const hourRate = typeof hourRateRaw === 'number' && Number.isFinite(hourRateRaw) && hourRateRaw > 0
    ? hourRateRaw
    : null;
  const issueType = readString(raw, 'problemIssueType') || null;
  return {
    projectId: readString(raw, 'projectId', fallback.projectId),
    projectKey: readString(raw, 'projectKey', fallback.projectKey),
    thresholds: readThresholds(raw['thresholds'], fallback.thresholds),
    minutesPerTouch: readNumber(raw, 'minutesPerTouch', fallback.minutesPerTouch, 240),
    hourRateEur: hourRateRaw === null ? null : (hourRate ?? fallback.hourRateEur),
    problemIssueType: issueType,
    portalServices: readStringArray(raw, 'portalServices'),
    surgeFactor: readNumber(raw, 'surgeFactor', fallback.surgeFactor, 100),
    surgeWindowMinutes: readNumber(raw, 'surgeWindowMinutes', fallback.surgeWindowMinutes, 1440),
    watchDays: readNumber(raw, 'watchDays', fallback.watchDays, 90),
    enabledLines: readBillLines(raw['enabledLines'], fallback.enabledLines),
    demoData: readBool(raw, 'demoData', fallback.demoData),
  };
}

export async function listVocabulary(req: ResolverReq): Promise<Vocabulary> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  return loadVocabulary(projectId);
}

/** Vocabulaire complet d'un projet : systèmes d'abord, symptômes ensuite (§8.3). */
async function loadVocabulary(projectId: string): Promise<Vocabulary> {
  if (!projectId) return { systems: [], symptoms: [] };
  const terms = await listTerms(projectId);
  return {
    systems: terms.filter((term) => term.kind === 'system'),
    symptoms: terms.filter((term) => term.kind === 'symptom'),
  };
}

export async function renameTerm(req: ResolverReq): Promise<VocabularyResult> {
  const p = asRecord(req.payload);
  const termId = readString(p, 'termId');
  const label = readString(p, 'label');
  const term = await getTerm(termId);
  if (!term) throw new Error(`Terme introuvable : ${termId}`);
  if (!label) throw new Error('Le nouveau libellé est requis');
  await upsertTerm(renamePlan(term, label));
  return { vocabulary: await loadVocabulary(term.projectId), regroupedTickets: 0 };
}

export async function mergeTerms(req: ResolverReq): Promise<VocabularyResult> {
  const p = asRecord(req.payload);
  const termIds = readStringArray(p, 'termIds');
  const keepId = readString(p, 'keepId');
  if (termIds.length < 2 || !keepId) throw new Error('termIds (2 minimum) et keepId sont requis');
  const keeper = await getTerm(keepId);
  if (!keeper) throw new Error(`Terme conservé introuvable : ${keepId}`);
  const terms = await listTerms(keeper.projectId);
  const planned = planMerge(terms, termIds, keepId);
  await applyTermMerge(planned.filter((term) => termIds.includes(term.id)));
  const regrouped = await countSignaturesOfTerms(keeper.projectId, termIds, keeper.kind);
  return { vocabulary: await loadVocabulary(keeper.projectId), regroupedTickets: regrouped };
}

/**
 * Tickets regroupés par une fusion (§8.3) : ceux dont la signature porte l'un
 * des termes fusionnés. Aucun recalcul d'addition — simple comptage de lecture.
 */
async function countSignaturesOfTerms(projectId: string, termIds: string[], kind: Term['kind']): Promise<number> {
  const ids = new Set(termIds);
  const signatures = await listSignatures(projectId);
  return signatures.filter((sig) =>
    kind === 'system' ? ids.has(sig.systemId) : ids.has(sig.symptomId),
  ).length;
}

export async function splitTerm(req: ResolverReq): Promise<VocabularyResult> {
  const p = asRecord(req.payload);
  const termId = readString(p, 'termId');
  const issueIds = readStringArray(p, 'issueIds');
  const label = readString(p, 'label');
  const term = await getTerm(termId);
  if (!term) throw new Error(`Terme introuvable : ${termId}`);
  if (!label) throw new Error('Le libellé du terme scindé est requis');
  const now = new Date().toISOString();
  const { kept, created } = planSplit(term, label, now);
  await upsertTerm(kept);
  await upsertTerm(created);
  await moveSignatures(term.projectId, term, created.id, issueIds);
  return { vocabulary: await loadVocabulary(term.projectId), regroupedTickets: issueIds.length };
}

/** Bascule les signatures des tickets choisis sur le terme créé (§8.3, §18). */
async function moveSignatures(
  projectId: string,
  term: Term,
  newTermId: string,
  issueIds: string[],
): Promise<void> {
  for (const issueId of issueIds) {
    const sig = await getSignature(issueId);
    if (!sig) continue;
    const next = term.kind === 'system'
      ? { ...sig, systemId: newTermId }
      : { ...sig, symptomId: newTermId };
    await upsertSignature(next, projectId);
  }
}

export async function getDataQuality(req: ResolverReq): Promise<DataQuality> {
  const p = asRecord(req.payload);
  const projectId = readString(p, 'projectId');
  const settings = (projectId ? await readSettings(projectId) : null) ?? defaultSettings(projectId, '');
  return buildDataQuality(projectId, settings);
}
