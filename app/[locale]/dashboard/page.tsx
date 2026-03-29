import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DocumentTypePill } from '@/components/documents/DocumentTypePill';
import { LanguageBadge } from '@/components/documents/LanguageBadge';

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
    <DashboardShell locale={locale} profile={profile} company={company}>
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
            label={fr ? 'Ajoutés ce mois' : 'Added this month'}
            value={thisMonth}
            sub={fr ? 'nouveaux documents' : 'new documents'}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M12 4v16m8-8H4" />
              </svg>
            }
          />
          <StatCard
            label={fr ? 'Types différents' : 'Document types'}
            value={uniqueTypes}
            sub={fr ? 'catégories utilisées' : 'categories used'}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M7 7h.01M7 3h5l2 2h5a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h2z" />
              </svg>
            }
          />
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

      </div>
    </DashboardShell>
  );
}
