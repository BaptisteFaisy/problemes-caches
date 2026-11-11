import ForgeReconciler from '@forge/react';
import { getAgentPanel } from './api';
import { useResolver } from './async';
import { AsyncView } from './components/AsyncView';
import { usePanelActions } from './components/PanelActions';
import { PanelContent } from './components/PanelContent';
import { ScreenShell } from './components/ScreenShell';
import type { ScreenContext } from './context';

/**
 * Écran 1 — le panneau de l'agent sur un ticket (§13, §7.2, PC-08).
 * Ressource `issue-panel` du manifeste (`jira:issuePanel`).
 *
 * L'UI n'appelle que `src/ui/api.ts` et n'agrège rien : `getAgentPanel` livre
 * le problème reconnu, la confiance, la justification, l'addition et les
 * propositions (§17).
 */
function App(): JSX.Element {
  return <ScreenShell>{(context) => <PanelScreen context={context} />}</ScreenShell>;
}

ForgeReconciler.render(<App />);

/** Chargement du panneau et branchement des actions (rattacher, retirer). */
function PanelScreen({ context }: { context: ScreenContext }): JSX.Element {
  const locale = context.locale;
  const issueId = context.issueId ?? '';
  const issueKey = context.issueKey ?? '';
  const { state, reload } = useResolver(
    `${issueId}:${issueKey}`,
    issueId === '' ? null : () => getAgentPanel(issueId, issueKey),
  );
  const actions = usePanelActions(issueId, locale, reload);
  return (
    <AsyncView
      state={state}
      locale={locale}
      retry={reload}
      render={(data) => (
        <PanelContent
          locale={locale}
          issueId={issueId}
          data={data}
          draft={actions.draft}
          notice={actions.notice}
          busy={actions.busy}
          onAttach={actions.attach}
          onDetach={actions.detach}
        />
      )}
    />
  );
}
