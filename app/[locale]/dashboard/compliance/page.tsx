import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { ComplianceClient } from '@/components/compliance/ComplianceClient'
import { calculateComplianceItems } from '@/lib/compliance/calculateComplianceItems'
import { getActiveYears } from '@/lib/active-years'

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
  searchParams: { year?: string }
}

// ─── Server Component ─────────────────────────────────────────────────────────

export default async function CompliancePage({ params, searchParams }: PageProps) {
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

  // Fiscal years for YearPicker
  const { data: fiscalYearsData } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', company.id)
    .eq('status', 'active')
    .order('year', { ascending: false })
  const fiscalYears = (fiscalYearsData ?? []).map((fy: { year: number }) => fy.year)

  const activeYears = await getActiveYears(company.id, supabase)
  const activeFiscalYears = fiscalYears  // same data, same filter (status='active'), already sorted descending

  // Detect missing fiscal year config
  const companyAny = company as Record<string, unknown>
  const hasFiscalYearConfig =
    companyAny.fiscal_year_end_month !== null &&
    companyAny.fiscal_year_end_month !== undefined

  // Active year from URL param — use fiscal year end date as reference
  const selectedYear = searchParams.year
    ? parseInt(searchParams.year, 10)
    : (activeFiscalYears[0] ?? fiscalYears[0] ?? null)
  const fyEndMonthNum = (companyAny.fiscal_year_end_month as number | null) ?? 12
  const fyEndDayNum   = (companyAny.fiscal_year_end_day as number | null) ?? 31
  const referenceDate = selectedYear
    ? new Date(selectedYear, fyEndMonthNum - 1, fyEndDayNum)
    : undefined

  const result = await calculateComplianceItems(company.id, supabase, referenceDate, activeYears)

  const frameworkLabel = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSAQ'
  const fyLabel        = fiscalYearLabel(company)
  const total          = result.items.length
  const hasAnyItems    = result.items.length > 0
  const yearLabel      = selectedYear ? `${selectedYear}–${selectedYear + 1}` : fyLabel

  const contentSubtitle = hasAnyItems && !result.needsFiscalYear
    ? `${frameworkLabel} · ${total} obligation${total > 1 ? 's' : ''} · ${fr ? 'Exercice' : 'Fiscal year'} ${yearLabel}`
    : frameworkLabel

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      urgentCount={result.urgentCount}
      fiscalYears={activeFiscalYears}
    >
      <ComplianceClient
        locale={locale}
        companyId={company.id}
        items={result.items}
        percentage={result.percentage}
        compliantCount={result.compliantCount}
        pendingCount={result.pendingCount}
        urgentCount={result.urgentCount}
        needsFiscalYear={result.needsFiscalYear ?? false}
        fyLabel={fyLabel}
        yearLabel={yearLabel}
        contentSubtitle={contentSubtitle}
        fiscalYearsConfigured={fiscalYears.length > 0}
        hasFiscalYearConfig={hasFiscalYearConfig}
        t={{
          missingFiscalYear: t('missingFiscalYear'),
          emptyTitle: t('emptyTitle'),
          emptyDescription: t('emptyDescription'),
          uploadDocument: t('uploadDocument'),
          sectionRequired: t('sectionRequired'),
          sectionPending: t('sectionPending'),
          sectionCompliant: t('sectionCompliant'),
        }}
      />
    </DashboardShell>
  )
}
