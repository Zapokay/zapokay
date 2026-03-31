import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentTypePill } from '@/components/documents/DocumentTypePill';
import { LanguageBadge } from '@/components/documents/LanguageBadge';
import { calculateComplianceItems } from '@/lib/compliance/calculateComplianceItems';
import ComplianceItemCard from '@/components/compliance/ComplianceItemCard';

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
        <div className="w-8 h-8 rounded-lg bg-[var(--info-bg)] flex items-center justify-center text-[var(--info-text)]">
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

  const complianceResult = company
    ? await calculateComplianceItems(company.id, supabase)
    : null;

  const urgentItems = complianceResult?.items.filter(i => i.status === 'required').slice(0, 2) ?? [];

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', company?.id ?? '')
    .order('created_at', { ascending: false });

  const allDocs = documents ?? [];
  const totalDocs = allDocs.length;

  const now = new Date();
  const thisMonth = allDocs.filter(d => {
    const date = new Date(d.created_at);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  }).length;

  const uniqueTypes = new Set(allDocs.map(d => d.document_type)).size;
  const recentDocs = allDocs.slice(0, 5);

  const fr = locale === 'fr';
  const firstName = profile.full_name?.split(' ')[0] ?? '';

  return (
    <DashboardShell locale={locale} profile={profile} company={company} urgentCount={complianceResult?.urgentCount ?? 0}>
      <div className="space-y-8">

        {/* Greeting */}
        <div>
          <h1
            className="text-2xl font-bold text-[var(--text-heading)]"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {fr ? `Bonjour, ${firstName}` : `Hello, ${firstName}`}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {company?.legal_name_fr ?? (fr ? 'Votre entreprise' : 'Your company')}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label={fr ? 'Documents' : 'Documents'}
            value={totalDocs}
            sub={fr ? 'dans le coffre-fort' : 'in the vault'}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <StatCard
            label={fr ? 'Taux de conformité' : 'Compliance rate'}
            value={complianceResult ? `${complianceResult.percentage}%` : '—'}
            sub={fr ? 'obligations remplies' : 'obligations met'}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 shadow-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {fr ? 'Actions requises' : 'Required actions'}
              </span>
              <div className="w-8 h-8 rounded-lg bg-[var(--info-bg)] flex items-center justify-center text-[var(--info-text)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-2xl font-bold text-[var(--text-heading)]"
                style={{ fontFamily: 'Sora, sans-serif' }}
              >
                {complianceResult?.urgentCount ?? 0}
              </span>
              {(complianceResult?.urgentCount ?? 0) > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#C9A5A5', color: '#6B1E1E' }}
                >
                  !
                </span>
              )}
            </div>
            <div className="text-xs mt-1">
              <Link href={`/${locale}/dashboard/compliance`} className="text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors no-underline">
                {fr ? 'voir la conformité →' : 'view compliance →'}
              </Link>
            </div>
          </div>
        </div>

        {/* Recent documents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-base font-semibold text-[var(--text-heading)]"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {fr ? 'Documents récents' : 'Recent documents'}
            </h2>
            <Link
              href={`/${locale}/dashboard/documents`}
              className="text-sm font-medium text-[var(--text-link)] hover:underline"
            >
              {fr ? 'Voir tout →' : 'View all →'}
            </Link>
          </div>

          {recentDocs.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center">
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
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden shadow-md">
              {recentDocs.map((doc, i) => (
                <Link
                  key={doc.id}
                  href={`/${locale}/dashboard/documents`}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--page-bg)] transition-colors ${
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

        {urgentItems.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-bold uppercase tracking-wider"
                style={{
                  fontFamily: "'Sora', sans-serif",
                  color: '#6B1E1E',
                  letterSpacing: '0.08em',
                }}
              >
                ⚡ {fr ? 'Actions urgentes' : 'Urgent actions'}
              </h2>
              <Link
                href={`/${locale}/dashboard/compliance`}
                className="text-xs font-semibold underline-offset-2 underline"
                style={{ color: '#4A6B93' }}
              >
                {fr ? 'Voir tout →' : 'View all →'}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {urgentItems.map(item => (
                <ComplianceItemCard
                  key={item.id}
                  item={item}
                  locale={locale as 'fr' | 'en'}
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </DashboardShell>
  );
}
