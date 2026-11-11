import { Fragment } from 'react';
import { Heading, Lozenge, Text } from '@forge/react';
import type { ClusterLine } from '../api';
import { formatInt, stateLabel } from '../format';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { QueueBillLine } from './QueueBillLine';
import { QueueTrend } from './QueueTrend';

/**
 * Problèmes classés par coût (§7.1, PC-09). L'ordre vient du resolver : l'UI
 * ne trie et n'additionne jamais (§17).
 */
export function QueueByCost({
  locale,
  lines,
}: {
  locale: Locale;
  lines: ClusterLine[];
}): JSX.Element | null {
  if (lines.length === 0) return null;
  return (
    <Fragment>
      <Heading size="small">{t(locale, 'problems.byCost')}</Heading>
      {lines.map((line) => (
        <QueueByCostRow key={rowKey(line)} locale={locale} line={line} />
      ))}
    </Fragment>
  );
}

/** Clé de rendu : le ticket de problème s'il existe, sinon la grappe. */
function rowKey(line: ClusterLine): string {
  return line.problem?.id ?? line.cluster.id;
}

/** Une ligne de classement : problème, état, addition, tendance, éléments masqués. */
function QueueByCostRow({
  locale,
  line,
}: {
  locale: Locale;
  line: ClusterLine;
}): JSX.Element {
  const problem = line.problem;
  const title = problem
    ? t(locale, 'panel.knownProblem', { key: problem.issueKey ?? problem.id })
    : t(locale, 'panel.suspectedCluster');
  const hidden = line.bill?.hiddenCount ?? 0;
  return (
    <Fragment>
      <Text>{title}</Text>
      {problem ? <Lozenge>{stateLabel(locale, problem.state)}</Lozenge> : null}
      <QueueBillLine
        locale={locale}
        tickets={line.bill?.tickets}
        hours={line.bill?.hours}
        people={line.bill?.people}
      />
      <QueueTrend locale={locale} trend={line.trend} />
      {hidden > 0 ? (
        <Text>{t(locale, 'common.hidden', { count: formatInt(locale, hidden) })}</Text>
      ) : null}
    </Fragment>
  );
}
