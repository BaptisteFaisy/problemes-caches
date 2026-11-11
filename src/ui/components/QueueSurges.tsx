import { Fragment } from 'react';
import { Button, Heading, Lozenge, Text } from '@forge/react';
import type { Surge } from '../../core/types';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Flambées en cours (§8.6, PC-14) : le rythme observé contre le rythme
 * habituel, et la marque « attendue » pour une campagne interne (§18).
 */
export function QueueSurges({
  locale,
  surges,
  windowMinutes,
}: {
  locale: Locale;
  surges: Surge[];
  windowMinutes: number;
}): JSX.Element | null {
  if (surges.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'problems.surges')}</Heading>
      {surges.map((surge) => (
        <Fragment key={surge.id}>
          <Text>
            {t(locale, 'problems.surgeAlert', {
              count: formatInt(locale, surge.rate),
              minutes: formatInt(locale, windowMinutes),
              factor: surge.factor,
            })}
          </Text>
          {surge.expected ? (
            <Lozenge>{t(locale, 'problems.surgeExpected')}</Lozenge>
          ) : (
            <MarkExpectedButton locale={locale} />
          )}
        </Fragment>
      ))}
    </Fragment>
  );
}

/**
 * « Marquer comme attendue » : l'action n'existe pas encore côté resolver
 * (`src/ui/api.ts` est gelé et n'expose que les 27 clés listées). Le bouton
 * reste donc visible mais inactif, en attendant le resolver (§8.6).
 */
function MarkExpectedButton({ locale }: { locale: Locale }): JSX.Element {
  return (
    <Button isDisabled onClick={() => undefined}>{t(locale, 'problems.markExpected')}</Button>
  );
}
