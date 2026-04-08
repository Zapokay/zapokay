import { SupabaseClient } from '@supabase/supabase-js'

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
    await supabase.from('activity_log').insert({
      company_id: companyId,
      user_id: userId,
      event_type: eventType,
      title_fr: titleFr,
      title_en: titleEn,
      details: details || {},
    })
  } catch (error) {
    // Never block the main action if logging fails
    console.error('[activity-log] Failed to log activity:', error)
  }
}
