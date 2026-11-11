import { loadSampleData, startBootstrap } from '../api';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/** Initialisation de l'historique et jeu d'exemple (PC-10, PC-12). */
export interface QueueInitActions {
  bootstrap: () => void;
  sample: () => void;
}

/**
 * Boutons « Initialiser 90 jours » et « Charger le jeu d'exemple » : les deux
 * passent par le resolver, puis la page se recharge et affiche la progression.
 */
export function useQueueInit(
  locale: Locale,
  projectId: string,
  projectKey: string,
  run: (action: () => Promise<string | null>) => void,
): QueueInitActions {
  const bootstrap = (): void => { void run(() => startHistory(projectId, projectKey)); };
  const sample = (): void => { void run(() => loadSample(locale, projectId)); };
  return { bootstrap, sample };
}

/** Initialiser 90 jours d'historique par lots (§13, PC-10). */
async function startHistory(projectId: string, projectKey: string): Promise<string | null> {
  await startBootstrap(projectId, projectKey);
  return null;
}

/** Charger le jeu d'exemple : l'app est utilisable sans historique (PC-12). */
async function loadSample(locale: Locale, projectId: string): Promise<string> {
  const result = await loadSampleData(projectId);
  return t(locale, 'settings.sampleLoaded', { count: formatInt(locale, result.tickets) });
}
