/**
 * LE TEXTE QUE LE JOURNAL ÉCRIT QUAND UNE INSCRIPTION SE TERMINE — fonction pure.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-16 : le registre a une ORIGINE. Le premier item
 * est l'inscription elle-même, et le livre commence là.
 *
 * ⭐⭐ UNE LIGNE, PAS SIX, ET LA RAISON EST LA DÉFINITION D'UN REGISTRE.
 * « On consigne ce qui a EU LIEU, pas ce qui a été demandé. » Du point de vue de
 * la personne il ne s'est pas passé six choses — il s'en est passé UNE :
 * l'entreprise a été inscrite. Consigner six lignes, ce serait consigner NOS
 * ÉTAPES, c'est-à-dire l'intérieur de notre produit.
 *
 * ⛔⛔ SAUTER N'EST PAS ÉCHOUER, ET CETTE PHRASE EST ICI POUR ARRÊTER QUELQU'UN.
 * Les étapes 4, 5 et 6 ont un `onSkip` qui avance SANS RIEN ÉCRIRE. Une société
 * sans dirigeants, sans actionnaires ou sans administrateurs est une inscription
 * COMPLÉTÉE, pas une inscription cassée. La ligne consigne « l'entreprise a été
 * inscrite » — jamais un compte d'écritures, jamais une condition sur ces
 * comptes. ★ Si quelqu'un veut ajouter une garde « et si zéro dirigeant », c'est
 * ce paragraphe qui doit l'arrêter : zéro est une réponse, pas une anomalie.
 *
 * ⚠️ LA LANGUE, ET LA MESURE A CORRIGÉ LA CONSIGNE. Le brief demandait de
 * composer sur `data.language`, la langue choisie à l'inscription. Mesuré le
 * 2026-09-16 : une société porte DEUX noms légaux possibles, et 4 des 22 du parc
 * les ont DIFFÉRENTS (6 n'ont aucun nom anglais). Le nom a donc son propre axe de
 * langue, et `data.language` ne le décide pas. Chaque côté prend LE SIEN et
 * replie sur l'autre quand il est absent — ce qui est plus juste que la consigne,
 * puisqu'un nom légal anglais ne devient pas français parce qu'on s'est inscrit
 * en français.
 */
export interface NomsLegaux {
  fr: string | null | undefined;
  en: string | null | undefined;
}

/** Ce que la ligne DÉNOMBRE — dans `details`, jamais dans le texte. */
export interface DenombrementInscription {
  regime: string;
  administrateurs: number;
  actionnaires: number;
  dirigeants: number;
}

const TOURNURES = { fr: 'Société inscrite', en: 'Company registered' } as const;

/**
 * Les deux titres de la ligne `company_created`, composés du MÊME geste.
 *
 * ⛔ LE TEXTE NE PORTE QUE LE NOM. Les dénombrements vont dans `details` :
 * une ligne se LIT, un dénombrement se CONSULTE. Y verser « 3 administrateurs,
 * 2 actionnaires, 1 dirigeant » ferait de la première ligne du registre un
 * bordereau.
 * ⛔ ET LE NOM EST GELÉ MAINTENANT, dans les deux langues : rien ne recompose
 * cette ligne à la lecture, et une société peut être renommée.
 */
export function titresDeJournalInscription(noms: NomsLegaux): {
  titleFr: string;
  titleEn: string;
} {
  const fr = (noms.fr ?? '').trim();
  const en = (noms.en ?? '').trim();
  // Chacun le sien, repli sur l'autre. Le CHECK `companies_legal_name_present`
  // accepte l'un vide, jamais les deux — il y a donc toujours un nom à écrire.
  return {
    titleFr: `${TOURNURES.fr} : ${fr || en}`,
    titleEn: `${TOURNURES.en}: ${en || fr}`,
  };
}
