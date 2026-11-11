# Problèmes cachés dans les tickets — cahier des charges

> Codegeist 2026 · catégorie **Apps for Business Teams** (support, IT)
> Bonus visés : Teamwork Graph, Agents Rovo, MCP, Marketplace
> Version 1 du 11 novembre 2026 · soumission avant le mardi 22 décembre 2026, 21 h (Paris)

## 1. L'idée en une phrase

L'app regroupe les incidents et demandes JSM qui ont la même origine, chiffre ce que chaque problème récurrent coûte, tient un seul ticket de problème à jour, reconnaît les nouveaux tickets dès leur arrivée et prévient les clients avant même qu'ils n'écrivent.

## 2. Le problème

Un centre de services traite des tickets un par un. C'est son métier, et c'est sa limite : cent tickets résolus un par un peuvent être cent fois le même problème.

Chaque agent voit passer trois ou quatre cas et applique le contournement. Personne ne voit les cent. Les conséquences :

- **Le coût reste invisible.** « Le VPN qui décroche après la mise à jour » n'apparaît dans aucun tableau ; il a pourtant consommé 60 heures de support ce mois-ci.
- **La cause n'est jamais traitée.** L'équipe qui pourrait corriger ne reçoit qu'un ticket de temps en temps, sans l'ampleur.
- **Les clients répètent.** Chacun rouvre une demande pour un problème déjà connu de l'équipe, et attend une réponse que dix autres ont déjà reçue.
- **Les agents réinventent.** Le contournement trouvé par l'un n'atteint pas les autres.

La gestion des problèmes existe dans les méthodes de support. En pratique elle repose sur quelqu'un qui « remarque » une répétition. L'app rend ce repérage systématique et lui donne un prix.

## 3. Utilisateurs

| Qui | Moment | Attente |
|---|---|---|
| Agent de support | Un ticket arrive | Savoir tout de suite si c'est un problème connu, et quoi répondre |
| Responsable du support | Chaque semaine | Quels problèmes coûtent le plus, lesquels montent |
| Gestionnaire de problèmes | En continu | Un ticket de problème par cause, alimenté sans effort |
| Équipe qui corrige (IT, développement) | Arbitrage | L'ampleur réelle : tickets, heures, personnes touchées |
| Client, employé | Avant d'écrire, puis après | Savoir que c'est connu, où ça en est, sans relancer |

## 4. Vocabulaire du produit

- **Ticket** : un incident ou une demande d'un projet de service.
- **Symptôme** : ce que décrit le ticket, ramené à une forme courte et normalisée.
- **Signature** : le triplet **système, symptôme, déclencheur** qui identifie une origine (« VPN · déconnexion · après mise à jour du poste »).
- **Grappe** : des tickets de même signature, pas encore reconnus comme un problème.
- **Problème** : une grappe confirmée, portée par un ticket de problème unique.
- **Appartenance** : le lien entre un ticket et un problème, avec sa base (règle, rapprochement, confirmation humaine) et sa confiance.
- **Addition** : ce que le problème a coûté sur une période.
- **Flambée** : une montée brutale des tickets d'une même signature.
- **« Moi aussi »** : le signalement d'un client touché, sans création de ticket.

## 5. Cycle de vie d'un problème

| État | Sens | Ce qui fait passer au suivant |
|---|---|---|
| Suspect | L'app a repéré une grappe au-dessus du seuil | Un humain confirme, scinde ou rejette |
| Confirmé | Un ticket de problème existe, les tickets y sont liés | Une cause est renseignée |
| Cause connue | On sait pourquoi | Un contournement est validé |
| Contournement publié | Les agents et les clients l'ont sous la main | Un correctif est livré |
| Corrigé | Le correctif est en place | Aucun nouveau ticket pendant la période de surveillance |
| Vérifié | Le problème est clos | — |
| Régression | De nouveaux tickets arrivent après correction | Retour à « Confirmé » |

## 6. Périmètre

Priorités : **M** = indispensable pour la soumission, **S** = souhaitable, **C** = après le hackathon.

