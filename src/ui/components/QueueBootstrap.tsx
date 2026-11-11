import { Fragment } from 'react';
import { Button, Heading, Text } from '@forge/react';
import type { BootstrapProgress } from '../../core/types';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Initialisation de l'historique (PC-10) et jeu d'exemple (PC-12) : 90 jours
 * d'historique par lots, avec la progression affichée, et un jeu de
 * démonstration pour essayer l'app sans données.
 */
export function QueueBootstrap({
  locale,
  bootstrap,
  busy,
  onBootstrap,
  onSample,
  onRefresh,
}: {
  locale: Locale;
  bootstrap: BootstrapProgress | null;
  busy: boolean;
  onBootstrap: () => void;
  onSample: () => void;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'settings.bootstrap')}</Heading>
      <Button
        appearance="primary"
        text={t(locale, 'settings.bootstrapRun')}
        disabled={busy}
        onClick={onBootstrap}
      />
      {bootstrap ? (
        <Text>
          {t(locale, 'settings.bootstrapProgress', {
            done: formatInt(locale, bootstrap.done),
            total: formatInt(locale, bootstrap.total),
            failed: formatInt(locale, bootstrap.failed),
          })}
        </Text>
      ) : null}
      {bootstrap && bootstrap.finished ? (
        <Text>{t(locale, 'settings.bootstrapDone')}</Text>
      ) : null}
      {bootstrap && !bootstrap.finished ? (
        <Button text={t(locale, 'common.retry')} onClick={onRefresh} />
      ) : null}
      <Heading size="small">{t(locale, 'settings.sample')}</Heading>
      <Button
        text={t(locale, 'settings.loadSample')}
        disabled={busy}
        onClick={onSample}
      />
    </Fragment>
  );
}
