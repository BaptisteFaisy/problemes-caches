/**
 * Seuils de suspicion, durée moyenne, taux horaire, type problème et flambées (§13.5).
 * Aucun calcul métier (§17) : affiche et collecte uniquement les paramètres saisis.
 */

import { Fragment } from 'react';
import { Heading, Textfield } from '@forge/react';
import type { Settings } from '../../core/types';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

export interface SettingsThresholdsProps {
  locale: Locale;
  settings: Settings;
}

/** Bloc formulaire des seuils (fenêtre 30 j), coûts, type de problème et flambées (§13.5). */
export function SettingsThresholds({ locale, settings }: SettingsThresholdsProps): JSX.Element {
  return (
    <Fragment>
      <Heading size="medium">{t(locale, 'settings.thresholds')}</Heading>
      <Textfield
        name="thresholdTickets"
        type="number"
        label={t(locale, 'settings.thresholdTickets')}
        defaultValue={String(settings.thresholds.tickets)}
        isRequired
      />
      <Textfield
        name="thresholdHours"
        type="number"
        label={t(locale, 'settings.thresholdHours')}
        defaultValue={String(settings.thresholds.hours)}
        isRequired
      />
      <Textfield
        name="thresholdPeople"
        type="number"
        label={t(locale, 'settings.thresholdPeople')}
        defaultValue={String(settings.thresholds.people)}
        isRequired
      />
      <Textfield
        name="minutesPerTouch"
        type="number"
        label={t(locale, 'settings.minutesPerTouch')}
        defaultValue={String(settings.minutesPerTouch)}
        isRequired
      />
      <Textfield
        name="hourRateEur"
        type="number"
        label={t(locale, 'settings.hourRate')}
        defaultValue={settings.hourRateEur === null ? '' : String(settings.hourRateEur)}
      />
      <ProblemTypeField locale={locale} problemIssueType={settings.problemIssueType} />
      <SurgeFields locale={locale} settings={settings} />
    </Fragment>
  );
}

function ProblemTypeField({
  locale,
  problemIssueType,
}: {
  locale: Locale;
  problemIssueType: string | null;
}): JSX.Element {
  return (
    <Textfield
      name="problemIssueType"
      label={t(locale, 'settings.problemType')}
      description={t(locale, 'settings.problemTypeHelp')}
      defaultValue={problemIssueType ?? ''}
    />
  );
}

function SurgeFields({ locale, settings }: { locale: Locale; settings: Settings }): JSX.Element {
  return (
    <Fragment>
      <Heading size="medium">{t(locale, 'settings.surge')}</Heading>
      <Textfield
        name="surgeFactor"
        type="number"
        label={t(locale, 'settings.surgeFactor')}
        defaultValue={String(settings.surgeFactor)}
        isRequired
      />
      <Textfield
        name="surgeWindowMinutes"
        type="number"
        label={t(locale, 'settings.surgeWindow')}
        defaultValue={String(settings.surgeWindowMinutes)}
        isRequired
      />
      <Textfield
        name="watchDays"
        type="number"
        label={t(locale, 'settings.watchDays')}
        defaultValue={String(settings.watchDays)}
        isRequired
      />
    </Fragment>
  );
}
