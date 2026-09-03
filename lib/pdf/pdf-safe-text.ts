/**
 * Sécurité TYPOGRAPHIQUE du PDF — pas HTML. `escapeHtml` protège le balisage ;
 * ceci protège les GLYPHES.
 *
 * Le conteneur de production (`@sparticuz/chromium`) n'embarque qu'une seule
 * police : Open Sans. Un caractère qu'elle ne porte pas ne produit ni erreur ni
 * carré — il produit du VIDE. Une valeur absente d'un document juridique se lit
 * comme une réponse.
 *
 * Voir aussi : la colonne « Actif » du registre, qui rendait U+2713 / U+2717 et
 * n'affichait rien en production.
 */

/**
 * `Intl.NumberFormat` peut émettre une ESPACE FINE INSÉCABLE (U+202F) comme
 * séparateur de milliers en français — les ICU récentes le font, les anciennes
 * emploient U+00A0. Open Sans porte U+00A0, PAS U+202F.
 *
 * On ne cherche pas à savoir quelle ICU tourne en production : on remplace, donc
 * la question ne se pose jamais. U+00A0 rend le même service typographique.
 *
 * ⚠️ U+2009 (espace fine ordinaire) est MESURÉ PRÉSENT dans Open Sans et n'est
 * donc pas touché — on ne remplace que ce qui manque.
 */
export function normalizePdfSpaces(text: string): string {
  // Écrit en séquences d'échappement : un caractère invisible dans la source
  // se ferait normaliser par un éditeur sans que personne ne le voie.
  return text.replace(/\u202F/g, '\u00A0');
}
