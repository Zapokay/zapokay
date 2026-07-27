/**
 * FILING REGISTRY — the single source of truth for government filing obligations.
 *
 * WHY: "this needs a filing" used to be asserted in FOUR hardcoded places that
 * could drift out of sync — EXTERNAL_REQUIREMENT_KEYS (completeness feeder), the
 * deadline feeder's file_externally rules, OBLIGATIONS_BY_DOCKEY (req-obligations),
 * and OVERLAP_MERGE (aggregate). That drift class produced the 5-week #135 leak.
 * This registry makes all four VIEWS onto one table: one entry per filing
 * obligation, holding its deadline rule, statutory basis, the requirement/doc keys
 * it maps to, and its prerequisites. Adding a future government requirement is ONE
 * entry here — no edits elsewhere.
 *
 * ADAPTABLE BY ITEM (Dom): the three calendar filings have genuinely DIFFERENT
 * anchors (FY-end+6mo · immatriculation+60d · incorporation anniversary), so each
 * entry carries its own `dueDate(ctx)` — a single shared rule would be wrong for
 * two of them. The roster REQ filing is event-relative (act date + `deadlineDays`),
 * so it carries `deadlineDays` instead of a calendar `dueDate`.
 *
 * The date helpers `addMonthsClamped` and `currentFiscalYearStart` were MOVED here
 * from deadlines.ts (their last surviving copies, now that lib/compliance is
 * deleted). `addMonthsClamped`'s clamping is Harvey-verified legal math — it must
 * NOT regress to raw Date.setMonth (Aug 31 + 6mo → Feb 28/29, never Mar 3).
 */

import { parseLocalDate } from '@/lib/utils';
import { fiscalYearForDate } from '@/lib/active-years';

// ─── Date helpers (moved from deadlines.ts — the only surviving copies) ──────────

/**
 * Most-recent PAST occurrence of (month/day) — the fiscal-year-END anchor.
 * Despite the name (kept for provenance), this returns the fiscal year END.
 */
export function currentFiscalYearStart(month: number, day: number, today: Date): Date {
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  if (thisYear <= today) return thisYear;
  return new Date(today.getFullYear() - 1, month - 1, day);
}

/**
 * Add `months` to a date, CLAMPING the day to the target month's last day.
 * Harvey-verified legal-deadline math: Aug 31 + 6mo → Feb 28/29 (NOT Mar 3 —
 * raw Date.setMonth rolls short-month overflow forward, which the deprecated
 * engine did and which this deliberately corrects). Do not regress to setMonth.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const monthIndex = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
}

/**
 * The most recent fiscal-year END the company ACTUALLY EXISTED THROUGH — or
 * `null` when no fiscal year has closed yet (a company inside its first one).
 *
 * WHY: `currentFiscalYearStart` above is pure calendar math, and it happily
 * returns a FY-end that PREDATES incorporation. A company incorporated
 * 2026-03-01 with a Dec-31 year-end got 2025-12-31 back, and every rule anchored
 * on it emitted a row for a fiscal year the company did not exist in — marked
 * OVERDUE. This COMPOSES that helper; it does not modify it. Making
 * `currentFiscalYearStart` itself nullable would overload one function with two
 * unrelated jobs (calendar math + corporate-existence policy) and disturb
 * Harvey-verified provenance for no gain — nullability propagates to every
 * caller either way.
 *
 * BOUNDARY: strict `>`. The FY-end must fall strictly AFTER incorporation, so a
 * company incorporated exactly ON its year-end day is not credited with a
 * zero-length first fiscal year.
 *
 * The `null` return is DELIBERATE and load-bearing: it forces every caller to
 * DECLARE what it does when no fiscal year has closed — skip the row, use the
 * upcoming year, switch statutory limb — instead of silently inheriting a wrong
 * default. The three answers live in feeders/deadlines.ts, each commented.
 *
 * incorporationDate null → falls back to the raw calendar answer (i.e. today's
 * behavior, unchanged). We cannot know when the company came into existence, and
 * suppressing rows on that unknown would HIDE real obligations — the worse of
 * the two failures.
 */
