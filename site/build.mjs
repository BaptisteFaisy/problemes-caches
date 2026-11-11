/**
 * Construction du site de démonstration (GitHub Pages).
 *
 * Le site n'est pas une maquette : il embarque le **vrai domaine** (`src/core`)
 * et le **vrai jeu d'exemple** (`src/sample`). esbuild produit un seul fichier
 * ESM autonome dans `site/dist/`, avec `node:crypto` remplacé par le SHA-256 pur
 * TypeScript de `site/src/sha256.ts` (vérifié identique à Node par
 * `site/src/sha256.test.ts`) — les identifiants de grappe affichés dans le
 * navigateur sont donc ceux que l'app calcule dans Jira.
 *
 * Usage : `npm run site:build` (ou `node site/build.mjs`).
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const RACINE = dirname(fileURLToPath(import.meta.url));
const DIST = join(RACINE, 'dist');
const SHIM = join(RACINE, 'src', 'sha256.ts');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets'), { recursive: true });

await build({
  entryPoints: [join(RACINE, 'src', 'main.ts')],
  outfile: join(DIST, 'assets', 'demo.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  alias: { 'node:crypto': SHIM },
});

// Le site est statique : la coquille HTML et la feuille de style sont copiées
// telles quelles, sans générateur ni framework.
cpSync(join(RACINE, 'index.html'), join(DIST, 'index.html'));
cpSync(join(RACINE, 'src', 'styles.css'), join(DIST, 'styles.css'));

console.log('site construit dans site/dist');
