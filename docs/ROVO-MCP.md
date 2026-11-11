# Agent Rovo & Outils MCP — Problèmes cachés dans les tickets

> **Codegeist 2026** · Catégorie **Apps for Business Teams**  
> Référence du cahier des charges : **§12, §16, §17**  
> Modules Forge déclarés : `rovo:agent`, `action`, `rovo:mcp` dans [manifest.yml](../manifest.yml)

L'application expose ses capacités d'analyse de récurrence et de chiffrage à la fois sous la forme d'un **Agent Rovo interactif** intégré dans l'espace Atlassian et sous forme d'**outils MCP** (*Model Context Protocol*) utilisables par tout client IA compatible (Cursor, Claude Desktop, agents autonomes).

---

## 1. L'Agent Rovo « Problèmes cachés »

Déclaré sous le module `rovo:agent` (clé `problemes-caches-agent`), cet agent conversationnel est spécialisé dans le diagnostic des incidents récurrents, leur chiffrage et leurs solutions.

### Prompt système configuré (`manifest.yml`)

> Tu es l'agent « Problèmes cachés ». Tu réponds aux questions sur les problèmes récurrents des projets Jira Service Management, leur addition (tickets, heures de support, personnes touchées), leurs contournements validés et les flambées en cours. Tu ne calcules jamais toi-même : tu appelles les actions disponibles (match-known-problem, list-top-problems, get-problem, list-suspects, get-surges, draft-customer-update) et tu restitues leurs chiffres. Tu donnes toujours la méthode (temps saisi ou interventions × durée moyenne) et tu ne classes jamais les agents de support : l'unité est le problème ou le projet. Si une donnée manque, tu le dis au lieu de l'inventer.

### Déclencheurs de conversation (*conversationStarters*)

L'agent présente 5 amorces prêtes à l'emploi :
1. *Quels problèmes nous coûtent le plus ce mois-ci ?*
2. *Ce ticket ressemble-t-il à un problème connu ?*
3. *Qu'est-ce qui monte depuis la semaine dernière ?*
4. *Rédige le message pour les personnes touchées par PRB-12.*
5. *Combien a coûté le problème d'impression du 3e étage ?*

---

## 2. Les 7 Outils exposés via Rovo & MCP (§12)

Toutes les actions renvoient une enveloppe standardisée définie dans [src/mcp/result.ts](../src/mcp/result.ts) (`{ ok: true, data: T }` ou `{ ok: false, error: string }`). Une action ne jette jamais d'exception non gérée : en cas d'erreur ou d'absence de données, l'agent reçoit un motif explicable.

Les entrées ci-dessous sont celles déclarées dans le bloc `action:` de [manifest.yml](../manifest.yml) ; les formes de données renvoient aux types du domaine ([src/core/types.ts](../src/core/types.ts) : `MatchResult`, `Problem`, `ProblemBill`, `Surge`, `CustomerUpdateDraft`…). Les exemples de réponse sont **illustratifs** (valeurs cohérentes avec le parcours du §7) ; l'implémentation des gestionnaires (`src/mcp/actions.ts`, contrat WP-M de [docs/CONTRATS.md](CONTRATS.md)) est en cours de fusion au moment de la rédaction.

### 2.1 `match-known-problem`
- **Verbe** : `GET`
- **Description** : Vérifie si un texte libre ou une clé de ticket Jira correspond à un problème connu, renvoie le contournement et le niveau de confiance.
- **Entrées** :
  - `projectKey` (string, optionnel) : Clé du projet JSM (ex. `"SUP"`).
  - `text` (string, optionnel) : Question ou texte descriptif libre.
  - `issueKey` (string, optionnel) : Clé du ticket existant à analyser (ex. `"SUP-104"`).
- **Retour** : Résultat de rapprochement (`step`, `problem`, `confidence`, `basis`, `rationale`, `workaround`).

```json
// Exemple d'appel JSON
{
  "projectKey": "SUP",
  "text": "L'accès VPN coupe toutes les dix minutes depuis la mise à jour de mon poste ce matin."
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "matched": true,
    "step": "same-signature",
    "confidence": "high",
    "basis": "rule",
    "rationale": "Signature identique au problème PRB-12 : système « VPN », symptôme « déconnexion », déclencheur « après mise à jour du poste ».",
    "problem": {
      "key": "PRB-12",
      "state": "workaround-published",
      "workaround": "Réinstaller le profil réseau VPN v3 via le portail d'entreprise.",
      "workaroundUrl": "https://confluence.example.com/pages/viewpage.action?pageId=8912",
      "fixPlanned": "NET-402 (prévu le 18)"
    }
  }
}
```

