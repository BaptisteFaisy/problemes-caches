/**
 * Construction de l'état du site de démonstration — **pur et testé** (`build.test.ts`).
 *
 * Ce module ne touche pas au DOM : il construit l'état de la démonstration en
 * appelant le vrai domaine de l'app (`src/core`) sur le vrai jeu d'exemple
 * (`src/sample`). Le rendu (`render.ts`) n'y ajoute aucun calcul (§17).
 *
 * Deux écarts assumés avec l'app réelle, et signalés à l'écran :
 * - la signature des tickets vient du jeu d'exemple, pas du modèle (dans Jira,
 *   c'est `extractSignature` via Forge LLM, §8.2) ;
 * - la marche 2 du rattachement (§8.4, comparaison par modèle) utilise ici un
 *   comparateur lexical déterministe : `DemoMatch.usedDemoComparator` le dit.
 */

import type { BillTicket } from '../../src/core/bill';
import { computeBill, computeTrend, hoursOf } from '../../src/core/bill';
import { classifyRecurring, clusterIdOf, computeCluster } from '../../src/core/cluster';
import { detectSurge } from '../../src/core/surge';
import { suggestNewTerm } from '../../src/core/vocabulary';
import { normalizeTrigger, signatureKey } from '../../src/core/types';
import type {
  BillPeriod,
  Confidence,
  MembershipBasis,
  ProblemBill,
  Settings,
  Term,
  Thresholds,
  Trend,
  Vocabulary,
} from '../../src/core/types';
import { defaultSettings } from '../../src/core/types';
import { buildDataset } from '../../src/sample/build';
import {
  SAMPLE_ANCHOR_ISO,
  SAMPLE_DEFAULT_SEED,
  SAMPLE_PROJECT_KEY,
  SAMPLE_WINDOW_DAYS,
} from '../../src/sample/dataset';
import type { SampleTicket } from '../../src/sample/dataset';
import type {
  DemoCluster,
  DemoLocale,
  DemoMatch,
  DemoMeToo,
  DemoProblem,
  DemoState,
  DemoSurge,
  DemoTicket,
  DemoTotals,
} from './types';

/** Déclencheurs du jeu d'exemple, traduits pour l'affichage seulement. */
const TRIGGERS: Record<string, { fr: string; en: string }> = {
  'après la mise à jour du poste': { fr: 'après la mise à jour du poste', en: 'after the workstation update' },
  '3e étage': { fr: '3e étage', en: 'third floor' },
  'après la clôture mensuelle': { fr: 'après la clôture mensuelle', en: 'after the monthly close' },
  '': { fr: '', en: '' },
};

/** Déclencheur affiché dans la langue du site (la donnée, elle, ne change pas). */
function triggerOf(texte: string, locale: DemoLocale): string {
  const trouve = TRIGGERS[texte];
  return trouve ? trouve[locale] : texte;
}

/** Clé du problème de démonstration déjà confirmé (§7.1 : « PRB-12 »). */
const SEEDED_PROBLEM_GROUP = 'remote-access';

/** Fenêtres d'addition servies par le site (§9). */
const PERIOD_DAYS: Record<BillPeriod, number> = { '30d': 30, '90d': 90 };

/** Durée moyenne d'une intervention, réglable (§9). */
const MINUTES_PER_TOUCH = 10;

/**
 * Libellés lisibles des termes du jeu d'exemple, en français et en anglais.
 *
 * Dans l'app, ces libellés viennent du modèle et du vocabulaire tenu (§8.2,
 * §8.3) ; le jeu d'exemple ne fournit que des identifiants stables. Ce tableau
 * est donc de la présentation, pas du métier — et il est la seule source des
 * libellés affichés par le site.
 */
const LABELS: Record<string, { fr: string; en: string }> = {
  'sys-remote-access': { fr: 'Accès distant', en: 'Remote access' },
  'sym-connection-drop': { fr: 'déconnexion', en: 'connection drop' },
  'sys-printer': { fr: 'Imprimante', en: 'Printer' },
  'sym-offline': { fr: 'hors service', en: 'offline' },
  'sys-billing': { fr: 'Facturation', en: 'Billing' },
  'sym-duplicate-invoice': { fr: 'facture en double', en: 'duplicate invoice' },
  'sys-accounts': { fr: 'Comptes', en: 'Accounts' },
  'sym-password-reset': { fr: 'réinitialisation de mot de passe', en: 'password reset' },
  'sys-mail': { fr: 'Messagerie', en: 'Mail' },
  'sym-error-signature': { fr: 'signature refusée', en: 'signature rejected' },
  'sym-attachment-refused': { fr: 'pièce jointe refusée', en: 'attachment refused' },
  'sys-network': { fr: 'Réseau', en: 'Network' },
  'sym-slow': { fr: 'lenteur', en: 'slow' },
  'sym-cut': { fr: 'coupure', en: 'outage' },
  'sys-workstation': { fr: 'Poste de travail', en: 'Workstation' },
  'sym-software': { fr: 'erreur logicielle', en: 'software error' },
  'undetermined': { fr: 'indéterminée', en: 'undetermined' },
};

