import { useState } from '@forge/ui';
import type { ClusterLine } from '../api.ts';
import { confirmSuspect, rejectSuspect, splitCluster } from '../api.ts';
import { errorMessage } from '../async.ts';
import { formatInt } from '../format.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

/** Décisions humaines sur une grappe suspecte (§7.1, PC-09). */
export interface QueueActions {
  notice: string | null;
  busy: boolean;
  splitLine: ClusterLine | null;
  /** Exécute une action puis recharge la page ; partagé avec l'initialisation. */
  run: (action: () => Promise<string | null>) => void;
  confirm: (line: ClusterLine) => void;
  reject: (clusterId: string) => void;
  openSplit: (line: ClusterLine) => void;
  closeSplit: () => void;
  split: (issueIds: string[], triggerText: string) => void;
}

/**
 * État et actions de la page « Problèmes » : chaque décision appelle le
 * resolver, puis la page se recharge. Les messages viennent du dictionnaire ;
 * les chiffres, du resolver (§17).
 */
export function useQueueActions(locale: Locale, reload: () => void): QueueActions {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [splitLine, setSplitLine] = useState<ClusterLine | null>(null);

  /** Enveloppe commune : occupation, message d'erreur, rechargement. */
  const run = async (action: () => Promise<string | null>): Promise<void> => {
    setBusy(true);
    try {
      const message = await action();
      if (message !== null) setNotice(message);
      reload();
    } catch (error) {
      setNotice(errorMessage(error));
    }
    setBusy(false);
  };

  const confirm = (line: ClusterLine): void => { void run(() => confirmCluster(locale, line)); };

  const reject = (clusterId: string): void => { void run(() => rejectCluster(locale, clusterId)); };

  const split = (issueIds: string[], triggerText: string): void => {
    const line = splitLine;
    if (line === null) return;
    void run(async () => {
      await splitCluster(line.cluster.id, issueIds, triggerText);
      setSplitLine(null);
      return null;
    });
  };

  return {
    notice, busy, splitLine, run, confirm, reject,
    openSplit: (line: ClusterLine) => setSplitLine(line),
    closeSplit: () => setSplitLine(null),
    split,
  };
}

/** Confirmer une grappe : un ticket de problème unique est créé (§7.1). */
async function confirmCluster(locale: Locale, line: ClusterLine): Promise<string> {
  const result = await confirmSuspect(line.cluster.id, []);
  return t(locale, 'problems.confirmed', {
    key: result.problemKey,
    count: formatInt(locale, line.cluster.tickets30d),
  });
}

/** Rejeter une grappe : elle ne sera plus proposée (§8.5). */
async function rejectCluster(locale: Locale, clusterId: string): Promise<string> {
  await rejectSuspect(clusterId);
  return t(locale, 'problems.rejected');
}
