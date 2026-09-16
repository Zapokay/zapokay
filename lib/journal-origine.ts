/**
 * LA FRONTIÈRE DU REGISTRE — la ligne qui dit où le livre commence.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-16 : le registre déclare son origine. Mesuré le
 * même jour : 9 des 22 sociétés du parc ont un Historique VIDE, et les 13 autres
 * ont un écart entre leur création et leur première ligne — 11 h en médiane,
 * 188 h au pire. « Aucun événement enregistré pour le moment » est exact, et se
 * lit en démonstration comme « ce produit ne consigne rien ».
 *
 * ⛔⛔ RIEN N'EST STOCKÉ. Cette ligne est CALCULÉE À L'AFFICHAGE, jamais écrite
 * au journal. L'écrire serait FABRIQUER une entrée — exactement ce que le lot
 * précédent a refusé de faire pour les 9 sociétés vides. Un registre ne se
 * remplit pas rétroactivement.
 *
 * ⚠️ ET LE MOT COMPTE, DANS UN PRODUIT LÉGAL. « Registre ouvert » dit ce que le
 * PRODUIT a commencé à voir. Ce n'est PAS la constitution de la société — les
 * confondre serait faux au sens qui compte ici. Les deux phrases sont donc
 * séparées, et la seconde nomme un autre fait.
 *
 * ⛔ L'ANCRAGE EST LA DATE DE CRÉATION DE LA SOCIÉTÉ, JAMAIS LA PREMIÈRE LIGNE
 * DU JOURNAL. Ancrer sur la première ligne, ce serait le registre qui se date
 * lui-même — et il se daterait 188 h trop tard dans le pire cas mesuré.
 *
 * ⚪ `incorporation_date` EST NULLABLE, ET LA PHRASE DISPARAÎT ALORS. On ne sait
 * pas, donc on ne dit pas : pas de repli, pas d'approximation. C'est la même
 * règle que « aucune date juridique devinée », que `check:dates` fait respecter
 * aux formulaires.
 */

/** Le résolveur du catalogue, portée `activity`. Fourni par l'appelant. */
export type ResolveurActivite = (cle: string, params?: Record<string, string>) => string;

/**
 * La ligne d'origine, assemblée. Trois phrases possibles, dans cet ordre :
 *   · TOUJOURS   « Registre ouvert le … »
 *   · si connue  « Société constituée le … »
 *   · si vide    « Aucun événement depuis. »
 *
 * ⛔ Les DATES ARRIVENT DÉJÀ FORMATÉES. Ce module ne formate rien : le dépôt a
 * `formatDate`, qui connaît déjà fr-CA et en-CA, et une seconde façon de rendre
 * une date serait une seconde vérité.
 */
export function ligneOrigine(
  t: ResolveurActivite,
  dates: { registreOuvertLe: string; constitueeLe: string | null },
  registreVide: boolean,
): string {
  const phrases = [t('registerOpened', { date: dates.registreOuvertLe })];
  if (dates.constitueeLe) {
    phrases.push(t('companyIncorporated', { date: dates.constitueeLe }));
  }
  if (registreVide) phrases.push(t('noEventsSince'));
  return phrases.join(' ');
}
