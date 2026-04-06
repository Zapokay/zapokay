import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import DirectorsClient from './DirectorsClient';

export default async function DirectorsPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const { data: company } = await supabase
    .from('companies').select('*').eq('user_id', user.id).eq('status', 'active').single();

  return (
    <DashboardShell locale={locale} profile={profile} company={company ?? null}>
      <DirectorsClient />
    </DashboardShell>
  );
}
