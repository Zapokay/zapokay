import { SupabaseClient } from '@supabase/supabase-js'
import { getActiveYears } from './active-years'

export interface UrgentGap {
  type: 'foundational' | 'annual'
  year?: number
  requirementKey: string
  titleFr: string
  titleEn: string
  dueDate?: string | null
}

type RequirementRow = {
  requirement_key: string
  category: 'foundational' | 'annual'
  title_fr: string
  title_en: string
  sort_order: number
  due_date?: string | null
}

type DocumentRow = {
  requirement_key: string
  requirement_year: number | null
}

export async function getOldestGap(
  companyId: string,
  supabase: SupabaseClient
): Promise<UrgentGap | null> {
  // 1. Active years (ascending)
  const activeYears = await getActiveYears(companyId, supabase)

  // 2. Company framework — mirrors /api/minute-book/completeness
  const { data: company } = await supabase
    .from('companies')
    .select('incorporation_type')
    .eq('id', companyId)
    .single()

  if (!company) return null

  const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'

  // 3. Applicable requirements (sorted by sort_order ASC)
  const { data: requirements } = await supabase
    .from('minute_book_requirements')
    .select('*')
    .or(`framework.eq.${framework},framework.eq.ALL`)
    .order('sort_order')

  const reqs = (requirements ?? []) as RequirementRow[]
  if (reqs.length === 0) return null

  // 4. Documents that could satisfy requirements — mirrors completeness route
  const { data: documents } = await supabase
    .from('documents')
    .select('requirement_key, requirement_year')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .not('requirement_key', 'is', null)

  const docs = (documents ?? []) as DocumentRow[]

  // 5. Foundational pass — first unsatisfied (lowest sort_order) wins
  const foundationalReqs = reqs.filter(r => r.category === 'foundational')
  for (const req of foundationalReqs) {
    const satisfied = docs.some(d => d.requirement_key === req.requirement_key)
    if (!satisfied) {
      return {
        type: 'foundational',
        requirementKey: req.requirement_key,
        titleFr: req.title_fr,
        titleEn: req.title_en,
        dueDate: req.due_date ?? null,
      }
    }
  }

  // 6. Annual pass — oldest active year first; stop at first year with a gap
  const annualReqs = reqs.filter(r => r.category === 'annual')
  const sortedYears = [...activeYears].sort((a, b) => a - b)
  for (const year of sortedYears) {
    for (const req of annualReqs) {
      const satisfied = docs.some(
        d => d.requirement_key === req.requirement_key && d.requirement_year === year
      )
      if (!satisfied) {
        return {
          type: 'annual',
          year,
          requirementKey: req.requirement_key,
          titleFr: req.title_fr,
          titleEn: req.title_en,
          dueDate: req.due_date ?? null,
        }
      }
    }
  }

  // 7. Everything satisfied
  return null
}
