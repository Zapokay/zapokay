import { createClient } from '@/lib/supabase/server'
import { getUserWithProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { SettingsClient } from '@/components/dashboard/SettingsClient'
import { declarationDesExercices } from '@/lib/active-years'
import { adresseEnSaisie } from '@/lib/address'

export default async function SettingsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()

  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  // Get auth user email
  const email = user.email ?? ''

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
    .eq('status', 'active')

  const documentYears = (documents ?? [])
    .map((d: { document_year: number | null }) => d.document_year)
    .filter((y): y is number => y !== null)

  const companyAny = company as Record<string, unknown>
  const fyEndMonth = (companyAny.fiscal_year_end_month as number | null) ?? 12
  const fyEndDay = (companyAny.fiscal_year_end_day as number | null) ?? 31

  // ★ LA SEULE DÉCLARATION (lib/active-years.ts). Les Réglages calculaient leur propre
  // liste — en ANNÉES CIVILES, avec une fin d'exercice reçue et jamais lue — et
  // n'affichaient qu'elle : un exercice actif hors de cette liste était invisible, donc
  // impossible à désactiver, et un exercice antérieur à la constitution y était offert.
  const lignes = (fiscalYears ?? []) as { year: number; status: string }[]
  const declaration = declarationDesExercices(
    company,
    lignes.filter((l) => l.status === 'active').map((l) => l.year),
  )

  const rawTheme = (profile as Record<string, unknown>).preferred_theme as string | null
  const initialPreferredTheme: 'light' | 'dark' | null =
    rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : null

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
          initialLegalName={company.legal_name_fr ?? ''}
          initialLegalNameEn={company.legal_name_en ?? ''}
          initialNeq={(companyAny.neq as string | null) ?? ''}
          initialCorporationNumber={(companyAny.corporation_number as string | null) ?? ''}
          initialSiege={adresseEnSaisie(company)}
          incorporationDate={company.incorporation_date}
          initialFyMonth={fyEndMonth}
          initialFyDay={fyEndDay}
          documentYears={documentYears}
          exercices={declaration.exercices.slice().reverse()}
          exerciceEnCours={declaration.enCours}
          exercicesVerrouilles={declaration.verrouilles}
          suivis={declaration.suivis}
          initialPreferredTheme={initialPreferredTheme}
        />
      </div>
    </DashboardShell>
  )
}