| Lot | Contenu |
|---|---|
| MVP (22 décembre) | Extraction des signatures, grappes, problèmes suspects, ticket de problème unique, addition (tickets, heures, personnes), reconnaissance à l'arrivée, panneau de l'agent, page « Problèmes », agent Rovo, outils MCP, jeu d'exemple |
| V1 | Flambées, bandeau de problème connu dans le portail, « moi aussi », suivi après correction, brouillon de message groupé, coût affiché sur le ticket de développement |
| Vision | Prévision, article de base de connaissances rédigé à partir des résolutions, vocabulaire appris, problèmes communs à plusieurs centres de services |

Hors périmètre : répondre automatiquement à un client. L'app prépare, un humain envoie.

## 7. Parcours détaillés

### 7.1 La découverte

1. Lundi matin, la responsable du support ouvre **Problèmes**.
2. En tête des suspects : « VPN · déconnexion · après mise à jour du poste — 43 tickets en 3 semaines, 61 heures, 38 personnes, en hausse ».
3. Elle ouvre la grappe : les 43 tickets, la phrase qui justifie chaque rattachement, trois tickets à confiance faible.
4. Elle en retire deux, confirme. Un ticket de problème PRB-12 est créé ; les 41 tickets lui sont liés.
5. L'addition apparaît sur PRB-12 et sur le ticket de l'équipe réseau qui porte le correctif.

### 7.2 Le ticket qui arrive

Un employé écrit : « Mon accès distant coupe toutes les dix minutes depuis ce matin. » L'agent ouvre le ticket. Le panneau indique :

> Problème connu **PRB-12**, confiance élevée. Contournement validé : réinstaller le profil VPN (procédure liée). Correctif prévu le 18. 41 tickets déjà rattachés.

Un clic rattache le ticket et place la réponse proposée dans l'éditeur. L'agent relit et envoie.

### 7.3 Le client qui n'écrit pas

Dans le portail, un bandeau : « Problème connu sur l'accès distant. Contournement disponible. Vous êtes concerné ? ». L'employé clique **Moi aussi**. Il est compté parmi les personnes touchées et sera prévenu à la correction. Aucun ticket n'est créé.

### 7.4 La correction

L'équipe réseau livre. PRB-12 passe à « Corrigé ». L'app prépare un message pour les 17 tickets encore ouverts et les 23 « moi aussi » ; l'agent le valide et l'envoie. La surveillance commence : 14 jours sans nouveau ticket de cette signature, et le problème passe à « Vérifié ».

### 7.5 La régression

Au neuvième jour, quatre tickets de la même signature arrivent. PRB-12 repasse à « Confirmé », marqué « régression », et l'équipe réseau est mentionnée.

## 8. Reconnaître une même origine

### 8.1 Pourquoi une signature

Le modèle disponible dans Forge répond à des questions en texte ; il ne fournit pas de vecteurs de similarité, et la base Forge SQL ne documente pas de recherche vectorielle. Le regroupement repose donc sur une signature explicite, lisible et corrigeable par un humain, plutôt que sur une distance opaque.

### 8.2 Extraction

Pour chaque ticket :

1. **Indices certains**, sans modèle : type de demande, service ou équipement affecté, composant, codes d'erreur repérés par motif, produit et version, système d'exploitation.
2. **Signature**, par modèle de langage : le texte du ticket est ramené à un triplet système, symptôme, déclencheur, en choisissant d'abord dans le vocabulaire déjà connu du projet. Un terme nouveau n'est créé que si aucun ne convient.
3. **Mise en cache** : un ticket n'est soumis au modèle qu'une fois, sauf modification de sa description.

### 8.3 Vocabulaire tenu

Les systèmes et symptômes forment un vocabulaire par projet. Un écran permet de renommer, fusionner (« accès distant » et « VPN ») ou scinder un terme. Toute fusion regroupe les tickets concernés sans rien recalculer.

### 8.4 Rattachement à un problème existant

Dans l'ordre :

