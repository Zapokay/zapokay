import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import type { Company } from '@/lib/types'

/**
 * LA SOCIÉTÉ ACTIVE DE L'UTILISATEUR — UNE LECTURE PAR REQUÊTE, PARTAGÉE.
 *
 * ⚖️ Extrait le 2026-09-19, quand `DashboardShell` est passé dans un
 * `layout.tsx`. Sans ce module, le layout ET la page auraient lu `companies`
 * chacun de leur côté : deux allers-retours vers Montréal pour la même ligne,
 * à chaque chargement des neuf pages.
 *
 * ★ `cache()` DE REACT, EXACTEMENT COMME `getUserWithProfile` — et la
 * mémoïsation y est déjà décrite pour ce cas : « within ONE server request,
 * every caller (layout + page + nested server components) shares a single
 * round-trip ». La phrase visait ce lot avant qu'il existe ; on l'applique à la
 * société.
 *
 * ⛔ PAR REQUÊTE, PAS UN SINGLETON DE MODULE : aucune fuite entre requêtes ni
 * entre utilisateurs. Ça change COMBIEN de fois on lit, jamais CE QU'ON lit.
 *
 * ⛔ LA REQUÊTE EST REPRISE AU CARACTÈRE PRÈS DES NEUF PAGES, qui la portaient
 * toutes les neuf à l'identique — mesuré avant l'extraction :
 * `select('*')` · `eq('user_id', …)` · `eq('status','active')` · `single()`.
 * ⚠️ `select('*')` EST CONSERVÉ, ET CE N'EST PAS UNE PARESSE : l'objet part
 * ENTIER dans `DashboardShell` et dans le contenu de plusieurs pages (jusqu'à
 * 19 mentions sur le tableau de bord). Nommer des colonnes exigerait de prouver
 * chacune non lue à travers toute la coquille — la mesure du lot J a conclu
 * qu'on ne peut pas la faire à l'œil, et rien n'a changé depuis.
 *
 * ⛔ AUCUN `ORDER BY`, ET C'EST LA RÈGLE DÉJÀ ÉCRITE DANS LES PAGES : deux
 * sociétés actives doivent être IMPOSSIBLES, et un cas impossible doit
 * ÉCHOUER — pas être rendu déterministe. `single()` lève ; c'est voulu.
 */
export const getActiveCompany = cache(async (): Promise<Company | null> => {
  const user = await getUser()
  if (!user) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  return (data as Company) ?? null
})
