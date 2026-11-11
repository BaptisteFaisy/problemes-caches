/**
 * Ce qui sert l'agent Rovo « Problèmes cachés » (§12).
 *
 * Module **pur** (aucun import `@forge/*`, aucune I/O) : il fournit aux
 * actions un résumé de contexte réutilisable (projet, langue, seuils) et les
 * gabarits de réponse. Aucune logique métier n'est dupliquée ici : les seuils
 * viennent de `core/constants.ts`, les conversions de période et les libellés
 * de `core/types.ts` et `ui/format.ts`.
 */

import { DEFAULT_THRESHOLDS, SUSPECT_WINDOW_DAYS } from '../core/constants.ts';
import type { BillPeriod, Problem, ProblemBill, Settings, Thresholds } from '../core/types.ts';
import { defaultSettings } from '../core/types.ts';
import type { Locale } from '../ui/i18n/index.ts';
import { localeFrom } from '../ui/i18n/index.ts';
import { formatHours, formatInt, stateLabel } from '../ui/format.ts';

/** Résumé de contexte que chaque action partage (§12) : projet, langue, seuils. */
export interface AgentContext {
  projectKey: string;
  locale: Locale;
  settings: Settings;
  thresholds: Thresholds;
}

/**
 * Construit le contexte d'une action à partir des réglages lus en base.
 * Sans réglages (projet pas encore configuré), les seuils par défaut du
 * cahier s'appliquent (§8.5) : une action rend des chiffres, jamais une erreur
 * de configuration.
 */
export function agentContext(
  projectKey: string,
  settings: Settings | null,
  rawLocale?: string | null,
): AgentContext {
  const resolved = settings ?? defaultSettings(projectKey, projectKey);
  // `defaultSettings` et le mapper SQL garantissent des seuils complets (§8.5) ;
  // repli sur les constantes du cahier si jamais absents (zéro duplication).
  const thresholds = resolved.thresholds ?? {
    ...DEFAULT_THRESHOLDS,
    windowDays: SUSPECT_WINDOW_DAYS,
  };
  return { projectKey, locale: localeFrom(rawLocale), settings: resolved, thresholds };
}

/**
 * Conversion `days` → période d'addition (§12) : le manifeste n'accepte que
 * 30 ou 90 jours ; au-delà de 60, c'est la fenêtre longue (§9).
 */
export function periodOfDays(days: number): BillPeriod {
  return days >= 60 ? '90d' : '30d';
}

/** L'autre période d'addition : sert au calcul de tendance (§9). */
export function otherPeriod(period: BillPeriod): BillPeriod {
  return period === '30d' ? '90d' : '30d';
}

/**
 * Classement par coût (§9, §12) : heures décroissantes, puis tickets.
 * Même ordre que la requête du repo `listTopProblemsByHours` : appliqué ici
 * une seconde fois, il garantit un rendu stable quel que soit l'ordre reçu.
 */
export function rankByCost<T extends { hours: number; tickets: number }>(bills: readonly T[]): T[] {
  return [...bills].sort((a, b) => b.hours - a.hours || b.tickets - a.tickets);
}

/**
 * Gabarit de réponse de l'agent (§12, §17) : une ligne lisible par problème,
 * avec la méthode implicite portée par l'addition. Jamais de classement
 * d'agents, jamais de ticket masqué listé : l'unité est le problème.
 */
export function formatProblemSummary(
  problem: Problem,
  bill: ProblemBill | null,
  locale: Locale,
): string {
  const key = problem.issueKey ?? problem.id;
  const state = stateLabel(locale, problem.state);
  const trigger = problem.triggerText || (locale === 'fr' ? 'sans déclencheur' : 'no trigger');
  if (!bill) {
    return locale === 'fr' ? `${key} (${state}) : ${trigger}` : `${key} (${state}): ${trigger}`;
  }
  const tickets = formatInt(locale, bill.tickets);
  const hours = formatHours(locale, bill.hours);
  const people = formatInt(locale, bill.people);
  return locale === 'fr'
    ? `${key} (${state}) : ${trigger} — ${tickets} tickets, ${hours} de support, ${people} personnes touchées`
    : `${key} (${state}): ${trigger} — ${tickets} tickets, ${hours} of support, ${people} people affected`;
}
