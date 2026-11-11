import { Fragment } from 'react';
import { Heading, SectionMessage, Text } from '@forge/react';
import type { Cluster, MatchResult, Membership } from '../../core/types';
import { basisLabel, confidenceLabel, formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Ce que le panneau sait du ticket (§7.2, PC-08) : problème connu ou grappe
 * suspecte, confiance, et surtout la phrase qui justifie le rattachement.
 * L'UI ne recalcule rien : le resolver livre `match` (§17).
 */
export function PanelMatch({
  locale,
  match,
  membership,
}: {
  locale: Locale;
  match: MatchResult;
  membership: Membership | null;
}): JSX.Element {
  if (match.undetermined) {
    // §18 : une signature indéterminée n'est jamais regroupée d'office.
    return (
      <SectionMessage appearance="info" title={t(locale, 'panel.title')}>
        <Text>{t(locale, 'panel.undetermined')}</Text>
      </SectionMessage>
    );
  }
  return (
    <Fragment>
      <Heading size="small">{titleOf(locale, match)}</Heading>
      <Text>{confidenceLabel(locale, match.confidence)} — {basisLabel(locale, match.basis)}</Text>
      <Text>{t(locale, 'panel.justification', { rationale: rationaleOf(match, membership) })}</Text>
      {match.cluster ? <Text>{countsOf(locale, match.cluster)}</Text> : null}
    </Fragment>
  );
}

/** Titre de la ligne principale : problème connu, grappe suspecte ou rien. */
function titleOf(locale: Locale, match: MatchResult): string {
  const problem = match.problem;
  if (problem) return t(locale, 'panel.knownProblem', { key: problem.issueKey ?? problem.id });
  if (match.cluster) return t(locale, 'panel.suspectedCluster');
  return t(locale, 'panel.noMatch');
}

/** Justification enregistrée : celle du rattachement déjà écrit prime. */
function rationaleOf(match: MatchResult, membership: Membership | null): string {
  const written = membership?.rationale;
  if (written) return written;
  return match.rationale;
}

/** Addition d'une grappe non confirmée : compteurs livrés par le resolver (§9). */
function countsOf(locale: Locale, cluster: Cluster): string {
  return [
    t(locale, 'common.tickets', { value: formatInt(locale, cluster.tickets30d) }),
    t(locale, 'common.hours', { value: formatInt(locale, cluster.hours30d) }),
    t(locale, 'common.people', { value: formatInt(locale, cluster.people30d) }),
  ].join(' · ');
}
