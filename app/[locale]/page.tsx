import { redirect } from 'next/navigation';
import { getUserWithProfile } from '@/lib/auth';

export default async function LocalePage({ params: { locale } }: { params: { locale: string } }) {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);
  redirect(`/${locale}/dashboard`);
}
