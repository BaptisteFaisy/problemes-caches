/**
 * Rendu des panneaux interactifs : l'agent (§7.2), le portail (§7.3) et le
 * vocabulaire (§8.3). Aucun calcul ici (§17) : l'état vient du moteur, les
 * libellés de `i18n.ts` et de `src/ui/i18n`.
 */

import { formatInt, confidenceLabel } from '../../src/ui/format';
import { t } from '../../src/ui/i18n';
import { copyOf, texte } from './i18n';
import type { DemoCluster, DemoState } from './types';

/** Crée un élément, pose ses classes et son libellé. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe?: string, txt?: string): HTMLElementTagNameMap[K] {
  const noeud = document.createElement(tag);
  if (classe) noeud.className = classe;
  if (txt !== undefined) noeud.textContent = txt;
  return noeud;
}

/** Conteneur par `id`, sans jeter s'il manque. */
function zone(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Vide un conteneur. */
function vider(cible: HTMLElement | null): HTMLElement | null {
  if (cible) cible.replaceChildren();
  return cible;
}

// ---------------------------------------------------------------------------
// Panneau de l'agent (§7.2, PC-08)
// ---------------------------------------------------------------------------

/** Prépare le panneau : les exemples cliquables et un résultat vide. */
export function renderAgentVideo(state: DemoState): void {
  const exemples = vider(zone('exemples-textes'));
  if (exemples) {
    const titre = el('p', 'texte-discret', texte(state.locale, 'agent.examples'));
    exemples.append(titre);
    for (const [i, texteExemple] of copyOf(state.locale).agentExamples.entries()) {
      const bouton = el('button', 'bouton bouton--petit', texteExemple);
      bouton.type = 'button';
      bouton.dataset['action'] = 'exemple';
      bouton.dataset['exemple'] = String(i);
      exemples.append(bouton);
    }
  }
}

/** Affiche le résultat d'une reconnaissance : grappe, confiance, justification. */
export function renderResultat(state: DemoState, cluster: DemoCluster | null, confidenceLabelNode: string, rationale: string, alternatives: DemoCluster[], demo: boolean): void {
  const copy = copyOf(state.locale);
  const cible = vider(zone('resultat-reconnaissance'));
  if (!cible) return;
  if (!cluster) {
    cible.append(el('p', 'resultat-aucun', copy.texts['agent.none']!));
    return;
  }
  const carte = el('article', 'carte resultat-carte');
  const entete = el('div', 'carte-entete');
  entete.append(
    el('h4', 'signature', cluster.problem ? `${copy.texts['agent.known']!} ${cluster.problem.key}` : copy.texts['agent.suspect']!),
    el('span', 'badge', confidenceLabelNode),
  );
  carte.append(entete);
  carte.append(el('p', 'signature', cluster.signature));
  carte.append(el('p', 'justification', rationale));
  if (cluster.problem?.workaround) {
    carte.append(el('p', undefined, `${t(state.locale, 'panel.workaround')} : ${cluster.problem.workaround}`));
  }
  if (alternatives.length > 0) {
    carte.append(el('p', 'texte-discret', copy.texts['agent.alternatives']!));
    for (const alt of alternatives) carte.append(el('p', 'signature', alt.signature));
  }
  if (demo) carte.append(el('p', 'avertissement', copy.texts['agent.demoComparator']!));
  carte.append(el('p', 'avertissement', copy.texts['agent.neverSent']!));
  cible.append(carte);
}

// ---------------------------------------------------------------------------
// Panneau du portail (§7.3, PC-15/16)
// ---------------------------------------------------------------------------

/** Le bandeau de problème connu du portail, publié par un humain. */
export function renderPortail(state: DemoState): void {
  const copy = copyOf(state.locale);
  const bandeau = vider(zone('bandeau-portail'));
  const publie: DemoCluster | null = state.clusters.find((cluster) => cluster.problem?.publishedToPortal) ?? null;
  if (bandeau) {
    if (!publie) {
      bandeau.append(el('p', 'texte-discret', copy.texts['portal.noBanner']!));
    } else {
      const carte = el('div', 'banniere');
      carte.append(
        el('strong', undefined, `${copy.texts['portal.banner']!} : ${publie.signature}`),
        el('p', undefined, publie.problem!.workaround ?? ''),
      );
      const bouton = el('button', 'bouton bouton--primaire', copy.texts['portal.meToo']!);
      bouton.type = 'button';
      bouton.dataset['action'] = 'moi-aussi';
      bouton.dataset['cluster'] = publie.id;
      carte.append(bouton);
      bandeau.append(carte);
    }
  }
}

/** Compteurs du portail : personnes touchées, « moi aussi » compris (§9). */
export function renderCompteursPortail(state: DemoState): void {
  const copy = copyOf(state.locale);
  const cible = vider(zone('compteurs-portail'));
  const publie = state.clusters.find((cluster) => cluster.problem?.publishedToPortal) ?? null;
  if (!cible) return;
  if (!publie) return;
  const bill = state.period === '30d' ? publie.bill30 : publie.bill90;
  cible.append(
    el('p', undefined, `${copy.texts['portal.counted']!} ${formatInt(state.locale, bill.people)} (${copy.texts['portal.meTooCount']!} : ${formatInt(state.locale, bill.meToo)})`),
  );
}

// ---------------------------------------------------------------------------
// Panneau du vocabulaire (§8.3)
// ---------------------------------------------------------------------------

/** Listes des systèmes et symptômes, avec le nombre de tickets par terme. */
export function renderVocabulaire(state: DemoState): void {
  const compteurs = new Map<string, number>();
  for (const cluster of state.clusters) {
    for (const ticket of cluster.tickets) {
      compteurs.set(ticket.systemId, (compteurs.get(ticket.systemId) ?? 0) + 1);
      compteurs.set(ticket.symptomId, (compteurs.get(ticket.symptomId) ?? 0) + 1);
    }
  }
  const systemes = vider(zone('liste-systemes'));
  if (systemes) remplirTermes(state, systemes, state.vocabulary.systems, compteurs);
  const symptomes = vider(zone('liste-symptomes'));
  if (symptomes) remplirTermes(state, symptomes, state.vocabulary.symptoms, compteurs);
}

/** Remplit une liste de termes avec leur libellé et leur compteur. */
function remplirTermes(state: DemoState, cible: HTMLElement, terms: readonly { id: string; label: string }[], compteurs: Map<string, number>): void {
  for (const terme of terms) {
    const item = el('li', 'terme');
    item.append(
      el('span', undefined, terme.label),
      el('span', 'badge', `${compteurs.get(terme.id) ?? 0} ${texte(state.locale, 'vocab.tickets')}`),
    );
    cible.append(item);
  }
}

// Exporté pour main.ts

