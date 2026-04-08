import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    .select('*, director_mandates(*)')
    .eq('company_id', company.id)

  const entries = (people || [])
    .filter((p: any) => p.director_mandates && p.director_mandates.length > 0)
    .flatMap((p: any) =>
      p.director_mandates.map((m: any) => ({
        full_name: p.full_name,
        address: p.address_line1 ? `${p.address_line1}, ${p.address_city || ''}`.trim().replace(/,$/, '') : '',
        is_canadian_resident: p.is_canadian_resident ?? true,
        appointment_date: m.appointment_date,
        end_date: m.end_date || null,
        end_reason: m.end_reason || null,
        is_active: m.is_active,
      }))
    )
    .sort((a: any, b: any) => {
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      return new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
    })

  return NextResponse.json({
    register_title_fr: 'Registre des administrateurs',
    register_title_en: 'Director Register',
    entries,
  })
}
