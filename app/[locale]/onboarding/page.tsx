import { createClient } from '@/lib/supabase/server';
import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default async function OnboardingPage({ params: { locale } }: { params: { locale: string } }) {
  const { user, profile } = await getUserWithProfile();

  if (!user) redirect(`/${locale}/login`);

  if (profile?.onboarding_completed) redirect(`/${locale}/dashboard`);

  // RESUME, NOT CREATE. companyId had only TWO sources — the session draft and
  // step 3's own write — so a user who closed the tab and came back got a SECOND
  // company: sessionStorage dies with the tab, the draft returns null, and step 3
  // takes its INSERT branch. Reading the company here feeds the same lazy
  // initializers the draft feeds, so the UPDATE branch takes over instead.
  //
  // ⚠️ maybeSingle(), NOT single(). single() reports an error for ZERO rows exactly
  // as it does for a real failure, and those two must not be confused here: a failed
  // read taken for "no company" would land on INSERT — the defect this closes.
  // Columns are selected explicitly rather than '*' because lib/types' Company
  // predates corporation_number and the fiscal-year columns.
  const supabase = createClient();
  const { data: existingCompany, error: existingCompanyError } = await supabase
    .from('companies')
    .select('id, legal_name_fr, incorporation_type, neq, corporation_number, incorporation_date, province, fiscal_year_end_month, fiscal_year_end_day')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  // A FAILED READ FAILS. Never fall through to create mode.
  // Two active companies land here too, and that is deliberate: the state should be
  // impossible, and the ten dashboard pages already fail on it the same way.
  // ⚠️ ENGLISH ON PURPOSE, AND IT IS A STOPGAP. There is no segment error boundary,
  // so this reaches app/global-error.tsx — which is English-only and renders
  // error.message verbatim. A French sentence inside an English shell reads worse
  // than either one alone. Says nothing about the database or the query.
  if (existingCompanyError) {
    throw new Error('Onboarding could not load your company. Please try again.');
  }

  return (
    <OnboardingFlow
      locale={locale}
      userId={user.id}
      existingCompany={existingCompany ?? null}
    />
  );
}
