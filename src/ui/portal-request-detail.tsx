/**
 * Écran 7 — Détail d'une demande côté client dans le portail JSM (§13.7, PC-19).
 * Ressource Forge `portal-request-detail` (`jiraServiceManagement:portalRequestDetailPanel`).
 * §16 : ce panneau n'accepte pas les visiteurs anonymes — le contexte porte donc la demande.
 */

import { Fragment, PortalRequestDetailPanel } from '@forge/ui';
import type { RequestDetailData } from './api.ts';
import { getRequestDetail } from './api.ts';
import { useResolver } from './async.ts';
import { AsyncView } from './components/AsyncView.tsx';
import { RequestLink } from './components/RequestLink.tsx';
import { ScreenShell } from './components/ScreenShell.tsx';
import type { ScreenContext } from './context.ts';

/** Point d'entrée de la ressource `portal-request-detail`. */
export default function App(): JSX.Element {
  return (
    <PortalRequestDetailPanel>
      <ScreenShell>{(ctx) => <RequestDetailBody ctx={ctx} />}</ScreenShell>
    </PortalRequestDetailPanel>
  );
}

function RequestDetailBody({ ctx }: { ctx: ScreenContext }): JSX.Element {
  // La demande du portail porte le ticket Jira sous-jacent : son identifiant suffit (§13.7).
  const issueId = ctx.issueId ?? ctx.issueKey ?? '';
  const { state, reload } = useResolver<RequestDetailData>(
    issueId ? `request-detail:${issueId}` : '',
    issueId ? () => getRequestDetail(issueId) : null,
  );

  if (!issueId) return <Fragment>{null}</Fragment>;

  return (
    <AsyncView
      state={state}
      locale={ctx.locale}
      retry={reload}
      render={(detail) => <RequestLink locale={ctx.locale} detail={detail} />}
    />
  );
}
