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

import { BOOTSTRAP_BATCH, BOOTSTRAP_DAYS } from '../core/constants';
import { addDays } from '../core/time';
import type { BootstrapProgress } from '../core/types';
import { getBootstrapProgress, upsertBootstrapProgress } from '../platform/db/repos';
import { chunkArray } from '../platform/field';
import { searchTickets } from '../platform/jira';
import { logShort, shortError } from '../platform/log';
import { registerFollowedProject } from './sync';

/** File d'attente Forge des lots d'amorçage (déclarée dans `manifest.yml`). */
export const BOOTSTRAP_QUEUE_NAME = 'problemes-caches-bootstrap';

/** Plafond de tickets historisés par projet, pour tenir la fenêtre de 900 s (PC-10). */
export const MAX_BOOTSTRAP_TICKETS = 1000;

/**
 * Fenêtres d'amorçage essayées dans l'ordre, en jours (PC-10).
 *
 * Mesuré le 2026-11-11 sur le site de démonstration Codegeist
 * (`tools/valide_site_demo.py`, point 1) : 2 824 tickets répartis de 2021 à
 * mars 2026, mais **1 seul** sur les 90 derniers jours. Une fenêtre fixe de
 * 90 jours n'aurait donc rien indexé. On l'élargit tant qu'elle reste presque
 * vide : 90 jours (le contrat), puis 365, puis tout l'historique.
 */
export const BOOTSTRAP_WINDOWS_DAYS: readonly number[] = [BOOTSTRAP_DAYS, 365, 0];

/** En dessous de ce nombre de tickets, la fenêtre est jugée trop étroite. */
export const BOOTSTRAP_MIN_TICKETS = 10;

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
  const { issueIds, windowDays } = await historyIssueIds(projectKey, now);
  logShort(`amorçage ${projectKey} : ${issueIds.length} tickets sur ${windowDays || 'tout'} jour(s)`);
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
  const { issueIds } = await historyIssueIds(projectKey, now);
  const processed = progress.done + progress.failed;
  const batches = chunkArray(issueIds, BOOTSTRAP_BATCH);
  const next = batches[Math.floor(processed / BOOTSTRAP_BATCH)];
  if (!next) {
    await upsertBootstrapProgress({ ...progress, finished: true, updatedAt: now });
    return;
  }
  await queueBatch(projectId, projectKey, next);
}

/**
 * Identifiants des tickets à historiser (PC-10).
 *
 * La fenêtre contractuelle est de 90 jours ; si elle est presque vide sur le
 * site installé, on l'élargit (365 jours, puis tout l'historique) pour que
 * l'app ait de quoi former des grappes. `windowDays` dit ce qui a été retenu :
 * la valeur est journalisée et remonte dans la progression.
 */
export type WindowSearch = (projectKey: string, now: string, days: number) => Promise<string[]>;

export async function historyIssueIds(
  projectKey: string,
  now: string,
  search: WindowSearch = searchWindow,
): Promise<{ issueIds: string[]; windowDays: number }> {
  let issueIds: string[] = [];
  let windowDays = BOOTSTRAP_DAYS;
  for (const days of BOOTSTRAP_WINDOWS_DAYS) {
    windowDays = days;
    issueIds = await search(projectKey, now, days);
    if (issueIds.length >= BOOTSTRAP_MIN_TICKETS || days === 0) break;
    logShort(`amorçage ${projectKey} : ${issueIds.length} tickets sur ${days} j, fenêtre élargie`);
  }
  return { issueIds, windowDays };
}

/** Recherche d'une fenêtre : `days` à 0 signifie « tout l'historique ». */
async function searchWindow(projectKey: string, now: string, days: number): Promise<string[]> {
  const filtre = days > 0 ? `created >= "${addDays(now, -days).slice(0, 10)}" AND ` : '';
  const issues = await searchTickets(
    projectKey,
    `${filtre}ORDER BY created ASC`,
    MAX_BOOTSTRAP_TICKETS,
  );
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
