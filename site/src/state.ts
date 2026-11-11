/**
 * Point d'entrée du moteur de démonstration.
 *
 * Le rendu (`render.ts`) et l'amorce (`main.ts`) n'importent que ce module :
 * une seule porte d'entrée vers l'état, comme `src/ui/api.ts` est la seule porte
 * d'entrée des écrans Forge vers les resolvers.
 *
 * Tout est **pur** : chaque interaction rend un nouvel état, jamais une
 * mutation. Ce sont les mêmes fonctions du domaine que l'app utilise dans Jira
 * (`computeCluster`, `computeBill`, `computeTrend`, `detectSurge`).
 */

export type {
  DemoCluster,
  DemoLocale,
  DemoMatch,
  DemoMeToo,
  DemoProblem,
  DemoPrompt,
  DemoState,
  DemoSurge,
  DemoTicket,
  DemoTotals,
} from './types';

export { buildDemoState } from './build';

export {
  addMeToo,
  confirmSuspect,
  detachTicket,
  matchText,
  rejectSuspect,
  withLocale,
  withPeriod,
} from './actions';
