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
  try {
    const { error } = await supabase.from('activity_log').insert({
      company_id: companyId,
      user_id: userId,
      event_type: eventType,
      title_fr: titleFr,
      title_en: titleEn,
      details: details || {},
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
