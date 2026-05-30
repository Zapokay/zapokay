/**
 * Tier 1 #21 — Requirement-completeness scoring (founding + annual docs).
 *
 * Pure function extracted from /api/minute-book/completeness route.ts so the
 * scoring math can be combined with computeEventCompleteness in the unified
 * route handler. Behavior preserved verbatim from the pre-extraction route.
 *
 * Scoring (mirrors lib/minute-book/state.ts):
 *   téléversé = 1.0  (uploaded & finalized — truly done)
 *   généré    = 0.5  (generated OR WIP upload — awaiting signature)
 *   missing   = 0.0
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { requirementToDocType, type VaultDocType } from '@/lib/requirement-doctype';
import { getDocumentState, STATE_WEIGHT } from '@/lib/minute-book/state';

export interface ChecklistItem {
  id: string;
  requirement_key: string;
  category: 'foundational' | 'annual';
  title_fr: string;
  title_en: string;
  description_fr: string | null;
  description_en: string | null;
  section: string;
  sort_order: number;
  can_generate: boolean;
  can_upload: boolean;
  year: number | null;
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /** Derived server-side via `requirementToDocType` — see lib/requirement-doctype.ts. */
  document_type: VaultDocType;
  /**
   * Phase B B5 — when the row is satisfied, these surface the attached
   * documents-table row so the client can avoid an on-demand fetch (B4
   * destructive-replace flow) and split the badge between signed final
   * vs WIP upload. Null/undefined when the row is unsatisfied or when the
   * lookup found no matching document (data drift).
   */
  document_id?: string | null;
  document_file_url?: string | null;
  document_is_finalized?: boolean | null;
}

export interface RequirementCompletenessResult {
  checklist: ChecklistItem[];
  fiscalYears: { year: number; endDate: string }[];
  /** Count of téléversé rows. */
  requirementsUploaded: number;
  /** Count of généré rows (incl. WIP uploads). */
  requirementsGenerated: number;
  requirementsMissing: number;
  requirementsTotal: number;
  /** Weighted numerator: requirementsUploaded × 1.0 + requirementsGenerated × 0.5. */
  requirementsWeightedNum: number;
}

export async function computeRequirementCompleteness(
  supabase: SupabaseClient,
  companyId: string,
  framework: 'LSA' | 'CBCA',
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
): Promise<RequirementCompletenessResult> {
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // 1. Get all applicable requirements
  const { data: requirements, error: reqError } = await supabase
    .from('minute_book_requirements')
    .select('*')
    .or(`framework.eq.${framework},framework.eq.ALL`)
    .order('sort_order');
  if (reqError) throw reqError;

  // 2. Get all active fiscal years
  const { data: fiscalYears, error: fyError } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('year', { ascending: false });
  if (fyError) throw fyError;

  // 3. Get all company documents with requirement_key
  //    B5: id, file_url, is_finalized surfaced on ChecklistItem so the client
  //    can resolve the destructive-replace target without an extra round-trip
  //    and split the row badge between signed final vs WIP upload.
  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('id, requirement_key, requirement_year, source, file_url, is_finalized')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .not('requirement_key', 'is', null);
  if (docError) throw docError;

  // 4. Compute endDate per fiscal year (resolution date stamped on PDFs
  // generated via Bulk Catch-Up). Year labels are now derived from `year`
  // alone — see getFiscalYearLabel in lib/fiscal-year-label.ts.
  const fyFormatted = (fiscalYears || []).map((fy: { year: number }) => ({
    year: fy.year,
    endDate: `${fy.year}-${pad2(fiscalYearEndMonth)}-${pad2(fiscalYearEndDay)}`,
  }));

  type RawReq = {
    id: string; requirement_key: string; category: 'foundational' | 'annual'; title_fr: string; title_en: string;
    description_fr: string | null; description_en: string | null; section: string;
    sort_order: number; can_generate: boolean; can_upload: boolean;
  };
  type RawDoc = {
    id: string;
    requirement_key: string;
    requirement_year: number | null;
    source: string | null;
    file_url: string | null;
    is_finalized: boolean | null;
  };

  // 5. Build checklist
  const foundationalReqs = (requirements || []).filter((r: RawReq) => r.category === 'foundational');
  const annualReqs = (requirements || []).filter((r: RawReq) => r.category === 'annual');

  const checklist: ChecklistItem[] = [];
  let requirementsTotal = 0;
  let requirementsUploaded = 0;
  let requirementsGenerated = 0;

  // Foundational items
  for (const req of foundationalReqs as RawReq[]) {
    const matchingDoc = (documents || []).find((d: RawDoc) => d.requirement_key === req.requirement_key);
    const satisfied = !!matchingDoc;
    const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
    const isFinalized = matchingDoc?.is_finalized ?? null;
    const state = getDocumentState({ satisfied, source, is_finalized: isFinalized });
    checklist.push({
      ...req,
      year: null,
      satisfied,
      source,
      document_type: requirementToDocType(req.requirement_key, req.section),
      document_id: matchingDoc?.id ?? null,
      document_file_url: matchingDoc?.file_url ?? null,
      document_is_finalized: isFinalized,
    });
    requirementsTotal++;
    if (state === 'téléversé') requirementsUploaded++;
    else if (state === 'généré') requirementsGenerated++;
  }

  // Annual items — one set per active fiscal year
  for (const fy of fyFormatted) {
    for (const req of annualReqs as RawReq[]) {
      const matchingDoc = (documents || []).find(
        (d: RawDoc) => d.requirement_key === req.requirement_key && d.requirement_year === fy.year,
      );
      const satisfied = !!matchingDoc;
      const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
      const isFinalized = matchingDoc?.is_finalized ?? null;
      const state = getDocumentState({ satisfied, source, is_finalized: isFinalized });
      checklist.push({
        ...req,
        year: fy.year,
        satisfied,
        source,
        document_type: requirementToDocType(req.requirement_key, req.section),
        document_id: matchingDoc?.id ?? null,
        document_file_url: matchingDoc?.file_url ?? null,
        document_is_finalized: isFinalized,
      });
      requirementsTotal++;
      if (state === 'téléversé') requirementsUploaded++;
      else if (state === 'généré') requirementsGenerated++;
    }
  }

  const requirementsMissing = requirementsTotal - requirementsUploaded - requirementsGenerated;
  const requirementsWeightedNum =
    requirementsUploaded * STATE_WEIGHT['téléversé'] +
    requirementsGenerated * STATE_WEIGHT['généré'];

  return {
    checklist,
    fiscalYears: fyFormatted,
    requirementsUploaded,
    requirementsGenerated,
    requirementsMissing,
    requirementsTotal,
    requirementsWeightedNum,
  };
}
