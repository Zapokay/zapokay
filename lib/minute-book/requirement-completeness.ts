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
import { computeLiveness } from '@/lib/obligations/liveness';
import type { ObligationLiveness } from '@/lib/obligations/obligation';
import { filingForRuleKey } from '@/lib/obligations/filing-registry';
import { parseLocalDate } from '@/lib/utils';

/**
 * PROOF-SLOT requirement keys — obligations whose FILING is already complete by
 * operation of law, leaving only the PROOF to collect for the binder. Registry-derived
 * from qc_initial_declaration's requirementKeys so the key list lives in exactly ONE
 * place (no literal here). Consumed by the foundational-liveness exemption below.
 */
const PROOF_SLOT_KEYS: ReadonlySet<string> = new Set(
  filingForRuleKey('qc_initial_declaration')?.requirementKeys ?? [],
);

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
  /**
   * Liveness tier for a NOT-DONE item — any doc where is_finalized !== true (missing,
   * uploaded-but-uncertified, or generated draft); null only when certified/done
   * (is_finalized === true). Computed via the board's computeLiveness so Complétude +
   * the dashboard verdict share ONE classification. Annual: year-based (live =
   * "upcoming" / regularize / remediate). Foundational (year:null): anchored to
   * incorporation age with a live→regularize floor — a founding doc is owed from day 1,
   * so it is NEVER 'live'/upcoming.
   */
  liveness: ObligationLiveness | null;
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
  document_language?: string | null;
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
  /**
   * Liveness breakdown of the NOT-DONE items (Core §4: retention window = urgency,
   * not expiry — no year is filtered out). NOT-DONE = every item where is_finalized
   * !== true (missing, uploaded-but-uncertified, or generated draft). `upcoming` =
   * live tier (not-yet-due current/future FY). Invariant: upcoming + overdueRegularize
   * + overdueProlonged === (count of items where is_finalized !== true).
   */
  upcoming: number;
  overdueRegularize: number;
  overdueProlonged: number;
}

