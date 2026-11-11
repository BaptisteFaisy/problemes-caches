# Contrats — qui écrit quoi, avec quelles signatures

Ce document est le **contrat gelé** du dépôt. Chaque lot (WP) n'écrit que dans
ses fichiers ; les signatures ci-dessous sont publiques et ne changent pas sans
mettre ce fichier à jour dans la même PR.

Règles dures (vérifiées par `couche0`) :

- fichier < 500 lignes, fonction < 50 lignes ;
- `src/core/` est **pur** : aucun import `@forge/*`, aucune I/O, aucune horloge
  implicite (l'heure est un paramètre `now: string` ISO) ;
- zéro duplication : un helper existe une fois, tout le monde l'importe ;
- tests en `node --test`, fichiers `*.test.ts` à côté du module testé ;
- commentaires en français, avec renvoi au paragraphe du cahier (`§8.4`, `PC-07`).

## Déjà écrits (ne pas modifier sans raison)

| Fichier | Rôle |
|---|---|
| `src/core/types.ts` | Tous les types du domaine + `signatureKey`, `normalizeTrigger`, `defaultSettings` |
| `src/core/constants.ts` | Seuils, fenêtres, listes d'états (§8, §9) |
| `src/core/time.ts` | `parseIso`, `diffDays`, `addDays`, `weekKey`, `clamp`, `round2`, … |
| `src/platform/db/schema.ts` | DDL des 11 tables (§15) |
| `src/platform/db/query.ts` | `selectRows`, `runStatement`, `insertRows`, `replaceRows`, `rawSql` |
| `src/platform/db/rows.ts` | Convertisseurs SQL ↔ domaine (`toBool`, `toIso`, `toDbDate`, `parseJson`, …) |
| `src/platform/db/index.ts` | `ensureSchema`, `isSchemaReady` |
| `src/mcp/result.ts` | Enveloppe `ActionEnvelope`, `run`, `requireText`, `optionalNumber`, … |
| `src/resolvers/index.ts` | Table `RESOLVERS` (clés = celles de `src/ui/api.ts`) |
| `src/ui/api.ts` | Passerelle typée UI ↔ resolvers + formes de réponse |
| `src/ui/i18n/*` | `t(locale, key, vars)`, dictionnaires `en`/`fr` complets |
| `src/ui/format.ts` | `formatInt`, `formatHours`, `stateLabel`, `confidenceLabel`, `basisLabel`, `hoursMethodLabel`, `formatDate` |
| `src/ui/async.ts`, `src/ui/context.ts` | `useResolver`, `useScreenContext` |
| `src/ui/components/{AsyncView,ErrorState,LoadingState,ScreenShell}.tsx` | Briques d'écran partagées |
| `manifest.yml` | Modules, actions, agent Rovo, MCP |

---

## WP-A · `src/core/signature.ts` (+ `.test.ts`)

Extraction des indices certains et de la signature (§8.2), **pur**.

```ts
export function extractHardClues(input: ClueInput): HardClues;
export function sourceHash(text: string): string;           // sha256 hex, stable
export function isUndetermined(sig: {systemId:string; symptomId:string; triggerText:string}): boolean;
export function buildSignature(input: SignatureInput, now: string): TicketSignature;
export interface ClueInput { requestType?: string|null; service?: string|null; component?: string|null;
  product?: string|null; version?: string|null; os?: string|null; organization?: string|null;
  assets?: readonly string[]; text: string }
export interface SignatureInput { issueId: string; systemId: string; symptomId: string;
  triggerText: string; hardClues: HardClues; sourceText: string; language?: string|null }
```

`extractHardClues` repère les codes d'erreur par motif (au moins : `ERR-1234`,
`0x80070005`, `HTTP 5xx/4xx`, `ORA-#####`, exceptions Java `.NET`) et borne
chaque liste à 10 entrées.

## WP-B · `src/core/vocabulary.ts` (+ `.test.ts`)

Vocabulaire tenu (§8.3), **pur** : aucune lecture SQL ici.

