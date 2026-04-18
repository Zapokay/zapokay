import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirementToDocType, type VaultDocType } from '@/lib/requirement-doctype'

export interface ChecklistItem {
  id: string
  requirement_key: string
  category: 'foundational' | 'annual'
  title_fr: string
  title_en: string
  description_fr: string | null
  description_en: string | null
  section: string
  sort_order: number
  can_generate: boolean
  can_upload: boolean
  year: number | null
  satisfied: boolean
  source?: 'uploaded' | 'generated' | null
  /** Derived server-side via `requirementToDocType` — see lib/requirement-doctype.ts. */
  document_type: VaultDocType
}

export interface CompletenessResponse {
  score: number
  totalRequired: number
  totalSatisfied: number
  totalMissing: number
  checklist: ChecklistItem[]
  fiscalYears: { year: number; start_year: number; end_year: number }[]
}

export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Get user's active company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, incorporation_type, fiscal_year_end_month, fiscal_year_end_day')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Aucune société trouvée' }, { status: 404 })
    }

    const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'
    const fyEndMonth = (company.fiscal_year_end_month as number | null) ?? 12

    // 1. Get all applicable requirements
    const { data: requirements, error: reqError } = await supabase
      .from('minute_book_requirements')
      .select('*')
      .or(`framework.eq.${framework},framework.eq.ALL`)
      .order('sort_order')

    if (reqError) {
      return NextResponse.json({ error: reqError.message }, { status: 500 })
    }

    // 2. Get all active fiscal years
    const { data: fiscalYears, error: fyError } = await supabase
      .from('company_fiscal_years')
      .select('year')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .order('year', { ascending: false })

    if (fyError) {
      return NextResponse.json({ error: fyError.message }, { status: 500 })
    }

    // 3. Get all company documents with requirement_key
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('requirement_key, requirement_year, source')
      .eq('company_id', company.id)
      .eq('status', 'active')
      .not('requirement_key', 'is', null)

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    // 4. Compute display years for each fiscal year
    // Convention: "Exercice 2025–2026" = the year starting in 2025 and ending in 2026
    const fyFormatted = (fiscalYears || []).map((fy: { year: number }) => ({
      year: fy.year,
      start_year: fy.year - 1,
      end_year: fy.year,
    }))

    type RawReq = {
      id: string; requirement_key: string; category: 'foundational' | 'annual'; title_fr: string; title_en: string;
      description_fr: string | null; description_en: string | null; section: string;
      sort_order: number; can_generate: boolean; can_upload: boolean;
    }
    type RawDoc = { requirement_key: string; requirement_year: number | null; source: string | null }

    // 5. Build checklist
    const foundationalReqs = (requirements || []).filter((r: RawReq) => r.category === 'foundational')
    const annualReqs = (requirements || []).filter((r: RawReq) => r.category === 'annual')

    const checklist: ChecklistItem[] = []
    let totalRequired = 0
    let totalSatisfied = 0

    // Foundational items
    for (const req of foundationalReqs as RawReq[]) {
      const matchingDoc = (documents || []).find((d: RawDoc) => d.requirement_key === req.requirement_key)
      const satisfied = !!matchingDoc
      checklist.push({
        ...req,
        year: null,
        satisfied,
        source: (matchingDoc?.source as 'uploaded' | 'generated' | null) || null,
        document_type: requirementToDocType(req.requirement_key, req.section),
      })
      totalRequired++
      if (satisfied) totalSatisfied++
    }

    // Annual items — one set per active fiscal year
    for (const fy of fyFormatted) {
      for (const req of annualReqs as RawReq[]) {
        const matchingDoc = (documents || []).find(
          (d: RawDoc) => d.requirement_key === req.requirement_key && d.requirement_year === fy.year
        )
        const satisfied = !!matchingDoc
        checklist.push({
          ...req,
          year: fy.year,
          satisfied,
          source: (matchingDoc?.source as 'uploaded' | 'generated' | null) || null,
          document_type: requirementToDocType(req.requirement_key, req.section),
        })
        totalRequired++
        if (satisfied) totalSatisfied++
      }
    }

    const score = totalRequired > 0 ? Math.round((totalSatisfied / totalRequired) * 100) : 0

    const response: CompletenessResponse = {
      score,
      totalRequired,
      totalSatisfied,
      totalMissing: totalRequired - totalSatisfied,
      checklist,
      fiscalYears: fyFormatted,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error calculating completeness:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
