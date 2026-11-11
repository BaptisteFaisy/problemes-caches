/**
 * Repository Forge SQL pour la table `membership` (§8.4, §15, PC-05).
 *
 * Enregistre le rattachement d'un ticket incident à un problème identifié,
 * avec la justification, l'indice de confiance et le statut de validation.
 */

import type { Membership } from '../../../core/types';
import { toMembership, type Row } from '../mappers';
import { insertRows, onDuplicateUpdate, runStatement, selectRows } from '../query';
import { toDbBool, toDbDate, toDbDateRequired, type SqlParams } from '../rows';

const MEMBERSHIP_COLUMNS = [
  'issue_id',
  'problem_id',
  'project_id',
  'issue_key',
  'basis',
  'confidence',
  'rationale',
  'proposed_at',
  'confirmed_by',
  'confirmed_at',
  'rejected',
  'rejected_by',
  'attached',
] as const;

const MEMBERSHIP_KEY_COLUMNS = ['issue_id', 'problem_id'] as const;

function membershipToValues(m: Membership, projectId: string) {
  return [
    m.issueId,
    m.problemId,
    projectId,
    m.issueKey,
    m.basis,
    m.confidence,
    m.rationale,
    toDbDateRequired(m.proposedAt),
    m.confirmedBy,
    toDbDate(m.confirmedAt),
    toDbBool(m.rejected),
    m.rejectedBy,
    toDbBool(m.attached),
  ];
}

/** Enregistre ou met à jour une appartenance ticket-problème (§8.4, PC-05). */
export async function upsertMembership(m: Membership, projectId: string): Promise<void> {
  await insertRows<Membership>({
    table: 'membership',
    columns: MEMBERSHIP_COLUMNS,
    rows: [m],
    toValues: (item) => membershipToValues(item, projectId),
    onDuplicate: onDuplicateUpdate(MEMBERSHIP_COLUMNS, MEMBERSHIP_KEY_COLUMNS),
  });
}

/** Retrouve une appartenance par ticket et problème (§8.4). */
export async function getMembership(issueId: string, problemId: string): Promise<Membership | null> {
  const query = 'SELECT * FROM membership WHERE issue_id = ? AND problem_id = ?';
  const rows = await selectRows<Row>(query, [issueId, problemId]);
  const first = rows[0];
  return first ? toMembership(first) : null;
}

/** Liste les appartenances associées à un problème (§8.4, PC-05). */
export async function listMembershipsByProblem(
  problemId: string,
  options?: { attachedOnly?: boolean; includeRejected?: boolean },
): Promise<Membership[]> {
  const conditions = ['problem_id = ?'];
  const params: SqlParams = [problemId];

  if (options?.attachedOnly) {
    conditions.push('attached = 1');
  }
  if (!options?.includeRejected) {
    conditions.push('rejected = 0');
  }

  const query = `SELECT * FROM membership WHERE ${conditions.join(' AND ')} ORDER BY proposed_at DESC`;
  const rows = await selectRows<Row>(query, params);
  return rows.map(toMembership);
}

/** Liste toutes les appartenances d'un ticket incident (§8.4). */
export async function listMembershipsByIssue(issueId: string): Promise<Membership[]> {
  const query = 'SELECT * FROM membership WHERE issue_id = ? ORDER BY proposed_at DESC';
  const rows = await selectRows<Row>(query, [issueId]);
  return rows.map(toMembership);
}

/** Confirme le rattachement d'un ticket à un problème par un agent (§8.4, PC-05). */
export async function confirmMembership(
  issueId: string,
  problemId: string,
  confirmedBy: string,
  now: string,
): Promise<void> {
  const query =
    'UPDATE membership SET confirmed_by = ?, confirmed_at = ?, rejected = 0, rejected_by = NULL ' +
    'WHERE issue_id = ? AND problem_id = ?';
  await runStatement(query, [confirmedBy, toDbDateRequired(now), issueId, problemId]);
}

/** Rejette le rattachement d'un ticket à un problème (§8.4, PC-05). */
export async function rejectMembership(
  issueId: string,
  problemId: string,
  rejectedBy: string,
): Promise<void> {
  const query =
    'UPDATE membership SET rejected = 1, rejected_by = ?, attached = 0 ' +
    'WHERE issue_id = ? AND problem_id = ?';
  await runStatement(query, [rejectedBy, issueId, problemId]);
}

/** Détache un ticket du problème Jira tout en conservant la trace (§8.4). */
export async function detachMembership(issueId: string, problemId: string): Promise<void> {
  const query = 'UPDATE membership SET attached = 0 WHERE issue_id = ? AND problem_id = ?';
  await runStatement(query, [issueId, problemId]);
}