export function completedFiscalYearEnd(
  month: number,
  day: number,
  incorporationDate: string | null,
  today: Date,
): Date | null {
  const fyEnd = currentFiscalYearStart(month, day, today);
  if (!incorporationDate) return fyEnd; // unknowable — behave exactly as before
  return fyEnd > parseLocalDate(incorporationDate) ? fyEnd : null;
}

/**
 * The fiscal year a government-filing RECEIPT attaches to — the `year` half of
 * the completeness identity (requirement_key, year). The most recent CLOSED
 * fiscal year the company existed through; before any has closed, the fiscal
 * year currently OPEN. Never a pre-incorporation year.
 *
 * The open-year fallback delegates to `fiscalYearForDate` — the declared single
 * source of truth for the FY boundary, and the same function
 * `computeDefaultActiveYears` uses to build the `company_fiscal_years` rows the
 * completeness checklist fans out over. That is what makes "the year returned
 * here HAS a checklist row" true BY CONSTRUCTION rather than by coincidence: the
 * federal clear-gate matches on (requirement_key, year), so a year with no row
 * is a receipt that can never satisfy anything and a row that never leaves the
 * board.
 */
export function filingFiscalYear(
  month: number,
  day: number,
  incorporationDate: string | null,
  today: Date,
): number {
  const closed = completedFiscalYearEnd(month, day, incorporationDate, today);
  if (closed) return closed.getFullYear();
  // LOCAL calendar fields — never toISOString(), which shifts the day back in
  // UTC-negative zones (#159 / §8.54: the same TZ trap parseLocalDate guards).
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  return fiscalYearForDate(todayISO, month, day);
}

// ─── The contract ────────────────────────────────────────────────────────────

/** Context a filing's date rule may read. Each rule uses only what its anchor needs. */
export interface FilingDueCtx {
  fyEnd?: Date;
  immatriculationDate?: string | null;
  incorporationDate?: string | null;
  today: Date;
}

/**
 * Per-rule modal-copy namespaces under `obligationNotice.*`. A filing sets this when
 * its modal must differ from the default art. 41 roster copy.
 *
 * ★ HAND-MAINTAINED, NOT DERIVED. `FILING_REGISTRY` below is annotated
 * `readonly FilingRule[]`, which erases every literal, so `typeof`-deriving this union
 * would require `as const satisfies` on the whole ~120-line table plus knock-ons to
 * every derived index (`_byRuleKey`, `_byRequirementKey`, `_byDocKey`,
 * `_boardSuppressedKeys`, `OVERLAP_MERGE`). Not worth it for one value.
 *
 * ⚠️ ADDING A NEW copyKey MEANS ADDING IT HERE TOO — and the registry entry will fail
 * to compile until you do. That is the point: the failure is the reminder.
 *
 * ⚠️ This union does NOT prove the messages exist. `obligationNotice.{copyKey}.title`
 * and `.body` must be present in BOTH messages/fr.json and messages/en.json; typed
 * messages checks FR only (it is the type source), and EN not at all.
 */
export type CopyKey = 'fedAnnualReturn';

/**
 * i18n keys under `obligationNotice.prerequisites.reason.*` — the DESCRIPTIVE reason a
 * prerequisite blocks a filing.
 *
 * ★ HAND-MAINTAINED, NOT DERIVED — same reasoning as CopyKey above, same obligation to
 * add new values here, and the same caveat that it does not prove the message exists in
 * either locale file.
 */
export type ReasonKey = 'fedAnnualReturnShareholderMeeting';

/** An obligation that must be SATISFIED before this filing can be completed. */
export interface FilingPrerequisite {
  /** Completeness requirement_key of the blocking obligation. */
  requirementKey: string;
  /**
   * When true AND the filing carries a concrete fiscal year, match the prerequisite
   * of the SAME year. When the filing has no year (e.g. the anniversary-based federal
   * return), the check falls back to "any satisfied instance" — there is no concrete
   * year to match, and such filings ask for the LAST (most recent) occurrence. See
   * rank.ts:resolveUnmetPrerequisites.
   */
  sameYear: boolean;
  /** i18n key under obligationNotice.prerequisites.reason.* — a DESCRIPTIVE reason. */
  reasonKey: ReasonKey;
}

