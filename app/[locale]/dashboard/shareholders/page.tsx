import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import ShareholdersClient from './ShareholdersClient';

export default async function ShareholdersPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = createClient();
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const { data: company } = await supabase
    .from('companies').select('*').eq('user_id', user.id).eq('status', 'active').single();

  return (
    <DashboardShell locale={locale} profile={profile} company={company ?? null}>
      <ShareholdersClient
        preferredLanguage={(profile?.preferred_language as 'fr' | 'en') ?? 'fr'}
      />
    </DashboardShell>
  );
}
