/**
 * Formulaire principal des réglages du projet (§13 écran 5).
 * Champs : projet de service suivi, seuils et coûts, type du ticket de problème,
 * services du portail qui affichent le bandeau, et postes de l'addition activés (§9).
 * L'enregistrement passe par `saveSettings` avec un retour visuel (§13.5).
 */

import { Fragment, useState } from 'react';
import { Checkbox, CheckboxGroup, Form, SectionMessage, Text, Textfield } from '@forge/react';
import { BILL_LINE_KEYS } from '../../core/constants';
import type { BillLineKey, Settings } from '../../core/types';
import { saveSettings } from '../api';
import { errorMessage } from '../async';
import type { Locale, MessageKey } from '../i18n/index';
import { t } from '../i18n/index';
import type { SettingsFormData } from './SettingsHelpers';
import { buildSettingsFromForm } from './SettingsHelpers';
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

  const handleSubmit = async (formData: SettingsFormData): Promise<void> => {
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await saveSettings(buildSettingsFromForm(initial, formData));
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  };

  return (
    <Fragment>
      <SaveFeedback locale={locale} saved={saved} error={saveError} />
      <Form
        onSubmit={handleSubmit}
        submitButtonText={t(locale, 'common.save')}
        submitButtonAppearance="primary"
      >
        <WatchedProjectField
          locale={locale}
          projectKey={initial.projectKey || projectKey}
        />
        <SettingsThresholds locale={locale} settings={initial} />
        <Textfield
          name="portalServices"
          label={t(locale, 'settings.portalServices')}
          defaultValue={initial.portalServices.join(', ')}
        />
        <BillLinesGroup locale={locale} enabledLines={initial.enabledLines} />
      </Form>
    </Fragment>
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
}): JSX.Element {
  return (
    <Fragment>
      {saved ? (
        <SectionMessage appearance="confirmation">
          <Text>{t(locale, 'settings.saved')}</Text>
        </SectionMessage>
      ) : null}
      {error ? (
        <SectionMessage appearance="error" title={t(locale, 'common.errorTitle')}>
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
    </Fragment>
  );
}

/**
 * Projet de service suivi par ces réglages (§13.5). La table `settings` (§15) porte une
 * ligne par projet, avec le `project_key` réellement surveillé : on le règle ici.
 */
function WatchedProjectField({ locale, projectKey }: { locale: Locale; projectKey: string }): JSX.Element {
  return (
    <Textfield
      name="watchedProject"
      label={t(locale, 'settings.projects')}
      defaultValue={projectKey}
      isRequired
    />
  );
}

function BillLinesGroup({ locale, enabledLines }: { locale: Locale; enabledLines: BillLineKey[] }): JSX.Element {
  const enabled = new Set(enabledLines);
  return (
    <CheckboxGroup name="enabledLines" label={t(locale, 'settings.lines')}>
      {BILL_LINE_KEYS.map((line) => (
        <Checkbox label={t(locale, LINE_LABEL_KEYS[line])} value={line} defaultChecked={enabled.has(line)} />
      ))}
    </CheckboxGroup>
  );
}
