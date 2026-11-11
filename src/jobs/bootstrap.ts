/**
 * Amorçage de l'historique sur 90 jours (`bootstrap.ts`, §14, PC-10).
 *
 * Initialise l'historique d'un projet par lots de 50 tickets (`BOOTSTRAP_BATCH`),
 * borne le débit sous 100 requêtes/min (§14), crée la ligne `bootstrap_progress`
 * et dépile le premier lot. Le lot lui-même est traité par le consommateur
 * (`consumer.ts`, fonction `bootstrapBatch`) : ce module ne l'importe pas, ce
 * qui évite un cycle entre les deux fichiers.
 */

import { Queue } from '@forge/events';

import { BOOTSTRAP_BATCH, BOOTSTRAP_DAYS } from '../core/constants.ts';
import { addDays } from '../core/time.ts';
import type { BootstrapProgress } from '../core/types.ts';
import { getBootstrapProgress, upsertBootstrapProgress } from '../platform/db/repos.ts';
import { chunkArray } from '../platform/field.ts';
import { searchTickets } from '../platform/jira.ts';
import { logShort, shortError } from '../platform/log.ts';
import { registerFollowedProject } from './sync.ts';

/** File d'attente Forge des lots d'amorçage (déclarée dans `manifest.yml`). */
export const BOOTSTRAP_QUEUE_NAME = 'problemes-caches-bootstrap';

/** Plafond de tickets historisés par projet, pour tenir la fenêtre de 900 s (PC-10). */
export const MAX_BOOTSTRAP_TICKETS = 1000;

/** Corps d'un lot d'amorçage déposé dans la file (§14). */
export interface BootstrapBatchBody {
  projectId: string;
  projectKey: string;
  issueIds: string[];
  /** Signature d'index exigée par `@forge/events` (`Body`). */
  [key: string]: unknown;
}

/**
 * Démarre l'initialisation : relève les tickets des 90 derniers jours (PC-10),
 * écrit la ligne `bootstrap_progress` et dépile le premier lot de 50.
 */
export async function startBootstrap(
  projectId: string,
  projectKey: string,
): Promise<BootstrapProgress> {
  const now = new Date().toISOString();
  registerFollowedProject(projectId);
  const issueIds = await historyIssueIds(projectKey, now);
  const progress: BootstrapProgress = {
    projectId,
    total: issueIds.length,
    done: 0,
    failed: 0,
    startedAt: now,
    updatedAt: now,
    finished: issueIds.length === 0,
  };
  await upsertBootstrapProgress(progress);
  const [first] = chunkArray(issueIds, BOOTSTRAP_BATCH);
  if (first) await queueBatch(projectId, projectKey, first);
  return progress;
}

/** Dépile le lot suivant, à partir de l'avancement enregistré (PC-10). */
export async function nextBootstrapBatch(
  projectId: string,
  projectKey: string,
): Promise<void> {
  const progress = await getBootstrapProgress(projectId);
  if (!progress || progress.finished) return;
  const now = new Date().toISOString();
  registerFollowedProject(projectId);
  const issueIds = await historyIssueIds(projectKey, now);
  const processed = progress.done + progress.failed;
  const batches = chunkArray(issueIds, BOOTSTRAP_BATCH);
  const next = batches[Math.floor(processed / BOOTSTRAP_BATCH)];
  if (!next) {
    await upsertBootstrapProgress({ ...progress, finished: true, updatedAt: now });
    return;
  }
  await queueBatch(projectId, projectKey, next);
}

/** Identifiants des tickets créés depuis `BOOTSTRAP_DAYS` jours (PC-10). */
export async function historyIssueIds(projectKey: string, now: string): Promise<string[]> {
  const since = addDays(now, -BOOTSTRAP_DAYS).slice(0, 10);
  const issues = await searchTickets(projectKey, `created >= "${since}" ORDER BY created ASC`, MAX_BOOTSTRAP_TICKETS);
  return issues.map((issue) => issue.id);
}

/**
 * Dépose un lot dans la file Forge (§14). Un échec de file n'est jamais fatal :
 * la nuit suivante (`nightlyRecalc`) relance le lot restant.
 */
export async function queueBatch(
  projectId: string,
  projectKey: string,
  issueIds: readonly string[],
): Promise<void> {
  if (issueIds.length === 0) return;
  const body: BootstrapBatchBody = { projectId, projectKey, issueIds: [...issueIds] };
  try {
    await new Queue({ key: BOOTSTRAP_QUEUE_NAME }).push({ body });
  } catch (error) {
    logShort(`bootstrap : dépôt du lot impossible (${shortError(error)}), reprise la nuit suivante`);
  }
}
