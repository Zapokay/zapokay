import { baseLayoutHTML, escapeHtml } from './base-layout';

export interface ShareholderResolutionData {
  companyName: string;
  neq?: string;
  resolutionDate: string;
  fiscalYear: string;
  shareholders: { name: string; shares: number; class?: string }[];
  resolutions: { number: number; title: string; body: string }[];
  language: 'fr' | 'en' | 'bilingual';
}

const LABELS = {
  fr: {
    title: 'Résolution des actionnaires',
    subtitle: (fy: string) => `Exercice fiscal ${fy}`,
    resolved: 'IL EST RÉSOLU QUE :',
    sigLabel: 'Actionnaire',
    sharesLabel: 'actions',
    date: 'Date',
  },
  en: {
    title: 'Shareholders\' Resolution',
    subtitle: (fy: string) => `Fiscal Year ${fy}`,
    resolved: 'IT IS RESOLVED THAT:',
    sigLabel: 'Shareholder',
    sharesLabel: 'shares',
    date: 'Date',
  },
  bilingual: {
    title: 'Résolution des actionnaires / Shareholders\' Resolution',
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

  const signaturesHtml = data.shareholders
    .map(
      (s) => `
      <div class="sig-entry">
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(s.name)}</div>
        <div class="sig-title">${s.shares} ${l.sharesLabel}${s.class ? ` (${escapeHtml(s.class)})` : ''}</div>
        <div class="sig-date">${l.date}: _______________</div>
      </div>`
    )
    .join('');

  const bodyContent = `
    <div class="resolved">${l.resolved}</div>
    ${resolutionsHtml}
    <div class="signatures">
      <div class="sig-col">
        <div class="sig-label">${l.sigLabel}</div>
        ${signaturesHtml}
      </div>
    </div>
  `;

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: l.title,
    documentSubtitle: l.subtitle(data.fiscalYear),
    effectiveDate: data.resolutionDate,
    bodyContent,
    footerDocName: l.title,
    language: data.language,
  });
}
