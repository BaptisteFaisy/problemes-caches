# Contrat du site de démonstration — qui écrit quoi, avec quels points d'ancrage

Le site est publié sur **GitHub Pages** (dépôt public) : c'est la vitrine du
projet Codegeist 2026 et la seule partie de l'app que les juges peuvent voir
sans installer l'app Forge dans Jira.

Il n'est **pas** une maquette : `site/src/build.ts` exécute le vrai domaine
(`src/core`) sur le vrai jeu d'exemple (`src/sample`). Les chiffres affichés sont
ceux que l'app calcule dans Jira.

## Règles dures (vérifiées par la CI `couche0`)

- fichier < 500 lignes, fonction < 50 lignes → `python3 tools/check_limits.py site`
- **aucun calcul métier dans le rendu** : `render.ts` appelle `state.ts`, jamais
  `computeBill`/`computeCluster` directement (§17) ;
- aucune dépendance ajoutée, aucun CDN : le bundle est autonome (esbuild) ;
- bilingue **anglais / français** (§17), l'anglais par défaut ;
- accessible : HTML sémantique, `lang`, `alt`/`aria-*`, contraste suffisant,
  navigation clavier ;
- typage strict : `npx tsc -p site/tsconfig.json --noEmit` → 0 erreur.

## Découpage en deux lots disjoints

| Lot | Fichiers | Rôle |
|---|---|---|
| **A** | `site/index.html`, `site/src/styles.css` | Structure et apparence. Aucun texte en dur : tout vient du lot B. |
| **B** | `site/src/copy.ts`, `site/src/render.ts`, `site/src/main.ts` | Textes bilingues, remplissage du DOM, événements. |

Le moteur (`site/src/state.ts`, `build.ts`, `actions.ts`, `types.ts`,
`sha256.ts`) est **déjà écrit et testé** : ne pas le modifier.

## Points d'ancrage — contrat entre les deux lots

Le lot A pose ces `id` exactement ; le lot B les remplit. Toute section est
`<section>` avec un `id`, dans cet ordre.

```
body
├─ header#entete
│   ├─ a#marque                      (nom de l'app, lien vers #accroche)
│   ├─ nav#navigation                (liens internes : #probleme #demo #architecture #rovo #juges)
│   └─ div#selecteur-langue          (deux <button data-locale="en|fr">)
├─ main
│  ├─ section#accroche
│  │   ├─ h1#titre-app
│  │   ├─ p#sous-titre
│  │   ├─ ul#chiffres-cles            (tickets, grappes, heures 30 j, personnes)
│  │   └─ div#actions-acroche         (boutons « Voir la démo », « Dépôt GitHub »)
│  ├─ section#probleme
│  │   ├─ h2#titre-probleme
│  │   └─ ul#liste-probleme           (les quatre conséquences, §2)
│  ├─ section#demo
│  │   ├─ h2#titre-demo
│  │   ├─ div#onglets                 (<button data-onglet="problems|agent|portail|vocabulaire">)
│  │   ├─ div#panneau-problems
│  │   │   ├─ div#suspects
│  │   │   ├─ div#problemes-ouverts
│  │   │   ├─ div#flambees
│  │   │   ├─ div#recurrentes
│  │   │   └─ div#tickets-sans-grappe
│  │   ├─ div#panneau-agent
│  │   │   ├─ textarea#texte-libre
│  │   │   ├─ div#exemples-textes      (<button data-exemple="0..4">)
│  │   │   └─ div#resultat-reconnaissance
│  │   ├─ div#panneau-portail
│  │   │   ├─ div#bandeau-portail
│  │   │   └─ div#compteurs-portail
│  │   ├─ div#panneau-vocabulaire
│  │   │   ├─ ul#liste-systemes
│  │   │   └─ ul#liste-symptomes
│  │   └─ dialog#detail-grappe
│  │       ├─ h3#detail-titre
│  │       ├─ div#detail-addition
│  │       ├─ ul#detail-tickets
│  │       └─ div#detail-actions        (Confirmer / Rejeter / Fermer)
│  ├─ section#architecture
│  │   ├─ h2#titre-architecture
│  │   ├─ ol#flux-arrivee               (les 5 étapes du §14 « à l'arrivée d'un ticket »)
│  │   └─ ul#modules-forge
│  ├─ section#rovo
│  │   ├─ h2#titre-rovo
│  │   └─ table#outils-mcp              (les 7 outils du §12 : clé, verbe, entrées, retour)
│  └─ section#juges
│      ├─ h2#titre-juges
│      ├─ ol#etapes-juges
│      └─ div#texte-portal-exemples
└─ footer#pied
    ├─ span#pied-licence
    └─ ul#liens-pied
```

Chaque conteneur rempli par le lot B porte un `data-i18n` **uniquement si** le
texte est statique ; sinon le lot B écrit `textContent` / construit les enfants.

## Comportements attendus (lot B)

- `buildDemoState(locale)` au chargement, puis re-rendu complet à chaque
  interaction (pas de DOM diff : l'état est petit) ;
- onglets : un seul panneau visible à la fois, `aria-selected` à jour ;
- clic sur un suspect → `dialog#detail-grappe` avec ses tickets, son addition et
  sa justification ; « Confirmer » appelle `confirmSuspect` (la grappe devient un
  problème `PRB-n`), « Rejeter » appelle `rejectSuspect` ;
- panneau agent : `matchText(state, texte)` → confiance, **justification**,
  contournement, réponse proposée, autres candidats ; un bandeau rappelle que le
  comparateur est celui de la démo (pas le modèle) et que **rien n'est envoyé à un
  client sans relecture** (§6, §17) ;
- portail : bandeau + « Moi aussi » → `addMeToo` (le compteur de personnes
  touchées augmente, aucun ticket n'est créé, §7.3) ;
- sélecteur de langue : `withLocale` ;
- aucun `alert()`, aucun `document.write`.

## Vérification

```
npm run site:build                                  # bundle dans site/dist
npx tsc -p site/tsconfig.json --noEmit              # 0 erreur
node --test --experimental-strip-types --import ./tools/strip_ts_loader.mjs "site/src/*.test.ts"
python3 tools/check_limits.py site
```

Puis ouvrir `site/dist/index.html` dans un navigateur (le bundle est autonome).