```ts
export function resolveTermId(vocab: Vocabulary, kind: TermKind, label: string): string | null;
export function followMerge(terms: readonly Term[], id: string): string;   // chaîne de fusions
export function planMerge(terms: readonly Term[], ids: string[], keepId: string): Term[];
export function planSplit(term: Term, newLabel: string, now: string): { kept: Term; created: Term };
export function renamePlan(term: Term, label: string): Term;
export function suggestNewTerm(projectId: string, kind: TermKind, label: string, now: string): Term;
export function termLabel(vocab: Vocabulary, kind: TermKind, id: string): string;
```

## WP-C · `src/core/cluster.ts` (+ `.test.ts`)

Grappes, seuils, demandes récurrentes (§8.5, §18), **pur**.

```ts
export function clusterIdOf(projectId: string, systemId: string, symptomId: string, triggerText: string): string;
export function computeCluster(input: ClusterInput): Cluster;   // compteurs fenêtre glissante + statut
export function isOverThreshold(counts: {tickets:number;hours:number;people:number}, th: Thresholds): ThresholdHit|null;
export function classifyRecurring(input: {requestType: string|null; tickets: number; overThreshold: boolean}): boolean;
export interface ClusterInput { projectId: string; systemId: string; symptomId: string; triggerText: string;
  tickets: readonly TicketInWindow[]; thresholds: Thresholds; now: string; status?: ClusterStatus }
export interface TicketInWindow { issueId: string; reporter: string|null; hours: number; createdAt: string }
```

## WP-D · `src/core/surge.ts` (+ `.test.ts`)

Flambées (§8.6), **pur**.

```ts
export function detectSurge(input: SurgeInput): Surge | null;
export function surgeFactor(rate: number, baseline: number): number;
export function baselineFor(history: readonly {at: string}[], windowMinutes: number, now: string): number;
export interface SurgeInput { clusterId: string; projectId: string; recent: readonly {at:string}[];
  history: readonly {at:string}[]; windowMinutes: number; factor: number; now: string; existing?: Surge|null }
```

## WP-E · `src/core/matching.ts` (+ `.test.ts`)

Échelle de rattachement (§8.4), **pur**. Le modèle n'est pas appelé ici : le
comparateur est injecté.

```ts
export function matchTicket(input: MatchInput): MatchResult;
export function isAutoAttach(result: MatchResult): boolean;      // confiance élevée && !undetermined
export interface MatchInput { signature: TicketSignature; openProblems: readonly Problem[];
  clusters: readonly Cluster[]; facts: readonly TicketFact[]; compare?: CompareFn; settings: Settings }
export type CompareFn = (ticketText: string, problem: Problem) => Promise<{same: boolean; rationale: string}>;
```

