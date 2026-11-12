# Contrat du site de démonstration — qui écrit quoi, avec quels points d'ancrage

Le site est publié sur **GitHub Pages** (dépôt public) : c'est la vitrine du
projet Codegeist 2026 et la seule partie de l'app que les juges peuvent voir
sans installer l'app Forge dans Jira.

Il n'est **pas** une maquette : `site/src/build.ts` exécute le vrai domaine
(`src/core`) sur le vrai jeu d'exemple (`src/sample`). Les chiffres affichés sont
ceux que l'app calcule dans Jira.

**Objectif de cette révision : toute feature de l'app est visible sur le site.**
Le tableau « Couverture » ci-dessous est la liste de contrôle ; rien ne doit
rester dans la colonne « absent ».

## Règles dures (vérifiées par la CI `couche0`)

- fichier < 500 lignes, fonction < 50 lignes → `python3 tools/check_limits.py site`
- **aucun calcul métier dans le rendu** : `render*.ts` appelle `state.ts`, jamais
  `computeBill`/`computeCluster`/`nextState` directement (§17) ;
- **`build.ts` approche les 500 lignes** : toute nouvelle *lecture* dérivée va
  dans `site/src/derive.ts`, toute nouvelle *mutation* dans `site/src/actions.ts` ;
- aucune dépendance ajoutée, aucun CDN : le bundle est autonome (esbuild) ;
- bilingue **anglais / français** (§17), l'anglais par défaut ;
- accessible : HTML sémantique, `lang`, `alt`/`aria-*`, contraste suffisant,
  navigation clavier ;
- typage strict : `npx tsc -p site/tsconfig.json --noEmit` → 0 erreur.

### Ce que le site a le droit d'importer de l'app

| Autorisé | Pourquoi |
|---|---|
| `src/core/*` | domaine pur, aucune I/O, aucune horloge implicite |
| `src/sample/*` | le jeu d'exemple déterministe (§21) |
| `src/platform/field.ts` | **pur** : sa chaîne d'imports (`field.ts` → `ui/format.ts` → `ui/i18n/*` → `core/types.ts`, et `platform/jira-types.ts`) ne contient aucun `@forge/*` — vérifié. C'est là que vit `fallbackCustomerUpdate`, le gabarit déterministe du brouillon client (§7.4). |
| `src/core/bill.ts` → `aggregateIssueContext` | la règle §18 « heures additionnées, personnes au maximum », partagée avec `getIssueContext` de l'app |

**Interdit** : tout module qui tire `@forge/*` (`platform/jira.ts`,
`platform/graph.ts`, `platform/db/*`, `platform/llm.ts`, `resolvers/*`,
`mcp/*`, `ui/*.tsx`). Si une règle métier ne vit que là, on l'extrait d'abord
dans `src/core` — on ne la recopie jamais dans le site.

Conséquence assumée et **affichée** : le site n'appelle aucun modèle. La
reconnaissance utilise le comparateur lexical de démonstration, et le brouillon
client rend `source: 'template'`. Les deux sont signalés à l'écran.

## Couverture — toute feature de l'app sur le site

