/**
 * Scinder une grappe (§18) : les tickets cochés rejoignent une nouvelle
 * signature, avec leur propre déclencheur. La liste des tickets vient du
 * resolver (`sampleKeys`) — l'UI n'invente aucun ticket (§17).
 *
 * UI Kit 2 : `ModalDialog` devient `Modal` (dans `ModalTransition`), le
 * `Form` ne rend plus les valeurs (état contrôlé ici) et `CheckboxGroup`
 * prend une prop `options` au lieu d'enfants.
 */

import { useState } from 'react';
import {
  Button,
  CheckboxGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalTransition,
} from '@forge/react';
import type { ClusterLine } from '../api';
import type { Locale } from '../i18n/index';
import { t } from '../i18n/index';
import { SettingsField } from './SettingsField';

export interface QueueSplitProps {
  locale: Locale;
  line: ClusterLine;
  onClose: () => void;
  onSplit: (issueIds: string[], triggerText: string) => void;
}

/** Modale de scission : choix des tickets + nouveau déclencheur (§18). */
export function QueueSplit({ locale, line, onClose, onSplit }: QueueSplitProps): JSX.Element {
  const [issueIds, setIssueIds] = useState<string[]>([]);
  const [triggerText, setTriggerText] = useState(line.cluster.triggerText);

  const options = line.sampleKeys.map((key) => ({ label: key, value: key }));
  const peutScinder = issueIds.length > 0 && triggerText.trim().length > 0;

  const valider = (): void => {
    if (!peutScinder) return;
    onSplit(issueIds, triggerText.trim());
  };

  return (
    <ModalTransition>
      <Modal title={t(locale, 'problems.split')} onClose={onClose} width="medium">
        <ModalBody>
          <CheckboxGroup
            name="issueIds"
            options={options}
            defaultValue={[]}
            onChange={(values) => setIssueIds(values)}
          />
          <SettingsField
            name="triggerText"
            label={t(locale, 'panel.justification', { rationale: line.cluster.triggerText })}
            defaultValue={line.cluster.triggerText}
            onChange={setTriggerText}
          />
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            {t(locale, 'common.close')}
          </Button>
          <Button appearance="primary" isDisabled={!peutScinder} onClick={valider}>
            {t(locale, 'problems.split')}
          </Button>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
}
