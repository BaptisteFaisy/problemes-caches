/**
 * Point d'entrée des repositories Forge SQL (§15).
 *
 * Chaque table a son fichier dans `./repos/` ; ce module les réexporte pour que
 * le reste du dépôt n'importe qu'un seul chemin (`src/platform/db/repos.ts`),
 * et donc pour qu'aucune requête SQL ne soit écrite hors de ces fichiers.
 */

export * from './repos/tickets';
export * from './repos/signatures';
export * from './repos/terms';
export * from './repos/clusters';
export * from './repos/problems';
export * from './repos/memberships';
export * from './repos/meToo';
export * from './repos/bills';
export * from './repos/surges';
export * from './repos/settings';
export * from './repos/bootstrap';
