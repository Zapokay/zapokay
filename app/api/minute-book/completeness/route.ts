import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeRequirementCompleteness,
  type ChecklistItem,
} from '@/lib/minute-book/requirement-completeness';
import {
  computeEventCompleteness,
  type EventActStatus,
} from '@/lib/minute-book/event-completeness';
import { computeHoldYears, type HoldYear } from '@/lib/minute-book/hold-years';

// Re-export ChecklistItem for backward compat — multiple consumers
// (CompletenessPage, RequirementSection, UploadDocumentModal, upload-document)
// import the type from this route's path.
export type { ChecklistItem };

export interface CompletenessResponse {
  /**
   * Tier 1 #21 — combined weighted percentage across requirements + event acts.
   * Sums numerators and denominators (never averages two scores):
   *   round((requirementsWeightedNum + eventsWeightedNum) /
   *         (requirementsTotal + eventActsTotal) × 100)
   * 0 when there are no requirements AND no events. The event engine's
   * standalone score=100-on-empty special case does NOT feed this formula.
   */
  score: number;
  /** Combined: requirements + event acts. */
  totalRequired: number;
  /** Combined raw count of satisfied rows (téléversé + généré across both engines). */
  totalSatisfied: number;
  totalMissing: number;
  /** Per-state counts for three-state header display, combined across both engines. */
  totalUploaded: number;
  totalGenerated: number;
  /**
   * The two halves of `totalMissing`, split on the WINDOW axis so the inventory line
   * can stop calling both of them "à générer ou à téléverser".
   *
   * ⚠️ THE ASYMMETRY IS DELIBERATE AND IT IS NOT A BUG — READ BEFORE "FIXING" EITHER
   * FIELD. `totalMissing` spans BOTH engines (requirements + lifecycle acts), while
   * `totalUpcoming` comes from the requirements engine ALONE. Subtracting one from the
   * other is still exact, because an ACT can never be `upcoming`: an act records
   * something that already happened, so its document exists from that day and waits for
   * no window. Every missing act therefore lands, correctly and entirely, in
   * `totalToGenerate`.
   *
   * That is also why the "à venir" CHIP on Complétude is not this number: the chip
   * selects rows and keeps `liveness` for acts, because "is this the action of the
   * moment?" is the right question for an act. Two signals, on purpose, and the chip's
   * own comment carries the argument.
   */
  totalUpcoming: number;
  totalToGenerate: number;
  /** UNCHANGED: requirements-only checklist. UploadDocumentModal "corresponds to"
   *  dropdown depends on this array shape — do NOT inject events. */
  checklist: ChecklistItem[];
  fiscalYears: { year: number; endDate: string }[];
  /**
   * Tier 1 #21 — additive fields exposing the per-engine scores so consumers
   * can render the breakdown if needed. `score` above is the combined headline.
   */
  requirementsScore: number;
  eventsScore: number;
  combinedScore: number;
  eventActsTotal: number;
  eventActsSatisfied: number;
  holdYears: HoldYear[];
  /**
   * Liveness breakdown of the NOT-DONE items — requirements + events (both
   * engines tier). Powers the Complétude chip banner + dashboard-verdict
   * coherence.
   */
  upcoming: number;
  overdueRegularize: number;
  overdueProlonged: number;
  /**
   * The per-act lifecycle rows, verbatim from the event engine already running in
   * this route's Promise.all. Added 2026-07-28 so CompletenessPage can stop issuing
   * a SECOND fetch to /api/minute-book/event-completeness, which re-ran the whole
   * event engine: 8 duplicated queries and ~99 duplicated rows per Complétude load
   * on Acme, including the 70-row event_documents read executed twice concurrently.
   * Zero new computation and zero new queries here — `events.acts` was computed and
   * then discarded.
   *
   * NOT A VIOLATION OF THE `checklist` RULE ABOVE. That rule forbids injecting event
   * acts INTO `checklist`, because UploadDocumentModal's "corresponds to" dropdown
   * iterates that array and would render acts as requirement options. This is a
   * SEPARATE field; `checklist` stays requirements-only. Do not merge the two.
   *
   * ACCEPTED COST: the route's three other consumers (BinderPage,
   * UploadDocumentModal, useRowUpload) now receive `acts` they do not read — 11
   * objects on Acme, 1 on Wick. Deliberate: a slightly larger payload for three
   * callers against a duplicated engine run removed for one. It also closes a race —
   * event grouping keys on `data.fiscalYears` from THIS response, so two independent
   * fetches let acts land first and transiently classify every act as hors-exercice.
   */
  acts: EventActStatus[];
}

