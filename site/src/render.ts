/**
 * Rendu du site — remplit le DOM à partir de `DemoState`, et rien d'autre.
 *
 * Règle du dépôt (§17) : **aucun calcul ici**. Les grappes, additions,
 * tendances et flambées viennent du moteur (`site/src/build.ts`), qui exécute le
 * domaine réel de l'app. Les libellés viennent de `site/src/i18n.ts` pour le
 * site et de `src/ui/i18n` + `src/ui/format.ts` pour tout ce que l'app dit déjà.
 */

import { formatHours, formatInt, stateLabel } from '../../src/ui/format';
import { t } from '../../src/ui/i18n';
import { copyOf, texte } from './i18n';
import type { DemoCluster, DemoLocale, DemoState } from './types';

/** Crée un élément, pose ses classes et son libellé en un seul appel. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texteNode?: string,
): HTMLElementTagNameMap[K] {
  const noeud = document.createElement(tag);
  if (classe) noeud.className = classe;
  if (texteNode !== undefined) noeud.textContent = texteNode;
  return noeud;
}

/** Vide un conteneur : le site est re-rendu entièrement à chaque interaction. */
function vider(cible: HTMLElement | null): HTMLElement | null {
  if (cible) cible.replaceChildren();
  return cible;
}

/** Conteneur par `id`, sans jeter s'il manque (rendu tolérant). */
function zone(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// Textes statiques et en-tête
// ---------------------------------------------------------------------------

/** Applique la langue aux attributs `data-i18n` et au `lang` du document. */
export function renderStatic(locale: DemoLocale): void {
  document.documentElement.lang = locale;
  for (const noeud of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const cle = noeud.dataset['i18n'];
    if (cle) noeud.textContent = texte(locale, cle);
  }
  for (const noeud of Array.from(document.querySelectorAll<HTMLTextAreaElement>('[data-i18n-placeholder]'))) {
    const cle = noeud.dataset['i18nPlaceholder'];
    if (cle) noeud.setAttribute('placeholder', texte(locale, cle));
  }
  const boutons = document.querySelectorAll<HTMLButtonElement>('#selecteur-langue button');
  for (const bouton of Array.from(boutons)) {
    bouton.setAttribute('aria-pressed', String(bouton.dataset['locale'] === locale));
  }
}

/** L'accroche : le nom, le sous-titre et les quatre chiffres clés du moteur (§9). */
export function renderHero(state: DemoState): void {
  const cible = vider(zone('chiffres-cles'));
  if (!cible) return;
  const chiffres: [string, string][] = [
    [formatInt(state.locale, state.totals.tickets), texte(state.locale, 'hero.statTickets')],
    [formatInt(state.locale, state.totals.clusters), texte(state.locale, 'hero.statClusters')],
    [formatHours(state.locale, state.totals.hours30), texte(state.locale, 'hero.statHours')],
    [formatInt(state.locale, state.totals.people30), texte(state.locale, 'hero.statPeople')],
  ];
  for (const [valeur, libelle] of chiffres) {
    const item = el('li', 'chiffre');
    item.append(el('span', 'chiffre-valeur', valeur), el('span', 'chiffre-libelle', libelle));
    cible.append(item);
  }
}

/** Les sections fixes : conséquences (§2), flux (§14), modules, outils, juges. */
export function renderSections(state: DemoState): void {
  const copy = copyOf(state.locale);
  const probleme = vider(zone('liste-probleme'));
  if (probleme) {
    for (const [titre, corps] of copy.problemItems) probleme.append(leCrée('li', 'carte', titre, corps));
  }
  const flux = vider(zone('flux-arrivee'));
  if (flux) for (const etape of copy.archSteps) flux.append(el('li', undefined, etape));
  const modules = vider(zone('modules-forge'));
  if (modules) for (const [nom, role] of copy.archModules) modules.append(leCrée('li', 'carte', nom, role));
  const outils = vider(zone('outils-mcp-corps'));
  if (outils) {
    for (const [cle, verbe, entrees, retour] of copy.rovoTools) {
      const ligne = el('tr');
      const entete = el('th', undefined, cle);
      entete.scope = 'row';
      ligne.append(entete, el('td', undefined, verbe), el('td', undefined, entrees), el('td', undefined, retour));
      outils.append(ligne);
    }
  }
  const etapes = vider(zone('etapes-juges'));
  if (etapes) for (const etape of copy.judgeSteps) etapes.append(el('li', undefined, etape));
  const textes = vider(zone('texte-portal-exemples'));
  if (textes) for (const t of copy.judgeTexts) textes.append(el('p', 'exemple-texte', t));
}

/** Carte à titre + corps, réutilisée par les sections fixes. */
function leCrée(tag: 'li', classe: string, titre: string, corps: string): HTMLLIElement {
  const item = el(tag, classe);
  item.append(el('h3', undefined, titre), el('p', undefined, corps));
  return item;
}

// ---------------------------------------------------------------------------
// File « Problèmes » (§13 écran 2, PC-09)
// ---------------------------------------------------------------------------

/** Une ligne de grappe : signature, addition, tendance, seuil, bouton d'ouverture. */
function ligneGrappe(state: DemoState, cluster: DemoCluster): HTMLElement {
  const copy = copyOf(state.locale);
  const bill = state.period === '30d' ? cluster.bill30 : cluster.bill90;
  const carte = el('article', 'carte-grappe');

  const entete = el('div', 'carte-entete');
  entete.append(el('h4', 'signature', cluster.signature));
  if (cluster.problem) entete.append(el('span', 'badge badge--probleme', cluster.problem.key));
  carte.append(entete);

  const chiffres = el('ul', 'chiffres chiffres--petits');
  for (const [valeur, libelle] of [
    [formatInt(state.locale, bill.tickets), t(state.locale, 'problem.line.tickets')],
    [formatHours(state.locale, bill.hours), t(state.locale, 'problem.line.hours')],
    [formatInt(state.locale, bill.people), t(state.locale, 'problem.line.people')],
  ] as [string, string][]) {
    const item = el('li', 'chiffre');
    item.append(el('span', 'chiffre-valeur', valeur), el('span', 'chiffre-libelle', libelle));
    chiffres.append(item);
  }
  carte.append(chiffres);

  const sens = cluster.trend.direction === 'up' ? copy.texts['demo.rising']! : cluster.trend.direction === 'down' ? copy.texts['demo.falling']! : copy.texts['demo.steady']!;
  carte.append(el('p', 'texte-discret', `${sens} · ${copy.texts['demo.trend']}`));
  if (bill.hiddenCount > 0) carte.append(el('p', 'texte-discret', `${bill.hiddenCount} ${copy.texts['demo.hidden']}`));

  const bouton = el('button', 'bouton', copy.texts['demo.openCluster']!);
  bouton.type = 'button';
  bouton.dataset['action'] = 'ouvrir';
  bouton.dataset['cluster'] = cluster.id;
  carte.append(bouton);
  return carte;
}

/** Remplit une zone avec une liste de grappes, ou un message « rien ici ». */
function renderListe(state: DemoState, id: string, clusters: DemoCluster[]): void {
  const cible = vider(zone(id));
  if (!cible) return;
  if (clusters.length === 0) {
    cible.append(el('p', 'texte-discret', texte(state.locale, 'demo.empty')));
    return;
  }
  for (const cluster of clusters) cible.append(ligneGrappe(state, cluster));
}

/** La file « Problèmes », dans l'ordre du §13 écran 2. */
export function renderProblems(state: DemoState): void {
  const actifs = state.clusters.filter((cluster) => cluster.status !== 'dismissed');
  renderListe(state, 'suspects', actifs.filter((cluster) => cluster.status === 'suspect'));
  renderListe(state, 'problemes-ouverts', actifs.filter((cluster) => cluster.problem !== null));
  renderListe(state, 'recurrentes', actifs.filter((cluster) => cluster.status === 'recurring'));

  const flambees = vider(zone('flambees'));
  if (flambees) {
    if (state.surges.length === 0) flambees.append(el('p', 'texte-discret', texte(state.locale, 'demo.noSurge')));
    for (const surge of state.surges) {
      const carte = el('article', 'carte-grappe carte--alerte');
      carte.append(el('h4', 'signature', surge.signature));
      carte.append(el('p', undefined, texte(state.locale, 'demo.surgeLine')
        .replace('{count}', String(surge.rate)).replace('{factor}', surge.factor.toFixed(1))));
      flambees.append(carte);
    }
  }

  const orphelins = vider(zone('tickets-sans-grappe'));
  if (orphelins) {
    const sans = state.tickets.filter((ticket) => ticket.undetermined);
    for (const ticket of sans) {
      const item = el('li', 'ticket');
      item.append(el('code', undefined, ticket.issueKey), el('span', undefined, ticket.summary));
      orphelins.append(item);
    }
  }
}

// ---------------------------------------------------------------------------
// Détail d'une grappe (§7.1, §13 écran 3)
// ---------------------------------------------------------------------------

/** Addition détaillée avec sa méthode (§9, §17 lisibilité). */
function renderAddition(state: DemoState, cluster: DemoCluster, cible: HTMLElement): void {
  const copy = copyOf(state.locale);
  const bill = state.period === '30d' ? cluster.bill30 : cluster.bill90;
  const lignes: [string, string][] = [
    [t(state.locale, 'problem.line.tickets'), formatInt(state.locale, bill.tickets)],
    [t(state.locale, 'problem.line.hours'), formatHours(state.locale, bill.hours)],
    [t(state.locale, 'problem.line.people'), formatInt(state.locale, bill.people)],
    [t(state.locale, 'problem.line.orgs'), formatInt(state.locale, bill.orgs)],
    [t(state.locale, 'problem.line.meToo'), formatInt(state.locale, bill.meToo)],
    [copy.texts['demo.method']!, copy.texts['demo.hoursMethod']!.replace('{minutes}', String(bill.minutesPerTouch))],
  ];
  if (bill.eur !== null) lignes.push([copy.texts['demo.eur']!, `€ ${formatInt(state.locale, Math.round(bill.eur))}`]);
  const tableau = el('table', 'tableau tableau--addition');
  const corps = el('tbody');
  for (const [libelle, valeur] of lignes) {
    const ligne = el('tr');
    const entete = el('th', undefined, libelle);
    entete.scope = 'row';
    ligne.append(entete, el('td', undefined, valeur));
    corps.append(ligne);
  }
  tableau.append(corps);
  cible.replaceChildren(tableau);
}

/** Ouvre le détail d'une grappe : signature, addition, justification, tickets. */
export function renderDetail(state: DemoState, cluster: DemoCluster): void {
  const copy = copyOf(state.locale);
  const titre = zone('detail-titre');
  if (titre) {
    titre.textContent = cluster.problem
      ? `${copy.texts['demo.problem']} ${cluster.problem.key} · ${stateLabel(state.locale, cluster.problem.state)}`
      : copy.texts['demo.suspect']!;
  }
  const signature = zone('detail-signature');
  if (signature) signature.textContent = cluster.signature;
  const addition = zone('detail-addition');
  if (addition) renderAddition(state, cluster, addition);
  const justification = zone('detail-justification');
  if (justification) justification.textContent = cluster.problem?.workaround ?? copy.texts['demo.noWorkaround']!;

  const liste = vider(zone('detail-tickets'));
  if (liste) {
    for (const ticket of cluster.tickets) {
      const item = el('li', 'ticket');
      item.append(
        el('code', undefined, ticket.issueKey),
        el('span', ticket.visible ? undefined : 'ticket--masque', ticket.visible ? ticket.summary : copy.texts['demo.hiddenTicket']!),
      );
      if (cluster.problem) {
        const retirer = el('button', 'bouton bouton--petit', copy.texts['demo.detach']!);
        retirer.type = 'button';
        retirer.dataset['action'] = 'detacher';
        retirer.dataset['cluster'] = cluster.id;
        retirer.dataset['ticket'] = ticket.issueKey;
        item.append(retirer);
      }
      liste.append(item);
    }
  }

  const confirmer = zone('bouton-confirmer') as HTMLButtonElement | null;
  const rejeter = zone('bouton-rejeter') as HTMLButtonElement | null;
  const deja = cluster.problem !== null;
  if (confirmer) { confirmer.hidden = deja; confirmer.dataset['action'] = 'confirmer'; confirmer.dataset['cluster'] = cluster.id; }
  if (rejeter) { rejeter.hidden = deja; rejeter.dataset['action'] = 'rejeter'; rejeter.dataset['cluster'] = cluster.id; }

  const message = zone('detail-message');
  if (message) message.textContent = '';
  ouvrirDialogue();
}

/**
 * Ouvre la boîte de dialogue du détail. `showModal` n'existe pas partout
 * (jsdom, navigateurs anciens) : on retombe sur l'attribut `open` plutôt que de
 * casser le clic de l'utilisateur.
 */
function ouvrirDialogue(): void {
  const dialogue = document.getElementById('detail-grappe') as HTMLDialogElement | null;
  if (!dialogue) return;
  if (typeof dialogue.showModal === 'function') dialogue.showModal();
  else dialogue.setAttribute('open', '');
}

/** Message court après une action (confirmation, rejet, retrait, moi aussi). */
export function renderMessage(id: string, texteNode: string): void {
  const noeud = zone(id);
  if (noeud) noeud.textContent = texteNode;
}