import { invoke } from '@forge/bridge';
import type {
  BillPeriod,
  BootstrapProgress,
  Cluster,
  CustomerUpdateDraft,
  DataQuality,
  MatchResult,
  MeToo,
  Membership,
  Problem,
  ProblemBill,
  Settings,
  Surge,
  Term,
  ThresholdHit,
  Trend,
  Vocabulary,
} from '../core/types.ts';

/**
 * Passerelle typée vers les resolvers (§13, §14). Chaque écran appelle une
 * fonction d'ici, jamais `invoke` directement : la clé du resolver et la forme
 * de la réponse sont écrites à un seul endroit — c'est le contrat UI ↔ backend.
 */

/** Les clés exposées par `src/resolvers/index.ts`. */
export type ResolverKey =
  | 'getAgentPanel'
  | 'attachAndDraft'
  | 'detachTicket'
  | 'getProblemsPage'
  | 'getProblemPanel'
  | 'confirmSuspect'
  | 'rejectSuspect'
  | 'splitCluster'
  | 'mergeProblems'
  | 'updateProblem'
  | 'getIssueContext'
  | 'getSettings'
  | 'saveSettings'
  | 'listVocabulary'
  | 'renameTerm'
  | 'mergeTerms'
  | 'splitTerm'
  | 'startBootstrap'
  | 'bootstrapProgress'
  | 'loadSampleData'
  | 'clearSampleData'
  | 'getDataQuality'
  | 'getPortalBanner'
  | 'meToo'
  | 'getRequestDetail'
  | 'draftCustomerUpdate'
  | 'matchFreeText';

// ---------------------------------------------------------------------------
// Formes de réponse — l'UI n'additionne et ne devine jamais rien (§17).
// ---------------------------------------------------------------------------

/** Une ligne de la page « Problèmes » : une grappe et ce qu'elle coûte. */
export type ClusterLine = {
  cluster: Cluster;
  bill: ProblemBill | null;
  trend: Trend | null;
  problem: Problem | null;
  thresholdHit: ThresholdHit | null;
  sampleKeys: string[];
};

/** Ce que le panneau de l'agent affiche sur un ticket (§7.2, PC-08). */
export type AgentPanelData = {
  settings: Settings;
  match: MatchResult;
  /** Rattachement déjà enregistré, quand il existe. */
  membership: Membership | null;
  /** Autres problèmes plausibles, proposés sans rattachement (§18). */
  alternatives: MatchResult[];
  bill: ProblemBill | null;
  pendingProposals: Membership[];
};

/** Résultat de « Rattacher et préparer la réponse » (§7.2). */
export type AttachResult = {
  membership: Membership;
  proposedAnswer: string | null;
};

/** Page « Problèmes » d'une file JSM (§13 écran 2, PC-09). */
export type ProblemsPageData = {
  settings: Settings;
  suspects: ClusterLine[];
  problems: ClusterLine[];
  recurring: ClusterLine[];
  surges: Surge[];
  unattached: { issueKey: string; issueId: string; summary: string }[];
  quality: DataQuality;
};

/** Un point de la courbe des tickets d'un problème (§13 écran 3). */
export type TicketPoint = { day: string; count: number };

/** Fiche complète d'un problème (§13 écran 3, PC-05). */
export type ProblemPanelData = {
  problem: Problem;
  bills: Record<BillPeriod, ProblemBill | null>;
  trend: Trend | null;
  curve: TicketPoint[];
  memberships: Membership[];
  meToo: MeToo[];
  vocabulary: { system: Term | null; symptom: Term | null };
  hiddenCount: number;
};

/** Encart sur le ticket de l'équipe qui corrige (§13 écran 4, PC-20). */
export type IssueContextData = {
  problems: { problem: Problem; bill: ProblemBill | null; people: number }[];
  hoursPerMonth: number;
  people: number;
};

/** Bandeau de problème connu du portail (§13 écran 6, PC-15). */
export type PortalBannerData = {
  problems: { problemKey: string; systemLabel: string; symptomLabel: string; workaround: string | null; problemId: string }[];
  service: string | null;
};

/** Ce que le client voit sur sa demande (§13 écran 7, PC-19). */
export type RequestDetailData = {
  problemKey: string | null;
  state: Problem['state'] | null;
  workaround: string | null;
  fixIssueKey: string | null;
  fixedAt: string | null;
};

/** Résultat d'une action sur le vocabulaire (§8.3). */
export type VocabularyResult = { vocabulary: Vocabulary; regroupedTickets: number };

export function getAgentPanel(issueId: string, issueKey: string): Promise<AgentPanelData> {
  return call<AgentPanelData>('getAgentPanel', { issueId, issueKey });
}

