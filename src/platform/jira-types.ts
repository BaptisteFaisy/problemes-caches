/**
 * Types de la couche plateforme : réponses Jira / Jira Service Management
 * (§14) et contrats du modèle (§8.2, §8.4, §7.4).
 *
 * Ce fichier ne décrit que des données : aucun import réseau, aucune horloge.
 * Les adaptateurs (`jira.ts`, `graph.ts`) les traduisent en types du domaine
 * (`src/core/types.ts`) ; `field.ts` sait en extraire l'information utile.
 */

import type { HardClues, ProblemBill, Vocabulary } from '../core/types.ts';
import type { Locale } from '../ui/i18n/index.ts';

/** Utilisateur Jira (personne ou application). */
export interface JiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
}

/** Type de ticket. */
export interface JiraIssueType {
  id: string;
  name: string;
  description?: string;
  subtask?: boolean;
}

/** Statut de ticket ; sa catégorie dit s'il est encore ouvert (§5). */
export interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: { key: string; name: string };
}

/** Projet Jira. */
export interface JiraProject {
  id: string;
  key: string;
  name?: string;
}

/** Journal de travail : le temps réellement saisi par les agents (§9). */
export interface JiraWorklog {
  worklogs?: { id?: string; timeSpentSeconds?: number }[];
  totalTimeSpentSeconds?: number;
}

/** Lien entre deux tickets (§10). */
export interface JiraIssueLink {
  type?: { id?: string; name?: string; inward?: string; outward?: string };
  inwardIssue?: { id: string; key: string };
  outwardIssue?: { id: string; key: string };
}

/**
 * Champs d'un ticket. Les champs personnalisés arrivent sous leur identifiant
 * (`customfield_…`) : ils sont donc lus par nom candidat dans `field.ts`.
 */
export interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  issuetype?: JiraIssueType;
  status?: JiraStatus;
  project?: JiraProject;
  reporter?: JiraUser;
  creator?: JiraUser;
  assignee?: JiraUser;
  created?: string;
  updated?: string;
  resolutiondate?: string | null;
  labels?: string[];
  components?: { id: string; name: string }[];
  worklog?: JiraWorklog;
  timespent?: number | null;
  issuelinks?: JiraIssueLink[];
  [key: string]: unknown;
}

/** Ticket Jira tel que renvoyé par l'API REST. */
export interface JiraIssue {
  id: string;
  key: string;
  self?: string;
  fields: JiraIssueFields;
}

/** Réponse de recherche Jira (nouveau point d'entrée puis repli). */
export interface JiraSearchResponse {
  issues?: JiraIssue[];
  total?: number;
  isLast?: boolean;
  nextPageToken?: string;
}

/** Ticket renvoyé par la création. */
export interface JiraCreatedIssue {
  id: string;
  key: string;
  self?: string;
}

/** Types de ticket utilisables dans un projet (créa-métadonnées). */
export interface JiraIssueTypeMeta {
  issueTypes?: { id: string; name: string; description?: string }[];
}

/** Type de demande JSM (`/rest/servicedeskapi/…/requesttype`). */
export interface JsmRequestType {
  id: string;
  name: string;
  description?: string;
  serviceDeskId?: string;
  issueTypeId?: string;
}

/** Organisation cliente JSM. */
export interface JsmOrganization {
  id: string;
  name: string;
}

/** Cycle de délai de service : `breachTime` non nul = délai rompu (§9). */
export interface JsmSlaCycle {
  startTime?: string;
  stopTime?: string;
  breachTime?: string | null;
}

/** Accord de niveau de service d'une demande. */
export interface JsmSlaAgreement {
  currentAgreement?: {
    ongoingCycle?: JsmSlaCycle;
    pausedCycle?: JsmSlaCycle;
    completedCycles?: JsmSlaCycle[];
  };
  previousAgreements?: { completedCycles?: JsmSlaCycle[] }[];
}

