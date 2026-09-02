/**
 * L'ORDRE DES PIÈCES DU LIVRE — exprimé UNE fois, appliqué partout.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. La route du Livre triait ; celle de l'export ne
 * triait pas du tout. Sans ORDER BY, PostgreSQL rend les lignes dans l'ordre qui
 * l'arrange, et deux chargements peuvent différer. Tant que les pièces
 * tombaient dans des dossiers, personne ne le voyait ; la page index le rend
 * visible sur le papier — et un miroir qui range autrement que l'original n'est
 * pas un miroir.
 *
 * ★ ET IL N'EST PAS RECOPIÉ. Deux `.order()` identiques dans deux routes, ce
 * serait la septième liste de la semaine. Ici, une fonction, deux appelants :
 * changer l'ordre du Livre change l'ordre de l'archive, mécaniquement.
 *
 * La contrainte est STRUCTURELLE, pas un `any` : n'importe quel constructeur de
 * requête qui sait `.order()` et se rend lui-même passe, et le type de
 * l'appelant traverse intact.
 */

interface Ordonnable<Q> {
  order(
    column: string,
    options: { ascending?: boolean; nullsFirst?: boolean },
  ): Q;
}

export function applyBinderDocumentOrder<Q extends Ordonnable<Q>>(query: Q): Q {
  return query
    .order('document_year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
}
