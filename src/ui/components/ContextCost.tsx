import { Fragment, Heading, Text } from '@forge/ui';
import type { IssueContextData } from '../api.ts';
import { formatInt } from '../format.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

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
