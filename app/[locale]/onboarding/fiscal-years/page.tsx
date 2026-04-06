import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FiscalYearsSetup } from '@/components/onboarding/FiscalYearsSetup'

export default async function FiscalYearsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: company } = await supabase
    .from('companies')
    .select('id, incorporation_date')
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

  return (
    <FiscalYearsSetup
      locale={locale}
      companyId={company.id}
      savedFiscalYears={(fiscalYears ?? []) as { year: number; status: string }[]}
      documentYears={documentYears}
      incorporationDate={(company as { id: string; incorporation_date: string | null }).incorporation_date}
    />
  )
}
