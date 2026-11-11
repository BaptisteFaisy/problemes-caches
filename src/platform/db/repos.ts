/**
 * Point d'entrée des repositories Forge SQL (§15).
 *
 * Chaque table a son fichier dans `./repos/` ; ce module les réexporte pour que
 * le reste du dépôt n'importe qu'un seul chemin (`src/platform/db/repos.ts`),
 * et donc pour qu'aucune requête SQL ne soit écrite hors de ces fichiers.
 */

export * from './repos/tickets.ts';
export * from './repos/signatures.ts';
export * from './repos/terms.ts';
export * from './repos/clusters.ts';
export * from './repos/problems.ts';
export * from './repos/memberships.ts';
export * from './repos/meToo.ts';
export * from './repos/bills.ts';
export * from './repos/surges.ts';
export * from './repos/settings.ts';
export * from './repos/bootstrap.ts';
