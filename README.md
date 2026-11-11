# Problèmes cachés dans les tickets

> Regroupe les incidents et demandes JSM qui ont la même origine, chiffre ce que chaque problème récurrent coûte, tient un seul ticket de problème à jour, reconnaît les nouveaux tickets dès leur arrivée et prévient les clients avant même qu'ils n'écrivent.

**Atlassian Forge · Codegeist 2026** · Catégorie *Apps for Business Teams* (Support & IT).  
Bonus visés : Teamwork Graph, Agents Rovo, MCP, Marketplace.

---

## 1. Ce que fait l'app

Un centre de services résout des tickets un par un. Cent tickets résolus peuvent être cent fois la même panne. Chaque agent voit passer 3 ou 4 cas, applique le contournement, et personne ne voit les 100.

**Problèmes cachés** apporte :
- **L'addition chiffrée** : tickets, heures de support réelles (ou interventions × durée moyenne réglable), personnes touchées, organisations, réouvertures.
- **Un seul ticket de problème** : créé à la confirmation d'une grappe, enrichi d'une synthèse quotidienne (jamais un commentaire par ticket).
- **Reconnaissance à l'arrivée** : en moins de 30 secondes, le panneau de l'agent affiche le problème connu, le contournement validé et prépare la réponse.
- **Portail et « Moi aussi »** : bandeau de problème connu ; le client clique *Moi aussi*, est comptabilisé sans ouvrir de ticket, et prévenu à la correction.
- **Détection des flambées** : alerte quand le rythme dépasse 3× la normale sur 2 heures (incident majeur en train de naître).
- **Surveillance après correction** : 14 jours sans nouveau ticket pour passer à *Vérifié* ; réouverture automatique en *Régression* sinon.
- **Agent Rovo & MCP** : 7 actions (`match-known-problem`, `list-top-problems`, `get-problem`, `list-suspects`, `get-surges`, `draft-customer-update`, `confirm-membership`) interrogeables par tout agent IA ou depuis Cursor/Claude.

---

## 2. Architecture Forge

- **Forge SQL** : stockage structuré sans réseau externe (MySQL compatible InnoDB UTF-8).
- **Forge LLM** : modèle Claude hébergé par Atlassian, température minimale, cache par empreinte SHA-256 (aucun texte re-payé).
- **Teamwork Graph** : enrichissement des indices certains (services, assets d'inventaire, organisations).
- **Modules UI** :
  - `jira:issuePanel` (panneau agent sur le ticket)
  - `jiraServiceManagement:queuePage` (page Problèmes dans les files JSM)
  - `jiraServiceManagement:portalSubheader` (bandeau portail)
  - `jiraServiceManagement:portalRequestDetailPanel` (détail vu par le client)
  - `jira:issueContext` (encart sur le ticket de dev : « ce bug coûte 61 h / mois »)
  - `jira:projectSettingsPage` (seuils, durée moyenne, vocabulaire)

---

## 3. Installation & vérification

```bash
# Dépendances
npm ci

# Typage strict & tests du domaine
npm run check

# Garde Couche 0 (< 500 lignes / fichier, < 50 lignes / fonction, manifest valide)
npm run limits
node tools/validate_manifest.mjs manifest.yml
```

---

## 4. Documentation

- [Cahier des charges complet](docs/CAHIER-DES-CHARGES.md)
- [Architecture & flux](docs/ARCHITECTURE.md)
- [Agent Rovo & outils MCP](docs/ROVO-MCP.md)
- [Instructions pour les juges](docs/JUGES.md)
- [Scénario de la vidéo démo](docs/VIDEO.md)
