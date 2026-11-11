/**
 * Rattachement d'un ticket à un problème existant — échelle du cahier §8.4.
 *
 * Module **pur** : aucun import `@forge/*`, aucune I/O, aucune horloge
 * implicite. Le comparateur à modèle est **injecté** (`compare`) : ce module
 * ne connaît ni le modèle, ni le réseau, ni le fournisseur.
 *
 * Ordre STRICT des marches (§8.4) :
 *  1. même signature complète → confiance élevée, base « règle », d'office ;
 *  2. même système, symptôme proche (avis du comparateur injecté) →
 *     confiance moyenne, base « similarité », proposé à l'agent ;
 *  3. indice certain partagé (code d'erreur, objet d'inventaire) →
 *     confiance élevée, base « règle », quel que soit le texte.
 *
 * Cas limites (§18) : une signature indéterminée n'est jamais rattachée
 * d'office ; un ticket qui décrit deux problèmes est rattaché au plus
 * probable, l'autre est proposé à l'écran (`rankCandidates`).
 */

import { signatureKey } from './types.ts';
import type {
  Cluster,
  MatchResult,
  MatchStep,
  Problem,
  Settings,
  TicketFact,
  TicketSignature,
} from './types.ts';

/** Comparateur à modèle, injecté par l'appelant (contrat WP-E). */
export type CompareFn = (
  ticketText: string,
  problem: Problem,
) => Promise<{ same: boolean; rationale: string }>;

/** Entrées du rattachement (contrat WP-E). */
export interface MatchInput {
  signature: TicketSignature;
  openProblems: readonly Problem[];
  clusters: readonly Cluster[];
  facts: readonly TicketFact[];
  compare?: CompareFn;
  settings: Settings;
}

/** Un indice certain partagé entre le ticket et le problème (§8.4, marche 3). */
export interface SharedClue {
  kind: 'error-code' | 'asset';
  value: string;
}

/** Un candidat de rattachement, avec les clés de son classement. */
interface Scored {
  result: MatchResult;
  problem: Problem;
  step: MatchStep;
  sharedClues: number;
  sameSymptom: boolean;
}

/** Priorité des marches, de la plus certaine à la moins certaine (§8.4). */
const STEP_PRIORITY: Record<MatchStep, number> = {
  'same-signature': 1,
  'similar-symptom': 2,
  'shared-clue': 3,
  none: 4,
};

/** Étiquette lisible d'un problème : sa clé de ticket quand il en a une (§10). */
function problemLabel(problem: Problem): string {
  return problem.issueKey ?? problem.id;
}

/** La grappe d'un problème, quand elle est connue (champ `cluster` du résultat). */
function clusterOf(input: MatchInput, problem: Problem): Cluster | null {
  return input.clusters.find((cluster) => cluster.id === problem.clusterId) ?? null;
}

/** Problèmes utiles : ceux du projet suivi (§13 écran 5). */
function relevantProblems(input: MatchInput): Problem[] {
  const projectId = input.settings.projectId;
  if (!projectId) return [...input.openProblems];
  return input.openProblems.filter((problem) => !problem.projectId || problem.projectId === projectId);
}

/** Résultat vide, prêt à être complété par une marche de rattachement. */
function emptyResult(problem: Problem | null, cluster: Cluster | null): MatchResult {
  return {
    step: 'none',
    problem,
    cluster,
    confidence: 'low',
    basis: 'rule',
    rationale: '',
    auto: false,
    undetermined: false,
    proposedAnswer: problem?.workaround ?? null,
  };
}

/** Résultat « aucun problème connu » (recette §19, point 5). */
function noneResult(): MatchResult {
  const result = emptyResult(null, null);
  result.rationale = 'Aucun problème ouvert ne correspond à ce ticket.';
  return result;
}

/** Résultat « signature indéterminée » (§18) : jamais rattaché d'office. */
function undeterminedResult(): MatchResult {
  const result = emptyResult(null, null);
  result.basis = 'human';
  result.undetermined = true;
  result.rationale =
    "Signature indéterminée : le ticket n'est jamais regroupé d'office, le rattachement se fait à la main.";
  return result;
}

/**
 * Texte remis au comparateur : le résumé du fait-index quand il existe,
 * sinon la signature elle-même. Aucun texte n'est inventé (§17).
 */
function ticketTextOf(input: MatchInput): string {
  const fact = input.facts.find((f) => f.issueId === input.signature.issueId);
  const summary = fact?.summary?.trim() ?? '';
  if (summary) return summary;
  const sig = input.signature;
  return `${sig.systemId} / ${sig.symptomId} / ${sig.triggerText}`;
}

