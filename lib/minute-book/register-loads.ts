/**
 * QUI A CHARGÉ, ET COMBIEN ONT ÉCHOUÉ — la décision, sortie du composant.
 *
 * ⚠️ SUR UN REGISTRE LÉGAL, « IL N'Y A PERSONNE » ET « JE N'AI PAS PU LIRE »
 * SONT DEUX AFFIRMATIONS DIFFÉRENTES. BinderView faisait
 * `setDirectors(await res.json())` sans tester `res.ok` : une réponse 401 ou 404
 * est un objet truthy, donc la carte se rendait — titre `undefined`, et la
 * phrase « Aucune donnée enregistrée » sous un registre qu'on n'avait pas su
 * lire. Un livre de minutes qui déclare un conseil vide alors qu'il n'a pas su
 * le lire ment sur un fait juridique.
 *
 * ★ CE MODULE EST PUR ET SANS DÉPENDANCE SERVEUR — il est importé par un
 * composant client. Il ne touche ni à supabase, ni aux catalogues.
 */

/**
 * L'issue d'un appel, une fois le résultat de `Promise.allSettled` lu.
 *
 * ⚠️ LES DEUX CHEMINS D'ÉCHEC Y SONT DISTINCTS ET NOMMÉS :
 *   · `status: 'rejected'`  → le rejet LANCÉ (panne réseau, corps illisible) ;
 *   · `ok: false`           → la réponse non-ok RETOURNÉE (401, 404, 500).
 * Couvrir l'un ne couvre pas l'autre ; les deux mènent ici au même verdict.
 */
export interface RegisterFetchOutcome<T> {
  status: 'fulfilled' | 'rejected';
  ok: boolean;
  body?: T;
}

/** La part de `Response` dont ce module a besoin — structurelle, donc simulable. */
interface ReponseLisible {
  ok: boolean;
  json(): Promise<unknown>;
}

/**
 * Lit un résultat de `Promise.allSettled` et rend une issue.
 *
 * ⚠️ `json()` PEUT LANCER sur un corps illisible, et c'est un troisième cas
 * pratique du chemin LANCÉ : il est rattrapé ici plutôt que de faire sauter
 * l'ensemble du chargement.
 */
export async function readSettledRegister<T>(
  settled: PromiseSettledResult<ReponseLisible>,
): Promise<RegisterFetchOutcome<T>> {
  if (settled.status === 'rejected') {
    return { status: 'rejected', ok: false };
  }
  if (!settled.value.ok) {
    return { status: 'fulfilled', ok: false };
  }
  try {
    return { status: 'fulfilled', ok: true, body: (await settled.value.json()) as T };
  } catch {
    return { status: 'rejected', ok: false };
  }
}

/**
 * Sépare ce qui a chargé de ce qui a échoué.
 *
 * ★ `failed` est un COMPTE, pas une liste de noms : nommer le registre fautif
 * demanderait un titre côté client, donc une seconde source de titres — les
 * titres vivent dans les routes, et ce lot a passé six commits à fondre les
 * sources en une. L'utilisateur saura qu'il en manque un, ce qui suffit pour ne
 * pas signer un livre incomplet.
 */
export function partitionRegisterLoads<K extends string, T>(
  outcomes: Record<K, RegisterFetchOutcome<T>>,
): { loaded: Partial<Record<K, T>>; failed: number } {
  const loaded: Partial<Record<K, T>> = {};
  let failed = 0;
  for (const cle of Object.keys(outcomes) as K[]) {
    const issue = outcomes[cle];
    if (issue.status === 'fulfilled' && issue.ok && issue.body !== undefined) {
      loaded[cle] = issue.body;
    } else {
      failed += 1;
    }
  }
  return { loaded, failed };
}