Ordre imposé : même signature complète → même système + symptôme proche (via
`compare`) → indice certain partagé (code d'erreur, équipement). Aucune
signature indéterminée n'est jamais rattachée d'office.

## WP-F · `src/core/bill.ts` (+ `.test.ts`)

L'addition (§9), **pur**.

```ts
export function computeBill(input: BillInput): ProblemBill;
export function computeTrend(previous: ProblemBill|null, current: ProblemBill): Trend;
export function hoursOf(tickets: readonly BillTicket[], minutesPerTouch: number): {hours:number; method:HoursMethod};
export function mergeBills(bills: readonly ProblemBill[]): ProblemBill;   // fusion sans double compte (§18)
export interface BillTicket { issueId: string; reporter: string|null; organization: string|null;
  loggedSeconds: number|null; touches: number; reopened: boolean; escalated: boolean;
  slaBreached: boolean; visible: boolean }
export interface BillInput { problemId: string; period: BillPeriod; tickets: readonly BillTicket[];
  meToo: readonly {accountId: string; organization: string|null}[]; minutesPerTouch: number;
  hourRateEur: number|null; now: string }
```

## WP-G · `src/core/lifecycle.ts` (+ `.test.ts`)

Cycle de vie (§5) et surveillance (§7.4, §7.5), **pur**.

```ts
export function nextState(current: ProblemState, event: LifecycleEvent): ProblemState;
export function canTransition(from: ProblemState, to: ProblemState): boolean;
export function watchWindow(fixedAt: string, watchDays: number): string;      // ISO
export function detectRegression(problem: Problem, newTicketAt: string): boolean;
export function startWatching(problem: Problem, settings: Settings, now: string): Problem;
export type LifecycleEvent = 'confirm'|'set-cause'|'publish-workaround'|'deliver-fix'
  |'watch-elapsed'|'new-ticket'|'close'|'reopen';
```

## WP-H · `src/platform/db/repos.ts` + `src/platform/db/repos/*.ts` + `mappers.ts`

Accès SQL, un fichier par table. Chaque repo expose des fonctions `async`
n'utilisant que `query.ts` et `rows.ts` (jamais de SQL concaténé avec une
valeur venue de l'extérieur).

```ts
// repos/tickets.ts
export async function upsertTicketFact(fact: TicketFact): Promise<void>;
export async function listTicketFacts(projectId: string, since: string, limit?: number): Promise<TicketFact[]>;
export async function getTicketFact(issueId: string): Promise<TicketFact|null>;
export async function listFactsByIds(issueIds: readonly string[]): Promise<TicketFact[]>;
export async function countTickets(projectId: string): Promise<number>;
// repos/signatures.ts
export async function upsertSignature(sig: TicketSignature, projectId: string): Promise<void>;
export async function getSignature(issueId: string): Promise<TicketSignature|null>;
export async function listSignatures(projectId: string, issueIds?: readonly string[]): Promise<TicketSignature[]>;
export async function findByHash(sourceHash: string): Promise<TicketSignature|null>;
export async function countSignatures(projectId: string): Promise<{total:number; undetermined:number}>;
// repos/terms.ts, repos/clusters.ts, repos/problems.ts, repos/memberships.ts,
// repos/meToo.ts, repos/bills.ts, repos/surges.ts, repos/settings.ts, repos/bootstrap.ts
```

`mappers.ts` : ligne SQL → type du domaine, un mapper par table
(`toTicketFact`, `toSignature`, `toTerm`, `toCluster`, `toProblem`,
`toMembership`, `toMeToo`, `toBill`, `toSurge`, `toSettings`, `toBootstrap`).

## WP-I · `src/platform/jira.ts` + `jira-types.ts` + `graph.ts` + `field.ts`

Tout appel réseau Atlassian vit ici (et nulle part ailleurs).

```ts
export async function fetchIssue(issueIdOrKey: string): Promise<JiraIssue|null>;
export async function searchTickets(projectKey: string, jql: string, limit?: number): Promise<JiraIssue[]>;
export async function createProblemIssue(projectKey: string, input: ProblemIssueInput): Promise<{key:string; id:string}>;
export async function linkIssues(inward: string, outward: string, type?: string): Promise<void>;
export async function addInternalComment(issueKey: string, body: string): Promise<void>;
export async function setProblemProperty(issueKey: string, bill: ProblemBill): Promise<void>;
export async function publishDailySummary(problem: Problem, bill: ProblemBill): Promise<void>; // 1 commentaire/jour (§10)
export async function readLoggedSeconds(issueId: string): Promise<number|null>;
export async function readSlaBreaches(issueId: string): Promise<boolean>;
export async function listRequestTypes(projectKey: string): Promise<{id:string; name:string}[]>;
export async function visibleToCurrentUser(issueIds: readonly string[]): Promise<Set<string>>;  // PC-13
export async function currentAccountId(): Promise<string|null>;
// graph.ts (Teamwork Graph, §14) — lectures au nom de l'utilisateur, mises en cache
export async function enrichClues(issueId: string, clues: HardClues): Promise<HardClues>;
```

## WP-J · `src/platform/llm.ts`

Forge LLM (§8.2, §8.4, §7.4). Toujours un repli déterministe ; cache par
empreinte ; température 0 pour la signature.

```ts
export async function extractSignature(input: LlmSignatureInput): Promise<LlmSignature>;
export async function compareTicketToProblem(ticketText: string, problem: Problem): Promise<{same:boolean; rationale:string}>;
export async function draftAnswer(problem: Problem, ticketSummary: string, locale: Locale): Promise<string>;
export async function draftCustomerUpdate(problem: Problem, stats: DraftStats, locale: Locale): Promise<CustomerUpdateDraft>;
export interface LlmSignature { system: string; symptom: string; trigger: string; undetermined: boolean; language: string|null }
export interface LlmSignatureInput { text: string; vocabulary: Vocabulary; hardClues: HardClues; projectLanguage: Locale }
export interface DraftStats { openTickets: number; meToo: number; hours: number; people: number; fixDate: string|null }
```

## WP-K · `src/jobs/*.ts`

Orchestration (triggers, consumer, nuit, initialisation). Chaque fonction est
exportée et branchée dans `src/index.tsx` (déjà écrit).

```ts
// triggers.ts
export async function issueCreated(event: JiraEventPayload): Promise<void>;   // poste dans la file, < 30 s (PC-07)
export async function issueUpdated(event: JiraEventPayload): Promise<void>;
export async function issueCommented(event: JiraEventPayload): Promise<void>;
// consumer.ts
export async function processTicket(issueId: string, now?: string): Promise<MatchResult>;  // extraction + rattachement
export async function bootstrapBatch(payload: BootstrapPayload): Promise<void>;
// scheduled.ts
export async function nightlyRecalc(): Promise<void>;   // grappes, suspects, additions, synthèse, surveillance
// bootstrap.ts
export async function startBootstrap(projectId: string, projectKey: string): Promise<BootstrapProgress>;
// sync.ts
export async function syncTicketFacts(projectId: string, issueIds: readonly string[]): Promise<number>;
```

## WP-L · `src/resolvers/handlers.ts` (+ fichiers `resolvers/*.ts` si besoin)

Les 27 clés de `src/ui/api.ts`, chacune validant son payload et rendant
`{ ok:false, error }` plutôt que de jeter. Importé par `resolvers/index.ts`
(déjà écrit) sous la forme d'un objet unique `handlers.ts` → **les exports
doivent porter exactement les noms listés dans `resolvers/index.ts`**.

## WP-M · `src/mcp/{index.ts,actions.ts,agent.ts}`

Les 7 actions du §12, enveloppées par `mcp/result.ts`. `index.ts` réexporte
`actionMatchKnownProblem`, `actionListTopProblems`, `actionGetProblem`,
`actionListSuspects`, `actionGetSurges`, `actionDraftCustomerUpdate`,
`actionConfirmMembership` (noms exigés par `src/index.tsx`).

## WP-N · `src/ui/*.tsx` + `src/ui/components/*.tsx`

Six écrans (§13), un fichier par ressource du manifeste :
`issue-panel.tsx`, `queue-page.tsx`, `settings-page.tsx`, `issue-context.tsx`,
`portal-subheader.tsx`, `portal-request-detail.tsx`. Chaque écran passe par
`useScreenContext()` + `useResolver()` + `AsyncView`, et n'appelle que
`src/ui/api.ts`.

## WP-O · `src/sample/{dataset.ts,load.ts}` (+ `.test.ts`)

Jeu d'exemple (PC-12, §20) : 120 tickets sur 60 jours, trois problèmes cachés
(accès distant après mise à jour, imprimante d'un étage, facture reçue en
double) et une demande récurrente normale. `dataset.ts` est **pur** et
déterministe (graine fixée) ; `load.ts` écrit en base.

```ts
export function buildDataset(seed?: number): SampleDataset;   // 120 tickets, 60 jours
export interface SampleDataset { tickets: SampleTicket[]; expectedClusters: number; expectedProblems: string[] }
export async function loadSample(projectId: string, projectKey: string): Promise<{tickets:number}>;
export async function clearSample(projectId: string): Promise<void>;
```

## WP-P · `docs/`

`ARCHITECTURE.md`, `ROVO-MCP.md`, `JUGES.md`, `VIDEO.md`, `METHODE.md`,
`VALIDATIONS.md`, `NOTES-DE-SOUMMISSION.md` — en anglais pour ce qui est lu par
les juges (`JUGES.md`, `VIDEO.md`, `NOTES-DE-SOUMMISSION.md`), en français pour
le reste.