/**
 * Texte qui porte les indices certains d'un problème : son déclencheur, celui
 * de sa grappe et le résumé de son ticket unique (§10).
 */
function problemTextOf(input: MatchInput, problem: Problem): string {
  const parts: string[] = [problem.triggerText];
  const cluster = clusterOf(input, problem);
  if (cluster) parts.push(cluster.triggerText);
  const fact = input.facts.find((f) => !!problem.issueKey && f.issueKey === problem.issueKey);
  if (fact) parts.push(fact.summary);
  return parts.filter((part) => part.trim().length > 0).join(' \n ');
}

/** Vrai si `token` apparaît dans `text`, sans être coupé par une lettre ou un chiffre. */
function containsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(text);
}

/** Indices certains partagés entre le ticket et le problème (§8.4, marche 3). */
function sharedCluesOf(input: MatchInput, problem: Problem): SharedClue[] {
  const clues = input.signature.hardClues;
  const errorCodes = clues?.errorCodes ?? [];
  const assetIds = clues?.assetIds ?? [];
  const text = problemTextOf(input, problem);
  const found: SharedClue[] = [];
  for (const code of errorCodes) {
    if (code.trim() && containsToken(text, code)) found.push({ kind: 'error-code', value: code });
  }
  for (const asset of assetIds) {
    if (asset.trim() && containsToken(text, asset)) found.push({ kind: 'asset', value: asset });
  }
  return found;
}

/** Garde de type pour filtrer les candidats absents. */
function isScored(value: Scored | null): value is Scored {
  return value !== null;
}

/** Termine une phrase par un point, sans le doubler. */
function endSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Marche 1 : même signature complète (§8.4). */
function sameSignatureCandidate(input: MatchInput, problem: Problem): Scored | null {
  const sig = input.signature;
  const ticketKey = signatureKey(sig.systemId, sig.symptomId, sig.triggerText);
  const problemKey = signatureKey(problem.systemId, problem.symptomId, problem.triggerText);
  if (ticketKey !== problemKey) return null;
  const result = emptyResult(problem, clusterOf(input, problem));
  result.step = 'same-signature';
  result.confidence = 'high';
  result.basis = 'rule';
  result.auto = true;
  result.rationale =
    `Signature identique au problème ${problemLabel(problem)} : système « ${sig.systemId} », ` +
    `symptôme « ${sig.symptomId} », déclencheur « ${sig.triggerText} ».`;
  return { result, problem, step: 'same-signature', sharedClues: 0, sameSymptom: true };
}

/** Marche 2 : même système, symptôme proche — l'avis du comparateur tranche (§8.4). */
async function similarityCandidate(input: MatchInput, problem: Problem): Promise<Scored | null> {
  const sig = input.signature;
  if (problem.systemId !== sig.systemId) return null;
  const compare = input.compare;
  if (!compare) return null;
  const verdict = await compareSafely(compare, ticketTextOf(input), problem);
  if (!verdict || !verdict.same) return null;
  const result = emptyResult(problem, clusterOf(input, problem));
  result.step = 'similar-symptom';
  result.confidence = 'medium';
  result.basis = 'similarity';
  result.auto = false;
  const phrase = endSentence(verdict.rationale.trim() || 'symptôme proche, sans justification');
  result.rationale = `Même système « ${sig.systemId} » ; le modèle indique : ${phrase}`;
  return {
    result,
    problem,
    step: 'similar-symptom',
    sharedClues: sharedCluesOf(input, problem).length,
    sameSymptom: problem.symptomId === sig.symptomId,
  };
}

/** Marche 3 : indice certain partagé, quel que soit le texte (§8.4). */
function sharedClueCandidate(input: MatchInput, problem: Problem): Scored | null {
  const clues = sharedCluesOf(input, problem);
  const clue = clues[0];
  if (!clue) return null;
  const result = emptyResult(problem, clusterOf(input, problem));
  result.step = 'shared-clue';
  result.confidence = 'high';
  result.basis = 'rule';
  result.auto = true;
  result.rationale =
    clue.kind === 'error-code'
      ? `Code d'erreur commun « ${clue.value} » avec le problème ${problemLabel(problem)}.`
      : `Même objet d'inventaire « ${clue.value} » que le problème ${problemLabel(problem)}.`;
  return {
    result,
    problem,
    step: 'shared-clue',
    sharedClues: clues.length,
    sameSymptom: problem.symptomId === input.signature.symptomId,
  };
}

