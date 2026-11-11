/**
 * Actions Rovo et outils MCP (§12).
 *
 * Expose les 7 actions déclarées dans `manifest.yml` sous les noms de fonctions
 * requis par `src/index.tsx`.
 */

export {
  actionMatchKnownProblem,
  actionListTopProblems,
  actionGetProblem,
  actionListSuspects,
  actionGetSurges,
  actionDraftCustomerUpdate,
  actionConfirmMembership,
} from './actions.ts';
