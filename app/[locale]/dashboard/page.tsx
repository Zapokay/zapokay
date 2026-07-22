export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentTypePill } from '@/components/documents/DocumentTypePill';
import { LanguageBadge } from '@/components/documents/LanguageBadge';
import { getGaps, type UrgentGap } from '@/lib/priority';
import { GapAnalysisPanel } from '@/components/ai/GapAnalysisPanel';
import MinuteBookCard from '@/components/dashboard/MinuteBookCard'
import { formatDate, parseLocalDate } from '@/lib/utils';
// ── A3 board engine (ported from the former /dashboard-wip dev route). parseLocalDate already imported above. ──
import { computeRequirementCompleteness } from '@/lib/minute-book/requirement-completeness';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';
import { computeHoldYears } from '@/lib/minute-book/hold-years';
import { completenessToObligations } from '@/lib/obligations/feeders/completeness';
import { deadlineObligations } from '@/lib/obligations/feeders/deadlines';
import { eventsToObligations } from '@/lib/obligations/feeders/events';
import { mergeObligations } from '@/lib/obligations/aggregate';
import { rankObligations } from '@/lib/obligations/rank';
import A3Board from '@/components/dashboard/A3Board';
import StatusVerdict from '@/components/dashboard/StatusVerdict';
import InventoryLine from '@/components/minute-book/InventoryLine';

// ─── Fiscal year history helper ───────────────────────────────────────────────

interface FiscalYearHistoryEntry {
  year: number
  hasBoard: boolean
  hasShareholder: boolean
  status: 'complete' | 'partial' | 'missing'
}

