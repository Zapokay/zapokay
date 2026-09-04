/**
 * Adapter: dispatches {type, data} to the appropriate HTML template,
 * then renders it to a PDF Buffer via the existing pdf-generator.
 */

import { generatePDF as renderPDF } from '@/lib/pdf-generator';
import {
  boardResolutionHTML,
  shareholderResolutionHTML,
  coverPageHTML,
  binderIndexHTML,
  binderRegistersHTML,
} from '@/lib/pdf-templates';
import type { BoardResolutionData, ShareholderResolutionData, CoverPageData } from '@/lib/pdf-templates';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import { escapeHtml } from '@/lib/pdf-templates/base-layout';
import { formatDate } from '@/lib/utils';
import { getServerMessage } from '@/lib/i18n/server-messages';

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

/**
 * La mention de confidentialité, dans les TROIS variantes de langue.
 *
 * ⛔ « Usage interne » a été retiré le 2026-09-05 : ces documents sont FABRIQUÉS
 * pour être remis à un tiers — banquier, acheteur, vérificateur — et la mention
 * contredisait la fonction même du document qui la portait. La confidentialité,
 * elle, reste vraie : le mot reste.
 *
 * ★ UN SEUL ENDROIT LA RÉSOUT, pour le pied de page ET la page de garde. Elles
 * en portaient chacune leur copie en dur, et elles ont divergé pendant trois
 * commits : le pied disait « Confidentiel » quand la garde de la MÊME archive
 * disait encore « Confidentiel — Usage interne ».
 *
 * La variante bilingue compose les deux locales — « Confidentiel /
 * Confidential ». Elle n'atteint jamais la génération (signature-blocks.ts §9.1
 * le note aussi), mais une variante morte qui affirme une chose fausse reste
 * une dette : elle est alignée avec les deux autres.
 */
function confidentialLabel(language?: 'fr' | 'en' | 'bilingual'): string {
  const fr = getServerMessage('minuteBook.pdfFooter.confidential', 'fr');
  const en = getServerMessage('minuteBook.pdfFooter.confidential', 'en');
  if (language === 'en') return en;
  if (language === 'bilingual') return `${fr} / ${en}`;
  return fr;
}

