/**
 * WP-A — Indices certains et signature du ticket (§8.2).
 *
 * Module pur : aucun import `@forge/*`, aucune I/O, aucune horloge implicite
 * (l'heure arrive toujours en paramètre `now`). Seul `node:crypto` est
 * utilisé, pour l'empreinte du texte source (clé du cache, §8.2 étape 3).
 */

import { createHash } from 'node:crypto';

import { UNDETERMINED_ID } from './constants';
import { normalizeTrigger, type HardClues, type TicketSignature } from './types';

// ---------------------------------------------------------------------------
// Entrées du lot (contrats WP-A)
// ---------------------------------------------------------------------------

/** Indices certains fournis par la plate-forme, le graphe ou la saisie. */
export interface ClueInput {
  requestType?: string | null;
  service?: string | null;
  component?: string | null;
  product?: string | null;
  version?: string | null;
  os?: string | null;
  organization?: string | null;
  assets?: readonly string[];
  text: string;
}

/** Tout ce qu'il faut pour figer la signature d'un ticket (§8.2). */
export interface SignatureInput {
  issueId: string;
  systemId: string;
  symptomId: string;
  triggerText: string;
  hardClues: HardClues;
  sourceText: string;
  language?: string | null;
}

// ---------------------------------------------------------------------------
// Bornes et motifs
// ---------------------------------------------------------------------------

/** Toute liste d'indices est bornée à dix entrées (§8.2). */
export const MAX_CLUE_ITEMS = 10;

/** En dessous de cette longueur, le texte utile ne dit rien (§18). */
export const MIN_USEFUL_TEXT_LENGTH = 12;

/** Codes errno retenus : liste fermée, pas de famille « E* » à l'aveugle. */
const ERRNO_CODES: readonly string[] = [
  'EACCES', 'EADDRINUSE', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EAGAIN', 'EBADF', 'EBADMSG',
  'EBUSY', 'ECANCELED', 'ECHILD', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'EDEADLK',
  'EDQUOT', 'EEXIST', 'EFAULT', 'EHOSTUNREACH', 'EINVAL', 'EISDIR', 'ELOOP', 'EMFILE', 'EMLINK',
  'ENAMETOOLONG', 'ENETDOWN', 'ENETRESET', 'ENETUNREACH', 'ENFILE', 'ENOENT', 'ENOMEM',
  'ENOSPC', 'ENOTCONN', 'ENOTDIR', 'ENOTEMPTY', 'ENXIO', 'EOPNOTSUPP', 'EPERM', 'EPIPE',
  'EPROTO', 'EROFS', 'ESPIPE', 'ESRCH', 'ETIMEDOUT', 'ETXTBSY', 'EXDEV',
];

/** Motifs de codes d'erreur, avec la mise en forme canonique attendue. */
const CODE_PATTERNS: readonly { re: RegExp; render: (m: RegExpMatchArray) => string }[] = [
  // Code applicatif du type `ERR-1234`.
  { re: /\bERR-\d{3,}\b/gi, render: (m) => m[0].toUpperCase() },
  // Code hexadécimal Windows du type `0x80070005`.
  { re: /\b0x[0-9a-f]{4,8}\b/gi, render: (m) => `0x${m[0].slice(2).toUpperCase()}` },
  // Statut HTTP explicite : `HTTP 500`, `HTTP/1.1 404`.
  { re: /\bHTTP\s*(?:\/\d(?:\.\d)?\s*)?([45]\d{2})\b/gi, render: (m) => `HTTP ${m[1] ?? ''}` },
  // Statut HTTP annoncé autrement : `status 503`, `erreur 404`.
  {
    re: /\b(?:statut|status|code|erreur)\s*:?\s*([45]\d{2})\b/gi,
    render: (m) => `HTTP ${m[1] ?? ''}`,
  },
  // Code Oracle : `ORA-01234`.
  { re: /\bORA-\d{4,}\b/gi, render: (m) => m[0].toUpperCase() },
  // Exception Java : `java.lang.NullPointerException`.
  { re: /\b(?:[a-z][\w$]*\.){2,}[A-Z][\w$]*(?:Exception|Error)\b/g, render: (m) => m[0] },
  // Exception .NET : `System.NullReferenceException`, `System.IO.FileNotFoundException`.
  {
    re: /\b(?:System|Microsoft)\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\b/g,
    render: (m) => m[0],
  },
  // Classe qualifiée d'un paquet connu : `com.foo.Bar`.
  {
    re: /\b(?:java|javax|com|org|net|microsoft)\.(?:[a-z_$][\w$]*\.)*[A-Z][\w$]*\b/gi,
    render: (m) => m[0],
  },
];

/** Motif des codes errno, construit une fois pour toutes (§8.2). */
const ERRNO_RE = new RegExp(`\\b(?:${ERRNO_CODES.join('|')})\\b`, 'g');

/** Version de logiciel : `v12.3`, `12.3.1`. */
const VERSION_RE = /\bv?(\d{1,4}(?:\.\d{1,4}){1,3})\b/;

