/**
 * Repository Forge SQL pour la table `cluster` (§8.5, §15, PC-03).
 *
 * Une grappe regroupe les tickets partageant le même triplet
 * (système, symptôme, déclencheur) et suit ses compteurs sur 30 jours glissants.
 */

import type { Cluster, ClusterStatus } from '../../../core/types.ts';
import { toCluster, type Row } from '../mappers.ts';
import { insertRows, onDuplicateUpdate, runStatement, selectRows } from '../query.ts';
import { toDbDateRequired, toNumber } from '../rows.ts';

const CLUSTER_COLUMNS = [
  'cluster_id',
  'project_id',
  'system_id',
  'symptom_id',
  'trigger_text',
  'tickets_30d',
  'hours_30d',
  'people_30d',
  'status',
  'threshold_hit',
  'first_seen_at',
  'last_seen_at',
] as const;

const CLUSTER_KEY_COLUMNS = ['cluster_id'] as const;

function clusterToValues(cluster: Cluster) {
  return [
    cluster.id,
    cluster.projectId,
    cluster.systemId,
    cluster.symptomId,
    cluster.triggerText,
    cluster.tickets30d,
    cluster.hours30d,
    cluster.people30d,
    cluster.status,
    cluster.thresholdHit,
    toDbDateRequired(cluster.firstSeenAt),
    toDbDateRequired(cluster.lastSeenAt),
  ];
}

/** Enregistre ou met à jour une grappe (§8.5, PC-03). */
export async function upsertCluster(cluster: Cluster): Promise<void> {
  await insertRows<Cluster>({
    table: 'cluster',
    columns: CLUSTER_COLUMNS,
    rows: [cluster],
    toValues: clusterToValues,
    onDuplicate: onDuplicateUpdate(CLUSTER_COLUMNS, CLUSTER_KEY_COLUMNS),
  });
}

/** Retrouve une grappe par son identifiant unique (§8.5). */
export async function getCluster(clusterId: string): Promise<Cluster | null> {
  const query = 'SELECT * FROM cluster WHERE cluster_id = ?';
  const rows = await selectRows<Row>(query, [clusterId]);
  const first = rows[0];
  return first ? toCluster(first) : null;
}

/** Liste les grappes d'un projet, éventuellement filtrées par statut (§8.5, PC-03). */
export async function listClusters(projectId: string, status?: ClusterStatus): Promise<Cluster[]> {
  if (status) {
    const query =
      'SELECT * FROM cluster WHERE project_id = ? AND status = ? ORDER BY tickets_30d DESC';
    const rows = await selectRows<Row>(query, [projectId, status]);
    return rows.map(toCluster);
  }
  const query = 'SELECT * FROM cluster WHERE project_id = ? ORDER BY tickets_30d DESC';
  const rows = await selectRows<Row>(query, [projectId]);
  return rows.map(toCluster);
}

/** Compte le nombre total de grappes et celles au statut suspect (§8.5, §13). */
export async function countClusters(projectId: string): Promise<{ total: number; suspects: number }> {
  const query =
    'SELECT COUNT(*) AS total, ' +
    "SUM(CASE WHEN status = 'suspect' THEN 1 ELSE 0 END) AS suspects " +
    'FROM cluster WHERE project_id = ?';
  const rows = await selectRows<Row>(query, [projectId]);
  const first = rows[0];
  return {
    total: toNumber(first ? first['total'] : 0),
    suspects: toNumber(first ? first['suspects'] : 0),
  };
}

/** Supprime une grappe (§8.5). */
export async function deleteCluster(clusterId: string): Promise<void> {
  await runStatement('DELETE FROM cluster WHERE cluster_id = ?', [clusterId]);
}