export async function computeRequirementCompleteness(
  supabase: SupabaseClient,
  companyId: string,
  framework: 'LSA' | 'CBCA',
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  incorporationDate: string | null,
): Promise<RequirementCompletenessResult> {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  // Foundational items carry no year — anchor their liveness to incorporation age.
  const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;

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
    .select('id, requirement_key, requirement_year, source, file_url, is_finalized, language')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .not('requirement_key', 'is', null)
    // #75/§8.55 — newest-first so the .find() binds (req[+year]) to the LATEST
    // active doc when regenerations leave duplicates (#135 not yet evicting).
    // Mirrors the event-completeness.ts event_documents ordering fix (#134).
    .order('created_at', { ascending: false });
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
    language: string | null;
  };

  // 5. Build checklist
  const foundationalReqs = (requirements || []).filter((r: RawReq) => r.category === 'foundational');
  const annualReqs = (requirements || []).filter((r: RawReq) => r.category === 'annual');

  const checklist: ChecklistItem[] = [];
  let requirementsTotal = 0;
  let requirementsUploaded = 0;
  let requirementsGenerated = 0;
  // Liveness breakdown of MISSING items (Core §4: no year filtered out).
  let upcoming = 0;
  let overdueRegularize = 0;
  let overdueProlonged = 0;

  // Foundational items
  for (const req of foundationalReqs as RawReq[]) {
    const matchingDoc = (documents || []).find((d: RawDoc) => d.requirement_key === req.requirement_key);
    const satisfied = !!matchingDoc;
    const source = (matchingDoc?.source as 'uploaded' | 'generated' | null) || null;
    const isFinalized = matchingDoc?.is_finalized ?? null;
    const state = getDocumentState({ satisfied, source, is_finalized: isFinalized, can_generate: req.can_generate });
    // Foundational liveness: anchored to incorporation age, floored live→regularize
    // (owed from day 1 → never "upcoming"). Non-null for any NOT-DONE item (missing,
    // uploaded-but-uncertified, or generated draft); null only when is_finalized===true.
    //
    // PROOF-SLOT EXEMPTION (Harvey 2026-07-24, GREEN, art. 8-9 LSAQ). For a
    // PROVINCIALLY incorporated company the RE-200 initial declaration is ALREADY
    // FILED: art. 8 lets the declaration be attached to the articles of incorporation,
    // art. 9 transmits the articles and their attachments to the registraire — so
    // incorporation IS registration ("une quasi-identité"). Nothing is owed to anyone;
    // the only gap is a receipt the user downloads from the REQ. Flooring that to
    // regularize/remediate renders "consulter un professionnel" — the most severe thing
    // the product says — for a download. Disproportionate, so exempt it.
    //
    // THE FIX IS `year: null`, NOT removing the floor. The call below passes
    // `year: incYear`, so for an established company computeLiveness already returns
    // 'remediate' (yearsBehind = today − incYear) BEFORE the floor is ever reached —
    // dropping the `raw === 'live' ? 'regularize'` override alone would change nothing.
    // Passing null takes Branch B's "no year, no lateness concept" path → 'live'. This
    // is an EXEMPTION, not a new liveness value: the union stays live|regularize|
    // remediate and every consumer (TIER_BADGE, LIVENESS_RANK, A3Item, CompletenessPage
    // filters) is untouched.
    //
    // LSA ONLY — load-bearing, not cosmetic. CBCA's RE-200 DEADLINE twin survives
    // (d0c0d44 deliberately left the federal path alone, pending Harvey on the
    // federal-doing-business-in-Québec registration obligation) and is genuinely
    // overdue. Exempting the CBCA completeness half would have Complétude say "not late"
    // while the board says "overdue" about the SAME obligation.
    //
    // EVERY OTHER FOUNDATIONAL ROW KEEPS ITS FLOOR: articles, by-laws, first resolutions
    // are owed from day 1 — the company itself must produce them and nobody else holds a
    // copy. RE-200 differs precisely because the government already has the filing.
    //
    // Touches ONLY `liveness` and which counter it increments. `satisfied`, `state`,
    // STATE_WEIGHT, requirementsTotal and the completeness % are all unaffected.
    let liveness: ObligationLiveness | null = null;
    if (isFinalized !== true) {
      const isProofSlot = framework === 'LSA' && PROOF_SLOT_KEYS.has(req.requirement_key);
      const raw = computeLiveness({
        daysUntilDue: null,
        legalWindowDays: null,
        year: isProofSlot ? null : incYear,
        today,
      });
      liveness = isProofSlot ? raw : raw === 'live' ? 'regularize' : raw;
      if (liveness === 'live') upcoming++;
      else if (liveness === 'regularize') overdueRegularize++;
      else overdueProlonged++;
    }
    checklist.push({
      ...req,
      year: null,
      satisfied,
      liveness,
      source,
      document_type: requirementToDocType(req.requirement_key, req.section),
      document_id: matchingDoc?.id ?? null,
      document_file_url: matchingDoc?.file_url ?? null,
      document_is_finalized: isFinalized,
      document_language: matchingDoc?.language ?? null,
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
      const state = getDocumentState({ satisfied, source, is_finalized: isFinalized, can_generate: req.can_generate });
      // Annual liveness: year-based (live = "upcoming" for current/future FY). Non-null for
      // any NOT-DONE item (missing, uploaded-but-uncertified, or generated draft);
      // null only when is_finalized===true (certified/done).
      let liveness: ObligationLiveness | null = null;
      if (isFinalized !== true) {
        liveness = computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: fy.year, today });
        if (liveness === 'live') upcoming++;
        else if (liveness === 'regularize') overdueRegularize++;
        else overdueProlonged++;
      }
      checklist.push({
        ...req,
        year: fy.year,
        satisfied,
        liveness,
        source,
        document_type: requirementToDocType(req.requirement_key, req.section),
        document_id: matchingDoc?.id ?? null,
        document_file_url: matchingDoc?.file_url ?? null,
        document_is_finalized: isFinalized,
        document_language: matchingDoc?.language ?? null,
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
    upcoming,
    overdueRegularize,
    overdueProlonged,
  };
}
