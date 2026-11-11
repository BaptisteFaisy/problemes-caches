# La méthode — Problèmes cachés dans les tickets

> **Codegeist 2026** · Catégorie **Apps for Business Teams**  
> Référence du cahier des charges : **§5, §8, §9, §16, §17, §18**

Ce document explique *comment* l'app travaille : ce qu'elle regarde, ce qu'elle montre, ce qu'elle refuse de faire. La règle qui traverse tout le produit tient en une phrase du cahier (§17) : **chaque rattachement affiche sa base et sa justification ; chaque chiffre affiche sa méthode.**

---

## 1. La signature : lisible et corrigeable par un humain (§8.1, §8.2)

Le regroupement ne repose pas sur une distance opaque mais sur un **triplet explicite** : **système · symptôme · déclencheur** (par exemple `VPN · déconnexion · après mise à jour du poste`).

La signature est obtenue en deux temps :

| Étape | Outil | Sortie | Pourquoi |
|---|---|---|---|
| 1. Indices certains, **sans modèle** | [src/core/signature.ts](../src/core/signature.ts) — `extractHardClues` | Type de demande, service, composant, codes d'erreur repérés par motif (`ERR-…`, `0x…`, `HTTP 4xx/5xx`, `ORA-…`, exceptions Java/.NET), produit, version, système d'exploitation, objets d'inventaire | Ces faits ne dépendent pas du modèle : ils sont reproductibles et opposables. Chaque liste est bornée à 10 entrées (`MAX_CLUE_ITEMS`). |
| 2. Signature, **par modèle** | [src/platform/llm.ts](../src/platform/llm.ts) — `extractSignature` | Triplet `(system, symptom, trigger)` | Le prompt ([src/platform/field.ts](../src/platform/field.ts) — `buildSignaturePrompt`) impose de **choisir d'abord dans le vocabulaire connu du projet** ; un terme nouveau n'est créé que si aucun ne convient. Température 0. |

Deux garde-fous rendent l'opération auditable :

- **Cache par empreinte** : la clé de cache est l'empreinte SHA-256 du texte normalisé (`sourceHash`) ; un ticket n'est soumis au modèle **qu'une fois**, sauf modification de sa description (§8.2 étape 3). L'empreinte est conservée en base (`signature.source_hash`).
- **Repli déterministe** : si le modèle échoue ou renvoie un JSON illisible, `fallbackSignature` reconstruit une signature à partir du vocabulaire et des indices certains. L'app ne reste jamais bloquée, et le ticket est marqué **indéterminé** plutôt que deviné (`isUndetermined`, texte utile < 12 caractères).

**Pourquoi pas des vecteurs ?** Le modèle Forge répond en texte, il ne fournit pas de vecteurs ; la base Forge SQL ne documente pas de recherche vectorielle (§8.1, §16). Une distance cosinus ne dit pas *pourquoi* deux tickets sont rapprochés ; le triplet, si. Et surtout, le triplet se corrige : on renomme un terme, et le regroupement suit.

---

## 2. Le vocabulaire tenu (§8.3)

Les systèmes et les symptômes forment un vocabulaire **par projet**, stocké dans la table `term`. Les opérations offertes par l'écran de réglages ([src/ui/components/SettingsVocabulary.tsx](../src/ui/components/SettingsVocabulary.tsx)) sont toutes « sans recalcul » :

| Geste | Fonction | Effet |
|---|---|---|
| **Renommer** | `renamePlan` ([src/core/vocabulary.ts](../src/core/vocabulary.ts)) | L'ancien libellé devient un **alias** du terme ; les tickets déjà rattachés ne bougent pas. |
| **Fusionner** (« accès distant » et « VPN ») | `planMerge` + `followMerge` | Les termes fusionnés pointent vers le terme conservé (`merged_into`) ; leurs alias et leurs tickets sont regroupés **sans rien recalculer**. La résolution de libellé suit la chaîne de fusions, avec détection des cycles. |
| **Scinder** (un symptôme, deux causes) | `planSplit` | Un terme neuf est créé ; l'ancien est conservé. |
| **Terme neuf** | `suggestNewTerm` | Proposé uniquement quand aucun terme connu ne convient (§8.2 étape 2). |

La comparaison des libellés ignore casse, accents et espaces (`normalizeLabel`) ; la résolution d'un libellé passe par le libellé exact d'abord, puis par les alias (`resolveTermId`) : une même demande formulée autrement retombe sur le même terme.

---

