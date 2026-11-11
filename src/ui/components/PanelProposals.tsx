import { Fragment } from 'react';
import { Button, Heading, Text } from '@forge/react';
import type { Membership } from '../../core/types';
import { basisLabel, confidenceLabel } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

/**
 * Propositions de rattachement en attente (§8.4) : la confiance moyenne ne
 * rattache jamais d'office, un humain confirme. Une proposition qui porte sur
 * un autre ticket est affichée sans bouton : on ne rattache que le ticket ouvert.
 */
export function PanelProposals({
  locale,
  proposals,
  issueId,
  onAttach,
}: {
  locale: Locale;
  proposals: Membership[];
  issueId: string;
  onAttach: (problemId: string) => void;
}): JSX.Element | null {
  if (proposals.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'panel.proposals')}</Heading>
      {proposals.map((proposal) => (
        <Fragment key={`${proposal.issueId}:${proposal.problemId}`}>
          <Text>
            {proposal.issueKey} · {confidenceLabel(locale, proposal.confidence)} ·{' '}
            {basisLabel(locale, proposal.basis)}
          </Text>
          <Text>{t(locale, 'panel.justification', { rationale: proposal.rationale })}</Text>
          {proposal.issueId === issueId ? (
            <Button
              text={t(locale, 'panel.attachAndDraft')}
              onClick={() => onAttach(proposal.problemId)}
            />
          ) : null}
        </Fragment>
      ))}
    </Fragment>
  );
}
