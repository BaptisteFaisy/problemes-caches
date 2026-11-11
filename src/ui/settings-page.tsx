/**
 * Écran 5 — Réglages du projet (§13.5, PC-01 à PC-03, PC-10, PC-12).
 * Ressource Forge `settings-page` (`jira:projectSettingsPage`).
 */

import { Fragment, Heading, ProjectSettingsPage } from '@forge/ui';
import type { DataQuality, Settings, Vocabulary } from '../core/types.ts';
import { getDataQuality, getSettings, listVocabulary } from './api.ts';
import { useResolver } from './async.ts';
import { AsyncView } from './components/AsyncView.tsx';
import { ScreenShell } from './components/ScreenShell.tsx';
import { SettingsBootstrap } from './components/SettingsBootstrap.tsx';
import { SettingsForm } from './components/SettingsForm.tsx';
import { SettingsVocabulary } from './components/SettingsVocabulary.tsx';
import type { ScreenContext } from './context.ts';
import { t } from './i18n/index.ts';

type SettingsBundle = {
  settings: Settings;
  vocabulary: Vocabulary;
  quality: DataQuality;
};

/** Point d'entrée de la ressource `settings-page`. */
export default function App(): JSX.Element {
  return (
    <ProjectSettingsPage>
      <ScreenShell>{(ctx) => <SettingsBody ctx={ctx} />}</ScreenShell>
    </ProjectSettingsPage>
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
