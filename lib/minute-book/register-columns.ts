/**
 * UNE SEULE DÉCLARATION DES COLONNES DE REGISTRE, ET DEUX SURFACES.
 *
 * Les quatre registres déclaraient leurs colonnes DEUX FOIS, dans deux fichiers
 * qui ne se connaissaient pas :
 *
 *   · components/minute-book/BinderView.tsx — pour l'écran ;
 *   · app/api/due-diligence/export/route.ts — pour le PDF.
 *
 * ⛔ ET RIEN NE LES OBLIGEAIT À COÏNCIDER. binder-registers.ts:51 rend
 * `row[c.key] ?? ''` : une clé déclarée d'un côté et absente de l'autre rend
 * une CELLULE VIDE, sans erreur, sans diagnostic, sans que rien ne le dise.
 * Deux marques indépendantes pour une seule décision — le défaut même que le
 * lot b0f44ed a retiré sur les exigences.
 *
 * ⛔ AUCUNE CHAÎNE D'INTERFACE ICI. Ce module rend des IDENTIFIANTS : une clé
 * de donnée et un suffixe de clé de catalogue. Chaque surface résout ses
 * libellés avec son propre mécanisme — `useTranslations` à l'écran,
 * `getServerMessage` au serveur — et ce fichier n'en connaît aucun.
 */

/**
 * ★ LE TYPE EST LA GARDE, DES DEUX CÔTÉS. Cette union ferme l'ensemble des
 * suffixes : une colonne ne peut pas en nommer un qui n'existe pas, ET la
 * table d'étiquettes de l'écran est un `Record` sur cette même union — donc
 * tsc refuse aussi celle qui en OUBLIE un. Une chaîne libre aurait laissé les
 * deux fautes se rendre en silence : en-tête vide d'un côté, clé manquante de
 * l'autre.
 */
export type CleEtiquette =
  | 'name'
  /**
   * ⚠️ LA COLONNE FUSIONNÉE — nom et adresse. Les administrateurs d'abord
   * (3ba3a2e), les actionnaires ensuite. `name` n'est pas modifiée : le registre
   * des dirigeants l'emploie et n'a pas d'adresse. Deux colonnes différentes,
   * deux étiquettes.
   */
  | 'nameAndAddress'
  | 'residence'
  | 'start'
  | 'end'
  | 'active'
  | 'title'
  | 'shareClass'
  | 'quantity'
  | 'certificate'
  | 'issueDate'
  | 'statedCapital';

/**
 * ⛔ LE TRAITEMENT DE COUPURE, PAR COLONNE — ET C'EST UNE CORRECTION.
 *
 * Une première version posait `overflow-wrap: anywhere` sur TOUTES les cellules
 * et TOUS les en-têtes du tableau. Filmé le 2026-09-10, le résultat :
 *
 *   · l'en-tête « ACTIVE » coupé en « ACTIV / E » ;
 *   · « CERT. » coupé en « CERT / . » ;
 *   · les dates coupées — « 2025-06- / 30 », « 2020-02- / 02 » ;
 *   · et une QUANTITÉ D'ACTIONS coupée : « 50000 / 0 ».
 *
 * ⛔ UN NOMBRE D'ACTIONS SCINDÉ EST UN DOCUMENT FAUX. La garde faisait plus de
 * mal que le débordement qu'elle prévenait.
 *
 * Le traitement vit donc ICI, colonne par colonne — la déclaration est déjà la
 * source unique des deux surfaces, c'est sa place. Trois cas, et rien d'autre.
 */
