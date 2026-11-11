import { Fragment } from 'react';
import { Heading, Lozenge, Text } from '@forge/react';
import type { IssueContextData } from '../api';
import { formatInt, stateLabel } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

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
          <Lozenge>stateLabel(locale, entry.problem.state)</Lozenge>
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
