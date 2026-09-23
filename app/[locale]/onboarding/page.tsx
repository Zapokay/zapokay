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
    .select('id, legal_name_fr, legal_name_en, incorporation_type, neq, corporation_number, incorporation_date, address_line1, address_line2, address_city, address_province, address_postal_code, address_country, fiscal_year_end_month, fiscal_year_end_day')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  // A FAILED READ FAILS. Never fall through to create mode.
  // Two active companies land here too, and that is deliberate: the state should be
  // impossible, and the ten dashboard pages already fail on it the same way.
  // ⚠️ CETTE PHRASE EST EN ANGLAIS, ET SA RAISON N'EXISTE PLUS. Elle disait :
  // « global-error est anglophone, donc une phrase française dans une coquille
  // anglaise lirait plus mal que l'anglais partout ». ⛔ FAUX DEPUIS `1853bbf` :
  // `app/global-error.tsx` parle les deux langues et suit la langue de l'URL.
  // ★ LA JUSTIFICATION S'EST DONC RETOURNÉE. Sous `/fr/onboarding`, la coquille
  // est maintenant FRANÇAISE et cette phrase reste anglaise : le désaccord
  // qu'elle prétendait éviter, elle le produit.
  // ⚪ ET LE REMÈDE EXISTE DÉJÀ : `global-error` rend `error.message || repli`,
  // et son repli est bilingue. Une `Error` au message VIDE afficherait donc la
  // phrase de repli dans la bonne langue — au prix de la précision, que seul le
  // `digest` conserverait côté serveur. ⚖️ Le choix appartient à Dom ; tant
  // qu'il n'a pas tranché, on ne touche pas au texte, seulement à sa raison.
  // Ne dit rien de la base ni de la requête.
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