export type TraitementCellule =
  /**
   * `overflow-wrap: anywhere`. RÉSERVÉ À L'ADRESSE : c'est le seul champ qui
   * peut porter un jeton continu plus large que sa colonne (une rue sans
   * espace, un code postal collé). `anywhere` agit aussi sur la largeur
   * min-content, donc la colonne peut se resserrer.
   */
  | 'coupable'
  /**
   * `white-space: nowrap`. DATES ET NOMBRES.
   *
   * ⚠️ ET CE N'EST PAS REDONDANT AVEC LE RETRAIT D'`anywhere`. Le retour au
   * défaut ne suffit pas pour une date : le navigateur coupe naturellement
   * APRÈS UN TRAIT D'UNION, donc « 2025-06-30 » reste coupable sans cette
   * déclaration. Une date ne se coupe JAMAIS.
   */
  | 'insecable';

/** Une colonne, telle que les deux surfaces la déclarent. */
export interface ColonneRegistre {
  /**
   * La clé de donnée. C'est celle que le PDF emploie, et la clé canonique de
   * la colonne.
   */
  key: string;
  /**
   * Le suffixe sous `minuteBook.registers.columns.*`. Un suffixe, jamais un
   * libellé : les onze existants servent déjà aux deux surfaces.
   */
  cleEtiquette: CleEtiquette;
  /**
   * ⚠️ L'ÉCART DE NOM DE L'ÉCRAN, PORTÉ PLUTÔT QUE CORRIGÉ.
   *
   * `BinderView` étale l'entrée brute dans sa ligne (`...e`), donc `end_date`
   * y est DÉJÀ pris par la valeur brute — la date affichable a besoin d'un
   * second nom. Le PDF, lui, construit ses lignes champ par champ et réutilise
   * `end_date` sans conflit.
   *
   * ⛔ CE N'EST PAS UNE DIVERGENCE DE DONNÉE, et on ne la résout pas en
   * renommant quoi que ce soit : les deux surfaces rendent la même valeur, et
   * les trois registres non touchés par ce lot doivent sortir identiques à
   * l'octet. Une clé d'écran facultative fait tenir les deux dans une seule
   * déclaration, au prix d'un champ nommé — et lisible.
   */
  cleEcran?: string;
  /**
   * ★ LA SECONDE LIGNE DE LA CELLULE — une clé de donnée, comme `key`.
   *
   * À six colonnes (cas fédéral, avec résidence), l'adresse seule ne disposait
   * que d'une fraction de la largeur utile et se renvoyait sur plusieurs
   * lignes, pendant que la hauteur des rangées variait du simple au triple.
   * Fusionnée sous le nom, la paire dispose de la largeur des deux.
   *
   * ⛔ AUCUN CHIFFRE ICI. Les largeurs et les hauteurs ont été rendues et
   * mesurées ; elles vivent dans le message de commit. Une mesure de mise en
   * page inscrite dans le code est fausse au premier changement de gabarit.
   *
   * ⛔ LA DÉCISION VIT ICI, PAS DANS LES RENDUS. Ni le gabarit PDF ni
   * RegisterCard ne savent QUELLE colonne porte une seconde ligne : ils lisent
   * cette clé. Une colonne sans `cleSecondaire` rend son principal, et rien
   * d'autre.
   *
   * ⛔ SECONDAIRE VIDE = AUCUNE SECONDE LIGNE. Pas de `<br>`, pas d'espace
   * réservé, pas de rangée plus haute : une fiche sans adresse doit rendre
   * exactement ce qu'elle rendait avant ce lot.
   */
  cleSecondaire?: string;
  /**
   * Le traitement de coupure de la CELLULE. Absent = défaut du navigateur,
   * c'est-à-dire renvoi sur les espaces.
   *
   * ⛔ LA CELLULE, JAMAIS L'EN-TÊTE. Sans `anywhere`, « ACTIVE » et « CERT. »
   * redeviennent insécables d'eux-mêmes, et « RÉSIDENCE CANADIENNE » se renvoie
   * sur son espace — ce qu'il faisait déjà correctement avant ce lot.
   */
  traitement?: TraitementCellule;
}

/**
 * ★ LA COLONNE DE RÉSIDENCE SUIT LA DÉCISION DU REGISTRE, jamais un régime
 * recalculé : `shows_residency` vient du lecteur, et les deux surfaces lisent
 * le même booléen. Elle est donc paramétrée, pas conditionnelle sur place.
 */
