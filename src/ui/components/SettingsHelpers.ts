/**
 * Aide au formulaire des réglages (§13 écran 5). Lecture des champs saisis uniquement :
 * aucune règle métier, aucun calcul de coût ou d'addition n'est fait côté UI (§17).
 */

import { BILL_LINE_KEYS, SUSPECT_WINDOW_DAYS } from '../../core/constants';
import type { BillLineKey, Settings } from '../../core/types';

/** Contenu brut du `Form` Forge : une valeur par `name` de champ. */
export type SettingsFormData = Record<string, unknown>;

/** Découpe une liste saisie (virgules ou retours à la ligne), sans entrées vides ni doublons. */
export function splitCsvList(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/** Entier strictement positif ; garde `fallback` si la saisie est vide ou illisible. */
export function parsePositiveInt(raw: unknown, fallback: number): number {
  const value = toFiniteNumber(raw);
  if (value === null || value <= 0) return fallback;
  return Math.round(value);
}

/** Nombre décimal strictement positif (facteur de flambée, §8.6) ; garde `fallback`. */
export function parsePositiveNumber(raw: unknown, fallback: number): number {
  const value = toFiniteNumber(raw);
  return value !== null && value > 0 ? value : fallback;
}

/** Nombre strictement positif facultatif : chaîne vide → `null` (§9, conversion en euros). */
export function parseOptionalPositive(raw: unknown): number | null {
  const value = toFiniteNumber(raw);
  return value !== null && value > 0 ? value : null;
}

/** Postes de l'addition cochés ; toute valeur hors liste est ignorée (§9). */
export function parseBillLines(raw: unknown, fallback: BillLineKey[]): BillLineKey[] {
  if (!Array.isArray(raw)) return fallback;
  const allowed = new Set<string>(BILL_LINE_KEYS);
  return raw.filter((value): value is BillLineKey => typeof value === 'string' && allowed.has(value));
}

/** Texte saisi, ou `fallback` quand le champ est vide. */
export function parseTextOr(raw: unknown, fallback: string): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text || fallback;
}

/** Texte saisi, ou `null` quand le champ est vide (ex. type de problème non choisi, §10). */
export function parseTextOrNull(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text || null;
}

/**
 * Construit le `Settings` à envoyer à `saveSettings`. La fenêtre des seuils reste à 30 jours
 * (§8.5, `SUSPECT_WINDOW_DAYS`) : elle n'est pas réglable dans l'écran.
 */
export function buildSettingsFromForm(current: Settings, form: SettingsFormData): Settings {
  return {
    ...current,
    projectKey: parseTextOr(form['watchedProject'], current.projectKey),
    thresholds: {
      tickets: parsePositiveInt(form['thresholdTickets'], current.thresholds.tickets),
      hours: parsePositiveInt(form['thresholdHours'], current.thresholds.hours),
      people: parsePositiveInt(form['thresholdPeople'], current.thresholds.people),
      windowDays: SUSPECT_WINDOW_DAYS,
    },
    minutesPerTouch: parsePositiveInt(form['minutesPerTouch'], current.minutesPerTouch),
    hourRateEur: parseOptionalPositive(form['hourRateEur']),
    problemIssueType: parseTextOrNull(form['problemIssueType']),
    portalServices: splitCsvList(form['portalServices']),
    surgeFactor: parsePositiveNumber(form['surgeFactor'], current.surgeFactor),
    surgeWindowMinutes: parsePositiveInt(form['surgeWindowMinutes'], current.surgeWindowMinutes),
    watchDays: parsePositiveInt(form['watchDays'], current.watchDays),
    enabledLines: parseBillLines(form['enabledLines'], current.enabledLines),
  };
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Valeurs initiales du formulaire, dérivées des réglages enregistrés (§13.5).
 * Fonction pure : testable sans rendu, et seule source de l'état initial —
 * l'écran ne recalcule jamais ces valeurs par lui-même (§17).
 */
export function formValuesFromSettings(settings: Settings, projectKey: string): SettingsFormData {
  return {
    watchedProject: settings.projectKey || projectKey,
    thresholdTickets: String(settings.thresholds.tickets),
    thresholdHours: String(settings.thresholds.hours),
    thresholdPeople: String(settings.thresholds.people),
    minutesPerTouch: String(settings.minutesPerTouch),
    hourRateEur: settings.hourRateEur === null ? '' : String(settings.hourRateEur),
    problemIssueType: settings.problemIssueType ?? '',
    portalServices: settings.portalServices.join(', '),
    surgeFactor: String(settings.surgeFactor),
    surgeWindowMinutes: String(settings.surgeWindowMinutes),
    watchDays: String(settings.watchDays),
    enabledLines: [...settings.enabledLines],
  };
}