| Module de l'app | Sur le site | Où |
|---|---|---|
| `jiraServiceManagement:queuePage` — suspects, problèmes ouverts, flambées, récurrentes, sans grappe | ✔ déjà | `#panneau-problems` |
| file — tendance d'une addition (`QueueTrend`) | ✔ déjà | badge dans la ligne de grappe |
| file — scinder une grappe (`QueueSplit`, §18) | **à ajouter** | `#detail-scinder` |
| file — qualité des signatures (`QueueQuality`, PC-10) | **à ajouter** | `#reglages-qualite` |
| `jira:issuePanel` — reconnaissance, confiance, justification, contournement, réponse à relire, autres candidats | ✔ déjà | `#panneau-agent` |
| panneau — addition du problème (`PanelBill`) | ✔ déjà | `#detail-addition` |
| `jira:issueContext` — **« Ce que coûte ce bug »** (`ContextCost`, `ContextProblems`) | **à ajouter** | `#panneau-dev` |
| `jiraServiceManagement:portalSubheader` — bandeau + « Moi aussi » | ✔ déjà | `#panneau-portail` |
| `jiraServiceManagement:portalRequestDetailPanel` — détail de la demande, correctif prévu (`RequestLink`) | **à ajouter** | `#demandes-portail` |
| `jira:projectSettingsPage` — seuils, durée moyenne, taux horaire, facteur de flambée, jours de surveillance, lignes de l'addition (`SettingsThresholds`, `SettingsForm`) | **à ajouter** | `#panneau-reglages` |
| réglages — vocabulaire éditable : nouveau terme, fusion (`planMerge`), scission (`planSplit`) | **à ajouter** | `#edition-vocabulaire`, `#fusion-termes` |
| cycle de vie §5 — suspect → confirmé → cause connue → contournement → corrigé → vérifié | **à ajouter** | `#cycle-etapes` |
| §7.4 — surveillance après correctif (`startWatching`, `watchWindow`, `watchElapsed`) | **à ajouter** | `#cycle-surveillance` |
| §7.5 — **régression** (`detectRegression`) | **à ajouter** | `#cycle-surveillance` |
| §7.4 — brouillon de message aux clients (`fallbackCustomerUpdate`) | **à ajouter** | `#cycle-brouillon` |
| `rovo:agent` — les 5 amorces de conversation | **à ajouter** | `#rovo-amorces` |
| `rovo:mcp` — les 7 actions, entrées et retours | ✔ déjà (tableau) → **à rendre vivant** | `#rovo-fil` |
| `scheduledTrigger` / `consumer` / triggers — architecture | ✔ déjà | `#flux-arrivee`, `#modules-forge` |

## Découpage en lots disjoints

Un lot = une branche = une PR, **fichiers disjoints**. Le lot 0 est déjà écrit :
il fixe ce contrat, et `site/src/types.ts` est le contrat en code — ses formes et
ses signatures ne se renégocient pas dans un lot.

| Lot | Fichiers (tous disjoints) | Rôle | Dépend de |
|---|---|---|---|
| **0** ✅ | `site/src/types.ts`, `site/CONTRAT.md`, `src/core/bill.ts`, `src/core/bill.test.ts`, `src/resolvers/actions.ts` | contrat en code + règle §18 partagée | — |
| **A** | `site/index.html`, `site/src/styles.css` | structure et apparence. Aucun texte en dur : tout vient du lot B. Pose les ancres ci-dessous, exactement. | 0 |
| **B** | `site/src/i18n.ts`, `site/src/i18n-types.ts`, `site/src/i18n-en.ts`, `site/src/i18n-fr.ts`, `site/src/i18n.test.ts` *(les quatre derniers nouveaux)* | tous les textes EN/FR, clés listées ci-dessous | 0 |
| **C** | `site/src/derive.ts` *(nouveau)*, `site/src/actions.ts`, `site/src/build.ts`, `site/src/state.ts`, `site/src/derive.test.ts` *(nouveau)*, `site/src/actions.test.ts`, `site/src/build.test.ts` | le moteur : lectures dérivées et mutations | 0 |
| **D** | `site/src/render.ts`, `site/src/render-agents.ts` | rendu des onglets existants + cycle/dev/réglages/portail/vocabulaire, en appelant les rendus du lot E | 0 (ancres et clés du contrat) |
| **E** | `site/src/render-dev.ts`, `site/src/render-lifecycle.ts`, `site/src/render-settings.ts`, `site/src/render-portal.ts`, `site/src/render-rovo.ts` *(tous nouveaux)* | les nouvelles vues, une par fichier | 0 |
| **F** | `site/src/main.ts` | câblage : onglets, événements, état courant | A…E |

A, B, C partent en parallèle (fichiers disjoints, contrat figé). D et E partent
en parallèle une fois C fusionné. F est fait en intégration, par le pilote.

## Points d'ancrage — contrat entre les lots

Le lot A pose ces `id` exactement ; les lots D/E les remplissent. Conventions
existantes, à respecter : un onglet est `button#onglet-<nom>` avec
`data-onglet="<nom>"`, `aria-controls="panneau-<nom>"`, `data-i18n="tab.<clé>"` ;
un panneau est `div#panneau-<nom>.panneau` avec `role="tabpanel"`,
`aria-labelledby="onglet-<nom>"`, `tabindex="0"`, et la classe `panneau--cache`
s'il n'est pas l'onglet actif. Un texte statique porte `data-i18n` (ou
`data-i18n-placeholder`) ; un conteneur dynamique est vide dans le HTML.

Nouveautés en **gras**. L'existant ne bouge pas.

