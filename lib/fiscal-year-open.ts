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

/**
 * ── EXCLUSION 1 — THE ONE OBLIGATION WHOSE CLOCK IS NOT THE FISCAL YEAR. ──
 *
 * The federal annual return is settled on the INCORPORATION ANNIVERSARY plus
 * `FED_RETURN_FILING_WINDOW_DAYS` (60). It has no relationship to the fiscal year
 * at all, and the row's `year` — which comes from `obligationFiscalYear` — IS a
 * fiscal year. So the gate would find a date, and answer confidently on the wrong
 * clock. MEASURED 2026-08-15, gate-date vs. real opening:
 *
 *   Fixture Cap  gate 2026-12-31 · real opening 2026-03-02 · TEN MONTHS off
 *   Café du Coin gate 2025-12-31 · real opening 2026-06-19 · six months off
 *   Wick         gate 2026-05-31 · real opening 2026-08-08 · two months off
 *
 * ★ AND FIXTURE CAP SHOWS WHY THIS IS WORSE THAN A HARD BLOCK. Its federal window
 * has been OPEN since March; the gate would close it until January. A permanently
 * dead button gets reported. A button that is wrong for ten months looks like a
 * rule someone chose. This is the `liveness` failure again — a value that is
 * almost right, on the wrong base.
 *
 * ★★ THE REAL SOURCE OF TRUTH IS `cadence: 'anniversary'` IN
 * `lib/obligations/obligation-registry.ts`, AND THIS SET IS A MANUAL COPY OF IT.
 * The registry already derives `isBoardSuppressedRequirementKey` from exactly that
 * field, for exactly this key, for a related reason. Deriving it here too would be
 * the better expression of intent — and it is FORBIDDEN on this file:
 *
 *   This module is imported by THREE CLIENT components (RequirementRow, A3Item,
 *   UploadDocumentModal). Importing `ruleForRequirementKey` would pull
 *   OBLIGATION_REGISTRY — the whole rule table and its date functions — into three
 *   client bundles. `components/ui/useObligationModalContent.ts:5-8` states that
 *   invariant in so many words: "a type-only import is erased at compile — so
 *   obligation-registry enters NO client bundle." A written invariant outranks a
 *   nicer derivation.
 *
 * ⚠️ WHAT TO DO WHEN A SECOND ANNIVERSARY-CLOCKED KEY APPEARS — AND IT IS NOT
 * "ADD IT HERE". Two hand-maintained copies of one fact drift; the second key will
 * arrive without anyone remembering this file. The answer is to compute the
 * question SERVER-SIDE, where the registry is already loaded (`app/[locale]/
 * dashboard/page.tsx` imports it today), and carry the answer as a field on
 * `ChecklistItem` / `Obligation` — a boolean the three surfaces simply read. That
 * touches the API contract, the completeness engine and all three surfaces, which
 * is why it is not this lot. It is written here because the person who hits the
 * problem will be reading this line.
 */
export const ANNIVERSARY_CLOCK_KEYS: ReadonlySet<string> = new Set([
  'cbca_annual_return',
]);

/** EXCLUSION 1, as a predicate. See ANNIVERSARY_CLOCK_KEYS for the whole argument. */
export function hasAnniversaryClock(requirementKey: string | null | undefined): boolean {
  return requirementKey != null && ANNIVERSARY_CLOCK_KEYS.has(requirementKey);
}

