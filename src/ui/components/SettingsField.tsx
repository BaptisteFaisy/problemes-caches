/**
 * Champ de formulaire étiqueté — UI Kit 2 (§13 écran 5).
 *
 * En UI Kit 2, `Textfield` n'a **pas** de prop `label` (contrairement à UI Kit 1) :
 * le libellé passe par un composant `Label` dont `labelFor` pointe l'`id` du
 * champ. Ce composant regroupe les deux pour qu'aucun écran ne répète le motif
 * (règle « zéro duplication » du dépôt).
 *
 * Aucun calcul ici (§17) : le composant affiche et remonte la saisie brute.
 */

import { Fragment } from 'react';
import { Label, Text, Textfield } from '@forge/react';

/**
 * Événement de saisie Forge : la plateforme rend un objet sérialisable, dont
 * seule la cible nous intéresse. Type local volontairement large — le paquet de
 * types n'exporte pas `SerialisableEvent` à la racine.
 */
export interface FieldChangeEvent {
  target?: { value?: unknown; name?: string };
}

/** Lit la valeur d'un événement de champ sans jamais jeter sur une forme inattendue. */
export function eventValue(event: FieldChangeEvent | undefined): string {
  const value = event?.target?.value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export interface SettingsFieldProps {
  /** Nom du champ : sert d'`id`, de `name` et de cible au `Label`. */
  name: string;
  label: string;
  /** Texte d'aide affiché sous le champ (§13 écran 5). */
  description?: string;
  type?: 'text' | 'number';
  defaultValue?: string;
  isRequired?: boolean;
  /** Remonte la saisie brute ; absent, le champ est en lecture libre. */
  onChange?: (value: string) => void;
}

/** Champ texte ou numérique avec son libellé, et éventuellement son aide. */
export function SettingsField({
  name,
  label,
  description,
  type,
  defaultValue,
  isRequired,
  onChange,
}: SettingsFieldProps): JSX.Element {
  return (
    <Fragment>
      <Label labelFor={name}>{label}</Label>
      <Textfield
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        isRequired={isRequired}
        onChange={onChange ? (event: FieldChangeEvent) => onChange(eventValue(event)) : undefined}
      />
      {description ? <Text size="small">{description}</Text> : null}
    </Fragment>
  );
}
