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
  /**
   * ⚖️ LES DEUX LECTURES PARTENT ENSEMBLE — DOM, 2026-09-19, lot S.
   *
   * ★ LE GRAPHE, VÉRIFIÉ DANS LE CODE ET NON SUPPOSÉ : les deux ne dépendent
   *   que de `user.id`, jamais l'une de l'autre.
   *     getClaims() ................ local, ~0 ms, donne `user.id`
   *     users.select(profil) ....... `lib/auth.ts:149` → .eq('id', user.id)
   *     companies.select ........... `lib/company.ts:43` → .eq('user_id', …)
   *   Elles étaient pourtant en FILE : `getActiveCompany()` n'était appelée
   *   qu'après le `await` du profil. DEUX vagues vers Montréal, une seule
   *   nécessaire.
   *
   * ⛔ `Promise.all` ET NON `allSettled`, ET C'EST L'INVERSE DE L'ARBITRAGE DU
   *   LOT J — pour une raison mesurée. Aujourd'hui, ni l'une ni l'autre ne
   *   LÈVE sur une erreur PostgREST : `lib/auth.ts:146` et `lib/company.ts:40`
   *   jettent le champ `error` (et `throwOnError()` n'est configuré nulle part
   *   — vérifié, il n'apparaît que dans un commentaire). Une lecture en échec
   *   rend donc `null`, et le rendu continue. En revanche une PANNE RÉSEAU
   *   lève, et elle fait aujourd'hui échouer tout le rendu. `allSettled`
   *   l'avalerait : ce serait un comportement NEUF, pas un regroupement.
   *   ⚪ Au lot J chaque section avait sa propre surface d'erreur visible ;
   *   ici il n'y en a aucune. Même outil, arbitrage opposé, parce que le
   *   comportement d'origine est opposé.
   *
   * ⚠️ CE QUI CHANGE VRAIMENT, ET IL FAUT LE DIRE : les deux redirections
   *   ci-dessous GARDAIENT la lecture de `companies`. Un utilisateur sans
   *   `onboarding_completed` ne la déclenchait pas ; désormais si. ⚪ Une
   *   lecture de plus sur un chemin qui redirige aussitôt — le coût est nul et
   *   la donnée n'est jamais affichée. ⛔ Mais si un jour cette lecture devient
   *   chère ou observable, c'est CETTE ligne qu'il faut défaire en premier.
   *
   * ★★ ET LE PARTAGE `cache()` EST PRÉSERVÉ, C'EST TOUT L'INTÉRÊT : on groupe
   *   les APPELS aux deux fonctions mémoïsées, pas des copies de leurs
   *   requêtes. Les 13 appelants de `getUserWithProfile()` et les 7 de
   *   `getActiveCompany()` continuent de partager le même aller-retour. ⛔ Y
   *   recopier les requêtes ferait repasser le rendu à DEUX opérations — le
   *   piège nommé au lot R-1①.
   *
   * ⚪ MESURÉ AVANT D'ÉCRIRE, parce que ça aurait pu annuler le lot : les
   *   layouts imbriqués rendent EN PARALLÈLE. Sonde locale, build de
   *   production — trois `DÉBUT` à la même milliseconde et 0,316 s au total
   *   pour deux attentes de 300 ms. `app/[locale]/layout.tsx` appelle lui
   *   aussi `getUserWithProfile()`, mais il ne s'exécute PAS avant celui-ci :
   *   la première vague est bien ici, et elle est bien la première.
   */
  const [{ user, profile }, company] = await Promise.all([
    getUserWithProfile(),
    getActiveCompany(),
  ]);

  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  return (
    <DashboardShell locale={locale} profile={profile} company={company}>
      {children}
    </DashboardShell>
  );
}
