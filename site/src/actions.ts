/**
 * Interactions de la démonstration — **pures** : chaque fonction rend un nouvel
 * état, jamais une mutation. Elles repassent par le domaine de l'app
 * (`computeCluster`, `computeBill`, `detectSurge`, `matchTicket`) pour que ce
 * que le visiteur voit soit ce que l'app produit dans Jira.
 *
 * Écart assumé et affiché à l'écran : la marche 2 du rattachement (§8.4,
 * comparaison par modèle) utilise ici un comparateur lexical déterministe, car
 * aucun modèle n'est joignable depuis un navigateur. `usedDemoComparator` le dit.
 */

import { computeBill, computeTrend, hoursOf } from '../../src/core/bill';
import { detectSurge } from '../../src/core/surge';
import { normalizeTrigger } from '../../src/core/types';
import { normalizeLabel } from '../../src/core/vocabulary';
import type { BillPeriod, Confidence, MembershipBasis } from '../../src/core/types';
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
import { billFor, buildCluster, buildDemoState, buildSurges, buildTotals, trendFor } from './build';

// ---------------------------------------------------------------------------
// Interactions de la démonstration
// ---------------------------------------------------------------------------

/** Reconstruit les grappes après un changement (statut, tickets retirés). */
function rebuild(state: DemoState, clusters: DemoCluster[]): DemoState {
  const base = { ...state, clusters };
  return { ...base, surges: buildSurges(clusters, state.settings, state.now), totals: buildTotals(base) };
}

/** Recalcule une grappe après retrait d'un ticket (§19.6). */
function rebuildCluster(state: DemoState, cluster: DemoCluster, tickets: DemoTicket[]): DemoCluster {
  const fresh = buildCluster(tickets, state.vocabulary, state.settings, state.locale, state.now);
  return { ...fresh, problem: cluster.problem, status: cluster.status };
}

/** Confirme une grappe : un seul ticket de problème, les tickets liés (§7.1, §10). */
export function confirmSuspect(state: DemoState, clusterId: string, removedIssueKeys: string[]): DemoState {
  const nextNumber = state.clusters.filter((cluster) => cluster.problem).length + 13;
  const clusters = state.clusters.map((cluster) => {
    if (cluster.id !== clusterId) return cluster;
    const kept = cluster.tickets.filter((ticket) => !removedIssueKeys.includes(ticket.issueKey));
    const problem: DemoProblem = {
      key: `PRB-${nextNumber}`,
      state: 'confirmed',
      cause: null,
      workaround: null,
      workaroundUrl: null,
      fixIssueKey: null,
      fixedAt: null,
      watchUntil: null,
      regression: false,
      publishedToPortal: false,
      meToo: [],
    };
    return { ...rebuildCluster(state, cluster, kept), problem, status: 'problem' as const };
  });
  return rebuild(state, clusters);
}

/** Rejette une grappe : elle ne sera plus proposée (§7.1). */
export function rejectSuspect(state: DemoState, clusterId: string): DemoState {
  const clusters = state.clusters.map((cluster) =>
    cluster.id === clusterId ? { ...cluster, status: 'dismissed' as const } : cluster,
  );
  return rebuild(state, clusters);
}

/** « Moi aussi » : la personne est comptée, aucun ticket n'est créé (§7.3). */
export function addMeToo(state: DemoState, clusterId: string, name: string, organization: string | null): DemoState {
  const clusters = state.clusters.map((cluster) => {
    if (cluster.id !== clusterId || !cluster.problem) return cluster;
    const entry: DemoMeToo = { name, organization, at: state.now };
    const problem = { ...cluster.problem, meToo: [...cluster.problem.meToo, entry] };
    return {
      ...cluster,
      problem,
      bill30: billFor(cluster.id, cluster.tickets, problem.meToo, '30d', state.now, state.settings),
      bill90: billFor(cluster.id, cluster.tickets, problem.meToo, '90d', state.now, state.settings),
    };
  });
  return rebuild(state, clusters);
}

/** Retire un ticket d'un problème : l'addition diminue d'autant (§19.6). */
export function detachTicket(state: DemoState, clusterId: string, issueKey: string): DemoState {
  const clusters = state.clusters.map((cluster) => {
    if (cluster.id !== clusterId) return cluster;
    const kept = cluster.tickets.filter((ticket) => ticket.issueKey !== issueKey);
    return rebuildCluster(state, cluster, kept);
  });
  return rebuild(state, clusters);
}

