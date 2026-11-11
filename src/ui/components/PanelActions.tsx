import { Button, ButtonSet, useState } from '@forge/ui';
import type { AttachResult } from '../api.ts';
import { attachAndDraft, detachTicket } from '../api.ts';
import { errorMessage } from '../async.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

/**
 * Actions du panneau (§7.2) : rattacher et préparer la réponse, ou retirer le
 * ticket du problème. Le retrait est réversible (§18 : le rejet est mémorisé,
 * l'addition est recalculée par le resolver).
 */
export function PanelActions({
  locale,
  canAttach,
  attached,
  busy,
  onAttach,
  onDetach,
}: {
  locale: Locale;
  canAttach: boolean;
  attached: boolean;
  busy: boolean;
  onAttach: () => void;
  onDetach: () => void;
}): JSX.Element | null {
  if (!canAttach && !attached) return null;
  return (
    <ButtonSet>
      {canAttach ? (
        <Button
          appearance="primary"
          text={t(locale, 'panel.attachAndDraft')}
          disabled={busy}
          onClick={onAttach}
        />
      ) : null}
      {attached ? (
        <Button text={t(locale, 'panel.detach')} disabled={busy} onClick={onDetach} />
      ) : null}
    </ButtonSet>
  );
}

/** État et actions du panneau : rattacher, préparer la réponse, retirer. */
export interface PanelActionState {
  draft: AttachResult | null;
  notice: string | null;
  busy: boolean;
  attach: (problemId: string) => void;
  detach: (problemId: string) => void;
}

/**
 * Rattachement et retrait du ticket courant (§7.2, PC-08). La réponse
 * préparée reste affichée À RELIRE : rien n'est envoyé sans validation (§6).
 */
export function usePanelActions(
  issueId: string,
  locale: Locale,
  reload: () => void,
): PanelActionState {
  const [draft, setDraft] = useState<AttachResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attach = async (problemId: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await attachAndDraft(issueId, problemId);
      setDraft(result);
      setNotice(null);
      reload();
    } catch (error) {
      setNotice(errorMessage(error));
    }
    setBusy(false);
  };

  const detach = async (problemId: string): Promise<void> => {
    setBusy(true);
    try {
      await detachTicket(issueId, problemId);
      setDraft(null);
      setNotice(t(locale, 'panel.detached'));
      reload();
    } catch (error) {
      setNotice(errorMessage(error));
    }
    setBusy(false);
  };

  return { draft, notice, busy, attach, detach };
}
