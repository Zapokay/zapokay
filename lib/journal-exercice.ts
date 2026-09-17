/**
 * LE TEXTE QUE LE JOURNAL ÉCRIT QUAND UN EXERCICE ENTRE OU SORT DU SUIVI.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-17 : UNE LIGNE PAR ANNÉE, avec les deux types qui
 * existaient déjà au CHECK — `fiscal_year_activated` et `fiscal_year_archived`.
 *
 * ⭐ ET C'EST LE MOTIF DES CHARGES : le MÊME geste par DEUX portes → la même
 * ligne. `SettingsClient` et `FiscalYearsSetup` appellent tous deux un
 * `toggleYear` qui écrit À CHAQUE CLIC. Un clic, un geste, une ligne.
 *
 * ⛔⛔ LA CONDITION DE `fiscal_years_defined` / `fiscal_years_updated`, ET IL
 * FAUT LA LIRE AVANT DE LES EMPLOYER.
 *
 * La migration `20260917160000` a ajouté ces deux valeurs au CHECK, sur la foi
 * d'une mesure FAUSSE : j'avais compté les sites d'écriture sans lire leur
 * gestionnaire, et conclu que les écrans « cochent puis valident ». Ils ne
 * valident pas. Ils basculent au clic, une année à la fois.
 *
 * ⛔ CES DEUX VALEURS NE SONT DONC PAS « INUTILISÉES » COMME `director_general`.
 * Elles décrivent un geste qui N'EXISTE PAS dans l'interface :
 *
 *   « Elles deviennent justes SI ET SEULEMENT SI les deux écrans gagnent une
 *     étape de validation. Tant qu'ils basculent au clic, le geste d'ensemble
 *     n'existe pas, et les employer écrirait un geste que personne n'a fait. »
 *
 * ★ Sans cette phrase, quelqu'un les trouvera dans le CHECK et les emploiera en
 * croyant bien faire — le nom au pluriel a l'air plus « propre » que deux types
 * par année. C'est exactement la classe de défaut qu'on a corrigée trois fois
 * cette semaine : une règle dont la raison n'est écrite nulle part.
 *
 * ⚠️ LA LANGUE N'EST PAS UN PARAMÈTRE ICI, ET C'EST DÉLIBÉRÉ (§359). Le journal
 * STOCKE du texte rendu dans LES DEUX langues au moment du geste — il n'y a
 * donc pas de langue à choisir : les deux sont écrites du même geste, comme
 * pour les charges, les documents et l'inscription. Les tournures vivent ici
 * parce qu'elles ne peuvent pas passer par `useTranslations`.
 */

/** Ce qu'un clic fait à une année. */
export type EvenementExercice = 'suivi' | 'retire';

/**
 * ⚪ LE VOCABULAIRE VIENT DE L'ÉCRAN, PAS D'UNE INVENTION. Le catalogue dit déjà
 * « Exercices suivis : {tracked} sur {total} » / « Fiscal Years tracked: … » et
 * « il est toujours suivi » / « it is always tracked ». Le journal parle donc
 * comme la page que l'utilisateur vient de quitter.
 * ⚪ `Fiscal Year` garde sa majuscule à Y : c'est un libellé (convention §2).
 */
const TOURNURES: Record<EvenementExercice, { fr: string; en: string }> = {
  suivi:  { fr: 'Exercice suivi',             en: 'Fiscal Year tracked' },
  retire: { fr: 'Exercice retiré du suivi',   en: 'Fiscal Year no longer tracked' },
};

/** Le type d'événement du journal, pour chaque sens du geste. */
export const TYPE_EVENEMENT: Record<EvenementExercice, string> = {
  suivi: 'fiscal_year_activated',
  retire: 'fiscal_year_archived',
};

/**
 * Les deux titres d'une ligne d'exercice, composés du MÊME geste.
 *
 * ⛔ LE TEXTE NE PORTE QUE L'ANNÉE. L'identifiant de la société, le statut
 * précédent et la porte employée vont dans `details` : une ligne se LIT, un
 * dénombrement se CONSULTE.
 */
export function titresDeJournalExercice(
  evenement: EvenementExercice,
  annee: number,
): { titleFr: string; titleEn: string } {
  const t = TOURNURES[evenement];
  return {
    titleFr: `${t.fr} : ${annee}`,
    titleEn: `${t.en}: ${annee}`,
  };
}
