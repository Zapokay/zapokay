export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getUserWithProfile } from '@/lib/auth'
import { getActiveCompany } from '@/lib/company'
import { redirect } from 'next/navigation'
import CompletenessPage from '@/components/minute-book/CompletenessPage'

/**
 * ⛔ LA COQUILLE A QUITTÉ CETTE PAGE le 2026-09-19 : elle vit dans
 * `app/[locale]/dashboard/layout.tsx`. Voir son en-tête pour la raison.
 *
 * ⚪ `urgentCount={0}` EST PARTI AVEC ELLE, et il ne manque à personne : la
 * valeur par défaut de la prop EST `0`. Mesuré au recensement du 2026-09-19 —
 * trois pages l'écrivaient, toutes avec `0`.
 *
 * ⚪ LA LECTURE DE `companies` RESTE : cette page en tire cinq valeurs. Elle
 * passe par `getActiveCompany()`, mémoïsée par requête.
 * ⚠️ Et sa redirection `if (!company)` lui est PROPRE — pas dans le layout.
 */
export default async function CompletenessRoute({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const company = await getActiveCompany()
  if (!company) redirect(`/${locale}/onboarding`)

  return (
    <CompletenessPage
      locale={locale}
      companyId={company.id}
      framework={company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'}
      preferredLanguage={(profile?.preferred_language as 'fr' | 'en') ?? 'fr'}
      fiscalYearEndMonth={(company.fiscal_year_end_month as number | null) ?? 12}
      fiscalYearEndDay={(company.fiscal_year_end_day as number | null) ?? 31}
    />
  )
}
