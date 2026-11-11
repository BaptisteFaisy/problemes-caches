/**
 * Gestion du vocabulaire tenu par projet : systèmes et symptômes (§8.3, PC-02, §13.5).
 * Permet de renommer, fusionner (regroupement sans rien recalculer) et scinder un terme.
 */

import { Fragment, useState } from 'react';
import { Button, ButtonGroup, Cell, Form, Head, Heading, ModalDialog, Option, Row, SectionMessage, Select, Table, Text, Textfield } from '@forge/react';
import type { Term, Vocabulary } from '../../core/types';
import { mergeTerms, renameTerm, splitTerm } from '../api';
import { errorMessage } from '../async';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { splitCsvList } from './SettingsHelpers';

type VocabModal =
  | { kind: 'rename'; term: Term }
  | { kind: 'split'; term: Term }
  | { kind: 'merge'; terms: Term[] }
  | null;

export interface SettingsVocabularyProps {
  locale: Locale;
  vocabulary: Vocabulary;
  onUpdated: (vocab: Vocabulary) => void;
}

/** Bloc vocabulaire : listes Systèmes et Symptômes + modales renommer / fusionner / scinder (§8.3). */
export function SettingsVocabulary({ locale, vocabulary, onUpdated }: SettingsVocabularyProps): JSX.Element {
  const [modal, setModal] = useState<VocabModal>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyResult = (vocab: Vocabulary, regrouped: number, showMerged: boolean): void => {
    setError(null);
    setFeedback(showMerged ? t(locale, 'settings.merged', { count: regrouped }) : null);
    setModal(null);
    onUpdated(vocab);
  };

  return (
    <Fragment>
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
    </Fragment>
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
}): JSX.Element {
  return (
    <Fragment>
      {feedback ? (
        <SectionMessage appearance="confirmation">
          <Text>{feedback}</Text>
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
    <Fragment>
      <Heading size="small">{title}</Heading>
      {terms.length >= 2 ? (
        <Button text={t(locale, 'settings.merge')} onClick={() => onAction({ kind: 'merge', terms })} />
      ) : null}
      {terms.length === 0 ? (
        <Text>{t(locale, 'common.none')}</Text>
      ) : (
        <Table>
          <Head>
            <Cell>
              <Text>{title}</Text>
            </Cell>
            <Cell>
              <Text> </Text>
            </Cell>
          </Head>
          {terms.map((term) => (
            <Row>
              <Cell>
                <Text>{term.label}</Text>
              </Cell>
              <Cell>
                <ButtonGroup>
                  <Button text={t(locale, 'settings.rename')} onClick={() => onAction({ kind: 'rename', term })} />
                  <Button text={t(locale, 'settings.split')} onClick={() => onAction({ kind: 'split', term })} />
                </ButtonGroup>
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Fragment>
  );
}

function VocabularyModal({
  locale,
  modal,
  onClose,
  onError,
  onDone,
}: {
  locale: Locale;
  modal: VocabModal;
  onClose: () => void;
  onError: (msg: string) => void;
  onDone: (vocab: Vocabulary, regrouped: number, showMerged: boolean) => void;
}): JSX.Element | null {
  if (!modal) return null;
  if (modal.kind === 'rename') {
    return <RenameModal locale={locale} term={modal.term} onClose={onClose} onError={onError} onDone={onDone} />;
  }
  if (modal.kind === 'split') {
    return <SplitModal locale={locale} term={modal.term} onClose={onClose} onError={onError} onDone={onDone} />;
  }
  return <MergeModal locale={locale} terms={modal.terms} onClose={onClose} onError={onError} onDone={onDone} />;
}

function RenameModal({
  locale,
  term,
  onClose,
  onError,
  onDone,
}: {
  locale: Locale;
  term: Term;
  onClose: () => void;
  onError: (msg: string) => void;
  onDone: (vocab: Vocabulary, regrouped: number, showMerged: boolean) => void;
}): JSX.Element {
  const onSubmit = async (data: { label?: string }): Promise<void> => {
    const label = String(data.label ?? '').trim();
    if (!label) return;
    try {
      const res = await renameTerm(term.id, label);
      onDone(res.vocabulary, res.regroupedTickets, false);
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  return (
    <ModalDialog header={t(locale, 'settings.rename')} onClose={onClose} closeButtonText={t(locale, 'common.cancel')}>
      <Form onSubmit={onSubmit} submitButtonText={t(locale, 'common.confirm')}>
        <Textfield name="label" label={term.label} defaultValue={term.label} isRequired />
      </Form>
    </ModalDialog>
  );
}

function SplitModal({
  locale,
  term,
  onClose,
  onError,
  onDone,
}: {
  locale: Locale;
  term: Term;
  onClose: () => void;
  onError: (msg: string) => void;
  onDone: (vocab: Vocabulary, regrouped: number, showMerged: boolean) => void;
}): JSX.Element {
  const onSubmit = async (data: { label?: string; issueIds?: string }): Promise<void> => {
    const label = String(data.label ?? '').trim();
    if (!label) return;
    try {
      const res = await splitTerm(term.id, splitCsvList(data.issueIds), label);
      onDone(res.vocabulary, res.regroupedTickets, false);
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  return (
    <ModalDialog header={t(locale, 'settings.split')} onClose={onClose} closeButtonText={t(locale, 'common.cancel')}>
      <Form onSubmit={onSubmit} submitButtonText={t(locale, 'common.confirm')}>
        <Textfield name="label" label={term.label} isRequired />
        <Textfield name="issueIds" label={t(locale, 'problem.attachedTickets')} />
      </Form>
    </ModalDialog>
  );
}

function MergeModal({
  locale,
  terms,
  onClose,
  onError,
  onDone,
}: {
  locale: Locale;
  terms: Term[];
  onClose: () => void;
  onError: (msg: string) => void;
  onDone: (vocab: Vocabulary, regrouped: number, showMerged: boolean) => void;
}): JSX.Element {
  const onSubmit = async (data: { termIds?: string[]; keepId?: string }): Promise<void> => {
    const ids = Array.isArray(data.termIds) ? data.termIds : [];
    const keepId = String(data.keepId ?? ids[0] ?? '').trim();
    if (ids.length < 2 || !keepId) return;
    try {
      const res = await mergeTerms(ids, keepId);
      onDone(res.vocabulary, res.regroupedTickets, true);
    } catch (err) {
      onError(errorMessage(err));
    }
  };
  return (
    <ModalDialog header={t(locale, 'settings.merge')} onClose={onClose} closeButtonText={t(locale, 'common.cancel')}>
      <Form onSubmit={onSubmit} submitButtonText={t(locale, 'common.confirm')}>
        <Select name="termIds" label={t(locale, 'settings.merge')} isMulti isRequired>
          {terms.map((item) => (
            <Option label={item.label} value={item.id} />
          ))}
        </Select>
        <Select name="keepId" label={t(locale, 'common.confirm')} isRequired>
          {terms.map((item, idx) => (
            <Option label={item.label} value={item.id} defaultSelected={idx === 0} />
          ))}
        </Select>
      </Form>
    </ModalDialog>
  );
}
