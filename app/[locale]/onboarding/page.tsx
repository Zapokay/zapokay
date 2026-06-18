import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default async function OnboardingPage({ params: { locale } }: { params: { locale: string } }) {
  const { user, profile } = await getUserWithProfile();

  if (!user) redirect(`/${locale}/login`);

  if (profile?.onboarding_completed) redirect(`/${locale}/dashboard`);

  return <OnboardingFlow locale={locale} userId={user.id} />;
}
