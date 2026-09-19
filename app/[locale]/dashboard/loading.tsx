import { Loader2 } from 'lucide-react';

/**
 * LE REPLI DE CHARGEMENT DES ONZE ROUTES DU TABLEAU DE BORD.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-19. Il n'a pu être écrit qu'APRÈS `7c06fb6` : en
 * Next 14, un `loading.tsx` « will be nested inside `layout.js`. It will
 * automatically wrap the `page.js` file and any children below in a
 * `<Suspense>` boundary ». Ce qui survit est le LAYOUT, ce qui est remplacé est
 * la PAGE. Tant que `DashboardShell` vivait DANS les pages, ce fichier aurait
 * fait disparaître la barre latérale à chaque navigation.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⛔ RIEN N'EST INVENTÉ ICI — CE TRAITEMENT EXISTE DÉJÀ, MOT POUR MOT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Il est copié de `DirectorsClient`, `OfficersClient` et `ShareholdersClient`,
 * qui portent tous les trois exactement :
 *
 *     <div className="flex h-[60vh] items-center justify-center">
 *       <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
 *     </div>
 *
 * ★ ET C'EST DÉLIBÉRÉ, PAS PAR COMMODITÉ : sur ces trois pages, le repli et
 * l'indicateur de la page sont VISUELLEMENT IDENTIQUES, donc l'utilisateur voit
 * UNE seule attente continue là où il en verrait autrement deux à la suite.
 * Le relais est invisible parce que les deux images le sont.
 *
 * ⚠️⚠️ ET SUR DEUX PAGES, IL RESTERA VISIBLE — MESURÉ, PAS SUPPOSÉ.
 * `ActivityPage` et `BinderView` portent un AUTRE indicateur :
 *
 *     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
 *     dans un conteneur `py-20`, et non `h-[60vh]`
 *
 * Sur ces deux-là, l'utilisateur verra donc le repli (rond plein de 24 px,
 * centré à 60 % de hauteur) PUIS leur rond ajouré de 32 px, plus haut dans la
 * page. Deux images pour une attente.
 * ⛔ LE REMÈDE N'EST PAS ICI, MAIS IL N'ATTEND PERSONNE. DEUX définitions de
 * l'attente coexistent dans ce dépôt (voir `ActivityPage` et `BinderView`). Ce
 * fichier reprend la majoritaire. L'unification est une CONSOLIDATION au sens
 * des déclarations uniques du dépôt — pas une question de design : Aria tranche
 * à quoi l'attente RESSEMBLE, pas le fait qu'il y en ait DEUX.
 * ⚪ Choisir le traitement MAJORITAIRE (trois pages contre deux) minimise le
 * nombre d'écrans où le relais se voit ; il ne le supprime pas.
 *
 * ⚪ SUR LES AUTRES PAGES — Paramètres, Tableau de bord, Documents — il n'y a
 * AUCUN indicateur de page aujourd'hui : leur contenu est rendu au serveur. Ce
 * fichier leur en donne un là où elles n'avaient rien. Pour elles, c'est un
 * gain sans contrepartie.
 *
 * ⛔ AUCUN RAFFINEMENT VISUEL DANS CE LOT. Pas de squelette, pas de titre
 * pré-rendu, pas de couleur nouvelle. On DÉPLACE un indicateur existant.
 */
export default function DashboardLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
    </div>
  );
}
