/**
 * Repository `bootstrap_progress` (PC-10) : avancement de l'initialisation
 * des 90 jours d'historique à l'installation.
 *
 * Une ligne par projet (`PRIMARY KEY (project_id)`).
 */

import type { BootstrapProgress } from '../../../core/types.ts';
import type { Row } from '../mappers.ts';
import { toBootstrap } from '../mappers.ts';
import { insertRows, onDuplicateUpdate, selectRows } from '../query.ts';
import type { SqlParam } from '../rows.ts';
import { toDbBool, toDbDateRequired } from '../rows.ts';

const TABLE = 'bootstrap_progress';

const COLUMNS = [
  'project_id',
  'total',
  'done',
  'failed',
  'started_at',
  'updated_at',
  'finished',
] as const;

const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['project_id']);

function toValues(progress: BootstrapProgress): SqlParam[] {
  return [
    progress.projectId,
    progress.total,
    progress.done,
    progress.failed,
    toDbDateRequired(progress.startedAt),
    toDbDateRequired(progress.updatedAt),
    toDbBool(progress.finished),
  ];
}

/** Lit l'avancement du rattrapage initial d'un projet (PC-10). */
export async function getBootstrapProgress(projectId: string): Promise<BootstrapProgress | null> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE project_id = ? LIMIT 1`,
    [projectId],
  );
  return rows[0] ? toBootstrap(rows[0]) : null;
}

/** Enregistre ou met à jour l'avancement du rattrapage initial (PC-10). */
export async function upsertBootstrapProgress(p: BootstrapProgress): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [p],
    toValues,
    onDuplicate: ON_DUPLICATE,
  });
}
