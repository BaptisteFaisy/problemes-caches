import { Fragment } from 'react';
import { Heading, Text } from '@forge/react';
import type { IssueContextData } from '../api';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Encart sur le ticket de l'équipe qui corrige (§13 écran 4, PC-20) :
 * « Ce bug coûte {hours} h de support par mois à {people} personnes. »
 * Les chiffres viennent du resolver, jamais recalculés côté écran (§17).
 */
export function ContextCost({
  locale,
  data,
}: {
  locale: Locale;
  data: IssueContextData;
}): JSX.Element {
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'context.title')}</Heading>
      <Text>
        {t(locale, 'context.cost', {
          hours: formatInt(locale, data.hoursPerMonth),
          people: formatInt(locale, data.people),
        })}
      </Text>
    </Fragment>
  );
}
