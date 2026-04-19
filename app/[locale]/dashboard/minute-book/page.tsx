export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import MinuteBookPage from '@/components/minute-book/MinuteBookPage'

export default async function MinuteBookRoute({
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
    <DashboardShell locale={locale} profile={profile} company={company} urgentCount={0}>
      <MinuteBookPage
        locale={locale}
        companyId={company.id}
        framework={company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'}
        preferredLanguage={(profile?.preferred_language as 'fr' | 'en') ?? 'fr'}
      />
    </DashboardShell>
  )
}