> **Note fondamentale du §12 — Texte libre** :  
> `match-known-problem` accepte un texte brut sans exiger de ticket existant. N'importe quel agent conversationnel (le bot du portail client, un agent Slack/Teams ou un système d'accueil IT) peut soumettre la question de l'employé **avant même d'ouvrir un ticket**. Si un problème est reconnu, le contournement est fourni immédiatement et aucun ticket n'est créé inutilement.

---

### 2.2 `list-top-problems`
- **Verbe** : `GET`
- **Description** : Renvoie les problèmes d'un projet classés par coût support décroissant, avec la tendance.
- **Entrées** :
  - `projectKey` (string, requis) : Clé du projet JSM (ex. `"SUP"`).
  - `days` (number, optionnel) : Période glissante, 30 ou 90 jours (défaut : 30).
- **Retour** : Liste ordonnée de fiches problèmes avec leurs métriques d'addition.

```json
// Exemple d'appel JSON
{
  "projectKey": "SUP",
  "days": 30
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "projectKey": "SUP",
    "period": "30d",
    "problems": [
      {
        "key": "PRB-12",
        "title": "VPN · déconnexion · après mise à jour du poste",
        "state": "workaround-published",
        "tickets": 41,
        "hours": 61.0,
        "people": 38,
        "trend": {
          "direction": "up",
          "deltaPercent": 42.5
        },
        "hoursMethod": "mixed",
        "eur": 4575.0
      },
      {
        "key": "PRB-15",
        "title": "Imprimante étage 3 · échec d'impression · file d'attente bloquée",
        "state": "confirmed",
        "tickets": 24,
        "hours": 19.5,
        "people": 22,
        "trend": {
          "direction": "flat",
          "deltaPercent": 2.0
        },
        "hoursMethod": "touches",
        "eur": 1462.5
      }
    ]
  }
}
```

---

### 2.3 `get-problem`
- **Verbe** : `GET`
- **Description** : Renvoie la fiche complète d'un problème récurrent.
- **Entrées** :
  - `problemKey` (string, requis) : Clé Jira du problème (ex. `"PRB-12"`) ou identifiant interne.
- **Retour** : Signature complète, état, cause, contournement, correctif lié, addition détaillée par poste et méthode de calcul.

```json
// Exemple d'appel JSON
{
  "problemKey": "PRB-12"
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "key": "PRB-12",
    "state": "workaround-published",
    "signature": {
      "system": "VPN",
      "symptom": "déconnexion intempestive",
      "trigger": "après mise à jour du poste"
    },
    "cause": "Incompatibilité entre le driver TAP virtuel et le correctif KB5044284 de Windows 11.",
    "workaround": "Réinstaller le profil VPN v3 depuis le catalogue d'applications.",
    "fixIssueKey": "NET-402",
    "fixedAt": null,
    "watchUntil": null,
    "bill": {
      "period": "30d",
      "tickets": 41,
      "hours": 61.0,
      "people": 38,
      "orgs": 4,
      "slaBreaches": 6,
      "reopens": 3,
      "escalations": 5,
      "meToo": 23,
      "hoursMethod": "mixed",
      "methodLabel": "temps saisi quand disponible, interventions × 10 min sinon"
    }
  }
}
```

---

### 2.4 `list-suspects`
- **Verbe** : `GET`
- **Description** : Renvoie les grappes d'incidents qui franchissent les seuils et attendent une confirmation humaine.
- **Entrées** :
  - `projectKey` (string, requis) : Clé du projet JSM (ex. `"SUP"`).
- **Retour** : Grappes candidates avec motif de dépassement (`tickets`, `hours` ou `people`).

```json
// Exemple d'appel JSON
{
  "projectKey": "SUP"
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "projectKey": "SUP",
    "suspects": [
      {
        "clusterId": "cl_8f3d1a9b",
        "system": "Facturation",
        "symptom": "facture reçue en double",
        "trigger": "génération mensuelle automatique",
        "tickets": 18,
        "hours": 12.0,
        "people": 18,
        "thresholdHit": "tickets",
        "sampleTicketKeys": ["SUP-201", "SUP-204", "SUP-209"]
      }
    ]
  }
}
```

---

