/**
 * THE FISCAL-YEAR GENERATION GATE — one implementation, four call sites.
 *
 * Answers exactly one question: may this row generate a document right now, or
 * must the button be inert because the fiscal year it would speak for has not
 * closed yet?
 *
 * ★ WHY IT EXISTS. A generated annual resolution APPROVES financial statements.
 * On a company whose fiscal year is still open, those statements do not exist
 * yet, so the document records an approval that never happened — art. 493 al. 2
 * LSAQ, a false entry in a company book, 5 000 to 50 000 $, and the director
 * answers personally. `can_generate` in `minute_book_requirements` is a STATIC
 * property of the document TYPE; it has never known which YEAR it was being
 * asked about. This function is that missing half.
 *
 * ★ THE FOUR CALL SITES, and why the calculation must live in ONE place:
 *   `components/minute-book/RequirementRow.tsx`   — Générer   (empty row)
 *   `components/minute-book/RequirementRow.tsx`   — Régénérer (generated row)
 *   `components/minute-book/CompletenessPage.tsx` — Bulk Catch-Up's year filter
 *   `components/dashboard/A3Item.tsx`             — the A3 board row
 * Two independent component trees. `lib/fiscal-year-label.ts` — same subject,
 * same shape — is already imported by client components in both, which is why
 * a top-level lib module is the right home rather than either tree's folder.
 * Two copies of one calculation diverge at the first change; that is the `968a7ae`
 * shape, already paid for in this repo.
 *
 * ── THE NAME IS THE DECISION, NOT THE FACT ──────────────────────────────────
 * It returns what to DO (block), not what IS (open). Deliberate: on a
 * foundational row it returns false while there is no fiscal year at all, so a
 * name like `isFiscalYearStillOpen` would be asserting something the function
 * does not measure, and the next reader would infer from it.
 *
 * ── BRANCH 1 — `year === null` → NEVER BLOCKS ───────────────────────────────
 * A null year means a FOUNDATIONAL row: the first board resolution, the first
 * shareholder resolution, the share subscription, and their LSA equivalents
 * (six generable keys, three per framework). These carry no fiscal year because
 * they record a fact that HAS ALREADY HAPPENED — the company was constituted,
 * the shares were subscribed. There is no accounting period to wait for, and
 * nothing about them can be premature. They stay generable on day one.
 *
 * ── BRANCH 2 — NO DATE → BLOCKS ─────────────────────────────────────────────
 * A row that has a year but no fiscal-year-end date is a row we cannot reason
 * about. The safe default is silence, not generation: a button that stays inert
 * when we are unsure costs a support question, while a document generated on a
 * year we could not date is the offence above. Today this branch is unreachable
 * for generable rows (measured 2026-08-15: the per-year checklist rows are built
 * by iterating the fiscal-year list itself, so they always have a match; the one
 * requirement that is NOT — the `cadence: 'anniversary'` federal return — carries
 * `can_generate = false` in the catalog and reaches no button). It is a guard
 * against a future row shape, not a live path.
 *
 * ── BRANCH 3 — WHY THE COMPARISON IS ON STRINGS, AND MUST STAY THERE ────────
 * ⚠️ DO NOT "SIMPLIFY" THIS TO `parseLocalDate(endDate) < today`. It looks
 * equivalent and it is not, twice over:
 *
 *   1. THE CLOSURE DAY. `new Date()` carries a wall clock. On 2026-12-31 at
 *      09:00, `2026-12-31T00:00 < 2026-12-31T09:00` is TRUE, so a fiscal year
 *      would read CLOSED on the very day it closes — nine hours before it does.
 *      The boundary is INCLUSIVE on purpose: the fiscal year ending today is
 *      still open today. Comparing calendar DAYS instead of instants is what
 *      makes that exact rather than approximately right.
 *   2. THE TZ TRAP (#159 / §8.54). Every route back into `Date` from a bare
 *      `YYYY-MM-DD` is a chance to lose a day in a UTC-negative zone, which is
 *      every zone this product ships in. `parseLocalDate` guards one direction
 *      and `toISOString()` breaks the other. Never converting at all removes the
 *      question: lexicographic order on `YYYY-MM-DD` IS chronological order.
 *
 * `todayISO` is therefore built from LOCAL calendar fields with `pad2`, byte for
 * byte the pattern `obligationFiscalYear` uses in `lib/obligations/
 * obligation-registry.ts` and for the same stated reason.
 *
 * ── ⚠️ WHAT THIS IS NOT: IT DOES NOT READ `liveness`. ───────────────────────
 * ★ THIS IS THE MISTAKE A FUTURE READER WILL MAKE. `liveness` is right there on
 * every checklist item and every obligation, it already sorts rows by time, and
 * branching on it is one field access. It would be wrong.
 *
 * `liveness` is YEAR-founded — `computeLiveness` compares `today.getFullYear()`
 * against the row's `year`. It knows nothing about when a fiscal year actually
 * ends. This function is CLOSURE-founded, and the two disagree for every company
 * whose year-end is not 31 December.
 *
 * MEASURED COUNTER-EXAMPLE, `Wick Inc` (CBCA, incorporated 2018-08-08, fiscal
 * year end 31 MAY): its 2026 fiscal year CLOSED on 2026-05-31. On 2026-08-15 its
 * 2026 rows still carry `liveness: 'live'`, because the calendar year matches.
 * Branch on `liveness` and Wick's 2026 resolutions — perfectly legitimate, the
 * year is over, the statements exist — are BLOCKED. That is the failure this
 * function is shaped to avoid, and Wick is the fixture that proves it.
 *
 * PURE: no I/O, no imports, `today` injectable so it is table-testable with a
 * rolled-forward clock (same convention as `bookCurrencyCap`,
 * `completedFiscalYearEnd`, `fiscalYearSet`).
 *
 * @param year               the row's fiscal year; null = foundational
 * @param fiscalYearEndDate  that year's end, bare ISO `YYYY-MM-DD`
 * @param today              injectable clock; defaults to now
 * @returns true when generation must be inert
 */
export function mustBlockGeneration(
  year: number | null,
  fiscalYearEndDate: string | null | undefined,
  today: Date = new Date(),
): boolean {
  // Branch 1 — foundational: no fiscal year to wait for. Read before any date.
  if (year === null) return false;

  // Branch 2 — dated row we cannot date. Silence over generation.
  if (!fiscalYearEndDate) return true;

  // Branch 3 — calendar-day comparison. See the two reasons above before
  // touching either line.
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  // Inclusive on the closure day: the fiscal year ending today is still open.
  return fiscalYearEndDate >= todayISO;
}
