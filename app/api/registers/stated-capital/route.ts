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
    .select('id, incorporation_type')
    .eq('user_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'No company' }, { status: 404 })

  // Mirrors the shareholders register (auth → resolve company → select → JS
  // aggregate → bilingual JSON). This route COMPUTES the issued-and-paid-up
  // stated capital account (art. 68 LSAQ / s.26 CBCA) per share class.
  const { data: shareholdings } = await supabase
    .from('shareholdings')
    .select(`
      share_class_id,
      quantity,
      issue_price_per_share,
      source,
      end_reason,
      end_date,
      share_classes(name)
    `)
    .eq('company_id', company.id)

  // Per-class accumulation. Capital model:
  //   capital_in  = Σ(quantity × price) over DIRECT ISSUANCES with a price
  //   capital_out = Σ(quantity × price) over REDEMPTIONS + CANCELLATIONS with a price
  //   stated_capital = capital_in − capital_out
  // Transfers (source='transfer') are capital-neutral: excluded from capital_in
  // by the source filter, and from capital_out by the end_reason filter
  // (transfers carry end_reason='transfer', not 'redemption'/'cancellation').
  // A direct issuance with a NULL price is SKIPPED from the sum and COUNTED in
  // issuances_missing_price so the card (Build 2) can flag it — never silently 0.
  const byClass = new Map<string, {
    class_name: string
    capital_in: number
    capital_out: number
    issuances_missing_price: number
  }>()

  for (const sh of (shareholdings || []) as any[]) {
    const classId = sh.share_class_id
    const className = sh.share_classes?.name || 'Classe A'
    const entry = byClass.get(classId) ?? {
      class_name: className,
      capital_in: 0,
      capital_out: 0,
      issuances_missing_price: 0,
    }

    const qty = Number(sh.quantity) || 0
    const priceRaw = sh.issue_price_per_share
    const hasPrice =
      priceRaw !== null && priceRaw !== undefined && priceRaw !== ''
    const price = hasPrice ? Number(priceRaw) : null
    const priceValid = price !== null && Number.isFinite(price)

    // capital_in: direct issuances. With a valid price → add; else count as missing.
    if (sh.source === 'direct_issuance') {
      if (priceValid) {
        entry.capital_in += qty * (price as number)
      } else {
        entry.issuances_missing_price += 1
      }
    }

    // capital_out: redemptions + cancellations with a valid price (capital leaving).
    if (
      (sh.end_reason === 'redemption' || sh.end_reason === 'cancellation') &&
      priceValid
    ) {
      entry.capital_out += qty * (price as number)
    }

    byClass.set(classId, entry)
  }

  // No currency column in the schema; Canadian corporate context (LSAQ + CBCA).
  const CURRENCY = 'CAD'
  const entries = Array.from(byClass.values())
    .map((e) => ({
      class_name: e.class_name,
      stated_capital: e.capital_in - e.capital_out,
      currency: CURRENCY,
      issuances_missing_price: e.issuances_missing_price,
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name))

  // Framework resolution mirrors lib/priority.ts / generate-lifecycle-document.ts:
  // anything not CBCA is the Quebec regime (LSAQ / FR: LCSA for the federal term).
  const isCBCA = company.incorporation_type === 'CBCA'
  // ✅ GREEN — Harvey-verified 2026-06-25 — stated-capital citation (art.68 LSAQ / s.26 CBCA): art.68 maintains the account, s.26(1) CBCA equivalent. Lawyer-final pending.
  const citation_fr = isCBCA
    ? 'Compte capital déclaré tenu en vertu de l\'art. 26 LCSA.'
    : 'Compte de capital-actions émis et payé tenu en vertu de l\'art. 68 LSAQ.'
  const citation_en = isCBCA
    ? 'Stated capital account maintained under CBCA s. 26.'
    : 'Issued and paid-up share capital account maintained under LSAQ art. 68.'

  return NextResponse.json({
    register_title_fr: isCBCA ? 'Compte capital déclaré' : 'Compte de capital-actions émis et payé',
    register_title_en: isCBCA ? 'Stated Capital Account' : 'Issued and Paid-Up Share Capital Account',
    citation_fr,
    citation_en,
    entries,
  })
}
