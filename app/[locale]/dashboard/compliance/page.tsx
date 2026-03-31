import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { calculateComplianceItems } from '@/lib/compliance/calculateComplianceItems'
import FiscalYearForm from '@/components/compliance/FiscalYearForm'
import ComplianceGauge from '@/components/compliance/ComplianceGauge'
import ComplianceItemCard from '@/components/compliance/ComplianceItemCard'
import ComplianceUploadRedirect from '@/components/compliance/ComplianceUploadRedirect'

// ─── Types page ───────────────────────────────────────────────────────────────

interface PageProps {
  params: { locale: string }
}

// ─── Server Component ─────────────────────────────────────────────────────────

export default async function CompliancePage({ params }: PageProps) {
  const locale = (params.locale === 'en' ? 'en' : 'fr') as 'fr' | 'en'
  const t = await getTranslations({ locale, namespace: 'compliance' })

  const supabase = createClient()

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  // Profil utilisateur (requis par DashboardShell)
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  // Entreprise active
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

  // Calculer la conformité (côté serveur)
  const result = await calculateComplianceItems(company.id, supabase)

  const companyName = locale === 'fr'
    ? (company.legal_name_fr ?? company.legal_name_en)
    : (company.legal_name_en ?? company.legal_name_fr)

  const requiredItems  = result.items.filter(i => i.status === 'required')
  const pendingItems   = result.items.filter(i => i.status === 'pending')
  const compliantItems = result.items.filter(i => i.status === 'compliant')

  const hasAnyItems = result.items.length > 0
  const isEmptyState = !hasAnyItems && !result.needsFiscalYear

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      urgentCount={result.urgentCount}
    >
      <div className="max-w-3xl mx-auto">

        {/* ── Bandeau fiscal year manquant ───────────────────────────────── */}
        {result.needsFiscalYear && (
          <div className="mb-6">
            <div
              className="flex items-center px-5 py-3 rounded-xl"
              style={{ backgroundColor: '#070E1C', color: 'white' }}
            >
              <p className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t('missingFiscalYear')}
              </p>
            </div>
            <FiscalYearForm companyId={company.id} locale={locale} />
          </div>
        )}

        {/* ── En-tête ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: '#A09589', letterSpacing: '0.1em' }}
            >
              {companyName}
            </p>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "'Sora', sans-serif", color: '#070E1C' }}
            >
              {t('title')}
            </h1>
            {!result.needsFiscalYear && hasAnyItems && (
              <p className="text-sm mt-1" style={{ color: '#7A7066' }}>
                {t('subtitle', {
                  compliant: result.compliantCount,
                  total: result.items.length,
                })}
              </p>
            )}
          </div>

          {/* Jauge */}
          {!result.needsFiscalYear && hasAnyItems && (
            <div className="flex-shrink-0">
              <ComplianceGauge percentage={result.percentage} size={120} />
            </div>
          )}
        </div>

        {/* ── État vide total ────────────────────────────────────────────── */}
        {isEmptyState && (
          <div className="text-center py-16 px-6">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
              style={{ backgroundColor: '#EEF1F7' }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path
                  d="M16 4a12 12 0 100 24A12 12 0 0016 4zm0 5v7m0 4h.01"
                  stroke="#4A6B93"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: "'Sora', sans-serif", color: '#070E1C' }}
            >
              {t('emptyTitle')}
            </h2>
            <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: '#7A7066' }}>
              {t('emptyDescription')}
            </p>
            <Link
              href={`/${locale}/dashboard/documents`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors"
              style={{
                backgroundColor: '#F5B91E',
                color: '#070E1C',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {t('uploadDocument')}
            </Link>
          </div>
        )}

        {/* ── Sections items ─────────────────────────────────────────────── */}
        {hasAnyItems && (
          <div className="flex flex-col gap-8">

            {/* Actions urgentes */}
            {requiredItems.length > 0 && (
              <section>
                <h2
                  className="text-sm font-bold uppercase tracking-wider mb-3"
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    color: '#6B1E1E',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('sectionRequired')} ({requiredItems.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {requiredItems.map(item => (
                    <ComplianceItemCard
                      key={item.id}
                      item={item}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* À venir */}
            {pendingItems.length > 0 && (
              <section>
                <h2
                  className="text-sm font-bold uppercase tracking-wider mb-3"
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    color: '#7A5804',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('sectionPending')} ({pendingItems.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {pendingItems.map(item => (
                    <ComplianceItemCard
                      key={item.id}
                      item={item}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Complété */}
            {compliantItems.length > 0 && (
              <section>
                <h2
                  className="text-sm font-bold uppercase tracking-wider mb-3"
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    color: '#2E5425',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('sectionCompliant')} ({compliantItems.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {compliantItems.map(item => (
                    <ComplianceItemCard
                      key={item.id}
                      item={item}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* CTA amber — uniquement si actions requises */}
            {requiredItems.length > 0 && (
              <div className="pt-2">
                <ComplianceUploadRedirect locale={locale} label={t('uploadDocument')} />
              </div>
            )}

          </div>
        )}

      </div>
    </DashboardShell>
  )
}
