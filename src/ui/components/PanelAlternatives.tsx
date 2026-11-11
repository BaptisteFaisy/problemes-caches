import { Fragment } from 'react';
import { Button, Heading, Text } from '@forge/react';
import type { MatchResult } from '../../core/types';
import { confidenceLabel } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Autres problèmes plausibles, proposés sans rattachement d'office (§18) :
 * un ticket peut décrire deux origines, l'app propose la seconde.
 */
export function PanelAlternatives({
  locale,
  alternatives,
  onAttach,
}: {
  locale: Locale;
  alternatives: MatchResult[];
  onAttach: (problemId: string) => void;
}): JSX.Element | null {
  if (alternatives.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'panel.alternatives')}</Heading>
      {alternatives.map((match) => (
        <PanelAlternativeItem
          key={keyOf(match)}
          locale={locale}
          match={match}
          onAttach={onAttach}
        />
      ))}
    </Fragment>
  );
}

/** Clé de rendu stable : l'identifiant du problème, sinon celui de la grappe. */
function keyOf(match: MatchResult): string {
  return match.problem?.id ?? match.cluster?.id ?? match.step;
}

/** Une ligne de problème plausible : clé, confiance, justification, action. */
function PanelAlternativeItem({
  locale,
  match,
  onAttach,
}: {
  locale: Locale;
  match: MatchResult;
  onAttach: (problemId: string) => void;
}): JSX.Element {
  const problem = match.problem;
  const title = problem
    ? t(locale, 'panel.knownProblem', { key: problem.issueKey ?? problem.id })
    : t(locale, 'panel.suspectedCluster');
  return (
    <Fragment>
      <Text>{title} · {confidenceLabel(locale, match.confidence)}</Text>
      <Text>{t(locale, 'panel.justification', { rationale: match.rationale })}</Text>
      {problem ? (
        <Button onClick={() => onAttach(problem.id)}>{t(locale, 'panel.attachAndDraft')}</Button>
      ) : null}
    </Fragment>
  );
}
