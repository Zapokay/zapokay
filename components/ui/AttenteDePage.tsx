import { Loader2 } from 'lucide-react';

/**
 * L'ATTENTE D'UNE PAGE — UNE SEULE DÉFINITION, ET C'EST TOUT L'OBJET.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-19, caméra en production. Le dépôt en portait
 * DEUX, et la frontière de chargement du tableau de bord (`0e90757`) les a mises
 * bout à bout : sur Historique, l'utilisateur voyait DEUX images se succéder
 * pour UNE seule attente.
 *
 * ★★ LA RAISON, ET ELLE VAUT PLUS QUE CE LOT : il n'y a qu'UNE attente du point
 * de vue de l'utilisateur, même quand elle est produite à DEUX endroits — le
 * repli du serveur, puis l'indicateur du composant client qui charge ses
 * données. UNE ATTENTE, UNE IMAGE. Deux images disent à l'œil qu'il s'est passé
 * quelque chose entre les deux ; il ne s'est rien passé.
 *
 * ⛔ CE COMPOSANT NE DESSINE RIEN DE NEUF. Il EST le traitement que Dom appelle
 * « l'original », repris AU CARACTÈRE PRÈS de `DirectorsClient`,
 * `OfficersClient` et `ShareholdersClient` :
 *
 *     <div className="flex h-[60vh] items-center justify-center">
 *       <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
 *     </div>
 *
 * Ce lot SUPPRIME une variante ; il n'en introduit pas.
 *
 * ⚪ ET C'EST ÇA, LE VRAI GAIN : le jour où Aria veut changer l'attente, elle a
 * UN endroit à changer. Ce n'est pas elle qui tranche qu'il n'y en ait qu'une —
 * ça, c'est une consolidation, au sens des déclarations uniques de ce dépôt.
 *
 * ⛔ UN COPIER-COLLER N'AURAIT PAS SUFFI, et c'est pourquoi ce fichier existe
 * plutôt qu'un quatrième littéral : la troisième copie apparaît le mois
 * prochain, et on refait ce lot.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE CE COMPOSANT NE COUVRE PAS — RECENSÉ, PAS OUBLIÉ
 * ═══════════════════════════════════════════════════════════════════════
 * Balayage de `animate-spin` sur tout `app/`, `components/` et `lib/`, le
 * 2026-09-19. Trois familles, et seule la première est une attente de PAGE :
 *
 *   · ATTENTE DE PAGE — les six sites que ce lot réunit ici.
 *   · ATTENTE DE SECTION, dans deux modales — `BinderExportModal` et
 *     `BulkCatchUpModal` portent un TROISIÈME traitement : 32 px, `border-2`,
 *     `border-t-transparent`, et `var(--amber-400)` au lieu d'une couleur
 *     Tailwind. ⛔ Ce n'est pas une page, et ce lot n'y touche pas — mais c'est
 *     la prochaine consolidation, et elle est nommée ici pour qu'on n'ait pas à
 *     la redécouvrir.
 *   · ATTENTE DE BOUTON — 20 sites, tous de la forme
 *     `{saving && <Loader2 className="h-4 w-4 animate-spin" />}` à l'intérieur
 *     d'un bouton ou d'une ligne. ⚪ Autre objet, autre taille, autre place :
 *     les réunir avec celle-ci serait confondre « la page charge » et « ce
 *     bouton travaille ».
 */
export function AttenteDePage() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
    </div>
  );
}
