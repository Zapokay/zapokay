/**
 * LE TEXTE QUE LE JOURNAL ÉCRIT POUR UNE CORRECTION DE DÉTENTION.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-21, lot Z-B. `EditShareholdingModal` était le
 * SEUL chemin de correction du dépôt qui se taise — mesuré au lot Y-1c. Les
 * cinq autres journalisent déjà (`person_identity_updated`,
 * `shareholder_entity_edited`, les deux `EditFormer*`, `SettingsClient`).
 *
 * ★ MÊME PATRON QUE `lib/journal-charge.ts`, ET POUR LA MÊME RAISON. Une
 * modale passe par un portail et rend `null` hors navigateur : sa règle serait
 * INVÉRIFIABLE autrement qu'à l'œil. Le texte d'un registre ne peut pas
 * reposer sur « quelqu'un l'a regardé une fois ». Sorti ici, il s'exécute dans
 * une sonde.
 *
 * ⚪ LES DEUX LANGUES SONT ÉCRITES ICI, PAS DANS LE CATALOGUE D'INTERFACE, et
 * ce n'est pas une entorse à la règle §1 du CLAUDE.md : le journal STOCKE du
 * texte rendu, dans les deux langues, au MOMENT de l'écriture. Il ne peut donc
 * pas passer par `useTranslations`, qui résout une langue à l'affichage.
 * `journal-charge.ts` a tranché la même question le 2026-09-16 ; on ne la
 * rejuge pas, on suit.
 *
 * ⛔⛔ LE VERBE DIT « CORRIGÉE », JAMAIS UN ACTE NEUF — C'EST LA CONSIGNE
 *   D'HARVEY SUR LE VERBE, APPLIQUÉE ICI TOUT DE SUITE.
 *   « Administrateur ajouté » se lit « nommé » ; de même, une correction qui
 *   se lirait « Actions émises » ou « Détention créée » ferait croire à une
 *   RÉ-ÉMISSION. Dans un registre de valeurs mobilières, une émission
 *   fantôme est pire que le silence qu'on remplace. Le mot est « corrigée » /
 *   « corrected », et il ne se négocie pas.
 *
 * ⛔ LE MOTIF ET LE DEMANDEUR SONT DIFFÉRÉS — DÉCISION DE DOM DU 2026-09-21,
 *   PRISE EN CONNAISSANCE DE L'ART. 21 C-1.1. Cette ligne ne demande NI
 *   pourquoi la correction a lieu, NI qui l'a demandée, et n'en invente
 *   aucun. ⚪ SA RÉOUVERTURE EST DATÉE : avant la porte `signup-ON`, pas
 *   après — une fois des tiers dans le produit, une correction sans motif
 *   devient une question qu'on ne peut plus poser rétroactivement.
 */

/** Les cinq champs que `EditShareholdingModal` peut corriger. Mesuré au
 *  lot Y-1c, `EditShareholdingModal.tsx:55`. */
export type ChampDetention =
  | 'issue_date'
  | 'quantity'
  | 'share_class'
  | 'issue_price_per_share'
  | 'certificate_number';

/**
 * ⛔ L'ORDRE DE CETTE LISTE EST LE MIEN, ET IL A UNE RAISON JURIDIQUE.
 *
 * `issue_date` VIENT EN PREMIER parce que l'art. 33 par. 3° LSAQ prescrit au
 * registre des valeurs mobilières « la DATE et les détails de l'émission ».
 * Corriger cette date, c'est corriger un contenu PRESCRIT — la ligne doit le
 * montrer, pas le noyer au milieu de quatre autres champs.
 * ⚪ Les quatre autres suivent dans l'ordre où la modale les présente.
 */
const ORDRE: readonly ChampDetention[] = [
  'issue_date',
  'share_class',
  'quantity',
  'issue_price_per_share',
  'certificate_number',
];

const NOMS: Record<ChampDetention, { fr: string; en: string }> = {
  issue_date: { fr: "date d'émission", en: 'issue date' },
  share_class: { fr: "catégorie d'actions", en: 'share class' },
  quantity: { fr: "nombre d'actions", en: 'number of shares' },
  issue_price_per_share: { fr: 'prix par action', en: 'price per share' },
  certificate_number: { fr: 'numéro de certificat', en: 'certificate number' },
};

/**
 * Les valeurs d'une détention, DÉJÀ RENDUES POUR L'ŒIL.
 *
 * ⛔ DES CHAÎNES, PAS DES IDENTIFIANTS. `share_class_id` est un UUID ; écrire
 * « catégorie d'actions 8f3a… → 1c7b… » au journal serait illisible et
 * inutile. L'appelant résout le NOM de la catégorie — il a la liste sous la
 * main — et ce module n'a donc jamais à connaître la base.
 * ⚪ Une valeur absente se rend `—`, jamais la chaîne vide : « → » suivi de
 * rien ne se lit pas.
 */
export type ValeursDetention = Record<ChampDetention, string>;

const VIDE = '—';
const montre = (v: string) => (v.trim() === '' ? VIDE : v.trim());

/**
 * Les champs qui ont RÉELLEMENT changé, dans l'ordre déclaré ci-dessus.
 *
 * ⛔ UNE COMPARAISON, PAS UNE INTENTION. La modale réécrit les cinq colonnes à
 * chaque enregistrement ; sans cette fonction, la ligne annoncerait cinq
 * corrections pour un numéro de certificat retouché. Un registre qui exagère
 * ce qu'il a changé est aussi faux qu'un registre qui le tait.
 */
export function champsCorriges(
  avant: ValeursDetention,
  apres: ValeursDetention,
): ChampDetention[] {
  return ORDRE.filter((c) => montre(avant[c]) !== montre(apres[c]));
}

/**
 * LES DEUX TITRES D'UNE CORRECTION — qui, quoi, et ANCIENNE → NOUVELLE.
 *
 * ★ LA FORME EST CELLE DU REMPLACEMENT, que Dom a nommée comme modèle :
 *   « Dirigeant remplacé : Phil The Bill → Fak Que — Vice-président·e »
 * On garde la flèche, et on la met sur chaque champ corrigé :
 *   « Détention corrigée : Jean Tremblay — date d'émission 2024-03-15 →
 *     2024-04-01 · nombre d'actions 100 → 150 »
 *
 * ⛔ AUCUN CHAMP CORRIGÉ N'EST TU. La liste est celle que `champsCorriges`
 * rend, entière ; on ne tronque pas à trois pour la longueur. Un registre qui
 * abrège ce qu'il a changé oblige à ouvrir la base pour savoir quoi.
 *
 * ⚠️ ET SI RIEN N'A CHANGÉ, IL N'Y A PAS DE LIGNE À ÉCRIRE. La fonction rend
 * `null` plutôt qu'un titre creux : l'appelant n'appelle pas `logActivity`.
 * Sans ça, ouvrir la modale et enregistrer sans rien toucher inscrirait une
 * correction imaginaire au registre.
 */
export function titresDeCorrectionDetention(
  detenteur: string,
  avant: ValeursDetention,
  apres: ValeursDetention,
): { titleFr: string; titleEn: string; champs: ChampDetention[] } | null {
  const champs = champsCorriges(avant, apres);
  if (champs.length === 0) return null;

  const partie = (langue: 'fr' | 'en') =>
    champs
      .map((c) => `${NOMS[c][langue]} ${montre(avant[c])} → ${montre(apres[c])}`)
      .join(' · ');

  return {
    titleFr: `Détention corrigée : ${detenteur} — ${partie('fr')}`,
    titleEn: `Holding corrected: ${detenteur} — ${partie('en')}`,
    champs,
  };
}
