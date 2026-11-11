/**
 * Formulaire des réglages — état contrôlé (§13 écran 5).
 *
 * UI Kit 2 : `Form.onSubmit` ne reçoit plus les valeurs et `Textfield` n'a plus
 * de prop `label`. L'écran tient donc l'état de la saisie (`useState`), chaque
 * champ remonte sa valeur, et l'enregistrement passe par `saveSettings` avec un
 * retour visuel. Aucun calcul métier ici (§17) : les valeurs brutes sont
 * converties par `SettingsHelpers.buildSettingsFromForm`.
 */

import { useState } from 'react';
import { Button, CheckboxGroup, Form, SectionMessage, Text } from '@forge/react';
import { BILL_LINE_KEYS } from '../../core/constants';
import type { BillLineKey, Settings } from '../../core/types';
import { saveSettings } from '../api';
import { errorMessage } from '../async';
import type { Locale, MessageKey } from '../i18n/index';
import { t } from '../i18n/index';
import { SettingsField } from './SettingsField';
import type { SettingsFormData } from './SettingsHelpers';
import { buildSettingsFromForm, formValuesFromSettings } from './SettingsHelpers';
import { SettingsThresholds } from './SettingsThresholds';

/** Libellés des huit postes de l'addition, une seule table de correspondance (§9). */
const LINE_LABEL_KEYS: Record<BillLineKey, MessageKey> = {
  tickets: 'problem.line.tickets',
  hours: 'problem.line.hours',
  people: 'problem.line.people',
  orgs: 'problem.line.orgs',
  slaBreaches: 'problem.line.slaBreaches',
  reopens: 'problem.line.reopens',
  escalations: 'problem.line.escalations',
  meToo: 'problem.line.meToo',
};

export interface SettingsFormProps {
  locale: Locale;
  initial: Settings;
  projectKey: string;
  onSaved: (updated: Settings) => void;
}

/** Formulaire de configuration + retour visuel à l'enregistrement (§13.5). */
export function SettingsForm({ locale, initial, projectKey, onSaved }: SettingsFormProps): JSX.Element {
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [values, setValues] = useState<SettingsFormData>(() =>
    formValuesFromSettings(initial, projectKey),
  );

  const setValue = (name: string, value: unknown): void => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (): Promise<void> => {
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await saveSettings(buildSettingsFromForm(initial, values));
      setSaved(true);
      setValues(formValuesFromSettings(updated, projectKey));
      onSaved(updated);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  };

  return (
    <>
      <SaveFeedback locale={locale} saved={saved} error={saveError} />
      <Form onSubmit={handleSubmit}>
        <SettingsFields
          locale={locale}
          values={values}
          enabledLines={initial.enabledLines}
          onChange={setValue}
        />
        <Button appearance="primary" type="submit">
          {t(locale, 'common.save')}
        </Button>
      </Form>
    </>
  );
}

/** Champs de saisie du formulaire, hors titre et bouton (§13.5). */
function SettingsFields({
  locale,
  values,
  enabledLines,
  onChange,
}: {
  locale: Locale;
  values: SettingsFormData;
  enabledLines: BillLineKey[];
  onChange: (name: string, value: unknown) => void;
}): JSX.Element {
  return (
    <>
      <SettingsField
        name="watchedProject"
        label={t(locale, 'settings.projects')}
        defaultValue={String(values['watchedProject'] ?? '')}
        isRequired
        onChange={(value) => onChange('watchedProject', value)}
      />
      <SettingsThresholds locale={locale} values={values} onChange={onChange} />
      <SettingsField
        name="portalServices"
        label={t(locale, 'settings.portalServices')}
        defaultValue={String(values['portalServices'] ?? '')}
        onChange={(value) => onChange('portalServices', value)}
      />
      <BillLinesGroup
        locale={locale}
        enabledLines={enabledLines}
        onChange={(lines) => onChange('enabledLines', lines)}
      />
    </>
  );
}

function SaveFeedback({
  locale,
  saved,
  error,
}: {
  locale: Locale;
  saved: boolean;
  error: string | null;
}): JSX.Element | null {
  if (saved) {
    return (
      <SectionMessage appearance="success">
        <Text>{t(locale, 'settings.saved')}</Text>
      </SectionMessage>
    );
  }
  if (error) {
    return (
      <SectionMessage appearance="error" title={t(locale, 'common.errorTitle')}>
        <Text>{error}</Text>
      </SectionMessage>
    );
  }
  return null;
}

/** Postes de l'addition activés (§9) : `CheckboxGroup` attend des `options`. */
function BillLinesGroup({
  locale,
  enabledLines,
  onChange,
}: {
  locale: Locale;
  enabledLines: BillLineKey[];
  onChange: (lines: string[]) => void;
}): JSX.Element {
  const options = BILL_LINE_KEYS.map((line) => ({
    label: t(locale, LINE_LABEL_KEYS[line]),
    value: line as string,
  }));
  return (
    <CheckboxGroup
      name="enabledLines"
      options={options}
      defaultValue={[...enabledLines]}
      onChange={onChange}
    />
  );
}