1. **Même signature complète** qu'un problème ouvert : rattachement proposé, confiance élevée.
2. **Même système, symptôme proche** : le modèle compare le ticket à la fiche du problème et répond oui ou non, avec une phrase de justification. Confiance moyenne.
3. **Indice certain partagé** (même code d'erreur, même équipement) : confiance élevée quel que soit le texte.

Un rattachement à confiance élevée est fait d'office et réversible ; à confiance moyenne, il est proposé à l'agent.

### 8.5 Naissance d'un suspect

Une grappe devient un problème suspect quand, sur 30 jours glissants, elle dépasse un seuil réglable : 5 tickets, ou 10 heures de traitement, ou 10 personnes touchées.

### 8.6 Flambée

Une signature dont le nombre de tickets sur 2 heures dépasse trois fois sa moyenne habituelle déclenche une alerte de flambée : c'est probablement un incident majeur en train de naître. L'app propose de créer l'incident et de publier le bandeau du portail.

## 9. L'addition

Sur 30 et 90 jours, pour chaque problème :

| Poste | Calcul | Lot |
|---|---|---|
| Tickets | Nombre de tickets rattachés | M |
| Heures de support | Temps saisi s'il existe ; sinon nombre d'interventions d'agents × durée moyenne réglable (10 minutes par défaut) | M |
| Personnes touchées | Demandeurs distincts, plus les « moi aussi » | M |
| Organisations touchées | Organisations clientes distinctes | S |
| Engagements de délai rompus | Tickets dont un délai de service a été dépassé | S |
| Réouvertures | Tickets rouverts après résolution | S |
| Escalades | Tickets transmis à une autre équipe | S |
| Temps perdu côté demandeurs | Durée d'ouverture cumulée, affichée à part | C |

Chaque poste se déplie jusqu'aux tickets. La méthode et la durée moyenne utilisée sont affichées avec le chiffre.

**Tendance** : comparaison des deux dernières périodes. **Projection** (lot C) : « à ce rythme, 110 heures le mois prochain ».

**Conversion en euros** : facultative, avec un taux horaire saisi par l'administrateur.

## 10. Un seul ticket de problème

- Type : le type « Problème » du projet de service s'il existe, sinon un type choisi dans les réglages.
- Contenu tenu par l'app : signature, addition, courbe des tickets, cause, contournement, correctif lié, liste des tickets rattachés.
- Mise à jour : une synthèse **quotidienne** dans une propriété et un commentaire, jamais un commentaire par ticket rattaché.
- Liens : chaque ticket rattaché est lié au problème ; le problème est lié au ticket de l'équipe qui corrige.
- Unicité : avant toute création, l'app cherche un problème ouvert de même signature ou de même système, et propose la fusion.
- Fusion et scission à la main, à tout moment.

## 11. Exigences fonctionnelles

| N° | Exigence | Priorité |
|---|---|---|
| PC-01 | Extraire indices certains et signature de chaque ticket des projets de service choisis | M |
| PC-02 | Tenir un vocabulaire de systèmes et de symptômes, modifiable | M |
| PC-03 | Former des grappes et proposer des problèmes suspects selon des seuils réglables | M |
| PC-04 | Confirmer, scinder, fusionner ou rejeter un suspect ; justifier chaque rattachement | M |
| PC-05 | Créer et tenir à jour un ticket de problème unique, selon le § 10 | M |
| PC-06 | Calculer l'addition : tickets, heures, personnes touchées | M |
| PC-07 | Reconnaître un problème connu à l'arrivée d'un ticket, en moins de 30 s | M |
| PC-08 | Afficher à l'agent le problème reconnu, le contournement et une réponse proposée | M |
| PC-09 | Page « Problèmes » : suspects, confirmés, classement par coût, tendance | M |
| PC-10 | Initialiser 90 jours d'historique à l'installation | M |
| PC-11 | Agent Rovo et outils MCP du § 12 | M |
| PC-12 | Jeu d'exemple pour tester sans historique | M |
| PC-13 | Respecter les restrictions de visibilité des tickets | M |
| PC-14 | Détecter les flambées et proposer l'incident | S |
| PC-15 | Bandeau de problème connu dans le portail, par service | S |
| PC-16 | « Moi aussi » depuis le portail | S |
| PC-17 | Surveillance après correction, détection de régression | S |
| PC-18 | Brouillon de message groupé aux tickets ouverts, envoyé par un humain | S |
| PC-19 | Afficher sur un ticket de demande, côté portail, le problème auquel il est rattaché | S |
| PC-20 | Afficher l'addition sur le ticket de développement lié | S |
| PC-21 | Postes d'addition du lot S | S |
| PC-22 | Brouillon d'article de base de connaissances à partir des résolutions | C |
| PC-23 | Projection du coût | C |

## 12. Agent Rovo et outils MCP

### Agent « Problèmes cachés »

- « Quels problèmes nous coûtent le plus ce mois-ci ? »
- « Ce ticket ressemble-t-il à un problème connu ? »
- « Qu'est-ce qui monte depuis la semaine dernière ? »
- « Rédige le message pour les personnes touchées par PRB-12. »
- « Combien a coûté le problème d'impression de l'étage 3 ? »

### Actions, aussi exposées par `rovo:mcp`

| Clé | Verbe | Entrées | Retour |
|---|---|---|---|
| `match-known-problem` | GET | `text` ou `issueKey` | Problème reconnu, confiance, contournement |
| `list-top-problems` | GET | `projectKey`, `days` | Problèmes classés par coût, tendance |
| `get-problem` | GET | `problemKey` | Fiche complète : signature, état, addition, cause, contournement |
| `list-suspects` | GET | `projectKey` | Grappes à confirmer |
| `get-surges` | GET | `projectKey` | Flambées en cours |
| `draft-customer-update` | GET | `problemKey` | Brouillon de message |
| `confirm-membership` | UPDATE | `issueKey`, `problemKey`, `confirmed` | Rattachement confirmé ou rejeté |

`match-known-problem` accepte un texte libre : un agent conversationnel du support, quel qu'il soit, peut vérifier si la question de l'utilisateur correspond à un problème connu avant de créer un ticket.

## 13. Écrans

**Côté agents**

1. **Panneau sur le ticket** (`jira:issuePanel`). Problème reconnu ou proposé, confiance, justification, contournement, bouton « Rattacher et préparer la réponse ».
2. **Page « Problèmes » dans les files** (page de file JSM). Suspects à traiter, problèmes par coût, flambées, tickets sans rattachement.
3. **Panneau sur le ticket de problème.** Addition, courbe, tickets rattachés, vocabulaire, actions de fusion et de scission.
4. **Encart sur le ticket de développement** (`jira:issueContext`). « Ce bug coûte 31 heures de support par mois à 212 personnes. »
5. **Réglages du projet.** Projets suivis, seuils, durée moyenne d'une intervention, vocabulaire, services du portail.

**Côté clients (portail)**

6. **Bandeau de problème connu** (en-tête ou sous-en-tête du portail). Problèmes actifs, contournement, bouton « Moi aussi ».
7. **Détail d'une demande** (panneau de détail de demande). « Votre demande est rattachée à un problème connu. État : correctif prévu le 18. »

## 14. Architecture Forge

Une app installée sur Jira, où vit JSM.

```yaml
# Esquisse, à valider avec forge lint
modules:
  trigger:                   # avi:jira:created:issue, avi:jira:updated:issue,
                             # avi:jira:commented:issue
  consumer:                  # extraction, rattachement, recalcul des additions
  scheduledTrigger:          # synthèse quotidienne, grappes, flambées, surveillance
  sql:
  llm:                       # signature, comparaison ticket ↔ problème, brouillons
  jira:issuePanel:
  jira:issueContext:
  jira:projectSettingsPage:
  jiraServiceManagement:queuePage:
  jiraServiceManagement:portalSubheader:         # bandeau, lot S
  jiraServiceManagement:portalRequestDetailPanel: # rattachement vu par le client, lot S
  rovo:agent:
  action:
  rovo:mcp:
```

### À l'arrivée d'un ticket

1. L'événement de création poste un message dans la file.
2. Le consommateur extrait les indices certains, puis demande la signature au modèle.
3. Il cherche un problème ouvert selon le § 8.4 et enregistre l'appartenance proposée ou faite.
4. Il met à jour les compteurs de la grappe et vérifie le seuil de flambée.
5. Le panneau du ticket lit le résultat enregistré.

### Chaque nuit

Formation des grappes, proposition des suspects, recalcul des additions, synthèse sur les tickets de problème, surveillance des problèmes corrigés.

### Initialisation

90 jours d'historique, par lots de 50 tickets. Le débit est borné par le modèle : 100 requêtes par minute par installation. Un projet de 10 000 tickets s'initialise donc en moins de deux heures, avec une barre de progression, et l'app est utilisable sur les tickets déjà traités.

### Teamwork Graph

L'app **consomme** le graphe pour enrichir les indices certains : service lié à un incident, ticket lié à un incident, objet d'inventaire lié à un ticket, organisation cliente. L'API ne s'appelle qu'au nom d'un utilisateur ; ces lectures se font à l'ouverture des écrans et sont mises en cache.

## 15. Modèle de données (Forge SQL)

| Table | Colonnes principales |
|---|---|
| `ticket_fact` | issue_id, key, project_id, request_type, service, component, reporter, organization, created_at, resolved_at, touches, reopened, escalated, sla_breached |
| `signature` | issue_id, system_id, symptom_id, trigger_text, hard_keys_json, extracted_at, source_hash |
| `term` | id, project_id, kind (système, symptôme), label, merged_into |
| `cluster` | id, project_id, system_id, symptom_id, tickets_30d, hours_30d, people_30d, status |
| `problem` | id, issue_key, cluster_id, state, cause, workaround, fix_issue_key, fixed_at, watch_until |
| `membership` | issue_id, problem_id, basis (règle, rapprochement, humain), confidence, rationale, confirmed_by, rejected |
| `me_too` | problem_id, account_id, at |
| `problem_bill` | problem_id, period, tickets, hours, people, orgs, sla_breaches, reopens, escalations, computed_at |
| `surge` | id, cluster_id, started_at, rate, baseline, incident_key |
| `settings` | project_id, thresholds_json, minutes_per_touch, portal_services_json |

## 16. Contraintes vérifiées et points à valider

### Vérifié dans la documentation (10 et 11 novembre 2026)

- Modules JSM disponibles dans Forge : page de file, en-tête, sous-en-tête et pied du portail, détail de demande, panneau de détail de demande, panneau de création de demande, action sur la vue de demande, panneau d'organisation.
- L'en-tête et le sous-en-tête du portail acceptent les visiteurs anonymes ; les panneaux de détail de demande ne les acceptent pas.
- L'API de JSM s'appelle depuis Forge par `requestJira` sur `/rest/servicedeskapi/…`. Scopes : `read:servicedesk-request`, et des scopes fins pour les délais de service et les organisations.
- Les événements de création, modification et commentaire de ticket sont disponibles pour les déclencheurs.
- Forge LLMs : modèles Claude, texte seul, 100 requêtes par minute et 500 000 jetons par minute et par modèle, par installation. L'API propose la conversation, pas de vecteurs de similarité.
- Forge SQL : 1 Gio par installation en production, 5 s par SELECT ; la page des limites ne mentionne pas de recherche vectorielle.
- Fonctions asynchrones et planifiées : jusqu'à 900 s.
- API Teamwork Graph : en Preview, appel au nom de l'utilisateur, requêtes enregistrées, un scope par type d'objet. Relations présentes : incident JSM → service, incident JSM → ticket, ticket → objet d'inventaire.
- Le site de démonstration fourni aux participants contient JSM et des données d'exemple.

### À valider par un prototype la première semaine

| Point | Pourquoi | Solution de repli |
|---|---|---|
| Volume et variété des tickets d'exemple du site de démonstration | Sans répétitions, pas de grappes | Jeu d'exemple injecté dans les tables de l'app |
| Type « Problème » présent dans le projet de service | Porte le ticket unique | Type choisi dans les réglages |
| Lecture des délais de service et de leur dépassement | Poste « engagements rompus » | Poste retiré du MVP |
| Inventaire (Assets) lisible depuis Forge | Indice certain « même équipement » | Champ du ticket, ou graphe |
| Stabilité des signatures d'un passage à l'autre | Un même ticket doit toujours donner la même signature | Vocabulaire fermé, cache, température minimale |
| Coût du modèle à l'initialisation | Un appel par ticket | Préfiltrage par indices certains ; modèle le plus économique |
| Contenu dynamique du bandeau selon le service consulté | Pertinence du bandeau | Bandeau global, limité aux trois problèmes les plus actifs |
| Commentaire public sur une demande au nom de l'agent | Message groupé | Brouillon copié par l'agent |

## 17. Exigences non fonctionnelles

- **Rapidité.** Reconnaissance d'un ticket en moins de 30 s après sa création. Page « Problèmes » en moins de 2 s.
- **Justesse.** Sur 200 tickets étiquetés à la main : au moins 85 % de rattachements corrects, moins de 5 % de rattachements d'office erronés.
- **Lisibilité.** Chaque rattachement affiche sa base et sa justification. Chaque chiffre affiche sa méthode.
- **Discrétion.** Une synthèse par jour sur le ticket de problème. Aucun message à un client sans validation humaine.
- **Vie privée.** L'app conserve la signature et les indices, pas le texte intégral des tickets. Aucun classement d'agents par performance. Les tickets à visibilité restreinte comptent dans l'addition mais ne sont montrés qu'à ceux qui peuvent les ouvrir.
- **Données.** Stockage Forge SQL, modèle hébergé par Atlassian, aucune sortie réseau.
- **Langues.** Tickets traités dans leur langue ; vocabulaire dans la langue du projet ; interface en anglais et en français ; soumission en anglais.

## 18. Cas limites

- Ticket qui décrit deux problèmes : deux signatures possibles, rattachement au plus probable, l'autre proposé.
- Ticket vide ou d'une ligne (« ça ne marche pas ») : signature « indéterminée », jamais regroupé d'office.
- Ticket dans une autre langue que le vocabulaire : la signature est exprimée dans la langue du projet.
- Même symptôme, deux causes (le VPN coupe pour deux raisons) : scission de la grappe ; le déclencheur les distingue ensuite.
- Deux problèmes qui n'en font qu'un : fusion ; les additions s'additionnent sans double compte.
- Demande de service répétée mais normale (réinitialisation de mot de passe) : c'est une grappe coûteuse sans défaut. L'app la classe à part, « demandes récurrentes », candidate à l'automatisation plutôt qu'à la correction.
- Flambée due à une campagne interne (tout le monde change de poste le même jour) : marquée « attendue » par un humain, exclue des alertes.
- Problème corrigé pour une partie des utilisateurs : la surveillance se fait par service ou par version.
- Ticket rattaché à tort puis retiré : l'addition est recalculée, le rejet est mémorisé.
- « Moi aussi » de quelqu'un qui a aussi un ticket : compté une seule fois.

## 19. Recette

1. Dix tickets décrivant la même panne avec des mots différents reçoivent la même signature ou sont rapprochés avec justification.
2. Au-dessus du seuil, la grappe apparaît dans les suspects avec son addition.
3. La confirmation crée un ticket de problème, un seul, et lie tous les tickets.
4. Un onzième ticket du même problème est reconnu en moins de 30 s et le panneau affiche le contournement.
5. Un ticket sans rapport n'est pas rattaché.
6. Retirer un ticket du problème diminue l'addition d'autant.
7. Deux termes fusionnés dans le vocabulaire regroupent leurs tickets.
8. Un problème corrigé qui reçoit de nouveaux tickets passe à « régression ».
9. Un lecteur sans accès à un ticket restreint voit « 1 élément masqué », et l'addition ne change pas.
10. `match-known-problem` avec un texte libre renvoie le même problème que le panneau pour le ticket correspondant.
11. Aucun message n'est envoyé à un client sans action d'un agent.

## 20. Scénario de la vidéo (moins de 5 minutes, en anglais)

| Temps | Contenu |
|---|---|
| 0:00 – 0:30 | Une file de 120 tickets. Trois problèmes s'y cachent ; personne ne les voit. |
| 0:30 – 1:20 | La page « Problèmes » : trois suspects, leur addition, celui qui monte |
| 1:20 – 2:00 | Confirmation d'une grappe, deux tickets retirés, ticket de problème créé |
| 2:00 – 2:40 | Un nouveau ticket arrive : reconnu, contournement proposé, réponse en un clic |
| 2:40 – 3:10 | Portail : bandeau de problème connu, « Moi aussi » |
| 3:10 – 3:40 | Le bug côté développement affiche « 61 heures de support, 38 personnes » |
| 3:40 – 4:15 | Correction, message groupé validé, surveillance, régression détectée |
| 4:15 – 4:45 | Agent Rovo et outil MCP ; architecture |

Jeu de données : 120 tickets sur 60 jours, dont trois problèmes cachés (accès distant après mise à jour, imprimante d'un étage, facture reçue en double) et une demande récurrente normale.

## 21. Comment les juges testeront

Le site de démonstration contient déjà JSM. Deux niveaux :

1. **Jeu d'exemple.** Un bouton injecte dans les tables de l'app 60 jours de tickets fictifs et leurs grappes. Tous les écrans, l'agent Rovo et les outils MCP fonctionnent aussitôt.
2. **En direct.** Créer une demande dans le portail avec l'un des textes fournis : elle est reconnue en moins de 30 secondes et le panneau de l'agent l'affiche.

## 22. Plan jusqu'au 22 décembre

| Semaine | Objectif |
|---|---|
| 11 – 17 nov. | Les huit validations du § 16 ; extraction de signature stable sur 200 tickets étiquetés |
| 18 – 24 nov. | Vocabulaire, grappes, suspects, stockage, initialisation |
| 25 nov. – 1er déc. | Rattachement, ticket de problème unique, addition |
| 2 – 8 déc. | Reconnaissance à l'arrivée, panneau de l'agent, page « Problèmes » |
| 9 – 15 déc. | Agent Rovo, MCP, jeu d'exemple, bandeau du portail ; gel des fonctionnalités le 15 |
| 16 – 22 déc. | Recette, vidéo, instructions pour les juges, soumission, dépôt Marketplace |

## 23. Risques

| Risque | Parade |
|---|---|
| Regroupements faux | Signature lisible, justification affichée, confirmation humaine avant tout ticket de problème |
| Signatures instables | Vocabulaire fermé, cache par ticket, jeu étiqueté de 200 tickets |
| Fonction déjà couverte par des outils du produit | Angle propre : le coût chiffré, le ticket unique tenu à jour, le « moi aussi » |
| Coût et débit du modèle | Un appel par ticket, mis en cache ; préfiltrage ; initialisation étalée |
| Chiffres contestés | Méthode affichée, durée moyenne réglable, temps saisi prioritaire |
| Glissement vers la surveillance des agents | Aucun indicateur par personne |
| Bandeau inquiétant ou erroné | Publication par un humain, texte validé, retrait automatique à la vérification |

## 24. La vision poussée à l'extrême

- **Le support cesse d'être un centre de coût muet.** Chaque trimestre, il présente la facture de chaque problème à l'équipe qui peut le corriger, avec le retour attendu.
- **Les clients sont prévenus avant d'écrire.** Bandeau, « moi aussi », message à la correction : une part des tickets n'est jamais créée, et on sait combien.
- **La base de connaissances s'écrit à partir des résolutions.** Quand un contournement est validé, l'article est rédigé à partir des tickets résolus, puis mesuré : les tickets diminuent-ils ?
- **Prévision.** « Le déploiement de la version 12 commence lundi ; les trois dernières mises à jour ont produit 40 tickets de cette signature. »
- **Tout agent conversationnel vérifie d'abord.** Avant de créer un ticket, l'assistant du portail ou un agent externe appelle `match-known-problem` et répond avec le contournement.
- **Problèmes communs.** Plusieurs centres de services d'une même organisation (IT, RH, moyens généraux) découvrent qu'ils traitent le même problème chacun de leur côté.
- **Demandes récurrentes transformées en libre-service.** Ce qui se répète sans défaut est proposé à l'automatisation, avec le temps gagné chiffré.

## 25. Liens avec les autres cahiers des charges

- **Le coût réel de la dette (05)** : même ressort, côté développement. L'addition d'un problème devient une preuve chiffrée pour le ticket de dette ou de bug qui le cause.
- **Échecs de CI avec mémoire (04)** : même mécanique de signature, appliquée à des journaux plutôt qu'à des demandes.
- **Rayon d'impact (01)** : une flambée ou un problème en régression sur un service est un signal pour la release qui le touche.

## 26. Sources

- [Codegeist 2026](https://codegeist2026.devpost.com/), son [règlement](https://codegeist2026.devpost.com/rules) et ses [ressources](https://codegeist2026.devpost.com/resources)
- [Modules Jira Service Management](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jsm/)
- [En-tête du portail](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-service-management-portal-header/) et [panneau de détail de demande](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-service-management-portal-request-detail-panel/)
- [Scopes Jira Service Management](https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jsm/)
- [Appeler une API Jira Service Management](https://developer.atlassian.com/platform/forge/call-a-jira-service-management-api/)
- [Événements Jira dans Forge](https://developer.atlassian.com/platform/forge/events-reference/jira/)
- [Types de relations du graphe](https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/overview/)
- [Limites LLM](https://developer.atlassian.com/platform/forge/limits-llm/), [limites SQL](https://developer.atlassian.com/platform/forge/limits-sql/), [limites d'invocation](https://developer.atlassian.com/platform/forge/limits-invocation/)
- [Module Rovo MCP](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) et [module Action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/)
