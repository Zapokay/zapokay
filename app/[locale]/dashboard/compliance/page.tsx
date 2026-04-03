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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fiscalYearLabel(
  company: { fiscal_year_end_month?: number | null; fiscal_year_end_day?: number | null } | null
): string {
  if (!company?.fiscal_year_end_month) return '—'
  const today = new Date()
  const fyEndMonth = company.fiscal_year_end_month
  const fyEndDay = company.fiscal_year_end_day ?? 31
  let fyStart = new Date(today.getFullYear(), fyEndMonth - 1, fyEndDay)
  if (fyStart > today) {
    fyStart = new Date(today.getFullYear() - 1, fyEndMonth - 1, fyEndDay)
  }
  return `${fyStart.getFullYear()}–${fyStart.getFullYear() + 1}`
}

// ─── Types page ───────────────────────────────────────────────────────────────

interface PageProps {
  params: { locale: string }
}

// ─── Section title styles ─────────────────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
}

// ─── Server Component ─────────────────────────────────────────────────────────

export default async function CompliancePage({ params }: PageProps) {
  const locale = (params.locale === 'en' ? 'en' : 'fr') as 'fr' | 'en'
  const t = await getTranslations({ locale, namespace: 'compliance' })
  const fr = locale === 'fr'

  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

  const result = await calculateComplianceItems(company.id, supabase)

  const requiredItems  = result.items.filter(i => i.status === 'required')
  const pendingItems   = result.items.filter(i => i.status === 'pending')
  const compliantItems = result.items.filter(i => i.status === 'compliant')

  const hasAnyItems  = result.items.length > 0
  const isEmptyState = !hasAnyItems && !result.needsFiscalYear

  const frameworkLabel = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSAQ'
  const fyLabel        = fiscalYearLabel(company)
  const total          = result.items.length

  const contentSubtitle = hasAnyItems && !result.needsFiscalYear
    ? `${frameworkLabel} · ${total} obligation${total > 1 ? 's' : ''} · ${fr ? 'Exercice' : 'Fiscal year'} ${fyLabel}`
    : frameworkLabel

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      urgentCount={result.urgentCount}
    >

      {/* ── En-tête de contenu ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h1
          className="text-2xl font-bold text-[var(--text-heading)]"
          style={{ fontFamily: 'Sora, sans-serif' }}
        >
          {fr ? 'Suivi de conformité' : 'Compliance tracker'}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {contentSubtitle}
        </p>
      </div>

      {/* ── Bandeau fiscal year manquant ───────────────────────────────────── */}
      {result.needsFiscalYear && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px',
              borderRadius: '12px',
              backgroundColor: '#070E1C',
              color: 'white',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}>
              {t('missingFiscalYear')}
            </p>
          </div>
          <FiscalYearForm companyId={company.id} locale={locale} />
        </div>
      )}

      {/* ── Ligne du haut : Jauge + Résumé ────────────────────────────────── */}
      {!result.needsFiscalYear && hasAnyItems && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: '16px',
          marginBottom: '24px',
        }}>

          {/* Carte jauge */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <ComplianceGauge percentage={result.percentage} size={120} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {fr ? `Exercice ${fyLabel}` : `Fiscal year ${fyLabel}`}
            </p>
          </div>

          {/* Carte résumé */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '12px',
          }}>
            <h3 style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              marginBottom: '4px',
            }}>
              {fr ? 'Résumé' : 'Summary'}
            </h3>

            {/* Complétés */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>✅</span>
                <span style={{ fontSize: '13px', color: '#2E5425' }}>
                  {fr ? 'Complétés' : 'Completed'}
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#2E5425' }}>
                {result.compliantCount}/{total}
              </span>
            </div>

            {/* En attente */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⏳</span>
                <span style={{ fontSize: '13px', color: '#7A5804' }}>
                  {fr ? 'En attente' : 'Pending'}
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#7A5804' }}>
                {result.pendingCount}/{total}
              </span>
            </div>

            {/* À corriger */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>❌</span>
                <span style={{ fontSize: '13px', color: '#6B1E1E' }}>
                  {fr ? 'À corriger' : 'To fix'}
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B1E1E' }}>
                {result.urgentCount}/{total}
              </span>
            </div>
          </div>

        </div>
      )}

      {/* ── État vide total ────────────────────────────────────────────────── */}
      {isEmptyState && (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#EEF1F7',
            marginBottom: '20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M16 4a12 12 0 100 24A12 12 0 0016 4zm0 5v7m0 4h.01"
                stroke="#4A6B93"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: '18px',
            fontWeight: 600,
            color: '#070E1C',
            marginBottom: '8px',
          }}>
            {t('emptyTitle')}
          </h2>
          <p style={{ fontSize: '14px', color: '#7A7066', marginBottom: '24px', maxWidth: '360px', margin: '0 auto 24px' }}>
            {t('emptyDescription')}
          </p>
          <Link
            href={`/${locale}/dashboard/documents`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '14px',
              backgroundColor: '#F5B91E',
              color: '#070E1C',
              fontFamily: "'DM Sans', sans-serif",
              textDecoration: 'none',
            }}
          >
            {t('uploadDocument')}
          </Link>
        </div>
      )}

      {/* ── Sections items ─────────────────────────────────────────────────── */}
      {hasAnyItems && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Actions requises */}
          {requiredItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: '#6B1E1E' }}>
                {t('sectionRequired')} ({requiredItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {requiredItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}

          {/* À venir */}
          {pendingItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: '#7A5804' }}>
                {t('sectionPending')} ({pendingItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}

          {/* Complété */}
          {compliantItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: '#2E5425' }}>
                {t('sectionCompliant')} ({compliantItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {compliantItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}

          {/* CTA amber — uniquement si actions requises */}
          {requiredItems.length > 0 && (
            <div>
              <ComplianceUploadRedirect locale={locale} label={t('uploadDocument')} />
            </div>
          )}

        </div>
      )}

    </DashboardShell>
  )
}
