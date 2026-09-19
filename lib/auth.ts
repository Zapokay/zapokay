import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Request-level memoization (React cache): within ONE server request, every
// caller (layout + page + nested server components) shares a single
// auth verification and a single users-profile read.
//
// cache() is per-REQUEST, NOT a module-level singleton — there is no cross-
// request or cross-user leakage. This changes only HOW MANY times auth/profile
// are read per request, never WHAT is read or its freshness: the underlying
// createClient() keeps its no-store posture untouched.

/**
 * ⚖️ LE RENDU VÉRIFIE LOCALEMENT — DOM, 2026-09-19, lot R.
 *
 * ★★ CE QUI CHANGE : `getUser()` interrogeait le serveur d'authentification à
 *   chaque rendu — un aller-retour vers Montréal dont la réponse ne servait
 *   qu'à lire `id` et `email`. `getClaims()` vérifie la SIGNATURE du jeton
 *   localement, avec la clé publique du projet. Aucun réseau quand la clé est
 *   en mémoire.
 *
 * ⛔⛔ LA CONSÉQUENCE, ACCEPTÉE PAR DOM ET ÉCRITE ICI PARCE QU'ELLE EST LA
 *   RAISON D'ÊTRE DE CETTE NOTE : une vérification locale ne sait pas qu'une
 *   session a été RÉVOQUÉE. Un accès révoqué — déconnexion ailleurs, mot de
 *   passe changé, compte banni ou supprimé — continuerait de passer ICI
 *   jusqu'à l'expiration du jeton, soit AU PLUS UNE HEURE (durée mesurée sur
 *   `auth.refresh_tokens` au lot P : grappe de 8 intervalles entre 3481 et
 *   3500 s, plus la marge de 90 s du SDK).
 *
 *   ⭐ ET CE QU'IL VERRAIT EST UN CADRE VIDE, PAS UN ACCÈS. Les 12 routes de
 *   lecture et les 5 routes d'écriture gardent `getUser()` : elles refusent
 *   IMMÉDIATEMENT. La coquille s'afficherait, et chaque panneau qu'elle
 *   contient répondrait 401. Aucune donnée du livre de minutes ne sort.
 *
 *   ⛔ DONC : QUICONQUE VOUDRA UN JOUR « ALIGNER » LES ROUTES SUR LA COQUILLE
 *   DOIT LIRE CETTE LIGNE D'ABORD. L'arbitrage de Dom tient précisément parce
 *   que les deux moitiés ne sont PAS alignées. Les aligner supprimerait la
 *   seule chose qui rend cette fenêtre d'une heure acceptable.
 *
 * ⚠️ CE QUE JE NE PEUX PAS PROUVER, §373 : une révocation réelle demande une
 *   session révoquée ET un jeton encore valide — donc une manipulation en
 *   production, pas une porte. Les portes de ce dépôt prouvent que le rendu
 *   compile et que les champs consommés existent ; elles ne prouvent RIEN sur
 *   le comportement après révocation. ⛔ Si un utilisateur déconnecté voit
 *   encore la coquille, c'est NORMAL et c'est ici qu'il faut revenir — pas un
 *   bogue, une conséquence écrite d'avance.
 */

/**
 * ⛔ LE TYPE EST ÉTROIT EXPRÈS, ET C'EST LA GARDE DE CE LOT.
 *
 * `getClaims()` ne rend PAS un objet `User` : il rend un `JwtPayload` —
 * `sub`, `email`, `role`, `exp`, `session_id`… — sans `created_at`, sans
 * `identities`, sans `last_sign_in_at`. La substitution n'est donc PAS
 * mécanique, et un type large aurait laissé passer un `user.created_at` qui
 * vaudrait `undefined` à l'exécution.
 *
 * ★ MESURÉ AVANT L'ÉDITION : le chemin de rendu ne lit que DEUX champs —
 * `id` (6 sites) et `email` (1 site, `dashboard/settings/page.tsx:21`), plus
 * la simple présence (14 `if (!user)`). Ce type les déclare, et RIEN d'autre :
 * le compilateur refusera le jour où quelqu'un en voudra un troisième, et
 * c'est exactement ce qu'on veut qu'il fasse.
 */
