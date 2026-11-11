/**
 * Chargement du jeu d'exemple en base (PC-12, §21).
 *
 * Les juges cliquent un bouton : 60 jours de tickets fictifs sont injectés
 * dans les tables de l'app, et tous les écrans, l'agent Rovo et les outils MCP
 * fonctionnent aussitôt. Le jeu est **déterministe** (`buildDataset`), donc la
 * démonstration est reproductible d'une session à l'autre.
 *
 * Le retrait (`clearSample`) ne touche qu'au jeu d'exemple : les identifiants
 * du jeu portent un préfixe stable (`SAMPLE_ID_PREFIX`), rien d'autre n'est
 * supprimé.
 */

import { sourceHash } from '../core/signature.ts';
import type { Settings, TicketFact, TicketSignature } from '../core/types.ts';
import { defaultSettings } from '../core/types.ts';
import { runStatement } from '../platform/db/query.ts';
import { getSettings, upsertSettings } from '../platform/db/repos/settings.ts';
import { upsertSignature } from '../platform/db/repos/signatures.ts';
import { upsertTicketFacts } from '../platform/db/repos/tickets.ts';
import { buildDataset } from './build.ts';
import { SAMPLE_ID_PREFIX, SAMPLE_PROJECT_KEY } from './dataset.ts';

/** Projets de service fictif du jeu d'exemple (§20). */
export const SAMPLE_PROJECTS = [SAMPLE_PROJECT_KEY] as const;

/** Transformer un ticket d'exemple en fait de ticket (colonnes de `ticket_fact`). */
function toFact(ticket: ReturnType<typeof buildDataset>['tickets'][number]): TicketFact {
  return {
    issueId: ticket.issueId,
    issueKey: ticket.issueKey,
    projectId: ticket.projectId,
    projectKey: ticket.projectKey,
    requestType: ticket.requestType,
    service: ticket.service,
    component: ticket.component,
    reporter: ticket.reporter,
    organization: ticket.organization,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
    touches: ticket.touches,
    loggedSeconds: ticket.loggedSeconds,
    reopened: ticket.reopened,
    escalated: ticket.escalated,
    slaBreached: ticket.slaBreached,
    visible: ticket.visible,
    summary: ticket.summary,
  };
}

/** Signature attendue d'un ticket d'exemple (colonnes de `signature`). */
function toSignature(
  ticket: ReturnType<typeof buildDataset>['tickets'][number],
  now: string,
): TicketSignature {
  return {
    issueId: ticket.issueId,
    systemId: ticket.systemId,
    symptomId: ticket.symptomId,
    triggerText: ticket.triggerText,
    hardClues: ticket.hardClues,
    extractedAt: now,
    sourceHash: sourceHash(ticket.summary),
    undetermined: ticket.undetermined,
    language: ticket.language,
  };
}

/**
 * Injecte le jeu d'exemple : faits, signatures et le drapeau `demo_data`.
 * Renvoie le nombre de tickets injectés.
 */
export async function loadSample(projectId: string, projectKey: string): Promise<{ tickets: number }> {
  const dataset = buildDataset();
  const now = new Date().toISOString();
  const facts = dataset.tickets.map(toFact);

  await upsertTicketFacts(facts);
  for (const ticket of dataset.tickets) {
    await upsertSignature(toSignature(ticket, now), projectId);
  }

  const existing = await getSettings(projectId);
  const settings: Settings = existing ?? defaultSettings(projectId, projectKey);
  await upsertSettings({ ...settings, projectId, projectKey, demoData: true });

  return { tickets: facts.length };
}

/**
 * Retire le jeu d'exemple : seuls les tickets au préfixe stable sont
 * supprimés, et le drapeau `demo_data` retombe à faux.
 */
export async function clearSample(projectId: string): Promise<void> {
  const pattern = `${SAMPLE_ID_PREFIX}%`;
  await runStatement('DELETE FROM signature WHERE issue_id LIKE ?', [pattern]);
  await runStatement('DELETE FROM ticket_fact WHERE issue_id LIKE ?', [pattern]);

  const existing = await getSettings(projectId);
  if (existing) await upsertSettings({ ...existing, demoData: false });
}
