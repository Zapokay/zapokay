/**
 * UNE SEULE DÉCLARATION DES TITRES DE DIRIGEANT, ET LE CATALOGUE POUR LES DIRE.
 *
 * Le dépôt portait TREIZE tables de libellés dans onze fichiers, et elles ne
 * disaient pas la même chose — mesuré le 2026-09-11 : « Trésorier·ière » dans
 * neuf d'entre elles contre « Trésorier·ère » dans trois, « Vice-President »
 * dans une contre « Vice President » dans huit, et trois tables nommaient
 * `director_general`, une valeur que le CHECK de `officer_appointments`
 * refuse. Ce fichier est la déclaration dont le REGISTRE dérive ; les douze
 * autres tables restent en place et partent au lot suivant.
 *
 * ⛔ AUCUNE CHAÎNE D'INTERFACE ICI. Ce module rend des CLÉS de catalogue, et
 * chaque surface les résout avec son mécanisme — `getServerMessage` au
 * registre, `useTranslations` à l'écran. Même patron que les colonnes de
 * registre et que les motifs de fin d'une détention.
 */
import type { OfficerTitle } from '@/lib/supabase/people-types';

/**
 * ★ LE TITRE `custom` N'A PAS DE LIBELLÉ, ET C'EST LE TYPE QUI LE DIT. Il rend
 * `custom_title`, du texte d'utilisateur : lui donner une entrée de catalogue
 * serait traduire ce que l'utilisateur a écrit. `Exclude` rend impossible
 * d'écrire cette entrée — le compilateur refuse, personne ne devine au rendu.
 */
export type TitreAvecLibelle = Exclude<OfficerTitle, 'custom'>;

/**
 * ★ `Record` SUR L'UNION, EXACTEMENT COMME `CLE_MOTIF_FIN` L'EST SUR LES
 * MOTIFS. Un cinquième titre ajouté à `OfficerTitle` échoue À LA COMPILATION
 * tant que sa clé n'est pas écrite ici. L'union, elle, borne déjà les cinq
 * valeurs du CHECK de `officer_appointments`.
 */
export const CLE_TITRE: Record<TitreAvecLibelle, `officers.titles.${TitreAvecLibelle}`> = {
  president: 'officers.titles.president',
  vice_president: 'officers.titles.vice_president',
  secretary: 'officers.titles.secretary',
  treasurer: 'officers.titles.treasurer',
};

/**
 * Le repli d'un titre personnalisé SANS texte — un état que la base admet et
 * que le produit ne crée pas : la modale exige le texte. Il vit sous le MÊME
 * sous-arbre que les quatre autres, donc sous la même garde de glyphes.
 */
export const CLE_TITRE_PERSONNALISE = 'officers.titles.custom' as const;

/**
 * Le libellé d'une charge, dans la langue que le résolveur porte.
 *
 *   · `custom` rend son `custom_title` VERBATIM — jamais traduit ;
 *   · un titre que la table ne connaît pas fait ÉCHOUER la lecture : il ne
 *     s'imprime ni brut ni deviné, comme un motif de fin inconnu.
 */
export function libelleTitre(
  charge: { title: string; custom_title: string | null },
  resoudre: (cle: string) => string,
): string {
  if (charge.title === 'custom') {
    return charge.custom_title?.trim() || resoudre(CLE_TITRE_PERSONNALISE);
  }
  const cle = CLE_TITRE[charge.title as TitreAvecLibelle];
  if (!cle) throw new Error(`libelleTitre: unknown officer title "${charge.title}"`);
  return resoudre(cle);
}
