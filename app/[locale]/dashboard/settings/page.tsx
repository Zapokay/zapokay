import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { SettingsClient } from '@/components/dashboard/SettingsClient'

function computeAllYears(
  incorporationDate: string | null,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number
): number[] {
  const currentYear = new Date().getFullYear()
  // Always show last 8 years (matching FiscalYearsSetup)
  return Array.from({ length: 8 }, (_, i) => currentYear - 7 + i).reverse()
}

export default async function SettingsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  // Get auth user email
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const email = authUser?.email ?? ''

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

  const { data: fiscalYears } = await supabase
    .from('company_fiscal_years')
    .select('year, status')
    .eq('company_id', company.id)

  const { data: documents } = await supabase
    .from('documents')
    .select('document_year')
    .eq('company_id', company.id)

  const documentYears = (documents ?? [])
    .map((d: { document_year: number | null }) => d.document_year)
    .filter((y): y is number => y !== null)

  const companyAny = company as Record<string, unknown>
  const fyEndMonth = (companyAny.fiscal_year_end_month as number | null) ?? 12
  const fyEndDay = (companyAny.fiscal_year_end_day as number | null) ?? 31

  const allYears = computeAllYears(company.incorporation_date, fyEndMonth, fyEndDay)

  const fr = locale === 'fr'

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      urgentCount={0}
    >
      <div className="space-y-6">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--text-heading)]"
            style={{ fontFamily: 'Sora, sans-serif' }}
          >
            {fr ? 'Paramètres' : 'Settings'}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {fr
              ? 'Gérez votre profil, votre entreprise et vos exercices fiscaux.'
              : 'Manage your profile, company and fiscal years.'}
          </p>
        </div>

        <SettingsClient
          locale={locale}
          userId={user.id}
          companyId={company.id}
          initialFullName={profile.full_name ?? ''}
          initialEmail={email}
          initialLang={profile.preferred_language ?? locale}
          incorporationType={company.incorporation_type}
          initialLegalName={company.legal_name_fr}
          initialNeq={(companyAny.neq as string | null) ?? ''}
          province={company.province}
          incorporationDate={company.incorporation_date}
          initialFyMonth={fyEndMonth}
          initialFyDay={fyEndDay}
          savedFiscalYears={(fiscalYears ?? []) as { year: number; status: string }[]}
          documentYears={documentYears}
          allYears={allYears}
        />
      </div>
    </DashboardShell>
  )
}
