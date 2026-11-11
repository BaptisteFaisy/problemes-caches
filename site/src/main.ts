/**
 * Amorçage du site : état initial, premier rendu, branchement des événements.
 *
 * Le site est un grand cycle « état → rendu → événement → nouvel état » : toute
 * interaction repasse par le moteur pur (`site/src/state.ts`), jamais par une
 * mutation du DOM. Le rendu complet à chaque action est volontaire : l'état est
 * petit (120 tickets) et ce choix rend le comportement trivialement prévisible.
 */

import { confidenceLabel } from '../../src/ui/format';
import { localeFrom } from '../../src/ui/i18n';
import { copyOf } from './i18n';
import { renderAgentVideo, renderCompteursPortail, renderPortail, renderResultat, renderVocabulaire } from './render-agents';
import { renderDetail, renderHero, renderMessage, renderProblems, renderSections, renderStatic } from './render';
import { addMeToo, buildDemoState, confirmSuspect, detachTicket, matchText, rejectSuspect, withLocale, withPeriod } from './state';
import type { DemoLocale, DemoState } from './types';

/** État courant, tenu par ce module uniquement : le DOM n'est qu'une vue. */
/**
 * État courant, tenu par ce module uniquement : le DOM n'est qu'une vue.
 * Anglais par défaut — la soumission Codegeist est en anglais (§17) —, le
 * français étant à un clic via le sélecteur de langue.
 */
let etat: DemoState = buildDemoState('en');

/** Rend tout : textes statiques, accroche, sections, panneaux et onglet. */
function rendreTout(etatCourant: DemoState): void {
  renderStatic(etatCourant.locale);
  renderHero(etatCourant);
  renderSections(etatCourant);
  renderProblems(etatCourant);
  renderAgentVideo(etatCourant);
  renderPortail(etatCourant);
  renderCompteursPortail(etatCourant);
  renderVocabulaire(etatCourant);
  rendreOnglet(ongletActif());
}

/** Grappe par identifiant, ou `null` si elle manque (rendu tolérant). */
function grappe(id: string) {
  return etat.clusters.find((cluster) => cluster.id === id) ?? null;
}

/** Onglet actif, retrouvé par `aria-selected`. */
function ongletActif(): string {
  return document.querySelector<HTMLButtonElement>('#onglets [aria-selected="true"]')?.dataset['onglet'] ?? 'problems';
}

/** Bascule l'onglet visible et met à jour `aria-selected` / `tabindex`. */
function rendreOnglet(nom: string): void {
  for (const bouton of Array.from(document.querySelectorAll<HTMLButtonElement>('#onglets [data-onglet]'))) {
    const actif = bouton.dataset['onglet'] === nom;
    bouton.setAttribute('aria-selected', String(actif));
    bouton.tabIndex = actif ? 0 : -1;
  }
  for (const panneau of Array.from(document.querySelectorAll<HTMLElement>('.panneau'))) {
    panneau.classList.toggle('panneau--cache', panneau.id !== `panneau-${nom}`);
  }
}

/** Remplace l'état courant et re-rend tout. */
function remplacer(nouveau: DemoState): void {
  etat = nouveau;
  rendreTout(etat);
}

/** Ouvre la boîte de dialogue d'une grappe. */
function ouvrirDetail(clusterId: string): void {
  const cluster = grappe(clusterId);
  if (cluster) renderDetail(etat, cluster);
}

/** Gère un clic sur un sélecteur global : langue, onglet ou période. */
function gereClicGlobal(evenement: MouseEvent): void {
  const cible = (evenement.target as HTMLElement).closest<HTMLElement>('[data-action], [data-locale], [data-onglet], [data-periode]');
  if (!cible) return;
  if (cible.dataset['locale']) { remplacer(withLocale(etat, cible.dataset['locale'] as DemoLocale)); return; }
  if (cible.dataset['onglet']) { rendreOnglet(cible.dataset['onglet']!); return; }
  if (cible.dataset['periode']) { remplacer(withPeriod(etat, cible.dataset['periode'] === '90d' ? '90d' : '30d')); return; }
  gereAction(cible.dataset['action'] ?? '', cible.dataset['cluster'] ?? '', cible.dataset['ticket'] ?? '');
}

/** Une action nommée sur une grappe : ouvrir, retirer, confirmer, rejeter, « moi aussi ». */
function gereAction(action: string, clusterId: string, ticket: string): void {
  const copy = copyOf(etat.locale);
  if (action === 'ouvrir') return ouvrirDetail(clusterId);
  if (action === 'detacher') {
    remplacer(detachTicket(etat, clusterId, ticket));
    return renderMessage('detail-message', copy.texts['demo.detached']!);
  }
  if (action === 'confirmer') {
    remplacer(confirmSuspect(etat, clusterId, []));
    ouvrirDetail(clusterId);
    return renderMessage('detail-message', copy.texts['demo.confirmed']!);
  }
  if (action === 'rejeter') {
    remplacer(rejectSuspect(etat, clusterId));
    return renderMessage('detail-message', copy.texts['demo.rejected']!);
  }
  if (action === 'moi-aussi') {
    const ordre = (grappe(clusterId)?.problem?.meToo.length ?? 0) + 1;
    remplacer(addMeToo(etat, clusterId, `${copy.texts['portal.meTooName']!} ${ordre}`, null));
    return renderMessage('compteurs-portail', copy.texts['portal.meTooDone']!);
  }
}

/** Ferme la boîte de dialogue du détail d'une grappe. */
function fermerDetail(): void {
  (document.getElementById('detail-grappe') as HTMLDialogElement | null)?.close();
}

/** Remplit le champ exemple et lance la reconnaissance (§21). */
function clicExemple(evenement: MouseEvent): void {
  const cible = (evenement.target as HTMLElement).closest<HTMLElement>('[data-exemple]');
  if (!cible) return;
  const exemple = copyOf(etat.locale).agentExamples[Number(cible.dataset['exemple'])] ?? '';
  const zoneTexte = document.getElementById('texte-libre') as HTMLTextAreaElement | null;
  if (zoneTexte) zoneTexte.value = exemple;
  lancerReconnaissance(exemple);
}

/** Exécute la reconnaissance d'un texte libre et rend le résultat (§7.2). */
function lancerReconnaissance(texteLibre: string): void {
  const resultat = matchText(etat, texteLibre);
  renderResultat(
    etat,
    resultat.cluster,
    resultat.cluster ? confidenceLabel(etat.locale, resultat.confidence) : '',
    resultat.rationale,
    resultat.alternatives,
    resultat.usedDemoComparator,
  );
}

/** Branche tous les événements : un délégué global et deux boutons précis. */
function brancher(): void {
  document.addEventListener('click', gereClicGlobal);
  document.addEventListener('click', clicExemple);
  document.getElementById('bouton-fermer')?.addEventListener('click', fermerDetail);
  document.getElementById('detail-grappe')?.addEventListener('click', (evenement) => {
    if (evenement.target === evenement.currentTarget) fermerDetail();
  });
  document.getElementById('bouton-reconnaitre')?.addEventListener('click', () => {
    const zoneTexte = document.getElementById('texte-libre') as HTMLTextAreaElement | null;
    lancerReconnaissance(zoneTexte?.value ?? '');
  });
}

rendreTout(etat);
brancher();
console.info('[problemes-caches] site chargé :', etat.totals.tickets, 'tickets,', etat.totals.clusters, 'grappes.');