/**
 * Bouton « Moi aussi » du bandeau du portail (§7.3, PC-16) avec confirmation avant envoi.
 * §16 : le portail accepte les visiteurs anonymes — le bouton ne doit jamais exiger de
 * compte pour s'afficher ; pour un visiteur non connecté, il explique pourquoi il ne peut
 * pas compter la personne (aucune clé i18n dédiée n'existe : on affiche la plus proche).
 */

import { Fragment, useState } from 'react';
import { Button, Modal, ModalBody, ModalFooter, ModalTransition, Text } from '@forge/react';
import { meToo } from '../api';
import { errorMessage } from '../async';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';

export interface PortalMeTooProps {
  locale: Locale;
  problemId: string;
  symptomLabel: string;
  isAnonymous: boolean;
}

/** Bouton « Moi aussi » + modale de confirmation + retour visuel (§7.3, PC-16). */
export function PortalMeToo({ locale, problemId, symptomLabel, isAnonymous }: PortalMeTooProps): JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <Text>{t(locale, 'portal.meToo.done')}</Text>;

  const confirm = async (): Promise<void> => {
    setError(null);
    try {
      await meToo(problemId);
      setConfirmOpen(false);
      setDone(true);
    } catch (err) {
      setConfirmOpen(false);
      setError(errorMessage(err));
    }
  };

  return (
    <Fragment>
      <Button isDisabled={isAnonymous} onClick={() => setConfirmOpen(true)}>{t(locale, 'portal.meToo')}</Button>
      {isAnonymous ? <Text>{t(locale, 'common.error')}</Text> : null}
      {error ? <Text>{error}</Text> : null}
      <ModalTransition>
        {confirmOpen ? (
          <Modal title={t(locale, 'portal.meToo')} onClose={() => setConfirmOpen(false)} width="small">
            <ModalBody>
              <Text>{t(locale, 'portal.banner.body', { symptom: symptomLabel })}</Text>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setConfirmOpen(false)}>
                {t(locale, 'common.cancel')}
              </Button>
              <Button appearance="primary" onClick={confirm}>{t(locale, 'common.confirm')}</Button>
            </ModalFooter>
          </Modal>
        ) : null}
      </ModalTransition>
    </Fragment>
  );
}
