/**
 * Seuils de suspicion, coûts, type de problème et flambées (§13.5, §8.5, §8.6).
 *
 * Aucun calcul métier (§17) : le composant affiche les valeurs et remonte la
 * saisie brute au formulaire parent, qui seul les convertit en `Settings`
 * (`SettingsHelpers.buildSettingsFromForm`).
 */

import { Heading } from '@forge/react';
import type { Settings } from '../../core/types';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { SettingsField } from './SettingsField';
import type { SettingsFormData } from './SettingsHelpers';

export interface SettingsThresholdsProps {
  locale: Locale;
  /** Valeurs courantes du formulaire, tenues par `SettingsForm`. */
  values: SettingsFormData;
  /** Remonte une saisie : `onChange(name, value)`. */
  onChange: (name: string, value: unknown) => void;
}

/** Bloc « seuils » : tickets, heures, personnes sur la fenêtre de 30 jours (§8.5). */
export function SettingsThresholds({ locale, values, onChange }: SettingsThresholdsProps): JSX.Element {
  return (
    <>
      <Heading size="medium">{t(locale, 'settings.thresholds')}</Heading>
      <NumberField
        locale={locale}
        values={values}
        onChange={onChange}
        name="thresholdTickets"
        labelKey="settings.thresholdTickets"
        required
      />
      <NumberField
        locale={locale}
        values={values}
        onChange={onChange}
        name="thresholdHours"
        labelKey="settings.thresholdHours"
        required
      />
      <NumberField
        locale={locale}
        values={values}
        onChange={onChange}
        name="thresholdPeople"
        labelKey="settings.thresholdPeople"
        required
      />
      <NumberField
        locale={locale}
        values={values}
        onChange={onChange}
        name="minutesPerTouch"
        labelKey="settings.minutesPerTouch"
        required
      />
      <NumberField
        locale={locale}
        values={values}
        onChange={onChange}
        name="hourRateEur"
        labelKey="settings.hourRate"
      />
      <ProblemTypeField locale={locale} values={values} onChange={onChange} />
      <SurgeFields locale={locale} values={values} onChange={onChange} />
    </>
  );
}

/** Champ numérique du formulaire, libellé par la clé i18n passée (§17 : pas de texte en dur). */
function NumberField({
  locale,
  values,
  onChange,
  name,
  labelKey,
  required,
}: {
  locale: Locale;
  values: SettingsFormData;
  onChange: (name: string, value: unknown) => void;
  name: string;
  labelKey: Parameters<typeof t>[1];
  required?: boolean;
}): JSX.Element {
  return (
    <SettingsField
      name={name}
      type="number"
      label={t(locale, labelKey)}
      defaultValue={String(values[name] ?? '')}
      isRequired={required}
      onChange={(value) => onChange(name, value)}
    />
  );
}

/** Type du ticket de problème : celui du projet s'il existe, sinon ce choix (§10). */
function ProblemTypeField({
  locale,
  values,
  onChange,
}: {
  locale: Locale;
  values: SettingsFormData;
  onChange: (name: string, value: unknown) => void;
}): JSX.Element {
  return (
    <SettingsField
      name="problemIssueType"
      label={t(locale, 'settings.problemType')}
      description={t(locale, 'settings.problemTypeHelp')}
      defaultValue={String(values['problemIssueType'] ?? '')}
      onChange={(value) => onChange('problemIssueType', value)}
    />
  );
}

/** Réglages de détection des flambées et de la surveillance après correction (§8.6, §7.4). */
function SurgeFields({
  locale,
  values,
  onChange,
}: {
  locale: Locale;
  values: SettingsFormData;
  onChange: (name: string, value: unknown) => void;
}): JSX.Element {
  const champs: { name: string; labelKey: Parameters<typeof t>[1] }[] = [
    { name: 'surgeFactor', labelKey: 'settings.surgeFactor' },
    { name: 'surgeWindowMinutes', labelKey: 'settings.surgeWindow' },
    { name: 'watchDays', labelKey: 'settings.watchDays' },
  ];
  return (
    <>
      <Heading size="medium">{t(locale, 'settings.surge')}</Heading>
      {champs.map((champ) => (
        <NumberField
          key={champ.name}
          locale={locale}
          values={values}
          onChange={onChange}
          name={champ.name}
          labelKey={champ.labelKey}
          required
        />
      ))}
    </>
  );
}

/** Type conservé pour les appelants historiques : les réglages lus du resolver. */
export type SettingsForThresholds = Settings;
