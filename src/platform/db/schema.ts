/**
 * DDL de la couche Forge SQL — les tables du cahier §15.
 *
 * Contraintes de la plateforme (§16) :
 * - Forge SQL ne supporte pas les clés étrangères : les liens entre tables
 *   sont portés par des colonnes `*_id` et des index, jamais par `FOREIGN KEY` ;
 * - une seule instruction par requête : `SCHEMA_STATEMENTS` est donc un tableau
 *   d'instructions complètes, exécutées une par une par `ensureSchema()` ;
 * - `CREATE TABLE IF NOT EXISTS` rend l'initialisation rejouable ;
 * - aucune recherche vectorielle n'est documentée : le regroupement repose sur
 *   la signature explicite (§8.1), jamais sur une distance.
 *
 * Vie privée (§17) : l'app conserve la signature et les indices, **pas le texte
 * intégral des tickets**. `ticket_fact.summary` est borné à 512 caractères et
 * le corps du ticket n'est jamais écrit en base.
 */

/** Les onze tables du §15, dans l'ordre de création. */
export const TABLE_NAMES = [
  'ticket_fact',
  'signature',
  'term',
  'cluster',
  'problem',
  'membership',
  'me_too',
  'problem_bill',
  'surge',
  'settings',
  'bootstrap_progress',
] as const;

/** Nom d'une table du schéma. */
export type TableName = (typeof TABLE_NAMES)[number];

/** Options communes : InnoDB, UTF-8, comparaison binaire (clés stables). */
const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';

