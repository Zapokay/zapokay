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

/**
 * Les options d'un menu de provinces : le CODE en valeur, le nom traduit en libellé,
 * dans l'ordre alphabétique DE LA LOCALE.
 *
 * ⚠️ `localeCompare`, PAS UN sort() NU. En ordre de points de code le « Î »
 * d'« Île-du-Prince-Édouard » passe APRÈS le Z : la province tombe en dernier de la
 * liste française. Mesuré dans les Paramètres, d'où ce tri vient — l'anglais rend le
 * même ordre dans les deux cas, c'est le français seul que le tri naïf trahit.
 *
 * ★ UNE SEULE SOURCE POUR LE SIÈGE, À L'INSCRIPTION ET DANS LES PARAMÈTRES. Le tri
 * vivait dans SettingsClient ; recopié à l'étape 3, il aurait divergé.
 *
 * Repli sur le code si un libellé manquait : mieux vaut afficher un code qu'un vide.
 */
export function optionsProvinces(
  locale: string,
  libelles: Record<string, string | undefined>,
): { code: ProvinceCode; label: string }[] {
  return PROVINCE_CODES
    .map((code) => ({ code, label: libelles[code] ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
