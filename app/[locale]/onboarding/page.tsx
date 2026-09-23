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
  // ⚖️ L'ERREUR N'A PLUS DE MESSAGE, ET C'EST LA DÉCISION DE DOM (2026-09-23).
  // Elle en portait un, en anglais, justifié par « global-error est anglophone ».
  // ⛔ Faux depuis `1853bbf`, et la justification s'était RETOURNÉE : sous
  // `/fr/onboarding` la coquille est française et la phrase restait anglaise —
  // le désaccord qu'elle prétendait éviter, elle le produisait.
  // ★ UN MESSAGE VIDE EST DONC UN CHOIX, PAS UN OUBLI : `global-error` rend
  // `error.message || repli`, et son repli EST bilingue. L'écran parle enfin la
  // langue du lecteur. Le détail, lui, reste aux journaux du serveur, avec le
  // `digest` que Next attache à cette erreur.
  // ⛔ NE PAS « AMÉLIORER » EN REMETTANT UNE PHRASE ICI : elle ne pourrait être
  // que dans UNE langue, et elle reprendrait le défaut qu'on vient de fermer.
  if (existingCompanyError) {
    throw new Error();
  }

  // ★★ CE QUI INTERDIT UNE SECONDE LIGNE AU REGISTRE, C'EST LA PREMIÈRE — LOT EX.
  //
  // ⚖️ Avant ce lot, `onboarding_completed` s'écrivait à l'étape 7, une ligne
  // AVANT `logActivity('company_created')`, et le `redirect` ci-dessus rendait
  // l'étape 7 inatteignable pour toujours : c'est ce qui garantissait UNE ligne
  // de registre par société. Dom a déplacé la fin de l'inscription après
  // l'étape 8 — la garantie perdait donc son gardien.
  //
  // ⛔ LE TROU QU'ON AURAIT CREUSÉ, NOMMÉ : le brouillon vit en `sessionStorage`
  // et meurt avec l'onglet. Quelqu'un qui ferme à l'étape 8 et revient
  // repartirait de l'étape 1 avec le drapeau encore faux, rejouerait les sept
  // étapes, et `handleCelebrationContinue` écrirait une SECONDE ligne
  // « company_created ». Deux fois de suite, deux lignes de plus.
  //
  // ★ LA GARANTIE EST DONC REPORTÉE SUR LE FAIT LUI-MÊME. La ligne de registre
  // existe ⇒ les sept premières étapes ont abouti ⇒ la seule chose qui reste est
  // l'étape 8. On y envoie, et l'étape 7 redevient inatteignable — par un fait
  // DURABLE écrit en base, là où le drapeau ne l'était pas moins mais ne dit
  // plus la même chose.
  const { count: lignesDeRegistre, error: registreError } = existingCompany
    ? await supabase
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', existingCompany.id)
        .eq('event_type', 'company_created')
    : { count: 0, error: null };

  // ⛔ UNE LECTURE RATÉE ÉCHOUE — même doctrine que ci-dessus, et ici elle porte
  // plus lourd : prendre un échec de lecture pour « aucune ligne » renverrait à
  // l'étape 1 quelqu'un qui en a déjà une, c'est-à-dire fabriquerait le doublon
  // que ce bloc existe pour empêcher.
  if (registreError) {
    throw new Error();
  }

  if ((lignesDeRegistre ?? 0) > 0) {
    redirect(`/${locale}/onboarding/fiscal-years`);
  }

  return (
    <OnboardingFlow
      locale={locale}
      userId={user.id}
      existingCompany={existingCompany ?? null}
    />
  );
}
