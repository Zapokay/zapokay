/**
 * LIRE LE RÉSULTAT D'UNE REQUÊTE GROUPÉE — UNE SEULE DÉFINITION, TROIS LECTEURS.
 *
 * ⚖️ ARBITRAGE DE MAX, 2026-09-17 : `allSettled` et non `all`.
 * ⚪ Les DÉCISIONS DE DOM sur ces pages sont ailleurs : l'erreur VISIBLE par
 * section, et la redirection quand la session tombe — lot K, 2026-09-18. Ne pas
 * confondre les deux : ce fichier n'applique aucune des deux, et c'est voulu.
 *
 * ⛔ POURQUOI `allSettled`, ET C'EST UN CONTRAT À PRÉSERVER, PAS UNE PRÉFÉRENCE.
 * Avant le regroupement, chacune de ces requêtes pouvait échouer SEULE : son
 * erreur n'était jamais lue, le `|| []` du point d'appel rendait une liste vide,
 * et les autres sections de la page s'affichaient quand même. `Promise.all`
 * aurait fait tomber tout le groupe pour une seule requête en échec — une
 * régression déguisée en optimisation.
 *
 * ⚪ LE SILENCE EST REPRODUIT À L'IDENTIQUE, DÉLIBÉRÉMENT. Cette fonction rend
 * `null` pour une promesse rejetée, exactement ce que `supabase-js` mettait dans
 * `data` quand la requête échouait ; le `|| []` qui suit chez l'appelant fait donc
 * ce qu'il faisait déjà. ⛔ NE PAS « AMÉLIORER » ÇA ICI en journalisant ou en
 * remontant l'erreur : rendre l'échec visible par section est un lot à part (K),
 * décidé séparément. Mélanger les deux ferait d'un pur réordonnancement un
 * changement de comportement qu'on ne saurait plus isoler si quelque chose casse.
 *
 * ⚠️ CE QUI CHANGE VRAIMENT, ET QUI EST DIT PLUTÔT QUE TU : avant, un REJET — une
 * panne réseau, pas une erreur Postgres, que `supabase-js` rend dans `{ error }`
 * sans lever — sortait de la fonction de chargement et laissait la page en
 * chargement pour toujours, `setLoading(false)` n'étant jamais atteint. Désormais
 * la page se rend avec la section vide. C'est meilleur ; ce n'est pas identique.
 */
/** Ce que `supabase-js` résout : la donnée, et l'erreur qu'il ne LÈVE pas. */
type Reponse<T> = { data: T | null; error?: unknown };

export function donnees<T>(resultat: PromiseSettledResult<Reponse<T>>): T | null {
  return resultat.status === 'fulfilled' ? resultat.value.data : null;
}

/**
 * LE SECOND LECTEUR — CELUI QUI GARDE LA RAISON.
 *
 * ⚖️ LOT K-2, 2026-09-21. `donnees()` ci-dessus JETTE la raison, et le
 * commentaire de ce fichier disait pourquoi : le lot J devait rester un pur
 * réordonnancement. ⭐ Le lot K est arrivé ; voici le lecteur qu'il annonçait.
 * `donnees()` n'est pas modifié — ses appelants continuent de lire une donnée,
 * celui-ci lit un échec, et les deux regardent le MÊME résultat.
 *
 * ⛔⛔ DEUX FAÇONS D'ÉCHOUER, ET N'EN VOIR QU'UNE SERAIT PIRE QUE SE TAIRE :
 *   ① la promesse est REJETÉE — panne réseau, requête avortée ;
 *   ② elle est TENUE mais porte `{ error }` — `supabase-js` ne LÈVE pas sur un
 *      refus de PostgREST, il le RÉSOUT. C'est le cas le plus fréquent (RLS,
 *      colonne absente, jointure invalide) et c'est celui qu'un lecteur naïf
 *      de `status === 'rejected'` manquerait entièrement.
 *
 * ★★ ET CE QUI N'EST PAS UN ÉCHEC : une section VIDE. `data: []` sans erreur
 * est une réponse, pas une panne — une société sans classe d'actions n'a rien
 * raté. ⛔ Confondre les deux ferait dire « je n'ai pas pu charger » à une
 * page parfaitement chargée, ce qui est un mensonge dans l'autre sens et
 * détruirait la confiance dans l'avis lui-même.
 */
export function aEchoue<T>(resultat: PromiseSettledResult<Reponse<T>>): boolean {
  if (resultat.status === 'rejected') return true;
  return resultat.value?.error != null;
}