/** Le comparateur ne doit jamais faire tomber l'appelant : une erreur vaut « pas le même problème » (§8.4). */
async function compareSafely(
  compare: CompareFn,
  text: string,
  problem: Problem,
): Promise<{ same: boolean; rationale: string } | null> {
  try {
    return await compare(text, problem);
  } catch {
    return null;
  }
}

/** Classe les candidats : marche la plus certaine, puis indices partagés, puis symptôme, puis mise à jour. */
function rank(scored: Scored[]): Scored[] {
  return [...scored].sort(
    (a, b) =>
      STEP_PRIORITY[a.step] - STEP_PRIORITY[b.step] ||
      b.sharedClues - a.sharedClues ||
      Number(b.sameSymptom) - Number(a.sameSymptom) ||
      b.problem.updatedAt.localeCompare(a.problem.updatedAt) ||
      a.problem.id.localeCompare(b.problem.id),
  );
}

/** Ordre d'interrogation du comparateur : le candidat le plus plausible d'abord (PC-07). */
function orderForCompare(problems: Problem[], input: MatchInput): Problem[] {
  const sig = input.signature;
  return [...problems].sort(
    (a, b) =>
      Number(b.symptomId === sig.symptomId) - Number(a.symptomId === sig.symptomId) ||
      sharedCluesOf(input, b).length - sharedCluesOf(input, a).length ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Interroge le comparateur ; en mode `best`, s'arrête à la première réponse positive (PC-07). */
async function similarityCandidates(
  input: MatchInput,
  problems: Problem[],
  mode: 'best' | 'all',
): Promise<Scored[]> {
  const found: Scored[] = [];
  for (const problem of orderForCompare(problems, input)) {
    const candidate = await similarityCandidate(input, problem);
    if (!candidate) continue;
    found.push(candidate);
    if (mode === 'best') break;
  }
  return found;
}

/**
 * Parcourt les marches dans l'ordre STRICT (§8.4).
 * - mode `best` : s'arrête à la première marche qui trouve (chemin chaud, PC-07) ;
 * - mode `all` : garde tous les candidats, pour proposer les autres (§18).
 */
async function collectCandidates(input: MatchInput, mode: 'best' | 'all'): Promise<Scored[]> {
  const problems = relevantProblems(input);
  const found: Scored[] = [];
  const phase1 = problems.map((problem) => sameSignatureCandidate(input, problem)).filter(isScored);
  found.push(...phase1);
  if (mode === 'best' && found.length > 0) return [rank(found)[0]!];
  const rest = problems.filter((problem) => !phase1.some((c) => c.problem.id === problem.id));
  const phase2 = await similarityCandidates(input, rest, mode);
  found.push(...phase2);
  if (mode === 'best' && found.length > 0) return [rank(found)[0]!];
  const remaining = problems.filter((problem) => !found.some((c) => c.problem.id === problem.id));
  const phase3 = remaining.map((problem) => sharedClueCandidate(input, problem)).filter(isScored);
  found.push(...phase3);
  if (mode === 'best' && found.length > 0) return [rank(found)[0]!];
  return rank(found);
}

/**
 * Rattache un ticket à un problème existant, dans l'ordre STRICT de l'échelle
 * du cahier (§8.4).
 *
 * Le contrat écrit `matchTicket(input: MatchInput): MatchResult`, mais la
 * marche 2 demande l'avis du comparateur, qui est **asynchrone**
 * (`CompareFn` rend une promesse) : la fonction rend donc une promesse.
 * Divergence signalée, contrat non modifié.
 */
export async function matchTicket(input: MatchInput): Promise<MatchResult> {
  if (input.signature.undetermined) return undeterminedResult();
  const found = await collectCandidates(input, 'best');
  const best = found[0];
  return best ? best.result : noneResult();
}

/**
 * Liste triée des problèmes candidats, le plus probable en premier (§18 :
 * un ticket qui décrit deux problèmes est rattaché au plus probable, l'autre
 * est proposé à l'écran ; c'est le champ `alternatives` du panneau §13).
 */
export async function rankCandidates(input: MatchInput): Promise<MatchResult[]> {
  if (input.signature.undetermined) return [];
  const found = await collectCandidates(input, 'all');
  return found.map((candidate) => candidate.result);
}

/**
 * Un rattachement d'office est toujours réversible (§8.4) : l'agent peut le
 * retirer, l'addition est alors recalculée (§18). Jamais pour une signature
 * indéterminée, jamais pour une confiance moyenne.
 */
export function isAutoAttach(result: MatchResult): boolean {
  return result.auto && result.confidence === 'high' && !result.undetermined;
}
