import { Fragment, Heading, StatusLozenge, Text } from '@forge/ui';
import type { IssueContextData } from '../api.ts';
import { formatInt, stateLabel } from '../format.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

/**
 * Problèmes liés au bug (§13 écran 4). Aucun indicateur par personne :
 * l'unité reste le problème (§17, vie privée — jamais de classement d'agents).
 */
export function ContextProblems({
  locale,
  problems,
}: {
  locale: Locale;
  problems: IssueContextData['problems'];
}): JSX.Element {
  if (problems.length === 0) return <Text>{t(locale, 'context.none')}</Text>;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'context.problems')}</Heading>
      {problems.map((entry) => (
        <Fragment key={entry.problem.id}>
          <Text>
            {t(locale, 'panel.knownProblem', {
              key: entry.problem.issueKey ?? entry.problem.id,
            })}
          </Text>
          <StatusLozenge text={stateLabel(locale, entry.problem.state)} />
          {entry.bill ? (
            <Text>
              {t(locale, 'common.perMonth', {
                hours: formatInt(locale, entry.bill.hours),
                people: formatInt(locale, entry.people),
              })}
            </Text>
          ) : null}
        </Fragment>
      ))}
    </Fragment>
  );
}