## 3. L'échelle de rattachement en trois marches (§8.4)

L'ordre est **strict** et implémenté dans [src/core/matching.ts](../src/core/matching.ts) — `matchTicket` / `rankCandidates` :

| Marche | Condition | Confiance | Base | Traitement |
|---|---|---|---|---|
| 1 | **Même signature complète** qu'un problème ouvert | `high` | `rule` | Rattachement **proposé**, fait d'office et **réversible**. |
| 2 | **Même système, symptôme proche** : le modèle compare le ticket à la fiche du problème et répond oui/non avec une phrase | `medium` | `similarity` | Rattachement **proposé à l'agent**, jamais fait d'office. |
| 3 | **Indice certain partagé** (même code d'erreur, même objet d'inventaire) | `high` | `rule` | Rattachement proposé, quel que soit le texte. |

**Base et justification sont toujours affichées** (§17) : `membership.basis` (règle / rapprochement / humain) et `membership.rationale` (la phrase qui justifie) sont stockés et affichés dans le panneau (`panel.justification` : « Why: … »). Le panneau propose aussi les **autres** problèmes plausibles (`panel.alternatives`) — un ticket qui décrit deux problèmes est rattaché au plus probable, l'autre est proposé (§18).

Deux garde-fous :
- **Jamais d'office à confiance moyenne** : `isAutoAttach` n'autorise l'automatisation que si la confiance est `high` **et** que la signature n'est pas indéterminée.
- **Toujours réversible** : l'agent peut retirer un ticket ; l'addition est recalculée et le rejet est mémorisé (§18).

---

## 4. L'addition : le chiffre et sa méthode (§9, §17)

L'addition est calculée par [src/core/bill.ts](../src/core/bill.ts) — `computeBill`, sur deux périodes (**30 j** et **90 j**) :

| Poste | Calcul | Priorité |
|---|---|---|
| Tickets | Nombre de tickets rattachés | M |
| Heures de support | **Temps saisi s'il existe**, sinon interventions × durée moyenne réglable (10 min par défaut) | M |
| Personnes touchées | Demandeurs distincts **+** les « moi aussi », sans double compte | M |
| Organisations touchées | Organisations clientes distinctes | S |
| Engagements de délai rompus | Tickets dont un délai de service a été dépassé | S |
| Réouvertures | Tickets rouverts après résolution | S |
| Escalades | Tickets transmis à une autre équipe | S |
| « Moi aussi » | Signalements du portail | S |

Trois règles de méthode, toutes visibles à l'écran :

