import { baseLayoutHTML, escapeHtml } from './base-layout';
import { signatureBlocksHTML } from './signature-blocks';
import type { SignatoryBlock } from './signature-blocks';

export interface ShareholderResolutionData {
  companyName: string;
  neq?: string;
  documentTitle: string;
  resolutionDate: string;
  fiscalYear: string | null;
  shareholders: { name: string; shares: number; class?: string }[];
  resolutions: { number: number; title: string; body: string }[];
  /** Lifecycle (b1-ii): when set, render this verbatim body as paragraphs and
   *  skip the clause-array chrome. Founding/annual leave it undefined. */
  freeTextBody?: string;
  language: 'fr' | 'en' | 'bilingual';
  signatories?: SignatoryBlock[];
}

const LABELS = {
  fr: {
    subtitle: (fy: string) => `Exercice fiscal ${fy}`,
    resolved: 'IL EST RÉSOLU QUE :',
    sigLabel: 'Actionnaire',
    sharesLabel: 'actions',
    date: 'Date',
  },
  en: {
    subtitle: (fy: string) => `Fiscal Year ${fy}`,
    resolved: 'IT IS RESOLVED THAT:',
    sigLabel: 'Shareholder',
    sharesLabel: 'shares',
    date: 'Date',
  },
  bilingual: {
    subtitle: (fy: string) => `Exercice fiscal / Fiscal Year ${fy}`,
    resolved: 'IL EST RÉSOLU / IT IS RESOLVED:',
    sigLabel: 'Actionnaire / Shareholder',
    sharesLabel: 'actions / shares',
    date: 'Date',
  },
} as const;

export function shareholderResolutionHTML(data: ShareholderResolutionData): string {
  const l = LABELS[data.language];

  const resolutionsHtml = data.resolutions
    .map(
      (r) => `
      <div class="resolution-item">
        <span class="num">${r.number}.</span>
        <span class="res-title">${escapeHtml(r.title)}</span>
        <div class="resolution-body">${escapeHtml(r.body)}</div>
      </div>`
    )
    .join('');

  const signaturesHtml = data.signatories && data.signatories.length > 0
    ? signatureBlocksHTML(data.signatories, data.language)
    : `<div class="signatures">
        <div class="sig-col">
          <div class="sig-label">${l.sigLabel}</div>
          ${data.shareholders.map((s) => `
          <div class="sig-entry">
            <div class="sig-line"></div>
            <div class="sig-name">${escapeHtml(s.name)}</div>
            <div class="sig-title">${s.shares} ${l.sharesLabel}${s.class ? ` (${escapeHtml(s.class)})` : ''}</div>
            <div class="sig-date">${l.date}: _______________</div>
          </div>`).join('')}
        </div>
      </div>`;

  // Lifecycle docKeys pass a verbatim free-text body (b1-ii): render it as
  // paragraphs split on blank lines, and SKIP the clause-array chrome (the
  // "N. title" wrapper + the central "IL EST RÉSOLU" heading) — the lifecycle
  // template body already carries its own. Founding/annual leave freeTextBody
  // undefined and keep the clause-array path unchanged.
  // (Blank-line separator built via fromCharCode to avoid newline-escape
  // ambiguity in source tooling; equals splitting on "\n\n" at runtime.)
  const paraBreak = String.fromCharCode(10) + String.fromCharCode(10);
  const freeTextHtml = data.freeTextBody
    ? `<div class="lifecycle-body">${data.freeTextBody
        .split(paraBreak)
        .map((para) => `<p>${escapeHtml(para)}</p>`)
        .join('')}</div>`
    : '';

  const bodyContent = data.freeTextBody
    ? `
    ${freeTextHtml}
    ${signaturesHtml}
  `
    : `
    <div class="resolved">${l.resolved}</div>
    ${resolutionsHtml}
    ${signaturesHtml}
  `;

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: data.documentTitle,
    documentSubtitle: data.fiscalYear !== null ? l.subtitle(data.fiscalYear) : undefined,
    effectiveDate: data.resolutionDate,
    bodyContent,
    footerDocName: data.documentTitle,
    language: data.language,
  });
}