/** Contournement validé du problème de démonstration (§7.2). */
const SEEDED_WORKAROUND = {
  en: 'Reinstall the VPN profile, then reconnect. Validated on 41 tickets.',
  fr: 'Réinstaller le profil VPN puis se reconnecter. Validé sur 41 tickets.',
} as const;

/** Cause connue du problème de démonstration (§5). */
const SEEDED_CAUSE = {
  en: 'The workstation update resets the VPN profile permissions.',
  fr: 'La mise à jour du poste réinitialise les droits du profil VPN.',
} as const;

// ---------------------------------------------------------------------------
// Construction de l'état
// ---------------------------------------------------------------------------

/** Ticket du jeu d'exemple → ticket affiché par le site. */
function toDemoTicket(ticket: SampleTicket): DemoTicket {
  return {
    issueId: ticket.issueId,
    issueKey: ticket.issueKey,
    summary: ticket.summary,
    createdAt: ticket.createdAt,
    reporter: ticket.reporter ?? 'unknown',
    organization: ticket.organization,
    language: ticket.language,
    group: ticket.group,
    kind: ticket.kind,
    visible: ticket.visible,
    touches: ticket.touches,
    loggedSeconds: ticket.loggedSeconds,
    reopened: ticket.reopened,
    escalated: ticket.escalated,
    slaBreached: ticket.slaBreached,
    systemId: ticket.systemId,
    symptomId: ticket.symptomId,
    triggerText: ticket.triggerText,
    undetermined: ticket.undetermined,
  };
}

/** Heures d'un ticket, selon la règle du §9 (temps saisi, sinon interventions). */
function ticketHours(ticket: DemoTicket): number {
  return hoursOf([toBillTicket(ticket)], MINUTES_PER_TOUCH).hours;
}

/** Ticket au format attendu par `computeCluster` (§8.5). */
function toWindowTicket(ticket: DemoTicket) {
  return {
    issueId: ticket.issueId,
    reporter: ticket.reporter,
    hours: ticketHours(ticket),
    createdAt: ticket.createdAt,
  };
}

/** Ticket au format attendu par `computeBill` (§9). */
function toBillTicket(ticket: DemoTicket): BillTicket {
  return {
    issueId: ticket.issueId,
    reporter: ticket.reporter,
    organization: ticket.organization,
    loggedSeconds: ticket.loggedSeconds,
    touches: ticket.touches,
    reopened: ticket.reopened,
    escalated: ticket.escalated,
    slaBreached: ticket.slaBreached,
    visible: ticket.visible,
  };
}

/** Regroupe les tickets par signature (§4) : une clé → ses tickets. */
function groupBySignature(tickets: readonly DemoTicket[]): Map<string, DemoTicket[]> {
  const groups = new Map<string, DemoTicket[]>();
  for (const ticket of tickets) {
    if (ticket.undetermined) continue;              // §18 : jamais regroupé d'office
    const key = signatureKey(ticket.systemId, ticket.symptomId, ticket.triggerText);
    const bucket = groups.get(key);
    if (bucket) bucket.push(ticket);
    else groups.set(key, [ticket]);
  }
  return groups;
}

/** Addition d'une grappe sur une période, « moi aussi » compris (§9). */
export function billFor(
  clusterId: string,
  tickets: readonly DemoTicket[],
  meToo: readonly DemoMeToo[],
  period: BillPeriod,
  now: string,
  settings: Settings,
): ProblemBill {
  const depuis = Date.parse(now) - PERIOD_DAYS[period] * 86_400_000;
  const dansFenetre = tickets.filter((ticket) => Date.parse(ticket.createdAt) >= depuis);
  return computeBill({
    problemId: clusterId,
    period,
    tickets: dansFenetre.map(toBillTicket),
    meToo: meToo.map((entry) => ({ accountId: entry.name, organization: entry.organization })),
    minutesPerTouch: settings.minutesPerTouch,
    hourRateEur: settings.hourRateEur,
    now,
  });
}

