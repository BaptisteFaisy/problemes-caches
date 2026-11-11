import { Tag, TagGroup } from '@forge/react';
import { formatHours, formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Ligne d'addition d'une grappe ou d'un problème (§9) : tickets, heures,
 * personnes. Les chiffres viennent du resolver ; l'UI ne somme rien (§17).
 */
export function QueueBillLine({
  locale,
  tickets,
  hours,
  people,
}: {
  locale: Locale;
  tickets?: number | null | undefined;
  hours?: number | null | undefined;
  people?: number | null | undefined;
}): JSX.Element | null {
  const tags: JSX.Element[] = [];
  if (tickets !== null && tickets !== undefined) {
    tags.push(
      <Tag key="tickets" text={t(locale, 'common.tickets', { value: formatInt(locale, tickets) })} />,
    );
  }
  if (hours !== null && hours !== undefined) {
    tags.push(<Tag key="hours" text={formatHours(locale, hours)} />);
  }
  if (people !== null && people !== undefined) {
    tags.push(
      <Tag key="people" text={t(locale, 'common.people', { value: formatInt(locale, people) })} />,
    );
  }
  if (tags.length === 0) return null;
  return <TagGroup>{tags}</TagGroup>;
}
