# Instructions for Judges — Hidden Problems in Tickets

> **Codegeist 2026** · Category: **Apps for Business Teams** (Support & IT)  
> Target Bonuses: **Teamwork Graph**, **Rovo Agents**, **MCP**, **Marketplace**  
> Testing time: **under 10 minutes**

This walkthrough allows judges to evaluate the app quickly on any Jira Service Management (JSM) site. It covers both entry paths defined in §21 of the specification: the one-click sample dataset and live ticket recognition.

---

## 1. Quick Orientation

The app groups recurring incidents that share the same root cause, prices their cumulative support cost, maintains a single problem ticket, auto-recognizes incoming requests, and offers a portal banner with a zero-ticket "Me too" button (§1, §2).

### Two Evaluation Paths (§21)

1. **Option A — 1-click sample dataset (60 days)**: immediate exploration of all screens, the Rovo agent, and MCP actions (§21.1).
2. **Option B — Live ticket test (under 30 seconds)**: submit a portal request using our copy-paste scenarios and watch the agent panel pick it up (§21.2, PC-07).

---

## 2. Option A — Load the 60-Day Sample Dataset (2 minutes)

1. Open your JSM service project (e.g. `SUP`).
2. Go to **Project settings** → **Hidden problems** (screen 5, `jira:projectSettingsPage` in [manifest.yml](../manifest.yml)).
3. Scroll down to the **Sample set** card and click **Load 60 days of sample tickets** (`settings.loadSample` in [src/ui/i18n/en.ts](../src/ui/i18n/en.ts)).
4. 120 tickets across 60 days are injected into Forge SQL (§20). Three hidden problems and one recurring request cluster are instantly computed:
   - **Problem 1**: VPN disconnects after workstation OS update (43 tickets, 61 hours, 38 people).
   - **Problem 2**: Floor 3 badge/printer spooler timeout (`0x80070005`, 24 tickets).
   - **Problem 3**: Duplicate monthly invoice notification (`ERR-4001`, 18 tickets).
   - **Recurring service request**: Self-service password resets (grouped apart as an automation candidate, §18).

---

## 3. Screens to Inspect in Order (§13)

Follow this order to walk through the complete problem management lifecycle:

| Step | Screen | Forge Module | What to Look For |
|---|---|---|---|
| 1 | **Queue Page: "Problems"** | `jiraServiceManagement:queuePage` | Top suspect cluster at the top, cost breakdown, surge alert banner, recurring request section ([src/ui/queue-page.tsx](../src/ui/queue-page.tsx)). |
| 2 | **Suspect drilldown** | Queue modal | Review the 43 grouped tickets, see the rationale per ticket, remove 2 false positives, click **Confirm and create problem ticket** (§7.1). |
| 3 | **Problem Issue Panel** | `jira:issuePanel` | Open the generated `PRB` issue: cumulative bill (tickets, hours, people), ticket curve per day, cause/workaround fields, portal toggle ([src/ui/issue-panel.tsx](../src/ui/issue-panel.tsx)). |
| 4 | **Agent Panel on an incident** | `jira:issuePanel` | Open any ticket from the group: recognized problem banner, confidence level, validated workaround, one-click "Attach and prepare answer" button (§7.2). |
| 5 | **Developer Encart** | `jira:issueContext` | Open the bug linked to the fix: "This bug costs 61 h of support per month for 38 people" (§13.4, [src/ui/issue-context.tsx](../src/ui/issue-context.tsx)). |
| 6 | **Customer Portal Banner** | `jiraServiceManagement:portalSubheader` | Open the customer portal: banner displaying known issue on remote access + "Me too" button (§7.3, [src/ui/portal-subheader.tsx](../src/ui/portal-subheader.tsx)). |
| 7 | **Customer Request Detail** | `jiraServiceManagement:portalRequestDetailPanel` | Open the submitted ticket as customer: shows attached problem status ("Fix planned on 18th") without exposing internal queues ([src/ui/portal-request-detail.tsx](../src/ui/portal-request-detail.tsx)). |

---

## 4. Option B — Live Ticket Recognition (under 30 s, PC-07)

Submit any of the following 5 realistic texts in the customer portal or via Jira issue creation. Then open the ticket as an agent: within 30 seconds, the agent panel flags the match.

### Text 1 · VPN / Remote Access (Matches Problem 1)
- **French**: `Mon accès distant coupe toutes les dix minutes depuis la mise à jour de mon poste ce matin.`
- **English**: `My remote access drops every ten minutes since the workstation update this morning.`
- **Expected match**: High confidence (`same-signature`), links to VPN disconnects, proposes workaround to reinstall VPN profile (§7.2, [src/core/matching.ts](../src/core/matching.ts)).

### Text 2 · VPN with alternative wording (Matches Problem 1 via similarity)
- **French**: `Impossible de maintenir la passerelle VPN connectée, déconnexion sauvage après le redémarrage système.`
- **English**: `Unable to keep the VPN gateway tunnel alive, drops continuously after system reboot.`
- **Expected match**: Medium confidence (`similar-symptom`), Forge Claude model rationale displayed in the panel (§8.4).

