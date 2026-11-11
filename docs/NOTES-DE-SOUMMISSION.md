# Submission Notes — Hidden Problems in Tickets

> **Atlassian Codegeist 2026** · Hackathon Submission  
> Category: **Apps for Business Teams** (Support & IT)  
> Target Bonuses: **Teamwork Graph**, **Rovo Agents**, **MCP**, **Marketplace**  
> Submission Deadline: **December 22, 2026**

---

## 1. App Name & One-Line Pitch (§1)

- **App Name**: **Hidden Problems in Tickets** (*Problèmes cachés dans les tickets*)
- **Category**: **Apps for Business Teams**
- **One-Line Pitch (§1)**:  
  *The app groups Jira Service Management incidents that share the same root cause, prices what each recurring problem costs, maintains a single problem ticket, recognizes new tickets as they arrive, and alerts customers on the portal before they even write.*

---

## 2. The Problem We Solve (§2)

A service desk solves tickets one by one. That is its job, and that is its limit: a hundred resolved tickets can be a hundred times the exact same problem.

Each agent sees three or four cases and applies a quick workaround. Nobody sees the hundred. The consequences:
1. **The cost remains invisible.** "The VPN dropping after workstation updates" appears in no dashboard, yet it consumed 60 hours of support this month.
2. **The root cause is never fixed.** The engineering team only receives an isolated bug ticket once in a while, without knowing the true scale.
3. **Customers repeat themselves.** Everyone opens a ticket for an issue already known to the IT team, waiting for an answer ten others already received.
4. **Agents reinvent solutions.** The workaround discovered by one agent never reaches the rest of the team.

Problem management exists in ITIL, but in practice it depends on an individual "noticing" a pattern. **Hidden Problems** makes pattern detection systematic, continuous, and assigns it an indisputable price.

---

## 3. What Is Truly Novel (§23)

Existing tools provide generic similarity search or incident linking. **Hidden Problems** introduces three unique concepts:

1. **The Priced Support Bill (§9, §17)**: We don't just count tickets; we price the problem in support hours (using actual logged time or agent touches × configurable average duration), affected people (reporters + zero-ticket "Me too" signals), affected organizations, reopenings, and SLA breaches. Every figure shows its exact calculation method.
2. **A Single, Self-Maintaining Problem Ticket (§10)**: When a cluster is confirmed, the app creates one problem issue, links all member tickets, and maintains a daily summary in a Jira property and comment. It never pollutes the issue with a comment per attached ticket.
3. **The Zero-Ticket "Me Too" Button (§7.3, PC-16)**: Customers see a portal banner announcing known problems on the services they use. Instead of creating a duplicate ticket, they click "Me too". They are counted among affected users and automatically notified when the fix is delivered.

---

## 4. Target Hackathon Bonuses & Where to See Them in Code

| Hackathon Bonus | Where to See It in Code | Implementation Highlights |
|---|---|---|
| **Teamwork Graph** | [src/platform/graph.ts](../src/platform/graph.ts) | Consumes Atlassian Teamwork Graph GraphQL API on behalf of the user (`asUser().requestTeamworkGraph`). Enriches hard clues with linked Compass components/services, parent incidents, and inventory assets (Assets/Insight). Results are cached in memory. |
| **Rovo Agents** | [manifest.yml](../manifest.yml) (`rovo:agent`) | Declares the "Problèmes cachés" Rovo agent (`problemes-caches-agent`) with 5 turnkey conversation starters. System prompt instructs the agent to query tools and explain costs without guessing. |
| **Model Context Protocol (MCP)** | [manifest.yml](../manifest.yml) (`rovo:mcp`, `action`), [src/mcp/result.ts](../src/mcp/result.ts) | Exposes 7 typed actions (`match-known-problem`, `list-top-problems`, `get-problem`, `list-suspects`, `get-surges`, `draft-customer-update`, `confirm-membership`) callable by Rovo, Cursor, Claude Desktop, or autonomous agents. Includes free-text matching for conversational front-ends (§12). |
| **Marketplace Readiness** | [manifest.yml](../manifest.yml), [src/platform/db/schema.ts](../src/platform/db/schema.ts) | Fully compliant with Atlassian Cloud security: no data egress (zero external network calls), zero storage of full ticket text (privacy compliance, §17), strict Forge SQL multi-tenant isolation, clean licensing declaration block. |

---

## 5. Scope Delivered for December 22, 2026 (§6)

| Scope Tier | Features Delivered | Status |
|---|---|---|
| **MVP (Delivered)** | - Hard clue extraction without LLM ([src/core/signature.ts](../src/core/signature.ts))<br>- Triplets `(system, symptom, trigger)` via Forge LLM Claude<br>- Controlled vocabulary with merge/split without recomputation ([src/core/vocabulary.ts](../src/core/vocabulary.ts))<br>- Cluster detection on 30-day sliding window ([src/core/cluster.ts](../src/core/cluster.ts))<br>- Single problem issue lifecycle & daily summary ([src/platform/jira.ts](../src/platform/jira.ts))<br>- 8-line support bill with explicit calculation method ([src/core/bill.ts](../src/core/bill.ts))<br>- Under-30s recognition at ticket arrival (PC-07)<br>- Agent issue panel, JSM queue page, settings page ([src/ui/](../src/ui/))<br>- Rovo agent, 7 MCP actions, deterministic 60-day sample dataset | **Complete** |
| **V1 (Included in Code)** | - Surge detection (3× baseline over 2 hours, [src/core/surge.ts](../src/core/surge.ts))<br>- Portal known problem banner ([src/ui/portal-subheader.tsx](../src/ui/portal-subheader.tsx))<br>- Portal "Me too" button ([src/ui/components/PortalMeToo.tsx](../src/ui/components/PortalMeToo.tsx))<br>- Post-fix 14-day watch with automatic regression detection ([src/core/lifecycle.ts](../src/core/lifecycle.ts))<br>- Non-automated customer update draft ([src/platform/llm.ts](../src/platform/llm.ts))<br>- Developer issue context panel ("What this bug costs", [src/ui/issue-context.tsx](../src/ui/issue-context.tsx)) | **Complete** |
| **Vision (Post-Hackathon)** | - Machine-learning forecasting ("at this rate, 110 h next month")<br>- Automatic Confluence knowledge base article drafted from resolutions<br>- Multi-service desk cross-organizational problem sharing | Future Roadmap |

---

## 6. Deliberate Technical Limits & Boundaries

To ensure rock-solid production safety and privacy compliance (§17):
1. **Never send automated customer messages**: The app drafts answers and customer updates; an agent must review and send them.
2. **Never rank individual agents**: The unit of measurement is the problem or the service, never the employee.
3. **No full ticket text stored**: Forge SQL only stores the 3-item signature, hard clues, and a truncated 512-character summary. Full descriptions never touch the database.
4. **Deterministic fallback over hallucinations**: If Forge LLM times out or returns malformed JSON, deterministic pattern matching and hard clues take over immediately.
