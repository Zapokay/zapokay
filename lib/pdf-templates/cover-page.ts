import { escapeHtml } from './base-layout';

export interface CoverPageData {
  companyName: string;
  neq?: string;
  title: string;
  subtitle?: string;
  preparedFor?: string;
  preparedDate: string;
  language: 'fr' | 'en' | 'bilingual';
}

export function coverPageHTML(data: CoverPageData): string {
  const confidential =
    data.language === 'en'
      ? 'Confidential — Internal Use'
      : data.language === 'fr'
        ? 'Confidentiel — Usage interne'
        : 'Confidentiel / Confidential';

  const preparedLabel =
    data.language === 'en'
      ? 'Prepared for'
      : data.language === 'fr'
        ? 'Préparé pour'
        : 'Préparé pour / Prepared for';

  const dateLabel =
    data.language === 'en' ? 'Date' : 'Date';

  const generatedLabel =
    data.language === 'en'
      ? 'Generated via ZapOkay — Digital Minute Book'
      : data.language === 'fr'
        ? 'Généré via ZapOkay — Livre de minutes numérique'
        : 'Généré via ZapOkay — Livre de minutes numérique / Digital Minute Book';

  return /* html */ `<!DOCTYPE html>
<html lang="${data.language === 'en' ? 'en' : 'fr'}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=DM+Sans:wght@400;500&display=swap');
  @page { size: letter; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cover {
    width: 8.5in;
    height: 11in;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 2in 2cm;
    position: relative;
  }
  .logo {
    font-family: 'Sora', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: #070E1C;
    margin-bottom: 0.2em;
  }
  .logo-sub {
    font-size: 11px;
    color: #6B6560;
    margin-bottom: 3em;
  }
  .sep { width: 60px; height: 2px; background: #C8A44E; margin: 0 auto 2em; }
  .company {
    font-family: 'Sora', sans-serif;
    font-weight: 700;
    font-size: 28px;
    color: #070E1C;
    margin-bottom: 0.3em;
  }
  .neq { font-size: 12px; color: #A09A93; margin-bottom: 2em; }
  .title {
    font-family: 'Sora', sans-serif;
    font-weight: 600;
    font-size: 20px;
    color: #070E1C;
    margin-bottom: 0.3em;
  }
  .subtitle { font-size: 14px; color: #6B6560; margin-bottom: 2.5em; }
  .meta { font-size: 12px; color: #6B6560; line-height: 2; }
  .meta strong { font-weight: 500; color: #14120E; }
  .bottom-bar {
    position: absolute;
    bottom: 1cm;
    left: 2cm;
    right: 2cm;
    text-align: center;
    font-size: 9px;
    color: #A09A93;
    border-top: 1px solid #E0D9CE;
    padding-top: 0.6em;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="logo">ZapOkay</div>
    <div class="logo-sub">${generatedLabel}</div>
    <div class="sep"></div>
    <div class="company">${escapeHtml(data.companyName)}</div>
    ${data.neq ? `<div class="neq">NEQ ${escapeHtml(data.neq)}</div>` : '<div style="margin-bottom:2em"></div>'}
    <div class="title">${escapeHtml(data.title)}</div>
    ${data.subtitle ? `<div class="subtitle">${escapeHtml(data.subtitle)}</div>` : '<div style="margin-bottom:2.5em"></div>'}
    <div class="meta">
      ${data.preparedFor ? `<div>${preparedLabel}: <strong>${escapeHtml(data.preparedFor)}</strong></div>` : ''}
      <div>${dateLabel}: <strong>${escapeHtml(data.preparedDate)}</strong></div>
    </div>
    <div class="bottom-bar">${confidential}</div>
  </div>
</body>
</html>`;
}