/** Systèmes d'exploitation reconnus, libellé canonique associé. */
const OS_NAMES: Readonly<Record<string, string>> = {
  windows: 'Windows',
  win32: 'Windows',
  'windows nt': 'Windows',
  macos: 'macOS',
  'mac os': 'macOS',
  'mac os x': 'macOS',
  osx: 'macOS',
  darwin: 'macOS',
  android: 'Android',
  ios: 'iOS',
  'iphone os': 'iOS',
  ipados: 'iOS',
  linux: 'Linux',
  ubuntu: 'Linux',
  debian: 'Linux',
  fedora: 'Linux',
  centos: 'Linux',
  redhat: 'Linux',
  'red hat': 'Linux',
  suse: 'Linux',
  kernel: 'Linux',
};

/** Version qui suit immédiatement un nom de système d'exploitation. */
const OS_VERSION_RE = /^\s*v?(\d+(?:\.\d+)*)/;

// ---------------------------------------------------------------------------
// Aides internes
// ---------------------------------------------------------------------------

/** Trim, ou `null` si la valeur est vide. */
function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Dédoublonne puis trie : sortie déterministe (§8.2). */
function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Liste d'indices bornée, dédoublonnée et triée (§8.2). */
function boundedList(values: readonly string[]): string[] {
  return uniqueSorted(values.map((v) => v.trim()).filter((v) => v !== '')).slice(0, MAX_CLUE_ITEMS);
}

/** Version normalisée : sans le « v » de tête, telle qu'écrite dans le ticket. */
function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').trim();
}

/** Codes d'erreur repérés par motif dans le texte du ticket (§8.2 étape 1). */
export function extractErrorCodes(text: string): string[] {
  const source = text ?? '';
  const found: string[] = [];
  for (const pattern of CODE_PATTERNS) {
    for (const match of source.matchAll(pattern.re)) {
      found.push(pattern.render(match));
    }
  }
  for (const match of source.matchAll(ERRNO_RE)) {
    found.push(match[0]);
  }
  return boundedList(found);
}

/** Version de logiciel repérée dans le texte, ou `null`. */
export function detectVersion(text: string): string | null {
  const match = VERSION_RE.exec(text ?? '');
  return match ? normalizeVersion(match[1] ?? '') : null;
}

/** Système d'exploitation et sa version, repérés dans le texte, ou `null`. */
export function detectOs(text: string): string | null {
  const source = (text ?? '').toLowerCase();
  let best: { name: string; at: number; end: number } | null = null;
  for (const [needle, label] of Object.entries(OS_NAMES)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const at = source.search(new RegExp(`\\b${escaped}\\b`));
    if (at >= 0 && (best === null || at < best.at)) {
      best = { name: label, at, end: at + needle.length };
    }
  }
  if (!best) return null;
  const version = OS_VERSION_RE.exec((text ?? '').slice(best.end));
  return version ? `${best.name} ${version[1] ?? ''}`.trim() : best.name;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Lit les indices certains du ticket, sans modèle (§8.2 étape 1).
 *
 * Les champs fournis par la plate-forme font foi ; le texte ne sert qu'à
 * combler les cases vides (code d'erreur, version, système d'exploitation).
 */
export function extractHardClues(input: ClueInput): HardClues {
  const text = input.text ?? '';
  return {
    requestType: clean(input.requestType),
    service: clean(input.service),
    component: clean(input.component),
    errorCodes: extractErrorCodes(text),
    product: clean(input.product),
    version: clean(input.version) ?? detectVersion(text),
    os: clean(input.os) ?? detectOs(text),
    assetIds: boundedList(input.assets ?? []),
    organization: clean(input.organization),
  };
}

/**
 * Empreinte du texte source : clé du cache, un ticket n'est resoumis au
 * modèle que si ce texte change (§8.2 étape 3).
 */
export function sourceHash(text: string): string {
  const normalized = (text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Vrai si la signature est indéterminée : terme « undetermined » ou texte
 * utile trop court (« ça ne marche pas »). Jamais regroupé d'office (§18).
 */
export function isUndetermined(sig: {
  systemId: string;
  symptomId: string;
  triggerText: string;
}): boolean {
  if (sig.systemId === UNDETERMINED_ID || sig.symptomId === UNDETERMINED_ID) return true;
  const useful = (sig.triggerText ?? '').trim().replace(/\s+/g, ' ');
  return useful.length < MIN_USEFUL_TEXT_LENGTH;
}

/** Fige la signature d'un ticket à l'instant `now` (§8.2). */
export function buildSignature(input: SignatureInput, now: string): TicketSignature {
  const triggerText = normalizeTrigger(input.triggerText);
  return {
    issueId: input.issueId,
    systemId: input.systemId,
    symptomId: input.symptomId,
    triggerText,
    hardClues: input.hardClues,
    extractedAt: now,
    sourceHash: sourceHash(input.sourceText),
    undetermined: isUndetermined({
      systemId: input.systemId,
      symptomId: input.symptomId,
      triggerText,
    }),
    language: input.language ?? null,
  };
}
