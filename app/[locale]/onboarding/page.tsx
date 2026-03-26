import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default async function OnboardingPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('users')
    .select('onboarding_completed, preferred_language')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_completed) redirect(`/${locale}/dashboard`);

  return <OnboardingFlow locale={locale} userId={user.id} />;
}
