/**
 * Constantes du produit — une seule source, jamais recopiée ailleurs.
 *
 * Chaque constante renvoie au paragraphe du cahier des charges qui la fixe :
 * les modifier sans mettre le cahier à jour casse la recette (§19).
 */

import type {
  BillLineKey,
  BillPeriod,
  ClusterStatus,
  Confidence,
  MembershipBasis,
  ProblemState,
  TermKind,
  ThresholdHit,
} from './types.ts';

/** Fenêtre glissante de détection d'un suspect, en jours (§8.5). */
export const SUSPECT_WINDOW_DAYS = 30;

/** Seuils par défaut qui font naître un suspect (§8.5). */
export const DEFAULT_THRESHOLDS = { tickets: 5, hours: 10, people: 10 } as const;

/** Durée moyenne d'une intervention quand aucun temps n'est saisi, en minutes (§9). */
export const DEFAULT_MINUTES_PER_TOUCH = 10;

/** Fenêtre de détection d'une flambée, en minutes (§8.6). */
export const SURGE_WINDOW_MINUTES = 120;

/** Facteur de flambée : trois fois la moyenne habituelle (§8.6). */
export const SURGE_FACTOR = 3;

/** Surveillance après correction, en jours (§7.4). */
export const DEFAULT_WATCH_DAYS = 14;

/** Historique initialisé à l'installation, en jours (PC-10). */
export const BOOTSTRAP_DAYS = 90;

/** Taille d'un lot d'initialisation, en tickets (§14). */
export const BOOTSTRAP_BATCH = 50;

/** Délai de reconnaissance d'un ticket arrivé, en secondes (PC-07). */
export const MATCH_DEADLINE_SECONDS = 30;

/** Périodes d'addition affichées (§9). */
export const BILL_PERIODS: readonly BillPeriod[] = ['30d', '90d'];

/** Les deux natures de terme du vocabulaire, dans l'ordre d'affichage (§8.3). */
export const TERM_KINDS: readonly TermKind[] = ['system', 'symptom'];

/** Les cinq états d'une grappe, dans l'ordre d'affichage (§8.5). */
export const CLUSTER_STATUSES: readonly ClusterStatus[] = [
  'suspect',
  'problem',
  'recurring',
  'watching',
  'dismissed',
];

/** Les sept états du cycle de vie d'un problème, dans l'ordre du parcours (§5). */
export const PROBLEM_STATES: readonly ProblemState[] = [
  'suspect',
  'confirmed',
  'cause-known',
  'workaround-published',
  'fixed',
  'regression',
  'verified',
];

/** Les trois bases d'un rattachement, de la plus certaine à la plus discutée (§8.4). */
export const MEMBERSHIP_BASES: readonly MembershipBasis[] = ['rule', 'similarity', 'human'];

/** Les trois niveaux de confiance, du plus fort au plus faible (§8.4). */
export const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

/** Les huit postes de l'addition, dans l'ordre d'affichage (§9). */
export const BILL_LINE_KEYS: readonly BillLineKey[] = [
  'tickets',
  'hours',
  'people',
  'orgs',
  'slaBreaches',
  'reopens',
  'escalations',
  'meToo',
];

/** Postes d'addition du MVP (lot M) ; les autres sont désactivés par défaut (§6). */
export const MVP_BILL_LINES: readonly BillLineKey[] = ['tickets', 'hours', 'people'];

/** Les trois seuils réglables qui font naître un suspect (§8.5). */
export const THRESHOLD_HITS: readonly ThresholdHit[] = ['tickets', 'hours', 'people'];

/** Identifiant réservé à la signature indéterminée (« ça ne marche pas », §18). */
export const UNDETERMINED_ID = 'undetermined';

/** Libellé de la signature indéterminée, dans la langue du projet (§18). */
export const UNDETERMINED_LABEL = { en: 'undetermined', fr: 'indéterminée' } as const;