```
body
├─ header#entete                       (inchangé)
├─ main
│  ├─ section#accroche                 (inchangé)
│  ├─ section#probleme                 (inchangé)
│  ├─ section#demo
│  │   ├─ div#onglets                  + **onglet-cycle / onglet-dev / onglet-reglages**
│  │   ├─ div#panneau-problems         (inchangé)
│  │   ├─ div#panneau-agent            (inchangé)
│  │   ├─ div#panneau-portail
│  │   │   ├─ div#bandeau-portail      (existant)
│  │   │   ├─ div#compteurs-portail    (existant)
│  │   │   └─ **div#demandes-portail** (liste des demandes ; clic → détail)
│  │   │       └─ **div#demande-detail** (statut, problème rattaché, correctif prévu, « moi aussi », prévenue)
│  │   ├─ div#panneau-vocabulaire
│  │   │   ├─ ul#liste-systemes        (existant)
│  │   │   ├─ ul#liste-symptomes       (existant)
│  │   │   ├─ **form#edition-vocabulaire**
│  │   │   │   ├─ **input#nouveau-terme** · **select#nouveau-terme-type** (system|symptom)
│  │   │   │   └─ **button#ajouter-terme**
│  │   │   └─ **div#fusion-termes**    (**ul#termes-fusionnables** cases à cocher · **select#terme-conserve** · **button#fusionner-termes**)
│  │   ├─ **div#panneau-cycle**
│  │   │   ├─ **select#cycle-probleme**
│  │   │   ├─ **ol#cycle-etapes**      (les 7 états du §5, atteint ou non)
│  │   │   ├─ **div#cycle-surveillance** (fin de surveillance, jours écoulés, régression)
│  │   │   ├─ **div#cycle-actions**    (**button[data-action-cycle="fixed|incoming|verify"]**)
│  │   │   ├─ **div#cycle-brouillon**  (sujet, corps, tickets ouverts, « moi aussi », source)
│  │   │   └─ **p#cycle-note**         (gabarit déterministe, aucun modèle joignable)
│  │   ├─ **div#panneau-dev**
│  │   │   ├─ **select#dev-ticket**    (les tickets de correctif, ex. NET-208)
│  │   │   ├─ **div#dev-cout**         (« Ce que coûte ce bug » : heures/mois, personnes, méthode)
│  │   │   └─ **ul#dev-problemes**     (les problèmes liés, avec leur état et leur addition)
│  │   ├─ **div#panneau-reglages**
│  │   │   ├─ **form#reglages-seuils** (**input[data-reglage="minutesPerTouch|hourRateEur|surgeFactor|watchDays|tickets|hours|people|windowDays"]**)
│  │   │   ├─ **div#reglages-lignes**  (**input[type=checkbox][data-ligne="<BillLineKey>"]**, les 8 lignes)
│  │   │   ├─ **button#reglages-defauts**
│  │   │   ├─ **div#reglages-effet**   (l'addition recalculée avec ces réglages)
│  │   │   └─ **div#reglages-qualite** (tickets indexés, signatures extraites, indéterminées, grappes, problèmes ouverts)
│  │   └─ dialog#detail-grappe
│  │       ├─ h3#detail-titre · div#detail-signature · div#detail-justification
│  │       ├─ div#detail-addition · ul#detail-tickets · div#detail-message
│  │       ├─ **div#detail-scinder**   (**ul#scission-tickets** cases à cocher · **input#scission-declencheur** · **button#bouton-scinder**)
│  │       └─ div#detail-actions       (Confirmer / Rejeter / Fermer — existant)
│  ├─ section#architecture             (inchangé)
│  ├─ section#rovo
│  │   ├─ h2#titre-rovo · table#outils-mcp   (existants)
│  │   └─ **div#rovo-conversation**
│  │       ├─ **div#rovo-amorces**     (**button[data-amorce="cost|surges|suspects|problem|draft"]**)
│  │       ├─ **ol#rovo-fil**          (question → outil appelé → entrées → réponse → chiffres → méthode)
│  │       └─ **p#rovo-note**          (conversation simulée : les chiffres viennent du moteur, pas d'un modèle)
│  └─ section#juges                    (inchangé)
└─ footer#pied                         (inchangé)
```

## Clés i18n — lot B

