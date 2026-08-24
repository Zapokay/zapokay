import type { SupabaseClient } from '@supabase/supabase-js';
import type { VaultDocument } from '@/components/documents/DocumentRow';

/**
 * A hold (archive) fiscal year and the imported documents stamped with it.
 * Hold years exist only to hold out-of-window imported documents; they are
 * excluded from the compliance score (the requirement fetch is status='active'
 * fiscal years only) and surface in Complétude as a read-only archive box.
 */
export interface HoldYear {
  year: number;
  documents: VaultDocument[];
}

/**
 * Fetch the company's hold (archive) fiscal years and their documents, grouped
 * by year, descending, years-with-docs only.
 *
 * TWO DISTINCT status fields — do NOT conflate:
 *   - company_fiscal_years.status = 'hold'  is the YEAR's status (the year
 *     exists only to hold out-of-window archive imports).
 *   - documents.status = 'active'           is the DOCUMENT's own status (the
 *     row is live, i.e. not soft-deleted / superseded).
 * A hold doc is an ACTIVE document sitting in a HOLD year, so the docs fetch
 * filters documents.status = 'active' AND document_year IN (the hold years).
 *
 * Read-for-display: NOT wrapped non-fatal (unlike the upload-path hold-row
 * insert). If a query errors it surfaces — the page already handles a failed
 * completeness fetch.
 */
export async function computeHoldYears(
  supabase: SupabaseClient,
  companyId: string,
): Promise<HoldYear[]> {
  // 1. The company's hold fiscal years (the YEAR's status).
  const { data: holdRows, error: fyError } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', companyId)
    .eq('status', 'hold')
    .order('year', { ascending: false });
  if (fyError) throw fyError;

  const holdYearNumbers = (holdRows || []).map((r: { year: number }) => r.year);
  if (holdYearNumbers.length === 0) return [];

  // 2. The documents stamped with a hold year. status='active' here is the
  //    DOCUMENT's own status (live, not soft-deleted), NOT the year's 'hold'.
  //
  // A7-1 — `requirement_key` n'est plus sélectionné ici : PERSONNE ne le lit.
  // Mesuré le 2026-08-24, après A6 : la boîte d'archive lit `id`, `title` et
  // `is_finalized`, rien d'autre. Cette fonction ne consulte que
  // `document_year`. Le champ était transporté jusqu'au navigateur — la route
  // de complétude le sérialise dans sa réponse — pour n'être déréférencé
  // nulle part.
  // ⚠️ Ce n'est PAS une bascule vers `requirement_documents` : la boîte
  // d'archive n'a jamais eu besoin de savoir quelles exigences ses documents
  // couvrent. C'est un retrait, pas un remplacement.
  const { data: docs, error: docError } = await supabase
    .from('documents')
    .select(
      'id, company_id, title, document_type, document_year, file_url, language, uploaded_at, created_at, source, minute_book_section, is_finalized',
    )
    .eq('company_id', companyId)
    .eq('status', 'active')
    .in('document_year', holdYearNumbers)
    .order('created_at', { ascending: false });
  if (docError) throw docError;

  // 3. Group by document_year, descending; omit years with zero docs.
  const byYear = new Map<number, VaultDocument[]>();
  for (const doc of (docs || []) as VaultDocument[]) {
    if (doc.document_year === null) continue;
    const existing = byYear.get(doc.document_year);
    if (existing) {
      existing.push(doc);
    } else {
      byYear.set(doc.document_year, [doc]);
    }
  }

  const result: HoldYear[] = [];
  for (const year of holdYearNumbers) {
    const documents = byYear.get(year);
    if (!documents) continue;
    result.push({
      year,
      documents,
    });
  }
  return result;
}
