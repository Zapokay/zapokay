export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentTypePill } from '@/components/documents/DocumentTypePill';
import { LanguageBadge } from '@/components/documents/LanguageBadge';
import { calculateComplianceItems } from '@/lib/compliance/calculateComplianceItems';
import { getActiveYears } from '@/lib/active-years';
import { getOldestGap } from '@/lib/priority';
import { GapAnalysisPanel } from '@/components/ai/GapAnalysisPanel';
import MinuteBookCard from '@/components/dashboard/MinuteBookCard'
import { LegalTerm } from '@/components/ui/LegalTerm';

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
  const incYear = new Date(incorporationDate).getFullYear()
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

// ─── Static descriptions per rule_key ─────────────────────────────────────────

const ACTION_DESCRIPTIONS: Record<string, { fr: string; en: string }> = {
  annual_board_resolution: {
    fr: "Adopter et consigner la résolution du conseil",
    en: "Adopt and record the board resolution",
  },
  annual_shareholder_resolution: {
    fr: "Tenir l'assemblée annuelle des actionnaires",
    en: "Hold the annual shareholders meeting",
  },
  annual_financial_statements: {
    fr: "Préparer et approuver les états financiers",
    en: "Prepare and approve financial statements",
  },
  auditor_waiver: {
    fr: "Faire signer la renonciation à l'auditeur",
    en: "Obtain signed auditor waiver",
  },
  req_annual_update: {
    fr: "Déposer la mise à jour annuelle au REQ",
    en: "File annual update with the REQ",
  },
  corporations_canada_annual_return: {
    fr: "Déposer le rapport annuel à Corporations Canada",
    en: "File annual return with Corporations Canada",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fiscalYearLabel(
  company: { fiscal_year_end_month?: number | null; fiscal_year_end_day?: number | null } | null
): string {
  if (!company?.fiscal_year_end_month) return '—';
  const today = new Date();
  const fyEndMonth = company.fiscal_year_end_month;
  const fyEndDay = company.fiscal_year_end_day ?? 31;
  let fyStart = new Date(today.getFullYear(), fyEndMonth - 1, fyEndDay);
  if (fyStart > today) {
    fyStart = new Date(today.getFullYear() - 1, fyEndMonth - 1, fyEndDay);
  }
  return `${fyStart.getFullYear()}–${fyStart.getFullYear() + 1}`;
}

function formatDueDate(dateStr: string | null, fr: boolean): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(fr ? 'fr-CA' : 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg bg-[var(--hover)] flex items-center justify-center text-[var(--text-muted)]">
          {icon}
        </div>
      </div>
      <div
        className="text-2xl font-bold text-[var(--text-heading)]"
        style={{ fontFamily: 'Sora, sans-serif' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  const activeYears = company ? await getActiveYears(company.id, supabase) : [];
  const complianceResult = company
    ? await calculateComplianceItems(company.id, supabase, undefined, activeYears)
    : null;

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', company?.id ?? '')
    .order('created_at', { ascending: false });

  const allDocs = documents ?? [];
  const recentDocs = allDocs.slice(0, 5);

  // Fetch tracked fiscal years from company_fiscal_years
  const { data: trackedFiscalYears } = company
    ? await supabase
        .from('company_fiscal_years')
        .select('year, status')
        .eq('company_id', company.id)
        .eq('status', 'active')
        .order('year', { ascending: false })
    : { data: [] };

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

  const fr = locale === 'fr';
  const firstName = profile.full_name?.split(' ')[0] ?? '';

  // Compliance derived data
  const urgentCount    = complianceResult?.urgentCount    ?? 0;
  const pendingCount   = complianceResult?.pendingCount   ?? 0;
  const compliantCount = complianceResult?.compliantCount ?? 0;
  const percentage     = complianceResult?.percentage     ?? 0;
  const total          = complianceResult?.items.length   ?? 0;
  const actionItems    = complianceResult?.items.filter(i => i.status === 'required' || i.status === 'pending') ?? [];
  const actionCount    = urgentCount + pendingCount;
  const frameworkLabel = company?.incorporation_type === 'CBCA' ? 'CBCA' : 'LSAQ';
  const fyLabel        = fiscalYearLabel(company);

  // Prochaine échéance — fed by getOldestGap (foundational first, then oldest active year)
  const nextGap = company ? await getOldestGap(company.id, supabase) : null;

  return (
    <DashboardShell locale={locale} profile={profile} company={company} urgentCount={urgentCount}>
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

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                              href={`/${locale}/dashboard/wizard?year=${entry.year}`}
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
          <StatCard
            label={fr ? 'Taux de conformité' : 'Compliance rate'}
            value={complianceResult ? `${percentage}%` : '—'}
            sub={fr ? 'obligations remplies' : 'obligations met'}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
          {/* Prochaine échéance — stat card (fed by getOldestGap) */}
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
              bigValueNode = fr ? nextGap.titleFr : nextGap.titleEn;
              bigValueClass = 'text-lg font-bold text-[var(--text-heading)] leading-snug';
            } else if (isAnnual && nextGap) {
              if (nextGap.dueDate) {
                bigValueNode = new Date(nextGap.dueDate + 'T00:00:00').toLocaleDateString(
                  fr ? 'fr-CA' : 'en-CA',
                  { month: 'short', day: 'numeric', year: 'numeric' }
                );
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
              subtitle = fr ? nextGap.titleFr : nextGap.titleEn;
            } else if (isComplete) {
              subtitle = fr ? 'Tout est en ordre' : 'All in order';
            } else {
              subtitle = fr ? 'Aucune échéance à venir' : 'No upcoming deadlines';
            }

            return (
              <Link
                href={`/${locale}/dashboard/minute-book`}
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

        {/* MinuteBook card */}
        {company && <MinuteBookCard />}

        {/* Gap Analysis Panel — full width, between stat cards and main content */}
        {company && (
          <GapAnalysisPanel companyId={company.id} locale={locale as 'fr' | 'en'} />
        )}

        {/* Main content — grille 3 colonnes stricte */}
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
                  href={`/${locale}/dashboard/documents`}
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
                    href={`/${locale}/dashboard/documents`}
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
                      href={`/${locale}/dashboard/documents`}
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

            {/* Block 1 — Actions requises (required + pending) */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-sm font-bold text-[var(--text-heading)]"
                  style={{ fontFamily: 'Sora, sans-serif' }}
                >
                  {fr ? `Actions requises (${actionCount})` : `Required actions (${actionCount})`}
                </h2>
                <Link
                  href={`/${locale}/dashboard/compliance`}
                  className="text-xs font-medium text-[var(--text-link)] hover:underline"
                >
                  {fr ? 'Voir tout →' : 'View all →'}
                </Link>
              </div>

              {actionCount === 0 && percentage === 100 ? (
                <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>
                  {fr ? 'Tout est en ordre ✓' : 'Everything is in order ✓'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {actionItems.map(item => {
                    const title = fr ? item.rule.title_fr : item.rule.title_en;
                    const dueFormatted = formatDueDate(item.due_date, fr);
                    const isRequired = item.status === 'required';
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg p-3"
                        style={{
                          backgroundColor: isRequired ? 'var(--error-bg)' : 'var(--warning-bg)',
                          borderLeft: `3px solid ${isRequired ? 'var(--error-border)' : 'var(--warning-border)'}`,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                            style={
                              isRequired
                                ? { backgroundColor: 'var(--error-border)', color: 'var(--error-text)' }
                                : { backgroundColor: 'var(--warning-border)', color: 'var(--warning-text)' }
                            }
                          >
                            {isRequired ? 'URGENT' : (fr ? 'À VENIR' : 'UPCOMING')}
                          </span>
                          <p
                            className="text-xs font-bold truncate"
                            style={{
                              fontFamily: 'Sora, sans-serif',
                              color: isRequired ? 'var(--error-text)' : 'var(--text-heading)',
                            }}
                          >
                            {title}
                          </p>
                        </div>
                        <p
                          className="text-xs font-medium"
                          style={{ color: isRequired ? 'var(--error-text)' : 'var(--warning-text)' }}
                        >
                          {fr ? `Dû le ${dueFormatted}` : `Due ${dueFormatted}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Block 2 — Conformité */}
            {complianceResult && total > 0 && (
              <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <h2
                    className="text-sm font-bold text-[var(--text-heading)]"
                    style={{ fontFamily: 'Sora, sans-serif' }}
                  >
                    {fr
                      ? <>Conformité <LegalTerm termKey={frameworkLabel === 'CBCA' ? 'cbca' : 'lsaq'} lang="fr" /></>
                      : <><LegalTerm termKey={frameworkLabel === 'CBCA' ? 'cbca' : 'lsaq'} lang="en" /> Compliance</>}
                  </h2>
                  <Link
                    href={`/${locale}/dashboard/compliance`}
                    className="text-xs font-medium text-[var(--text-link)] hover:underline"
                  >
                    {fr ? 'Détails →' : 'Details →'}
                  </Link>
                </div>

                {/* Big percentage */}
                <div
                  className="leading-none"
                  style={{
                    fontFamily: 'Sora, sans-serif',
                    fontWeight: 800,
                    fontSize: '48px',
                    color: 'var(--text-heading)',
                  }}
                >
                  {percentage}%
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
                  {fr ? `Exercice ${fyLabel}` : `Fiscal year ${fyLabel}`}
                </p>

                {/* Progress bar */}
                <div className="h-2 rounded-full mb-4" style={{ backgroundColor: 'var(--card-border)' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${percentage}%`, backgroundColor: 'var(--amber-400)' }}
                  />
                </div>

                {/* Stats */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--success-text)' }}>
                      {fr ? 'Complétés' : 'Completed'}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--success-text)' }}>
                      {compliantCount}/{total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--warning-text)' }}>
                      {fr ? 'En attente' : 'Pending'}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--warning-text)' }}>
                      {pendingCount}/{total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--error-text)' }}>
                      {fr ? 'À corriger' : 'To fix'}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--error-text)' }}>
                      {urgentCount}/{total}
                    </span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