export interface FilingRule {
  /** Stable rule key — matches the deadline feeder id namespace `deadline:{ruleKey}:…`. */
  ruleKey: string;
  /** Completeness requirement_key(s) this filing satisfies/maps to. */
  requirementKeys: readonly string[];
  /** Event docKey(s) whose act triggers this filing (the roster REQ set). */
  docKeys?: readonly string[];
  statutoryBasis: string;
  helpKey: string | null;
  /**
   * Event-relative offset (days from the triggering act's date). Set ONLY for
   * event-triggered filings (roster REQ = 30); calendar filings use `dueDate`.
   */
  deadlineDays?: number;
  /** Event-relative clock trigger (e.g. 'roster_change'); null/omitted for calendar. */
  triggeredBy?: string;
  /**
   * Calendar-absolute due date for a given context. Set for the three calendar
   * filings; omitted for the event-relative roster filing (which uses deadlineDays).
   * Returns null when the anchor date the rule needs is absent.
   */
  dueDate?: (ctx: FilingDueCtx) => Date | null;
  /**
   * ★ CADENCE — answers ONE question: WHAT INSTANTIATES AN INSTANCE of this
   * obligation? A fiscal year, an anniversary, the company's founding, or an act.
   *
   *   'per-fiscal-year' — one instance per fiscal year; each is a separately
   *                       outstandable debt (the REQ annual update: art. 45 LPLE
   *                       ties it to a COMPLETED fiscal year).
   *   'anniversary'     — ONE recurring instance on an anniversary clock. You are
   *                       never "behind on your 2023 return" the way you can be
   *                       behind on 2023's REQ update; filing it satisfies the
   *                       obligation until the next anniversary (Harvey 2026-07-24).
   *   'once'            — a single lifetime instance, no year (the RE-200).
   *   'event'           — instantiated by an ACT, not a calendar. No act, no
   *                       obligation (art. 41 LPLE roster update, 30d from the act).
   *
   * ⚠️ A NEW VALUE MUST ANSWER THAT SAME QUESTION. Adding one on a different axis
   * ('monthly', 'on-demand', 'quarterly-if-X') would silently break the derivations
   * below, which select on cadence VALUES — a value that does not name an
   * instantiator lands in neither derivation and its flags quietly become false.
   *
   * ★ THE DERIVATIONS BELOW REPLACE TWO FORMER BOOLEAN FLAGS. `overlapMerge` and
   * `boardSuppressCompletenessRows` never described the obligation — they were
   * instructions for CORRECTING the completeness engine's per-fiscal-year fan-out
   * ("the engine already made my rows, merge them" / "I am recurring, throw the
   * fan-out away"). They are cadence written in reconciliation language, so they are
   * now DERIVED FROM cadence rather than declared alongside it.
   *
   * ★ TWO SOURCES DISAGREE ABOUT MULTIPLICITY — READ BEFORE TRUSTING THIS FIELD.
   * `fed_annual_return` is cadence 'anniversary', but its requirement key
   * `cbca_annual_return` is catalog category 'annual' in `minute_book_requirements`.
   * So the completeness engine DOES fan it out per fiscal year, and the
   * board-suppression derivation exists purely to throw that fan-out away. Cadence
   * NAMES that conflict; it does NOT remove it. Removing it means either changing
   * the catalog category (a migration — it would move `requirementsTotal` and the %
   * denominator users see) or letting cadence drive the fan-out itself (the
   * registry-first stream). Both are out of scope and neither is implied here.
   *
   * ★ WHERE THIS VOCABULARY WOULD FIRST CRACK: an obligation that is
   * per-fiscal-year but due on an ANNIVERSARY has nowhere to sit — 'anniversary'
   * carries clock information that 'per-fiscal-year' does not. No such obligation
   * exists today.
   */
  cadence: 'per-fiscal-year' | 'anniversary' | 'once' | 'event';
  /**
   * Per-rule modal-copy namespace under `obligationNotice.*` (title/body). When set,
   * the obligation modal uses `obligationNotice.{copyKey}.{title,body}` instead of the
   * default `req.*` (art. 41 roster) copy. Omit → the default copy (every existing
   * caller stays byte-identical).
   */
  copyKey?: CopyKey;
  /** Obligations that must be SATISFIED before this filing can be completed. */
  prerequisites: readonly FilingPrerequisite[];
}

