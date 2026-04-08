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
    .select('*, shareholdings(*, share_classes(*))')
    .eq('company_id', company.id)

  const entries = (people || [])
    .filter((p: any) => p.shareholdings && p.shareholdings.length > 0)
    .flatMap((p: any) =>
      p.shareholdings.map((h: any) => ({
        full_name: p.full_name,
        share_class: h.share_classes?.name || 'Classe A',
        quantity: h.quantity,
        certificate_number: h.certificate_number || null,
        issue_date: h.issue_date,
        issue_price_per_share: h.issue_price_per_share ?? null,
      }))
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
    )

  return NextResponse.json({
    register_title_fr: 'Registre des actionnaires',
    register_title_en: 'Shareholder Register',
    entries,
  })
}
