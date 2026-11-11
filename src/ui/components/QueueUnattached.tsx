import { Fragment, Heading, Text } from '@forge/ui';
import type { ProblemsPageData } from '../api.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

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