export function colonnesAdministrateurs(
  montreResidence: boolean,
): readonly ColonneRegistre[] {
  /**
   * ⚠️ ANNOTÉE, ET CE N'EST PAS COSMÉTIQUE. Sans le type sur ce tableau, TS
   * élargit `'residence'` en `string` et l'élargissement CONTAMINE le tableau
   * étalé : les cinq autres colonnes perdent leur type littéral avec elle.
   */
  const residence: readonly ColonneRegistre[] = montreResidence
    ? [{ key: 'resident', cleEtiquette: 'residence' }]
    : [];

  return [
    /**
     * ⚪ LE NOM ET L'ADRESSE, EN UNE SEULE COLONNE, SUR DEUX LIGNES. Le registre
     * nomme une personne puis la situe — ce sont deux faits sur la MÊME
     * personne, pas deux colonnes.
     *
     * ★ `coupable` PASSE ICI AVEC L'ADRESSE. C'est cette colonne qui porte
     * désormais le jeton potentiellement continu ; la colonne `address` n'existe
     * plus, son traitement l'a suivie.
     */
    {
      key: 'full_name',
      cleSecondaire: 'address',
      cleEtiquette: 'nameAndAddress',
      traitement: 'coupable',
    },
    ...residence,
    { key: 'appointment_date', cleEtiquette: 'start', traitement: 'insecable' },
    { key: 'end_date', cleEtiquette: 'end', cleEcran: 'end_date_display', traitement: 'insecable' },
    { key: 'status', cleEtiquette: 'active' },
  ];
}

export const COLONNES_DIRIGEANTS: readonly ColonneRegistre[] = [
  { key: 'full_name', cleEtiquette: 'name' },
  { key: 'title', cleEtiquette: 'title' },
  { key: 'appointment_date', cleEtiquette: 'start', traitement: 'insecable' },
  { key: 'end_date', cleEtiquette: 'end', cleEcran: 'end_date_display', traitement: 'insecable' },
  { key: 'status', cleEtiquette: 'active' },
];

/**
 * ★ L'ADRESSE, SOUS LE NOM — comme au registre des administrateurs.
 *
 * Elle était bloquée ici par décision : l'adresse d'une société était
 * FABRIQUÉE — un pays posé par COALESCE, une province pré-sélectionnée — et
 * rien ne permettait de la corriger. Les deux conditions sont levées : la
 * fabrication est fermée depuis aed7f5c, la correction existe depuis 2e1a7ee.
 *
 * Ce registre porte des PERSONNES et des SOCIÉTÉS. L'adresse sort de la même
 * branche que le nom (registers.ts, `identiteDetenteur`) et passe par la même
 * composition, `adresseRegistre`, pour les deux.
 *
 * ⚠️ LE COÛT EST CONNU ET ASSUMÉ. La colonne fusionnée prend sa largeur aux
 * autres ; une catégorie longue se renvoie alors sur deux lignes, y compris
 * dans les rangées sans adresse. La hauteur se pagine ; un registre incomplet
 * ne se rattrape pas.
 *
 * ⛔ AUCUN CHIFFRE ICI : les largeurs et les hauteurs ont été rendues et
 * mesurées, et elles vivent au message de commit.
 */
export const COLONNES_ACTIONNAIRES: readonly ColonneRegistre[] = [
  {
    key: 'full_name',
    cleSecondaire: 'address',
    cleEtiquette: 'nameAndAddress',
    traitement: 'coupable',
  },
  { key: 'share_class', cleEtiquette: 'shareClass' },
  { key: 'quantity', cleEtiquette: 'quantity', traitement: 'insecable' },
  { key: 'certificate_number', cleEtiquette: 'certificate', traitement: 'insecable' },
  { key: 'issue_date', cleEtiquette: 'issueDate', traitement: 'insecable' },
];