/** Détail d'une demande JSM. */
export interface JsmRequestDetails {
  issueId?: string;
  issueKey?: string;
  serviceDeskId?: string;
  requestType?: JsmRequestType;
  organization?: JsmOrganization;
  serviceLevelAgreement?: JsmSlaAgreement;
  requestFieldValues?: { fieldId: string; value: unknown }[];
}

/** Liste JSM (types de demande, organisations). */
export interface JsmValues<T> {
  values?: T[];
  size?: number;
  isLastPage?: boolean;
}

/** Propriété d'application posée sur un ticket (§10). */
export interface IssueProperty {
  key: string;
  value: unknown;
}

/** Propriété d'application tenant l'addition d'un problème (§10). */
export interface ProblemBillProperty {
  problemId: string;
  period: string;
  computedAt: string;
  bill: ProblemBill;
}

/** Propriété d'application marquant la synthèse quotidienne (§10). */
export interface DailySummaryProperty {
  lastPublishedOn: string;
  computedAt: string;
  problemKey: string;
  bill: ProblemBill;
}

/** Propriété d'application tenant la signature d'un problème (§10). */
export interface ProblemSignatureProperty {
  signatureKey: string | null;
  systemId: string | null;
  symptomId: string | null;
  triggerText: string | null;
}

/** Données de création d'un ticket de problème (§10). */
export interface ProblemIssueInput {
  /** Titre du ticket de problème. */
  summary: string;
  /** Description (texte simple, converti en ADF par l'adaptateur). */
  description: string;
  /** Type « Problème » du projet s'il existe, sinon celui des réglages (§10). */
  issueTypeName?: string | null;
  /** Signature du problème : sert à l'unicité avant toute création (§10). */
  signatureKey?: string | null;
  /** Système concerné : unicité « même système » (§10). */
  systemId?: string | null;
  /** Symptôme concerné : unicité « même système et même symptôme » (§10). */
  symptomId?: string | null;
  /** Déclencheur connu : unicité (§10). */
  triggerText?: string | null;
  /** Étiquettes ajoutées au ticket. */
  labels?: string[];
}

// ---------------------------------------------------------------------------
// Contrats du modèle (§8.2, §8.4, §7.4)
// ---------------------------------------------------------------------------

/** Signature rendue par le modèle (§8.2). */
export interface LlmSignature {
  system: string;
  symptom: string;
  trigger: string;
  undetermined: boolean;
  language: string | null;
}

/** Entrée de l'extraction de signature (§8.2). */
export interface LlmSignatureInput {
  /** Texte du ticket (résumé + description). */
  text: string;
  /** Vocabulaire tenu du projet : on y cherche d'abord (§8.2, §8.3). */
  vocabulary: Vocabulary;
  /** Indices certains, déjà calculés sans modèle (§8.2). */
  hardClues: HardClues;
  /** Langue du projet : la signature s'exprime dans cette langue (§18). */
  projectLanguage: Locale;
  /** Cache des signatures par empreinte du texte (§8.2). */
  cache?: Map<string, LlmSignature>;
}

/** Message de conversation (forme simple, indépendante du SDK). */
export interface PromptMessage {
  role: 'system' | 'user';
  content: string;
}

/** Options d'un appel au modèle. */
export interface ChatOptions {
  temperature: number;
  maxTokens: number;
}

/** Client de conversation : injecté par les tests, remplacé par Forge sinon. */
export type LlmChat = (messages: PromptMessage[], options: ChatOptions) => Promise<string>;

/** Dépendances injectables : modèle, client, cache. */
export interface LlmDeps {
  /** Client de conversation (tests) ; par défaut le modèle Forge. */
  chat?: LlmChat;
  /** Nom du modèle ; par défaut celui du manifeste. */
  model?: string;
  /** Cache des signatures par empreinte (§8.2). */
  cache?: Map<string, LlmSignature>;
}

/** Chiffres utilisés par le brouillon client (§7.4). */
export interface DraftStats {
  openTickets: number;
  meToo: number;
  hours: number;
  people: number;
  fixDate: string | null;
}
