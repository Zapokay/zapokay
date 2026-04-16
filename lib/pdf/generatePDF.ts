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

interface BoardResolutionInput {
  companyName: string;
  neq?: string;
  resolutionDate: string;
  fiscalYear: string;
  language?: 'fr' | 'en' | 'bilingual';
  directors?: { name: string; title: string }[];
  resolutions?: { number: number; title: string; body: string }[];
  signatories?: { id: string; name: string; role: string }[];
}

interface ShareholderResolutionInput {
  companyName: string;
  neq?: string;
  resolutionDate: string;
  fiscalYear: string;
  language?: 'fr' | 'en' | 'bilingual';
  shareholders?: { name: string; shares: number; shareClass?: string; class?: string }[];
  resolutions?: { number: number; title: string; body: string }[];
  signatories?: { id: string; name: string; role: string }[];
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

  switch (type) {
    case 'board-resolution': {
      const d = data as BoardResolutionInput;
      const tmplData: BoardResolutionData = {
        companyName: d.companyName,
        neq: d.neq,
        resolutionDate: d.resolutionDate,
        fiscalYear: d.fiscalYear,
        language: d.language ?? 'fr',
        directors: d.directors ?? [],
        resolutions: d.resolutions ?? [],
        signatories: d.signatories,
      };
      html = boardResolutionHTML(tmplData);
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
        resolutionDate: d.resolutionDate,
        fiscalYear: d.fiscalYear,
        language: d.language ?? 'fr',
        shareholders,
        resolutions: (data as ShareholderResolutionInput).resolutions ?? [],
        signatories: d.signatories,
      };
      html = shareholderResolutionHTML(tmplData);
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

  return renderPDF(html);
}
