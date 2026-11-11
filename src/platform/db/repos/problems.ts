/**
 * Repository Forge SQL pour la table `problem` (§5, §10, §15, PC-04).
 *
 * Un problème représente une grappe confirmée et son ticket de suivi Jira.
 */

import type { Problem, ProblemState } from '../../../core/types';
import { toProblem, type Row } from '../mappers';
import { insertRows, onDuplicateUpdate, runStatement, selectRows } from '../query';
import { toDbBool, toDbDate, toDbDateRequired, toNumber, type SqlParams } from '../rows';

const PROBLEM_COLUMNS = [
  'problem_id',
  'project_id',
  'project_key',
  'issue_key',
  'cluster_id',
  'system_id',
  'symptom_id',
  'trigger_text',
  'state',
  'cause',
  'workaround',
  'workaround_url',
  'fix_issue_key',
  'fixed_at',
  'watch_until',
  'regression',
  'published_to_portal',
  'created_at',
  'updated_at',
] as const;

const PROBLEM_KEY_COLUMNS = ['problem_id'] as const;

const OPEN_STATES: readonly ProblemState[] = [
  'suspect',
  'confirmed',
  'cause-known',
  'workaround-published',
  'regression',
];

function problemToValues(problem: Problem) {
  return [
    problem.id,
    problem.projectId,
    problem.projectKey,
    problem.issueKey,
    problem.clusterId,
    problem.systemId,
    problem.symptomId,
    problem.triggerText,
    problem.state,
    problem.cause,
    problem.workaround,
    problem.workaroundUrl,
    problem.fixIssueKey,
    toDbDate(problem.fixedAt),
    toDbDate(problem.watchUntil),
    toDbBool(problem.regression),
    toDbBool(problem.publishedToPortal),
    toDbDateRequired(problem.createdAt),
    toDbDateRequired(problem.updatedAt),
  ];
}

/** Enregistre ou met à jour un problème (§5, §10, PC-04). */
export async function upsertProblem(problem: Problem): Promise<void> {
  await insertRows<Problem>({
    table: 'problem',
    columns: PROBLEM_COLUMNS,
    rows: [problem],
    toValues: problemToValues,
    onDuplicate: onDuplicateUpdate(PROBLEM_COLUMNS, PROBLEM_KEY_COLUMNS),
  });
}

/** Retrouve un problème par son identifiant unique (§10). */
export async function getProblem(problemId: string): Promise<Problem | null> {
  const query = 'SELECT * FROM problem WHERE problem_id = ?';
  const rows = await selectRows<Row>(query, [problemId]);
  const first = rows[0];
  return first ? toProblem(first) : null;
}

/** Retrouve un problème par la clé de son ticket Jira associé (§10). */
export async function getProblemByIssueKey(issueKey: string): Promise<Problem | null> {
  const query = 'SELECT * FROM problem WHERE issue_key = ?';
  const rows = await selectRows<Row>(query, [issueKey]);
  const first = rows[0];
  return first ? toProblem(first) : null;
}

/** Liste les problèmes d'un projet, éventuellement filtrés par état (§10, PC-04). */
export async function listProblems(projectId: string, state?: ProblemState): Promise<Problem[]> {
  if (state) {
    const query = 'SELECT * FROM problem WHERE project_id = ? AND state = ? ORDER BY created_at DESC';
    const rows = await selectRows<Row>(query, [projectId, state]);
    return rows.map(toProblem);
  }
  const query = 'SELECT * FROM problem WHERE project_id = ? ORDER BY created_at DESC';
  const rows = await selectRows<Row>(query, [projectId]);
  return rows.map(toProblem);
}

/**
 * Liste les problèmes ouverts d'un projet (§5, §10, PC-04) :
 * suspect, confirmed, cause-known, workaround-published, regression.
 */
export async function listOpenProblems(projectId: string): Promise<Problem[]> {
  const placeholders = OPEN_STATES.map(() => '?').join(', ');
  const query =
    `SELECT * FROM problem WHERE project_id = ? AND state IN (${placeholders}) ` +
    'ORDER BY created_at DESC';
  const rows = await selectRows<Row>(query, [projectId, ...OPEN_STATES]);
  return rows.map(toProblem);
}

function buildPatchAssignments(patch: Partial<Problem>): { assignments: string[]; params: SqlParams } {
  const assignments: string[] = [];
  const params: SqlParams = [];
  if (patch.cause !== undefined) {
    assignments.push('cause = ?');
    params.push(patch.cause);
  }
  if (patch.workaround !== undefined) {
    assignments.push('workaround = ?');
    params.push(patch.workaround);
  }
  if (patch.workaroundUrl !== undefined) {
    assignments.push('workaround_url = ?');
    params.push(patch.workaroundUrl);
  }
  if (patch.fixIssueKey !== undefined) {
    assignments.push('fix_issue_key = ?');
    params.push(patch.fixIssueKey);
  }
  if (patch.fixedAt !== undefined) {
    assignments.push('fixed_at = ?');
    params.push(toDbDate(patch.fixedAt));
  }
  if (patch.watchUntil !== undefined) {
    assignments.push('watch_until = ?');
    params.push(toDbDate(patch.watchUntil));
  }
  if (patch.regression !== undefined) {
    assignments.push('regression = ?');
    params.push(toDbBool(patch.regression));
  }
  if (patch.publishedToPortal !== undefined) {
    assignments.push('published_to_portal = ?');
    params.push(toDbBool(patch.publishedToPortal));
  }
  if (patch.issueKey !== undefined) {
    assignments.push('issue_key = ?');
    params.push(patch.issueKey);
  }
  return { assignments, params };
}

/** Met à jour l'état d'un problème et applique un éventuel patch (§5, §10, PC-04). */
export async function updateProblemState(
  problemId: string,
  state: ProblemState,
  patch: Partial<Problem> = {},
): Promise<void> {
  const assignments = ['state = ?'];
  const params: SqlParams = [state];
  const built = buildPatchAssignments(patch);
  assignments.push(...built.assignments);
  params.push(...built.params);
  assignments.push('updated_at = ?');
  const now = patch.updatedAt ? toDbDateRequired(patch.updatedAt) : toDbDateRequired(new Date().toISOString());
  params.push(now);
  params.push(problemId);
  const query = `UPDATE problem SET ${assignments.join(', ')} WHERE problem_id = ?`;
  await runStatement(query, params);
}

/** Compte les problèmes ouverts dans un projet (§5, §10). */
export async function countOpenProblems(projectId: string): Promise<number> {
  const placeholders = OPEN_STATES.map(() => '?').join(', ');
  const query = `SELECT COUNT(*) AS total FROM problem WHERE project_id = ? AND state IN (${placeholders})`;
  const rows = await selectRows<Row>(query, [projectId, ...OPEN_STATES]);
  const first = rows[0];
  return toNumber(first ? first['total'] : 0);
}
