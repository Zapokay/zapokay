import { createClient } from '@/lib/supabase/server'
import { getUserWithProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import ActivityPage from '@/components/activity/ActivityPage'

export default async function ActivityDashboardPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()
  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  return (
    <DashboardShell locale={locale} profile={profile} company={company ?? null}>
      {/* ⛔ DEUX DATES, PAS LA SOCIÉTÉ. La ligne d'origine n'a besoin que de
          celles-là, et `created_at` est l'ancrage — jamais la première entrée
          du journal, qui daterait le registre par lui-même. */}
      <ActivityPage
        registerOpenedAt={company?.created_at ?? null}
        incorporationDate={company?.incorporation_date ?? null}
      />
    </DashboardShell>
  )
}
