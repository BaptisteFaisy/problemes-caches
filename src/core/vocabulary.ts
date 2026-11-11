/**
 * WP-B — Vocabulaire tenu par projet (§8.3) : systèmes et symptômes.
 *
 * Module pur : aucune lecture SQL ici, aucune horloge implicite (l'heure
 * arrive en paramètre `now`), aucun import `@forge/*`. Les fonctions rendent
 * des **termes**, jamais des compteurs : une fusion regroupe les tickets
 * concernés sans rien recalculer (§8.3, §18).
 */

import { createHash } from 'node:crypto';

import { normalizeTrigger, type Term, type TermKind, type Vocabulary } from './types.ts';

// ---------------------------------------------------------------------------
// Aides internes
// ---------------------------------------------------------------------------

/**
 * Libellé normalisé pour comparaison : minuscules, sans accents, espaces
 * réduits. Sert de clé de recherche dans `resolveTermId` (§8.3).
 */
export function normalizeLabel(label: string | null | undefined): string {
  return normalizeTrigger(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Liste de libellés sans doublon (comparaison normalisée), triée. */
function dedupeLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const label of labels) {
    const trimmed = (label ?? '').trim();
    const key = normalizeLabel(trimmed);
    if (trimmed === '' || key === '' || seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }
  return kept.sort();
}

/** Les termes d'une nature donnée (systèmes ou symptômes). */
function termsOf(vocab: Vocabulary, kind: TermKind): Term[] {
  return kind === 'system' ? vocab.systems : vocab.symptoms;
}

/**
 * Identifiant d'un terme neuf, déterministe : même projet, même nature,
 * même libellé et même instant donnent le même identifiant.
 */
function newTermId(projectId: string, kind: TermKind, label: string, now: string): string {
  const digest = createHash('sha256')
    .update(`${projectId}|${kind}|${normalizeLabel(label)}|${now}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
  return `term_${digest}`;
}

// ---------------------------------------------------------------------------
// Résolution et fusions
// ---------------------------------------------------------------------------

/**
 * Retrouve l'identifiant d'un terme à partir de son libellé : libellé exact
 * d'abord, alias ensuite, en ignorant casse, accents et espaces (§8.3).
 *
 * Si le terme trouvé a été fusionné, l'identifiant rendu est celui du terme
 * conservé : le vocabulaire reste à jour après une fusion.
 */
export function resolveTermId(vocab: Vocabulary, kind: TermKind, label: string): string | null {
  const terms = termsOf(vocab, kind);
  const target = normalizeLabel(label);
  if (target === '') return null;
  const byLabel = terms.find((term) => normalizeLabel(term.label) === target);
  if (byLabel) return followMerge(terms, byLabel.id);
  const byAlias = terms.find((term) =>
    term.aliases.some((alias) => normalizeLabel(alias) === target),
  );
  if (byAlias) return followMerge(terms, byAlias.id);
  return null;
}

/**
 * Suit la chaîne de fusions d'un terme jusqu'au terme conservé.
 *
 * Un cycle (`A → B → A`) est détecté et rendu sans boucle infinie : la
 * fonction s'arrête sur l'identifiant qui boucle. Un identifiant inconnu est
 * rendu tel quel.
 */
export function followMerge(terms: readonly Term[], id: string): string {
  const seen = new Set<string>([id]);
  let current = id;
  for (;;) {
    const term = terms.find((t) => t.id === current);
    const next = term?.mergedInto;
    if (!next) return current;
    if (seen.has(next)) return next;
    seen.add(next);
    current = next;
  }
}

/**
 * Prépare une fusion : tous les termes indiqués, sauf celui conservé, sont
 * marqués `mergedInto`, et les alias sont réunis sur le terme conservé (§8.3).
 *
 * Le tableau rendu reprend tous les termes, inchangés sauf ceux touchés : la
 * fusion ne recalcule aucun compteur, elle ne fait que réorganiser le
 * vocabulaire (§18).
 */
export function planMerge(terms: readonly Term[], ids: string[], keepId: string): Term[] {
  const mergedIds = ids.filter((id) => id !== keepId);
  const moved = terms.filter((term) => mergedIds.includes(term.id));
  const keeper = terms.find((term) => term.id === keepId);
  const keeperAliases = keeper
    ? dedupeLabels([
        ...keeper.aliases,
        ...moved.flatMap((term) => [term.label, ...term.aliases]),
      ])
    : [];
  return terms.map((term) => {
    if (term.id === keepId) return { ...term, mergedInto: null, aliases: keeperAliases };
    if (mergedIds.includes(term.id)) return { ...term, mergedInto: keepId };
    return term;
  });
}

/**
 * Prépare une scission : l'ancien terme est gardé tel quel, un terme neuf
 * porte le nouveau libellé (§8.3, §18 — deux causes d'un même symptôme).
 */
export function planSplit(
  term: Term,
  newLabel: string,
  now: string,
): { kept: Term; created: Term } {
  const label = (newLabel ?? '').trim();
  const kept: Term = { ...term, aliases: [...term.aliases] };
  const created: Term = {
    id: newTermId(term.projectId, term.kind, label, now),
    projectId: term.projectId,
    kind: term.kind,
    label,
    mergedInto: null,
    aliases: [],
    createdAt: now,
  };
  return { kept, created };
}

/**
 * Prépare un renommage : l'ancien libellé rejoint les alias, le nouveau
 * devient le libellé (§8.3).
 */
export function renamePlan(term: Term, label: string): Term {
  const next = (label ?? '').trim();
  return { ...term, label: next, aliases: dedupeLabels([...term.aliases, term.label]) };
}

/**
 * Propose un terme neuf, à n'utiliser que si aucun terme connu ne convient
 * (§8.2 étape 2). La fonction ne touche pas au vocabulaire : elle rend le
 * terme à créer.
 */
export function suggestNewTerm(
  projectId: string,
  kind: TermKind,
  label: string,
  now: string,
): Term {
  const trimmed = (label ?? '').trim();
  return {
    id: newTermId(projectId, kind, trimmed, now),
    projectId,
    kind,
    label: trimmed,
    mergedInto: null,
    aliases: [],
    createdAt: now,
  };
}

/**
 * Libellé courant d'un terme : celui du terme conservé après une fusion
 * éventuelle, chaîne vide si le terme est inconnu.
 */
export function termLabel(vocab: Vocabulary, kind: TermKind, id: string): string {
  const terms = termsOf(vocab, kind);
  const finalId = followMerge(terms, id);
  const term = terms.find((t) => t.id === finalId);
  return term?.label ?? '';
}
