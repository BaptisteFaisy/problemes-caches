import { Fragment } from 'react';
import { Button, ButtonGroup, Heading, Text } from '@forge/react';
import type { ClusterLine } from '../api';
import { formatInt } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { QueueBillLine } from './QueueBillLine';
import { QueueTrend } from './QueueTrend';

/** Ce qu'il faut pour décider d'une grappe suspecte (§7.1, PC-09). */
export interface QueueSuspectsProps {
  locale: Locale;
  lines: ClusterLine[];
  windowDays: number;
  busy: boolean;
  onConfirm: (line: ClusterLine) => void;
  onReject: (clusterId: string) => void;
  onSplit: (line: ClusterLine) => void;
}

/**
 * Suspects à traiter : la grappe, son addition, la tendance et les trois
 * décisions humaines : confirmer, rejeter, scinder.
 */
export function QueueSuspects(props: QueueSuspectsProps): JSX.Element | null {
  const { locale, lines } = props;
  if (lines.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'problems.suspects')}</Heading>
      {lines.map((line) => (
        <QueueSuspectRow key={line.cluster.id} row={props} line={line} />
      ))}
    </Fragment>
  );
}

/** Une grappe suspecte : signature, addition, seuil franchi, tendance, décisions. */
function QueueSuspectRow({
  row,
  line,
}: {
  row: QueueSuspectsProps;
  line: ClusterLine;
}): JSX.Element {
  const { locale, windowDays, busy, onConfirm, onReject, onSplit } = row;
  return (
    <Fragment>
      <Text>{signatureOf(locale, line)}</Text>
      <QueueBillLine
        locale={locale}
        tickets={line.cluster.tickets30d}
        hours={line.cluster.hours30d}
        people={line.cluster.people30d}
      />
      <Text>{thresholdOf(locale, line, windowDays)}</Text>
      <QueueTrend locale={locale} trend={line.trend} />
      <ButtonGroup>
        <Button
     appearance="primary"
     
     isDisabled={busy}
     onClick={() => onConfirm(line)}>t(locale, 'problems.confirm')</Button>
        <Button
     
     isDisabled={busy}
     onClick={() => onReject(line.cluster.id)}>t(locale, 'problems.reject')</Button>
        <Button
     
     isDisabled={busy}
     onClick={() => onSplit(line)}>t(locale, 'problems.split')</Button>
      </ButtonGroup>
    </Fragment>
  );
}

/** Le déclencheur de la signature est la seule partie lisible livrée (§8.2). */
function signatureOf(locale: Locale, line: ClusterLine): string {
  return line.cluster.triggerText || t(locale, 'common.unknown');
}

/** Le seuil franchi, avec le chiffre qui l'a franchi (§8.5). */
function thresholdOf(locale: Locale, line: ClusterLine, windowDays: number): string {
  const hit = line.thresholdHit;
  const cluster = line.cluster;
  if (hit === 'tickets') {
    return t(locale, 'problems.threshold.tickets', {
      value: formatInt(locale, cluster.tickets30d),
      days: formatInt(locale, windowDays),
    });
  }
  if (hit === 'hours') {
    return t(locale, 'problems.threshold.hours', { value: formatInt(locale, cluster.hours30d) });
  }
  if (hit === 'people') {
    return t(locale, 'problems.threshold.people', { value: formatInt(locale, cluster.people30d) });
  }
  return t(locale, 'common.unknown');
}
