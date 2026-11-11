import { Fragment, Heading, SectionMessage, Text } from '@forge/ui';
import type { AgentPanelData, AttachResult } from '../api.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';
import { PanelActions } from './PanelActions.tsx';
import { PanelAlternatives } from './PanelAlternatives.tsx';
import { PanelAnswer } from './PanelAnswer.tsx';
import { PanelBill } from './PanelBill.tsx';
import { PanelMatch } from './PanelMatch.tsx';
import { PanelProposals } from './PanelProposals.tsx';
import { PanelWorkaround } from './PanelWorkaround.tsx';

/**
 * Corps du panneau de l'agent (§13 écran 1, §7.2, PC-08). Tout vient de
 * `getAgentPanel` : l'UI n'agrège rien (§17).
 */
export function PanelContent({
  locale,
  issueId,
  data,
  draft,
  notice,
  busy,
  onAttach,
  onDetach,
}: {
  locale: Locale;
  issueId: string;
  data: AgentPanelData;
  draft: AttachResult | null;
  notice: string | null;
  busy: boolean;
  onAttach: (problemId: string) => void;
  onDetach: (problemId: string) => void;
}): JSX.Element {
  const membership = data.membership;
  const attached = membership !== null && membership.attached;
  const matchProblemId = data.match.problem?.id ?? '';
  const canAttach = matchProblemId !== '' && !attached && !data.match.undetermined;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'panel.title')}</Heading>
      <PanelMatch locale={locale} match={data.match} membership={membership} />
      <PanelWorkaround locale={locale} problem={data.match.problem} />
      <PanelBill locale={locale} bill={data.bill} />
      <PanelActions
        locale={locale}
        canAttach={canAttach}
        attached={attached}
        busy={busy}
        onAttach={() => onAttach(matchProblemId)}
        onDetach={() => onDetach(membership?.problemId ?? '')}
      />
      {notice ? <SectionMessage appearance="info"><Text>{notice}</Text></SectionMessage> : null}
      <PanelAnswer locale={locale} draft={draft} />
      <PanelAlternatives locale={locale} alternatives={data.alternatives} onAttach={onAttach} />
      <PanelProposals
        locale={locale}
        proposals={data.pendingProposals}
        issueId={issueId}
        onAttach={onAttach}
      />
    </Fragment>
  );
}
