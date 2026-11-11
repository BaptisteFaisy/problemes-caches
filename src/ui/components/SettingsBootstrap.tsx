/**
 * Initialisation 90 jours, jeu d'exemple et qualité des données (§13.5, PC-10, PC-12).
 * Aucun calcul côté UI (§17) : affiche les compteurs et la progression fournis par le backend.
 */

import { Button, ButtonSet, Fragment, Heading, Range, SectionMessage, Text, useState } from '@forge/ui';
import type { BootstrapProgress, DataQuality } from '../../core/types.ts';
import { bootstrapProgress, clearSampleData, loadSampleData, startBootstrap } from '../api.ts';
import { errorMessage } from '../async.ts';
import { formatDate } from '../format.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

export interface SettingsBootstrapProps {
  locale: Locale;
  projectId: string;
  projectKey: string;
  demoData: boolean;
  quality: DataQuality;
  onRefresh: () => void;
}

/** Bloc opérations : initialisation 90 j avec barre de progression, jeu d'exemple, qualité (§13.5). */
export function SettingsBootstrap(props: SettingsBootstrapProps): JSX.Element {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showNotice = (msg: string): void => {
    setError(null);
    setNotice(msg || null);
    props.onRefresh();
  };

  return (
    <Fragment>
      <OperationFeedback locale={props.locale} notice={notice} error={error} />
      <BootstrapSection
        locale={props.locale}
        projectId={props.projectId}
        projectKey={props.projectKey}
        initialProgress={props.quality.bootstrap}
        onNotice={showNotice}
        onError={setError}
      />
      <SampleSection
        locale={props.locale}
        projectId={props.projectId}
        demoData={props.demoData}
        onNotice={showNotice}
        onError={setError}
      />
      <QualitySection locale={props.locale} quality={props.quality} />
    </Fragment>
  );
}

function OperationFeedback({
  locale,
  notice,
  error,
}: {
  locale: Locale;
  notice: string | null;
  error: string | null;
}): JSX.Element {
  return (
    <Fragment>
      {notice ? (
        <SectionMessage appearance="confirmation">
          <Text>{notice}</Text>
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

function BootstrapSection({
  locale,
  projectId,
  projectKey,
  initialProgress,
  onNotice,
  onError,
}: {
  locale: Locale;
  projectId: string;
  projectKey: string;
  initialProgress: BootstrapProgress | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const [progress, setProgress] = useState<BootstrapProgress | null>(initialProgress);

  const handleStart = async (): Promise<void> => {
    try {
      const started = await startBootstrap(projectId, projectKey);
      setProgress(started);
      onNotice(started.finished ? t(locale, 'settings.bootstrapDone') : '');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const handleCheck = async (): Promise<void> => {
    try {
      const latest = await bootstrapProgress(projectId);
      setProgress(latest);
      onNotice(latest?.finished ? t(locale, 'settings.bootstrapDone') : '');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <Fragment>
      <Heading size="medium">{t(locale, 'settings.bootstrap')}</Heading>
      <ButtonSet>
        <Button text={t(locale, 'settings.bootstrapRun')} onClick={handleStart} />
        <Button text={t(locale, 'common.retry')} onClick={handleCheck} />
      </ButtonSet>
      <BootstrapBar locale={locale} progress={progress} />
    </Fragment>
  );
}

/**
 * Barre de progression de l'initialisation (§14, PC-10). `@forge/ui` n'a pas de composant
 * de progression : `Range` sans `onChange` rend une barre remplie jusqu'à `done` sur
 * `total`, les chiffres venant du backend — l'UI ne calcule aucune proportion (§17).
 */
function BootstrapBar({
  locale,
  progress,
}: {
  locale: Locale;
  progress: BootstrapProgress | null;
}): JSX.Element | null {
  if (!progress) return null;
  return (
    <Fragment>
      <Range
        name="bootstrapProgressBar"
        label={t(locale, 'settings.bootstrapProgress', {
          done: progress.done,
          total: progress.total,
          failed: progress.failed,
        })}
        min={0}
        max={progress.total > 0 ? progress.total : 1}
        defaultValue={progress.done}
      />
      {progress.finished ? <Text>{t(locale, 'settings.bootstrapDone')}</Text> : null}
    </Fragment>
  );
}

function SampleSection({
  locale,
  projectId,
  demoData,
  onNotice,
  onError,
}: {
  locale: Locale;
  projectId: string;
  demoData: boolean;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}): JSX.Element {
  const handleLoad = async (): Promise<void> => {
    try {
      const res = await loadSampleData(projectId);
      onNotice(t(locale, 'settings.sampleLoaded', { count: res.tickets }));
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  const handleClear = async (): Promise<void> => {
    try {
      await clearSampleData(projectId);
      // Le bouton « retirer » disparaît au rafraîchissement : c'est le retour visuel (PC-12).
      onNotice('');
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  return (
    <Fragment>
      <Heading size="medium">{t(locale, 'settings.sample')}</Heading>
      <ButtonSet>
        <Button text={t(locale, 'settings.loadSample')} onClick={handleLoad} />
        {demoData ? <Button appearance="warning" text={t(locale, 'settings.clearSample')} onClick={handleClear} /> : null}
      </ButtonSet>
    </Fragment>
  );
}

function QualitySection({ locale, quality }: { locale: Locale; quality: DataQuality }): JSX.Element {
  return (
    <Fragment>
      <Heading size="medium">{t(locale, 'settings.quality')}</Heading>
      <Text>
        {t(locale, 'settings.qualityIndexed', {
          indexed: quality.ticketsIndexed,
          signatures: quality.signaturesExtracted,
          undetermined: quality.undetermined,
        })}
      </Text>
      {quality.lastSyncAt ? <Text>{formatDate(locale, quality.lastSyncAt)}</Text> : null}
    </Fragment>
  );
}
