import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TITLE_FR_MAP: Record<string, string> = {
  president: 'Président·e',
  vice_president: 'Vice-président·e',
  secretary: 'Secrétaire',
  treasurer: 'Trésorier·ère',
  director_general: 'Directeur·rice général·e',
}

export async function GET() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'No company' }, { status: 404 })

  const { data: people } = await supabase
    .from('company_people')
    .select('*, officer_appointments(*)')
    .eq('company_id', company.id)

  const entries = (people || [])
    .filter((p: any) => p.officer_appointments && p.officer_appointments.length > 0)
    .flatMap((p: any) =>
      p.officer_appointments.map((m: any) => ({
        full_name: p.full_name,
        title: m.title === 'custom'
          ? (m.custom_title || m.title)
          : (TITLE_FR_MAP[m.title] || m.title),
        appointment_date: m.appointment_date,
        end_date: m.end_date || null,
        is_active: m.is_active,
      }))
    )
    .sort((a: any, b: any) => {
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      return new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
    })

  return NextResponse.json({
    register_title_fr: 'Registre des dirigeants',
    register_title_en: 'Officer Register',
    entries,
  })
}