// ─── The table ───────────────────────────────────────────────────────────────

export const FILING_REGISTRY: readonly FilingRule[] = [
  {
    // QC REQ annual update — all QC-operating companies. FY-end + 6 months.
    ruleKey: 'qc_req_annual_update',
    requirementKeys: ['lsaq_req_annual_update', 'cbca_req_annual_update_qc'],
    statutoryBasis: 'art. 45 LPLE (RLRQ, c. P-44.1)',
    helpKey: null,
    dueDate: (ctx) => (ctx.fyEnd ? addMonthsClamped(ctx.fyEnd, 6) : null),
    // art. 45 LPLE ties the update to a COMPLETED fiscal year → one separately
    // outstandable instance per FY. The completeness fan-out is CORRECT here, so its
    // per-year row and this deadline twin are one row (→ OVERLAP_MERGE, derived).
    cadence: 'per-fiscal-year',
    prerequisites: [],
  },
  {
    // QC initial declaration (RE-200) — immatriculation + 60 days (day math, no clamp).
    ruleKey: 'qc_initial_declaration',
    requirementKeys: ['lsaq_declaration_initiale', 'cbca_declaration_initiale_qc'],
    statutoryBasis: 'art. 38 LPLE',
    helpKey: null,
    dueDate: (ctx) => {
      if (!ctx.immatriculationDate) return null;
      const due = parseLocalDate(ctx.immatriculationDate);
      due.setDate(due.getDate() + 60);
      return due;
    },
    // Filed at immatriculation and never again — a single lifetime instance, no
    // year. Its catalog rows are `foundational`, so the completeness engine never
    // fans it out: there is nothing to merge and nothing to suppress. Lands in
    // NEITHER derivation, which is correct rather than incidental.
    cadence: 'once',
    prerequisites: [],
  },
  {
    // Federal annual return (CBCA only) — incorporation anniversary (next future).
    // Harvey 2026-07-24: art. 263 LCSA fixes NO statutory deadline (it delegates to
    // the Director — "in the form and within the period established by him"); the
    // anniversary is Corporations Canada's ADMINISTRATIVE practice. Citation GREEN,
    // deadline rule administrative → the parenthetical says so (not "à confirmer").
    ruleKey: 'fed_annual_return',
    requirementKeys: ['cbca_annual_return'],
    statutoryBasis: 'art. 263 LCSA · délai administratif (Corporations Canada)',
    helpKey: 'fed_annual_return_admin_date',
    // ONE recurring instance on the anniversary clock — you are never "behind on
    // your 2023 return" the way you can be behind on 2023's REQ update. The
    // completeness fan-out is WRONG for this entry (its catalog category is
    // 'annual', so the engine fans it out anyway — see the multiplicity-conflict
    // note on `cadence`), so its per-year board rows are suppressed and this single
    // deadline row represents it. Complétude keeps the per-year record.
    cadence: 'anniversary',
    // Per-rule modal copy: names Corporations Canada, presents the administrative
    // deadline — NOT the art. 41 / 30-day Registraire roster copy.
    copyKey: 'fedAnnualReturn',
    dueDate: (ctx) => {
      if (!ctx.incorporationDate) return null;
      const inc = parseLocalDate(ctx.incorporationDate);
      const anniv = new Date(ctx.today.getFullYear(), inc.getMonth(), inc.getDate());
      if (anniv < ctx.today) anniv.setFullYear(ctx.today.getFullYear() + 1);
      return anniv;
    },
    // NOT in OVERLAP_MERGE (cadence 'anniversary', not 'per-fiscal-year'): the
    // completeness cbca_annual_return row and this deadline row are a latent
    // (not-yet-merged) pair; the board suppresses the completeness half so only this
    // recurring row shows.
    prerequisites: [
      {
        // PRACTICAL sequencing (Harvey: not a legal precondition — art. 263 imposes
        // none): the federal Annual Return asks for the date of the last annual
        // shareholders' meeting (or written resolution in lieu), so record it first.
        // CBCA-only filing → CBCA shareholder-resolution key.
        requirementKey: 'cbca_annual_shareholder_resolution',
        sameYear: true,
        reasonKey: 'fedAnnualReturnShareholderMeeting',
      },
    ],
  },
  {
    // QC REQ roster update — event-triggered by director/officer changes. Event-
    // relative: due = act date + 30 days. Not a calendar filing (no dueDate fn).
    ruleKey: 'qc_req_roster_update',
    requirementKeys: [],
    docKeys: [
      'director_appointment',
      'director_appointment_vacancy',
      'director_departure',
      'director_removal',
      'officer_appointment',
      'officer_departure',
    ],
    statutoryBasis: 'art. 41 LPLE (RLRQ, c. P-44.1)',
    helpKey: 'req',
    deadlineDays: 30,
    triggeredBy: 'roster_change',
    // Instantiated by an ACT, not a calendar — no act, no obligation. Carries no
    // requirementKeys and never reaches the completeness fan-out at all.
    cadence: 'event',
    prerequisites: [],
  },
];

