/**
 * Aides communes pour les handlers Forge Resolver (§13, §14, WP-L).
 *
 * Règles :
 * - validation défensive des charges utiles sans jeter ;
 * - aucun calcul lourd : délégation aux repos et modules core purs ;
 * - extraction des paramètres avec replis sûrs.
 */

import type { BillLineKey, DataQuality, Settings, Thresholds } from '../core/types';
import { BILL_LINE_KEYS } from '../core/types';
import {
  countClusters,
  countOpenProblems,
  countSignatures,
  countTickets,
  getBootstrapProgress,
} from '../platform/db/repos';
import type { Locale } from '../ui/i18n/index';
import { DEFAULT_LOCALE, localeFrom } from '../ui/i18n/index';

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

export function readString(record: JsonRecord, key: string, fallback = ''): string {
  const v = record[key];
  return typeof v === 'string' ? v.trim() : fallback;
}

export function readStringArray(record: JsonRecord, key: string): string[] {
  const v = record[key];
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function readNumber(record: JsonRecord, key: string, fallback: number, max = 100000): number {
  const raw = record[key];
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function readBool(record: JsonRecord, key: string, fallback: boolean): boolean {
  const raw = record[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

export function extractLocale(context: unknown): Locale {
  const rec = asRecord(context);
  const raw = typeof rec['locale'] === 'string' ? rec['locale'] : null;
  return raw ? localeFrom(raw) : DEFAULT_LOCALE;
}

export function readThresholds(raw: unknown, fallback: Thresholds): Thresholds {
  const record = asRecord(raw);
  return {
    tickets: readNumber(record, 'tickets', fallback.tickets, 10000),
    hours: readNumber(record, 'hours', fallback.hours, 100000),
    people: readNumber(record, 'people', fallback.people, 100000),
    windowDays: readNumber(record, 'windowDays', fallback.windowDays, 365),
  };
}

export function readBillLines(raw: unknown, fallback: BillLineKey[]): BillLineKey[] {
  if (!Array.isArray(raw)) return fallback;
  const known = new Set<string>(BILL_LINE_KEYS);
  const kept = raw.filter((key): key is BillLineKey => typeof key === 'string' && known.has(key));
  return kept.length > 0 ? kept : fallback;
}

export async function buildDataQuality(projectId: string, settings: Settings): Promise<DataQuality> {
  const [ticketsIndexed, signatures, clusters, problemsOpen, bootstrap] = await Promise.all([
    countTickets(projectId),
    countSignatures(projectId),
    countClusters(projectId),
    countOpenProblems(projectId),
    getBootstrapProgress(projectId),
  ]);
  const enabled = new Set<string>(settings.enabledLines);
  const missing = BILL_LINE_KEYS.filter((key) => !enabled.has(key));
  return {
    ticketsIndexed,
    signaturesExtracted: signatures.total,
    undetermined: signatures.undetermined,
    problemsOpen,
    clusters: clusters.total,
    lastSyncAt: bootstrap?.updatedAt ?? null,
    bootstrap,
    missing,
  };
}
