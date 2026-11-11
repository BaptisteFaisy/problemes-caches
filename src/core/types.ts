/**
 * Types du domaine — « Problèmes cachés dans les tickets » (cahier §4, §15).
 *
 * Contrat pur du dépôt : aucun import `@forge/*`, aucune I/O, aucune horloge
 * implicite. Chaque interface mappe directement soit une table Forge SQL
 * (§15), soit un payload d'écran (§13) ou d'action MCP (§12).
 */

export * from './constants';

// ---------------------------------------------------------------------------
// Vocabulaire (§8.3)
// ---------------------------------------------------------------------------

export type TermKind = 'system' | 'symptom';

export interface Term {
  id: string;
  projectId: string;
  kind: TermKind;
  label: string;
  mergedInto: string | null;
  aliases: string[];
  createdAt: string;
}

export interface Vocabulary {
  systems: Term[];
  symptoms: Term[];
}

// ---------------------------------------------------------------------------
// Ticket et signature (§8.2, §15)
// ---------------------------------------------------------------------------

export interface HardClues {
  requestType: string | null;
  service: string | null;
  component: string | null;
  errorCodes: string[];
  product: string | null;
  version: string | null;
  os: string | null;
  assetIds: string[];
  organization: string | null;
}

export interface TicketFact {
  issueId: string;
  issueKey: string;
  projectId: string;
  projectKey: string;
  requestType: string | null;
  service: string | null;
  component: string | null;
  reporter: string | null;
  organization: string | null;
  createdAt: string;
  resolvedAt: string | null;
  touches: number;
  loggedSeconds: number | null;
  reopened: boolean;
  escalated: boolean;
  slaBreached: boolean;
  visible: boolean;
  summary: string;
}

export interface TicketSignature {
  issueId: string;
  systemId: string;
  symptomId: string;
  triggerText: string;
  hardClues: HardClues;
  extractedAt: string;
  sourceHash: string;
  undetermined: boolean;
  language: string | null;
}

// ---------------------------------------------------------------------------
// Grappe et problème (§5, §8.5, §10)
// ---------------------------------------------------------------------------

export type ClusterStatus = 'watching' | 'suspect' | 'problem' | 'recurring' | 'dismissed';
export type ThresholdHit = 'tickets' | 'hours' | 'people';

export interface Cluster {
  id: string;
  projectId: string;
  systemId: string;
  symptomId: string;
  triggerText: string;
  tickets30d: number;
  hours30d: number;
  people30d: number;
  status: ClusterStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  overThreshold: boolean;
  thresholdHit: ThresholdHit | null;
}

export type ProblemState =
  | 'suspect'
  | 'confirmed'
  | 'cause-known'
  | 'workaround-published'
  | 'fixed'
  | 'verified'
  | 'regression';

