/**
 * Écran 6 — Bandeau de problème connu dans le portail JSM (§7.3, §13.6, PC-15, PC-16).
 * Ressource Forge `portal-subheader` (`jiraServiceManagement:portalSubheader`).
 *
 * §16 : le sous-en-tête du portail **accepte les visiteurs anonymes** — l'affichage du
 * bandeau n'exige donc jamais de compte. `ScreenContext` n'expose pas le service consulté :
 * on passe `service: null`, le backend livre alors le bandeau global limité aux trois
 * problèmes les plus actifs (repli prévu au §16) et indique le service s'il le connaît.
 */

import { PortalSubheader, useProductContext } from '@forge/ui';
import type { PortalBannerData } from './api.ts';
import { getPortalBanner } from './api.ts';
import { useResolver } from './async.ts';
import { AsyncView } from './components/AsyncView.tsx';
import { PortalBanner } from './components/PortalBanner.tsx';
import { ScreenShell } from './components/ScreenShell.tsx';
import type { ScreenContext } from './context.ts';

/** Contexte produit Forge (non exporté par `@forge/ui` : on le déduit du hook). */
type ProductContextValue = ReturnType<typeof useProductContext>;

/** Point d'entrée de la ressource `portal-subheader`. */
export default function App(): JSX.Element {
  return (
    <PortalSubheader>
      <ScreenShell>{(ctx) => <PortalBannerScreen ctx={ctx} />}</ScreenShell>
    </PortalSubheader>
  );
}

function PortalBannerScreen({ ctx }: { ctx: ScreenContext }): JSX.Element {
  const product = useProductContext();
  const { state, reload } = useResolver<PortalBannerData>(
    `portal-banner:${ctx.projectKey}`,
    () => getPortalBanner(ctx.projectKey, null),
  );

  return (
    <AsyncView
      state={state}
      locale={ctx.locale}
      retry={reload}
      render={(data) => (
        <PortalBanner locale={ctx.locale} data={data} isAnonymous={isAnonymousVisitor(product)} />
      )}
    />
  );
}

/**
 * Visiteur non connecté : le bandeau reste affiché, mais « Moi aussi » ne peut pas compter
 * la personne (§16). On ne bloque jamais le rendu sur l'absence de compte.
 */
function isAnonymousVisitor(product: ProductContextValue | undefined): boolean {
  if (!product) return false;
  if (product.accountType === 'anonymous') return true;
  // Contexte incomplet (type de compte inconnu) : on reste optimiste et on laisse le
  // resolver expliquer l'échec au clic, plutôt que de bloquer tout le monde à tort (§16).
  if (!product.accountType) return false;
  const accountId = product.accountId;
  return typeof accountId !== 'string' || accountId === '';
}
