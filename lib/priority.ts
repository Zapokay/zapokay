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

/**
 * All missing-document gaps, ordered "oldest non-compliance first":
 * every foundational gap (by sort_order) first, then annual gaps oldest
 * active year first (year asc, then sort_order). Reads the canonical
 * minute_book_requirements path (mirrors /api/minute-book/completeness);
 * does NOT touch the deprecated compliance engine.
 *
 * dueDate is always null in practice — minute_book_requirements has no
 * due_date column (GAP-F); the field is preserved for forward-compat.
 */
export async function getGaps(
  companyId: string,
  supabase: SupabaseClient
): Promise<UrgentGap[]> {
  const gaps: UrgentGap[] = []

  // 1. Active years (ascending)
  const activeYears = await getActiveYears(companyId, supabase)

  // 2. Company framework — mirrors /api/minute-book/completeness
  const { data: company } = await supabase
    .from('companies')
    .select('incorporation_type')
    .eq('id', companyId)
    .single()

  if (!company) return gaps

  const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA'

  // 3. Applicable requirements (sorted by sort_order ASC)
  const { data: requirements } = await supabase
    .from('minute_book_requirements')
    .select('*')
    .or(`framework.eq.${framework},framework.eq.ALL`)
    .order('sort_order')

  const reqs = (requirements ?? []) as RequirementRow[]
  if (reqs.length === 0) return gaps

  // 4. Documents that could satisfy requirements — mirrors completeness route
  const { data: documents } = await supabase
    .from('documents')
    .select('requirement_key, requirement_year')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .not('requirement_key', 'is', null)

  const docs = (documents ?? []) as DocumentRow[]

  // 5. Foundational pass — all unsatisfied, by sort_order
  const foundationalReqs = reqs.filter(r => r.category === 'foundational')
  for (const req of foundationalReqs) {
    const satisfied = docs.some(d => d.requirement_key === req.requirement_key)
    if (!satisfied) {
      gaps.push({
        type: 'foundational',
        requirementKey: req.requirement_key,
        titleFr: req.title_fr,
        titleEn: req.title_en,
        dueDate: req.due_date ?? null,
      })
    }
  }

  // 6. Annual pass — oldest active year first, then sort_order
  const annualReqs = reqs.filter(r => r.category === 'annual')
  const sortedYears = [...activeYears].sort((a, b) => a - b)
  for (const year of sortedYears) {
    for (const req of annualReqs) {
      const satisfied = docs.some(
        d => d.requirement_key === req.requirement_key && d.requirement_year === year
      )
      if (!satisfied) {
        gaps.push({
          type: 'annual',
          year,
          requirementKey: req.requirement_key,
          titleFr: req.title_fr,
          titleEn: req.title_en,
          dueDate: req.due_date ?? null,
        })
      }
    }
  }

  return gaps
}

/**
 * The single highest-priority gap (foundational first, else oldest active
 * year). Thin wrapper over getGaps — one source of truth for the walk.
 */
export async function getOldestGap(
  companyId: string,
  supabase: SupabaseClient
): Promise<UrgentGap | null> {
  return (await getGaps(companyId, supabase))[0] ?? null
}
