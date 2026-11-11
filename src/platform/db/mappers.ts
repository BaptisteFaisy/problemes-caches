/**
 * Mappers : ligne SQL → type du domaine (§15).
 *
 * Un mapper par table, une seule implémentation par conversion (règle « zéro
 * duplication »). Aucun mapper ne jette : une colonne absente ou illisible
 * retombe sur son défaut, grâce aux convertisseurs de `rows.ts`. Le reste de la
 * couche de stockage n'écrit donc jamais de conversion maison.
 *
 * Vie privée (§17, PC-13) : `visible` est conservé tel quel — le filtrage des
 * tickets à visibilité restreinte est décidé plus haut, jamais ici.
 */

import type {
  BillLineKey,
  BillPeriod,
  BootstrapProgress,
  Cluster,
  ClusterStatus,
  Confidence,
  HardClues,
  HoursMethod,
  MeToo,
  Membership,
  MembershipBasis,
  Problem,
  ProblemBill,
  ProblemState,
  Settings,
  Surge,
  Term,
  TermKind,
  Thresholds,
  TicketFact,
  TicketSignature,
} from '../../core/types';
import {
  BILL_LINE_KEYS,
  CLUSTER_STATUSES,
  DEFAULT_MINUTES_PER_TOUCH,
  DEFAULT_THRESHOLDS,
  DEFAULT_WATCH_DAYS,
  MVP_BILL_LINES,
  PROBLEM_STATES,
  SUSPECT_WINDOW_DAYS,
  SURGE_FACTOR,
  SURGE_WINDOW_MINUTES,
  TERM_KINDS,
  UNDETERMINED_ID,
} from '../../core/types';
import {
  parseJson,
  pickOne,
  toBool,
  toConfidence,
  toBasis,
  toIso,
  toNumber,
  toNumberOrNull,
  toPeriod,
  toText,
  toTextOrNull,
  DB_EPOCH,
} from './rows';

/** Ligne SQL brute : les colonnes arrivent typées `unknown` du pilote. */
export type Row = Record<string, unknown>;

/** Méthodes de calcul des heures reconnues en base (§9). */
const HOURS_METHODS: readonly HoursMethod[] = ['logged', 'touches', 'mixed'];

// ---------------------------------------------------------------------------
// ticket_fact (§15)
// ---------------------------------------------------------------------------

export function toTicketFact(row: Row): TicketFact {
  return {
    issueId: toText(row['issue_id']),
    issueKey: toText(row['issue_key']),
    projectId: toText(row['project_id']),
    projectKey: toText(row['project_key']),
    requestType: toTextOrNull(row['request_type']),
    service: toTextOrNull(row['service']),
    component: toTextOrNull(row['component']),
    reporter: toTextOrNull(row['reporter']),
    organization: toTextOrNull(row['organization']),
    createdAt: toIso(row['created_at']) ?? DB_EPOCH,
    resolvedAt: toIso(row['resolved_at']),
    touches: toNumber(row['touches']),
    loggedSeconds: toNumberOrNull(row['logged_seconds']),
    reopened: toBool(row['reopened']),
    escalated: toBool(row['escalated']),
    slaBreached: toBool(row['sla_breached']),
    visible: toBool(row['visible'], true),
    summary: toText(row['summary']),
  };
}

// ---------------------------------------------------------------------------
// signature (§15) — le texte du ticket n'est jamais conservé (§17)
// ---------------------------------------------------------------------------

/** Indices certains vides : repli quand `hard_keys_json` est illisible. */
export function emptyHardClues(): HardClues {
  return {
    requestType: null,
    service: null,
    component: null,
    errorCodes: [],
    product: null,
    version: null,
    os: null,
    assetIds: [],
    organization: null,
  };
}

/** Indices certains lus depuis la colonne JSON (bornés à 10 entrées, §8.2). */
export function toHardClues(value: unknown): HardClues {
  const raw = parseJson<Record<string, unknown>>(value, {});
  const list = (key: string): string[] => {
    const parsed = parseJson<unknown>(raw[key], []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, 10);
  };
  return {
    requestType: toTextOrNull(raw['requestType']),
    service: toTextOrNull(raw['service']),
    component: toTextOrNull(raw['component']),
    errorCodes: list('errorCodes'),
    product: toTextOrNull(raw['product']),
    version: toTextOrNull(raw['version']),
    os: toTextOrNull(raw['os']),
    assetIds: list('assetIds'),
    organization: toTextOrNull(raw['organization']),
  };
}

