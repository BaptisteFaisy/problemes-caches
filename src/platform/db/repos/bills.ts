/**
 * Repository `problem_bill` (§9, PC-06) : addition d'un problème par période
 * et courbe quotidienne des tickets rattachés (§13 écran 3).
 *
 * Forge SQL n'ayant pas de transaction (`query.ts`), le remplacement d'une
 * addition passe par `replaceRows` (`DELETE` sur la clé composite + `INSERT`).
 */

import type { BillPeriod, ProblemBill } from '../../../core/types.ts';
import { addDays } from '../../../core/time.ts';
import type { Row } from '../mappers.ts';
import { toBill } from '../mappers.ts';
import { replaceRows, selectRows } from '../query.ts';
import type { SqlParam } from '../rows.ts';
import { toDbBool, toDbDateRequired, toNumber, toNumberOrNull, toText } from '../rows.ts';

const TABLE = 'problem_bill';

const COLUMNS = [
  'problem_id',
  'period',
  'project_id',
  'tickets',
  'hours',
  'people',
  'orgs',
  'sla_breaches',
  'reopens',
  'escalations',
  'me_too',
  'hours_method',
  'minutes_per_touch',
  'eur',
  'hour_rate_eur',
  'hidden_count',
  'computed_at',
] as const;

/** Limite par défaut des classements et de la courbe (§9, §13 écran 3). */
const DEFAULT_TOP_LIMIT = 50;
const DEFAULT_CURVE_DAYS = 90;

function toValues(bill: ProblemBill, projectId: string): SqlParam[] {
  return [
    bill.problemId,
    bill.period,
    projectId,
    bill.tickets,
    bill.hours,
    bill.people,
    bill.orgs,
    bill.slaBreaches,
    bill.reopens,
    bill.escalations,
    bill.meToo,
    bill.hoursMethod,
    bill.minutesPerTouch,
    toNumberOrNull(bill.eur),
    toNumberOrNull(bill.hourRateEur),
    bill.hiddenCount,
    toDbDateRequired(bill.computedAt),
  ];
}

/** Remplace la ligne d'addition du couple `(problemId, period)` (§9, PC-06). */
export async function replaceBill(bill: ProblemBill, projectId: string): Promise<void> {
  await replaceRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [bill],
    toValues: (row) => toValues(row, projectId),
    where: 'problem_id = ? AND period = ?',
    whereParams: [bill.problemId, bill.period],
  });
}

/** Lit l'addition d'un problème sur une période donnée (§9, PC-06). */
export async function getBill(problemId: string, period: BillPeriod): Promise<ProblemBill | null> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE problem_id = ? AND period = ? LIMIT 1`,
    [problemId, period],
  );
  return rows[0] ? toBill(rows[0]) : null;
}

/** Liste les additions d'un problème sur toutes les périodes disponibles (§9). */
export async function listBillsByProblem(problemId: string): Promise<ProblemBill[]> {
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} WHERE problem_id = ? ORDER BY period ASC`,
    [problemId],
  );
  return rows.map(toBill);
}

/** Problèmes d'un projet classés par heures décroissantes sur la période (§9, PC-06). */
export async function listTopProblemsByHours(
  projectId: string,
  period: BillPeriod,
  limit = DEFAULT_TOP_LIMIT,
): Promise<ProblemBill[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const rows = await selectRows<Row>(
    `SELECT ${COLUMNS.join(', ')} FROM ${TABLE} ` +
      'WHERE project_id = ? AND period = ? ORDER BY hours DESC, tickets DESC LIMIT ?',
    [projectId, period, safeLimit],
  );
  return rows.map(toBill);
}

/**
 * Courbe quotidienne des tickets rattachés à un problème (§9, §13 écran 3).
 * Compte tous les tickets rattachés (`attached = 1`, non rejetés), y compris
 * les tickets masqués (PC-13) : seuls les totaux sont renvoyés.
 */
export async function countTicketsByDay(
  projectId: string,
  problemId: string,
  days = DEFAULT_CURVE_DAYS,
): Promise<{ day: string; count: number }[]> {
  const safeDays = Math.max(1, Math.floor(days));
  // Borne basse calculée ici (`addDays` de `core/time.ts`), jamais dans le SQL.
  const since = toDbDateRequired(addDays(new Date().toISOString(), -safeDays));
  const query =
    "SELECT DATE_FORMAT(DATE(t.created_at), '%Y-%m-%d') AS day, COUNT(*) AS count " +
    'FROM membership m ' +
    'INNER JOIN ticket_fact t ON t.issue_id = m.issue_id ' +
    'WHERE m.project_id = ? AND m.problem_id = ? AND m.attached = ? AND m.rejected = ? ' +
    'AND t.created_at >= ? ' +
    'GROUP BY DATE(t.created_at) ' +
    'ORDER BY day ASC';
  const params: SqlParam[] = [
    projectId,
    problemId,
    toDbBool(true),
    toDbBool(false),
    since,
  ];
  const rows = await selectRows<Row>(query, params);
  return rows.map((row) => ({
    day: toText(row['day']),
    count: toNumber(row['count']),
  }));
}
