/**
 * Vocabulaire tenu par projet : systèmes et symptômes (§8.3, PC-02, §13.5).
 * Renommer, fusionner (regroupement sans rien recalculer) et scinder un terme.
 *
 * UI Kit 2 : `ModalDialog` → `Modal` dans `ModalTransition`, `Select`/`Option` →
 * `CheckboxGroup`/`RadioGroup` par `options`, `Table/Head/Row/Cell` → `Stack`/`Inline`,
 * et le `Form` ne rend plus les valeurs : l'état de chaque modale est contrôlé ici.
 */

import { useState } from 'react';
import {
  Button,
  ButtonGroup,
  CheckboxGroup,
  Heading,
  Inline,
  Modal,
  ModalBody,
  ModalFooter,
  ModalTransition,
  RadioGroup,
  SectionMessage,
  Stack,
  Text,
} from '@forge/react';
import type { Term, Vocabulary } from '../../core/types';
import { mergeTerms, renameTerm, splitTerm } from '../api';
import { errorMessage } from '../async';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { eventValue, SettingsField } from './SettingsField';
import { splitCsvList } from './SettingsHelpers';

type VocabModal =
  | { kind: 'rename'; term: Term }
  | { kind: 'split'; term: Term }
  | { kind: 'merge'; terms: Term[] }
  | null;

/** Résultat d'une action sur le vocabulaire : ce qui est affiché puis propagé. */
type VocabResult = { vocabulary: Vocabulary; regroupedTickets: number };

export interface SettingsVocabularyProps {
  locale: Locale;
  vocabulary: Vocabulary;
  onUpdated: (vocab: Vocabulary) => void;
}

/** Bloc vocabulaire : listes Systèmes et Symptômes + modales (§8.3). */
export function SettingsVocabulary({ locale, vocabulary, onUpdated }: SettingsVocabularyProps): JSX.Element {
  const [modal, setModal] = useState<VocabModal>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyResult = (result: VocabResult, showMerged: boolean): void => {
    setError(null);
    setFeedback(showMerged ? t(locale, 'settings.merged', { count: result.regroupedTickets }) : null);
    setModal(null);
    onUpdated(result.vocabulary);
  };

  return (
    <>
      <Heading size="medium">{t(locale, 'settings.vocabulary')}</Heading>
      <VocabNotice locale={locale} feedback={feedback} error={error} />
      <TermSection
        title={t(locale, 'settings.systems')}
        locale={locale}
        terms={vocabulary.systems}
        onAction={setModal}
      />
      <TermSection
        title={t(locale, 'settings.symptoms')}
        locale={locale}
        terms={vocabulary.symptoms}
        onAction={setModal}
      />
      <VocabularyModal
        locale={locale}
        modal={modal}
        onClose={() => setModal(null)}
        onError={setError}
        onDone={applyResult}
      />
    </>
  );
}

