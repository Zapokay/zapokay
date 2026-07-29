import { parseLocalDate } from '@/lib/utils'

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
 * THE fiscal-year set for a company — the single source both engines read.
 *
 * = the STORED ACTIVE rows, EXTENDED FORWARD with any newer years the calendar has
 * since entered. Never backfills; never removes.
 *
 * WHY COMBINE AT ALL: the two inputs are authoritative about different things.
 *   - The STORED rows are authoritative for WHAT THE USER CHOSE. They can archive
 *     a year in Settings, and `hold` rows exist; the caller has already filtered to
 *     status='active', so whatever arrives here is a deliberate user keep. This
 *     function must never second-guess or drop one.
 *   - The COMPUTED window is authoritative for WHAT THE CALENDAR SAYS.
 * Forward-only extension respects both: it never removes a year the user kept, and
 * never misses a year the clock has entered SINCE the newest kept one.
 *
 * ★ THE DEFECT THIS FIXES (dated, not hypothetical): the stored list is written
 * ONCE at onboarding (FiscalYearsSetup) and never refreshed. Settings only toggles
 * years that already exist; the upload route only inserts `hold` rows, which the
 * active filter excludes. Meanwhile the deadline feeder's year advances with the
 * calendar every year-end. They diverge on a schedule — Acme 2028-01-01, Wick
 * 2029-01-01 — with no user action required. Once diverged, OVERLAP_MERGE (which
 * joins on `${ruleKey}|${year}`) silently un-pairs and three already-fixed bugs
 * return by a new route: the REQ annual update renders twice, the federal
 * clear-gate can never fire, and Complétude stops tracking the newest year.
 *
 * ★ WHY EXTEND BY THE WHOLE WINDOW AND NOT BY A SINGLE YEAR: by the time the gap
 * fires it is TWO years wide — the feeders need the CLOSED fiscal year while
 * Complétude needs the OPEN one. Adding only one closes one hole and leaves the
 * other (verified: Acme @2028-01-01, adding only the open 2028 misses the feeder's
 * 2027; adding only the feeder's 2027 misses the open 2028). Extending by
 * `computeDefaultActiveYears` — the same function onboarding uses to WRITE the
 * rows — closes a gap of any width, while the forward-only filter below keeps that
 * extension from reaching backwards.
 *
 * ★ RESIDUAL, ACCEPTED (Dom, 2026-07-26). Forward-only protects archived years
 * BELOW the newest kept year. It cannot distinguish "archived above the high-water
 * mark" from "never existed", so a user who archived their NEWEST year(s) WILL see
 * them return — e.g. kept [2019..2025] with 2026 archived → 2026 comes back; kept
 * [2020] alone → 2021..currentFY come back. Both are real but unlikely (archiving
 * RECENT years is the odd move), and both are strictly smaller than a full-window
 * backfill, which would resurrect every archived year in the window. The only way
 * to eliminate resurrection entirely is to extend by exactly one year (currentFY),
 * at the cost of Complétude lagging the open year. Dom weighed this and accepted
 * forward-only. If that trade is ever revisited, this is the paragraph to reread.
 *
 * PURE: the caller passes the stored rows; no DB read here, and `today` is
 * injectable, so this is table-testable with a rolled-forward clock.
 *
 * Returns ascending, de-duplicated.
 */
export function fiscalYearSet(
  storedActiveYears: readonly number[],
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  incorporationDate: string | Date | null,
  today?: Date
): number[] {
  const computed = computeDefaultActiveYears(
    incorporationDate,
    fiscalYearEndMonth,
    fiscalYearEndDay,
    today
  )
  // ★ FORWARD-ONLY. Add only computed years NEWER than the newest stored one. A
  // plain union would BACKFILL — re-adding any archived year that still falls in
  // the computed window, silently undoing a removal the user made in Settings.
  // That is the same unrequested-action-on-the-user's-behalf this fix exists to
  // avoid; staleness only ever occurs at the TOP end, so only the top end is
  // repaired. Nothing the user archived below the high-water mark comes back.
  const highWaterMark = storedActiveYears.length ? Math.max(...storedActiveYears) : -Infinity
  const extensions = computed.filter((y) => y > highWaterMark)
  // Array.from, not [...set] — tsconfig sets no `target`, so spreading a Set would
  // demand --downlevelIteration. Array-literal spread of the two arrays is fine.
  return Array.from(new Set([...storedActiveYears, ...extensions])).sort((a, b) => a - b)
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