export async function GET() {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, incorporation_type, fiscal_year_end_month, fiscal_year_end_day, incorporation_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Aucune société trouvée' }, { status: 404 });
    }

    const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
    const fyEndMonth = (company.fiscal_year_end_month as number | null) ?? 12;
    const fyEndDay   = (company.fiscal_year_end_day   as number | null) ?? 31;

    const [req, events, holdYears] = await Promise.all([
      computeRequirementCompleteness(
        supabase,
        company.id as string,
        framework,
        fyEndMonth,
        fyEndDay,
        (company.incorporation_date as string | null) ?? null,
      ),
      computeEventCompleteness(
        supabase,
        company.id as string,
        (company.incorporation_date as string | null) ?? null,
      ),
      computeHoldYears(supabase, company.id as string),
    ]);

    // Locked decision 3 — sum numerators and denominators, never average two
    // scores. Empty events contribute 0/0 → nothing biases combined toward
    // 100. The event engine's standalone score=100-on-empty special case
    // does NOT feed this formula.
    const combinedNum   = req.requirementsWeightedNum + events.eventsWeightedNum;
    const combinedDenom = req.requirementsTotal       + events.totalActs;
    const combinedScore = combinedDenom === 0
      ? 0
      : Math.round((combinedNum / combinedDenom) * 100);

    const requirementsScore = req.requirementsTotal > 0
      ? Math.round((req.requirementsWeightedNum / req.requirementsTotal) * 100)
      : 0;
    // eventsScore = contribution to combined (0 on empty); NOT the standalone route's 100-on-empty UI convenience — do not "fix" to 100.
    const eventsScore = events.totalActs > 0
      ? Math.round((events.eventsWeightedNum / events.totalActs) * 100)
      : 0;

    const requirementsSatisfied = req.requirementsUploaded + req.requirementsGenerated;
    const totalRequired   = req.requirementsTotal + events.totalActs;
    const totalSatisfied  = requirementsSatisfied + events.totalSatisfied;
    const totalMissing    = totalRequired - totalSatisfied;
    const totalUploaded   = req.requirementsUploaded   + events.eventsUploaded;
    const totalGenerated  = req.requirementsGenerated  + events.eventsGenerated;
    // See the contract note above for why a requirements-only term is subtracted from a
    // combined one. The four display counts close on the total:
    //   totalUploaded + totalGenerated + totalToGenerate + totalUpcoming === totalRequired
    // — algebraically, not by coincidence: both engines count satisfied rows as exactly
    // téléversé + généré (event-completeness iterates the same `acts` array with no
    // filter), so uploaded + generated === totalSatisfied and the rest is totalMissing.
    const totalUpcoming   = req.requirementsUpcoming;
    const totalToGenerate = totalMissing - req.requirementsUpcoming;

    const response: CompletenessResponse = {
      score: combinedScore,
      totalRequired,
      totalSatisfied,
      totalMissing,
      totalUploaded,
      totalGenerated,
      totalUpcoming,
      totalToGenerate,
      checklist: req.checklist,
      fiscalYears: req.fiscalYears,
      requirementsScore,
      eventsScore,
      combinedScore,
      eventActsTotal: events.totalActs,
      eventActsSatisfied: events.totalSatisfied,
      holdYears,
      upcoming: req.upcoming + events.upcoming,
      overdueRegularize: req.overdueRegularize + events.overdueRegularize,
      overdueProlonged: req.overdueProlonged + events.overdueProlonged,
      acts: events.acts,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error calculating completeness:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
