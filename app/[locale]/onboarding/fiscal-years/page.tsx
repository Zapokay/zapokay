import { createClient } from '@/lib/supabase/server'
import { getUserWithProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FiscalYearsSetup } from '@/components/onboarding/FiscalYearsSetup'
import { declarationDesExercices } from '@/lib/active-years'

export default async function FiscalYearsPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const supabase = createClient()

  const { user, profile } = await getUserWithProfile()
  if (!user) redirect(`/${locale}/login`)

  const { data: company } = await supabase
    .from('companies')
    .select('id, incorporation_date, fiscal_year_end_month, fiscal_year_end_day')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

  // ⚖️ SA GARDE, DÉCIDÉE AU LOT EX — elle n'en avait AUCUNE, et elle n'en avait
  // pas besoin : l'inscription se clôturait à l'étape 7, donc personne ne
  // pouvait arriver ici sans l'avoir finie. Ce n'est plus vrai.
  //
  // ⛔ ① PAR LE BAS — on ne saute pas ici en tapant l'URL. Sans ligne
  //    « company_created », les sept premières étapes n'ont pas abouti : cet
  //    écran enregistrerait des exercices pour une société sans administrateurs,
  //    sans actionnaires et sans dirigeants, puis déclarerait l'inscription
  //    finie. On renvoie à l'assistant, qui reprend où il en est.
  // ⛔ ② PAR LE HAUT — une inscription déjà finie n'a plus rien à faire dans un
  //    écran d'inscription. Les exercices se gèrent ensuite dans Paramètres, qui
  //    porte le même geste ; revenir ici rejouerait une étape close.
  // ⚪ Les deux lectures ÉCHOUENT plutôt que de supposer : voir la même doctrine
  //    dans `../page.tsx`. Une garde qui s'ouvre sur une erreur n'est pas une
  //    garde.
  if (profile?.onboarding_completed) redirect(`/${locale}/dashboard`)

  const { count: lignesDeRegistre, error: registreError } = await supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('event_type', 'company_created')
  if (registreError) throw new Error()
  if ((lignesDeRegistre ?? 0) === 0) redirect(`/${locale}/onboarding`)

  const { data: fiscalYears } = await supabase
    .from('company_fiscal_years')
    .select('year, status')
    .eq('company_id', company.id)

  const { data: documents } = await supabase
    .from('documents')
    .select('document_year')
    .eq('company_id', company.id)
    .eq('status', 'active')

  const documentYears = (documents ?? [])
    .map((d: { document_year: number | null }) => d.document_year)
    .filter((y): y is number => y !== null)

  // ★ LA LISTE EST DÉCLARÉE ICI, AU SERVEUR, PAR LA SEULE RÈGLE (lib/active-years.ts).
  // L'écran la reçoit faite et ne lit plus aucune horloge : son rendu serveur et son
  // rendu navigateur ne peuvent plus diverger sur la liste. Ce qui reste — le jour UTC
  // du serveur, le dernier soir d'un exercice — est écrit sur `exercicesDeLaSociete`.
  const lignes = (fiscalYears ?? []) as { year: number; status: string }[]
  const declaration = declarationDesExercices(
    company,
    lignes.filter((l) => l.status === 'active').map((l) => l.year),
  )

  return (
    <FiscalYearsSetup
      locale={locale}
      /* ⭐ L'USAGER DESCEND MAINTENANT JUSQU'ICI : c'est cet écran qui pose
         `onboarding_completed`, et il lui faut donc savoir SUR QUI l'écrire. */
      userId={user.id}
      companyId={company.id}
      savedFiscalYears={lignes}
      documentYears={documentYears}
      exercices={declaration.exercices.slice().reverse()}
      exerciceEnCours={declaration.enCours}
      exercicesVerrouilles={declaration.verrouilles}
      suivis={declaration.suivis}
    />
  )
}
