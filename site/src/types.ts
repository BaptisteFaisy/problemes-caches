/**
 * Contrat du site de démonstration — ce que le moteur calcule et ce que le
 * rendu affiche.
 *
 * Le site n'est **pas** une maquette : il exécute dans le navigateur le vrai
 * domaine de l'app (`src/core`) sur le vrai jeu d'exemple (`src/sample`). Les
 * grappes, les additions, les tendances et les flambées affichées sont donc
 * calculées par exactement le même code que celui qui tourne dans Jira, et les
 * identifiants de grappe sont les mêmes (le SHA-256 navigateur est vérifié
 * identique à celui de Node par `sha256.test.ts`).
 *
 * Deux modules se partagent ce contrat :
 * - `state.ts`  : construit et fait évoluer l'état (pur, testé par `state.test.ts`) ;
 * - `render.ts` : affiche l'état, et rien d'autre — aucun calcul métier (§17).
 */

import type {
  BillLineKey,
  BillPeriod,
  ClusterStatus,
  Confidence,
  CustomerUpdateDraft,
  DataQuality,
  MembershipBasis,
  ProblemBill,
  ProblemState,
  Settings,
  TermKind,
  ThresholdHit,
  Thresholds,
  Trend,
  Vocabulary,
} from '../../src/core/types';
import type { SampleGroupId, SampleKind } from '../../src/sample/dataset';

/** Un ticket du jeu d'exemple, tel qu'affiché par le site. */
export interface DemoTicket {
  issueId: string;
  issueKey: string;
  summary: string;
  createdAt: string;
  reporter: string;
  organization: string | null;
  language: 'fr' | 'en';
  group: SampleGroupId;
  kind: SampleKind;
  visible: boolean;
  touches: number;
  loggedSeconds: number | null;
  reopened: boolean;
  escalated: boolean;
  slaBreached: boolean;
  systemId: string;
  symptomId: string;
  triggerText: string;
  undetermined: boolean;
}

/** Un problème confirmé dans la démonstration (§5, §10). */
export interface DemoProblem {
  /** Clé affichée, du genre `PRB-12` (§7.1). */
  key: string;
  state: ProblemState;
  cause: string | null;
  workaround: string | null;
  workaroundUrl: string | null;
  fixIssueKey: string | null;
  fixedAt: string | null;
  watchUntil: string | null;
  regression: boolean;
  publishedToPortal: boolean;
  /** « Moi aussi » du portail (§7.3) : comptés dans les personnes touchées. */
  meToo: DemoMeToo[];
}

/** Un signalement « Moi aussi », sans ticket (§7.3, PC-16). */
export interface DemoMeToo {
  name: string;
  organization: string | null;
  at: string;
}

/** Une grappe et tout ce que le site en affiche (§8.5, §9). */
export interface DemoCluster {
  /** Identifiant calculé par `clusterIdOf` — le même que dans l'app. */
  id: string;
  /** Signature lisible : « système · symptôme · déclencheur » (§4). */
  signature: string;
  systemLabel: string;
  symptomLabel: string;
  triggerText: string;
  status: ClusterStatus;
  kind: SampleKind;
  /** Tous les tickets de la grappe, dans l'ordre chronologique. */
  tickets: DemoTicket[];
  bill30: ProblemBill;
  bill90: ProblemBill;
  trend: Trend;
  overThreshold: boolean;
  thresholdHit: ThresholdHit | null;
  /** Non nul une fois la grappe confirmée en problème (§7.1). */
  problem: DemoProblem | null;
}

/** Une flambée en cours (§8.6). */
export interface DemoSurge {
  clusterId: string;
  signature: string;
  rate: number;
  baseline: number;
  factor: number;
  startedAt: string;
  expected: boolean;
}

/** Résultat de la reconnaissance d'un texte libre (§8.4, §12). */
export interface DemoMatch {
  cluster: DemoCluster | null;
  confidence: Confidence;
  basis: MembershipBasis;
  /** La phrase qui justifie le rattachement, affichée telle quelle (§17). */
  rationale: string;
  auto: boolean;
  proposedAnswer: string | null;
  /** Autres grappes plausibles (§18 : un ticket peut décrire deux problèmes). */
  alternatives: DemoCluster[];
  /** Vrai quand la reconnaissance a utilisé le comparateur de démonstration. */
  usedDemoComparator: boolean;
}

