/**
 * Jeu d'exemple — « Problèmes cachés dans les tickets » (PC-12, §20, §21).
 *
 * Module **pur** : aucun import `@forge/*`, aucune I/O, aucune horloge
 * implicite. Le hasard vient d'un générateur maison (mulberry32) avec une
 * graine fixée : deux appels à `buildDataset()` rendent le même jeu, au
 * caractère près. `Math.random()` n'est jamais utilisé.
 *
 * Contenu (§20) : 120 tickets sur 60 jours, projet de service fictif `SUP`,
 * trois problèmes cachés (accès distant après la mise à jour du poste,
 * imprimante du 3e étage, facture reçue en double) et une demande récurrente
 * normale (réinitialisation de mot de passe, §18). Recette (§19.1) : le
 * groupe « accès distant » compte plus de dix tickets décrivant la **même**
 * panne avec des mots différents, en français et en anglais, qui partagent
 * une seule signature attendue.
 */

import { UNDETERMINED_ID, normalizeTrigger, signatureKey } from '../core/types.ts';
import type { HardClues, TicketFact } from '../core/types.ts';
import { DAY_MS, addDays, round2 } from '../core/time.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Les quatre groupes attendus par les tests et le scénario vidéo (§20). */
export type SampleGroupId =
  | 'remote-access'
  | 'printer-floor-3'
  | 'duplicate-invoice'
  | 'password-reset'
  | 'noise';

/** Nature d'un groupe : problème caché, demande récurrente, bruit. */
export type SampleKind = 'problem' | 'recurring' | 'noise';

/**
 * Un ticket du jeu d'exemple : les faits de `ticket_fact` (type du domaine,
 * §15) plus la signature attendue et les indices certains (§8.2).
 */
export interface SampleTicket extends TicketFact {
  group: SampleGroupId;
  variant: string;
  kind: SampleKind;
  systemId: string;
  symptomId: string;
  triggerText: string;
  undetermined: boolean;
  language: 'fr' | 'en';
  hardClues: HardClues;
}

