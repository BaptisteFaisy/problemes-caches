/**
 * Point d'entrée Forge — « Problèmes cachés dans les tickets ».
 *
 * Deux surfaces, et rien d'autre :
 * - le **resolver** des écrans : les clés déclarées dans `src/ui/api.ts`
 *   (panneau de l'agent, page « Problèmes », panneau du problème, encart sur le
 *   ticket de développement, réglages, bandeau et détail du portail) ;
 * - les **fonctions nommées** que le manifeste appelle telles quelles :
 *   triggers Jira, `scheduledTrigger`, `consumer` d'initialisation et les sept
 *   actions exposées à l'agent Rovo et par `rovo:mcp` (§12).
 *
 * Les noms exportés ici sont ceux du `manifest.yml` : les renommer casse le
 * déploiement sans erreur de compilation, d'où ce fichier unique et court.
 */

import { handlers } from './resolvers/handlers';
import { bootstrapBatch } from './jobs/consumer';
import { nightlyRecalc } from './jobs/scheduled';
import { issueCommented, issueCreated, issueUpdated } from './jobs/triggers';
import {
  actionConfirmMembership,
  actionDraftCustomerUpdate,
  actionGetProblem,
  actionGetSurges,
  actionListSuspects,
  actionListTopProblems,
  actionMatchKnownProblem,
} from './mcp/index';

/**
 * Resolver des écrans : `handler` est la fonction nommée `index.resolver` dans
 * le manifeste (clé `resolver`, référencée par les six ressources).
 */
export { handler as resolver } from './resolvers/index';

/**
 * Triggers Jira (§14 « à l'arrivée d'un ticket ») : au fil de l'eau, sans
 * calcul lourd — `avi:jira:created:issue`, `avi:jira:updated:issue`,
 * `avi:jira:commented:issue`. La reconnaissance doit aboutir en moins de 30 s
 * (PC-07).
 */
export { issueCreated, issueUpdated, issueCommented };

/**
 * `scheduledTrigger` (§14 « chaque nuit ») : formation des grappes, proposition
 * des suspects, recalcul des additions, **une** synthèse par ticket de problème
 * (§10) et surveillance des problèmes corrigés (§7.4, PC-17).
 */
export { nightlyRecalc };

/** `consumer` (§14 « initialisation ») : un lot de 50 tickets, 900 s au plus. */
export { bootstrapBatch };

/**
 * Les sept actions du §12, exposées à la fois à l'agent Rovo « Problèmes cachés »
 * et par le module `rovo:mcp`. Chacune rend une enveloppe `{ ok, data | error }`
 * et ne jette jamais : un agent doit pouvoir expliquer un échec.
 */
export {
  actionMatchKnownProblem,
  actionListTopProblems,
  actionGetProblem,
  actionListSuspects,
  actionGetSurges,
  actionDraftCustomerUpdate,
  actionConfirmMembership,
};

/** Table des clés de resolver, utile aux tests de contrat. */
export { handlers };
