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

  // ⛔ LA MÊME GARDE QUE `app/[locale]/onboarding/page.tsx`, ET C'EST UNE
  //    DIVERGENCE QU'ON FERME, PAS UN CHOIX QU'ON FAIT. Deux pages du MÊME
  //    parcours, l'une gardée et l'autre non : l'étape 8 restait atteignable à
  //    vie par son URL, longtemps après la fin de l'inscription. Elle ouvrait
  //    alors un écran de mise en route sur une société déjà en service, où
  //    « Passer » et « Terminer » mènent tous deux au tableau de bord.
  //    ⚪ Aucun lien n'y menait — une seule occurrence dans tout le dépôt, le
  //    `router.push` de l'étape 7. Il fallait taper l'URL. Ce n'était donc pas
  //    dangereux ; ce n'était pas voulu non plus.
  //
  // ⛔⛔ ET LA CONSÉQUENCE SE NOMME ICI, PARCE QU'ELLE SE VERRA AILLEURS.
  //    Cette garde rend la branche d'ARCHIVAGE de `handleStart`
  //    (`FiscalYearsSetup`) définitivement inatteignable depuis l'inscription :
  //    elle exige des lignes `active` en base AU CHARGEMENT, et une société
  //    neuve n'en a aucune — aucun chemin n'écrit `company_fiscal_years` avant
  //    l'étape 8. Le seul chemin qui l'atteignait était ce retour manuel.
  //    ★ NE PAS LA RETIRER EN LA TROUVANT MORTE :
  //      « Inatteignable depuis l'inscription depuis ce lot. Le geste
  //        d'archivage vit dans SettingsClient, où il a un sens : des lignes y
  //        existent déjà. Cette branche redeviendrait utile si cet écran
  //        servait un jour hors inscription. »
  if (profile?.onboarding_completed) redirect(`/${locale}/dashboard`)

  const { data: company } = await supabase
    .from('companies')
    .select('id, incorporation_date, fiscal_year_end_month, fiscal_year_end_day')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!company) redirect(`/${locale}/onboarding`)

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