/** Tendance entre les 30 derniers jours et les 30 précédents (§9). */
export function trendFor(tickets: readonly DemoTicket[], meToo: readonly DemoMeToo[], clusterId: string, now: string, settings: Settings): Trend {
  const previousNow = new Date(Date.parse(now) - 30 * 86_400_000).toISOString();
  const current = billFor(clusterId, tickets, meToo, '30d', now, settings);
  const previous = billFor(clusterId, tickets, meToo, '30d', previousNow, settings);
  return computeTrend(previous, current);
}

/** Vocabulaire tenu, dérivé des signatures du jeu (§8.3), libellés dans la langue du site. */
function buildVocabulary(
  tickets: readonly DemoTicket[],
  projectId: string,
  now: string,
  locale: DemoLocale,
): Vocabulary {
  const systems: Term[] = [];
  const symptoms: Term[] = [];
  const vus = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.undetermined) continue;
    ajouterTerme(systems, vus, 'system', ticket.systemId, projectId, now, locale);
    ajouterTerme(symptoms, vus, 'symptom', ticket.symptomId, projectId, now, locale);
  }
  return { systems, symptoms };
}

/** Ajoute un terme une seule fois ; son identifiant reste celui du jeu (§8.3). */
function ajouterTerme(
  bucket: Term[],
  vus: Set<string>,
  kind: 'system' | 'symptom',
  id: string,
  projectId: string,
  now: string,
  locale: DemoLocale,
): void {
  const cle = `${kind}:${id}`;
  if (vus.has(cle)) return;
  vus.add(cle);
  const terme = suggestNewTerm(projectId, kind, LABELS[id]?.[locale] ?? id, now);
  bucket.push({ ...terme, id });
}

/** Libellé lisible d'un terme, dans la langue du site (§8.3, §17). */
function labelOf(vocabulary: Vocabulary, kind: 'system' | 'symptom', id: string, locale: DemoLocale): string {
  const terms = kind === 'system' ? vocabulary.systems : vocabulary.symptoms;
  const trouve = terms.find((term) => term.id === id);
  return trouve?.label ?? LABELS[id]?.[locale] ?? id;
}

/** Le problème déjà confirmé de la démo (§7.1) : état, cause, contournement. */
function seededProblem(locale: DemoLocale, tickets: readonly DemoTicket[]): DemoProblem {
  const fixed = tickets.length > 0;
  return {
    key: 'PRB-12',
    state: 'workaround-published',
    cause: SEEDED_CAUSE[locale],
    workaround: SEEDED_WORKAROUND[locale],
    workaroundUrl: 'https://example.atlassian.net/wiki/spaces/KB/pages/42',
    fixIssueKey: 'NET-208',
    fixedAt: null,
    watchUntil: null,
    regression: false,
    publishedToPortal: true,
    meToo: fixed
      ? [
          { name: 'Camille Fontaine', organization: 'Groupe Lumière', at: SAMPLE_ANCHOR_ISO },
          { name: 'Youssef Barbier', organization: 'Atelier Bourdon', at: SAMPLE_ANCHOR_ISO },
        ]
      : [],
  };
}

/** Construit une grappe complète : compteurs, additions, tendance, statut. */
export function buildCluster(
  tickets: DemoTicket[],
  vocabulary: Vocabulary,
  settings: Settings,
  locale: DemoLocale,
  now: string,
): DemoCluster {
  const first = tickets[0]!;
  const projectId = settings.projectId;
  const id = clusterIdOf(projectId, first.systemId, first.symptomId, first.triggerText);
  const problem = first.group === SEEDED_PROBLEM_GROUP ? seededProblem(locale, tickets) : null;
  const meToo = problem?.meToo ?? [];
  const recurring = classifyRecurring({
    requestType: first.kind === 'recurring' ? 'Password reset' : null,
    tickets: tickets.length,
    overThreshold: true,
  });
  const cluster = computeCluster({
    projectId,
    systemId: first.systemId,
    symptomId: first.symptomId,
    triggerText: first.triggerText,
    tickets: tickets.map(toWindowTicket),
    thresholds: settings.thresholds,
    now,
    status: problem ? 'problem' : recurring ? 'recurring' : undefined,
    requestType: first.kind === 'recurring' ? 'Password reset' : null,
  });
  return {
    id,
    signature: `${labelOf(vocabulary, 'system', first.systemId, locale)} · ${labelOf(vocabulary, 'symptom', first.symptomId, locale)} · ${triggerOf(first.triggerText, locale)}`,
    systemLabel: labelOf(vocabulary, 'system', first.systemId, locale),
    symptomLabel: labelOf(vocabulary, 'symptom', first.symptomId, locale),
    triggerText: triggerOf(first.triggerText, locale),
    status: cluster.status,
    kind: first.kind,
    tickets,
    bill30: billFor(id, tickets, meToo, '30d', now, settings),
    bill90: billFor(id, tickets, meToo, '90d', now, settings),
    trend: trendFor(tickets, meToo, id, now, settings),
    overThreshold: cluster.overThreshold,
    thresholdHit: cluster.thresholdHit,
    problem,
  };
}

