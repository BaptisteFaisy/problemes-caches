import { Button, Fragment, Heading, StatusLozenge, Text } from '@forge/ui';
import type { Surge } from '../../core/types.ts';
import { formatInt } from '../format.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

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
            <StatusLozenge text={t(locale, 'problems.surgeExpected')} />
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
    <Button text={t(locale, 'problems.markExpected')} disabled onClick={() => undefined} />
  );
}
