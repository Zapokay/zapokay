/**
 * Adapter: dispatches {type, data} to the appropriate HTML template,
 * then renders it to a PDF Buffer via the existing pdf-generator.
 */

import { generatePDF as renderPDF } from '@/lib/pdf-generator';
import {
  boardResolutionHTML,
  shareholderResolutionHTML,
  coverPageHTML,
} from '@/lib/pdf-templates';
import type { BoardResolutionData, ShareholderResolutionData, CoverPageData } from '@/lib/pdf-templates';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import { escapeHtml } from '@/lib/pdf-templates/base-layout';
import { formatDate } from '@/lib/utils';

/** Footer payload for the Puppeteer footerTemplate (bottom-pinned per page).
 *  Values are pre-escaped here since they are interpolated into footer HTML. */
interface FooterPayload {
  docName: string;
  companyLabel: string;
  dateLabel: string;
  /** #172 — opaque, durable documents.id (== stored row id). Full UUID, never
   *  truncated; the verification service resolves the full value. */
  docId: string;
  /** #172 — locale-correct "Page … of/sur …" wrapper around Puppeteer's magic
   *  pageNumber/totalPages spans (substituted per page at render). */
  pageLabel: string;
}

function buildFooter(d: {
  companyName: string;
  documentTitle: string;
  resolutionDate: string;
  language?: 'fr' | 'en' | 'bilingual';
  documentId: string;
}): FooterPayload {
  const en = d.language === 'en';
  // FR/EN footer labels — duplicated from base-layout per the WA amendment; the
  // base-layout copies had zero remaining readers once the in-HTML footer was
  // removed, so they were dropped there (grep-confirmed).
  const confidential = en ? 'Confidential — Internal Use' : 'Confidentiel — Usage interne';
  const generatedOnLabel = en ? 'Generated on' : 'Généré le';
  // #178 — the "Generated on / Généré le" footer shows the REAL generation date
  // (render-time today), locale-formatted via the §8.28 formatDate chokepoint.
  // NOT d.resolutionDate — that is the adoption date and stays in the body.
  const generationDate = formatDate(new Date().toISOString().slice(0, 10), en ? 'en' : 'fr');
  // #172 — page-count: Puppeteer substitutes <span class="pageNumber|totalPages">
  // per page. The spans carry no font of their own → they inherit the footer
  // container's 9px. The "Page … of/sur …" wording is OUR locale string and is
  // intentionally NOT escaped (it carries trusted magic-class HTML).
  const ofWord = en ? 'of' : 'sur';
  const pageLabel = `Page <span class="pageNumber"></span> ${ofWord} <span class="totalPages"></span>`;
  return {
    docName: escapeHtml(d.documentTitle),
    companyLabel: `${escapeHtml(d.companyName)} — ${confidential}`,
    dateLabel: `${generatedOnLabel} ${escapeHtml(generationDate)}`,
    docId: escapeHtml(d.documentId),
    pageLabel,
  };
}

interface BoardResolutionInput {
  companyName: string;
  neq?: string;
  documentTitle: string;
  resolutionDate: string;
  fiscalYear: string | null;
  language?: 'fr' | 'en' | 'bilingual';
  directors?: { name: string; title: string }[];
  resolutions?: { number: number; title: string; body: string }[];
  /** Lifecycle (b1-ii): verbatim free-text body rendered as paragraphs. */
  freeTextBody?: string;
  signatories?: SignatoryBlock[];
  /** #172 — durable documents.id stamped into the footer (== stored row id). */
  documentId: string;
}

interface ShareholderResolutionInput {
  companyName: string;
  neq?: string;
  documentTitle: string;
  resolutionDate: string;
  fiscalYear: string | null;
  language?: 'fr' | 'en' | 'bilingual';
  shareholders?: { name: string; shares: number; shareClass?: string; class?: string }[];
  resolutions?: { number: number; title: string; body: string }[];
  /** Lifecycle (b1-ii): verbatim free-text body rendered as paragraphs. */
  freeTextBody?: string;
  signatories?: SignatoryBlock[];
  /** #172 — durable documents.id stamped into the footer (== stored row id). */
  documentId: string;
}

interface CoverPageInput {
  companyName: string;
  neq?: string;
  exportDate?: string;
  completionScore?: number;
  totalRequired?: number;
  totalComplete?: number;
  language?: 'fr' | 'en' | 'bilingual';
}

interface GeneratePDFInput {
  type: string;
  data: BoardResolutionInput | ShareholderResolutionInput | CoverPageInput | Record<string, unknown>;
}

export async function generatePDF({ type, data }: GeneratePDFInput): Promise<Buffer> {
  let html: string;
  let footer: FooterPayload | undefined;

  switch (type) {
    case 'board-resolution': {
      const d = data as BoardResolutionInput;
      const tmplData: BoardResolutionData = {
        companyName: d.companyName,
        neq: d.neq,
        documentTitle: d.documentTitle,
        resolutionDate: d.resolutionDate,
        fiscalYear: d.fiscalYear,
        language: d.language ?? 'fr',
        directors: d.directors ?? [],
        resolutions: d.resolutions ?? [],
        freeTextBody: d.freeTextBody,
        signatories: d.signatories,
      };
      html = boardResolutionHTML(tmplData);
      footer = buildFooter(d);
      break;
    }

    case 'shareholder-resolution': {
      const d = data as ShareholderResolutionInput;
      const shareholders = (d.shareholders ?? []).map((s) => ({
        name: s.name,
        shares: s.shares,
        class: s.shareClass ?? s.class,
      }));
      const tmplData: ShareholderResolutionData = {
        companyName: d.companyName,
        neq: d.neq,
        documentTitle: d.documentTitle,
        resolutionDate: d.resolutionDate,
        fiscalYear: d.fiscalYear,
        language: d.language ?? 'fr',
        shareholders,
        resolutions: (data as ShareholderResolutionInput).resolutions ?? [],
        freeTextBody: d.freeTextBody,
        signatories: d.signatories,
      };
      html = shareholderResolutionHTML(tmplData);
      footer = buildFooter(d);
      break;
    }

    case 'cover-page': {
      const d = data as CoverPageInput;
      const tmplData: CoverPageData = {
        companyName: d.companyName,
        neq: d.neq,
        title: 'Livre de minutes',
        subtitle: `Complétude : ${d.completionScore ?? 0}% (${d.totalComplete ?? 0}/${d.totalRequired ?? 0} documents)`,
        preparedDate: d.exportDate ?? new Date().toLocaleDateString('fr-CA'),
        language: d.language ?? 'fr',
      };
      html = coverPageHTML(tmplData);
      break;
    }

    default:
      throw new Error(`generatePDF: type inconnu "${type}"`);
  }

  return renderPDF(html, footer);
}
