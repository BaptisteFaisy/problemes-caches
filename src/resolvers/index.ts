/**
 * Point d'entrée des resolvers Atlassian Forge (§13, §14, WP-L).
 *
 * Enregistre les 27 handlers requis par `src/ui/api.ts` auprès de Forge Resolver
 * et exporte `resolver.getDefinitions()` sous le nom `resolver` attendu par le manifeste.
 */

import Resolver from '@forge/resolver';
import { handlers } from './handlers';

const resolver = new Resolver();

for (const [key, handler] of Object.entries(handlers)) {
  resolver.define(key, handler);
}

export const handler = resolver.getDefinitions();
export default resolver;
