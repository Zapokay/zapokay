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
  reasonKey: string;
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
   * Whether this filing's completeness requirement and its deadline rule are the
   * SAME obligation and should collapse to one board row (the OVERLAP_MERGE seam).
   * Only the per-FY REQ annual update is flagged today — RE-200 is suppressed on
   * both sides, and the federal annual return is a latent (not-yet-merged) pair.
   */
  overlapMerge?: boolean;
  /**
   * Suppress this filing's completeness `requirementKey` rows from the A3 BOARD stream
   * (completenessToObligations only) — NOT from the completeness COUNT / Complétude /
   * verdict. For a RECURRING filing (Harvey 2026-07-24: the federal annual return is
   * one recurring obligation, not N per-year debts), the single deadline row represents
   * it on the board; Complétude keeps its per-year record. Mirrors the RE-200 board-only
   * suppression. A future recurring filing declares this in its one registry entry.
   */
  boardSuppressCompletenessRows?: boolean;
  /**
   * Per-rule modal-copy namespace under `obligationNotice.*` (title/body). When set,
   * the obligation modal uses `obligationNotice.{copyKey}.{title,body}` instead of the
   * default `req.*` (art. 41 roster) copy. Omit → the default copy (every existing
   * caller stays byte-identical).
   */
  copyKey?: string;
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
    overlapMerge: true, // the completeness annual requirement + deadline twin are one row
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
    // NOT overlapMerge: suppressed on both sides today (presumed-done RE-200).
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
    // Recurring obligation → ONE board row (this deadline row); its per-year
    // completeness rows are suppressed from the board stream (Complétude keeps them).
    boardSuppressCompletenessRows: true,
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
    // NOT overlapMerge: the completeness cbca_annual_return row and this deadline row
    // are a latent (not-yet-merged) pair; the board suppresses the completeness half
    // (above) so only this recurring row shows.
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

/** requirement_keys whose completeness rows are suppressed from the A3 BOARD stream. */
const _boardSuppressedKeys: ReadonlySet<string> = new Set(
  FILING_REGISTRY.filter((r) => r.boardSuppressCompletenessRows).flatMap((r) => r.requirementKeys),
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
 * OVERLAP_MERGE view: completeness `requirementKey` → deadline `ruleKey`, ONLY for
 * entries flagged `overlapMerge`. Reproduces the former literal map exactly (today:
 * the two REQ annual-update keys → qc_req_annual_update).
 */
export const OVERLAP_MERGE: Readonly<Record<string, string>> = Object.fromEntries(
  FILING_REGISTRY.filter((r) => r.overlapMerge).flatMap((r) =>
    r.requirementKeys.map((k) => [k, r.ruleKey] as const),
  ),
);
