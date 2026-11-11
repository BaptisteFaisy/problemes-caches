/**
 * Formatage des données pour l'interface (§17 lisibilité).
 *
 * Une seule implémentation par format (zéro duplication). Ne jette jamais sur
 * une valeur nulle ou douteuse.
 */

import type { Confidence, HoursMethod, MembershipBasis, ProblemState } from '../core/types.ts';
import type { Locale, MessageKey } from './i18n/index.ts';
import { t } from './i18n/index.ts';

/** Nombre entier formaté selon la langue (« 1 200 » en fr, « 1,200 » en en). */
export function formatInt(locale: Locale, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString(locale);
}

/** Heures formatées avec un chiffre après la virgule (« 61 h » ou « 61,5 h »). */
export function formatHours(locale: Locale, hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return t(locale, 'common.hours', { value: '0' });
  const rounded = Math.round(hours * 10) / 10;
  const rendered = rounded.toLocaleString(locale, {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
  return t(locale, 'common.hours', { value: rendered });
}

/** Libellé lisible de l'état d'un problème (§5). */
export function stateLabel(locale: Locale, state: ProblemState): string {
  const map: Record<ProblemState, MessageKey> = {
    suspect: 'common.state.suspect',
    confirmed: 'common.state.confirmed',
    'cause-known': 'common.state.cause-known',
    'workaround-published': 'common.state.workaround-published',
    fixed: 'common.state.fixed',
    verified: 'common.state.verified',
    regression: 'common.state.regression',
  };
  const key = map[state] ?? 'common.unknown';
  return t(locale, key);
}

/** Libellé lisible du niveau de confiance (§8.4). */
export function confidenceLabel(locale: Locale, confidence: Confidence): string {
  const map: Record<Confidence, MessageKey> = {
    high: 'common.confidence.high',
    medium: 'common.confidence.medium',
    low: 'common.confidence.low',
  };
  return t(locale, map[confidence] ?? 'common.confidence.medium');
}

/** Libellé de la base d'un rattachement (§8.4). */
export function basisLabel(locale: Locale, basis: MembershipBasis): string {
  const map: Record<MembershipBasis, MessageKey> = {
    rule: 'common.basis.rule',
    similarity: 'common.basis.similarity',
    human: 'common.basis.human',
  };
  return t(locale, map[basis] ?? 'common.basis.similarity');
}

/** Libellé de la méthode de calcul des heures (§9). */
export function hoursMethodLabel(
  locale: Locale,
  method: HoursMethod,
  touches: number,
  minutes: number,
): string {
  if (method === 'logged') return t(locale, 'problem.hours.logged');
  if (method === 'touches') return t(locale, 'problem.hours.touches', { touches, minutes });
  return t(locale, 'problem.hours.mixed');
}

/** Date ISO → libellé court sans heure. */
export function formatDate(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return t(locale, 'common.unknown');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t(locale, 'common.unknown');
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}
