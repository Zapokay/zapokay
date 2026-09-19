import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

/**
 * ⛔⛔ SONDE TEMPORAIRE — LOT P, SECONDE ET DERNIÈRE VERSION.
 * ELLE SORT AUJOURD'HUI, ET LE COMPTE DE ROUTES DOIT RETOMBER DE 41 À 40.
 *
 * ⚖️ DOM, 2026-09-19 : « je suspends ma contrainte de retrait dans la même
 * session — la redéployer coûterait deux lots ». Elle est donc ÉTENDUE une
 * fois, pas remplacée, pour répondre à P-5 … P-11 en UNE lecture.
 *
 * ⚠️ ET LA LECTURE PRÉCÉDENTE EST SUSPECTE, DOM L'A DIT : `ageInstanceMs`
 * valait 1919 — l'instance avait DEUX SECONDES, c'était un DÉMARRAGE À FROID.
 * Aucun de ces chiffres n'est permanent tant qu'une seconde lecture, sur
 * instance CHAUDE, ne les a pas confirmés. La réponse redonne `ageInstanceMs`
 * en tête pour que la comparaison soit possible.
 *
 * ⛔ CLAUDE NE PEUT PAS L'APPELER — §371. Sans cookie de session, 401 ;
 * chronométrer un 401 est l'erreur du lot L-9.
 * ⚪ Aucune donnée métier ne sort : des durées, des compteurs, des en-têtes de
 * réponse, et l'EN-TÊTE du jeton (`alg`, `kid`) — jamais sa charge utile.
 */

const MODULE_CHARGE_A = Date.now()
const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10

function stats(v: number[]) {
  const t = [...v].sort((a, b) => a - b)
  return {
    n: t.length,
    min: t[0],
    mediane: t[Math.floor(t.length / 2)],
    max: t[t.length - 1],
    toutes: v,
  }
}

export async function GET() {
  const supabase = createClient()

  // ① Premier appel — le même que dans toute route de ce dépôt.
  const t1 = performance.now()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const msPremierGetUser = ms(t1)

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  /* ⛔ P-6 — L'ORDRE EST INVERSÉ EXPRÈS, ET C'EST TOUT L'INTÉRÊT.
     Première lecture : `users` 500 ms, `companies` 204 ms. Or `users` a SIX
     colonnes et 89 octets par ligne ; `companies` en a VINGT-HUIT et 257. La
     table la plus PETITE coûtait 2,5× la plus grosse, et leurs politiques RLS
     sont de forme identique (`auth.uid() = id` / `= user_id`, sans
     sous-requête). Le volume et la RLS sont donc éliminés.
     ★ RESTE LA POSITION : `users` était le PREMIER appel `/rest/v1`. En
     l'inversant, le coût suit soit la TABLE, soit le RANG. Un seul des deux
     est possible, et la réponse le dit sans interprétation. */
  const t2 = performance.now()
  await supabase.from('companies').select('*').eq('user_id', user.id).eq('status', 'active').single()
  const msCompaniesEnPremier = ms(t2)

  const t3 = performance.now()
  await supabase.from('users').select('*').eq('id', user.id).single()
  const msUsersEnSecond = ms(t3)

  // P-3 (rappel) — l'aller-retour le moins cher possible, cinq fois.
  const allerRetourNu: number[] = []
  for (let i = 0; i < 5; i++) {
    const t = performance.now()
    await supabase.from('users').select('id').eq('id', user.id).single()
    allerRetourNu.push(ms(t))
  }

  /* ⛔ P-8 — UNE DISTRIBUTION, PAS DEUX POINTS. Vingt `getUser()` d'affilée.
     ★ CE QUE LA FORME DIRA : une queue longue et irrégulière = limitation de
     débit ; un plateau haut et régulier = un coût structurel par appel. */
  const getUserVingt: number[] = []
  for (let i = 0; i < 20; i++) {
    const t = performance.now()
    await supabase.auth.getUser()
    getUserVingt.push(ms(t))
  }

  /* ⛔ P-11 — LA VÉRIFICATION LOCALE EXISTE-T-ELLE POUR NOUS, EN FAIT ?
     `getClaims()` est présent dans @supabase/auth-js 2.100.0. Il vérifie le
     jeton SANS RÉSEAU si l'algorithme est asymétrique et que le jeton porte un
     `kid` ; sinon il RETOMBE sur `getUser()`, donc sur le réseau
     (GoTrueClient.js:2977-2985). Le projet publie bien un JWKS ES256 — mais
     ça ne dit pas avec quelle clé NOS jetons d'accès sont signés.
     ★ La réponse rend l'EN-TÊTE du jeton (`alg`, `kid`, jamais la charge) et
     vingt `getClaims()` chronométrés. Si l'un est à ~0 ms et l'autre à 400,
     le remède est établi par la mesure et non par la doc. */
  const { data: sess } = await supabase.auth.getSession()
  const jeton = sess.session?.access_token ?? ''
  let enteteJeton: unknown = null
  try {
    enteteJeton = JSON.parse(
      Buffer.from(jeton.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    )
  } catch {
    enteteJeton = 'illisible'
  }

  const getClaimsVingt: number[] = []
  let claimsOk = false
  for (let i = 0; i < 20; i++) {
    const t = performance.now()
    const r = await supabase.auth.getClaims()
    getClaimsVingt.push(ms(t))
    claimsOk = !r.error
  }

  /* ⛔ P-10 — LES EN-TÊTES DE GoTrue, qu'aucun appel du SDK n'expose.
     Un `fetch` brut sur le même point d'entrée, avec le même jeton. */
  const tRaw = performance.now()
  const rep = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
    },
    cache: 'no-store',
  })
  const msFetchBrut = ms(tRaw)
  const enTetes: Record<string, string> = {}
  rep.headers.forEach((v, k) => {
    if (/ratelimit|retry-after|cf-ray|cf-cache|x-sb|server|date|age/i.test(k)) enTetes[k] = v
  })

  return NextResponse.json({
    sonde: 'zz-sonde-latence v2 · LOT P · à retirer aujourd hui',
    region: process.env.VERCEL_REGION ?? 'inconnue',
    ageInstanceMs: Date.now() - MODULE_CHARGE_A,

    P6_lOrdreEstInverse: {
      note: 'companies AVANT users, cette fois. 1re lecture : users 500, companies 204.',
      premierAppelRest_companies: msCompaniesEnPremier,
      secondAppelRest_users: msUsersEnSecond,
    },

    P3_allerRetourNu: {
      cinq_mesures: allerRetourNu,
      mediane_des_quatre_suivantes: stats(allerRetourNu.slice(1)).mediane,
    },

    P8_getUser_vingt: { premier_appel_de_la_requete: msPremierGetUser, ...stats(getUserVingt) },

    P11_getClaims_vingt: { ...stats(getClaimsVingt), sansErreur: claimsOk, enteteDuJeton: enteteJeton },

    P10_enTetesGoTrue: { statut: rep.status, ms: msFetchBrut, enTetes },
  })
}