/** DDL complet, une instruction par entrée. */
export const SCHEMA_STATEMENTS: string[] = [
  // Les faits d'un ticket : ce que l'addition consomme, rien de plus (§15).
  `CREATE TABLE IF NOT EXISTS ticket_fact (
    issue_id VARCHAR(64) NOT NULL,
    issue_key VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    project_key VARCHAR(64) NOT NULL,
    request_type VARCHAR(128) NULL,
    service VARCHAR(255) NULL,
    component VARCHAR(255) NULL,
    reporter VARCHAR(128) NULL,
    organization VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL,
    resolved_at DATETIME(3) NULL,
    touches INT NOT NULL DEFAULT 0,
    logged_seconds BIGINT NULL,
    reopened TINYINT(1) NOT NULL DEFAULT 0,
    escalated TINYINT(1) NOT NULL DEFAULT 0,
    sla_breached TINYINT(1) NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    summary VARCHAR(512) NOT NULL DEFAULT '',
    PRIMARY KEY (issue_id),
    KEY idx_ticket_fact_project (project_id, created_at),
    KEY idx_ticket_fact_key (issue_key),
    KEY idx_ticket_fact_reporter (project_id, reporter)
  ) ${TABLE_OPTIONS}`,

  // La signature d'un ticket, mise en cache par empreinte du texte (§8.2).
  `CREATE TABLE IF NOT EXISTS signature (
    issue_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    system_id VARCHAR(64) NOT NULL,
    symptom_id VARCHAR(64) NOT NULL,
    trigger_text VARCHAR(200) NOT NULL DEFAULT '',
    hard_keys_json JSON NULL,
    extracted_at DATETIME(3) NOT NULL,
    source_hash VARCHAR(64) NOT NULL,
    undetermined TINYINT(1) NOT NULL DEFAULT 0,
    language VARCHAR(16) NULL,
    PRIMARY KEY (issue_id),
    KEY idx_signature_cluster (project_id, system_id, symptom_id),
    KEY idx_signature_hash (source_hash)
  ) ${TABLE_OPTIONS}`,

  // Le vocabulaire tenu : systèmes et symptômes, fusions comprises (§8.3).
  `CREATE TABLE IF NOT EXISTS term (
    term_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    label VARCHAR(255) NOT NULL,
    merged_into VARCHAR(64) NULL,
    aliases_json JSON NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (term_id),
    KEY idx_term_project_kind (project_id, kind, merged_into),
    KEY idx_term_label (project_id, label)
  ) ${TABLE_OPTIONS}`,

  // Une grappe et ses compteurs de fenêtre glissante (§8.5).
  `CREATE TABLE IF NOT EXISTS cluster (
    cluster_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    system_id VARCHAR(64) NOT NULL,
    symptom_id VARCHAR(64) NOT NULL,
    trigger_text VARCHAR(200) NOT NULL DEFAULT '',
    tickets_30d INT NOT NULL DEFAULT 0,
    hours_30d DOUBLE NOT NULL DEFAULT 0,
    people_30d INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'watching',
    threshold_hit VARCHAR(16) NULL,
    first_seen_at DATETIME(3) NOT NULL,
    last_seen_at DATETIME(3) NOT NULL,
    PRIMARY KEY (cluster_id),
    KEY idx_cluster_project_status (project_id, status, tickets_30d),
    KEY idx_cluster_seen (project_id, last_seen_at)
  ) ${TABLE_OPTIONS}`,

  // Un problème : une grappe confirmée et son ticket unique (§10).
  `CREATE TABLE IF NOT EXISTS problem (
    problem_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    project_key VARCHAR(64) NOT NULL,
    issue_key VARCHAR(64) NULL,
    cluster_id VARCHAR(64) NOT NULL,
    system_id VARCHAR(64) NOT NULL,
    symptom_id VARCHAR(64) NOT NULL,
    trigger_text VARCHAR(200) NOT NULL DEFAULT '',
    state VARCHAR(32) NOT NULL DEFAULT 'suspect',
    cause TEXT NULL,
    workaround TEXT NULL,
    workaround_url VARCHAR(1024) NULL,
    fix_issue_key VARCHAR(64) NULL,
    fixed_at DATETIME(3) NULL,
    watch_until DATETIME(3) NULL,
    regression TINYINT(1) NOT NULL DEFAULT 0,
    published_to_portal TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (problem_id),
    KEY idx_problem_project_state (project_id, state),
    KEY idx_problem_issue (issue_key),
    KEY idx_problem_cluster (cluster_id)
  ) ${TABLE_OPTIONS}`,

  // Appartenance d'un ticket à un problème, avec sa base et sa confiance (§8.4).
  `CREATE TABLE IF NOT EXISTS membership (
    issue_id VARCHAR(64) NOT NULL,
    problem_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    issue_key VARCHAR(64) NOT NULL DEFAULT '',
    basis VARCHAR(16) NOT NULL DEFAULT 'similarity',
    confidence VARCHAR(8) NOT NULL DEFAULT 'medium',
    rationale VARCHAR(1024) NOT NULL DEFAULT '',
    proposed_at DATETIME(3) NOT NULL,
    confirmed_by VARCHAR(128) NULL,
    confirmed_at DATETIME(3) NULL,
    rejected TINYINT(1) NOT NULL DEFAULT 0,
    rejected_by VARCHAR(128) NULL,
    attached TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (issue_id, problem_id),
    KEY idx_membership_problem (problem_id, rejected),
    KEY idx_membership_project (project_id, attached)
  ) ${TABLE_OPTIONS}`,

  // « Moi aussi » : une personne touchée, sans ticket (§7.3, PC-16).
  `CREATE TABLE IF NOT EXISTS me_too (
    problem_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    organization VARCHAR(255) NULL,
    at DATETIME(3) NOT NULL,
    PRIMARY KEY (problem_id, account_id),
    KEY idx_me_too_problem (problem_id, at)
  ) ${TABLE_OPTIONS}`,

  // L'addition d'un problème, par période : recalculée puis remplacée (§9).
  `CREATE TABLE IF NOT EXISTS problem_bill (
    problem_id VARCHAR(64) NOT NULL,
    period VARCHAR(8) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    tickets INT NOT NULL DEFAULT 0,
    hours DOUBLE NOT NULL DEFAULT 0,
    people INT NOT NULL DEFAULT 0,
    orgs INT NOT NULL DEFAULT 0,
    sla_breaches INT NOT NULL DEFAULT 0,
    reopens INT NOT NULL DEFAULT 0,
    escalations INT NOT NULL DEFAULT 0,
    me_too INT NOT NULL DEFAULT 0,
    hours_method VARCHAR(8) NOT NULL DEFAULT 'touches',
    minutes_per_touch INT NOT NULL DEFAULT 10,
    eur DOUBLE NULL,
    hour_rate_eur DOUBLE NULL,
    hidden_count INT NOT NULL DEFAULT 0,
    computed_at DATETIME(3) NOT NULL,
    PRIMARY KEY (problem_id, period),
    KEY idx_bill_project (project_id, period, hours)
  ) ${TABLE_OPTIONS}`,

  // Une flambée en cours (§8.6).
  `CREATE TABLE IF NOT EXISTS surge (
    surge_id VARCHAR(64) NOT NULL,
    cluster_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    started_at DATETIME(3) NOT NULL,
    rate INT NOT NULL DEFAULT 0,
    baseline DOUBLE NOT NULL DEFAULT 0,
    factor DOUBLE NOT NULL DEFAULT 0,
    incident_key VARCHAR(64) NULL,
    expected TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (surge_id),
    KEY idx_surge_project (project_id, started_at),
    KEY idx_surge_cluster (cluster_id)
  ) ${TABLE_OPTIONS}`,

  // Réglages d'un projet suivi (§13 écran 5) : une ligne par projet.
  `CREATE TABLE IF NOT EXISTS settings (
    project_id VARCHAR(64) NOT NULL,
    project_key VARCHAR(64) NOT NULL,
    thresholds_json JSON NULL,
    minutes_per_touch INT NOT NULL DEFAULT 10,
    hour_rate_eur DOUBLE NULL,
    problem_issue_type VARCHAR(128) NULL,
    portal_services_json JSON NULL,
    surge_factor DOUBLE NOT NULL DEFAULT 3,
    surge_window_minutes INT NOT NULL DEFAULT 120,
    watch_days INT NOT NULL DEFAULT 14,
    enabled_lines_json JSON NULL,
    demo_data TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id)
  ) ${TABLE_OPTIONS}`,

  // Progression de l'initialisation des 90 jours (PC-10).
  `CREATE TABLE IF NOT EXISTS bootstrap_progress (
    project_id VARCHAR(64) NOT NULL,
    total INT NOT NULL DEFAULT 0,
    done INT NOT NULL DEFAULT 0,
    failed INT NOT NULL DEFAULT 0,
    started_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    finished TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id)
  ) ${TABLE_OPTIONS}`,
];