export const COLONNES_CAPITAL: readonly ColonneRegistre[] = [
  { key: 'class_name', cleEtiquette: 'shareClass' },
  { key: 'stated_capital', cleEtiquette: 'statedCapital', traitement: 'insecable' },
];

/**
 * Résout une déclaration en la forme `{ key, label }` que les DEUX rendus
 * attendent — `RegisterCard` à l'écran, `binderRegistersHTML` au PDF.
 *
 * @param pourEcran choisit `cleEcran` quand elle existe. Le PDF passe `false`.
 * @param etiquette résout un suffixe en libellé, avec le mécanisme de l'appelant.
 */
export function resoudre(
  colonnes: readonly ColonneRegistre[],
  pourEcran: boolean,
  etiquette: (suffixe: CleEtiquette) => string,
): {
  key: string;
  label: string;
  cleSecondaire?: string;
  traitement?: TraitementCellule;
}[] {
  return colonnes.map((c) => ({
    key: pourEcran ? c.cleEcran ?? c.key : c.key,
    label: etiquette(c.cleEtiquette),
    cleSecondaire: c.cleSecondaire,
    traitement: c.traitement,
  }));
}

/**
 * Le style INLINE d'une cellule, pour les deux rendus.
 *
 * ⛔ UNE SEULE TRADUCTION DU TRAITEMENT EN CSS, et elle ne se recopie pas : le
 * gabarit PDF et RegisterCard l'appellent tous les deux. Deux traductions
 * auraient pu diverger — le défaut que ce module existe pour empêcher.
 */
/**
 * LA TABLE DES STYLES — UNE ENTRÉE PAR TRAITEMENT, LES DEUX FORMES ENSEMBLE.
 *
 * La colonne ne déclare QUE sa décision : `coupable`, `insecable`, ou rien.
 * Les deux formes de style en DÉRIVENT ici, et nulle part ailleurs — le PDF
 * veut une chaîne CSS, React veut un objet ; la forme diffère parce que la
 * CIBLE diffère, jamais parce que quelqu'un a rejugé.
 *
 * ⛔ AUCUN RENDU NE TRADUIT LE TRAITEMENT. Ni binder-registers.ts ni
 * RegisterCard.tsx ne connaissent `overflow-wrap` : ils lisent cette table.
 * Deux traductions posées dans deux rendus auraient pu diverger sans qu'aucune
 * garde ne le voie — le défaut même que ce module existe pour empêcher.
 *
 * ★ `Record` SUR L'UNION, EXACTEMENT COMME CHAMPS_REQUIS L'EST SUR LES RÔLES.
 * Ajouter un traitement au type sans l'inscrire ici échoue À LA COMPILATION —
 * et l'inscrire sans lui donner ses DEUX formes échoue aussi. Il est donc
 * impossible de décrire un traitement d'un seul côté.
 *
 * ⛔ Type structurel pour la forme React, pas `CSSProperties` : ce module ne
 * dépend pas de React. L'objet rendu est assignable à `style` sans conversion.
 */
export const STYLES_CELLULE: Record<
  TraitementCellule,
  { css: string; react: { overflowWrap?: 'anywhere'; whiteSpace?: 'nowrap' } }
> = {
  coupable: { css: 'overflow-wrap:anywhere', react: { overflowWrap: 'anywhere' } },
  insecable: { css: 'white-space:nowrap', react: { whiteSpace: 'nowrap' } },
};

/** Le style du PDF, dérivé de la table. Absent de traitement = absent de style. */
export function styleCellule(t?: TraitementCellule): string | undefined {
  return t ? STYLES_CELLULE[t].css : undefined;
}

/** Le style de l'écran, dérivé de LA MÊME entrée de la même table. */
export function styleCelluleReact(
  t?: TraitementCellule,
): { overflowWrap?: 'anywhere'; whiteSpace?: 'nowrap' } | undefined {
  return t ? STYLES_CELLULE[t].react : undefined;
}