// ─── Derived views (nothing re-lists keys — these are the ONLY readers) ──────────

const _byRuleKey: ReadonlyMap<string, FilingRule> = new Map(
  FILING_REGISTRY.map((r) => [r.ruleKey, r]),
);

const _byRequirementKey: ReadonlyMap<string, FilingRule> = new Map(
  FILING_REGISTRY.flatMap((r) => r.requirementKeys.map((k) => [k, r] as const)),
);

const _byDocKey: ReadonlyMap<string, FilingRule> = new Map(
  FILING_REGISTRY.flatMap((r) => (r.docKeys ?? []).map((k) => [k, r] as const)),
);

/** The external-requirement key set — replaces EXTERNAL_REQUIREMENT_KEYS. */
export function isExternalRequirementKey(key: string): boolean {
  return _byRequirementKey.has(key);
}

/**
 * requirement_keys whose completeness rows are suppressed from the A3 BOARD stream.
 * DERIVED FROM CADENCE: an 'anniversary' obligation is ONE recurring instance, so the
 * completeness engine's per-fiscal-year fan-out is wrong for it and its per-year board
 * rows are discarded in favour of the single deadline row. No other cadence qualifies —
 * 'per-fiscal-year' wants its fan-out kept (and merged), 'once' has none, 'event' never
 * reaches the catalog. Today: fed_annual_return → ['cbca_annual_return'].
 */
const _boardSuppressedKeys: ReadonlySet<string> = new Set(
  FILING_REGISTRY.filter((r) => r.cadence === 'anniversary').flatMap((r) => r.requirementKeys),
);

/**
 * True when this requirement_key's completeness rows should be dropped from the BOARD
 * obligation stream (completenessToObligations) — a recurring filing represented by its
 * single deadline row. Does NOT affect the completeness COUNT / Complétude / verdict.
 */
export function isBoardSuppressedRequirementKey(key: string): boolean {
  return _boardSuppressedKeys.has(key);
}

export function filingForRequirementKey(key: string): FilingRule | undefined {
  return _byRequirementKey.get(key);
}

export function filingForRuleKey(ruleKey: string): FilingRule | undefined {
  return _byRuleKey.get(ruleKey);
}

export function filingForDocKey(docKey: string): FilingRule | undefined {
  return _byDocKey.get(docKey);
}

/**
 * OVERLAP_MERGE view: completeness `requirementKey` → deadline `ruleKey`.
 * DERIVED FROM CADENCE: only a 'per-fiscal-year' obligation has a completeness half
 * and a deadline half describing the SAME per-year instance, so only it collapses to
 * one board row. 'anniversary' is suppressed instead (its halves are a latent,
 * not-yet-merged pair); 'once' is suppressed on both sides by other means; 'event'
 * has no completeness half at all. Reproduces the former literal map exactly (today:
 * the two REQ annual-update keys → qc_req_annual_update).
 */
export const OVERLAP_MERGE: Readonly<Record<string, string>> = Object.fromEntries(
  FILING_REGISTRY.filter((r) => r.cadence === 'per-fiscal-year').flatMap((r) =>
    r.requirementKeys.map((k) => [k, r.ruleKey] as const),
  ),
);
