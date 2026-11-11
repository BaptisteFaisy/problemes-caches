import { Fragment } from 'react';
import { Heading, SectionMessage, Text } from '@forge/react';
import type { ClusterLine, ProblemsPageData } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { QueueBootstrap } from './QueueBootstrap';
import { QueueByCost } from './QueueByCost';
import { QueueQuality } from './QueueQuality';
import { QueueRecurring } from './QueueRecurring';
import { QueueSplit } from './QueueSplit';
import { QueueSurges } from './QueueSurges';
import { QueueSuspects } from './QueueSuspects';
import { QueueUnattached } from './QueueUnattached';

/** Tout ce que la page « Problèmes » sait faire (§7.1, PC-09). */
export interface QueueContentProps {
  locale: Locale;
  data: ProblemsPageData;
  notice: string | null;
  busy: boolean;
  splitLine: ClusterLine | null;
  onConfirm: (line: ClusterLine) => void;
  onReject: (clusterId: string) => void;
  onOpenSplit: (line: ClusterLine) => void;
  onSplit: (issueIds: string[], triggerText: string) => void;
  onCloseSplit: () => void;
  onBootstrap: () => void;
  onSample: () => void;
  onRefresh: () => void;
}

/**
 * Corps de la page « Problèmes » d'une file JSM (§13 écran 2). Tout vient de
 * `getProblemsPage` : l'UI affiche ce que le resolver a agrégé (§17).
 */
export function QueueContent(props: QueueContentProps): JSX.Element {
  const { locale, data, notice, busy, splitLine } = props;
  return (
    <Fragment>
      <Heading size="large">{t(locale, 'problems.title')}</Heading>
      {isEmpty(data) ? <Text>{t(locale, 'problems.empty')}</Text> : null}
      {notice ? (
        <SectionMessage appearance="information"><Text>{notice}</Text></SectionMessage>
      ) : null}
      <QueueSuspects
        locale={locale}
        lines={data.suspects}
        windowDays={data.settings.thresholds.windowDays}
        busy={busy}
        onConfirm={props.onConfirm}
        onReject={props.onReject}
        onSplit={props.onOpenSplit}
      />
      <QueueByCost locale={locale} lines={data.problems} />
      <QueueSurges
        locale={locale}
        surges={data.surges}
        windowMinutes={data.settings.surgeWindowMinutes}
      />
      <QueueRecurring locale={locale} lines={data.recurring} />
      <QueueUnattached locale={locale} tickets={data.unattached} />
      <QueueQuality locale={locale} quality={data.quality} />
      <QueueBootstrap
        locale={locale}
        bootstrap={data.quality.bootstrap}
        busy={busy}
        onBootstrap={props.onBootstrap}
        onSample={props.onSample}
        onRefresh={props.onRefresh}
      />
      {splitLine ? (
        <QueueSplit
          locale={locale}
          line={splitLine}
          onClose={props.onCloseSplit}
          onSplit={props.onSplit}
        />
      ) : null}
    </Fragment>
  );
}

/** Rien à afficher ? La page invite à initialiser ou à charger l'exemple. */
function isEmpty(data: ProblemsPageData): boolean {
  return (
    data.suspects.length === 0 &&
    data.problems.length === 0 &&
    data.recurring.length === 0 &&
    data.surges.length === 0 &&
    data.unattached.length === 0
  );
}
