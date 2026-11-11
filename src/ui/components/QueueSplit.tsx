import { Checkbox, CheckboxGroup, Form, ModalDialog, TextField } from '@forge/ui';
import type { ClusterLine } from '../api.ts';
import type { Locale } from '../i18n/index.ts';
import { t } from '../i18n/index.ts';

/**
 * Scinder une grappe (§18) : les tickets choisis rejoignent une grappe
 * voisine, avec leur propre déclencheur. La liste des tickets vient du
 * resolver (`sampleKeys`) ; l'UI n'invente aucun ticket.
 */
export function QueueSplit({
  locale,
  line,
  onClose,
  onSplit,
}: {
  locale: Locale;
  line: ClusterLine;
  onClose: () => void;
  onSplit: (issueIds: string[], triggerText: string) => void;
}): JSX.Element {
  return (
    <ModalDialog
      header={t(locale, 'problems.split')}
      onClose={onClose}
      closeButtonText={t(locale, 'common.close')}
    >
      <Form
        onSubmit={(data) => onSplit(issueIdsOf(data), triggerOf(data))}
        submitButtonText={t(locale, 'problems.split')}
      >
        <CheckboxGroup label={t(locale, 'problems.split')} name="issueIds">
          {line.sampleKeys.map((key) => (
            <Checkbox key={key} label={key} value={key} />
          ))}
        </CheckboxGroup>
        <TextField
          name="triggerText"
          label={t(locale, 'panel.justification', { rationale: line.cluster.triggerText })}
          defaultValue={line.cluster.triggerText}
        />
      </Form>
    </ModalDialog>
  );
}

/** Tickets cochés dans le formulaire de scission. */
function issueIdsOf(data: Record<string, unknown>): string[] {
  const raw = data['issueIds'];
  if (Array.isArray(raw)) return raw.map((value) => String(value));
  if (typeof raw === 'string' && raw !== '') return [raw];
  return [];
}

/** Nouveau déclencheur de la grappe scindée. */
function triggerOf(data: Record<string, unknown>): string {
  const raw = data['triggerText'];
  return typeof raw === 'string' ? raw : '';
}
