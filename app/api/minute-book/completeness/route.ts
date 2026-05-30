import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeRequirementCompleteness,
  type ChecklistItem,
} from '@/lib/minute-book/requirement-completeness';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';

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

    const [req, events] = await Promise.all([
      computeRequirementCompleteness(
        supabase,
        company.id as string,
        framework,
        fyEndMonth,
        fyEndDay,
      ),
      computeEventCompleteness(
        supabase,
        company.id as string,
        (company.incorporation_date as string | null) ?? null,
      ),
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

    const response: CompletenessResponse = {
      score: combinedScore,
      totalRequired,
      totalSatisfied,
      totalMissing,
      totalUploaded,
      totalGenerated,
      checklist: req.checklist,
      fiscalYears: req.fiscalYears,
      requirementsScore,
      eventsScore,
      combinedScore,
      eventActsTotal: events.totalActs,
      eventActsSatisfied: events.totalSatisfied,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error calculating completeness:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
