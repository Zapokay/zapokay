export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { GapAnalysisPanel } from '@/components/ai/GapAnalysisPanel';
import { parseLocalDate } from '@/lib/utils';
// ── A3 board engine (ported from the former /dashboard-wip dev route). parseLocalDate already imported above. ──
import { computeRequirementCompleteness } from '@/lib/minute-book/requirement-completeness';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';
import { computeHoldYears } from '@/lib/minute-book/hold-years';
import { completenessToObligations } from '@/lib/obligations/feeders/completeness';
import { deadlineObligations, ANNUAL_MEETING_RECORD_KEYS } from '@/lib/obligations/feeders/deadlines';
import { eventsToObligations } from '@/lib/obligations/feeders/events';
import { mergeObligations } from '@/lib/obligations/aggregate';
import { rankObligations } from '@/lib/obligations/rank';
import { bookCurrencyCap, obligationFiscalYear } from '@/lib/obligations/obligation-registry';
import A3Board from '@/components/dashboard/A3Board';
import StatusVerdict from '@/components/dashboard/StatusVerdict';
import InventoryLine from '@/components/minute-book/InventoryLine';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const supabase = createClient();

  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();


  // ─── A3 board assembly ────────────────────────────────────────────────────
  // Ported from the former /dashboard-wip dev route, adapted to the nullable `company` + the server
  // client already loaded above (no second company load, no early return).
  let ranked: Awaited<ReturnType<typeof rankObligations>> = [];
  let progress = { done: 0, total: 0 };
  // Completeness liveness aggregates (hoisted like ranked/progress — assigned in the
  // if(company) block). 0 defaults → no-company falls to en_regle. Verdict STATE +
  // metrics both source from these (Dom: all numbers from completeness).
  let cUpcoming = 0;
  let cRegularize = 0;
  let cProlonged = 0;
  let invTotal = 0;
  let invUploaded = 0;
  let invGenerated = 0;
  let invMissing = 0;
  let invArchived = 0;

  if (company) {
    const today = new Date();
    const framework: 'LSA' | 'CBCA' = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
    const fyEndMonth: number = company.fiscal_year_end_month ?? 12;
    const fyEndDay: number = company.fiscal_year_end_day ?? 31;
    const incorporationDate: string | null = company.incorporation_date ?? null;

    // Feeder 1 (completeness) — the shared engine the /api completeness route
    // also consumes; ADD it here (the dashboard lacked it).
    const completeness = await computeRequirementCompleteness(
      supabase,
      company.id,
      framework,
      fyEndMonth,
      fyEndDay,
      incorporationDate,
    );
    cUpcoming = completeness.upcoming;
    cRegularize = completeness.overdueRegularize;
    cProlonged = completeness.overdueProlonged;

    // RE-200 presumed-done flag — identical logic to the former /dashboard-wip dev route. Strict:
    // a real (satisfied) annual filing for a year strictly after incorporation.
    const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;
    const hasLaterAnnualFiling =
      incYear !== null &&
      completeness.checklist.some((i) => i.satisfied && i.year != null && i.year > incYear);

    // THE BOOK-CURRENCY CAP — one date per company, computed once here where the three
    // inputs already are (no extra query), and handed to the feeder as a parameter so
    // the feeder stays pure. Never re-derived per row. Rule + rationale:
    // bookCurrencyCap in obligation-registry.ts.
    const cap = bookCurrencyCap(fyEndMonth, fyEndDay, incorporationDate, today);

    const completenessObs = completenessToObligations(
      completeness.checklist, today, hasLaterAnnualFiling, incYear, cap);

    // Federal-return clear-gate: is the CURRENT-FY cbca_annual_return receipt already
    // uploaded? Derived from the checklist already in hand (no extra query).
    // LOCKSTEP: this calls the SAME function the feeder uses for the fed row's
    // attach-key (obligationFiscalYear), not a re-derivation of it — the gate matches on
    // (requirement_key, year), so if the two ever named different years the receipt
    // would attach to one row while the gate watched another and the row could never
    // clear. Sharing the function makes them definitionally identical, including the
    // first-year case where no fiscal year has closed yet.
    const fyYear = obligationFiscalYear(fyEndMonth, fyEndDay, incorporationDate, today);
    const currentFedReturnFiled = completeness.checklist.some(
      (i) => i.requirement_key === 'cbca_annual_return' && i.year === fyYear && i.satisfied,
    );

    // FIRST-annual-meeting proxy, condition (1): has an annual shareholders'
    // resolution EVER been recorded, for any year? We track no meeting DATE, so this
    // is the closest available fact. Derived from the checklist already in hand (no
    // new query) — same as hasLaterAnnualFiling / currentFedReturnFiled, and the reason
    // widening the feeder's input costs nothing: the caller already holds the records.
    // The feeder stays PURE (it performs no I/O) but it is no longer record-agnostic —
    // as of A4 phase 3 it receives the checklist itself. See CompanyComplianceInput.
    // Condition (2) — inc+18mo still in the future, the Wick guard — is applied
    // INSIDE the feeder, which already holds incorporationDate and today.
    const noPriorAnnualMeetingRecorded = !completeness.checklist.some(
      (i) => i.satisfied && ANNUAL_MEETING_RECORD_KEYS.includes(i.requirement_key),
    );

    // Feeder 3 (deadline) — immatriculationDate uses incorporation date as QC proxy.
    const deadlineObs = deadlineObligations(
      {
        framework,
        fyEndMonth,
        fyEndDay,
        incorporationDate,
        immatriculationDate: incorporationDate,
        // A4 phase 3 — the records themselves, both already in hand above. UNREAD by the
        // feeder; A4 phase 4's generic loop is what consumes them. The three booleans
        // below are projections of this same checklist and phase 4 deletes them.
        checklist: completeness.checklist,
        fiscalYears: completeness.fiscalYears,
        hasLaterAnnualFiling,
        currentFedReturnFiled,
        noPriorAnnualMeetingRecorded,
      },
      today,
    );

    // Feeder 2 (event) — event acts → eventsToObligations (Stage 1 doc + Stage 2
    // REQ filing). Replaces the old ungated reqObs (Finding ① — it emitted the
    // Stage-2 filing regardless of whether the resolution document existed yet).
    const events = await computeEventCompleteness(supabase, company.id, incorporationDate);
    // Fold events into the verdict aggregates so the dashboard matches Complétude.
    // 0ee6dc4 folded events into the /api completeness route (which the Complétude
    // page reads) but NOT this server component, which stayed req-only — the
    // divergence this fixes. No new fetch: `events` is already awaited above.
    cUpcoming   += events.upcoming;
    cRegularize += events.overdueRegularize;
    cProlonged  += events.overdueProlonged;
    const holdYears = await computeHoldYears(supabase, company.id);
    invTotal = completeness.requirementsTotal + events.totalActs;
    invUploaded = completeness.requirementsUploaded + events.eventsUploaded;
    invGenerated = completeness.requirementsGenerated + events.eventsGenerated;
    invMissing = completeness.requirementsMissing + events.totalMissing;
    invArchived = (holdYears ?? []).reduce((s, hy) => s + hy.documents.length, 0);
    const eventObs = eventsToObligations(events.acts, today);

    const merged = mergeObligations(completenessObs, deadlineObs, eventObs);
    ranked = rankObligations(merged, today, framework);
    progress = {
      done: completeness.checklist.filter((i) => i.satisfied).length,
      total: completeness.checklist.length,
    };
  }

  // Verdict STATE from completeness (one source with the metrics). Boundary B —
  // keyed on OVERDUE only, so upcoming-but-not-overdue stays en_regle.
  const completenessVerdict: 'en_regle' | 'attention' | 'defaut_prolonge' =
    cProlonged > 0 ? 'defaut_prolonge'
    : cRegularize > 0 ? 'attention'
    : 'en_regle';

  const fr = locale === 'fr';
  const firstName = profile.full_name?.split(' ')[0] ?? '';

  return (
    <DashboardShell locale={locale} profile={profile} company={company} urgentCount={0}>
      <div className="space-y-8">

        {/* Greeting */}
        <div>
          <h1
            className="text-2xl font-bold text-[var(--text-heading)]"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {fr ? `Bonjour, ${firstName}` : `Hello, ${firstName}`}
          </h1>
        </div>

        {/* Status verdict — "suis-je correct?" headline; leads the body, above the board (Aria's vision) */}
        <StatusVerdict
          verdict={completenessVerdict}
          upcoming={cUpcoming}
          regularize={cRegularize}
          prolonged={cProlonged}
        />

        {/* Inventory line - middle layer; same component + numbers as the Completude page */}
        <InventoryLine
          total={invTotal}
          uploaded={invUploaded}
          generated={invGenerated}
          missing={invMissing}
          archived={invArchived}
        />

        {/* A3 board — "quoi faire maintenant"; the board follows the verdict */}
        {company && <A3Board ranked={ranked} progress={progress} companyId={company.id} documentLanguage={(profile.preferred_language as 'fr' | 'en') ?? 'fr'} framework={company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'} />}


        {/* Gap Analysis Panel — full width, between stat cards and main content */}
        {company && (
          <GapAnalysisPanel companyId={company.id} locale={locale as 'fr' | 'en'} />
        )}


      </div>
    </DashboardShell>
  );
}
