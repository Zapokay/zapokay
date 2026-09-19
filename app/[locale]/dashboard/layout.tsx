import { redirect } from 'next/navigation';
import { getUserWithProfile } from '@/lib/auth';
import { getActiveCompany } from '@/lib/company';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

/**
 * LA COQUILLE DU TABLEAU DE BORD, ENFIN DANS UN LAYOUT.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-19. Elle vivait DANS chacune des neuf pages, qui
 * l'enveloppaient toutes de la même façon.
 *
 * ★★ CE QUE CE DÉPLACEMENT DÉBLOQUE, ET C'EST SA VRAIE RAISON. En Next 14, un
 * `loading.tsx` « will be nested inside `layout.js`. It will automatically wrap
 * the `page.js` file and any children below in a `<Suspense>` boundary » — ce
 * qui survit au repli est le LAYOUT, ce qui est remplacé est la PAGE. Tant que
 * la coquille était dans la page, un `loading.tsx` aurait fait DISPARAÎTRE la
 * barre latérale à chaque navigation. Elle est maintenant du bon côté de la
 * frontière, et « shared layouts remain interactive while new route segments
 * load ».
 * ⛔ LE `loading.tsx` N'EST PAS DANS CE LOT. Ce commit ne doit RIEN changer à
 * l'écran ; le suivant seul en ajoutera un.
 *
 * ★ ET IL Y A UN GAIN QUI NE DÉPEND D'AUCUN LOT FUTUR : un layout est PRÉSERVÉ
 * entre deux navigations douces. Passer d'Actionnaires à Dirigeants cesse de
 * reconstruire la coquille.
 *
 * ⛔ LES PAGES GARDENT LEURS PROPRES LECTURES, et ce n'est pas une duplication
 * oubliée : la plupart se servent de `company` pour LEUR contenu — jusqu'à 19
 * mentions sur le tableau de bord. Ce qui empêche le double aller-retour, c'est
 * le `cache()` de React sur `getUserWithProfile` et `getActiveCompany` : dans
 * UNE requête, layout et page partagent la même lecture.
 *
 * ⚠️ LA REDIRECTION EST ICI **ET** DANS LES PAGES, DÉLIBÉRÉMENT. Layout et page
 * rendent dans la même passe, sans ordre garanti : laisser la garde au seul
 * layout supposerait qu'il s'exécute d'abord. Elle coûte une comparaison — les
 * lectures, elles, sont mémoïsées.
 *
 * ⚪ LES DEUX `permanentRedirect` HÉRITÉS (`dashboard/documents`,
 * `dashboard/minute-book`) passent aussi par ce layout. Ils ne rendent rien et
 * redirigent avant tout affichage : la coquille ne paraît pas pour eux.
 */
export default async function DashboardLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  const company = await getActiveCompany();

  return (
    <DashboardShell locale={locale} profile={profile} company={company}>
      {children}
    </DashboardShell>
  );
}
