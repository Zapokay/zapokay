/**
 * UNE SEULE COMPOSITION D'ADRESSE, ET DEUX SORTIES.
 *
 * Le dépôt composait l'adresse à DEUX endroits, sans que l'un sache l'autre :
 *
 *   · DirectorCard:119 — ville et province, pour la carte à l'écran ;
 *   · registers.ts:115 — ligne 1 et ville, pour le registre. Deux colonnes sur
 *     six, et sans lecteur depuis 702fa65 (2026-04-08).
 *
 * Deux compositions pour un seul objet, c'est le défaut que lib/data-gaps.ts
 * existe pour empêcher sur les exigences. Ici, il porte sur l'affichage.
 *
 * ⛔ AUCUNE CHAÎNE D'INTERFACE, AUCUN CATALOGUE. Ce module ne rend que ce que
 * la base contient, dans l'ordre où on le lit. Il ne traduit rien — voir
 * `adresseRegistre` pour le motif, qui n'est pas une commodité.
 */

import { estVide } from '@/lib/data-gaps';

/**
 * Les six colonnes d'adresse. `company_people` et `shareholder_entities` les
 * portent TOUTES LES SIX, aux mêmes noms — la seconde a gagné `address_line2`
 * avec aed7f5c. Une ligne de l'une ou de l'autre se compose donc ici SANS
 * VARIANTE : le registre des administrateurs y passe ses personnes, celui des
 * actionnaires ses personnes et ses sociétés.
 *
 * ★ `companies` LES PORTE AUSSI depuis 20260913120000 — le siège social — et
 * entre ici SANS VARIANTE, pour la même raison : ce sont les mêmes noms.
 */
export type ChampAdresse =
  | 'address_line1'
  | 'address_line2'
  | 'address_city'
  | 'address_province'
  | 'address_postal_code'
  | 'address_country';

/**
 * ⚠️ `string | null` ET FACULTATIF, les deux. `| null` parce que les six
 * colonnes sont NULLABLE en base ; facultatif parce que les appelants ne
 * sélectionnent pas tous les six champs — DirectorCard n'en lit que deux.
 */
export type PersonneAdressable = { [K in ChampAdresse]?: string | null };

/**
 * ⛔ LE VIDE NE SE REDÉFINIT PAS ICI. `estVide` vient de lib/data-gaps.ts, qui
 * porte déjà la seule définition — null, undefined, ou chaîne vide APRÈS trim.
 * L'y recopier aurait contredit le commentaire que ce fichier-là porte.
 *
 * ⚠️ ET C'EST UN ÉLARGISSEMENT ASSUMÉ. DirectorCard filtrait par
 * `.filter(Boolean)`, qui GARDE une chaîne faite d'espaces ; `estVide` la
 * retire. La divergence ne porte donc que sur une valeur faite d'espaces — et
 * une ville faite de deux espaces n'est pas une ville.
 *
 * ⛔ AUCUN COMPTE DE PARC ICI. L'équivalence des deux sémantiques a été
 * mesurée sur les fiches réelles et le chiffre vit dans le message de commit,
 * que l'historique date. Écrit ici, il serait faux dès la fiche suivante.
 */
function joindre(valeurs: (string | null | undefined)[]): string {
  return valeurs.filter((v) => !estVide(v)).join(', ');
}

/**
 * Ce que la carte administrateur rend : ville et province.
 *
 * ★ SÉPARATEUR «, », VIDES OMIS, AUCUNE VIRGULE ORPHELINE — la jointure ne
 * voit jamais un vide, donc elle n'en produit pas.
 */
export function adresseCourte(p: PersonneAdressable): string {
  return joindre([p.address_city, p.address_province]);
}

/**
 * L'adresse complète, pour le registre : les SIX champs, dans l'ordre où on
 * les lit sur une enveloppe.
 *
 * ⛔ DES CODES, JAMAIS DES NOMS. La province sort « QC » et le pays « CA »,
 * tels que stockés. Ce n'est pas un raccourci :
 *
 *   · les noms de pays viendraient d'`Intl.DisplayNames`, résolus À
 *     L'EXÉCUTION. Ils ne vivent dans AUCUN catalogue ;
 *   · check:glyphs ne balaie que des FICHIERS et des SOUS-ARBRES DE CATALOGUE
 *     (scripts/scan-glyphes.ts:218 et :234). Une chaîne fabriquée à l'exécution
 *     lui échappe par construction ;
 *   · la police du conteneur PDF est Open Sans, 1 010 points de code — mesuré
 *     par l'auto-test du script.
 *
 * Un nom de pays accentué non couvert disparaîtrait donc EN SILENCE sur le
 * document, sans qu'aucune garde ne le voie. C'est exactement le défaut que
 * check:glyphs existe pour empêcher, et un code à deux lettres ne le pose pas.
 */
export function adresseRegistre(p: PersonneAdressable): string {
  return joindre([
    p.address_line1,
    p.address_line2,
    p.address_city,
    p.address_province,
    p.address_postal_code,
    p.address_country,
  ]);
}

/**
 * UNE ADRESSE EN SAISIE — les six champs, en chaînes, jamais `null`.
 *
 * ★ LES NOMS DE COLONNE, PAS UNE TRADUCTION EN camelCase. Le formulaire du siège
 * (inscription, Paramètres) tient son état sous les clés de la base :
 * `champsManquantsSiege` le lit tel quel, `chargeAdresse` l'écrit tel quel. Une
 * seconde nomenclature serait une seconde source à tenir d'accord.
 */
export type AdresseSaisie = Record<ChampAdresse, string>;

/** L'état de départ d'une saisie : RIEN n'est présélectionné — ni pays, ni province. */
export const ADRESSE_VIERGE: AdresseSaisie = {
  address_line1: '',
  address_line2: '',
  address_city: '',
  address_province: '',
  address_postal_code: '',
  address_country: '',
};

/** Une ligne de base ramenée à une saisie : `null` devient `''`, rien d'autre. */
export function adresseEnSaisie(p: PersonneAdressable): AdresseSaisie {
  return {
    address_line1: p.address_line1 ?? '',
    address_line2: p.address_line2 ?? '',
    address_city: p.address_city ?? '',
    address_province: p.address_province ?? '',
    address_postal_code: p.address_postal_code ?? '',
    address_country: p.address_country ?? '',
  };
}

/**
 * Une saisie ramenée à ce qui s'écrit : vide APRÈS trim → `null`.
 *
 * ⛔ AUCUN DÉFAUT. Un champ laissé vide s'écrit `null`, jamais « QC » ni « CA ».
 * ★ UNE SEULE CONVERSION POUR LES DEUX SURFACES DU SIÈGE : l'étape 3 et les
 * Paramètres l'appellent — l'une ne peut pas écrire « '' » pendant que l'autre
 * écrit `null`.
 */
export function chargeAdresse(a: AdresseSaisie): Record<ChampAdresse, string | null> {
  const nul = (v: string) => (estVide(v) ? null : v.trim());
  return {
    address_line1: nul(a.address_line1),
    address_line2: nul(a.address_line2),
    address_city: nul(a.address_city),
    address_province: nul(a.address_province),
    address_postal_code: nul(a.address_postal_code),
    address_country: nul(a.address_country),
  };
}
