/**
 * Écran 7 — Détail d'une demande, côté client dans le portail JSM (§13.7, PC-19).
 * Ce que le client voit de son rattachement à un problème connu : un état lisible,
 * le contournement et le ticket de correctif. Aucun détail interne (§17 vie privée) :
 * ni heures, ni nom d'agent, ni tickets d'autres clients.
 */

import { Fragment } from 'react';
import { Lozenge, SectionMessage, Text } from '@forge/react';
import type { ProblemState } from '../../core/types';
import { formatDate, stateLabel } from '../format';
import type { RequestDetailData } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

export interface RequestLinkProps {
  locale: Locale;
  detail: RequestDetailData;
}

/** Encart client : rattachement, état, contournement, correctif (§13 écran 7, PC-19). */
export function RequestLink({ locale, detail }: RequestLinkProps): JSX.Element {
  // Sans problème connu, le panneau reste vide : on n'inquiète pas le client (§23).
  if (!detail.problemKey || !detail.state) return <Fragment>{null}</Fragment>;

  const state = detail.state;
  const stateText = stateLabel(locale, state);
  // Le correctif est nommé par son ticket quand il existe, sinon par sa date (§13.7).
  const fixTarget = detail.fixIssueKey ?? detail.fixedAt;

  return (
    <SectionMessage appearance="information" title={t(locale, 'portal.request.attached')}>
      <Lozenge appearance={stateAppearance(state)}>{stateText}</Lozenge>
      <Text>{t(locale, 'portal.request.state', { state: stateText })}</Text>
      {detail.workaround ? <Text>{detail.workaround}</Text> : null}
      {fixTarget ? (
        <Text>
          {t(locale, 'portal.request.fix', {
            key: detail.fixIssueKey ?? formatDate(locale, detail.fixedAt),
          })}
        </Text>
      ) : null}
    </SectionMessage>
  );
}

/** Couleur de l'état, pour une lecture immédiate côté client (§5). */
function stateAppearance(state: ProblemState): 'default' | 'inprogress' | 'removed' | 'success' {
  if (state === 'fixed' || state === 'verified') return 'success';
  if (state === 'regression') return 'removed';
  if (state === 'workaround-published' || state === 'cause-known') return 'inprogress';
  return 'default';
}
