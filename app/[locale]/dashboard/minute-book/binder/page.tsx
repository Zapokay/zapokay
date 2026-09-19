export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getUserWithProfile } from '@/lib/auth'
import { getActiveCompany } from '@/lib/company'
import { redirect } from 'next/navigation'
import BinderPage from '@/components/minute-book/BinderPage'

/**
 * ⛔ LA COQUILLE A QUITTÉ CETTE PAGE le 2026-09-19 : elle vit dans
 * `app/[locale]/dashboard/layout.tsx`. Voir son en-tête pour la raison.
 *
 * ⚪ LA LECTURE DE `companies` RESTE : cette page a besoin de `company.id` pour
 * son contenu. Elle passe par `getActiveCompany()`, mémoïsée par requête —
 * layout et page partagent le même aller-retour.
 *
 * ⚠️ ET SA TROISIÈME REDIRECTION LUI EST PROPRE — `if (!company)` —, celle-là
 * n'est PAS dans le layout : une société absente n'empêche pas la coquille de
 * s'afficher, mais empêche CE contenu d'exister. Ne pas la remonter.
 */
export default async function BinderRoute({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const company = await getActiveCompany()
  if (!company) redirect(`/${locale}/onboarding`)

  return <BinderPage locale={locale} companyId={company.id} />
}
