# Couche UI : UI Kit 2 (`@forge/react`) — règles de migration et conventions

Ce dépôt a été écrit avec l'API **UI Kit 1** (`@forge/ui`), qui n'est plus
supportée par le bundler Forge : `@forge/ui` tire `sha.js` → `safe-buffer`,
que webpack 5 ne polyfillie plus, et `forge build` échoue
(`Can't resolve 'buffer'`). Les templates officiels Forge (2026) utilisent
**UI Kit 2** : `@forge/react` + `react` 18.

Ce document est la référence de la migration. Les API ci-dessous ont été lues
dans les `.d.ts` installés (`@atlaskit/forge-react-types`, `@forge/react/out`),
pas devinées.

## 1. Imports

| UI Kit 1 | UI Kit 2 |
|---|---|
| `import { Text, Button } from '@forge/ui'` | `import { Text, Button } from '@forge/react'` |
| `import { useState, useEffect } from '@forge/ui'` | `import { useState, useEffect } from 'react'` |
| `import { Fragment } from '@forge/ui'` | `import { Fragment } from 'react'` (ou `<>…</>`) |
| `import { render } from '@forge/ui'` | `import ForgeReconciler from '@forge/react'` |
| `render(<App />)` (fin de fichier d'écran) | `ForgeReconciler.render(<App />)` |
| `useProductContext` | existe dans `@forge/react`, rend `FullContext \| undefined` |

Les six points d'entrée (`src/ui/*.tsx`) se terminent par
`ForgeReconciler.render(<App />)` — plus de `export default`.

## 2. Composants renommés ou supprimés

| UI Kit 1 | UI Kit 2 |
|---|---|
| `StatusLozenge` | `Lozenge` |
| `ButtonSet` | `ButtonGroup` |
| `TextField` | `Textfield` (f minuscule) |
| `ModalDialog` | `Modal` + `ModalHeader`/`ModalTitle`/`ModalBody`/`ModalFooter`, le tout dans `ModalTransition` |
| `ProjectSettingsPage`, `PortalSubheader`, `PortalRequestDetailPanel` | **supprimés** : en UI Kit 2 l'emplacement vient du module du manifeste, le composant rend directement son contenu |
| `Table` | `DynamicTable` (non utilisé ici) |

Disponibles tels quels : `Text`, `Heading`, `SectionMessage`, `Button`, `Tag`,
`TagGroup`, `Form`, `Checkbox`, `CheckboxGroup`, `Range`, `Link`, `Box`,
`Stack`, `Inline`, `Badge`, `Spinner`, `Label`, `Select`, `Toggle`, `Radio`,
`List`, `ListItem`, `LoadingButton` (via `Button` + état), `LinkButton`.

## 3. Props qui changent (pièges vérifiés dans les types)

### Button
```tsx
// UI Kit 1                              // UI Kit 2
<Button text={libelle} disabled={x} />   <Button isDisabled={x}>{libelle}</Button>
```
`text` n'existe plus → **children**. `disabled` → `isDisabled`. Props dispo :
`appearance`, `onClick`, `iconBefore`, `iconAfter`, `spacing`, `type`,
`shouldFitContainer`, `isSelected`, `autoFocus`.

### Lozenge
```tsx
<StatusLozenge text={t} appearance="success" />   →   <Lozenge appearance="success">{t}</Lozenge>
```
`appearance` autorisés : `default`, `inprogress`, `moved`, `new`, `removed`,
`success`, `warning`, `danger`, `information`, `neutral`, `discovery`,
`accent-*`. Toute autre valeur (ex. `confirmation`) doit être mappée.

### SectionMessage
`appearance` : `information` (et non `info`), `success`, `warning`, `error`,
`discovery`, `neutral`. Props : `title`, `actions`, `children`.

### Textfield
**Pas de prop `label`.** Le libellé se fait avec `Label` :
```tsx
<Label labelFor="seuil-tickets">{libelle}</Label>
<Textfield id="seuil-tickets" name="seuil-tickets" defaultValue={v} isRequired />
```
Props dispo : `name`, `id`, `defaultValue`, `value`, `isRequired`, `isDisabled`,
`isInvalid`, `isReadOnly`, `placeholder`, `type`, `min`, `max`, `minLength`,
`maxLength`, `pattern`, `width`, `onChange`, `onBlur`, `onFocus`.

### CheckboxGroup
**Pas d'enfants** : une prop `options` :
```tsx
<CheckboxGroup name="lignes" options={[{ label: 'Tickets', value: 'tickets' }]}
               defaultValue={['tickets']} onChange={…} />
```

### Form
`onSubmit` ne reçoit **plus** les valeurs :
```tsx
const { register, getValues } = useForm();
<Form onSubmit={async () => { const v = getValues(); … }}>
  <Textfield {...register('seuil')} />
</Form>
```
`useForm` vient de `@forge/react` (react-hook-form en dessous).

### Modal
```tsx
<ModalTransition>
  {open && (
    <Modal title={titre} onClose={fermer} width="medium">
      <ModalBody>…</ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={fermer}>{annuler}</Button>
        <Button appearance="primary" onClick={valider}>{ok}</Button>
      </ModalFooter>
    </Modal>
  )}
</ModalTransition>
```

### useProductContext
Rend `FullContext | undefined` de `@forge/bridge`. Il n'y a **pas** de champ
`accountType` : pour savoir si un visiteur du portail est anonyme, passer par
le resolver (côté serveur, `asUser()` échoue ou rend `accountId` vide) et
afficher le message adapté — jamais de déduction côté client.

## 4. Règles du dépôt (inchangées)

- Fichier < 500 lignes, fonction < 50 lignes (`python3 tools/check_limits.py`).
- **Aucun calcul dans l'UI** : elle affiche ce que le resolver a agrégé.
- Tous les libellés viennent de `t(locale, 'clé')` ; les clés existent déjà
  dans `src/ui/i18n/en.ts` — ne rien ajouter aux dictionnaires.
- Les props exportées des composants **ne changent pas** : les écrans et les
  composants sont écrits en parallèle par des lots différents.
- Vérification : `npx tsc --noEmit` (0 erreur), `npm test`,
  `python3 tools/check_limits.py`, puis `forge lint` et `forge build`.