export interface Problem {
  id: string;
  projectId: string;
  projectKey: string;
  issueKey: string | null;
  clusterId: string;
  systemId: string;
  symptomId: string;
  triggerText: string;
  state: ProblemState;
  cause: string | null;
  workaround: string | null;
  workaroundUrl: string | null;
  fixIssueKey: string | null;
  fixedAt: string | null;
  watchUntil: string | null;
  regression: boolean;
  publishedToPortal: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Appartenance & « Moi aussi » (§4, §7.3, §8.4)
// ---------------------------------------------------------------------------

export type MembershipBasis = 'rule' | 'similarity' | 'human';
export type Confidence = 'high' | 'medium' | 'low';

export interface Membership {
  issueId: string;
  issueKey: string;
  problemId: string;
  basis: MembershipBasis;
  confidence: Confidence;
  rationale: string;
  proposedAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rejected: boolean;
  rejectedBy: string | null;
  attached: boolean;
}

export interface MeToo {
  problemId: string;
  accountId: string;
  displayName: string;
  organization: string | null;
  at: string;
}

// ---------------------------------------------------------------------------
// Addition (§9)
// ---------------------------------------------------------------------------

export type BillPeriod = '30d' | '90d';
export type HoursMethod = 'logged' | 'touches' | 'mixed';
export type BillLineKey =
  | 'tickets'
  | 'hours'
  | 'people'
  | 'orgs'
  | 'slaBreaches'
  | 'reopens'
  | 'escalations'
  | 'meToo';

export interface ProblemBill {
  problemId: string;
  period: BillPeriod;
  tickets: number;
  hours: number;
  people: number;
  orgs: number;
  slaBreaches: number;
  reopens: number;
  escalations: number;
  meToo: number;
  hoursMethod: HoursMethod;
  minutesPerTouch: number;
  eur: number | null;
  hourRateEur: number | null;
  hiddenCount: number;
  computedAt: string;
}

export interface Trend {
  previous: number;
  current: number;
  direction: 'up' | 'down' | 'flat';
  deltaPercent: number | null;
}

// ---------------------------------------------------------------------------
// Flambée (§8.6)
// ---------------------------------------------------------------------------

export interface Surge {
  id: string;
  clusterId: string;
  projectId: string;
  startedAt: string;
  rate: number;
  baseline: number;
  factor: number;
  incidentKey: string | null;
  expected: boolean;
}

// ---------------------------------------------------------------------------
// Rattachement à l'arrivée d'un ticket (§7.2, §8.4)
// ---------------------------------------------------------------------------

export type MatchStep = 'same-signature' | 'similar-symptom' | 'shared-clue' | 'none';

export interface MatchResult {
  step: MatchStep;
  problem: Problem | null;
  cluster: Cluster | null;
  confidence: Confidence;
  basis: MembershipBasis;
  rationale: string;
  auto: boolean;
  undetermined: boolean;
  proposedAnswer: string | null;
}

// ---------------------------------------------------------------------------
// Réglages & initialisation (§13 écran 5, §14, §15)
// ---------------------------------------------------------------------------

export interface Thresholds {
  tickets: number;
  hours: number;
  people: number;
  windowDays: number;
}

export interface Settings {
  projectId: string;
  projectKey: string;
  thresholds: Thresholds;
  minutesPerTouch: number;
  hourRateEur: number | null;
  problemIssueType: string | null;
  portalServices: string[];
  surgeFactor: number;
  surgeWindowMinutes: number;
  watchDays: number;
  enabledLines: BillLineKey[];
  demoData: boolean;
}

export interface BootstrapProgress {
  projectId: string;
  total: number;
  done: number;
  failed: number;
  startedAt: string;
  updatedAt: string;
  finished: boolean;
}

export interface DataQuality {
  ticketsIndexed: number;
  signaturesExtracted: number;
  undetermined: number;
  problemsOpen: number;
  clusters: number;
  lastSyncAt: string | null;
  bootstrap: BootstrapProgress | null;
  missing: BillLineKey[];
}

// ---------------------------------------------------------------------------
// Brouillons (§7.4, PC-18, PC-22) — jamais envoyés sans validation humaine
// ---------------------------------------------------------------------------

export interface CustomerUpdateDraft {
  problemKey: string;
  subject: string;
  body: string;
  openTickets: number;
  meToo: number;
  source: 'model' | 'template';
}

export interface KnowledgeDraft {
  title: string;
  body: string;
  source: 'model' | 'template';
}

// ---------------------------------------------------------------------------
// Helpers purs du domaine
// ---------------------------------------------------------------------------

export function signatureKey(systemId: string, symptomId: string, triggerText: string): string {
  return `${systemId}|${symptomId}|${normalizeTrigger(triggerText)}`;
}

export function normalizeTrigger(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

export function defaultSettings(projectId: string, projectKey: string): Settings {
  return {
    projectId,
    projectKey,
    thresholds: { tickets: 5, hours: 10, people: 10, windowDays: 30 },
    minutesPerTouch: 10,
    hourRateEur: null,
    problemIssueType: null,
    portalServices: [],
    surgeFactor: 3,
    surgeWindowMinutes: 120,
    watchDays: 14,
    enabledLines: ['tickets', 'hours', 'people'],
    demoData: false,
  };
}