export function attachAndDraft(issueId: string, problemId: string): Promise<AttachResult> {
  return call<AttachResult>('attachAndDraft', { issueId, problemId });
}

export function detachTicket(issueId: string, problemId: string): Promise<void> {
  return call<void>('detachTicket', { issueId, problemId });
}

export function getProblemsPage(projectId: string, projectKey: string): Promise<ProblemsPageData> {
  return call<ProblemsPageData>('getProblemsPage', { projectId, projectKey });
}

export function getProblemPanel(problemId: string): Promise<ProblemPanelData> {
  return call<ProblemPanelData>('getProblemPanel', { problemId });
}

export function confirmSuspect(clusterId: string, removeIssueIds: string[]): Promise<{ problemKey: string }> {
  return call<{ problemKey: string }>('confirmSuspect', { clusterId, removeIssueIds });
}

export function rejectSuspect(clusterId: string): Promise<void> {
  return call<void>('rejectSuspect', { clusterId });
}

export function splitCluster(clusterId: string, issueIds: string[], triggerText: string): Promise<{ clusterId: string }> {
  return call<{ clusterId: string }>('splitCluster', { clusterId, issueIds, triggerText });
}

export function mergeProblems(problemIds: string[]): Promise<{ problemKey: string }> {
  return call<{ problemKey: string }>('mergeProblems', { problemIds });
}

export function updateProblem(problemId: string, patch: ProblemPatch): Promise<Problem> {
  return call<Problem>('updateProblem', { problemId, patch });
}

/** Champs d'un problème modifiables par un humain (§5, §10). */
export type ProblemPatch = {
  state?: Problem['state'];
  cause?: string | null;
  workaround?: string | null;
  workaroundUrl?: string | null;
  fixIssueKey?: string | null;
  publishedToPortal?: boolean;
};

export function getIssueContext(issueId: string): Promise<IssueContextData> {
  return call<IssueContextData>('getIssueContext', { issueId });
}

export function getSettings(projectId: string): Promise<Settings> {
  return call<Settings>('getSettings', { projectId });
}

export function saveSettings(settings: Settings): Promise<Settings> {
  return call<Settings>('saveSettings', { settings });
}

export function listVocabulary(projectId: string): Promise<Vocabulary> {
  return call<Vocabulary>('listVocabulary', { projectId });
}

export function renameTerm(termId: string, label: string): Promise<VocabularyResult> {
  return call<VocabularyResult>('renameTerm', { termId, label });
}

export function mergeTerms(termIds: string[], keepId: string): Promise<VocabularyResult> {
  return call<VocabularyResult>('mergeTerms', { termIds, keepId });
}

export function splitTerm(termId: string, issueIds: string[], label: string): Promise<VocabularyResult> {
  return call<VocabularyResult>('splitTerm', { termId, issueIds, label });
}

export function startBootstrap(projectId: string, projectKey: string): Promise<BootstrapProgress> {
  return call<BootstrapProgress>('startBootstrap', { projectId, projectKey });
}

export function bootstrapProgress(projectId: string): Promise<BootstrapProgress | null> {
  return call<BootstrapProgress | null>('bootstrapProgress', { projectId });
}

export function loadSampleData(projectId: string): Promise<{ tickets: number }> {
  return call<{ tickets: number }>('loadSampleData', { projectId });
}

export function clearSampleData(projectId: string): Promise<void> {
  return call<void>('clearSampleData', { projectId });
}

export function getDataQuality(projectId: string): Promise<DataQuality> {
  return call<DataQuality>('getDataQuality', { projectId });
}

export function getPortalBanner(projectKey: string, service: string | null): Promise<PortalBannerData> {
  return call<PortalBannerData>('getPortalBanner', { projectKey, service });
}

export function meToo(problemId: string): Promise<void> {
  return call<void>('meToo', { problemId });
}

export function getRequestDetail(issueId: string): Promise<RequestDetailData> {
  return call<RequestDetailData>('getRequestDetail', { issueId });
}

export function draftCustomerUpdate(problemId: string): Promise<CustomerUpdateDraft> {
  return call<CustomerUpdateDraft>('draftCustomerUpdate', { problemId });
}

export function matchFreeText(text: string, projectKey: string): Promise<MatchResult> {
  return call<MatchResult>('matchFreeText', { text, projectKey });
}

/** Appel générique : `invoke` peut rendre le corps nu ou l'envelopper. */
async function call<T>(key: ResolverKey, payload: Record<string, unknown>): Promise<T> {
  const response = await invoke<Record<string, unknown>, T>(key, payload);
  return unwrap<T>(response);
}

function unwrap<T>(response: T | { body: T }): T {
  if (typeof response === 'object' && response !== null && 'body' in response) {
    return (response as { body: T }).body;
  }
  return response as T;
}
