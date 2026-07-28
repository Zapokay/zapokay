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
import { fiscalYearSet } from '@/lib/active-years';

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
  //
  // The YEAR SET comes from `fiscalYearSet` (lib/active-years) — the stored ACTIVE
  // rows UNIONED with the currently-computed window — so this engine and the
  // deadline feeder can no longer drift apart. The stored list is written once at
  // onboarding and never refreshed, while the feeder's year advances with the
  // calendar; without the union they diverge on a schedule (Acme 2028-01-01, Wick
  // 2029-01-01) and OVERLAP_MERGE silently un-pairs. See the helper's docblock.
  //
  // ORDER PRESERVED: the query above returns DESCENDING; fiscalYearSet returns
  // ascending, so it is re-sorted descending here. Only WHICH years are included
  // changes — never the shape of an entry, its endDate formula, or the order they
  // are emitted in (which drives checklist order downstream).
  const storedActiveYears = (fiscalYears ?? []).map((fy: { year: number }) => fy.year);
  const fyFormatted = fiscalYearSet(
    storedActiveYears,
    fiscalYearEndMonth,
    fiscalYearEndDay,
    incorporationDate,
    today,
  )
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      endDate: `${year}-${pad2(fiscalYearEndMonth)}-${pad2(fiscalYearEndDay)}`,
    }));

  type RawReq = {
    id: string; requirement_key: string; category: 'foundational' | 'annual'; title_fr: string; title_en: string;
    description_fr: string | null; description_en: string | null; section: string;
    sort_order: number; can_generate: boolean; can_upload: boolean;
    // Nullable in the type even though the column is NOT NULL-defaulted and uniformly
    // seeded today: a future INSERT could omit it, and null must read as NOT exempt.
    exempt_from_lateness: boolean | null;
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
    // Foundational liveness: NO year (duration is legally inert — see below), floored
    // live→regularize (owed from day 1 → never "upcoming"). Null in TWO cases now: a
    // CERTIFIED row (is_finalized===true), and an EXEMPT row (exempt_from_lateness) —
    // see the exemption block below. Non-null for every other NOT-DONE item (missing,
    // uploaded-but-uncertified, or generated draft).
    //
    // LATENESS EXEMPTION — NOW A CATALOG COLUMN, `minute_book_requirements
    // .exempt_from_lateness` (migration 20260728120000). An exempt row is COUNTED in
    // requirementsTotal, stays uploadable/replaceable, and enters the binder on
    // certification — it simply carries NO tier and feeds NEITHER overdue counter.
    //
    // GOVERNING PRINCIPLE (Dom, endorsed by Harvey as the thing to keep explicit):
    // WHO ELSE HOLDS THE PROOF. The more a document's proof is held elsewhere (the
    // registraire, the public register), the more benign its absence from the book; the
    // more it exists only inside the company, the graver. That grades the list without
    // any reference to duration. Exempt today: statuts + certificat (the registraire
    // holds them), règlements (supplétif — art. 113-114 LSAQ and the "à défaut"
    // pattern), acceptation de mandat (directors are declared at the REQ), and the LSA
    // declaration initiale. NOT exempt: souscription/émission (proof exists ONLY in the
    // registre des valeurs mobilières) and the first resolutions ("révélateurs" that the
    // founding acts may never have been performed).
    //
    // WHY THIS REPLACED A CODE-SIDE SET. The former PROOF_SLOT_KEYS was a registry-
    // derived Set gated on `framework === 'LSA'`. Both the membership AND the framework
    // gate are now DATA: catalog rows are already per-framework with disjoint keys, so
    // `lsaq_declaration_initiale` can be exempt while `cbca_declaration_initiale_qc` is
    // not, with no framework literal anywhere. That CBCA row stays non-exempt
    // deliberately — it is a FILING, not a constitutive document, and for a CBCA company
    // without hasLaterAnnualFiling its deadline twin IS emitted and genuinely overdue, so
    // ddf061d's guard remains load-bearing for a company shape we have no fixture for.
    //
    // NULL-OR-FALSE IS NOT EXEMPT. The column is NOT NULL-defaulted and uniformly seeded
    // today, but a future INSERT could omit it; the check is `=== true` so absence can
    // never silently exempt a row.
    //
    // DURATION BASIS REMOVED (Harvey 2026-07-28, GREEN, art. 9 LSAQ + the federal
    // certificate rule + LPLE publicity. GREEN here = statutory structure Harvey
    // verified against the texts, which is what implementation keys on — the same sense
    // used for the exemption grading above. NOT a content sign-off: the CONTENT launch
    // gate is A1, where an external lawyer is the sole GREEN authority and has not
    // reviewed this.)
    // The time a company has operated without its constitutive documents in the book
    // is LEGALLY NEUTRAL, LSAQ and CBCA alike: validity and opposability flow from
    // deposit at the registraire and the public register, not from the internal book.
    // So `year` is null for EVERY foundational row — Branch B's "no year, no lateness
    // concept" path — and the tier no longer moves with the calendar. Before this,
    // `year: incYear` made the SAME missing document read 'regularize' at a 2019 clock
    // and 'remediate' at a 2026 one.
    //
    // THE FLOOR BELOW — `raw === 'live' ? 'regularize' : raw` — REMAINS, DELIBERATELY.
    // Its reason is SEMANTIC, not temporal (see the opening line of this block and
    // commit 85f5695): `live` is glossed "upcoming / not yet due", and a founding
    // document is owed from day 1, so it is never "not yet due". Harvey's ruling
    // retires the duration concept; it does not make these documents current.
    //
    // WHAT THE FLOOR STILL GOVERNS, after the exemption: the NON-EXEMPT rows — the first
    // resolutions and souscription/émission. Nobody else holds THEIR proof, so their
    // absence is a real gap and 'regularize' is the honest tier. Net effect: every
    // unsatisfied NON-EXEMPT foundational row is 'regularize' at every ambient clock;
    // exempt rows carry no tier at all. Clock-invariance remains the acceptance test for
    // both halves.
    //
    // NO TIER USES THE EXISTING NULL PATH. `liveness` is already `ObligationLiveness |
    // null`, null for certified rows, and every consumer already handles it: the counters
    // increment inside this same `if (isFinalized !== true)` block, and
    // CompletenessPage's rowMatchesFilters takes `ObligationLiveness | null` and simply
    // matches no severity chip on null. So an exempt row needs no new liveness value —
    // adding one would have meant widening a closed 3-member union that LIVENESS_RANK
    // and TIER_BADGE switch over exhaustively.
    //
    // Touches ONLY `liveness` and which counter it increments. `satisfied`, `state`,
    // STATE_WEIGHT, requirementsTotal and the completeness % are all unaffected.
    let liveness: ObligationLiveness | null = null;
    if (isFinalized !== true && req.exempt_from_lateness !== true) {
      const raw = computeLiveness({
        daysUntilDue: null,
        legalWindowDays: null,
        year: null,
        today,
      });
      liveness = raw === 'live' ? 'regularize' : raw;
      // NO `upcoming` BRANCH HERE, and tsc proves it: the floor above narrows `liveness`
      // to 'regularize' | 'remediate', so a foundational row can no longer reach 'live'
      // at all. It used to, via the proof-slot escape — that was the ONE row incrementing
      // `upcoming` from this branch, and it is exactly the "à venir" falsehood this
      // change removes. Exempt rows now exit above with liveness null and count nowhere.
      if (liveness === 'regularize') overdueRegularize++;
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
