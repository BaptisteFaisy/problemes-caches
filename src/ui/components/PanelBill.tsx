import { Fragment } from 'react';
import { Text } from '@forge/react';
import type { ProblemBill } from '../../core/types';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * L'addition du problème reconnu (§9) : heures, personnes, tickets déjà
 * rattachés, et le compteur des éléments masqués (PC-13, jamais listés).
 */
export function PanelBill({
  locale,
  bill,
}: {
  locale: Locale;
  bill: ProblemBill | null;
}): JSX.Element | null {
  if (!bill) return null;
  return (
    <Fragment>
      <Text>
        {t(locale, 'panel.billSummary', {
          hours: formatInt(locale, bill.hours),
          people: formatInt(locale, bill.people),
        })}
      </Text>
      <Text>{t(locale, 'panel.attachedCount', { count: formatInt(locale, bill.tickets) })}</Text>
      {bill.hiddenCount > 0 ? (
        <Text>{t(locale, 'common.hidden', { count: formatInt(locale, bill.hiddenCount) })}</Text>
      ) : null}
    </Fragment>
  );
}
