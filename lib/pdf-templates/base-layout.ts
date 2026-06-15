export interface BaseLayoutData {
  companyName: string;
  neq?: string;
  documentTitle: string;
  documentSubtitle?: string;
  /**
   * Generation date (YYYY-MM-DD), displayed in the right-hand footer slot as
   * "Généré le {date}" / "Generated on {date}". The actual signature date is
   * captured on the "Date: _______" line beside each signatory, not here.
   */
  effectiveDate?: string;
  bodyContent: string;
  /** Signature block markup, rendered in its own table row so it breaks as a unit. Optional — callers with no signatures (e.g. registers) omit it. */
  signaturesHtml?: string;
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
  // The footer is rendered as a Puppeteer footerTemplate (bottom-pinned on every
  // page), built in lib/pdf/generatePDF.ts — the FR/EN footer labels live there
  // now. base-layout owns only the in-table running header (thead) + content.
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

  /* Page table: <thead> repeats the header band on every printed page (Chrome
     table-header-group); tbody content flows below it → automatic per-page
     header clearance. Stays in the page font-context so Aria fonts apply. */
  .page-table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
  /* Clearance below the repeating header rule lives on the THEAD cell so it
     travels with the repeated header on EVERY page (a tbody-cell top padding
     would only apply on page 1, leaving continuation pages tight). */
  thead td { padding-bottom: 0.6cm; }
  tbody td {
    /* 2.5cm horizontal inset (previously carried by .page). No top padding —
       per-page clearance comes from thead td above, uniform on every page. */
    padding: 0 2.5cm 0;
    vertical-align: top;
  }
  tr.sig-row { break-inside: avoid; page-break-inside: avoid; }
      .footer-reserve { height: 0.8cm; padding: 0; }

  /* ── Running header band (inside <thead>, repeats per printed page) ── */
  .header-band {
    padding: 1.2cm 2.5cm 0.6cm;
    border-bottom: 1px solid ${COLORS.separator};
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
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

  /* ── Footer ── rendered as a Puppeteer footerTemplate (bottom-pinned on every
     page), built in lib/pdf/generatePDF.ts. No in-HTML footer element here. */

  /* ── Title block ── */
  .title-block { text-align: center; margin-top: 16px; margin-bottom: 1.5em; }
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
  /* Lifecycle free-text body (b1-ii): verbatim resolution prose rendered as
     paragraphs. Dedicated class — founding/annual never use it. */
  .lifecycle-body p {
    margin: 0 0 1em;
  }
  .lifecycle-body p:last-child {
    margin-bottom: 0;
  }

  /* ── Signature block ── */
  .signatures-keep {
    margin-top: 3em;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .signatures {
    display: flex;
    flex-wrap: wrap;
    gap: 2em;
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
    margin-bottom: 36px;
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

  /* Atom 3 Slice 4 — grouped entity signature blocks (spec §4.2.1) */
  .sig-entry-entity { margin-bottom: 2em; }
  .sig-entity-name {
    font-weight: 700; font-size: 13px;
    text-transform: uppercase; letter-spacing: 0.03em;
    margin-bottom: 0.8em;
  }
  .sig-par { margin-bottom: 0.9em; }
  .sig-par-line { font-size: 12px; }
  .sig-par-label { font-size: 12px; }
  .sig-line-inline {
    display: inline-block; width: 180px;
    border-top: 1px solid ${COLORS.black};
    margin-left: 0.4em; vertical-align: middle;
  }
  .sig-par-name { font-size: 11px; color: ${COLORS.gray}; margin: 0.25em 0 0 2.5em; }

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
  <!-- Running header via <thead> (repeats per printed page); footer via
       Puppeteer footerTemplate (lib/pdf/generatePDF.ts). -->
  <table class="page-table">
    <thead>
      <tr><td>
        <div class="header-band">
          <div class="header-left"></div>
          <div class="header-right">
            <div class="company">${escapeHtml(data.companyName)}</div>
            ${data.neq ? `<div class="neq">NEQ ${escapeHtml(data.neq)}</div>` : ''}
          </div>
        </div>
      </td></tr>
    </thead>
    <tbody>
      <tr><td>
        <div class="title-block">
          <h1>${escapeHtml(data.documentTitle)}</h1>
          ${data.documentSubtitle ? `<div class="subtitle">${escapeHtml(data.documentSubtitle)}</div>` : ''}
          <div class="sep"></div>
        </div>

        ${data.bodyContent}
      </td></tr>
        ${data.signaturesHtml ? `<tr class="sig-row"><td>${data.signaturesHtml}</td></tr>` : ''}
    </tbody>
      <tfoot>
        <tr><td class="footer-reserve">&nbsp;</td></tr>
      </tfoot>
  </table>
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
