import { escapeHtml } from './base-layout';

export interface Signatory {
  id: string;
  name: string;
  role: string;
}

export function signatureBlocksHTML(
  signatories: Signatory[],
  language: 'fr' | 'en' | 'bilingual'
): string {
  if (signatories.length === 0) return '';

  const dateLabel = language === 'en' ? 'Date' : 'Date';

  function renderEntry(s: Signatory) {
    return `
      <div class="sig-entry">
        <div class="sig-line"></div>
        <div class="sig-name">${escapeHtml(s.name)}</div>
        <div class="sig-title">${escapeHtml(s.role)}</div>
        <div class="sig-date">${dateLabel}: _______________</div>
      </div>`;
  }

  const mid = Math.ceil(signatories.length / 2);
  const leftCol = signatories.slice(0, mid);
  const rightCol = signatories.slice(mid);

  const sectionLabel =
    language === 'en' ? 'Authorized Signatures' : 'Signatures autorisées';

  return `
    <div class="signatures" style="margin-top: 3em;">
      <div class="sig-col">
        <div class="sig-label">${sectionLabel}</div>
        ${leftCol.map(renderEntry).join('')}
      </div>
      ${rightCol.length > 0 ? `
      <div class="sig-col">
        <div class="sig-label">&nbsp;</div>
        ${rightCol.map(renderEntry).join('')}
      </div>` : ''}
    </div>`;
}
