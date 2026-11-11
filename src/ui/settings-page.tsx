/**
 * Écran 5 — Réglages du projet (§13.5, PC-01 à PC-03, PC-10, PC-12).
 * Ressource Forge `settings-page` (`jira:projectSettingsPage`).
 */

import { Fragment } from 'react';
import { Heading } from '@forge/react';
import type { DataQuality, Settings, Vocabulary } from '../core/types';
import { getDataQuality, getSettings, listVocabulary } from './api';
import { useResolver } from './async';
import { AsyncView } from './components/AsyncView';
import { ScreenShell } from './components/ScreenShell';
import { SettingsBootstrap } from './components/SettingsBootstrap';
import { SettingsForm } from './components/SettingsForm';
import { SettingsVocabulary } from './components/SettingsVocabulary';
import type { ScreenContext } from './context';
import { t } from './i18n/index';

type SettingsBundle = {
  settings: Settings;
  vocabulary: Vocabulary;
  quality: DataQuality;
};

/** Point d'entrée de la ressource `settings-page`. */
export default function App(): JSX.Element {
  return (
      <ScreenShell>{(ctx) => <SettingsBody ctx={ctx} />}</ScreenShell>
  );
}

function SettingsBody({ ctx }: { ctx: ScreenContext }): JSX.Element {
  const { state, reload } = useResolver<SettingsBundle>(
    ctx.projectId ? `settings:${ctx.projectId}` : '',
    ctx.projectId
      ? async () => {
          const [settings, vocabulary, quality] = await Promise.all([
            getSettings(ctx.projectId),
            listVocabulary(ctx.projectId),
            getDataQuality(ctx.projectId),
          ]);
          return { settings, vocabulary, quality };
        }
      : null,
  );

  return (
    <Fragment>
      <Heading size="large">{t(ctx.locale, 'settings.title')}</Heading>
      <AsyncView
        state={state}
        locale={ctx.locale}
        retry={reload}
        render={(data) => (
          <Fragment>
            <SettingsForm
              locale={ctx.locale}
              initial={data.settings}
              projectKey={ctx.projectKey}
              onSaved={() => reload()}
            />
            <SettingsVocabulary
              locale={ctx.locale}
              vocabulary={data.vocabulary}
              onUpdated={() => reload()}
            />
            <SettingsBootstrap
              locale={ctx.locale}
              projectId={ctx.projectId}
              projectKey={ctx.projectKey}
              demoData={data.settings.demoData}
              quality={data.quality}
              onRefresh={reload}
            />
          </Fragment>
        )}
      />
    </Fragment>
  );
}
