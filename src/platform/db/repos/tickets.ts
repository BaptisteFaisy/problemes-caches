/**
 * Repository SQL de la table `ticket_fact` (§15, PC-01).
 *
 * Conserve uniquement les faits nécessaires au calcul d'addition (§9) et aux
 * seuils des grappes (§8.5) : conformément à §17, seul un résumé borné à
 * 512 caractères est stocké, jamais le corps du ticket.
 */

import type { TicketFact } from '../../../core/types.ts';
import { insertRows, onDuplicateUpdate, selectRows } from '../query.ts';
import {
  toDbBool,
  toDbDate,
  toDbDateRequired,
  toNumber,
  type SqlParams,
} from '../rows.ts';
import { toTicketFact, type Row } from '../mappers.ts';

const TABLE = 'ticket_fact';
const ID_CHUNK = 200;

const COLUMNS = [
  'issue_id',
  'issue_key',
  'project_id',
  'project_key',
  'request_type',
  'service',
  'component',
  'reporter',
  'organization',
  'created_at',
  'resolved_at',
  'touches',
  'logged_seconds',
  'reopened',
  'escalated',
  'sla_breached',
  'visible',
  'summary',
] as const;

const SELECT_LIST = COLUMNS.join(', ');
const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['issue_id']);

/** Convertit un fait de ticket en valeurs SQL liées (§15, §17). */
function toTicketValues(fact: TicketFact): SqlParams {
  return [
    fact.issueId,
    fact.issueKey,
    fact.projectId,
    fact.projectKey,
    fact.requestType ?? null,
    fact.service ?? null,
    fact.component ?? null,
    fact.reporter ?? null,
    fact.organization ?? null,
    toDbDateRequired(fact.createdAt),
    toDbDate(fact.resolvedAt),
    fact.touches,
    fact.loggedSeconds ?? null,
    toDbBool(fact.reopened),
    toDbBool(fact.escalated),
    toDbBool(fact.slaBreached),
    toDbBool(fact.visible),
    fact.summary.slice(0, 512),
  ];
}

/** Insère ou met à jour un fait de ticket (§15, PC-01). */
export async function upsertTicketFact(fact: TicketFact): Promise<void> {
  await upsertTicketFacts([fact]);
}

/** Insère ou met à jour un lot de faits de tickets en requêtes groupées (§15). */
export async function upsertTicketFacts(facts: readonly TicketFact[]): Promise<void> {
  if (facts.length === 0) return;
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: facts,
    toValues: toTicketValues,
    onDuplicate: ON_DUPLICATE,
  });
}

/** Lit un fait de ticket par son identifiant Jira (§15). */
export async function getTicketFact(issueId: string): Promise<TicketFact | null> {
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE issue_id = ? LIMIT 1`,
    [issueId],
  );
  return rows[0] ? toTicketFact(rows[0]) : null;
}

/** Liste les faits d'un projet, filtrés optionnellement par date et plafond (§15). */
export async function listTicketFacts(
  projectId: string,
  since?: string,
  limit?: number,
): Promise<TicketFact[]> {
  const params: SqlParams = [projectId];
  let where = 'project_id = ?';
  const sinceDb = since ? toDbDate(since) : null;
  if (sinceDb !== null) {
    where += ' AND created_at >= ?';
    params.push(sinceDb);
  }
  let query = `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE ${where} ORDER BY created_at DESC`;
  if (limit !== undefined) {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0) return [];
    query += ' LIMIT ?';
    params.push(safeLimit);
  }
  const rows = await selectRows<Row>(query, params);
  return rows.map(toTicketFact);
}

/** Lit les faits correspondant à une liste d'identifiants de tickets (§15). */
export async function listFactsByIds(issueIds: readonly string[]): Promise<TicketFact[]> {
  if (issueIds.length === 0) return [];
  const facts: TicketFact[] = [];
  for (let index = 0; index < issueIds.length; index += ID_CHUNK) {
    const slice = issueIds.slice(index, index + ID_CHUNK);
    const placeholders = slice.map(() => '?').join(', ');
    const rows = await selectRows<Row>(
      `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE issue_id IN (${placeholders})`,
      [...slice],
    );
    facts.push(...rows.map(toTicketFact));
  }
  return facts;
}

/** Compte les tickets indexés pour un projet donné (§15). */
export async function countTickets(projectId: string): Promise<number> {
  const rows = await selectRows<Row>(
    `SELECT COUNT(*) AS total FROM ${TABLE} WHERE project_id = ?`,
    [projectId],
  );
  return toNumber(rows[0]?.['total']);
}
