import { SupabaseClient } from '@supabase/supabase-js'
import { parseLocalDate } from '@/lib/utils'

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

/**
 * Map an arbitrary date to the integer label of the fiscal year that CONTAINS
 * that date, for a company with the given fiscal-year-end month/day.
 *
 * A fiscal year is identified by the calendar year in which it ENDS. The FY
 * containing a date is the one whose end is on-or-after that date. Mirrors
 * the inline logic in `computeDefaultActiveYears` (lines 56-59) — extracted
 * as a separate export for the lifecycle-document orchestrator. Dedupe with
 * computeDefaultActiveYears is a Tier-4 follow-up.
 */
export function fiscalYearForDate(
  dateISO: string,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number
): number {
  const d = parseLocalDate(dateISO); // TZ-safe: bare YYYY-MM-DD must parse as LOCAL midnight (#159 / §8.54 chokepoint), else a FY-first-day rolls back to the prior FY in UTC-negative zones
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  const fiscalEndPassed =
    month > fiscalYearEndMonth ||
    (month === fiscalYearEndMonth && day > fiscalYearEndDay);
  return fiscalEndPassed ? year + 1 : year;
}

/**
 * Internal - map a Date to the integer label of the fiscal year that CONTAINS
 * it, given the company fiscal-year-end month/day. A fiscal year is labelled by
 * the calendar year in which it ENDS. SINGLE SOURCE OF TRUTH for the FY
 * boundary, shared by computeDefaultActiveYears (the compliance window used by
 * the upload classifier) and computeFiscalYearRange (the vault year picker) so
 * the two can never disagree on a boundary. Uses raw Date fields, matching the
 * historical computeDefaultActiveYears behavior; callers parse the incorporation
 * string the same way before passing the Date in.
 */
function fiscalYearOfDate(date: Date, fiscalYearEndMonth: number, fiscalYearEndDay: number): number {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const fiscalEndPassed =
    month > fiscalYearEndMonth ||
    (month === fiscalYearEndMonth && day > fiscalYearEndDay)
  return fiscalEndPassed ? date.getFullYear() + 1 : date.getFullYear()
}

export function computeDefaultActiveYears(
  incorporationDate: string | Date | null,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  referenceDate?: Date
): number[] {
  const ref = referenceDate ?? new Date()
  const currentFiscalYear = fiscalYearOfDate(ref, fiscalYearEndMonth, fiscalYearEndDay)

  if (incorporationDate === null) {
    return [currentFiscalYear]
  }
  const incDate =
    incorporationDate instanceof Date ? incorporationDate : new Date(incorporationDate)
  const incorporationFiscalYear = fiscalYearOfDate(incDate, fiscalYearEndMonth, fiscalYearEndDay)

  // Current + previous 7 completed = 8 years max, capped at incorporation year.
  const earliest = Math.max(incorporationFiscalYear, currentFiscalYear - 7)
  const years: number[] = []
  for (let y = earliest; y <= currentFiscalYear; y++) {
    years.push(y)
  }
  return years
}

/**
 * The FULL fiscal-year range a company can file or import for: incorporation FY
 * through the current FY, UNCAPPED (computeDefaultActiveYears caps at current-7
 * for the compliance window). Populates the vault upload year picker so
 * out-of-window archive years are selectable - they classify as hold on upload.
 * Ascending. Shares fiscalYearOfDate AND identical incorporation-date parsing
 * with computeDefaultActiveYears, so a given date maps to the SAME fiscal year
 * in both - no offerable-but-misclassified year.
 */
export function computeFiscalYearRange(
  incorporationDate: string | Date | null,
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  referenceDate?: Date
): number[] {
  const ref = referenceDate ?? new Date()
  const currentFiscalYear = fiscalYearOfDate(ref, fiscalYearEndMonth, fiscalYearEndDay)

  if (incorporationDate === null) {
    return [currentFiscalYear]
  }
  const incDate =
    incorporationDate instanceof Date ? incorporationDate : new Date(incorporationDate)
  const incorporationFiscalYear = fiscalYearOfDate(incDate, fiscalYearEndMonth, fiscalYearEndDay)

  const years: number[] = []
  for (let y = incorporationFiscalYear; y <= currentFiscalYear; y++) {
    years.push(y)
  }
  return years
}
