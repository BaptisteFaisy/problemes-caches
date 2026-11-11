import { render } from '@forge/ui';
import { getProblemsPage } from './api.ts';
import { useResolver } from './async.ts';
import { AsyncView } from './components/AsyncView.tsx';
import { useQueueActions } from './components/QueueActions.tsx';
import { QueueContent } from './components/QueueContent.tsx';
import { useQueueInit } from './components/QueueInit.tsx';
import { ScreenShell } from './components/ScreenShell.tsx';
import type { ScreenContext } from './context.ts';

/**
 * Écran 2 — la page « Problèmes » d'une file JSM (§13, §7.1, PC-09).
 * Ressource `queue-page` du manifeste (`jiraServiceManagement:queuePage`).
 *
 * Suspects, classement par coût, flambées, demandes récurrentes, tickets sans
 * rattachement, qualité des données et initialisation : tout vient de
 * `getProblemsPage`, l'UI n'agrège rien (§17).
 */
export default function App(): JSX.Element {
  return <ScreenShell>{(context) => <QueueScreen context={context} />}</ScreenShell>;
}

render(<App />);

/** Chargement de la page et branchement des actions. */
function QueueScreen({ context }: { context: ScreenContext }): JSX.Element {
  const locale = context.locale;
  const { projectId, projectKey } = context;
  const { state, reload } = useResolver(
    `${projectId}:${projectKey}`,
    projectId === '' ? null : () => getProblemsPage(projectId, projectKey),
  );
  const actions = useQueueActions(locale, reload);
  const init = useQueueInit(locale, projectId, projectKey, actions.run);
  return (
    <AsyncView
      state={state}
      locale={locale}
      retry={reload}
      render={(data) => (
        <QueueContent
          locale={locale}
          data={data}
          notice={actions.notice}
          busy={actions.busy}
          splitLine={actions.splitLine}
          onConfirm={actions.confirm}
          onReject={actions.reject}
          onOpenSplit={actions.openSplit}
          onSplit={actions.split}
          onCloseSplit={actions.closeSplit}
          onBootstrap={init.bootstrap}
          onSample={init.sample}
          onRefresh={reload}
        />
      )}
    />
  );
}
