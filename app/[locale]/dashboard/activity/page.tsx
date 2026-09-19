import { getUserWithProfile } from '@/lib/auth'
import { getActiveCompany } from '@/lib/company'
import { redirect } from 'next/navigation'
import ActivityPage from '@/components/activity/ActivityPage'

/**
 * ⛔ LA COQUILLE A QUITTÉ CETTE PAGE le 2026-09-19 : elle vit dans
 * `app/[locale]/dashboard/layout.tsx`, qui enveloppe les onze routes du
 * segment. Voir son en-tête — un `loading.tsx` remplace la PAGE et préserve le
 * LAYOUT, donc la barre latérale devait passer du bon côté.
 *
 * ⚪ LA LECTURE DE `companies` RESTE, parce que cette page s'en sert pour SON
 * contenu — les deux dates de la frontière du registre. Elle passe par
 * `getActiveCompany()`, mémoïsée par requête : le layout et cette page
 * partagent le même aller-retour.
 *
 * ⚠️ LA REDIRECTION RESTE aussi, bien que le layout la porte : layout et page
 * rendent dans la même passe sans ordre garanti.
 */
export default async function ActivityDashboardPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const company = await getActiveCompany()

  /* ⛔ DEUX DATES, PAS LA SOCIÉTÉ. La ligne d'origine n'a besoin que de
     celles-là, et `created_at` est l'ancrage — jamais la première entrée du
     journal, qui daterait le registre par lui-même. */
  return (
    <ActivityPage
      registerOpenedAt={company?.created_at ?? null}
      incorporationDate={company?.incorporation_date ?? null}
    />
  )
}
