/**
 * Conversions entre les lignes SQL et les valeurs du domaine.
 *
 * Une seule implémentation par conversion : toute la couche de stockage s'en
 * sert (règle « zéro duplication »). Aucune de ces fonctions ne jette : une
 * valeur illisible retombe sur son défaut, comme dans `core/`.
 */

import type { BillPeriod, Confidence, MembershipBasis } from '../../core/types';
import { BILL_PERIODS, CONFIDENCES, MEMBERSHIP_BASES } from '../../core/types';
import { parseIso } from '../../core/time';

/** Valeur liée à une requête : jamais de chaîne concaténée dans le SQL. */
export type SqlParam = string | number | boolean | null;

/** Jeu de valeurs liées, dans l'ordre des `?` de la requête. */
export type SqlParams = SqlParam[];

/** Date plancher utilisée quand une date d'entrée est illisible. */
export const DB_EPOCH = '1970-01-01 00:00:00.000';

/** Vrai/1/« true » → `true` ; tout le reste → `fallback`. */
export function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === '1' || text === 'true') return true;
    if (text === '0' || text === 'false' || text === '') return false;
  }
  return fallback;
}

/** Nombre sûr ; une valeur non finie retombe sur `fallback`. */
export function toNumber(value: unknown, fallback = 0): number {
  const parsed = toNumberOrNull(value);
  return parsed === null ? fallback : parsed;
}

/** Nombre sûr ou `null` (colonnes nullables). */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Texte sûr ; `null` devient la chaîne vide. */
export function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Texte ou `null` (colonnes nullables). */
export function toTextOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Date SQL → ISO 8601 UTC ; une `DATETIME` sans fuseau est lue comme UTC. */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const date = parseIso(normalized);
  return date ? date.toISOString() : null;
}

/** ISO 8601 → `DATETIME(3)` UTC, ou `null` si la date est illisible. */
export function toDbDate(value: string | null | undefined): string | null {
  const date = parseIso(value);
  if (!date) return null;
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/** Comme `toDbDate`, mais rend toujours une date (colonnes `NOT NULL`). */
export function toDbDateRequired(value: string | null | undefined): string {
  return toDbDate(value) ?? DB_EPOCH;
}

/** Booléen → entier MySQL. */
export function toDbBool(value: boolean | undefined): number {
  return value === true ? 1 : 0;
}

/** Valeur → JSON sérialisé, ou `null` (colonnes JSON nullables). */
export function toJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/** JSON SQL → valeur typée ; accepte une chaîne ou un objet déjà analysé. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    if (value.length === 0) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Liste de chaînes issue d'une colonne JSON, vide si le contenu est douteux. */
export function toStringArray(value: unknown): string[] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

/** Une valeur d'union de chaînes lue en base, ou `fallback` si inconnue. */
export function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = typeof value === 'string' ? value : '';
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

/** Période d'addition lue en base (§9). */
export function toPeriod(value: unknown): BillPeriod {
  return pickOne<BillPeriod>(value, BILL_PERIODS, '30d');
}

/** Base d'un rattachement lue en base (§8.4). */
export function toBasis(value: unknown): MembershipBasis {
  return pickOne<MembershipBasis>(value, MEMBERSHIP_BASES, 'similarity');
}

/** Confiance lue en base ; une valeur inconnue retombe sur « moyenne ». */
export function toConfidence(value: unknown): Confidence {
  return pickOne<Confidence>(value, CONFIDENCES, 'medium');
}
