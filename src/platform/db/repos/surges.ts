/**
 * Repository `surge` (§8.6, PC-14) : flambées détectées sur les grappes.
 *
 * Toutes les valeurs transitent par paramètres liés (`?`).
 */

import type { Surge } from '../../../core/types';
import type { Row } from '../mappers';
import { toSurge } from '../mappers';
import { insertRows, onDuplicateUpdate, runStatement, selectRows } from '../query';
import type { SqlParam } from '../rows';
import { toDbBool, toDbDateRequired, toTextOrNull } from '../rows';

const TABLE = 'surge';

const COLUMNS = [
  'surge_id',
  'cluster_id',
  'project_id',
  'started_at',
  'rate',
  'baseline',
  'factor',
  'incident_key',
  'expected',
] as const;

const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['surge_id']);

function toValues(surge: Surge): SqlParam[] {
  return [
    surge.id,
    surge.clusterId,
    surge.projectId,
    toDbDateRequired(surge.startedAt),
    surge.rate,
    surge.baseline,
    surge.factor,
    toTextOrNull(surge.incidentKey),
    toDbBool(surge.expected),
  ];
}

/** Crée ou met à jour une flambée (§8.6, PC-14). */
export async function upsertSurge(surge: Surge): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [surge],
    toValues,
    onDuplicate: ON_DUPLICATE,
  });
}

/** Lit une flambée par identifiant (§8.6). */
export async function getSurge(surgeId: string): Promise<Surge | null> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE surge_id = ? LIMIT 1`,
    [surgeId],
  );
  return rows[0] ? toSurge(rows[0]) : null;
}

/** Flambées en cours d'un projet, non marquées « attendues » (§8.6, PC-14). */
export async function listActiveSurges(projectId: string): Promise<Surge[]> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} ` +
      'WHERE project_id = ? AND expected = ? ORDER BY started_at DESC',
    [projectId, toDbBool(false)],
  );
  return rows.map(toSurge);
}

/** Marque une flambée comme attendue (campagne interne, §8.6, PC-14). */
export async function markSurgeExpected(surgeId: string): Promise<void> {
  await runStatement(`UPDATE ${TABLE} SET expected = ? WHERE surge_id = ?`, [
    toDbBool(true),
    surgeId,
  ]);
}
