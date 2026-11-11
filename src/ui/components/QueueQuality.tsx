import { Fragment } from 'react';
import { Heading, Text } from '@forge/react';
import type { DataQuality } from '../../core/types';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Qualité des données (§11 PC-10) : ce qui est indexé, ce qui a pu être
 * signéé, et ce qui n'a pas pu l'être. Les compteurs viennent du resolver.
 */
export function QueueQuality({
  locale,
  quality,
}: {
  locale: Locale;
  quality: DataQuality;
}): JSX.Element {
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'settings.quality')}</Heading>
      <Text>
        {t(locale, 'settings.qualityIndexed', {
          indexed: formatInt(locale, quality.ticketsIndexed),
          signatures: formatInt(locale, quality.signaturesExtracted),
          undetermined: formatInt(locale, quality.undetermined),
        })}
      </Text>
      {quality.missing.length > 0 ? (
        <Text>{t(locale, 'problem.line.unavailable')}</Text>
      ) : null}
    </Fragment>
  );
}
