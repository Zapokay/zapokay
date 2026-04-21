import { SupabaseClient } from '@supabase/supabase-js'

export async function getActiveYears(
  companyId: string,
  supabase: SupabaseClient
): Promise<number[]> {
  const { data, error } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('year', { ascending: true })

  if (error) throw error
  if (!data) return []
  return data.map((row: { year: number }) => row.year)
}

export function computeDefaultActiveYears(
  incorporationDate: string | Date | null,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  referenceDate?: Date
): number[] {
  const ref = referenceDate ?? new Date()

  // Determine current fiscal year end year.
  // A fiscal year is identified by its END year.
  // If the fiscal year end for this calendar year has not yet occurred,
  // we're still in the fiscal year that ENDS this calendar year.
  // If the fiscal year end has already occurred this calendar year,
  // we're now in the fiscal year that ENDS next calendar year.
  const refYear = ref.getFullYear()
  const refMonth = ref.getMonth() + 1 // 1-12
  const refDay = ref.getDate()

  const fiscalEndPassedThisYear =
    refMonth > fiscalYearEndMonth ||
    (refMonth === fiscalYearEndMonth && refDay > fiscalYearEndDay)

  const currentFiscalYear = fiscalEndPassedThisYear ? refYear + 1 : refYear

  // Determine incorporation year (as fiscal year END year).
  let incorporationFiscalYear: number | null = null
  if (incorporationDate !== null) {
    const incDate =
      incorporationDate instanceof Date
        ? incorporationDate
        : new Date(incorporationDate)
    const incYear = incDate.getFullYear()
    const incMonth = incDate.getMonth() + 1
    const incDay = incDate.getDate()

    // The fiscal year containing the incorporation date is the one that ENDS
    // on-or-after the incorporation date.
    const incFiscalEndPassed =
      incMonth > fiscalYearEndMonth ||
      (incMonth === fiscalYearEndMonth && incDay > fiscalYearEndDay)
    incorporationFiscalYear = incFiscalEndPassed ? incYear + 1 : incYear
  }

  if (incorporationFiscalYear === null) {
    return [currentFiscalYear]
  }

  // Current + previous 7 completed = 8 years max, capped at incorporation year.
  const earliest = Math.max(incorporationFiscalYear, currentFiscalYear - 7)
  const years: number[] = []
  for (let y = earliest; y <= currentFiscalYear; y++) {
    years.push(y)
  }
  return years
}
