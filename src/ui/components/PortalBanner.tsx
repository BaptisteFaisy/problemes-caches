/**
 * Bandeau de problème connu dans le portail JSM (§7.3, §13 écran 6, PC-15, PC-16).
 * Affiche les problèmes actifs du service consulté — ou, à défaut de service connu,
 * le bandeau global limité aux trois problèmes les plus actifs (§16, choix du backend).
 * §23 : le bandeau disparaît de lui-même dès qu'aucun problème actif n'est renvoyé
 * (un problème vérifié n'est plus publié) ; l'UI ne filtre et ne calcule rien (§17).
 */

import { Fragment, SectionMessage, Strong, Text } from '@forge/ui';
import type { PortalBannerData } from '../api.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';
import { PortalMeToo } from './PortalMeToo.tsx';

/** Une ligne du bandeau : un problème publié sur le portail (§13.6). */
type BannerProblem = PortalBannerData['problems'][number];

export interface PortalBannerProps {
  locale: Locale;
  data: PortalBannerData;
  isAnonymous: boolean;
}

/** Contenu du bandeau ; rien n'est rendu quand aucun problème actif n'est publié (§23). */
export function PortalBanner({ locale, data, isAnonymous }: PortalBannerProps): JSX.Element {
  if (data.problems.length === 0) return <Fragment>{null}</Fragment>;

  const title = data.service
    ? t(locale, 'portal.banner.title', { service: data.service })
    : t(locale, 'portal.banner.global');

  return (
    <SectionMessage appearance="warning" title={title}>
      {data.problems.map((problem) => (
        <BannerProblemRow locale={locale} problem={problem} isAnonymous={isAnonymous} />
      ))}
    </SectionMessage>
  );
}

function BannerProblemRow({
  locale,
  problem,
  isAnonymous,
}: {
  locale: Locale;
  problem: BannerProblem;
  isAnonymous: boolean;
}): JSX.Element {
  return (
    <Fragment>
      <Text>
        <Strong>{problem.systemLabel}</Strong>
      </Text>
      <Text>{t(locale, 'portal.banner.body', { symptom: problem.symptomLabel })}</Text>
      {problem.workaround ? <Text>{problem.workaround}</Text> : null}
      <PortalMeToo
        locale={locale}
        problemId={problem.problemId}
        symptomLabel={problem.symptomLabel}
        isAnonymous={isAnonymous}
      />
    </Fragment>
  );
}