function buildFooter(d: {
  companyName: string;
  documentTitle: string;
  resolutionDate: string;
  language?: 'fr' | 'en' | 'bilingual';
  /**
   * ⚠️ FACULTATIF DEPUIS LE 2026-09-05, et la raison vaut plus que le geste.
   * L'index et le PDF des registres sont SYNTHÉTISÉS à chaque export : ils
   * n'existent dans aucune ligne de `documents`. Y imprimer un identifiant
   * inventé mettrait sur chaque page un numéro que le service de vérification
   * ne résoudrait pas — une affirmation sans support. Pour ces deux documents,
   * la date de génération EST l'identité : elle suffit à distinguer deux
   * archives. Les documents stockés, eux, le fournissent toujours.
   */
  documentId?: string;
}): FooterPayload {
  const en = d.language === 'en';
  const confidential = confidentialLabel(d.language);
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
    docId: d.documentId ? escapeHtml(d.documentId) : '',
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

export interface BinderRegistersInput {
  companyName: string;
  neq?: string;
  documentTitle: string;
  /** REQUIS, pas optionnel : un registre sans date d'arrêté ne dit pas de quel
   *  conseil il parle. Étiquette et valeur arrivent déjà résolues de la route. */
  effectiveDate: { label: string; value: string };
  registers: {
    title: string;
    columns: { key: string; label: string }[];
    rows: Record<string, string>[];
    emptyMessage: string;
    citation?: string;
    footnote?: string;
  }[];
  footerDocName: string;
  language?: 'fr' | 'en' | 'bilingual';
}

export interface BinderIndexInput {
  companyName: string;
  neq?: string;
  documentTitle: string;
  documentSubtitle?: string;
  columns: { title: string; year: string };
  sections: {
    heading: string;
    count: string;
    entries: { title: string; fileName: string; year: string }[];
  }[];
  footerDocName: string;
  language?: 'fr' | 'en' | 'bilingual';
}

export interface CoverPageInput {
  companyName: string;
  neq?: string;
  /**
   * ⚠️ TITRE ET SOUS-TITRE ARRIVENT DÉJÀ LOCALISÉS. Ce module est le rendu
   * générique — il sert aussi les résolutions — et n'a pas à connaître les
   * catalogues. L'appelant, qui sait dans quelle langue il produit, les résout.
   * Les champs completionScore / totalRequired / totalComplete sont partis avec
   * la mesure qu'ils portaient : un livre n'a pas de dénominateur.
   */
  title: string;
  subtitle?: string;
  preparedDate: string;
  language?: 'fr' | 'en' | 'bilingual';
}

interface GeneratePDFInput {
  type: string;
  data: BoardResolutionInput | ShareholderResolutionInput | CoverPageInput | BinderIndexInput | BinderRegistersInput | Record<string, unknown>;
}

/**
 * ⚠️ LA PORTE TYPÉE DE LA PAGE DE GARDE, ET ELLE EXISTE POUR UNE RAISON PRÉCISE.
 * `GeneratePDFInput.data` est une union dont le dernier membre est
 * `Record<string, unknown>` : il avale n'importe quel objet, donc omettre un
 * champ requis de CoverPageInput ne faisait échouer AUCUNE compilation — mesuré
 * 2026-09-02, le canari n'a pas mordu. Cette fonction rétablit le contrat pour
 * l'unique appelant de 'cover-page' sans toucher aux branches des résolutions,
 * dont l'union large est un autre lot.
 */
export function generateCoverPagePDF(input: CoverPageInput): Promise<Buffer> {
  return generatePDF({ type: 'cover-page', data: input });
}

/** La porte typée de l'index — même raison que celle de la page de garde. */
export function generateBinderIndexPDF(input: BinderIndexInput): Promise<Buffer> {
  return generatePDF({ type: 'binder-index', data: input });
}

/** La porte typée des registres — écrite AVANT son appelant, comme au b552dff. */
export function generateBinderRegistersPDF(input: BinderRegistersInput): Promise<Buffer> {
  return generatePDF({ type: 'binder-registers', data: input });
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

    case 'binder-registers': {
      const d = data as BinderRegistersInput;
      html = binderRegistersHTML({
        companyName: d.companyName,
        neq: d.neq,
        documentTitle: d.documentTitle,
        effectiveDate: d.effectiveDate,
        registers: d.registers,
        footerDocName: d.footerDocName,
        language: d.language ?? 'fr',
      });
      // ⚠️ `resolutionDate: ''` — le champ est DÉCLARÉ par buildFooter et
      // JAMAIS LU (seul un commentaire l'y nomme, pour dire qu'il ne s'en sert
      // pas). Une signature qui ment sur ce qu'elle emploie : dette notée,
      // volontairement pas corrigée ici. Même motif qu'`effectiveDate` au lot H1.
      footer = buildFooter({
        companyName: d.companyName,
        documentTitle: d.footerDocName,
        resolutionDate: '',
        language: d.language,
      });
      break;
    }

    case 'binder-index': {
      const d = data as BinderIndexInput;
      html = binderIndexHTML({
        companyName: d.companyName,
        neq: d.neq,
        documentTitle: d.documentTitle,
        documentSubtitle: d.documentSubtitle,
        columns: d.columns,
        sections: d.sections,
        footerDocName: d.footerDocName,
        language: d.language ?? 'fr',
      });
      // Voir la note de la branche 'binder-registers' pour `resolutionDate`.
      footer = buildFooter({
        companyName: d.companyName,
        documentTitle: d.footerDocName,
        resolutionDate: '',
        language: d.language,
      });
      break;
    }

    case 'cover-page': {
      const d = data as CoverPageInput;
      const tmplData: CoverPageData = {
        companyName: d.companyName,
        neq: d.neq,
        title: d.title,
        subtitle: d.subtitle,
        preparedDate: d.preparedDate,
        language: d.language ?? 'fr',
        confidentialLabel: confidentialLabel(d.language),
      };
      html = coverPageHTML(tmplData);
      break;
    }

    default:
      throw new Error(`generatePDF: type inconnu "${type}"`);
  }

  return renderPDF(html, footer);
}