1. **La méthode accompagne le chiffre** : `hoursMethod` vaut `logged`, `touches` ou `mixed`, et l'interface l'affiche en toutes lettres (« Logged time where available, counted touches otherwise », `problem.hours.mixed`). La durée moyenne utilisée est affichée avec le chiffre.
2. **Les éléments masqués comptent** : un ticket à visibilité restreinte pèse dans l'addition (PC-13) mais n'est jamais listé ; le lecteur voit « N hidden item(s) — you cannot open them ».
3. **La fusion ne double pas** : `mergeBills` additionne les compteurs et prend le **maximum** des personnes (borne basse de l'ensemble réel) ; la méthode passe à `mixed`, car après fusion on ne sait plus quel ticket portait du temps saisi — afficher « temps saisi » serait mentir (§17).

Le chiffre est reproductible : chaque poste se déplie jusqu'aux tickets (`problem.drilldown`), et la tendance compare les deux dernières périodes (`computeTrend`, sur le nombre de tickets, seul poste comparable d'une période à l'autre).

---

## 5. Cycle de vie et surveillance (§5, §7.4, §7.5)

Les états et les transitions sont dans [src/core/lifecycle.ts](../src/core/lifecycle.ts) — table `TRANSITIONS`, copiée du §5 et rien d'autre :

```
Suspect ──confirm──▶ Confirmé ──set-cause──▶ Cause connue
        ──publish-workaround──▶ Contournement publié ──deliver-fix──▶ Corrigé
        ──watch-elapsed / close──▶ Vérifié
        └─new-ticket──▶ Régression ──confirm──▶ Confirmé
```

- **Susppect** : une grappe a franchi un seuil ; un humain confirme, scinde ou rejette (§8.5, seuil par défaut : 5 tickets, 10 h ou 10 personnes sur 30 jours, réglable).
- **Surveillance** : à la livraison du correctif, `startWatching` ouvre une fenêtre de **14 jours** (`watchDays`, réglable). Sans nouveau ticket, `watch-elapsed` mène à **Vérifié** ; avec un nouveau ticket postérieur au correctif, `detectRegression` bascule en **Régression** et le problème revient à Confirmé (§7.5).
- **La demande récurrente normale** (réinitialisation de mot de passe) n'est pas un problème : `classifyRecurring` la classe à part, « demandes récurrentes », candidate à l'automatisation plutôt qu'à la correction (§18).
- **La flambée** (`src/core/surge.ts`) : un rythme de tickets sur 2 h qui dépasse **3×** la moyenne habituelle déclenche une alerte — probablement un incident majeur en train de naître (§8.6). Une flambée **attendue** (campagne interne) est exclue des alertes.

---

## 6. Les cas limites traités (§18)

| Cas limite | Traitement dans le code |
|---|---|
| Ticket décrivant **deux problèmes** | Rattachement au plus probable, l'autre **proposé** dans le panneau (`rankCandidates` → `panel.alternatives`). |
| Ticket **vide ou d'une ligne** (« ça ne marche pas ») | Signature **indéterminée** (`isUndetermined`), jamais regroupé d'office ; le panneau l'explique. |
| Ticket dans **une autre langue** que le vocabulaire | La signature est exprimée dans la **langue du projet** (`signature.language`, prompt : « Write the three values in the project language »). |
| **Même symptôme, deux causes** | Scission : `planSplit` au niveau du vocabulaire, `splitCluster` au niveau de la grappe ; le déclencheur distingue ensuite. |
| **Deux problèmes qui n'en font qu'un** | Fusion : `mergeProblems`, additions fusionnées sans double compte (`mergeBills`). |
| **Demande répétée mais normale** | Classée « demandes récurrentes » (`classifyRecurring`), à part des défauts. |
| **Flambée due à une campagne interne** | Marquée « attendue » par un humain (`surge.expected`), exclue des alertes. |
| **Problème corrigé pour une partie des utilisateurs** | Surveillance par service ou par version — prévu par le §18 ; **encore à implémenter** (le suivi est aujourd'hui global au problème, `watchUntil`). |
| **Ticket rattaché à tort puis retiré** | L'addition est recalculée, le rejet est mémorisé (`membership.rejected`). |
| **« Moi aussi » de quelqu'un qui a aussi un ticket** | Compté **une seule fois** : l'identité est dédupliquée dans `countPeople`. |

---

## 7. Ce que l'app refuse de faire

| Refus | Pourquoi | Où c'est garanti |
|---|---|---|
| **Répondre automatiquement à un client** | Hors périmètre (§6) : l'app prépare, un humain envoie. | `draftAnswer` / `draftCustomerUpdate` ne produisent qu'un **brouillon** ; rien n'est publié. Le panneau l'affiche : « Nothing is sent to a customer without your review. » |
| **Classer les agents de support** | §17 : l'unité est le problème ou le projet, jamais la personne. | Le prompt de l'agent Rovo l'interdit explicitement ; aucun indicateur par personne n'existe dans le modèle de données. |
| **Écrire un commentaire par ticket rattaché** | §10 : discrétion — une synthèse par jour. | `publishDailySummary` : une propriété Jira + **un** commentaire par jour, gardé par `lastPublishedOn`. |
| **Rattacher d'office à confiance moyenne, ou une signature indéterminée** | §8.4 / §18. | `isAutoAttach`. |
| **Envoyer un message groupé sans validation** | §17 : « Aucun message à un client sans validation humaine ». | Le brouillon attend un clic d'agent (`problem.draftReady`). |
| **Conserver le texte intégral des tickets** | §17 : vie privée. | `ticket_fact.summary` est borné à 512 caractères ; le corps du ticket n'est jamais écrit en base. |
| **Sortir des données de l'environnement Atlassian** | §17 : aucune sortie réseau. | Toutes les lectures passent par `requestJira` / `asUser()` ([src/platform/jira.ts](../src/platform/jira.ts), [src/platform/graph.ts](../src/platform/graph.ts)) ; le manifeste ne déclare aucun egress. |

---

## 8. La règle de lisibilité, en une phrase

> Une personne doit pouvoir contester n'importe quel chiffre et n'importe quel rattachement — et trouver, dans l'écran, la phrase qui l'explique.

C'est pourquoi le triplet est lisible, la base du rattachement est affichée, la méthode des heures accompagne le nombre, et le ticket unique est **tenu à jour** plutôt que commenter ticket par ticket.
