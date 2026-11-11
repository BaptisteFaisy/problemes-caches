import { Text } from '@forge/react';
import type { Trend } from '../../core/types';
import type { Locale, MessageKey } from '../i18n/index';
import { t } from '../i18n/index';

/** Direction d'une tendance vers son libellé (§9). */
const TREND_KEYS: Record<Trend['direction'], MessageKey> = {
  up: 'common.trend.up',
  down: 'common.trend.down',
  flat: 'common.trend.flat',
};

/**
 * Tendance d'une addition : la direction et le delta sont calculés par le
 * resolver, l'UI ne fait que les nommer (§9, §17).
 */
export function QueueTrend({
  locale,
  trend,
}: {
  locale: Locale;
  trend: Trend | null;
}): JSX.Element | null {
  if (!trend) return null;
  const key = TREND_KEYS[trend.direction] ?? 'common.trend.flat';
  return <Text>{t(locale, 'problems.trend', { direction: t(locale, key) })}</Text>;
}
