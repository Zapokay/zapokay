export interface BaseLayoutData {
  companyName: string;
  neq?: string;
  documentTitle: string;
  documentSubtitle?: string;
  effectiveDate?: string;
  bodyContent: string;
  footerDocName: string;
  language: 'fr' | 'en' | 'bilingual';
}

const COLORS = {
  navy: '#070E1C',
  black: '#14120E',
  amber: '#C8A44E',
  separator: '#E0D9CE',
  gray: '#6B6560',
  lightGray: '#A09A93',
} as const;

export function baseLayoutHTML(data: BaseLayoutData): string {
  const confidential =
    data.language === 'en'
      ? 'Confidential — Internal Use'
      : 'Confidentiel — Usage interne';

  return /* html */ `<!DOCTYPE html>
<html lang="${data.language === 'en' ? 'en' : 'fr'}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');

  @page {
    size: letter;
    margin: 0;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    color: ${COLORS.black};
    font-size: 14px;
    line-height: 1.8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    position: relative;
    width: 8.5in;
    min-height: 11in;
    padding: 3cm 2.5cm;
    page-break-after: always;
  }

  /* ── Header ── */
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 1.2cm 2.5cm 0.6cm;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 2.5cm;
    right: 2.5cm;
    height: 1px;
    background: ${COLORS.separator};
  }
  .header-left .logo {
    font-family: 'Sora', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: ${COLORS.navy};
  }
  .header-left .logo-sub {
    font-family: 'DM Sans', sans-serif;
    font-size: 10px;
    color: ${COLORS.gray};
    margin-top: 2px;
  }
  .header-right {
    text-align: right;
  }
  .header-right .company {
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    font-size: 13px;
    color: ${COLORS.navy};
  }
  .header-right .neq {
    font-size: 10px;
    color: ${COLORS.gray};
    margin-top: 2px;
  }

  /* ── Footer ── */
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5cm 2.5cm 0.8cm;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: ${COLORS.lightGray};
  }
  .footer::before {
    content: '';
    position: absolute;
    top: 0;
    left: 2.5cm;
    right: 2.5cm;
    height: 1px;
    background: ${COLORS.separator};
  }

  /* ── Title block ── */
  .title-block { text-align: center; margin-bottom: 1.5em; }
  .title-block h1 {
    font-family: 'Sora', sans-serif;
    font-weight: 700;
    font-size: 18px;
    color: ${COLORS.navy};
    margin-bottom: 0.3em;
  }
  .title-block .subtitle {
    font-size: 13px;
    color: ${COLORS.gray};
    margin-bottom: 0.2em;
  }
  .title-block .date {
    font-size: 12px;
    color: ${COLORS.lightGray};
  }
  .title-block .sep {
    width: 60px;
    height: 1px;
    background: ${COLORS.separator};
    margin: 1em auto 0;
  }

  /* ── Content helpers ── */
  .resolved {
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    text-align: center;
    margin: 1.5em 0 1em;
    font-size: 14px;
    color: ${COLORS.navy};
  }
  .resolution-item {
    margin-bottom: 1.2em;
    padding-left: 1.5em;
    text-indent: -1.5em;
  }
  .resolution-item .num {
    font-weight: 700;
  }
  .resolution-item .res-title {
    font-weight: 700;
  }
  .resolution-body {
    text-indent: 0;
    padding-left: 1.5em;
    margin-top: 0.3em;
  }

  /* ── Signature block ── */
  .signatures {
    display: flex;
    flex-wrap: wrap;
    gap: 2em;
    margin-top: 3em;
    page-break-inside: avoid;
  }
  .sig-col {
    flex: 1;
    min-width: 200px;
  }
  .sig-col .sig-label {
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${COLORS.gray};
    margin-bottom: 1.5em;
  }
  .sig-entry { margin-bottom: 2em; }
  .sig-line {
    border-top: 1px solid ${COLORS.black};
    width: 220px;
    margin-bottom: 0.3em;
  }
  .sig-name { font-weight: 500; font-size: 13px; }
  .sig-title { font-size: 11px; color: ${COLORS.gray}; }
  .sig-date { font-size: 10px; color: ${COLORS.lightGray}; margin-top: 0.2em; }

  /* ── Table styles ── */
  table.register {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 12px;
  }
  table.register th {
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: ${COLORS.navy};
    border-bottom: 2px solid ${COLORS.separator};
    padding: 0.6em 0.8em;
    text-align: left;
  }
  table.register td {
    padding: 0.5em 0.8em;
    border-bottom: 1px solid ${COLORS.separator};
  }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left"></div>
    <div class="header-right">
      <div class="company">${escapeHtml(data.companyName)}</div>
      ${data.neq ? `<div class="neq">NEQ ${escapeHtml(data.neq)}</div>` : ''}
    </div>
  </div>

  <!-- Content -->
  <div class="page">
    <div class="title-block">
      <h1>${escapeHtml(data.documentTitle)}</h1>
      ${data.documentSubtitle ? `<div class="subtitle">${escapeHtml(data.documentSubtitle)}</div>` : ''}
      ${data.effectiveDate ? `<div class="date">${escapeHtml(data.effectiveDate)}</div>` : ''}
      <div class="sep"></div>
    </div>

    ${data.bodyContent}
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${escapeHtml(data.footerDocName)}</span>
    <span>${escapeHtml(data.companyName)} — ${confidential}</span>
    <span></span>
  </div>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
