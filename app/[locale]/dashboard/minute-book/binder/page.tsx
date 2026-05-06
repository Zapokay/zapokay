export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import BinderPage from '@/components/minute-book/BinderPage'

export default async function BinderRoute({
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

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

  return (
    <DashboardShell locale={locale} profile={profile} company={company}>
      <BinderPage locale={locale} companyId={company.id} />
    </DashboardShell>
  )
}