function VocabNotice({
  locale,
  feedback,
  error,
}: {
  locale: Locale;
  feedback: string | null;
  error: string | null;
}): JSX.Element | null {
  if (feedback) {
    return (
      <SectionMessage appearance="success">
        <Text>{feedback}</Text>
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

/** Une liste de termes : un libellé et ses deux actions par ligne (§8.3). */
function TermSection({
  title,
  locale,
  terms,
  onAction,
}: {
  title: string;
  locale: Locale;
  terms: Term[];
  onAction: (modal: VocabModal) => void;
}): JSX.Element {
  return (
    <>
      <Heading size="small">{title}</Heading>
      {terms.length >= 2 ? (
        <Button onClick={() => onAction({ kind: 'merge', terms })}>{t(locale, 'settings.merge')}</Button>
      ) : null}
      {terms.length === 0 ? (
        <Text>{t(locale, 'common.none')}</Text>
      ) : (
        <Stack space="space.100">
          {terms.map((term) => (
            <Inline key={term.id} space="space.100">
              <Text>{term.label}</Text>
              <ButtonGroup>
                <Button onClick={() => onAction({ kind: 'rename', term })}>
                  {t(locale, 'settings.rename')}
                </Button>
                <Button onClick={() => onAction({ kind: 'split', term })}>
                  {t(locale, 'settings.split')}
                </Button>
              </ButtonGroup>
            </Inline>
          ))}
        </Stack>
      )}
    </>
  );
}

interface ModalSharedProps {
  locale: Locale;
  onClose: () => void;
  onError: (msg: string) => void;
  onDone: (result: VocabResult, showMerged: boolean) => void;
}

function VocabularyModal({
  locale,
  modal,
  ...shared
}: ModalSharedProps & { modal: VocabModal }): JSX.Element | null {
  if (!modal) return null;
  if (modal.kind === 'rename') return <RenameModal locale={locale} term={modal.term} {...shared} />;
  if (modal.kind === 'split') return <SplitModal locale={locale} term={modal.term} {...shared} />;
  return <MergeModal locale={locale} terms={modal.terms} {...shared} />;
}

/** Enveloppe commune des trois modales : titre, corps, annuler / confirmer. */
function VocabModalShell({
  title,
  onClose,
  onConfirm,
  cancelLabel,
  confirmLabel,
  canConfirm,
  children,
}: {
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  cancelLabel: string;
  confirmLabel: string;
  canConfirm: boolean;
  children: JSX.Element;
}): JSX.Element {
  return (
    <ModalTransition>
      <Modal title={title} onClose={onClose} width="medium">
        <ModalBody>{children}</ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button appearance="primary" isDisabled={!canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
}

function RenameModal({ locale, term, onError, onDone, onClose }: ModalSharedProps & { term: Term }): JSX.Element {
  const [label, setLabel] = useState(term.label);

  const confirmer = async (): Promise<void> => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      onDone(await renameTerm(term.id, trimmed), false);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <VocabModalShell
      title={t(locale, 'settings.rename')}
      onClose={onClose}
      onConfirm={() => void confirmer()}
      cancelLabel={t(locale, 'common.cancel')}
      confirmLabel={t(locale, 'common.confirm')}
      canConfirm={label.trim().length > 0}
    >
      <SettingsField
        name="label"
        label={term.label}
        defaultValue={term.label}
        isRequired
        onChange={setLabel}
      />
    </VocabModalShell>
  );
}

function SplitModal({ locale, term, onError, onDone, onClose }: ModalSharedProps & { term: Term }): JSX.Element {
  const [label, setLabel] = useState('');
  const [issueIds, setIssueIds] = useState('');

  const confirmer = async (): Promise<void> => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      onDone(await splitTerm(term.id, splitCsvList(issueIds), trimmed), false);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <VocabModalShell
      title={t(locale, 'settings.split')}
      onClose={onClose}
      onConfirm={() => void confirmer()}
      cancelLabel={t(locale, 'common.cancel')}
      confirmLabel={t(locale, 'common.confirm')}
      canConfirm={label.trim().length > 0}
    >
      <>
        <SettingsField name="label" label={term.label} isRequired onChange={setLabel} />
        <SettingsField
          name="issueIds"
          label={t(locale, 'problem.attachedTickets')}
          onChange={setIssueIds}
        />
      </>
    </VocabModalShell>
  );
}

function MergeModal({
  locale,
  terms,
  onError,
  onDone,
  onClose,
}: ModalSharedProps & { terms: Term[] }): JSX.Element {
  const options = terms.map((term) => ({ label: term.label, value: term.id }));
  const [termIds, setTermIds] = useState<string[]>(terms.map((term) => term.id));
  const [keepId, setKeepId] = useState(terms[0]?.id ?? '');

  const confirmer = async (): Promise<void> => {
    const garde = keepId || (termIds[0] ?? '');
    if (termIds.length < 2 || !garde) return;
    try {
      onDone(await mergeTerms(termIds, garde), true);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <VocabModalShell
      title={t(locale, 'settings.merge')}
      onClose={onClose}
      onConfirm={() => void confirmer()}
      cancelLabel={t(locale, 'common.cancel')}
      confirmLabel={t(locale, 'common.confirm')}
      canConfirm={termIds.length >= 2}
    >
      <>
        <CheckboxGroup
          name="termIds"
          options={options}
          defaultValue={termIds}
          onChange={setTermIds}
        />
        <RadioGroup
          name="keepId"
          options={options}
          defaultValue={keepId}
          onChange={(event) => setKeepId(eventValue(event))}
        />
      </>
    </VocabModalShell>
  );
}
