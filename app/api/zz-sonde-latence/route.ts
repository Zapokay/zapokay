import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * ⛔⛔ SONDE TEMPORAIRE — LOT P. ELLE DOIT ÊTRE RETIRÉE DANS LA MÊME SESSION.
 *
 * ⚖️ AUTORISÉE PAR DOM, 2026-09-19, avec ses bornes : « une route qui ne rend
 * QUE des durées — aucune donnée métier dans la réponse », « elle exige
 * l'authentification comme toutes les autres », « retire la sonde dans la même
 * session, elle ne dort pas en production au cas où ».
 *
 * ★★ CE QU'ELLE MESURE, ET POURQUOI ELLE EXISTE : le PLANCHER de
 * l'application. Tout point d'entrée serveur de ce dépôt commence par les
 * mêmes appels sérialisés vers Montréal — le layout du tableau de bord en fait
 * TROIS, les quatre routes lentes de la cascade de Dom en font DEUX — avant le
 * moindre travail utile. Le `EXPLAIN ANALYZE` à 1,6 ms du lot L mesurait la
 * requête finale ; il n'a jamais vu ce préambule.
 *
 * ⛔ ELLE NE PEUT PAS ÊTRE APPELÉE PAR CLAUDE — §371. Sans cookie de session
 * elle répond 401, et chronométrer un 401 est exactement l'erreur du lot L-9
 * (« mes appels curl mesuraient un contrôle d'authentification qui échoue, pas
 * le travail de la route »). C'est Dom qui l'ouvre, connecté.
 *
 * ⚪ AUCUNE DONNÉE MÉTIER NE SORT : les trois lectures sont faites, leurs
 * RÉSULTATS sont jetés, seules les durées sont renvoyées. Le seul booléen
 * exposé dit si la ligne existait — sans quoi une durée de 3 ms serait
 * indistinguable d'une requête qui n'a rien trouvé.
 */

/** ⚪ Fixé au CHARGEMENT DU MODULE, pas à la requête : l'écart avec `Date.now()`
 *  au moment de l'appel donne l'âge de l'instance. Proche de zéro = démarrage à
 *  froid, et c'est l'hypothèse que le lot L n'a jamais pu éliminer. */
const MODULE_CHARGE_A = Date.now()

const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10

export async function GET() {
  const tTotal = performance.now()
  const supabase = createClient()

  // ① auth.getUser() — réseau vers GoTrue, vérification du jeton côté serveur
  const t1 = performance.now()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const msAuthGetUser = ms(t1)

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ② users.select('*').single() — la lecture de `getUserWithProfile`
  const t2 = performance.now()
  const { data: profil } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  const msUsersSelect = ms(t2)

  // ③ companies.select('*').single() — la lecture de `getActiveCompany`
  const t3 = performance.now()
  const { data: societe } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  const msCompaniesSelect = ms(t3)

  const msPlancher = ms(tTotal)

  /* ⛔ P-3 — LE COÛT D'UN ALLER-RETOUR NU, ISOLÉ DU TRAVAIL DE LA BASE.
     La requête la moins chère qu'on puisse poser : une colonne, une ligne, sur
     un index primaire. Ce qui reste est le réseau + TLS + PostgREST.
     ★ CINQ FOIS DE SUITE, ET C'EST LE POINT : la première porte l'établissement
     de la connexion, les suivantes non. L'écart entre la 1re et la médiane des
     quatre autres sépare la POIGNÉE DE MAIN de la LATENCE D'EXPLOITATION —
     sans quoi on attribuerait à la distance un coût payé une seule fois. */
  const allerRetourNu: number[] = []
  for (let i = 0; i < 5; i++) {
    const t = performance.now()
    await supabase.from('users').select('id').eq('id', user.id).single()
    allerRetourNu.push(ms(t))
  }

  const tries = [...allerRetourNu.slice(1)].sort((a, b) => a - b)
  const medianeApresLaPremiere = tries[Math.floor(tries.length / 2)]

  return NextResponse.json({
    sonde: 'zz-sonde-latence · LOT P · à retirer dans la même session',
    region: process.env.VERCEL_REGION ?? 'inconnue',
    ageInstanceMs: Date.now() - MODULE_CHARGE_A,
    plancherDeLApplication: {
      auth_getUser: msAuthGetUser,
      users_select_single: msUsersSelect,
      companies_select_single: msCompaniesSelect,
      total_les_trois_serialises: msPlancher,
    },
    allerRetourNu: {
      cinq_mesures: allerRetourNu,
      premiere_avec_poignee_de_main: allerRetourNu[0],
      mediane_des_quatre_suivantes: medianeApresLaPremiere,
    },
    lignesTrouvees: { profil: profil !== null, societe: societe !== null },
  })
}
