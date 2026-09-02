import { baseLayoutHTML, escapeHtml } from './base-layout';

/**
 * L'index de l'archive exportée — « ce que contient ce livre ».
 *
 * ⚠️ TOUS LES LIBELLÉS ARRIVENT DÉJÀ RÉSOLUS, et c'est un écart DÉLIBÉRÉ au
 * précédent voisin. annual-register.ts porte sa propre table LABELS à trois
 * locales, en dur ; ce lot a passé plusieurs commits à retirer ce genre de
 * table. Ici, la route sait dans quelle langue elle produit, et ce gabarit ne
 * connaît aucun catalogue. Il ne fait que du HTML.
 *
 * Mise en page et échappement copiés d'annual-register.ts : `table.register`
 * (défini dans base-layout), escapeHtml sur CHAQUE cellule, .map().join(''),
 * baseLayoutHTML autour. Sans `signaturesHtml` — un index n'a pas de
 * signataires, et base-layout prévoit ce cas.
 */
export interface BinderIndexData {
  companyName: string;
  neq?: string;
  /** « Index du livre » / « Binder Index », déjà traduit. */
  documentTitle: string;
  /** Le compte total, déjà traduit — la même phrase que l'écran et la garde. */
  documentSubtitle?: string;
  /** Entêtes des deux colonnes, déjà traduits. */
  columns: { title: string; fileName: string };
  /**
   * LES NEUF SECTIONS, dans l'ordre, VIDES COMPRISES. C'est là que l'index
   * complète le miroir : une section sans document n'a pas de dossier dans
   * l'archive, et seul l'index peut dire qu'elle existe et qu'elle est vide.
   */
  sections: {
    /** « 1 - Statuts et actes constitutifs », déjà traduit et numéroté. */
    heading: string;
    /** « 3 documents » / « Aucun document », déjà traduit. */
    count: string;
    /**
     * ⚠️ `fileName` EST LE NOM QUE LA BOUCLE A ÉCRIT DANS LE ZIP, transporté
     * depuis elle — jamais un nom recalculé ici. Deux applications de la même
     * règle de nommage finissent toujours par diverger.
     */
    entries: { title: string; fileName: string }[];
  }[];
  footerDocName: string;
  language: 'fr' | 'en' | 'bilingual';
}

export function binderIndexHTML(data: BinderIndexData): string {
  const sections = data.sections
    .map((s) => {
      const table =
        s.entries.length === 0
          ? ''
          : `
    <table class="register">
      <thead><tr>
        <th>${escapeHtml(data.columns.title)}</th><th>${escapeHtml(data.columns.fileName)}</th>
      </tr></thead>
      <tbody>${s.entries
        .map(
          (e) =>
            `<tr><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.fileName)}</td></tr>`
        )
        .join('')}</tbody>
    </table>`;
      return `
    <h2 style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;color:#070E1C;margin:1.5em 0 0.2em;">${escapeHtml(s.heading)}</h2>
    <p style="font-size:12px;color:#6B6560;margin-bottom:0.5em;">${escapeHtml(s.count)}</p>${table}`;
    })
    .join('');

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: data.documentTitle,
    documentSubtitle: data.documentSubtitle,
    bodyContent: sections,
    footerDocName: data.footerDocName,
    language: data.language,
  });
}