/** Le jeu d'exemple rendu par `buildDataset()`. */
export interface SampleDataset {
  tickets: SampleTicket[];
  expectedClusters: number;
  expectedProblems: string[];
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Clé du projet de service fictif (§20). */
export const SAMPLE_PROJECT_KEY = 'SUP';
/** Préfixe des identifiants du jeu : permet de ne supprimer que lui (§21). */
export const SAMPLE_ID_PREFIX = 'sample-sup-';
export const SAMPLE_TICKET_COUNT = 120;          // tickets du jeu (§20, PC-12)
export const SAMPLE_WINDOW_DAYS = 60;            // fenêtre du jeu, en jours (§20)
export const SAMPLE_DEFAULT_SEED = 20261222;     // graine fixe : jeu reproductible
export const SAMPLE_ANCHOR_ISO = '2026-11-10T09:00:00.000Z'; // fin de la fenêtre
export const SAMPLE_SUMMARY_MAX = 512;           // borne de `ticket_fact.summary`
export const SAMPLE_SUSPECT_THRESHOLD = 5;       // seuil de suspect, en tickets (§8.5)
export const SAMPLE_SURGE_DAY = 41;              // jour de la flambée (§8.6)
/** Heures de la flambée : sept tickets en moins de deux heures (§8.6). */
export const SAMPLE_SURGE_TIMES = ['09:05', '09:20', '09:35', '09:50', '10:05', '10:30', '10:55'];
export const SAMPLE_MINUTES_PER_TOUCH = 10;      // durée moyenne d'une intervention (§9)
/** Étiquettes des trois problèmes cachés (§20). */
export const SAMPLE_PROBLEM_LABELS = ['remote-access', 'printer-floor-3', 'duplicate-invoice'] as const;

// ---------------------------------------------------------------------------
// Groupes de tickets
// ---------------------------------------------------------------------------

/**
 * Un groupe de tickets : une signature attendue, des métadonnées et les
 * textes mêmes. Le nombre de tickets d'un groupe est le nombre de textes :
 * chaque texte est différent, donc chaque ticket raconte la même panne
 * autrement (§19.1).
 */
export interface SampleGroupSpec {
  /** Identifiant unique du groupe (tests, documentation). */
  key: string;
  /** Groupe de tête : les quatre groupes attendus (§20). */
  group: SampleGroupId;
  kind: SampleKind;
  systemId: string;
  symptomId: string;
  triggerText: string;
  requestType: string;
  service?: string | null;
  component?: string | null;
  product?: string | null;
  version?: string | null;
  os?: string | null;
  assetId?: string | null;
  fr: readonly string[];
  en: readonly string[];
}

/** Les groupes du jeu : trois problèmes cachés, une demande récurrente, du bruit. */
const GROUPS: readonly SampleGroupSpec[] = [
  {
    key: 'remote-access', group: 'remote-access', kind: 'problem',
    systemId: 'sys-remote-access', symptomId: 'sym-connection-drop',
    triggerText: 'après la mise à jour du poste', requestType: 'Incident',
    service: 'Accès distant', component: 'VPN', product: 'FortiClient',
    version: '7.2.4', os: 'Windows 11',
    fr: [
      'Mon accès distant coupe toutes les dix minutes depuis la mise à jour du poste.',
      'Le VPN se déconnecte sans arrêt depuis la mise à jour de mon PC.',
      'Accès distant qui décroche au bout de quelques minutes depuis la mise à jour du poste.',
      'Le bureau distant se ferme tout seul depuis la mise à jour du poste.',
      'Perte de connexion en télétravail à chaque fois que je me reconnecte depuis la mise à jour.',
      'La session distante tombe dès que j\'ouvre un gros fichier, depuis la mise à jour.',
      'Je n\'ai plus de connexion stable sur le VPN, c\'est commencé après la mise à jour du poste.',
      'Déconnexions à répétition en accès distant depuis la mise à jour du poste (ERR-4402 dans le journal).',
      'Le tunnel VPN saute toutes les cinq minutes depuis la mise à jour du poste.',
      'Impossible de garder une session distante ouverte, ça coupe depuis la mise à jour du poste.',
      'Mon accès distant lâche en moyenne toutes les dix minutes depuis la mise à jour.',
      'Le poste mis à jour se déconnecte du VPN sans raison apparente.',
      'Connexion distante instable depuis la mise à jour, j\'ai redémarré trois fois.',
      'Chaque session distante se termine au bout de quelques minutes depuis la mise à jour.',
      'Le VPN coupe dès que je change de réseau, depuis la mise à jour du poste.',
      'Accès distant coupé toutes les dix minutes, le poste a été mis à jour lundi.',
      'Mon accès distant tombe en boucle depuis la mise à jour, le support est déjà au courant.',
      'Le VPN se coupe après la mise à jour du poste, j\'ai déjà signalé le problème à l\'équipe.',
      'Accès distant instable depuis la mise à jour : la connexion saute au bout de deux minutes.',
      'Après la mise à jour de mon poste, la connexion distante s\'interrompt sans raison.',
    ],
    en: [
      'My remote access keeps dropping every ten minutes since the workstation update.',
      'The VPN disconnects every few minutes since I updated my PC.',
      'Remote desktop session ends unexpectedly after the workstation update.',
      'I keep losing the remote session since the endpoint update.',
      'The VPN tunnel drops as soon as I reconnect after the update.',
      'Unstable remote connection after the workstation update, the tunnel dies every few minutes.',
      'My remote access session is cut off shortly after the PC update.',
      'Since the workstation update, the VPN disconnects while I am on a call.',
      'Remote access drops every two minutes following the endpoint update.',
      'The remote session ends on its own since the workstation was updated.',
      'My VPN connection cannot stay alive since the PC update, it drops repeatedly.',
      'After the workstation update the remote access keeps timing out every few minutes.',
    ],
  },
  {
    key: 'printer-floor-3', group: 'printer-floor-3', kind: 'problem',
    systemId: 'sys-printer', symptomId: 'sym-offline',
    triggerText: '3e étage', requestType: 'Incident',
    service: 'Impression', component: 'Imprimante 3e étage', product: 'HP LaserJet M428fdw',
    assetId: 'asset-printer-3f',
    fr: [
      "L'imprimante du 3e étage ne répond plus depuis ce matin.",
      "L'imprimante de l'étage 3 est hors ligne, impossible d'imprimer.",
      "Plus aucune impression possible au 3e étage, l'imprimante est en panne.",
      "L'imprimante du troisième est indisponible depuis la matinée.",
      "Je ne peux plus imprimer au 3e étage, l'imprimante ne répond pas.",
      "L'imprimante partagée de l'étage 3 est déconnectée du réseau.",
      "Tout le troisième étage est bloqué, l'imprimante est hors service.",
      "L'imprimante du 3e ne s'allume plus, elle était déjà dans cet état ce matin.",
      "Impression impossible au 3ème étage, la machine ne répond plus.",
      "L'imprimante du 3e étage tombe en erreur à chaque envoi.",
      "L'étage 3 n'a plus d'imprimante opérationnelle depuis ce matin.",
      "L'imprimante de l'étage 3 est en panne depuis le début de la journée.",
      "L'imprimante du troisième ne fonctionne plus, on est sans impression depuis ce matin.",
      "Au 3e étage, l'imprimante ne répond plus et les documents restent en file.",
    ],
    en: [
      'The 3rd floor printer is offline and nobody can print.',
      'Our floor 3 printer is unavailable since this morning.',
      'Printing on the third floor fails, the device does not respond.',
      'The 3F printer stopped responding, we cannot print anymore.',
      'No printer available on floor 3, the device is down.',
      'The floor-3 printer is not reachable, print jobs stay in the queue.',
      'Our third floor printing is down, the device is offline since this morning.',
      'The printer on floor 3 is unresponsive, we have no output at all today.',
    ],
  },
  {
    key: 'duplicate-invoice', group: 'duplicate-invoice', kind: 'problem',
    systemId: 'sys-billing', symptomId: 'sym-duplicate-invoice',
    triggerText: 'après la clôture mensuelle', requestType: 'Facturation',
    service: 'Facturation', component: 'Facturation', product: 'SAP S/4HANA', version: '2023',
    fr: [
      'J\'ai reçu deux fois la même facture ce mois-ci.',
      'La facture de septembre m\'a été envoyée en double.',
      'Deux factures identiques pour le même abonnement, c\'est la deuxième fois.',
      'Facture du mois reçue deux fois, le montant est doublé sur mon relevé.',
      'J\'ai une facture en double pour le même service.',
      'Le document de facturation est arrivé deux fois dans ma boîte mail.',
      'On m\'a facturé deux fois le même mois.',
      'Je reçois systématiquement deux factures pour un seul abonnement.',
      'Facture identique reçue en double ce matin.',
      'Deux factures avec le même numéro apparaissent sur l\'espace client.',
      'La facture de ce mois est arrivée deux fois dans le courrier du client.',
      'J\'ai été débité deux fois pour la même période de facturation.',
    ],
    en: [
      'I received the same invoice twice this month.',
      'We got a duplicated invoice for the same subscription.',
      'Our billing document was sent twice, the amount is doubled.',
      'Duplicate charge on the statement, the same invoice appears twice.',
      'I have been billed twice for the same period.',
      'The same invoice was issued twice for our account.',
      'Our customer received the invoice twice for the same month.',
      'We were charged two identical invoices for one billing period.',
    ],
  },
  {
    key: 'password-reset', group: 'password-reset', kind: 'recurring',
    systemId: 'sys-accounts', symptomId: 'sym-password-reset',
    triggerText: '', requestType: 'Réinitialisation de mot de passe',
    service: 'Comptes', component: 'Active Directory', product: 'Windows Server', version: '2022',
    fr: [
      'Je n\'arrive plus à me connecter, mon mot de passe a expiré.',
      'Réinitialisation de mot de passe demandée, je suis bloqué.',
      'J\'ai oublié mon mot de passe, pouvez-vous le réinitialiser ?',
      'Impossible de valider mon mot de passe après trois essais.',
      'Merci de réinitialiser mon mot de passe, la connexion échoue à chaque fois.',
      'Je suis bloqué sur la page de connexion, il faut réinitialiser mon mot de passe.',
      'Demande de déblocage de mon compte, mot de passe expiré.',
      'Mot de passe refusé, il a dû expirer pendant les vacances.',
      'Réinitialisation du mot de passe demandée pour mon compte.',
      'Je ne connais plus mon mot de passe, merci d\'en générer un nouveau.',
    ],
    en: [
      'I forgot my password, please reset it.',
      'Cannot log in anymore, my password expired.',
      'Password reset request for my account.',
      'My account is locked, I need an unlock and a new password.',
      'Reset my password please, the old one no longer works.',
      'I cannot sign in, the password is rejected.',
      'Requesting a password reset for the shared mailbox.',
      'The password expired during the holiday, I need a new one.',
    ],
  },
];

/**
 * Le bruit : des demandes ordinaires, quatre tickets au plus par grappe, donc
 * jamais au-dessus du seuil de suspect (§8.5). Chacun porte sa propre
 * signature, dont deux « presque » les mêmes qu'un problème caché : même
 * symptôme, autre déclencheur (§8.4, recette §19.5).
 */
const NOISE: readonly SampleGroupSpec[] = [
  {
    key: 'mail-signature', group: 'noise', kind: 'noise', label: 'Signature refusée par le serveur de messagerie',
    systemId: 'sys-mail', symptomId: 'sym-error-signature', triggerText: 'signature refusée',
    requestType: 'Incident', service: 'Messagerie', component: 'Messagerie', product: 'Outlook', os: 'Windows 11',
    fr: ['Je ne peux plus envoyer de mail, la signature est refusée par le serveur.', 'Mes signatures ne sont plus acceptées et le carnet d\'adresses est vide.'],
    en: ['I cannot send emails anymore, the signature is rejected by the server.', 'My signatures are no longer accepted, the address book is empty.'],
  },
  {
    key: 'mail-attachment', group: 'noise', kind: 'noise', label: 'Pièce jointe refusée par la messagerie',
    systemId: 'sys-mail', symptomId: 'sym-attachment-refused', triggerText: 'pièce jointe refusée',
    requestType: 'Service Request', service: 'Messagerie', component: 'Messagerie', product: 'Outlook',
    fr: ['La pièce jointe de douze méga est refusée par la messagerie.', 'Je ne peux plus joindre de fichier volumineux dans mes mails.'],
    en: ['A twelve megabyte attachment is refused by the mail client.', 'I can no longer attach large files to my emails.'],
  },
  {
    key: 'network-slow', group: 'noise', kind: 'noise', label: 'Lenteur du réseau sans fil du deuxième étage',
    systemId: 'sys-network', symptomId: 'sym-slow', triggerText: 'wi-fi étage 2',
    requestType: 'Incident', service: 'Réseau', component: 'Wi-Fi', product: 'FortiAP', version: '7.4',
    fr: ['Le réseau est très lent à l\'étage 2 depuis ce matin.', 'Les pages web mettent une éternité à s\'ouvrir au deuxième étage.'],
    en: ['The network is very slow on the second floor since this morning.', 'Web pages take forever to load on floor two.'],
  },
  {
    key: 'network-cut', group: 'noise', kind: 'noise', label: 'Coupure du lien réseau entre les bâtiments',
    systemId: 'sys-network', symptomId: 'sym-connection-drop', triggerText: 'coupure entre bâtiments',
    requestType: 'Incident', service: 'Réseau', component: 'Liaison inter-sites', product: 'FortiLink',
    fr: ['La connexion entre les bâtiments est coupée depuis ce matin.', 'Le lien réseau avec l\'autre site est tombé, plus rien ne passe.'],
    en: ['The connection between the buildings is down since this morning.', 'The network link to the other site is down, nothing goes through.'],
  },
  {
    key: 'workstation-slow', group: 'noise', kind: 'noise', label: 'Lenteur d\'un poste de travail vieillissant',
    systemId: 'sys-workstation', symptomId: 'sym-slow', triggerText: 'poste ancien',
    requestType: 'Incident', service: 'Poste de travail', component: 'Poste', product: 'Windows 10', version: '22H2',
    fr: ['Mon poste est très lent depuis la semaine dernière.', 'Les applications mettent une éternité à s\'ouvrir sur mon ancien poste.'],
    en: ['My workstation has been very slow since last week.', 'Applications take forever to start on my old machine.'],
  },
  {
    key: 'software-module', group: 'noise', kind: 'noise', label: 'Erreur du module de gestion',
    systemId: 'sys-software', symptomId: 'sym-error-module', triggerText: 'module de gestion',
    requestType: 'Incident', service: 'Applications métier', component: 'Module de gestion', product: 'SAP S/4HANA', version: '2023',
    fr: ['Le module de gestion des stocks affiche une erreur au chargement.', 'Une erreur du module de gestion apparaît quand je valide un bon de commande.'],
    en: ['The stock management module shows an error when loading.', 'An error in the management module appears when I submit an order.'],
  },
  {
    key: 'undetermined', group: 'noise', kind: 'noise', label: 'Ticket d\'une ligne, signature indéterminée',
    systemId: UNDETERMINED_ID, symptomId: UNDETERMINED_ID, triggerText: '',
    requestType: 'Incident', service: null, component: null,
    fr: ['ça ne marche pas'], en: [],
  },
  {
    key: 'restricted', group: 'noise', kind: 'noise', label: 'Ticket à visibilité restreinte (PC-13)',
    systemId: 'sys-software', symptomId: 'sym-error-module', triggerText: 'module de paie',
    requestType: 'Incident', service: 'Applications métier', component: 'Module de paie', product: 'SAP S/4HANA',
    fr: ['Je n\'arrive pas à récupérer mon bulletin de paie, le module de paie affiche une erreur.'], en: [],
  },
  {
    key: 'near-miss-vpn', group: 'noise', kind: 'noise', label: 'Accès distant coupé, autre déclencheur',
    systemId: 'sys-remote-access', symptomId: 'sym-connection-drop', triggerText: 'après un changement de mot de passe',
    requestType: 'Incident', service: 'Accès distant', component: 'VPN', product: 'FortiClient',
    fr: ['Depuis que j\'ai changé mon mot de passe, le VPN coupe au bout de quelques minutes.'], en: [],
  },
  {
    key: 'near-miss-printer', group: 'noise', kind: 'noise', label: 'Imprimante du deuxième étage, autre déclencheur',
    systemId: 'sys-printer', symptomId: 'sym-offline', triggerText: '2e étage',
    requestType: 'Incident', service: 'Impression', component: 'Imprimante 2e étage', product: 'HP LaserJet M428fdw',
    assetId: 'asset-printer-2f',
    fr: ['L\'imprimante du 2e étage ne répond plus depuis hier soir.'], en: [],
  },
];

/** Tous les groupes, dans l'ordre de consommation par l'entrelaceur. */
export const ALL_GROUPS: readonly SampleGroupSpec[] = [...GROUPS, ...NOISE];

// ---------------------------------------------------------------------------
// Générateur pseudo-aléatoire et entrelacement
// ---------------------------------------------------------------------------

/** Générateur maison : jamais `Math.random()`, le jeu doit être reproductible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Élément d'un tableau, ou erreur : jamais `undefined` en silence. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`index hors bornes : ${index}`);
  return item;
}

/** Prénoms, noms et organisations des demandeurs fictifs. */
export const FIRST_NAMES = ['Camille', 'Léna', 'Youssef', 'Marta', 'Antoine', 'Chloé', 'Fatima', 'Hugo', 'Sofia', 'Lucas',
  'Inès', 'Thomas', 'Nadia', 'Pierre', 'Julie', 'Karim', 'Élodie', 'Marc', 'Salima', 'Vincent', 'Alice', 'Bruno',
  'Céline', 'David', 'Emma', 'Farid', 'Géraldine', 'Hélène', 'Ivan', 'Jeanne'];
export const LAST_NAMES = ['Fontaine', 'Barbier', 'Chevalier', 'Delaunay', 'Évrard', 'Fabre', 'Gauthier', 'Hamon', 'Imbert',
  'Jourdan', 'Lambert', 'Mercier', 'Nguyen', 'Ollivier', 'Perrin', 'Quentin', 'Rousseau', 'Sanchez', 'Tessier',
  'Urbain', 'Vasseur', 'Wagner', 'Yannick', 'Zeller', 'Marchand', 'Noël', 'Poirier', 'Renaud', 'Sauvage', 'Thibault'];
export const ORGANIZATIONS = ['Groupe Lumière', 'Atelier Bourdon', 'Cabinet Marchand', 'Clinique du Parc', 'Domaine Rivière',
  'École Saint-Clair', 'Fabrique Meunier', 'Hôtel Beauséjour', 'Laboratoire Varenne', 'Mairie de Saint-Rémy',
  'Négoce Pellet', 'Transports Aubert'];

/** Heures de la journée : la flambée (§8.6) reste la seule activité de 9 h à 11 h. */
export const DAY_HOURS = ['07:15', '08:40', '11:05', '12:30', '13:45', '14:20', '15:50', '16:35', '17:10', '18:05'];

/** Un emplacement de ticket : groupe, texte, jour, heure. */
export interface Slot {
  spec: SampleGroupSpec;
  language: 'fr' | 'en';
  text: string;
  day: number;
  time: string;
  burst: boolean;
}

/**
 * Entrelace les groupes : à chaque tour, celui qui a le plus de tickets
 * restants est servi. Chaque groupe est donc étalé sur toute la fenêtre (§20).
 */
export function interleave(): { spec: SampleGroupSpec; index: number }[] {
  const remaining = ALL_GROUPS.map((spec) => spec.fr.length + spec.en.length);
  const order: { spec: SampleGroupSpec; index: number }[] = [];
  while (order.length < SAMPLE_TICKET_COUNT) {
    let best = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (at(remaining, i) > at(remaining, best)) best = i;
    }
    const spec = at(ALL_GROUPS, best);
    order.push({ spec, index: spec.fr.length + spec.en.length - at(remaining, best) });
    remaining[best] = at(remaining, best) - 1;
  }
  return order;
}

