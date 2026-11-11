import { Fragment } from 'react';
import { Heading, Text } from '@forge/react';
import type { ClusterLine } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { QueueBillLine } from './QueueBillLine';

/**
 * Demandes récurrentes (§18) : ce qui se répète sans défaut — une grappe
 * coûteuse, mais à automatiser plutôt qu'à corriger. Elles sont affichées à
 * part, jamais proposées comme problème.
 */
export function QueueRecurring({
  locale,
  lines,
}: {
  locale: Locale;
  lines: ClusterLine[];
}): JSX.Element | null {
  if (lines.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'problems.recurring')}</Heading>
      {lines.map((line) => (
        <Fragment key={line.cluster.id}>
          <Text>{line.cluster.triggerText || t(locale, 'common.unknown')}</Text>
          <QueueBillLine
            locale={locale}
            tickets={line.cluster.tickets30d}
            hours={line.cluster.hours30d}
            people={line.cluster.people30d}
          />
        </Fragment>
      ))}
    </Fragment>
  );
}
