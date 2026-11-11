/**
 * Repository SQL de la table `term` (§8.3, §15, PC-02).
 *
 * Gère le vocabulaire tenu par projet (systèmes et symptômes), la recherche
 * par libellé et l'application en base des fusions préparées par le domaine
 * (§8.3).
 */

import type { Term, TermKind } from '../../../core/types.ts';
import { insertRows, onDuplicateUpdate, selectRows } from '../query.ts';
import { toDbDateRequired, toJson, type SqlParams } from '../rows.ts';
import { toTerm, type Row } from '../mappers.ts';

const TABLE = 'term';

const COLUMNS = [
  'term_id',
  'project_id',
  'kind',
  'label',
  'merged_into',
  'aliases_json',
  'created_at',
] as const;

const SELECT_LIST = COLUMNS.join(', ');
const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['term_id']);
const MERGE_ON_DUPLICATE = 'merged_into = VALUES(merged_into), aliases_json = VALUES(aliases_json)';

/** Convertit un terme du domaine en valeurs SQL liées (§8.3, §15). */
function toTermValues(term: Term): SqlParams {
  return [
    term.id,
    term.projectId,
    term.kind,
    term.label.slice(0, 255),
    term.mergedInto ?? null,
    toJson(term.aliases),
    toDbDateRequired(term.createdAt),
  ];
}

/** Insère ou met à jour un terme du vocabulaire (§8.3, §15, PC-02). */
export async function upsertTerm(term: Term): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [term],
    toValues: toTermValues,
    onDuplicate: ON_DUPLICATE,
  });
}

/** Liste les termes d'un projet, filtrés optionnellement par nature (§8.3, §15). */
export async function listTerms(projectId: string, kind?: TermKind): Promise<Term[]> {
  if (kind !== undefined) {
    const rows = await selectRows<Row>(
      `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE project_id = ? AND kind = ? ORDER BY label ASC`,
      [projectId, kind],
    );
    return rows.map(toTerm);
  }
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE project_id = ? ORDER BY kind ASC, label ASC`,
    [projectId],
  );
  return rows.map(toTerm);
}

/** Lit un terme par son identifiant (§15). */
export async function getTerm(termId: string): Promise<Term | null> {
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE term_id = ? LIMIT 1`,
    [termId],
  );
  return rows[0] ? toTerm(rows[0]) : null;
}

/** Cherche un terme par projet, nature et libellé exact (§8.3, §15). */
export async function findTermByLabel(
  projectId: string,
  kind: TermKind,
  label: string,
): Promise<Term | null> {
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE project_id = ? AND kind = ? AND label = ? LIMIT 1`,
    [projectId, kind, label],
  );
  return rows[0] ? toTerm(rows[0]) : null;
}

/**
 * Applique une fusion de termes en mettant à jour `merged_into` et
 * `aliases_json` en une passe groupée (§8.3, PC-02).
 */
export async function applyTermMerge(terms: readonly Term[]): Promise<void> {
  if (terms.length === 0) return;
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: terms,
    toValues: toTermValues,
    onDuplicate: MERGE_ON_DUPLICATE,
  });
}
