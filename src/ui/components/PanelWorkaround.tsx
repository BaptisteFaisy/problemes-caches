import { Fragment, Link, SectionMessage, Text } from '@forge/ui';
import type { Problem } from '../../core/types.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

/**
 * Contournement validé, lien de procédure et correctif prévu (§7.2, PC-08) :
 * l'agent voit la solution déjà éprouvée, rédigée par le resolver.
 */
export function PanelWorkaround({
  locale,
  problem,
}: {
  locale: Locale;
  problem: Problem | null;
}): JSX.Element | null {
  if (!problem) return null;
  const hasContent = problem.workaround !== null || problem.fixIssueKey !== null;
  if (!hasContent) return null;
  return (
    <Fragment>
      {problem.workaround ? (
        <SectionMessage appearance="info" title={t(locale, 'panel.workaround')}>
          <Text>{problem.workaround}</Text>
          {problem.workaroundUrl ? (
            <Link href={problem.workaroundUrl}>{t(locale, 'panel.procedure')}</Link>
          ) : null}
        </SectionMessage>
      ) : null}
      {problem.fixIssueKey ? (
        <Text>{t(locale, 'panel.fixPlanned', { key: problem.fixIssueKey })}</Text>
      ) : null}
    </Fragment>
  );
}
