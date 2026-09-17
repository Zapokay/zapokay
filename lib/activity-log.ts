import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Écrit une ligne d'Historique. NE LÈVE JAMAIS : un journal en échec ne doit pas
 * défaire le geste qu'il consigne. Cette intention-là était juste et ne change pas.
 *
 * ⚠️ POURQUOI LE `try/catch` SEUL NE SUFFISAIT PAS. supabase-js NE LÈVE PAS sur
 * une erreur Postgres — il RETOURNE `{ error }`. Ce retour n'était jamais lu, donc
 * un rejet par la contrainte `activity_log_event_type_check` (un `event_type` hors
 * des valeurs admises) ne produisait NI exception, NI ligne de console, NI effet
 * visible : le geste avait lieu, rien n'était consigné, et personne ne le savait.
 * Le `catch` reste — une panne réseau, elle, lève réellement. Il y a deux chemins
 * d'échec ; un seul était surveillé.
 *
 * ⚠️ LA TRACE EST AU MIEUX, ET C'EST ASSUMÉ. Quand l'insert échoue, l'action
 * principale a DÉJÀ eu lieu et rien ne la défait. On ne peut donc que le dire à la
 * console, avec de quoi diagnostiquer : le type d'événement et la société.
 */
export async function logActivity(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  eventType: string,
  titleFr: string,
  titleEn: string,
  details?: Record<string, any>
) {
  // ★★ LE NOM DE L'AUTEUR EST GELÉ ICI, ET NULLE PART AILLEURS.
  //
  // ⛔ POURQUOI GELER, ALORS QUE `user_id` EST DÉJÀ LÀ. Mesuré le 2026-09-17 :
  //    `activity_log.user_id → users(id)` est ON DELETE SET NULL, et
  //    `users.id → auth.users(id)` est ON DELETE CASCADE. Supprimer un compte
  //    met donc `user_id` à NULL — la LIGNE survit, l'AUTEUR disparaît, en
  //    silence et sans pierre tombale. Un registre PARTAGÉ dont l'auteur
  //    s'efface quand quelqu'un quitte l'entreprise ne remplit pas sa fonction.
  //    ⚪ La contrainte reste telle quelle : une fois le nom gelé, elle perd le
  //    LIEN, pas le FAIT. C'est le bon comportement.
  //
  // ★ ICI ET PAS AUX APPELANTS : 23 sites appellent cette fonction et TROIS
  //   seulement ont le nom en main. Le geler au bon endroit coûte une lecture ;
  //   le geler aux appelants coûterait vingt modifications et dix-neuf oublis
  //   possibles. Le lot qui branchera les chemins non journalisés en héritera
  //   sans y penser — c'est le but.
  //
  // ⛔⛔ ET CETTE LECTURE NE FAIT JAMAIS ÉCHOUER LA LIGNE. Si elle rate, la
  //   ligne s'écrit SANS nom gelé : `user_id` y est toujours, donc la
  //   résolution par la route fonctionne tant que la personne est là. Perdre le
  //   gel dégrade l'avenir ; perdre la ligne perdrait le fait. On choisit le
  //   moindre. Même intention que le `try/catch` ci-dessous, une couche plus tôt.
  let detailsAvecAuteur = details || {}
  try {
    const { data: auteur } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const nom = (auteur?.full_name as string | null | undefined)?.trim()
    if (nom) detailsAvecAuteur = { ...detailsAvecAuteur, author_full_name: nom }
  } catch {
    // Silencieux et assumé : voir le paragraphe ci-dessus. La ligne prime.
  }

  try {
    const { error } = await supabase.from('activity_log').insert({
      company_id: companyId,
      user_id: userId,
      event_type: eventType,
      title_fr: titleFr,
      title_en: titleEn,
      details: detailsAvecAuteur,
    })
    if (error) {
      console.error(
        `[activity-log] Insert refusé — event_type="${eventType}" company_id=${companyId}. ` +
          `L'action a eu lieu ; elle n'est PAS consignée.`,
        error,
      )
    }
  } catch (error) {
    // Never block the main action if logging fails
    console.error('[activity-log] Failed to log activity:', error)
  }
}