export type UtilisateurDuRendu = { id: string; email: string | null }

type OptionsDeGetClaims = NonNullable<
  Parameters<ReturnType<typeof createClient>['auth']['getClaims']>[1]
>
type JeuDeClesPubliques = NonNullable<OptionsDeGetClaims['jwks']>

/**
 * ⛔⛔ LE PIÈGE QUE CE CACHE DÉSAMORCE — SANS LUI, CE LOT NE GAGNE RIEN.
 *
 * Le SDK cache déjà le JWKS… mais dans `this.jwks`, un champ D'INSTANCE
 * (`GoTrueClient.js:144-146`), et `lib/supabase/server.ts` construit un client
 * NEUF à chaque appel. Le cache du SDK naît donc vide à chaque requête, et
 * `fetchJwk` (`:2928`) irait chercher `/.well-known/jwks.json` sur le réseau
 * À CHAQUE RENDU.
 *
 * ⛔ UN REMPLACEMENT NAÏF AURAIT DONC TROQUÉ UN APPEL RÉSEAU CONTRE UN AUTRE,
 * et la mesure de Dom n'aurait rien montré. Mesuré par lecture de la source
 * avant d'écrire une ligne.
 *
 * ★ CE CACHE-CI EST AU NIVEAU DU MODULE : il survit ENTRE les requêtes d'une
 * même instance, ce que `cache()` de React ne fait pas et ne doit pas faire.
 * ⚪ C'est licite parce qu'un JWKS est PUBLIC et IDENTIQUE pour tous : aucune
 * donnée d'utilisateur ne transite ici, donc aucune fuite entre sessions —
 * la raison même pour laquelle `cache()` est exigé partout ailleurs dans ce
 * fichier ne s'applique pas à une clé publique.
 * ⚪ TTL de 10 minutes : la valeur du SDK lui-même (`JWKS_TTL`, 600 000 ms),
 * reprise pour ne pas inventer une politique de rotation concurrente.
 */
const JWKS_TTL_MS = 600_000
let jwksEnCache: JeuDeClesPubliques | null = null
let jwksMisEnCacheA = 0

async function jwksDuProjet(): Promise<JeuDeClesPubliques | undefined> {
  const maintenant = Date.now()
  if (jwksEnCache && jwksMisEnCacheA + JWKS_TTL_MS > maintenant) return jwksEnCache
  try {
    const reponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: 'no-store',
      }
    )
    if (!reponse.ok) return undefined
    const jeu = (await reponse.json()) as JeuDeClesPubliques
    if (!jeu?.keys?.length) return undefined
    jwksEnCache = jeu
    jwksMisEnCacheA = maintenant
    return jeu
  } catch {
    // ⚪ ÉCHEC = ON NE PASSE RIEN, ET C'EST UNE DÉGRADATION SÛRE : `getClaims`
    // retombe alors sur son propre `fetchJwk`, donc sur le réseau. Plus lent,
    // jamais faux. Ne PAS transformer ça en `throw` : une panne du point
    // d'entrée JWKS ne doit pas déconnecter tout le monde.
    return undefined
  }
}

export const getUser = cache(async (): Promise<UtilisateurDuRendu | null> => {
  const supabase = createClient()

  /* ⚪ ET SI LE PROJET REVENAIT À UNE SIGNATURE SYMÉTRIQUE (HS256), CE CODE
     RESTE CORRECT : `getClaims` teste l'algorithme et, faute de clé
     asymétrique, RETOMBE sur `getUser(token)` — donc sur le réseau
     (`GoTrueClient.js:2977-2985`). On perdrait le gain, jamais la
     vérification. ⛔ Ne pas « simplifier » en supposant ES256 acquis. */
  const { data, error } = await supabase.auth.getClaims(undefined, {
    jwks: await jwksDuProjet(),
  })

  const sub = data?.claims?.sub
  if (error || !sub) return null

  const email = data.claims.email
  return { id: sub, email: typeof email === 'string' ? email : null }
})

export const getUserWithProfile = cache(async () => {
  const user = await getUser()
  if (!user) return { user: null, profile: null }
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  return { user, profile }
})
