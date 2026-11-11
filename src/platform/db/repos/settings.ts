/**
 * Repository `settings` (§13 écran 5) : réglages d'un projet suivi.
 *
 * Une ligne par projet (`PRIMARY KEY (project_id)`). Les champs JSON
 * (`thresholds_json`, `portal_services_json`, `enabled_lines_json`) sont
 * sérialisés via `toJson` et relus par `toSettings`.
 */

import type { Settings } from '../../../core/types';
import type { Row } from '../mappers';
import { toSettings } from '../mappers';
import { insertRows, onDuplicateUpdate, selectRows } from '../query';
import type { SqlParam } from '../rows';
import { toDbBool, toJson, toNumberOrNull, toTextOrNull } from '../rows';

const TABLE = 'settings';

const COLUMNS = [
  'project_id',
  'project_key',
  'thresholds_json',
  'minutes_per_touch',
  'hour_rate_eur',
  'problem_issue_type',
  'portal_services_json',
  'surge_factor',
  'surge_window_minutes',
  'watch_days',
  'enabled_lines_json',
  'demo_data',
] as const;

const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['project_id']);

function toValues(settings: Settings): SqlParam[] {
  return [
    settings.projectId,
    settings.projectKey,
    toJson(settings.thresholds),
    settings.minutesPerTouch,
    toNumberOrNull(settings.hourRateEur),
    toTextOrNull(settings.problemIssueType),
    toJson(settings.portalServices),
    settings.surgeFactor,
    settings.surgeWindowMinutes,
    settings.watchDays,
    toJson(settings.enabledLines),
    toDbBool(settings.demoData),
  ];
}

/** Lit les réglages d'un projet suivi (§13 écran 5). */
export async function getSettings(projectId: string): Promise<Settings | null> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE project_id = ? LIMIT 1`,
    [projectId],
  );
  return rows[0] ? toSettings(rows[0]) : null;
}

/** Enregistre ou met à jour les réglages d'un projet (§13 écran 5). */
export async function upsertSettings(settings: Settings): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [settings],
    toValues,
    onDuplicate: ON_DUPLICATE,
  });
}
