import { Fragment } from 'react';
import { Heading, Text } from '@forge/react';
import type { ProblemsPageData } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Tickets sans rattachement (§13 écran 2) : ce qui n'a encore été rapproché
 * d'aucune origine. Le resolver livre la liste déjà filtrée par visibilité.
 */
export function QueueUnattached({
  locale,
  tickets,
}: {
  locale: Locale;
  tickets: ProblemsPageData['unattached'];
}): JSX.Element | null {
  if (tickets.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'problems.unattached')}</Heading>
      {tickets.map((ticket) => (
        <Text key={ticket.issueId}>
          {ticket.issueKey} — {ticket.summary}
        </Text>
      ))}
    </Fragment>
  );
}
