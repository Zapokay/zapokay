import { baseLayoutHTML, escapeHtml } from './base-layout';
import { styleCellule, STYLES_RANG, type RangBloc, type TraitementCellule } from '@/lib/minute-book/register-columns';

/**
 * Les quatre registres du Livre, en UN document — décision de Dom, au
 * singulier, comme la section « Registers » d'un livre relié de cabinet.
 *
 * ⚠️ TOUS LES LIBELLÉS ARRIVENT DÉJÀ RÉSOLUS, comme pour binder-index.ts. Ce
 * gabarit ne connaît aucun catalogue : la route sait dans quelle langue elle
 * produit. Les en-têtes viennent de minuteBook.registers.columns.*, les onze
 * qui servent déjà à l'écran — aucune table neuve.
 *
 * ⚠️ UN REGISTRE VIDE REND SON MESSAGE, PAS UN TABLEAU NU. Un registre qui
 * existe et ne contient personne est un fait juridique ; il doit se lire comme
 * tel. Même forme que RegisterCard à l'écran.
 */
export interface BinderRegistersData {
  companyName: string;
  neq?: string;
  documentTitle: string;
  /** La date d'arrêté — REQUISE ici, optionnelle dans BaseLayoutData que
   *  d'autres documents partagent. Déjà résolue, comme tous les libellés. */
  effectiveDate: { label: string; value: string };
  registers: {
    title: string;
    /**
     * Le RANG du bloc — registre, ou sous-section d'un registre. Absent =
     * registre. Il vient de la declaration unique (register-columns.ts), et
     * le titre en suit la table STYLES_RANG : ce gabarit ne decide rien.
     */
    rang?: RangBloc;
    /**
     * ⚠️ `traitement` PORTE LA COUPURE, ET IL EST FACULTATIF. Absent = defaut
     * du navigateur. Il vient de la declaration unique des colonnes, jamais
     * d'une decision prise ici.
     */
    columns: {
      key: string;
      label: string;
      /** La seconde ligne de la cellule, si la declaration en prevoit une. */
      cleSecondaire?: string;
      traitement?: TraitementCellule;
    }[];
    /** Valeurs DÉJÀ formatées en chaînes — dates, devises, oui/non. */
    rows: Record<string, string>[];
    emptyMessage: string;
    citation?: string;
    footnote?: string;
  }[];
  footerDocName: string;
  language: 'fr' | 'en' | 'bilingual';
}

export function binderRegistersHTML(data: BinderRegistersData): string {
  // ⛔ AUCUN STYLE SUR L'EN-TETE — voir les <th> ci-dessous. Un overflow-wrap
  //    pose la coupait ACTIVE en ACTIV/E et CERT. en CERT/., filme le
  //    2026-09-10. Sans lui, ces deux mots redeviennent insecables d'eux-memes
  //    et RESIDENCE CANADIENNE se renvoie sur son espace, comme avant.
  // ⚠️ CE COMMENTAIRE VIT HORS DU LITTERAL GABARIT, ET C'EST OBLIGATOIRE.
  //    Place a l'interieur, scan-glyphes le lit comme du TEXTE DE CHAINE — pas
  //    comme un commentaire — et le refuse : ce fichier est l'une de ses douze
  //    sources. Mesure : il a signale U+26D4 a la ligne 52.
  const corps = data.registers
    .map((r) => {
      const contenu =
        r.rows.length === 0
          ? `
    <p style="font-size:12px;color:#6B6560;font-style:italic;margin-bottom:0.5em;">${escapeHtml(r.emptyMessage)}</p>`
          : `
    <table class="register">
      <thead><tr>
        ${r.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}
      </tr></thead>
      <tbody>${r.rows
        .map(
          (row) =>
            `<tr>${r.columns
              .map((c) => {
                const s = styleCellule(c.traitement);
                // ⛔ LES DEUX VALEURS PASSENT PAR escapeHtml, exactement comme
                //    avant. Seul le <br> est du balisage, et il vient de NOUS,
                //    jamais de la donnee.
                const principal = escapeHtml(row[c.key] ?? '');
                const brut = c.cleSecondaire ? row[c.cleSecondaire] ?? '' : '';
                // ⛔ SECONDAIRE VIDE = RIEN DU TOUT. Pas de <br>, pas d'espace
                //    reserve : une fiche sans adresse rend ce qu'elle rendait
                //    avant ce lot, a l'octet.
                // ⛔ AUCUNE REDUCTION DE TAILLE, AUCUN GRIS. L'adresse est un
                //    contenu exige par la loi, pas une note de bas de page.
                const secondaire = brut ? `<br>${escapeHtml(brut)}` : '';
                return `<td${s ? ` style="${s}"` : ''}>${principal}${secondaire}</td>`;
              })
              .join('')}</tr>`
        )
        .join('')}</tbody>
    </table>`;
      const notes = [
        r.footnote ? `<p style="font-size:11px;color:#B45309;margin-top:0.4em;">${escapeHtml(r.footnote)}</p>` : '',
        r.citation ? `<p style="font-size:11px;color:#6B6560;font-style:italic;margin-top:0.4em;">${escapeHtml(r.citation)}</p>` : '',
      ].join('');
      // Le titre suit le RANG du bloc, declare une fois (STYLES_RANG). Absent =
      // registre : la balise et le style d'avant, a l'octet.
      const titre = STYLES_RANG[r.rang ?? 'registre'].pdf;
      return `
    <${titre.balise} style="${titre.style}">${escapeHtml(r.title)}</${titre.balise}>${contenu}${notes}`;
    })
    .join('');

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: data.documentTitle,
    effectiveDate: data.effectiveDate,
    bodyContent: corps,
    footerDocName: data.footerDocName,
    language: data.language,
  });
}
