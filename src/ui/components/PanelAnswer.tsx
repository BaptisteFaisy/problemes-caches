import { SectionMessage, Text } from '@forge/react';
import type { AttachResult } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Réponse proposée après « Rattacher et préparer la réponse » (§7.2) : elle
 * s'affiche À RELIRE, avec le rappel que rien ne part sans validation humaine
 * (PC-08, §6 : hors périmètre de répondre automatiquement).
 */
export function PanelAnswer({
  locale,
  draft,
}: {
  locale: Locale;
  draft: AttachResult | null;
}): JSX.Element | null {
  if (!draft) return null;
  return (
    <SectionMessage appearance="warning" title={t(locale, 'panel.proposedAnswer')}>
      <Text>{draft.proposedAnswer ?? t(locale, 'common.none')}</Text>
      <Text>{t(locale, 'panel.neverSent')}</Text>
    </SectionMessage>
  );
}
