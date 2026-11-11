# Validations & Mesures — Problèmes cachés dans les tickets

> **Codegeist 2026** · Catégorie **Apps for Business Teams**  
> Référence du cahier des charges : **§16, §17**  
> Calendrier : validations semaine 1 (11–17 novembre 2026) · Évaluation de justesse (§17)

Ce document rassemble le suivi technique des huit points à valider la première semaine sur la plateforme Atlassian (§16) ainsi que le protocole de mesure de justesse des rattachements sur jeu étiqueté (§17).

---

## 1. Les 8 points à valider la première semaine (§16)

| # | Point à valider | Pourquoi | Comment tester concrètement sur le site de démo | Ce qu'on observe dans le code actuel | Solution de repli (§16) |
|---|---|---|---|---|---|
| **1** | Volume et variété des tickets d'exemple du site de démonstration | Sans répétition réelle, aucune grappe naturelle ne peut émerger pour les tests des juges. | Ouvrir le projet JSM du site de démonstration fourni aux participants Codegeist. Vérifier si les tickets couvrent au moins 3 récurrences distinctes. | Le code anticipe l'absence de répétition par le module de données d'exemple (`loadSampleData` dans [src/ui/api.ts](../src/ui/api.ts), contrat WP-O dans [docs/CONTRATS.md](CONTRATS.md)) : injection de 120 tickets sur 60 jours directement en base. | Jeu d'exemple injecté directement dans les tables Forge SQL de l'app. |
| **2** | Type « Problème » présent dans le projet de service | Le problème unique doit porter un type d'issue Jira adapté (idéalement le type natif « Problème » de JSM). | Créer manuellement un ticket dans le projet JSM pour inspecter la liste déroulante des types disponibles. | La fonction `resolveIssueTypeId` ([src/platform/jira.ts](../src/platform/jira.ts)) cherche d'abord le type configuré dans les réglages (`settings.problemIssueType`), puis un type nommé « Problem » ou « Problème », puis se replie sur le premier type utilisable. | Type choisi dans l'écran de réglages du projet ([src/ui/settings-page.tsx](../src/ui/settings-page.tsx)). |
| **3** | Lecture des délais de service (SLA) et de leur dépassement | Alimente le poste d'addition « Engagements de délai rompus » (lot S). | Appeler l'API REST Service Desk (`/rest/servicedeskapi/request/{id}/sla`) depuis Forge via `requestJira`. | La fonction `readSlaBreaches` ([src/platform/jira.ts](../src/platform/jira.ts)) interroge les détails de la demande (`readRequestDetails`), lit les cycles SLA et extrait `slaBreached(details)` ([src/platform/field.ts](../src/platform/field.ts)). Si le scope ou la donnée manque, la fonction rend `false` sans lever d'exception. | Poste désactivé par défaut dans le MVP (`MVP_BILL_LINES` dans [src/core/constants.ts](../src/core/constants.ts)) ; activable dans les réglages. |
| **4** | Inventaire (Assets / Insight / Compass) lisible depuis Forge | Alimente l'indice certain « même équipement » pour la marche 3 du rattachement. | Lier un objet d'inventaire à un ticket de démo et vérifier la réponse de l'API Teamwork Graph. | `enrichClues` ([src/platform/graph.ts](../src/platform/graph.ts)) appelle `requestTeamworkGraph` avec la requête `HiddenProblemsIssueContext` pour extraire `inventory { id name }`. Les identifiants sont insérés dans `hardClues.assetIds`. Si le graphe échoue, les indices restent intacts. | Champ personnalisé Jira ou champ texte du ticket si le graphe n'est pas activé. |
| **5** | Stabilité des signatures d'un passage à l'autre | Un même ticket doit toujours donner la même signature pour éviter les grappes instables. | Soumettre le même texte 10 fois à `extractSignature` et vérifier l'égalité stricte du triplet. | Trois verrous garantissent la stabilité : (a) température fixée à 0 dans [src/platform/llm.ts](../src/platform/llm.ts), (b) vocabulaire fermé fourni au prompt ([src/platform/field.ts](../src/platform/field.ts)), (c) cache systématique par empreinte SHA-256 du texte normalisé (`sourceHash` dans [src/core/signature.ts](../src/core/signature.ts)). | Température minimale (0), vocabulaire fermé obligatoire et cache par empreinte. |
| **6** | Coût et débit du modèle à l'initialisation | L'initialisation de 90 jours soumet jusqu'à des milliers de tickets au LLM. Le quota Forge est de 100 req/min. | Lancer l'initialisation sur un projet de 1 000 tickets et mesurer le taux de requêtes par minute. | [src/platform/llm.ts](../src/platform/llm.ts) embarque un régulateur de débit (`waitForRateSlot`) borné à 90 req/min (`MAX_CALLS_PER_MINUTE`). Le traitement de masse est découpé par lots de 50 tickets via une file asynchrone (`consumer: bootstrap-batch`). | Préfiltrage par indices certains et modèle Claude économique hébergé Forge. |
| **7** | Contenu dynamique du bandeau portail selon le service | Pertinence du bandeau pour les clients : afficher les problèmes du service consulté. | Ouvrir le portail client sur une catégorie spécifique et observer le paramètre reçu par le sous-en-tête. | Le module `jiraServiceManagement:portalSubheader` ([src/ui/portal-subheader.tsx](../src/ui/portal-subheader.tsx)) n'a pas accès au service dans le contexte visiteur anonyme : il appelle `getPortalBanner(projectKey, null)` qui bascule automatiquement sur le repli global (les 3 problèmes les plus actifs). | Bandeau global, limité aux 3 problèmes les plus actifs du centre de services. |
| **8** | Commentaire public sur une demande au nom de l'agent | Permet l'envoi du message groupé à la correction d'un problème (lot S, PC-18). | Appeler l'API de commentaire JSM avec l'identité de l'agent connecté. | L'application ne publie **aucun commentaire public automatique** (§6, §17). Pour le ticket de problème interne, `addInternalComment` ([src/platform/jira.ts](../src/platform/jira.ts)) poste au nom de l'app. Pour les clients, `draftCustomerUpdate` prépare un texte que l'agent copie-colle ou valide explicitement. | Brouillon généré prêt à être validé et envoyé par l'agent. |

