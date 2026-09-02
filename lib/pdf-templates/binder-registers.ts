import { baseLayoutHTML, escapeHtml } from './base-layout';

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
  registers: {
    title: string;
    columns: { key: string; label: string }[];
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
            `<tr>${r.columns.map((c) => `<td>${escapeHtml(row[c.key] ?? '')}</td>`).join('')}</tr>`
        )
        .join('')}</tbody>
    </table>`;
      const notes = [
        r.footnote ? `<p style="font-size:11px;color:#B45309;margin-top:0.4em;">${escapeHtml(r.footnote)}</p>` : '',
        r.citation ? `<p style="font-size:11px;color:#6B6560;font-style:italic;margin-top:0.4em;">${escapeHtml(r.citation)}</p>` : '',
      ].join('');
      return `
    <h2 style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;color:#070E1C;margin:1.5em 0 0.5em;">${escapeHtml(r.title)}</h2>${contenu}${notes}`;
    })
    .join('');

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: data.documentTitle,
    bodyContent: corps,
    footerDocName: data.footerDocName,
    language: data.language,
  });
}
