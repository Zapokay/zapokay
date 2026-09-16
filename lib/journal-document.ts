/**
 * LE TEXTE QUE LE JOURNAL ÉCRIT QUAND UN DOCUMENT EST SUPPRIMÉ — fonction pure.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-16 : la page Historique est un REGISTRE DU LIVRE.
 * La génération s'y inscrivait déjà ; la SUPPRESSION, non. C'est pourtant le
 * geste qu'un partenaire verra en démonstration, juste après la génération.
 *
 * ⛔⛔ CETTE LIGNE PORTE SON PROPRE TEXTE, ET C'EST STRUCTUREL, PAS UN CHOIX DE
 * STYLE. Les lignes de génération et de téléversement sont RECOMPOSÉES à la
 * lecture depuis `documents.title` — le nom suit alors la langue du document et
 * reste à jour. Celle-ci ne le peut pas : quand elle s'affiche, la ligne
 * `documents` n'existe plus. Le titre est donc GELÉ dans les deux langues au
 * moment du geste, comme pour les charges.
 * ⚪ Mesuré le 2026-09-16 : 231 des 349 lignes documentaires du parc pointent
 * déjà un document disparu, et elles se lisent — le repli sur le titre cuit est
 * éprouvé, ce module ne fait que s'y ranger d'avance.
 *
 * ⛔⛔ ET TROIS AUTRES CHEMINS SUPPRIMENT UNE LIGNE `documents` SANS PASSER ICI,
 * DÉLIBÉRÉMENT. Ce sont des COMPENSATIONS DE ROLLBACK : le document venait
 * d'être inséré, une écriture liée a échoué, on le retire. Journaliser un
 * rollback écrirait au registre UN GESTE QUE PERSONNE N'A FAIT.
 * ★ Si quelqu'un veut « compléter » ce lot en les branchant ici, c'est cette
 * phrase-là qui doit l'arrêter.
 *
 * ★ POURQUOI DANS `lib/` : une page n'est pas plus vérifiable qu'une modale.
 * Sortie ici, la règle du registre s'exécute dans une sonde.
 */
import { texteDuCatalogue, type LangueCatalogue } from '@/lib/i18n/catalogue-langue';

/** Les tournures, accordées à `document_generated` et `document_uploaded`. */
const TOURNURES: Record<LangueCatalogue, string> = {
  fr: 'Document supprimé',
  en: 'Document deleted',
};

/**
 * Les deux titres de la ligne `document_deleted`, composés du MÊME geste.
 *
 * ⛔ UN TITRE VIDE NE PRODUIT JAMAIS UN IDENTIFIANT NI UNE CLÉ. Il replie sur
 * `documents.untitledFallback`, résolu dans CHAQUE langue. Une ligne de registre
 * qui montrerait un uuid serait illisible pour toujours — et elle serait la
 * seule trace qui reste, puisque le document, lui, est parti.
 * ⚠️ La langue est un PARAMÈTRE du catalogue, jamais une locale devinée : il y a
 * trois langues dans ce produit (URL, inscription, document) et celle-ci est
 * celle du REGISTRE — les deux, écrites côte à côte.
 */
export function titresDeJournalSuppression(titre: string | null | undefined): {
  titleFr: string;
  titleEn: string;
} {
  const propre = (titre ?? '').trim();
  const nom = (langue: LangueCatalogue) =>
    propre || texteDuCatalogue(langue, 'documents.untitledFallback');
  return {
    titleFr: `${TOURNURES.fr} : ${nom('fr')}`,
    titleEn: `${TOURNURES.en}: ${nom('en')}`,
  };
}