/** Totaux affichés en tête du site. */
export interface DemoTotals {
  tickets: number;
  clusters: number;
  suspects: number;
  problems: number;
  hours30: number;
  people30: number;
  undetermined: number;
}

/** L'état complet de la démonstration. */
export interface DemoState {
  /** Heure de référence du jeu : fixe, donc démonstration reproductible. */
  now: string;
  projectKey: string;
  windowDays: number;
  period: BillPeriod;
  locale: DemoLocale;
  settings: Settings;
  tickets: DemoTicket[];
  clusters: DemoCluster[];
  surges: DemoSurge[];
  vocabulary: Vocabulary;
  totals: DemoTotals;
}

/** Langues du site, comme l'app (§17). */
export type DemoLocale = 'en' | 'fr';

/** Textes proposés aux juges pour la reconnaissance en direct (§21). */
export interface DemoPrompt {
  label: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Vue développeur (§7.2, §18) — le module `jira:issueContext` de l'app
// ---------------------------------------------------------------------------

/** Un problème lié au bug regardé, avec son addition. */
export interface DemoDevProblem {
  key: string;
  state: ProblemState;
  signature: string;
  bill30: ProblemBill;
}

/**
 * « Ce que coûte ce bug » : exactement ce que `getIssueContext` renvoie dans
 * l'app. Les heures s'additionnent, les personnes **non** — une personne
 * touchée par deux problèmes liés ne compte pas deux fois (§18). Cette règle
 * vit dans `aggregateIssueContext` (`src/core/bill.ts`), partagée avec l'app.
 */
export interface DemoDevContext {
  /** Le ticket de correctif regardé, du genre `NET-402`. */
  issueKey: string;
  summary: string;
  problems: DemoDevProblem[];
  hoursPerMonth: number;
  people: number;
}

// ---------------------------------------------------------------------------
// Cycle de vie et régression (§5, §7.4, §7.5) — `src/core/lifecycle.ts`
// ---------------------------------------------------------------------------

/** Qualité des données (§11 PC-10) : la forme de l'app, réutilisée telle quelle. */
export type DemoQuality = DataQuality;

/** Une étape du tableau du §5, atteinte ou non. */
export interface DemoLifecycleStep {
  state: ProblemState;
  at: string | null;
  reached: boolean;
}

/** Le cycle complet d'un problème confirmé, tel que le site le montre. */
export interface DemoLifecycle {
  clusterId: string;
  key: string;
  state: ProblemState;
  steps: DemoLifecycleStep[];
  /** Fin de la surveillance (§7.4) : `fixedAt + settings.watchDays`. */
  watchUntil: string | null;
  /** Jours de surveillance écoulés sans nouveau ticket. */
  watchElapsed: boolean;
  /** Vrai si un ticket est arrivé après la correction (§7.5). */
  regression: boolean;
  /** Le brouillon destiné aux clients, `null` tant que rien n'est corrigé. */
  draft: CustomerUpdateDraft | null;
  /** Tickets ouverts et « moi aussi » repris dans le brouillon. */
  openTickets: number;
  meToo: number;
}

// ---------------------------------------------------------------------------
// Portail client (§7.3) — `jiraServiceManagement:portalRequestDetailPanel`
// ---------------------------------------------------------------------------

/** Une demande vue du portail, avec son bandeau et son correctif prévu. */
export interface DemoPortalRequest {
  issueKey: string;
  summary: string;
  requester: string;
  service: string;
  status: 'open' | 'answered' | 'resolved';
  /** Problème connu auquel la demande est rattachée, `null` sinon. */
  problemKey: string | null;
  /** Le bandeau affiché avant d'écrire, `null` si aucun problème connu. */
  banner: string | null;
  fixPlannedAt: string | null;
  /** Cette personne a cliqué « Moi aussi » (aucun ticket créé, §7.3). */
  meToo: boolean;
  /** Prévenue à la résolution (§7.4). */
  notified: boolean;
}

// ---------------------------------------------------------------------------
// Réglages (§11) — `jira:projectSettingsPage`
// ---------------------------------------------------------------------------

/** Ce que la démo autorise à changer ; tout le reste reste figé. */
export interface DemoSettingsPatch {
  minutesPerTouch?: number;
  hourRateEur?: number | null;
  surgeFactor?: number;
  watchDays?: number;
  thresholds?: Partial<Thresholds>;
  enabledLines?: BillLineKey[];
}

// ---------------------------------------------------------------------------
// Agent Rovo (§12) — conversation simulée, pas seulement le tableau des outils
// ---------------------------------------------------------------------------

/** Les cinq amorces de conversation déclarées dans `rovo:agent`. */
export type RovoPromptId = 'cost' | 'surges' | 'suspects' | 'problem' | 'draft';

/** Un tour de conversation : question, outil appelé, réponse, méthode. */
export interface DemoRovoTurn {
  promptId: RovoPromptId;
  question: string;
  /** L'action MCP réellement appelée, ex. `list-top-problems`. */
  tool: string;
  /** Les entrées passées à l'outil, en JSON lisible. */
  toolInput: string;
  answer: string;
  /** Chiffres structurés rendus par l'outil. */
  figures: { label: string; value: string }[];
  /** La méthode de calcul affichée avec chaque chiffre (§17). */
  method: string;
}

// ---------------------------------------------------------------------------
// Fonctions du moteur — signatures imposées
// ---------------------------------------------------------------------------
//
// **Lectures** dans `derive.ts`, **mutations** dans `actions.ts`, construction
// dans `build.ts` ; tout est réexporté par `state.ts`, seule porte d'entrée du
// rendu. `derive.ts` existe parce que `build.ts` approche la limite des
// 500 lignes : aucune règle métier ne doit aller dans le rendu (§17).
//
//   buildDemoState(locale: DemoLocale, seed?: number): DemoState
//   confirmSuspect(state, clusterId, removedIssueKeys: string[]): DemoState
//   rejectSuspect(state, clusterId): DemoState
//   addMeToo(state, clusterId, name, organization: string | null): DemoState
//   detachTicket(state, clusterId, issueKey): DemoState
//   matchText(state, text): DemoMatch
//   withPeriod(state, period: BillPeriod): DemoState
//   withLocale(state, locale: DemoLocale): DemoState
//
//   lifecycleOf(state, clusterId): DemoLifecycle | null
//   devContexts(state): DemoDevContext[]
//   portalRequestsOf(state): DemoPortalRequest[]
//   qualityOf(state): DataQuality
//   askRovo(state, promptId: RovoPromptId): DemoRovoTurn
//
//   markFixed(state, clusterId): DemoState
//   simulateIncoming(state, clusterId): DemoState
//   verifyWatch(state, clusterId): DemoState
//   splitCluster(state, clusterId, issueKeys: string[], triggerText: string): DemoState
//   withSettings(state, patch: DemoSettingsPatch): DemoState
//   resetSettings(state): DemoState
//   addTerm(state, kind: TermKind, label: string): DemoState
//   mergeTerms(state, ids: string[], keepId: string): DemoState
//
// `markFixed` appelle `startWatching`, `simulateIncoming` appelle
// `detectRegression` et `verifyWatch` appelle `nextState(_, 'watch-elapsed')` :
// ce sont les fonctions de `src/core/lifecycle.ts`, jamais une copie.
// `customerDraftOf` appelle `fallbackCustomerUpdate` de `src/platform/field.ts`
// — module pur (aucun `@forge/*` dans sa chaîne d'imports), donc bundlable.
// Le site affiche `source: 'template'` et le dit : aucun modèle n'est joignable
// depuis un navigateur.
//
// Le rendu (`render*.ts`) n'appelle QUE ces fonctions : aucun calcul métier
// dans le DOM (§17), et toute évolution de l'état repasse par le moteur testé.