export function toSignature(row: Row): TicketSignature {
  const systemId = toText(row['system_id']) || UNDETERMINED_ID;
  const symptomId = toText(row['symptom_id']) || UNDETERMINED_ID;
  return {
    issueId: toText(row['issue_id']),
    systemId,
    symptomId,
    triggerText: toText(row['trigger_text']),
    hardClues: toHardClues(row['hard_keys_json']),
    extractedAt: toIso(row['extracted_at']) ?? DB_EPOCH,
    sourceHash: toText(row['source_hash']),
    undetermined: toBool(row['undetermined']) || systemId === UNDETERMINED_ID,
    language: toTextOrNull(row['language']),
  };
}

// ---------------------------------------------------------------------------
// term (§15, vocabulaire tenu §8.3)
// ---------------------------------------------------------------------------

export function toTerm(row: Row): Term {
  return {
    id: toText(row['term_id']),
    projectId: toText(row['project_id']),
    kind: pickOne<TermKind>(row['kind'], TERM_KINDS, 'system'),
    label: toText(row['label']),
    mergedInto: toTextOrNull(row['merged_into']),
    aliases: parseJson<string[]>(row['aliases_json'], []),
    createdAt: toIso(row['created_at']) ?? DB_EPOCH,
  };
}

// ---------------------------------------------------------------------------
// cluster (§15, §8.5)
// ---------------------------------------------------------------------------

export function toCluster(row: Row): Cluster {
  const tickets = toNumber(row['tickets_30d']);
  const hours = toNumber(row['hours_30d']);
  const people = toNumber(row['people_30d']);
  const status = pickOne<ClusterStatus>(row['status'], CLUSTER_STATUSES, 'watching');
  return {
    id: toText(row['cluster_id']),
    projectId: toText(row['project_id']),
    systemId: toText(row['system_id']),
    symptomId: toText(row['symptom_id']),
    triggerText: toText(row['trigger_text']),
    tickets30d: tickets,
    hours30d: hours,
    people30d: people,
    status,
    firstSeenAt: toIso(row['first_seen_at']) ?? DB_EPOCH,
    lastSeenAt: toIso(row['last_seen_at']) ?? DB_EPOCH,
    overThreshold: status === 'suspect' || status === 'problem',
    thresholdHit: toTextOrNull(row['threshold_hit']) as Cluster['thresholdHit'],
  };
}

// ---------------------------------------------------------------------------
// problem (§15, §5, §10)
// ---------------------------------------------------------------------------

export function toProblem(row: Row): Problem {
  return {
    id: toText(row['problem_id']),
    projectId: toText(row['project_id']),
    projectKey: toText(row['project_key']),
    issueKey: toTextOrNull(row['issue_key']),
    clusterId: toText(row['cluster_id']),
    systemId: toText(row['system_id']),
    symptomId: toText(row['symptom_id']),
    triggerText: toText(row['trigger_text']),
    state: pickOne<ProblemState>(row['state'], PROBLEM_STATES, 'suspect'),
    cause: toTextOrNull(row['cause']),
    workaround: toTextOrNull(row['workaround']),
    workaroundUrl: toTextOrNull(row['workaround_url']),
    fixIssueKey: toTextOrNull(row['fix_issue_key']),
    fixedAt: toIso(row['fixed_at']),
    watchUntil: toIso(row['watch_until']),
    regression: toBool(row['regression']),
    publishedToPortal: toBool(row['published_to_portal']),
    createdAt: toIso(row['created_at']) ?? DB_EPOCH,
    updatedAt: toIso(row['updated_at']) ?? DB_EPOCH,
  };
}

// ---------------------------------------------------------------------------
// membership (§15, §8.4)
// ---------------------------------------------------------------------------

export function toMembership(row: Row): Membership {
  const confidence: Confidence = toConfidence(row['confidence']);
  const basis: MembershipBasis = toBasis(row['basis']);
  return {
    issueId: toText(row['issue_id']),
    issueKey: toText(row['issue_key']),
    problemId: toText(row['problem_id']),
    basis,
    confidence,
    rationale: toText(row['rationale']),
    proposedAt: toIso(row['proposed_at']) ?? DB_EPOCH,
    confirmedBy: toTextOrNull(row['confirmed_by']),
    confirmedAt: toIso(row['confirmed_at']),
    rejected: toBool(row['rejected']),
    rejectedBy: toTextOrNull(row['rejected_by']),
    attached: toBool(row['attached']),
  };
}

// ---------------------------------------------------------------------------
// me_too (§15, §7.3)
// ---------------------------------------------------------------------------

