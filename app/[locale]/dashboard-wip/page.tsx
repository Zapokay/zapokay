export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * A3 board — WIP workshop surface (NOT linked in nav). Renders the shipped A3
 * engine on real company data so the ranked ORDER can be sanity-checked before
 * Aria styling (PART 2). Parallel to /dashboard, which stays untouched.
 *
 * PART 1: assemble the ranked stream (all three feeders → mergeObligations →
 * rankObligations) and render a plain unstyled list. No i18n yet; REQ titles
 * (null in the contract) show a [REQ:<docKey>] placeholder.
 */

import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { computeRequirementCompleteness } from '@/lib/minute-book/requirement-completeness';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';
import { deriveDocKey } from '@/lib/obligations/derive-dockey';
import { completenessToObligations } from '@/lib/obligations/feeders/completeness';
import { deadlineObligations } from '@/lib/obligations/feeders/deadlines';
import { reqObligations } from '@/lib/obligations/feeders/req';
import { mergeObligations } from '@/lib/obligations/aggregate';
import { rankObligations } from '@/lib/obligations/rank';
import { parseLocalDate } from '@/lib/utils';

export default async function DashboardWipPage({
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

  if (!company) {
    return <main style={{ padding: 24, fontFamily: 'monospace' }}>No active company.</main>;
  }

  const framework: 'LSA' | 'CBCA' = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';
  const fyEndMonth: number = company.fiscal_year_end_month ?? 12;
  const fyEndDay: number = company.fiscal_year_end_day ?? 31;
  const incorporationDate: string | null = company.incorporation_date ?? null;
  const today = new Date();

  // ── Feeder 1 (completeness) — reuse computeRequirementCompleteness, the same
  //    lib the /api/minute-book/completeness route + MinuteBookCard consume. ───
  const completeness = await computeRequirementCompleteness(
    supabase,
    company.id,
    framework,
    fyEndMonth,
    fyEndDay,
  );
  // RE-200 presumed-done flag (Harvey 2026-07-05, Option 1): a company with any
  // CERTIFIED (satisfied) annual filing for a year strictly after incorporation has
  // necessarily initialized its founding REQ dossier — so NEITHER the deadline feeder
  // NOR the completeness feeder should surface the initial declaration as a board
  // action. Computed here (the record-aware layer) and passed to both record-agnostic
  // feeders as one honest boolean. Strict on purpose: `satisfied` (a real filing
  // exists) AND year > incYear.
  const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;
  const hasLaterAnnualFiling =
    incYear !== null &&
    completeness.checklist.some((i) => i.satisfied && i.year != null && i.year > incYear);

  const completenessObs = completenessToObligations(completeness.checklist, today, hasLaterAnnualFiling);

  // ── Feeder 3 (deadline) — reuse `company`. immatriculationDate: incorporation
  //    date as the QC proxy (banked gap; no dedicated column exists). ──────────
  const deadlineObs = deadlineObligations(
    {
      framework,
      fyEndMonth,
      fyEndDay,
      incorporationDate,
      immatriculationDate: incorporationDate,
      hasLaterAnnualFiling,
    },
    today,
  );

  // ── Feeder 2 (REQ) — event acts + the extracted deriveDocKey. eventId is
  //    composed from (type, id, phase) so appointment + departure of the same
  //    mandate don't collide on the Obligation id (both would map to REQ). ─────
  const events = await computeEventCompleteness(supabase, company.id, incorporationDate);
  const reqObs = events.acts.flatMap((act) => {
    const derivation = deriveDocKey(act);
    if (!derivation) return [];
    return reqObligations(
      {
        docKey: derivation.docKey,
        eventDate: act.date,
        eventId: `${act.event_type}:${act.event_id}:${act.event_phase}`,
      },
      today,
    );
  });

  const merged = mergeObligations(completenessObs, deadlineObs, reqObs);
  const ranked = rankObligations(merged, today);

  return (
    <main style={{ padding: 24, fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        A3 board WIP — ranked obligations
      </h1>
      <p style={{ color: '#666', margin: 0 }}>
        {company.legal_name_fr} · {framework} · FY-end {fyEndMonth}/{fyEndDay} · today {today.toISOString().slice(0, 10)}
      </p>
      <p style={{ color: '#666', marginTop: 4, marginBottom: 16 }}>
        feeders → completeness {completenessObs.length} · deadline {deadlineObs.length} · req {reqObs.length}
        {' · merged '}{merged.length}{' · ranked '}{ranked.length}{' (satisfied excluded)'}
      </p>
      <ol style={{ paddingLeft: 28, margin: 0 }}>
        {ranked.map((o) => (
          <li key={o.id} style={{ marginBottom: 6 }}>
            <code style={{ color: '#333' }}>
              #{o.rank} · score {o.score.toFixed(3)} · [{o.status}] · {o.liveness} · {o.exposure} · {o.actionKind} · d={o.daysUntilDue ?? '—'} · {o.source}
            </code>
            {' — '}
            {o.titleFr ?? `[REQ:${o.docKey}]`}
          </li>
        ))}
      </ol>
      {ranked.length === 0 && (
        <p style={{ marginTop: 12 }}>No actionable obligations (all satisfied, or none emitted).</p>
      )}
    </main>
  );
}