### Text 3 · Floor 3 Printer / Spooler (Matches Problem 2)
- **French**: `L'imprimante réseau du 3e étage refuse d'imprimer avec le code d'erreur 0x80070005.`
- **English**: `Network printer on the 3rd floor fails to print with error code 0x80070005.`
- **Expected match**: High confidence (`shared-clue` via error code `0x80070005`, [src/core/signature.ts](../src/core/signature.ts)).

### Text 4 · Duplicate Billing Invoice (Matches Problem 3)
- **French**: `Nous avons reçu la facture de novembre en double avec la référence ERR-4001.`
- **English**: `We received the November invoice twice in our customer portal with code ERR-4001.`
- **Expected match**: High confidence (`shared-clue` via code `ERR-4001`).

### Text 5 · Unrelated Request (Negative Test · §19 point 5)
- **French**: `Bonjour, pouvez-vous commander une souris ergonomique pour mon poste ?`
- **English**: `Hello, could you order an ergonomic vertical mouse for my desk?`
- **Expected match**: `None` — no auto-attach, no false positive cluster.

---

## 5. Rovo Agent & MCP Queries (§12)

Open Atlassian Rovo and select the **Hidden Problems** agent (`problemes-caches-agent` in [manifest.yml](../manifest.yml)). Test the 5 conversation starters:

1. *"Quels problèmes nous coûtent le plus ce mois-ci ?"* / *"Which problems cost us the most this month?"*  
   → Calls `list-top-problems`, returns ranked table with hours, tickets, people, and trend.
2. *"Ce ticket ressemble-t-il à un problème connu ?"* / *"Does this ticket match a known problem?"* (provide e.g. `SUP-104` or paste Text 1)  
   → Calls `match-known-problem`, returns matched problem, confidence, and validated workaround.
3. *"Qu'est-ce qui monte depuis la semaine dernière ?"* / *"What is surging since last week?"*  
   → Calls `get-surges`, reports active spikes exceeding 3× baseline (§8.6).
4. *"Rédige le message pour les personnes touchées par PRB-12."* / *"Draft the customer update for PRB-12."*  
   → Calls `draft-customer-update`, generates transparent draft without auto-sending (§7.4, §17).
5. *"Combien a coûté le problème d'impression du 3e étage ?"* / *"How much did the 3rd floor printer problem cost?"*  
   → Calls `get-problem`, breaks down bill: logged hours or agent touches × average minutes.

---

## 6. Verification Checklist (The 11 Acceptance Points · §19)

| # | Acceptance Point (§19) | Where to Verify | Expected Result |
|---|---|---|---|
| 1 | 10 tickets with distinct wording share signature | Database / Queue Page | Same `(system, symptom, trigger)` tuple or matched with rationale ([src/core/signature.ts](../src/core/signature.ts)). |
| 2 | Cluster over threshold appears in suspects | Queue Page → Suspects tab | Cluster visible with cost badge (e.g. 43 tickets, 61 h, 38 people). |
| 3 | Confirmation creates 1 problem issue and links all tickets | Jira Issue / Queue Page | Single `PRB` issue created; Jira issue links (`Relates`) created to all 41 tickets. |
| 4 | 11th ticket recognized in < 30 s with workaround | Agent Issue Panel | Panel loads match in < 30 s (PC-07); displays validated procedure. |
| 5 | Unrelated ticket is never attached | Agent Issue Panel | Displays "No known problem matches this ticket" ([src/core/matching.ts](../src/core/matching.ts)). |
| 6 | Detaching a ticket decreases the bill immediately | Agent Panel → "Remove from problem" | Support hours and ticket count decrease by exact ticket contribution (§18). |
| 7 | Term merge regroups tickets without recomputation | Settings → Vocabulary | Merging "Remote access" into "VPN" regroups tickets instantly ([src/core/vocabulary.ts](../src/core/vocabulary.ts)). |
| 8 | Fixed problem receiving tickets switches to Regression | Problem panel / State machine | New ticket during 14-day watch sets state to `regression` ([src/core/lifecycle.ts](../src/core/lifecycle.ts)). |
| 9 | Restricted visibility ticket displays masked notice | Agent Panel | User without issue permissions sees "1 hidden item"; bill total remains exact (PC-13). |
| 10 | Free-text `match-known-problem` matches panel verdict | Rovo / MCP tool | Calling `match-known-problem` with raw text outputs identical match (§12). |
| 11 | No automated customer messaging without human click | Entire application | Drafts are generated; customer comments require explicit agent review (§6, §17). |

---

## 7. Clean Up

To reset the demo environment:
- Go to **Project settings** → **Hidden problems** → **Sample set**.
- Click **Remove the sample set** (`settings.clearSample`).
- Forge SQL tables are wiped clean, ready for another test run.
