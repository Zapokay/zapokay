import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FiscalYearsSetup } from '@/components/onboarding/FiscalYearsSetup'
import { declarationDesExercices } from '@/lib/active-years'

export default async function FiscalYearsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()

  const user = await getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: company } = await supabase
    .from('companies')
    .select('id, incorporation_date, fiscal_year_end_month, fiscal_year_end_day')
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

  // ★ LA LISTE EST DÉCLARÉE ICI, AU SERVEUR, PAR LA SEULE RÈGLE (lib/active-years.ts).
  // L'écran la reçoit faite et ne lit plus aucune horloge : son rendu serveur et son
  // rendu navigateur ne peuvent plus diverger sur la liste. Ce qui reste — le jour UTC
  // du serveur, le dernier soir d'un exercice — est écrit sur `exercicesDeLaSociete`.
  const lignes = (fiscalYears ?? []) as { year: number; status: string }[]
  const declaration = declarationDesExercices(
    company,
    lignes.filter((l) => l.status === 'active').map((l) => l.year),
  )

  return (
    <FiscalYearsSetup
      locale={locale}
      companyId={company.id}
      savedFiscalYears={lignes}
      documentYears={documentYears}
      exercices={declaration.exercices.slice().reverse()}
      exerciceEnCours={declaration.enCours}
      exercicesVerrouilles={declaration.verrouilles}
      suivis={declaration.suivis}
    />
  )
}
