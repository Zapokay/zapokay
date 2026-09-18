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
export function donnees<T>(resultat: PromiseSettledResult<{ data: T | null }>): T | null {
  return resultat.status === 'fulfilled' ? resultat.value.data : null;
}