### 2.5 `get-surges`
- **Verbe** : `GET`
- **Description** : Renvoie les flambées en cours (détection d'incident majeur potentiel dépassant 3× la normale sur 2 heures).
- **Entrées** :
  - `projectKey` (string, requis) : Clé du projet JSM (ex. `"SUP"`).
- **Retour** : Liste des flambées actives avec cadence, base habituelle et ratio.

```json
// Exemple d'appel JSON
{
  "projectKey": "SUP"
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "projectKey": "SUP",
    "surges": [
      {
        "surgeId": "srg_41b802",
        "clusterId": "cl_8f3d1a9b",
        "system": "Accès distant",
        "symptom": "déconnexion passerelle",
        "startedAt": "2026-11-11T09:15:00.000Z",
        "rate": 15,
        "baseline": 2.0,
        "factor": 7.5,
        "expected": false,
        "alertMessage": "15 tickets en 120 min — 7.5× le rythme habituel"
      }
    ]
  }
}
```

---

### 2.6 `draft-customer-update`
- **Verbe** : `GET`
- **Description** : Rédige un brouillon de message groupé pour informer les utilisateurs touchés par un problème. Le message n'est **jamais envoyé automatiquement** (§7.4, §17).
- **Entrées** :
  - `problemKey` (string, requis) : Clé du problème (ex. `"PRB-12"`).
- **Retour** : Sujet, corps du message, décompte des destinataires et source (`model` ou `template`).

```json
// Exemple d'appel JSON
{
  "problemKey": "PRB-12"
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "problemKey": "PRB-12",
    "subject": "Point sur votre incident d'accès distant VPN",
    "body": "Bonjour,\n\nVous nous avez signalé des coupures sur l'accès VPN suite à la mise à jour récente de votre poste de travail. Un correctif (NET-402) est actuellement en cours de validation par nos équipes réseau et son déploiement est prévu le 18 novembre.\n\nEn attendant, vous pouvez rétablir la connexion en appliquant le contournement disponible ici : https://confluence.example.com/pages/viewpage.action?pageId=8912\n\nNous reviendrons vers vous dès la mise en service du correctif.\n\nLe centre de services.",
    "openTickets": 17,
    "meToo": 23,
    "source": "model"
  }
}
```

---

### 2.7 `confirm-membership`
- **Verbe** : `UPDATE`
- **Description** : Confirme ou rejette manuellement le rattachement d'un ticket à un problème, avec mise à jour immédiate de l'addition.
- **Entrées** :
  - `issueKey` (string, requis) : Clé du ticket concerné (ex. `"SUP-104"`).
  - `problemKey` (string, requis) : Clé du ticket de problème (ex. `"PRB-12"`).
  - `confirmed` (boolean, requis) : `true` pour valider et créer le lien Jira, `false` pour rejeter et exclure le ticket du problème.
- **Retour** : Statut de l'opération et nouvelle addition recalculée.

```json
// Exemple d'appel JSON
{
  "issueKey": "SUP-104",
  "problemKey": "PRB-12",
  "confirmed": true
}
```

```json
// Exemple de réponse JSON
{
  "ok": true,
  "data": {
    "issueKey": "SUP-104",
    "problemKey": "PRB-12",
    "attached": true,
    "action": "confirmed",
    "updatedBill": {
      "tickets": 42,
      "hours": 62.5,
      "people": 39
    }
  }
}
```

---

## 3. Connexion depuis un client MCP externe

Le module `rovo:mcp` (clé `problemes-caches-mcp`) déclare les 7 outils ci-dessus au serveur MCP hébergé par Atlassian pour l'app installée :

```yaml
# manifest.yml — extrait
rovo:mcp:
  - key: problemes-caches-mcp
    name: Problèmes cachés
    tools:
      - match-known-problem
      - list-top-problems
      - get-problem
      - list-suspects
      - get-surges
      - draft-customer-update
      - confirm-membership
```

Principe de branchement :

1. **Serveur distant hébergé** : c'est la plateforme Atlassian qui expose les outils de l'app en tant que serveur MCP distant — l'app elle-même n'ouvre aucun port ni aucune sortie réseau (§17).
2. **Authentification** : le client MCP s'authentifie auprès d'Atlassian (OAuth) avec un compte autorisé sur le site où l'app est installée ; les appels s'exécutent ensuite avec les scopes déclarés dans le manifeste (`read:jira-work`, `read:servicedesk-request`, …).
3. **Client** : tout client compatible MCP (Rovo Chat, IDE ou assistant prenant en charge les serveurs MCP distants) ajoute l'URL du serveur MCP de l'app et découvre les 7 outils avec leur schéma d'entrée strict (celui du bloc `action:` du manifeste).

> **À valider** : la procédure exacte de connexion d'un client tiers (URL du serveur, flux OAuth) dépend de la documentation Atlassian du module [`rovo:mcp`](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) au moment de la soumission ; elle sera complétée ici après test sur le site de démonstration (§16). Rien dans le dépôt ne présume d'un paquet passerelle tiers.
