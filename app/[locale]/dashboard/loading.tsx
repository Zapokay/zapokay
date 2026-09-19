import { AttenteDePage } from '@/components/ui/AttenteDePage';

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
 * ⛔ IL NE DESSINE RIEN — il CONSOMME la déclaration unique de l'attente.
 * `components/ui/AttenteDePage.tsx` en porte la seule définition, et son
 * en-tête porte la raison : UNE attente, UNE image, même quand elle est
 * produite à DEUX endroits — ce repli côté serveur, puis l'indicateur du
 * composant client qui charge ensuite ses données.
 *
 * ⚠️ ET CE FICHIER A PORTÉ SA PROPRE COPIE, ENTRE `0e90757` ET LA
 * CONSOLIDATION. C'est elle qui a mis deux images bout à bout sur Historique —
 * vu à la caméra, en production. La leçon complète est dans l'autre fichier ;
 * celle d'ici tient en une ligne : un quatrième littéral aurait suffi à
 * recréer le défaut.
 */
export default function DashboardLoading() {
  return <AttenteDePage />;
}
