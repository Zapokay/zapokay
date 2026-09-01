// Lot Dénomination — LA source unique du choix entre les deux dénominations.
//
// Le certificat de constitution émis par Corporations Canada porte UN champ,
// « Corporate name / Dénomination sociale », qui peut contenir quatre choses :
// un nom français seul, un nom anglais seul, un nom bilingue combiné, ou deux
// versions distinctes juridiquement équivalentes. La base accepte les quatre
// depuis 50b9d62 ; cette fonction est ce qui les rend.
//
// ⚠️ LE REPLI VA DANS LES DEUX SENS, ET C'EST TOUT L'OBJET DU FICHIER. Les
// trois générateurs de documents faisaient `language === 'en' ? (en ?? fr) : fr`.
// Ce `: fr` nu était sûr tant que legal_name_fr était NOT NULL — il ne l'est
// plus. Une société à nom anglais seul rendait `null` dans un document légal.
//
// ⚠️ LES MÊMES RÈGLES QUE LA CONTRAINTE companies_legal_name_present, ET IL FAUT
// QUE ÇA RESTE VRAI. Elle écrit NULLIF(BTRIM(x), ''), donc pour elle la valeur
// nulle, la chaîne vide et la chaîne d'espaces sont un seul et même « absent ».
// Le `.trim() ||` ci-dessous dit exactement cela. Une fonction plus laxiste que
// la contrainte ferait préférer une chaîne d'espaces à un vrai nom.
//
// ★ LA LANGUE EST REQUISE, SANS DÉFAUT. Un défaut ferait qu'un appelant qui
// l'oublie reçoit une valeur en silence ; sans défaut, tsc force chaque
// appelant à dire de quelle langue il parle. Et ils ne parlent pas tous de la
// même : les ÉCRANS passent la locale d'interface, les DOCUMENTS passent
// users.preferred_language. Deux mécanismes distincts (CLAUDE.md §3), une
// seule fonction.
//
// ★ L'ARGUMENT EST UN OBJET, PAS DEUX CHAÎNES. Deux paramètres `string | null`
// côte à côte s'intervertissent en silence — ni tsc ni un test ne verraient la
// différence, et le défaut ne se manifesterait que chez les sociétés dont les
// deux noms diffèrent, c'est-à-dire aucune aujourd'hui. Les champs nommés
// ferment ce piège, et tous les appelants ont déjà l'objet sous la main.
//
// Forme calquée sur pickShareClassName (lib/pdf/share-class-name.ts) : objet
// d'abord, langue ensuite. Rend `null` quand AUCUN des deux n'est présent — un
// état que la contrainte interdit en base, mais que le typage ne peut pas
// promettre ; les appelants le traitent chacun avec leur propre sortie d'échec.
export function pickCompanyLegalName(
  company: {
    legal_name_fr?: string | null;
    legal_name_en?: string | null;
  },
  language: 'fr' | 'en',
): string | null {
  const fr = company.legal_name_fr?.trim() || null;
  const en = company.legal_name_en?.trim() || null;
  return language === 'en' ? (en ?? fr) : (fr ?? en);
}