function computeFiscalYearHistory(
  incorporationDate: string | null,
  fyMonth: number,
  fyDay: number,
  docs: { document_type: string; document_year: number | null }[]
): FiscalYearHistoryEntry[] {
  if (!incorporationDate) return []
  const incYear = parseLocalDate(incorporationDate).getFullYear()
  const today = new Date()
  const lastFyEnd = new Date(today.getFullYear(), fyMonth - 1, fyDay)
  const lastCompletedYear = lastFyEnd <= today ? today.getFullYear() : today.getFullYear() - 1
  if (lastCompletedYear < incYear) return []

  const docsByYear: Record<number, Set<string>> = {}
  for (const doc of docs) {
    if (doc.document_year) {
      if (!docsByYear[doc.document_year]) docsByYear[doc.document_year] = new Set()
      docsByYear[doc.document_year].add(doc.document_type)
    }
  }

  const entries: FiscalYearHistoryEntry[] = []
  for (let yr = lastCompletedYear; yr >= Math.max(incYear, lastCompletedYear - 4); yr--) {
    const present = docsByYear[yr] ?? new Set<string>()
    const hasBoard = present.has('resolution')
    const hasShareholder = present.has('pv')
    let status: FiscalYearHistoryEntry['status']
    if (hasBoard && hasShareholder) status = 'complete'
    else if (hasBoard || hasShareholder) status = 'partial'
    else status = 'missing'
    entries.push({ year: yr, hasBoard, hasShareholder, status })
  }
  return entries
}

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

  // Independent reads, all gated only on company.id — run concurrently instead
  // of one-by-one. getGaps is computed ONCE here; nextGap is derived from its
  // result (was a second getOldestGap() call that re-ran the entire engine).
  const [documentsRes, fiscalYearsRes, gaps] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('company_id', company?.id ?? '')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    company
      ? supabase
          .from('company_fiscal_years')
          .select('year, status')
          .eq('company_id', company.id)
          .eq('status', 'active')
          .order('year', { ascending: false })
      : Promise.resolve({ data: [] as { year: number; status: string }[] }),
    company ? getGaps(company.id, supabase) : Promise.resolve<UrgentGap[]>([]),
  ]);

  const allDocs = documentsRes.data ?? [];
  const recentDocs = allDocs.slice(0, 5);
  const trackedFiscalYears = fiscalYearsRes.data;
  // Prochaine échéance — highest-priority gap = first of the already-ordered
  // getGaps result (foundational first, then oldest active year).
  const nextGap = gaps[0] ?? null;

  // Build history entries from tracked years + docs
  const docsByYear: Record<number, Set<string>> = {};
  for (const doc of allDocs) {
    const dy = (doc as Record<string, unknown>).document_year as number | null;
    const dt = (doc as Record<string, unknown>).document_type as string;
    if (dy) {
      if (!docsByYear[dy]) docsByYear[dy] = new Set();
      docsByYear[dy].add(dt);
    }
  }
  const fiscalYearHistory: FiscalYearHistoryEntry[] = (trackedFiscalYears ?? []).map(fy => {
    const present = docsByYear[fy.year] ?? new Set<string>();
    const hasBoard = present.has('resolution');
    const hasShareholder = present.has('pv');
    let status: FiscalYearHistoryEntry['status'];
    if (hasBoard && hasShareholder) status = 'complete';
    else if (hasBoard || hasShareholder) status = 'partial';
    else status = 'missing';
    return { year: fy.year, hasBoard, hasShareholder, status };
  });

  // ─── A3 board assembly ────────────────────────────────────────────────────
  // Ported from the former /dashboard-wip dev route, adapted to the nullable `company` + the server
  // client already loaded above (no second company load, no early return).
  // getGaps stays intact — Document Fondateur/Actions requises read it until
  // Step 2 hides them (flagged for later decommission).
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
    // + MinuteBookCard also consume; ADD it here (the dashboard lacked it).
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

    const completenessObs = completenessToObligations(completeness.checklist, today, hasLaterAnnualFiling);

    // Feeder 3 (deadline) — immatriculationDate uses incorporation date as QC proxy.
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
    ranked = rankObligations(merged, today);
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

  // Legacy dashboard body blocks superseded by the A3 board — hidden behind this
  // flag. Typed `boolean` (NOT the `false` literal) on purpose: a literal-false
  // gate marks the wrapped JSX unreachable and disables TS control-flow narrowing
  // inside it; `boolean` keeps it reachable so the hidden blocks still type-check.
  // Renders nothing at runtime. Pending decommission (see the five hidden-block markers).
  const SHOW_LEGACY_DASHBOARD_BLOCKS: boolean = false;

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

        {/* Stat cards */}
        {/* HIDDEN 2026-07-10 — dashboard vision rebuild (superseded by A3 board / verdict); pending decommission investigation. Block: Historique */}
        {/* HIDDEN 2026-07-10 — dashboard vision rebuild (superseded by A3 board / verdict); pending decommission investigation. Block: Document Fondateur */}
        {SHOW_LEGACY_DASHBOARD_BLOCKS && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Historique card — remplace la card Documents */}
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {fr ? 'Historique' : 'History'}
              </span>
              <div className="w-8 h-8 rounded-lg bg-[var(--hover)] flex items-center justify-center text-[var(--text-muted)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            {fiscalYearHistory.length === 0 ? (
              <div>
                <p className="text-sm text-[var(--text-muted)] mb-2">
                  {fr ? 'Aucun exercice configuré.' : 'No fiscal years configured.'}
                </p>
                <Link
                  href={`/${locale}/onboarding/fiscal-years`}
                  className="text-xs font-semibold no-underline px-2 py-1 rounded"
                  style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
                >
                  {fr ? 'Configurer →' : 'Configure →'}
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {fiscalYearHistory.map(entry => (
                  <div key={entry.year} className="flex items-center justify-between">
                    {(() => {
                      const currentYear = new Date().getFullYear()
                      const isCurrent = entry.year === currentYear
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}>
                              {entry.year}
                            </span>
                            {isCurrent ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--info-bg)', color: 'var(--info-text)' }}>
                                {fr ? 'En cours' : 'In progress'}
                              </span>
                            ) : (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={
                                  entry.status === 'complete'
                                    ? { backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' }
                                    : entry.status === 'partial'
                                    ? { backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)' }
                                    : { backgroundColor: 'var(--error-bg)', color: 'var(--error-text)' }
                                }
                              >
                                {entry.status === 'complete'
                                  ? (fr ? 'Complet' : 'Complete')
                                  : entry.status === 'partial'
                                  ? (fr ? 'Partiel' : 'Partial')
                                  : (fr ? 'Manquant' : 'Missing')}
                              </span>
                            )}
                          </div>
                          {!isCurrent && entry.status !== 'complete' && (
                            <Link
                              href={`/${locale}/dashboard/minute-book/completeness`}
                              className="text-[10px] font-semibold no-underline px-2 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
                            >
                              {fr ? 'Corriger' : 'Fix'}
                            </Link>
                          )}
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Prochaine échéance — stat card (fed by gaps[0]) */}
          {(() => {
            // Derive state-specific content
            const isFoundational = nextGap?.type === 'foundational';
            const isAnnual = nextGap?.type === 'annual';
            const isComplete = nextGap === null;

            const eyebrow = isFoundational
              ? (fr ? 'Document fondateur' : 'Foundational document')
              : isComplete
              ? (fr ? 'Conformité' : 'Compliance')
              : (fr ? 'Prochaine échéance' : 'Next deadline');

            const iconWrapperStyle = isFoundational
              ? { backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }
              : isComplete
              ? { backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' }
              : undefined;

            // Big value
            let bigValueNode: React.ReactNode;
            let bigValueClass = 'text-2xl font-bold text-[var(--text-heading)]';
            let bigValueStyle: React.CSSProperties = { fontFamily: 'Sora, sans-serif' };

            if (isFoundational && nextGap) {
              bigValueNode = profile.preferred_language === 'en' ? nextGap.titleEn : nextGap.titleFr;
              bigValueClass = 'text-lg font-bold text-[var(--text-heading)] leading-snug';
            } else if (isAnnual && nextGap) {
              if (nextGap.dueDate) {
                bigValueNode = formatDate(nextGap.dueDate, fr ? 'fr' : 'en', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
              } else {
                bigValueNode = fr ? `Exercice ${nextGap.year}` : `FY ${nextGap.year}`;
              }
            } else if (isComplete) {
              bigValueNode = '✓';
              bigValueStyle = { ...bigValueStyle, color: 'var(--success-text)' };
            } else {
              bigValueNode = '—';
            }

            // Subtitle
            let subtitle: string;
            if (isFoundational) {
              subtitle = fr ? 'À corriger en priorité' : 'Priority action';
            } else if (isAnnual && nextGap) {
              subtitle = profile.preferred_language === 'en' ? nextGap.titleEn : nextGap.titleFr;
            } else if (isComplete) {
              subtitle = fr ? 'Tout est en ordre' : 'All in order';
            } else {
              subtitle = fr ? 'Aucune échéance à venir' : 'No upcoming deadlines';
            }

            return (
              <Link
                href={`/${locale}/dashboard/minute-book/completeness`}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md hover:bg-[var(--hover)] hover:border-[var(--card-hover-border)] transition-colors block"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {eyebrow}
                  </span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={
                      iconWrapperStyle ?? {
                        backgroundColor: 'var(--hover)',
                        color: 'var(--text-muted)',
                      }
                    }
                  >
                    {isComplete ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}
                          d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isFoundational ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3L13.74 5a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className={bigValueClass} style={bigValueStyle}>
                  {bigValueNode}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 truncate">
                  {subtitle}
                </div>
              </Link>
            );
          })()}
        </div>
        )}

        {/* MinuteBook card */}
        {/* HIDDEN 2026-07-10 — dashboard vision rebuild (superseded by A3 board / verdict); pending decommission investigation. Block: Livre-de-minutes (34% card) */}
        {SHOW_LEGACY_DASHBOARD_BLOCKS && company && <MinuteBookCard />}

        {/* Gap Analysis Panel — full width, between stat cards and main content */}
        {company && (
          <GapAnalysisPanel companyId={company.id} locale={locale as 'fr' | 'en'} />
        )}

        {/* Main content — grille 3 colonnes stricte */}
        {/* HIDDEN 2026-07-10 — dashboard vision rebuild (superseded by A3 board / verdict); pending decommission investigation. Block: Documents récents */}
        {/* HIDDEN 2026-07-10 — dashboard vision rebuild (superseded by A3 board / verdict); pending decommission investigation. Block: Actions requises (21) */}
        {SHOW_LEGACY_DASHBOARD_BLOCKS && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: Documents récents — col-span-2, s'étire à la hauteur de la colonne droite */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-md flex-1 flex flex-col overflow-hidden">

              {/* Header à l'intérieur de la carte */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h2
                  className="text-sm font-bold text-[var(--text-heading)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {fr ? 'Documents récents' : 'Recent documents'}
                </h2>
                <Link
                  href={`/${locale}/dashboard/minute-book/documents`}
                  className="text-xs font-medium text-[var(--text-link)] hover:underline"
                >
                  {fr ? 'Voir tout →' : 'View all →'}
                </Link>
              </div>

              {recentDocs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    {fr ? "Aucun document pour l'instant." : 'No documents yet.'}
                  </p>
                  <Link
                    href={`/${locale}/dashboard/minute-book/documents`}
                    className="inline-block mt-3 text-sm font-medium text-[var(--text-link)] hover:underline"
                  >
                    {fr ? 'Ajouter votre premier document →' : 'Add your first document →'}
                  </Link>
                </div>
              ) : (
                <div>
                  {recentDocs.map((doc, i) => (
                    <Link
                      key={doc.id}
                      href={`/${locale}/dashboard/minute-book/documents`}
                      className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[var(--page-bg)] transition-colors ${
                        i < recentDocs.length - 1 ? 'border-b border-[var(--card-border)]' : ''
                      }`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <DocumentTypePill type={doc.document_type} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-body)] truncate">
                          {doc.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(doc.created_at).toLocaleDateString(
                            fr ? 'fr-CA' : 'en-CA',
                            { year: 'numeric', month: 'short', day: 'numeric' }
                          )}
                        </p>
                      </div>
                      <LanguageBadge language={doc.language} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: stacked blocks — col-span-1 */}
          <div className="flex flex-col gap-4">

            {/* Block 1 — Actions requises (missing documents from the canonical minute_book_requirements catalog) */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-sm font-bold text-[var(--text-heading)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {fr ? `Actions requises (${gaps.length})` : `Required actions (${gaps.length})`}
                </h2>
                <Link
                  href={`/${locale}/dashboard/minute-book/completeness`}
                  className="text-xs font-medium text-[var(--text-link)] hover:underline"
                >
                  {fr ? `Voir tout (${gaps.length}) →` : `View all (${gaps.length}) →`}
                </Link>
              </div>

              {gaps.length === 0 ? (
                <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>
                  {fr ? 'Tout est en ordre ✓' : 'Everything is in order ✓'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {gaps.slice(0, 5).map(gap => {
                    const title = profile.preferred_language === 'en' ? gap.titleEn : gap.titleFr;
                    const context =
                      gap.type === 'foundational'
                        ? (fr ? 'Document fondateur' : 'Foundational document')
                        : (fr ? `Exercice ${gap.year}` : `FY ${gap.year}`);
                    return (
                      <div
                        key={`${gap.requirementKey}-${gap.year ?? 'F'}`}
                        className="rounded-lg p-3"
                        style={{
                          backgroundColor: 'var(--hover)',
                          borderLeft: '3px solid var(--card-border)',
                        }}
                      >
                        <p
                          className="text-xs font-bold truncate"
                          style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
                        >
                          {title}
                        </p>
                        <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">
                          {context}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
        )}

      </div>
    </DashboardShell>
  );
}