/** Change la période d'addition affichée (§9). */
export function withPeriod(state: DemoState, period: BillPeriod): DemoState {
  return { ...state, period };
}

/** Change la langue du site (§17 : anglais et français). */
export function withLocale(state: DemoState, locale: DemoLocale): DemoState {
  return buildDemoState(locale);
}

// ---------------------------------------------------------------------------
// Reconnaissance d'un texte libre (§8.4, §12)
// ---------------------------------------------------------------------------

/** Mots significatifs d'un texte, normalisés (casse et accents ignorés). */
function wordsOf(text: string): Set<string> {
  const mots = normalizeLabel(text).split(/[^a-z0-9]+/);
  return new Set(mots.filter((mot: string) => mot.length > 3));
}

/**
 * Comparateur de démonstration : recouvrement de mots entre le texte et la
 * signature d'une grappe. Dans l'app, cette marche est tenue par le modèle
 * (§8.4 étape 2) ; ici elle est déterministe et annoncée comme telle.
 */
function demoSimilarity(text: string, cluster: DemoCluster): number {
  const textWords = wordsOf(text);
  const clusterWords = wordsOf(`${cluster.systemLabel} ${cluster.symptomLabel} ${cluster.triggerText}`);
  if (textWords.size === 0 || clusterWords.size === 0) return 0;
  let shared = 0;
  for (const word of clusterWords) if (textWords.has(word)) shared += 1;
  return shared / clusterWords.size;
}

/** Réponse proposée à l'agent, à relire avant envoi (§7.2 : jamais envoyée seule). */
function proposedAnswer(cluster: DemoCluster, locale: DemoLocale): string | null {
  if (!cluster.problem?.workaround) return null;
  return locale === 'fr'
    ? `Bonjour,\n\nVotre demande est rattachée au problème connu ${cluster.problem.key}. ` +
        `Contournement validé : ${cluster.problem.workaround}\n\nCorrectif prévu : ${cluster.problem.fixIssueKey ?? 'en cours'}.\n\nCordialement.`
    : `Hello,\n\nYour request is attached to known problem ${cluster.problem.key}. ` +
        `Validated workaround: ${cluster.problem.workaround}\n\nFix planned: ${cluster.problem.fixIssueKey ?? 'in progress'}.\n\nRegards.`;
}

/**
 * Reconnaît un texte libre : même échelle que l'app (§8.4).
 * Marche 1 — mêmes indices certains (code d'erreur, équipement) → confiance
 * élevée ; marche 2 — symptôme proche par le comparateur → confiance moyenne,
 * proposé à l'agent ; sinon aucun rattachement.
 */
export function matchText(state: DemoState, text: string): DemoMatch {
  const normalized = normalizeTrigger(text);
  const candidates = state.clusters.filter((cluster) => cluster.status !== 'dismissed');
  const scored = candidates
    .map((cluster) => ({ cluster, score: demoSimilarity(normalized, cluster) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.34) {
    return {
      cluster: null,
      confidence: 'low',
      basis: 'rule',
      rationale: state.locale === 'fr'
        ? 'Aucun problème connu ne correspond à ce texte.'
        : 'No known problem matches this text.',
      auto: false,
      proposedAnswer: null,
      alternatives: [],
      usedDemoComparator: false,
    };
  }
  const confidence: Confidence = best.score >= 0.6 ? 'high' : 'medium';
  const basis: MembershipBasis = 'similarity';
  const rationale = state.locale === 'fr'
    ? `Même symptôme (« ${best.cluster.symptomLabel} ») et déclencheur proche, ${Math.round(best.score * 100)} % de recouvrement.`
    : `Same symptom ("${best.cluster.symptomLabel}") and close trigger, ${Math.round(best.score * 100)} % overlap.`;
  return {
    cluster: best.cluster,
    confidence,
    basis,
    rationale,
    auto: confidence === 'high',
    proposedAnswer: proposedAnswer(best.cluster, state.locale),
    alternatives: scored.slice(1, 3).filter((entry) => entry.score >= 0.34).map((entry) => entry.cluster),
    usedDemoComparator: true,
  };
}
