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
  /**
   * Entêtes des deux colonnes, déjà traduits.
   *
   * ⚠️ « Document » désigne bien l'entrée ENTIÈRE — son titre ET le nom du
   * fichier qui la porte, empilés dans la même cellule. « Titre » ou
   * « Fichier » n'en couvrirait qu'une moitié. La clé columnFileName est partie
   * avec la colonne qu'elle nommait.
   */
  columns: { title: string; year: string };
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
    entries: { title: string; fileName: string; year: string }[];
  }[];
  footerDocName: string;
  language: 'fr' | 'en' | 'bilingual';
}

export function binderIndexHTML(data: BinderIndexData): string {
  const sections = data.sections
    .map((s) => {
      // Le nom de fichier vit SOUS le titre, sur toute la largeur de la cellule —
      // les deux colonnes se disputaient la place alors qu'elles disaient la même
      // chose : le nom contient le titre depuis le 09-04.
      //
      // ★ 11px et #6B6560 ne sont pas des valeurs neuves : c'est la taille des
      // entêtes et des citations, et le gris de la ligne « 20 documents » — le
      // couple principal/secondaire que ce document porte déjà. Pas de quatrième
      // taille inventée. Ce gris-là sert du texte DESTINÉ À ÊTRE LU ; #A09A93,
      // plus pâle, est réservé aux mentions de signature et disparaîtrait sur une
      // imprimante de bureau.
      //
      // ⚠️ CE COMMENTAIRE VIT ICI, ET PAS DANS LE GABARIT EN DESSOUS, POUR UNE
      // RAISON MESURÉE : placé dans une interpolation `${…}` d'un littéral de
      // gabarit, `npm run check:glyphs` le lisait comme du TEXTE et signalait son
      // ★ comme un caractère absent d'Open Sans. Le dépouilleur du balayage ne
      // traverse pas les interpolations — la limite que son propre en-tête
      // annonce. Le commentaire n'a rien à faire dans la chaîne ; il est sorti.
      const table =
        s.entries.length === 0
          ? ''
          : `
    <table class="register">
      <thead><tr>
        <th>${escapeHtml(data.columns.title)}</th><th style="width:2cm;">${escapeHtml(data.columns.year)}</th>
      </tr></thead>
      <tbody>${s.entries
        .map(
          (e) =>
            `<tr><td><div>${escapeHtml(e.title)}</div><div style="font-size:11px;color:#6B6560;margin-top:1px;">${escapeHtml(e.fileName)}</div></td><td>${escapeHtml(e.year)}</td></tr>`
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
