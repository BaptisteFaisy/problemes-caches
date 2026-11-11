/**
 * Écran 6 — Bandeau de problème connu dans le portail JSM (§7.3, §13.6, PC-15, PC-16).
 * Ressource Forge `portal-subheader` (`jiraServiceManagement:portalSubheader`).
 *
 * §16 : le sous-en-tête du portail **accepte les visiteurs anonymes** — l'affichage du
 * bandeau n'exige donc jamais de compte. `ScreenContext` n'expose pas le service consulté :
 * on passe `service: null`, le backend livre alors le bandeau global limité aux trois
 * problèmes les plus actifs (repli prévu au §16) et indique le service s'il le connaît.
 * L'anonymat ne se déduit jamais côté client (UI Kit 2 : le contexte produit n'a pas de
 * `accountType`) : le bouton « Moi aussi » gère lui-même l'absence de compte via le resolver.
 */

import ForgeReconciler from '@forge/react';
import type { PortalBannerData } from './api';
import { getPortalBanner } from './api';
import { useResolver } from './async';
import { AsyncView } from './components/AsyncView';
import { PortalBanner } from './components/PortalBanner';
import { ScreenShell } from './components/ScreenShell';
import type { ScreenContext } from './context';

/** Point d'entrée de la ressource `portal-subheader`. */
function App(): JSX.Element {
  return (
    <ScreenShell>{(ctx) => <PortalBannerScreen ctx={ctx} />}</ScreenShell>
  );
}

ForgeReconciler.render(<App />);

function PortalBannerScreen({ ctx }: { ctx: ScreenContext }): JSX.Element {
  const { state, reload } = useResolver<PortalBannerData>(
    `portal-banner:${ctx.projectKey}`,
    () => getPortalBanner(ctx.projectKey, null),
  );

  return (
    <AsyncView
      state={state}
      locale={ctx.locale}
      retry={reload}
      // §16 : bandeau affiché sans conditionner sur le compte ; « Moi aussi »
      // explique lui-même l'échec au clic si le visiteur est anonyme.
      render={(data) => <PortalBanner locale={ctx.locale} data={data} isAnonymous={false} />}
    />
  );
}