/**
 * Flambée d'une grappe, détectée **au moment où elle se produit** (§8.6).
 *
 * L'app évalue le seuil à chaque arrivée de ticket, pas à la fin de la fenêtre :
 * le site rejoue donc la chronologie de la grappe et garde la première alerte.
 * Évaluer seulement à `now` ne verrait jamais la flambée du jeu d'exemple, qui
 * a eu lieu 19 jours avant la fin de la fenêtre.
 */
function findSurge(cluster: DemoCluster, settings: Settings): DemoSurge | null {
  const dates = cluster.tickets.map((ticket) => ticket.createdAt).sort();
  for (let i = 0; i < dates.length; i += 1) {
    const now = dates[i]!;
    const vus = dates.slice(0, i + 1).map((at) => ({ at }));
    const surge = detectSurge({
      clusterId: cluster.id,
      projectId: settings.projectId,
      recent: vus,
      history: vus,
      windowMinutes: settings.surgeWindowMinutes,
      factor: settings.surgeFactor,
      now,
    });
    if (surge) {
      return {
        clusterId: cluster.id,
        signature: cluster.signature,
        rate: surge.rate,
        baseline: surge.baseline,
        factor: surge.factor,
        startedAt: surge.startedAt,
        expected: surge.expected,
      };
    }
  }
  return null;
}

/** Flambées de toutes les grappes, triées par facteur décroissant (§8.6). */
export function buildSurges(clusters: readonly DemoCluster[], settings: Settings): DemoSurge[] {
  const surges: DemoSurge[] = [];
  for (const cluster of clusters) {
    const surge = findSurge(cluster, settings);
    if (surge) surges.push(surge);
  }
  return surges.sort((a, b) => b.factor - a.factor);
}

/**
 * Totaux affichés en tête du site (§9).
 *
 * Les personnes touchées sont comptées **une fois** toutes grappes confondues :
 * additionner les compteurs par grappe compterait deux fois quelqu'un touché par
 * deux problèmes (§18 : « moi aussi » de quelqu'un qui a aussi un ticket).
 */
export function buildTotals(state: Omit<DemoState, 'totals'>): DemoTotals {
  const active = state.clusters.filter((cluster) => cluster.status !== 'dismissed');
  const depuis = Date.parse(state.now) - PERIOD_DAYS['30d'] * 86_400_000;
  const personnes = new Set<string>();
  for (const cluster of active) {
    for (const ticket of cluster.tickets) {
      if (Date.parse(ticket.createdAt) >= depuis) personnes.add(ticket.reporter);
    }
    for (const entry of cluster.problem?.meToo ?? []) personnes.add(entry.name);
  }
  return {
    tickets: state.tickets.length,
    clusters: active.length,
    suspects: active.filter((cluster) => cluster.status === 'suspect').length,
    problems: active.filter((cluster) => cluster.problem !== null).length,
    hours30: Math.round(active.reduce((sum, cluster) => sum + cluster.bill30.hours, 0)),
    people30: personnes.size,
    undetermined: state.tickets.filter((ticket) => ticket.undetermined).length,
  };
}

/** Construit l'état initial de la démonstration (déterministe, §20). */
export function buildDemoState(locale: DemoLocale, seed: number = SAMPLE_DEFAULT_SEED): DemoState {
  const now = SAMPLE_ANCHOR_ISO;
  const dataset = buildDataset(seed);
  const tickets = dataset.tickets.map(toDemoTicket);
  const settings: Settings = {
    ...defaultSettings('demo-project', SAMPLE_PROJECT_KEY),
    minutesPerTouch: MINUTES_PER_TOUCH,
    enabledLines: ['tickets', 'hours', 'people', 'orgs', 'meToo'],
  };
  const vocabulary = buildVocabulary(tickets, settings.projectId, now, locale);
  const groups = groupBySignature(tickets);
  const clusters = [...groups.values()]
    .map((bucket) => buildCluster(bucket, vocabulary, settings, locale, now))
    .sort((a, b) => b.bill30.hours - a.bill30.hours || b.tickets.length - a.tickets.length);
  const base = {
    now,
    projectKey: SAMPLE_PROJECT_KEY,
    windowDays: SAMPLE_WINDOW_DAYS,
    period: '30d' as BillPeriod,
    locale,
    settings,
    tickets,
    clusters,
    surges: [] as DemoSurge[],
    vocabulary,
  };
  return { ...base, surges: buildSurges(clusters, settings), totals: buildTotals(base) };
}

