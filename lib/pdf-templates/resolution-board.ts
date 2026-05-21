import { baseLayoutHTML, escapeHtml } from './base-layout';
import { signatureBlocksHTML } from './signature-blocks';
import type { Signatory } from './signature-blocks';

export interface BoardResolutionData {
  companyName: string;
  neq?: string;
  documentTitle: string;
  resolutionDate: string;
  fiscalYear: string | null;
  directors: { name: string; title: string }[];
  resolutions: { number: number; title: string; body: string }[];
  language: 'fr' | 'en' | 'bilingual';
  signatories?: Signatory[];
}

const LABELS = {
  fr: {
    subtitle: (fy: string) => `Exercice fiscal ${fy}`,
    resolved: 'IL EST RÉSOLU QUE :',
    sigLabel: 'Administrateur',
    date: 'Date',
  },
  en: {
    subtitle: (fy: string) => `Fiscal Year ${fy}`,
    resolved: 'IT IS RESOLVED THAT:',
    sigLabel: 'Director',
    date: 'Date',
  },
  bilingual: {
    subtitle: (fy: string) => `Exercice fiscal / Fiscal Year ${fy}`,
    resolved: 'IL EST RÉSOLU / IT IS RESOLVED:',
    sigLabel: 'Administrateur / Director',
    date: 'Date',
  },
} as const;

export function boardResolutionHTML(data: BoardResolutionData): string {
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
          ${data.directors.map((d) => `
          <div class="sig-entry">
            <div class="sig-line"></div>
            <div class="sig-name">${escapeHtml(d.name)}</div>
            <div class="sig-title">${escapeHtml(d.title)}</div>
            <div class="sig-date">${l.date}: _______________</div>
          </div>`).join('')}
        </div>
      </div>`;

  const bodyContent = `
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
