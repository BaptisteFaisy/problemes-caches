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
  BillPeriod,
  ClusterStatus,
  Confidence,
  MembershipBasis,
  ProblemBill,
  ProblemState,
  Settings,
  ThresholdHit,
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
// Fonctions du moteur — signatures imposées
// ---------------------------------------------------------------------------
//
// Implémentées dans `build.ts` (construction) et `actions.ts` (interactions),
// réexportées par `state.ts` :
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
// Le rendu (`render.ts`) n'appelle QUE ces fonctions : aucun calcul métier dans
// le DOM (§17), et toute évolution de l'état repasse par le moteur testé.
