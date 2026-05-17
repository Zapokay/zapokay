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

  // Atom 2: inverted-join shape per R-G2 audit §3 R6 recommendation. One
  // register entry per (shareholding × holder) tuple. Supports entity +
  // joint holders naturally (atom 3+ surfaces them in the UI); for atom 2's
  // deployed state with only individual single-holder rows, semantics are
  // identical to the prior forward-join output. Response shape preserved
  // (BinderView consumes { register_title_fr, register_title_en, entries }
  // with entries[].full_name / share_class / quantity / certificate_number /
  // issue_date / issue_price_per_share — unchanged from pre-atom-2).
  const { data: shareholdings } = await supabase
    .from('shareholdings')
    .select(`
      *,
      share_classes(*),
      shareholding_holders(
        holder_type, display_order,
        person:company_people(*),
        entity:shareholder_entities(*)
      )
    `)
    .eq('company_id', company.id)

  const entries = (shareholdings || [])
    .flatMap((sh: any) => {
      const holders = (sh.shareholding_holders ?? []) as Array<{
        holder_type: 'individual' | 'entity'
        display_order: number
        person: { full_name: string } | null
        entity: { legal_name: string } | null
      }>
      // Sort holders by display_order so joint-holder entries surface in the
      // intended order (primary holder first per atom 1 §3 display_order).
      const sortedHolders = [...holders].sort(
        (a, b) => a.display_order - b.display_order
      )
      return sortedHolders.map((h) => ({
        full_name:
          h.person?.full_name ?? h.entity?.legal_name ?? '(unknown holder)',
        share_class: sh.share_classes?.name || 'Classe A',
        quantity: sh.quantity,
        certificate_number: sh.certificate_number || null,
        issue_date: sh.issue_date,
        issue_price_per_share: sh.issue_price_per_share ?? null,
      }))
    })
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
