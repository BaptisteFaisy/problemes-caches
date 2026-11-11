/**
 * Repository `me_too` (§7.3, PC-16) : personnes touchées sans ticket.
 *
 * Chaque enregistrement associe un compte portail (`account_id`) à un problème.
 * Aucune valeur externe n'est interpolée dans le SQL : tout passe par `?`.
 */

import type { MeToo } from '../../../core/types';
import type { Row } from '../mappers';
import { toMeToo } from '../mappers';
import { insertRows, onDuplicateUpdate, selectRows } from '../query';
import type { SqlParam } from '../rows';
import { toDbDateRequired, toNumber, toTextOrNull } from '../rows';

const TABLE = 'me_too';

const COLUMNS = [
  'problem_id',
  'account_id',
  'display_name',
  'organization',
  'at',
] as const;

const KEY_COLUMNS = ['problem_id', 'account_id'] as const;
const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, KEY_COLUMNS);

function toValues(entry: MeToo): SqlParam[] {
  return [
    entry.problemId,
    entry.accountId,
    entry.displayName,
    toTextOrNull(entry.organization),
    toDbDateRequired(entry.at),
  ];
}

/** Enregistre un « Moi aussi » sur un problème (§7.3, PC-16). */
export async function insertMeToo(entry: MeToo): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [entry],
    toValues,
    onDuplicate: ON_DUPLICATE,
  });
}

/** Liste les personnes ayant cliqué « Moi aussi » sur un problème (§7.3, PC-16). */
export async function listMeTooByProblem(problemId: string): Promise<MeToo[]> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE problem_id = ? ORDER BY at DESC`,
    [problemId],
  );
  return rows.map(toMeToo);
}

/** Compte les « Moi aussi » d'un problème (§7.3, PC-16). */
export async function countMeToo(problemId: string): Promise<number> {
  const rows = await selectRows<Row>(
    `SELECT COUNT(*) AS total FROM ${TABLE} WHERE problem_id = ?`,
    [problemId],
  );
  return toNumber(rows[0]?.['total']);
}