/**
 * ── EXCLUSION 2 — A LIFECYCLE ACT HAS NO CLOCK AT ALL. ──
 *
 * ★ THIS IS BRANCH 1 OF `mustBlockGeneration`, APPLIED TO ROWS THAT HAVE A YEAR.
 * Foundational rows are never blocked because they "record facts that HAVE ALREADY
 * HAPPENED". A lifecycle act — a director appointed, shares issued, shares
 * transferred — is the same kind of thing: the act occurred on its date, and its
 * resolution exists from that day. It waits for no closure. The principle was
 * already here; this case was the one it had not been extended to, because acts
 * carry a `year` and foundational rows do not.
 *
 * MEASURED 2026-08-15 — eleven acts across the fixtures, ten of them inside an
 * OPEN fiscal year: Acme (4 transfers, 3 issuances), Fixture Cap (1 director
 * mandate, 2 officer appointments), Wick (1 issuance).
 *
 * ★ AND THE CASE THAT SETTLES IT: Fixture Cap's three acts are dated 2026-03-02 —
 * the day it was incorporated. Without this exclusion the product would refuse to
 * let it upload the resolution APPOINTING ITS OWN DIRECTORS, a document that has
 * existed since March, because a fiscal year that started that same month has not
 * closed. That is not a safeguard; it is the product refusing its own founding.
 *
 * WHY `eventLink` IS THE SIGNAL. It is set by the event feeder and by nothing else
 * (`lib/obligations/obligation.ts`: "Set ONLY by the event feeder"); both other
 * feeders write `docKey: null` too, but `eventLink` is also the exact field
 * `A3Item`'s `canRowUpload` tests to OFFER the upload. Testing the same field that
 * grants the button keeps the two in lockstep: if an act row ever lost its
 * eventLink, it would lose the button and this exclusion together, rather than
 * keeping one and silently losing the other.
 *
 * ⚠️ THE TYPE IS `object | null` ON PURPOSE — NOT NEGLIGENCE, AND NOT TO BE
 * "IMPROVED". This function tests PRESENCE and reads no field. The loose type is
 * the guard: it makes it impossible to start reading `event_type` here without
 * changing the signature first, and it says what the code actually does. A precise
 * type would promise a field access that never happens.
 *
 * ★ AND THE REASON IT IS NOT IMPORTED IS "USELESS", NOT "FORBIDDEN" — do not
 * mis-remember this. The triple's shape lives in `lib/obligations/obligation.ts`,
 * the CONTRACT module, which client components already import type-only today
 * (`CompletenessPage.tsx:11`). Such an import is erased at compile and would have
 * been perfectly legitimate here. It is omitted because it buys exactly one thing —
 * a lock on fields nobody reads — and that is not worth an import. The
 * client-bundle argument on ANNIVERSARY_CLOCK_KEYS above is about
 * `obligation-registry.ts`, a different file with a runtime table; it does not
 * apply to this decision and must not be cited for it.
 *
 * Separately, and worth keeping in view: this module is imported by three client
 * components. Its "no imports" line is what makes it obvious at a glance that
 * nothing here can grow a bundle. That is a reason to keep the line true when it
 * costs nothing — not a reason to reject an import that would earn its place.
 *
 * ⚠️ A UNIT TRAP THIS EXCLUSION NEUTRALIZES HERE, AND ONLY HERE. An act row's
 * `year` is the CALENDAR year of the act (`feeders/events.ts`, `getFullYear()`),
 * not its fiscal year — `fiscalYearForDate` exists and is not used there. For Wick
 * (year-end 31 MAY) an act dated 2026-06-18 carries `year = 2026` while belonging
 * to fiscal 2027, so a fiscal-year lookup on it would return the end of a year the
 * act is not in. Excluding acts makes that harmless on this path. IT IS NOT FIXED,
 * and it stays live anywhere else that joins an act's `year` to a fiscal year.
 */
export function isLifecycleAct(eventLink: object | null | undefined): boolean {
  return eventLink != null;
}

/**
 * THE UPLOAD GATE — same calculation as generation, two named exceptions.
 *
 * Dom, 2026-08-15: "le bouton Téléverser ne devrait pas être disponible jusqu'au
 * moment où l'utilisateur est en droit de détenir le document."
 *
 * ⚠️ THIS REVERSES A RULE `5b21967` SHIPPED — deliberately, and the reversal is the
 * point. That commit says "Téléverser is not part of this gate ... uploading a real
 * document is never a false entry." True while we do not know what the user holds.
 * On an OPEN fiscal year we do know: art. 155(1)a) CBCA anchors financial
 * statements on CLOSED periods, so no legitimate annual resolution can exist yet.
 * Accepting the upload does not respect the user's judgement — it lets them file a
 * false entry in their own book.
 *
 * EIGHT KEYS, TWO CLOCKS THAT COINCIDE:
 *   the six annual resolutions → open at fiscal-year CLOSURE
 *   the two REQ annual updates → open the DAY AFTER closure (art. 45 LPLE)
 * The REQ keys are IN despite having a registry rule of their own: `ctx.fyEnd` in
 * that rule is `completedFiscalYearEnd` (`feeders/deadlines.ts`), so "the day after
 * the completed year-end" is exactly the inclusive boundary `mustBlockGeneration`
 * already implements. One predicate covers all eight; a second would be a copy.
 *
 * ★ IT IS AN EXCLUSION LIST, NEVER AN INCLUSION LIST. Anything not named above
 * falls under the gate. A new catalog key must be guarded by DEFAULT and not slip
 * through because someone forgot to add it — the failure mode of an allow-list is
 * silent, and it fails open.
 *
 * The two exclusions are separate predicates on purpose: their reasons have nothing
 * in common (a different clock vs. no clock), and either must be removable without
 * disturbing the other.
 *
 * @param requirementKey  catalog key; null on lifecycle-act rows
 * @param year            the row's fiscal year; null = foundational
 * @param fiscalYearEndDate  that year's end, bare ISO `YYYY-MM-DD`
 * @param eventLink       present iff this row is a lifecycle act (presence only)
 * @param today           injectable clock; defaults to now
 * @returns true when the upload affordance must be inert
 */
export function mustBlockUpload(
  requirementKey: string | null | undefined,
  year: number | null,
  fiscalYearEndDate: string | null | undefined,
  eventLink?: object | null,
  today?: Date,
): boolean {
  // Exclusion 1 — anniversary clock. Our tool does not fit its window.
  if (hasAnniversaryClock(requirementKey)) return false;
  // Exclusion 2 — a lifecycle act records something that already happened.
  if (isLifecycleAct(eventLink)) return false;
  // Everything else: the same single comparison, never a second copy of it.
  return mustBlockGeneration(year, fiscalYearEndDate, today);
}
