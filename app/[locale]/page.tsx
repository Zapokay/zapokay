import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function LocalePage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Check if onboarding is complete
  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed) {
    redirect(`/${locale}/onboarding`);
  }

  redirect(`/${locale}/dashboard`);
}