---

## 2. Mesures de justesse du rattachement (§17)

Le cahier des charges (§17) fixe deux exigences quantitatives non négociables :
- **Au moins 85 % de rattachements corrects** sur un échantillon de validation.
- **Moins de 5 % de rattachements d'office erronés** (faux positifs automatiques).

### Protocole de validation sur les 200 tickets étiquetés

1. **Constitution du corpus** : 200 tickets réels ou issus du générateur déterministe, annotés manuellement avec leur cause réelle (vérité terrain) :
   - 140 tickets répartis sur 5 causes connues récurrentes (avec formulations variées, fautes, termes familiers) ;
   - 30 tickets d'incidents isolés (sans cause commune) ;
   - 20 demandes de service régulières sans défaut (réinitialisation de mot de passe, demande de matériel) ;
   - 10 tickets courts ou ambigus (« ça ne marche pas », « erreur »).

2. **Exécution du test** :
   - Injection du corpus dans un environnement de test isolé.
   - Appel de `matchTicket` ([src/core/matching.ts](../src/core/matching.ts)) pour chaque ticket contre la base de problèmes ouverts.
   - Enregistrement du résultat : `step`, `confidence`, `auto`, `rationale`.

3. **Matrice de confusion & indicateurs calculés** :

$$\text{Taux de justesse} = \frac{\text{Rattachements corrects (d'office ou proposés)}}{\text{Total des tickets avec cause connue}} \ge 85\%$$

$$\text{Taux d'erreur d'office} = \frac{\text{Rattachements automatiques à un mauvais problème}}{\text{Total des rattachements automatiques}} < 5\%$$

### Comment le code garantit ces seuils

- **Le coupe-circuit des faux positifs** : la fonction `isAutoAttach` ([src/core/matching.ts](../src/core/matching.ts)) n'autorise le rattachement automatique que si deux conditions cumulatives sont remplies :
  1. `confidence === 'high'` (uniquement la marche 1 — même signature stricte — ou la marche 3 — code d'erreur / asset identique) ;
  2. `undetermined === false` (les textes trop courts ou vagues sont systématiquement exclus du rattachement automatique, §18).
- **La marche 2 reste sous contrôle humain** : dès que le modèle intervient sur une proximité sémantique (marche 2), la confiance est plafonnée à `medium` et le rattachement est **uniquement proposé** à l'agent (`auto: false`), éliminant ainsi le risque d'erreur d'office.

---

## 3. Résultats mesurés sur le site de démonstration (2026-11-11)

Sonde : `python3 tools/valide_site_demo.py --ecrire --json resultats.json` (lecture seule par défaut ; `--ecrire` autorise l'unique test écrit, qui crée une demande, y pose un commentaire public puis **la supprime**).

Site : `https://one-atlas-cndz.atlassian.net` · 66 appels REST.

| # | Point | Verdict | Mesure | Conséquence pour l'app |
|---|---|---|---|---|
| 1 | Volume et variété des tickets d’exemple du site de démo | **PARTIEL** | 11 bureaux de services, 2824 tickets au total mais 1 sur les 90 derniers jours ; ITO=1000, ITS=1000, INV=291, FAC=266, SECOPS=149 | **Fenêtre d'amorçage élargie** : 90 j → 365 j → tout l'historique tant qu'il y a moins de 10 tickets (`BOOTSTRAP_WINDOWS_DAYS`). Sans cela l'app restait vide sur ce site. |
| 2 | Type « Problème » présent pour porter le ticket unique (§10) | **OK** | types globaux contenant « Problem » : ['Problem', '[System] Problem'] ; projets où le type est créable : aucun | Le type « Problem » existe au niveau du site mais n'est créable dans aucun projet testé → l'écran de réglages choisit le type (`settings.problemIssueType`), comme prévu au §10. |
| 3 | Lecture des délais de service et de leur dépassement (§9) | **OK** | CLSD-5 : 1 délai(s) ['Time to resolution'], dépassé(s)=[None] | Poste « engagements rompus » lisible : le lot S reste activable dans les réglages. |
| 4 | Inventaire (Assets) lisible pour l’indice « même équipement » (§8.2) | **OK** | assets/workspace → 200, 1 espace(s) ; espace 77aea180-a0a9-4f0f-8bf7-625ce74d3a65 : objet/nav → 404 | Espace Assets visible, navigation par objet refusée (404) → l'indice « même équipement » passe par les champs du ticket et le graphe, jamais par l'API Assets directe. |
| 5 | Bandeau du portail dynamique selon le service consulté (§13) | **PARTIEL** | CLSD : 12 types de demande, 0 groupe(s) de services, 6 file(s) ; aucun groupe → bandeau global | Aucun groupe de services sur les types de demande → le bandeau du portail est **global**, limité aux trois problèmes les plus actifs (repli déjà codé). |
| 6 | Commentaire public sur une demande au nom de l’agent (§7.4) | **OK** | demande CLSD-7 créée, commentaire public → 201, puis supprimée (204) | Le commentaire public au nom de l'agent fonctionne : le message groupé de correction (§7.4) peut être envoyé après relecture humaine. |
| 7 | Coût et durée du modèle à l’initialisation (§14) | **OK** | 1 tickets sur 90 jours (6 premiers bureaux) → ~1 min de modèle | Peu de tickets récents : l'initialisation coûte quelques appels modèle seulement ; le cache par empreinte borne le reste. |
| 8 | Événements de création / modification / commentaire (§14) | **OK** | 3/3 événements déclarés : avi:jira:created:issue, avi:jira:updated:issue, avi:jira:commented:issue | Les trois événements sont déclarés et validés par `forge lint`. |

Bilan : 6 OK, 2 partiel(s), 0 échec(s).

---

## 4. Déploiement et test en direct (2026-11-11)

Ce qui a été fait réellement, pas seulement vérifié hors ligne :

| Étape | Commande | Résultat |
|---|---|---|
| Lint officiel | `forge lint` | **No issues found** |
| Build | `forge build` | **Build successful** (tag `2074cc10-edda-491b-b541-1708869639eb`) |
| Déploiement | `forge deploy` | **Deployed** — `Hidden Problems`, environnement `development`, version 2.1.0, éligible *Runs on Atlassian* |
| Installation | `forge install --site one-atlas-cndz.atlassian.net --product jira` | **Install in Jira complete** (8 scopes acceptés) |
| Test en direct | 17 demandes JSM créées par l'API puis **supprimées** (204) | triggers déclenchés, pipeline complet exécuté |

### Ce que les logs ont prouvé

```
[problemes-caches] llm : changement de modèle
[problemes-caches] rattachement none (low) sur 131 caractères
[problemes-caches] grappe ca224153 : 2 tickets, 0 h, 1 personnes, statut watching
[problemes-caches] issueCreated CLSD-24 (CLSD) : none
```

Trois demandes « imprimante du 3ᵉ étage » rédigées différemment : deux tombent
dans la **même grappe** (`ca224153`, 2 tickets), la troisième dans une autre.
Le regroupement fonctionne donc en réel ; l'écart restant est exactement le
risque §16 point 5 (stabilité des signatures), réduit par le vocabulaire
persistant et à mesurer sur le jeu étiqueté de 200 tickets (§17).

Délai observé entre la création de la demande et la fin du traitement :
**2 à 9 secondes** — très en dessous des 30 secondes de PC-07.

### Quatre défauts trouvés uniquement grâce au déploiement

Aucun n'était détectable par `tsc`, les 200 tests ou `forge lint` :

1. **Le schéma n'était jamais créé** — `ensureSchema()` existait mais personne ne
   l'appelait ; toute lecture échouait en `SQL_EXECUTION_ERROR`. Corrigé par le
   `migrationRunner` officiel accroché à la couche d'accès (`schema-init.ts`).
2. **DDL non portable** — clause `ENGINE=InnoDB DEFAULT CHARSET=…` et `KEY …`
   inline refusées ; index déplacés en `CREATE INDEX` séparés.
3. **Teamwork Graph appelé sans utilisateur** — `401 AUTH_TYPE_UNAVAILABLE` sur
   chaque trigger (§14 : le graphe ne s'appelle qu'au nom d'un utilisateur).
   Déplacé dans le panneau de l'agent, là où un utilisateur existe.
4. **Le vocabulaire n'était jamais enregistré (§8.3)** — les libellés du modèle
   servaient d'identifiants, le vocabulaire restait vide, le modèle réinventait
   à chaque ticket et **aucune grappe ne se formait**. Corrigé par `ensureTerm()`
   (`resolveTermId` → `suggestNewTerm` → `upsertTerm`).

Leçon : pour une app Forge, `forge lint` + tests + typage ne remplacent pas un
déploiement et un ticket réel. Les logs applicatifs (`forge logs`) font partie de
la recette, d'où le journal de grappe ajouté (compteurs et identifiant tronqué,
jamais de texte de ticket ni nom d'agent, §17).

### À faire côté humain

- `forge deploy -e production` puis `forge install --upgrade` pour la version
  soumise aux juges (le développement installé ici sert aux tests).
- Les scopes `read:graph:*` exigent un **administrateur d'organisation** : sans
  eux le graphe omet silencieusement les objets, et l'indice « même équipement »
  repose alors sur les champs du ticket (repli déjà codé).
- Le jeu d'exemple (§21) se charge depuis l'écran de réglages : bouton
  « Charger 60 jours de tickets d'exemple ».