export function toMeToo(row: Row): MeToo {
  return {
    problemId: toText(row['problem_id']),
    accountId: toText(row['account_id']),
    displayName: toText(row['display_name']),
    organization: toTextOrNull(row['organization']),
    at: toIso(row['at']) ?? DB_EPOCH,
  };
}

// ---------------------------------------------------------------------------
// problem_bill (§15, §9)
// ---------------------------------------------------------------------------

export function toBill(row: Row): ProblemBill {
  return {
    problemId: toText(row['problem_id']),
    period: toPeriod(row['period']) as BillPeriod,
    tickets: toNumber(row['tickets']),
    hours: toNumber(row['hours']),
    people: toNumber(row['people']),
    orgs: toNumber(row['orgs']),
    slaBreaches: toNumber(row['sla_breaches']),
    reopens: toNumber(row['reopens']),
    escalations: toNumber(row['escalations']),
    meToo: toNumber(row['me_too']),
    hoursMethod: pickOne<HoursMethod>(row['hours_method'], HOURS_METHODS, 'touches'),
    minutesPerTouch: toNumber(row['minutes_per_touch'], DEFAULT_MINUTES_PER_TOUCH),
    eur: toNumberOrNull(row['eur']),
    hourRateEur: toNumberOrNull(row['hour_rate_eur']),
    hiddenCount: toNumber(row['hidden_count']),
    computedAt: toIso(row['computed_at']) ?? DB_EPOCH,
  };
}

// ---------------------------------------------------------------------------
// surge (§15, §8.6)
// ---------------------------------------------------------------------------

export function toSurge(row: Row): Surge {
  return {
    id: toText(row['surge_id']),
    clusterId: toText(row['cluster_id']),
    projectId: toText(row['project_id']),
    startedAt: toIso(row['started_at']) ?? DB_EPOCH,
    rate: toNumber(row['rate']),
    baseline: toNumber(row['baseline']),
    factor: toNumber(row['factor']),
    incidentKey: toTextOrNull(row['incident_key']),
    expected: toBool(row['expected']),
  };
}

// ---------------------------------------------------------------------------
// settings (§15, §13 écran 5)
// ---------------------------------------------------------------------------

/** Seuils lus en base ; une valeur absente retombe sur les seuils du cahier. */
export function toThresholds(value: unknown): Thresholds {
  const raw = parseJson<Record<string, unknown>>(value, {});
  return {
    tickets: toNumber(raw['tickets'], DEFAULT_THRESHOLDS.tickets),
    hours: toNumber(raw['hours'], DEFAULT_THRESHOLDS.hours),
    people: toNumber(raw['people'], DEFAULT_THRESHOLDS.people),
    windowDays: toNumber(raw['windowDays'], SUSPECT_WINDOW_DAYS),
  };
}

/** Postes d'addition activés : au minimum ceux du MVP (§6). */
function toEnabledLines(value: unknown): BillLineKey[] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed) || parsed.length === 0) return [...MVP_BILL_LINES];
  const allowed = parsed.filter((key): key is BillLineKey =>
    (BILL_LINE_KEYS as readonly string[]).includes(String(key)),
  );
  return allowed.length > 0 ? allowed : [...MVP_BILL_LINES];
}

export function toSettings(row: Row): Settings {
  return {
    projectId: toText(row['project_id']),
    projectKey: toText(row['project_key']),
    thresholds: toThresholds(row['thresholds_json']),
    minutesPerTouch: toNumber(row['minutes_per_touch'], DEFAULT_MINUTES_PER_TOUCH),
    hourRateEur: toNumberOrNull(row['hour_rate_eur']),
    problemIssueType: toTextOrNull(row['problem_issue_type']),
    portalServices: parseJson<string[]>(row['portal_services_json'], []),
    surgeFactor: toNumber(row['surge_factor'], SURGE_FACTOR),
    surgeWindowMinutes: toNumber(row['surge_window_minutes'], SURGE_WINDOW_MINUTES),
    watchDays: toNumber(row['watch_days'], DEFAULT_WATCH_DAYS),
    enabledLines: toEnabledLines(row['enabled_lines_json']),
    demoData: toBool(row['demo_data']),
  };
}

// ---------------------------------------------------------------------------
// bootstrap_progress (§15, PC-10)
// ---------------------------------------------------------------------------

export function toBootstrap(row: Row): BootstrapProgress {
  return {
    projectId: toText(row['project_id']),
    total: toNumber(row['total']),
    done: toNumber(row['done']),
    failed: toNumber(row['failed']),
    startedAt: toIso(row['started_at']) ?? DB_EPOCH,
    updatedAt: toIso(row['updated_at']) ?? DB_EPOCH,
    finished: toBool(row['finished']),
  };
}
