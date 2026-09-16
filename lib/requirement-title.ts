/**
 * LE TITRE D'UNE EXIGENCE, DANS LA LANGUE DU DOCUMENT — déclaration unique.
 *
 * ⛔ L'ENTRÉE EST `documents.language`, JAMAIS LA LOCALE DE L'INTERFACE. Les deux
 * se ressemblent et divergent dès qu'on téléverse un document anglais depuis une
 * interface française — c'est le défaut mesuré le 2026-09-16, qui avait gelé
 * « Première résolution du conseil d'administration » sur `language = 'en'`.
 *
 * ★ POURQUOI UNE DÉCLARATION ET PAS UNE LIGNE DANS CHAQUE CHEMIN. `generatePdfDocument`
 * et le chemin de téléversement écrivent tous deux `documents.title`. Le premier
 * lisait déjà la langue du document, le second lisait la locale de l'URL : deux
 * écritures de la même règle, dont une seule était juste, et rien ne les tenait
 * ensemble. C'est la forme qui a produit le défaut.
 *
 * ⚠️ CE N'EST PAS LE LIBELLÉ À L'ÉCRAN, ET LA DISTINCTION EST LA RÈGLE.
 * Un sélecteur d'exigences, un sous-titre, une étiquette de conflit suivent la
 * LOCALE DE L'INTERFACE et ne passent pas par ici : une interface française nomme
 * les exigences en français, même quand le document est anglais. Cette fonction
 * ne sert qu'aux titres ÉCRITS EN BASE.
 */

/** Les deux colonnes de `minute_book_requirements` que les deux côtés lisent déjà. */
export interface TitresCatalogue {
  title_fr?: string | null;
  title_en?: string | null;
}

export function titreExigence(
  langue: 'fr' | 'en',
  catalogue: TitresCatalogue | null | undefined,
): string {
  const titre = langue === 'en' ? catalogue?.title_en : catalogue?.title_fr;
  // Repli défensif : ne jamais exposer l'identifiant de code au Coffre-fort.
  // Il venait du chemin de génération ; le chemin de téléversement l'hérite ici.
  return titre && titre.length > 0 ? titre : langue === 'en' ? 'Resolution' : 'Résolution';
}