Le fichier `site/src/i18n.ts` est un `Record<string, string>` par langue, avec
interpolation `{variable}`. Toute clé listée ici est **obligatoire dans les deux
langues** — un oubli de traduction est exactement le défaut qui a produit les PR
#42/#43, donc le lot B ajoute `site/src/i18n.test.ts`, qui vérifie la parité des
clés EN/FR et l'identité des variables d'interpolation. Il n'existe aucun test
de ce genre aujourd'hui.

**Découpage imposé** : `i18n.ts` fait déjà 344 lignes et ce contrat ajoute une
centaine de clés, soit ~180 lignes — le fichier dépasserait la limite des 500.
Le lot B le scinde donc, sans changer ce que les autres modules importent :

- `i18n-types.ts` : l'interface `SiteCopy` et les constantes techniques partagées
  (`ROVO_TOOLS`, identiques dans les deux langues) ;
- `i18n-en.ts` / `i18n-fr.ts` : les deux jeux de textes ;
- `i18n.ts` : `COPIES`, `copyOf`, `texte` — **les seuls exports consommés par
  `main.ts`, `render.ts` et `render-agents.ts`, qui ne changent pas d'import.**

- **Onglets** : `tab.cycle`, `tab.dev`, `tab.settings`
- **Cycle de vie** : `cycle.title`, `cycle.lead`, `cycle.select`, `cycle.steps`,
  `cycle.watch`, `cycle.watchUntil` (`{date}`), `cycle.watchDays` (`{days}`),
  `cycle.watchElapsed`, `cycle.regression`, `cycle.actionFixed`,
  `cycle.actionIncoming`, `cycle.actionVerify`, `cycle.draft`, `cycle.draftSubject`,
  `cycle.draftBody`, `cycle.openTickets` (`{count}`), `cycle.meToo` (`{count}`),
  `cycle.source.template`, `cycle.note`, `cycle.none`, `cycle.done` (`{state}`),
  et `cycle.state.suspect|confirmed|cause-known|workaround-published|fixed|verified|regression`
- **Vue développeur** : `dev.title`, `dev.lead`, `dev.select`, `dev.cost`,
  `dev.hours` (`{hours}`), `dev.people` (`{people}`), `dev.method`,
  `dev.methodPeople`, `dev.problems`, `dev.empty`, `dev.link`
- **Réglages** : `settings.title`, `settings.lead`, `settings.thresholds`,
  `settings.minutesPerTouch`, `settings.hourRate`, `settings.surgeFactor`,
  `settings.watchDays`, `settings.tickets`, `settings.hours`, `settings.people`,
  `settings.windowDays`, `settings.lines`, `settings.reset`, `settings.effect`,
  `settings.quality`, `settings.qualityText` (`{indexed}`, `{signatures}`, `{undetermined}`),
  `settings.saved`, `settings.line.tickets|hours|people|orgs|slaBreaches|reopens|escalations|meToo`
- **Portail (détail)** : `portal.requests`, `portal.request.select`,
  `portal.status.open|answered|resolved`, `portal.problem`, `portal.fixPlanned` (`{date}`),
  `portal.meTooYes`, `portal.notified`, `portal.none`
- **Vocabulaire éditable** : `vocab.edit`, `vocab.newTerm`, `vocab.kind.system`,
  `vocab.kind.symptom`, `vocab.add`, `vocab.added` (`{label}`), `vocab.merge`,
  `vocab.keep`, `vocab.merged` (`{count}`), `vocab.selectFirst`
- **Scission de grappe** : `split.title`, `split.trigger`, `split.button`,
  `split.done` (`{count}`), `split.selectOne`
- **Rovo** : `rovo.conversation`, `rovo.ask`, `rovo.tool` (`{tool}`),
  `rovo.toolInput`, `rovo.answer`, `rovo.method`, `rovo.note`, `rovo.empty`,
  `rovo.prompt.cost|surges|suspects|problem|draft`

## Moteur — signatures imposées

`site/src/types.ts` **est** le contrat : les interfaces
(`DemoDevContext`, `DemoDevProblem`, `DemoLifecycle`, `DemoLifecycleStep`,
`DemoPortalRequest`, `DemoSettingsPatch`, `DemoQuality`, `RovoPromptId`,
`DemoRovoTurn`) et le bloc « Fonctions du moteur — signatures imposées » en bas
de fichier font foi. En cas de désaccord entre ce document et `types.ts`,
**`types.ts` gagne** : c'est lui que le compilateur vérifie.

Rappels qui engagent le lot C :

