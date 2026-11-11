import { Fragment } from 'react';
import ForgeReconciler from '@forge/react';
import { getIssueContext } from './api';
import { useResolver } from './async';
import { AsyncView } from './components/AsyncView';
import { ContextCost } from './components/ContextCost';
import { ContextProblems } from './components/ContextProblems';
import { ScreenShell } from './components/ScreenShell';
import type { ScreenContext } from './context';

/**
 * Écran 4 — encart sur le ticket de l'équipe qui corrige (§13, PC-20) :
 * « Ce bug coûte 31 heures de support par mois à 212 personnes. »
 * Ressource `issue-context` du manifeste (`jira:issueContext`).
 */
function App(): JSX.Element {
  return <ScreenShell>{(context) => <ContextScreen context={context} />}</ScreenShell>;
}

ForgeReconciler.render(<App />);

/** Chargement de l'addition du bug : un seul appel resolver, aucun calcul (§17). */
function ContextScreen({ context }: { context: ScreenContext }): JSX.Element {
  const locale = context.locale;
  const issueId = context.issueId ?? '';
  const { state, reload } = useResolver(
    issueId,
    issueId === '' ? null : () => getIssueContext(issueId),
  );
  return (
    <AsyncView
      state={state}
      locale={locale}
      retry={reload}
      render={(data) => (
        <Fragment>
          <ContextCost locale={locale} data={data} />
          <ContextProblems locale={locale} problems={data.problems} />
        </Fragment>
      )}
    />
  );
}
