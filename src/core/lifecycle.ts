/**
 * Cycle de vie d'un problème (§5) et surveillance après correction (§7.4, §7.5).
 *
 * Module pur : aucun import `@forge/*`, aucune I/O, aucune horloge implicite
 * (l'heure arrive en paramètre, `now`). Les transitions sont celles du tableau
 * du §5, et rien d'autre : un événement qui ne s'applique pas laisse l'état
 * inchangé plutôt que d'inventer un raccourci.
 */

import { addDays, parseIso } from './time';
import type { Problem, ProblemState, Settings } from './types';

/** Événements qui font avancer un problème (§5). */
export type LifecycleEvent =
  | 'confirm'
  | 'set-cause'
  | 'publish-workaround'
  | 'deliver-fix'
  | 'watch-elapsed'
  | 'new-ticket'
  | 'close'
  | 'reopen';

/**
 * Table des transitions, copiée du §5 et rien d'autre :
 *
 * - suspect → confirmé → cause connue → contournement publié → corrigé → vérifié ;
 * - corrigé ou vérifié + nouveau ticket → régression (§7.5) ;
 * - régression → confirmé (§5 : retour à « Confirmé ») ;
 * - `close` ferme un problème corrigé sans attendre la fin de la surveillance :
 *   décision humaine, tracée comme telle (§7.4) ;
 * - `reopen` rouvre un problème vérifié : un humain a vu revenir le symptôme.
 *
 * Toute autre combinaison est refusée : `nextState` rend l'état de départ.
 */
const TRANSITIONS: Readonly<Record<ProblemState, Partial<Record<LifecycleEvent, ProblemState>>>> = {
  suspect: { confirm: 'confirmed' },
  confirmed: { 'set-cause': 'cause-known' },
  'cause-known': { 'publish-workaround': 'workaround-published' },
  'workaround-published': { 'deliver-fix': 'fixed' },
  fixed: { 'watch-elapsed': 'verified', close: 'verified', 'new-ticket': 'regression' },
  verified: { reopen: 'confirmed', 'new-ticket': 'regression' },
  regression: { confirm: 'confirmed', 'new-ticket': 'confirmed' },
};

/** État suivant pour un événement donné ; inchangé si l'événement ne s'applique pas (§5). */
export function nextState(current: ProblemState, event: LifecycleEvent): ProblemState {
  return TRANSITIONS[current]?.[event] ?? current;
}

/** La transition directe existe-t-elle dans le tableau du §5 ? */
export function canTransition(from: ProblemState, to: ProblemState): boolean {
  const targets = TRANSITIONS[from];
  if (!targets) return false;
  return Object.values(targets).includes(to);
}

/** Fin de la période de surveillance : correction plus le nombre de jours réglé (§7.4). */
export function watchWindow(fixedAt: string, watchDays: number): string {
  return addDays(fixedAt, watchDays);
}

/** La surveillance est-elle écoulée, c'est-à-dire sans nouveau ticket jusque-là ? (§7.4) */
export function watchElapsed(problem: Problem, now: string): boolean {
  if (problem.state !== 'fixed' || !problem.watchUntil) return false;
  const until = parseIso(problem.watchUntil);
  const current = parseIso(now);
  if (!until || !current) return false;
  return current.getTime() >= until.getTime();
}

/**
 * Régression (§7.5) : vrai seulement si le problème est corrigé ou vérifié et
 * si le nouveau ticket arrive après la correction. Un ticket plus ancien, ou
 * arrivé sur un problème encore en cours, n'est pas une régression.
 */
export function detectRegression(problem: Problem, newTicketAt: string): boolean {
  if (problem.state !== 'fixed' && problem.state !== 'verified') return false;
  if (!problem.fixedAt) return false;
  const fixed = parseIso(problem.fixedAt);
  const arrival = parseIso(newTicketAt);
  if (!fixed || !arrival) return false;
  return arrival.getTime() > fixed.getTime();
}

/**
 * Début de la surveillance (§7.4) : le correctif est livré, le problème passe
 * à « corrigé », la fenêtre de surveillance s'ouvre pour `watchDays` jours.
 * À son terme sans nouveau ticket, `watch-elapsed` mène à « vérifié » (§5).
 */
export function startWatching(problem: Problem, settings: Settings, now: string): Problem {
  return {
    ...problem,
    state: 'fixed',
    fixedAt: now,
    watchUntil: watchWindow(now, settings.watchDays),
    updatedAt: now,
  };
}