/** Deux tickets par jour, puis flambée et réparation des jours vides (§8.6). */
export function toSlots(order: readonly { spec: SampleGroupSpec; index: number }[]): Slot[] {
  const slots = order.map((entry, index) => {
    const french = entry.index < entry.spec.fr.length;
    return {
      spec: entry.spec,
      language: french ? 'fr' : 'en',
      text: french ? at(entry.spec.fr, entry.index) : at(entry.spec.en, entry.index - entry.spec.fr.length),
      day: Math.floor(index / 2),
      time: at(DAY_HOURS, index % DAY_HOURS.length),
      burst: false,
    };
  });
  markSurge(slots);
  repairCoverage(slots);
  return slots;
}

/** Sept tickets du problème 1 sur le même jour, en moins de deux heures (§8.6). */
function markSurge(slots: Slot[]): void {
  const burst = slots.filter((slot) => slot.spec.key === 'remote-access').slice(0, SAMPLE_SURGE_TIMES.length);
  burst.forEach((slot, index) => {
    slot.day = SAMPLE_SURGE_DAY;
    slot.time = at(SAMPLE_SURGE_TIMES, index);
    slot.burst = true;
  });
}

/** Chaque jour de la fenêtre garde au moins un ticket (§20). */
function repairCoverage(slots: Slot[]): void {
  const counts = new Array<number>(SAMPLE_WINDOW_DAYS).fill(0);
  for (const slot of slots) counts[slot.day] = (counts[slot.day] ?? 0) + 1;
  for (let day = 0; day < counts.length; day += 1) {
    if ((counts[day] ?? 0) > 0) continue;
    const source = counts.findIndex((count) => count > 1);
    if (source < 0) continue;
    const moved = slots.find((slot) => slot.day === source && !slot.burst && slot.spec.kind === 'noise')
      ?? slots.find((slot) => slot.day === source && !slot.burst);
    if (moved === undefined) continue;
    moved.day = day;
    counts[source] = (counts[source] ?? 0) - 1;
    counts[day] = (counts[day] ?? 0) + 1;
  }
}
