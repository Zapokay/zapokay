/**
 * Les codes des provinces et territoires du Canada, et rien d'autre.
 *
 * ⛔ AUCUN LIBELLÉ N'EST ÉCRIT ICI, ET C'EST DÉLIBÉRÉ — même décision que
 * lib/countries.ts, son voisin. Les treize libellés vivent déjà dans le
 * catalogue sous `provinces.*`, traduits dans les deux locales.
 *
 * ⛔ CE QUI A ÉTÉ RETIRÉ EN CRÉANT CE FICHIER. PersonSelector portait la même
 * liste sous forme d'objets `{ value, label }`, avec des libellés BILINGUES
 * CODÉS EN DUR — « Colombie-Britannique / British Columbia ». CLAUDE.md §1
 * l'interdit, et surtout : personne ne les rendait. Le `<select>` affiche
 * `prov.value`, jamais `prov.label`. Treize chaînes bilingues maintenues à la
 * main pour être jetées au rendu.
 *
 * ⚪ Rendre les libellés traduits au lieu des codes reste un item de file. Il
 * se fera désormais EN UN SEUL ENDROIT au lieu de deux — c'est précisément ce
 * que ce fichier rend possible, et il ne le fait pas lui-même.
 *
 * ★ LE TYPE EST LA GARDE. `as const` ferme la liste : `ProvinceCode` n'admet
 * que ces treize valeurs, et un code inventé échoue à la compilation au lieu
 * de se découvrir dans un menu vide.
 */
export const PROVINCE_CODES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const;

export type ProvinceCode = (typeof PROVINCE_CODES)[number];