- `markFixed` → `startWatching(problem, settings, now)` de `src/core/lifecycle.ts`
- `simulateIncoming` → `detectRegression(problem, at)` ; si vrai, `nextState(_, 'regression')`
- `verifyWatch` → `nextState(_, 'watch-elapsed')`, seulement si `watchElapsed`
- `lifecycleOf` → `watchWindow(fixedAt, settings.watchDays)` pour la fin de surveillance
- le brouillon client → `fallbackCustomerUpdate(problem, stats, locale)` de
  `src/platform/field.ts`, avec `stats: DraftStats` de `src/platform/jira-types.ts`
- `devContexts` → `aggregateIssueContext` de `src/core/bill.ts` (heures
  additionnées, personnes au **maximum**, §18)
- vocabulaire → `suggestNewTerm`, `planMerge`, `planSplit`, `renamePlan` de
  `src/core/vocabulary.ts`
- `withSettings` recalcule **tout** l'état (grappes, additions, tendances,
  flambées) : un seuil changé doit se voir dans la file, sinon le réglage est
  décoratif

## Exports de rendu imposés — lot E

Chaque fichier du lot E exporte exactement ceci, et rien d'autre n'est appelé de
l'extérieur. Le lot D les importe et les appelle depuis `renderSections`.

```ts
// render-lifecycle.ts
export function renderLifecycle(state: DemoState, clusterId: string | null): void;
// render-dev.ts
export function renderDev(state: DemoState, issueKey: string | null): void;
// render-settings.ts
export function renderSettings(state: DemoState): void;
// render-portal.ts
export function renderPortal(state: DemoState, issueKey: string | null): void;
// render-rovo.ts
export function renderRovo(state: DemoState, turn: DemoRovoTurn | null): void;
```

Aucun de ces modules ne calcule : ils appellent `state.ts` (qui réexporte
`derive.ts` et `actions.ts`), lisent les ancres du lot A et les textes du lot B.

## Comportements attendus

- `buildDemoState(locale)` au chargement, puis re-rendu complet à chaque
  interaction (pas de DOM diff : l'état est petit) ;
- onglets : un seul panneau visible à la fois, `aria-selected`, `tabindex` et
  `panneau--cache` à jour — y compris pour les trois nouveaux ;
- clic sur un suspect → `dialog#detail-grappe` ; « Confirmer » → `confirmSuspect`
  (`PRB-n`), « Rejeter » → `rejectSuspect`, cases à cocher + « Scinder » →
  `splitCluster` (§18) ;
- panneau agent : `matchText(state, texte)` → confiance, **justification**,
  contournement, réponse proposée, autres candidats ; un bandeau rappelle que le
  comparateur est celui de la démo et que **rien n'est envoyé à un client sans
  relecture** (§6, §17) ;
- portail : bandeau + « Moi aussi » → `addMeToo` (les personnes touchées
  augmentent, aucun ticket créé, §7.3) ; clic sur une demande → son détail ;
- cycle : « Corriger » → `markFixed`, puis « Nouveau ticket » → `simulateIncoming`
  (bascule en **régression** si le problème est corrigé, §7.5), « Vérifier » →
  `verifyWatch` ; le brouillon client apparaît dès que le problème est corrigé ;
- vue dev : choisir `NET-208` affiche « Ce que coûte ce bug » avec la méthode de
  calcul des heures **et** celle des personnes (§17, §18) ;
- réglages : changer un seuil recalcule la file ; « Rétablir » → `resetSettings` ;
- Rovo : une amorce → `askRovo` → un tour affichant la question, l'action MCP
  appelée, ses entrées, la réponse, les chiffres et la méthode ;
- sélecteur de langue : `withLocale` — **tout** se traduit, y compris les
  nouveaux panneaux et les états du cycle de vie ;
- aucun `alert()`, aucun `document.write`.

## Vérification

```
npm run site:build                                  # bundle dans site/dist
npx tsc -p site/tsconfig.json --noEmit              # 0 erreur
node --test --experimental-strip-types --import ./tools/strip_ts_loader.mjs "site/src/*.test.ts"
python3 tools/check_limits.py site
```

Puis, avant de déclarer le lot fini : ouvrir `site/dist/index.html` dans un vrai
DOM (jsdom, hors dépôt) et parcourir **chaque onglet**, dans les deux langues,
en vérifiant qu'aucune erreur de console n'apparaît. C'est ce test qui avait
révélé les trois défauts de traduction des PR #42/#43 — il n'est pas optionnel.
