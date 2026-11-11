/**
 * Repository SQL de la table `signature` (§8.2, §15, PC-01).
 *
 * Met en cache la signature extraite (système, symptôme, déclencheur et indices
 * certains) par empreinte du texte source (`source_hash`) pour éviter tout
 * nouvel appel modèle inutile (§8.2, §17).
 */

import type { TicketSignature } from '../../../core/types';
import { insertRows, onDuplicateUpdate, selectRows } from '../query';
import { toDbBool, toDbDateRequired, toJson, toNumber, type SqlParams } from '../rows';
import { toSignature, type Row } from '../mappers';

const TABLE = 'signature';
const ID_CHUNK = 200;

const COLUMNS = [
  'issue_id',
  'project_id',
  'system_id',
  'symptom_id',
  'trigger_text',
  'hard_keys_json',
  'extracted_at',
  'source_hash',
  'undetermined',
  'language',
] as const;

const SELECT_LIST = COLUMNS.join(', ');
const ON_DUPLICATE = onDuplicateUpdate(COLUMNS, ['issue_id']);

/** Convertit une signature du domaine en valeurs SQL liées (§8.2, §15). */
function toSignatureValues(sig: TicketSignature, projectId: string): SqlParams {
  return [
    sig.issueId,
    projectId,
    sig.systemId,
    sig.symptomId,
    sig.triggerText.slice(0, 200),
    toJson(sig.hardClues),
    toDbDateRequired(sig.extractedAt),
    sig.sourceHash,
    toDbBool(sig.undetermined),
    sig.language ?? null,
  ];
}

/** Insère ou met à jour la signature d'un ticket (§8.2, §15, PC-01). */
export async function upsertSignature(sig: TicketSignature, projectId: string): Promise<void> {
  await insertRows({
    table: TABLE,
    columns: COLUMNS,
    rows: [sig],
    toValues: (item) => toSignatureValues(item, projectId),
    onDuplicate: ON_DUPLICATE,
  });
}

/** Lit la signature d'un ticket par son identifiant Jira (§15). */
export async function getSignature(issueId: string): Promise<TicketSignature | null> {
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE issue_id = ? LIMIT 1`,
    [issueId],
  );
  return rows[0] ? toSignature(rows[0]) : null;
}

/** Liste les signatures d'un projet, optionnellement filtrées par tickets (§15). */
export async function listSignatures(
  projectId: string,
  issueIds?: readonly string[],
): Promise<TicketSignature[]> {
  if (issueIds === undefined) {
    const rows = await selectRows<Row>(
      `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE project_id = ?`,
      [projectId],
    );
    return rows.map(toSignature);
  }
  if (issueIds.length === 0) return [];
  const signatures: TicketSignature[] = [];
  for (let index = 0; index < issueIds.length; index += ID_CHUNK) {
    const slice = issueIds.slice(index, index + ID_CHUNK);
    const placeholders = slice.map(() => '?').join(', ');
    const rows = await selectRows<Row>(
      `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE project_id = ? AND issue_id IN (${placeholders})`,
      [projectId, ...slice],
    );
    signatures.push(...rows.map(toSignature));
  }
  return signatures;
}

/** Retrouve une signature en cache à partir de l'empreinte du texte (§8.2). */
export async function findByHash(sourceHash: string): Promise<TicketSignature | null> {
  if (!sourceHash) return null;
  const rows = await selectRows<Row>(
    `SELECT ${SELECT_LIST} FROM ${TABLE} WHERE source_hash = ? LIMIT 1`,
    [sourceHash],
  );
  return rows[0] ? toSignature(rows[0]) : null;
}

/** Compte les signatures extraites d'un projet et la part indéterminée (§15). */
export async function countSignatures(
  projectId: string,
): Promise<{ total: number; undetermined: number }> {
  const rows = await selectRows<Row>(
    `SELECT COUNT(*) AS total, ` +
      `COALESCE(SUM(CASE WHEN undetermined = 1 THEN 1 ELSE 0 END), 0) AS undetermined ` +
      `FROM ${TABLE} WHERE project_id = ?`,
    [projectId],
  );
  return {
    total: toNumber(rows[0]?.['total']),
    undetermined: toNumber(rows[0]?.['undetermined']),
  };
}
