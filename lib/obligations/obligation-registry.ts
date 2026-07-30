/**
 * OBLIGATION REGISTRY — the single source of truth for RECURRING OBLIGATIONS.
 *
 * ★ THE MEMBERSHIP TEST IS "DOES IT HAVE A CADENCE", NOT "IS IT FILED WITH A
 * GOVERNMENT". This header read "the single source of truth for government filing
 * obligations" until A4 R-2, and that was the table's own name asserting a scope it
 * no longer has: Dom's decision D-B admits INTERNAL obligations — the annual meeting
 * is held in the book and filed with nobody, and it belongs here. An entry declares
 * its own `exposure`; the table does not decide it. Renamed rather than annotated,
 * because a name that misdescribes its contents misleads every reader who never
 * reaches the docblock.
 *
 * WHY: "this needs a filing" used to be asserted in FOUR hardcoded places that
 * could drift out of sync — EXTERNAL_REQUIREMENT_KEYS (completeness feeder), the
 * deadline feeder's file_externally rules, OBLIGATIONS_BY_DOCKEY (req-obligations),
 * and OVERLAP_MERGE (aggregate). That drift class produced the 5-week #135 leak.
 * That history is unchanged and still reads "filing" because, at the time, every
 * entry was one.
 * This registry makes all four VIEWS onto one table: one entry per obligation,
 * holding its deadline rule, statutory basis, the requirement/doc keys it maps to,
 * and its prerequisites.
 *
 * ★ "A FUTURE GOVERNMENT REQUIREMENT IS ONE ENTRY HERE, NO EDITS ELSEWHERE" IS THE
 * TARGET, NOT TODAY'S BEHAVIOUR — this line used to assert it as present fact. Measured:
 * NOTHING ITERATES `OBLIGATION_REGISTRY` TO EMIT. The deadline feeder reaches this table
 * through three hardcoded `ruleForRuleKey` lookups, one per rule, and the annual
 * meeting does not consult it at all. So a fifth entry added today produces NO board row
 * — it can only decorate or suppress rows some other source already emitted. The claim
 * becomes true when the generic loop in feeders/deadlines.ts replaces those hand-written
 * blocks.
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
/**
 * TYPE-ONLY, AND IT MUST STAY THAT WAY IN BOTH DIRECTIONS.
 *
 * `exposure` and `actionKind` are declared ONCE, on the Obligation contract, and reused
 * here — the registry must NEVER re-declare a parallel narrower union, which is the
 * two-sources-of-truth defect this table exists to remove. `ObligationAction` is WIDER
 * than anything the table uses today (it also carries 'generate', 'upload', 'review',
 * 'none'); reusing the wide union is the point, a trimmed copy would be a second source.
 *
 * ⚠️ THIS CLOSES A CYCLE: `obligation.ts` already imports `CopyKey` FROM this module.
 * Both edges are `import type`, so both are ERASED at compile and NO runtime edge
 * exists. That erasure is load-bearing, not incidental — `obligation.ts` is a runtime
 * leaf and `OBLIGATION_REGISTRY` enters no client bundle. A VALUE import in EITHER direction
 * breaks both facts at once: it would pull this module's runtime content — the
 * `OBLIGATION_REGISTRY` table, `addMonthsClamped` / `completedFiscalYearEnd` /
 * `obligationFiscalYear`, and every derived index — into any client bundle that reaches
 * `obligation.ts`.
 */
import type { ObligationAction, ExposureClass } from './obligation';

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
 * The fiscal year an obligation ATTACHES TO — the `year` half of the completeness
 * identity (requirement_key, year). The most recent CLOSED fiscal year the company
 * existed through; before any has closed, the fiscal year currently OPEN. Never a
 * pre-incorporation year.
 *
 * ★ THIS IS FISCAL-YEAR MATH, NOT FILING MATH, and the distinction is why the name
 * changed in A4 R-2. It used to open "the fiscal year a government-filing RECEIPT
 * attaches to" — TRUE of the case it was written for and too narrow for what it
 * computes. Every completeness row carries a (requirement_key, year) identity,
 * INTERNAL ones included; an annual meeting has a fiscal year and no filing. The
 * federal return's receipt remains the clearest EXAMPLE, and it is the one the
 * clear-gate below describes.
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
export function obligationFiscalYear(
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
export interface ObligationDueCtx {
  fyEnd?: Date;
  immatriculationDate?: string | null;
  incorporationDate?: string | null;
  /**
   * NEW, AND STILL UNREAD AS OF A4 PHASE 3 — no rule's `dueDate` touches it, and phase 3
   * deliberately does NOT populate it.
   *
   * ★ CORRECTED WORDING: this originally read "THIS IS THE PHASE 3 SEAM", which was loose.
   * A4 phase 3 makes the seam REACHABLE — it puts the fiscal-year set onto
   * `CompanyComplianceInput`, where the feeder can get at it — but this ctx field stays
   * UNPOPULATED until A4 phase 4's generic loop actually needs it. Filling it earlier would
   * mean handing the set to EVERY rule's `dueDate`, including `qc_initial_declaration`, a
   * `cadence: 'once'` rule with no fiscal year anywhere in its logic — asserting a
   * relationship that does not exist.
   *
   * It is the SAME set the completeness checklist fans out over
   * (`RequirementCompletenessResult.fiscalYears`), which is what makes the phase-4
   * guarantee hold BY CONSTRUCTION rather than by coincidence: a per-year loop over this
   * set is assured a deadline twin for every completeness row, so no row can be emitted
   * for a year that has no checklist row to satisfy it.
   *
   * ★ TYPE MISMATCH WITH `fyEnd` ABOVE, ON PURPOSE — `endDate` is a STRING here while
   * `fyEnd` is a `Date`. Convert with the project's `parseLocalDate`, NEVER a raw
   * `new Date(string)`: the latter parses 'YYYY-MM-DD' as UTC midnight and shifts the day
   * BACKWARD in every UTC-negative zone, which is the exact trap `parseLocalDate` exists
   * to close.
   *
   * ⚠️ INHERITED BLAST RADIUS, NAMED SO PHASE 3 DOES NOT DISCOVER IT: these `endDate`s are
   * composed from the company's CURRENT year-end applied to every HISTORICAL year — see
   * ZK_Core, a fiscal year's boundaries belong to that year, and a company that changed its
   * year-end has years whose real boundaries differ from what this set reports. Scaling
   * from one anchor to N MULTIPLIES that known defect; it does not create it, and phase 3
   * is not the place that fixes it.
   */
  fiscalYears?: readonly { year: number; endDate: string }[];
  today: Date;
}

/**
 * Per-rule modal-copy namespaces under `obligationNotice.*`. A filing sets this when
 * its modal must differ from the default art. 41 roster copy.
 *
 * ★ HAND-MAINTAINED, NOT DERIVED. `OBLIGATION_REGISTRY` below is annotated
 * `readonly ObligationRule[]`, which erases every literal, so `typeof`-deriving this union
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

/**
 * i18n keys for an obligation's ROW / DISPLAY TITLE, under `obligationTitle.*`.
 *
 * ★ NAMESPACE DISTINCTION, DELIBERATE: `obligationTitle.*` is the title a row RENDERS
 * UNDER; `obligationNotice.*` is MARKER and MODAL copy. For the federal return the two
 * are DIFFERENT STRINGS on purpose — `obligationTitle.fedAnnualReturn` is "Rapport annuel
 * — Corporations Canada" (what the obligation IS), while
 * `obligationNotice.fedAnnualReturn.title` is "Dépôt à produire auprès de Corporations
 * Canada" (what the user must DO). Never point one field at the other's namespace: a
 * `titleKey` resolving to notice copy would render modal text as a board row title.
 *
 * ★ OPTIONAL, AND THE REASON IS STRUCTURAL — not "lawyer-pending", not "arriving later".
 * A cadence 'event' rule is ACT-INSTANTIATED, and an act's title is COMPOSED PER ACT at
 * the feeder — `{title} · {person} · {year}` via `resolveEventDocTitle` (see
 * lib/minute-book/event-act-helpers.ts) and `composeDisplayName` — from a docKey variant
 * that is not recoverable from the act alone. A per-act title can therefore NEVER be a
 * static registry key. The split follows cadence PERMANENTLY: calendar-instantiated rules
 * carry a titleKey, act-instantiated ones cannot. `qc_req_roster_update` omits it for
 * that reason and always will.
 *
 * ★ HAND-MAINTAINED, NOT DERIVED — same reasoning as `CopyKey` above (the table is
 * annotated `readonly ObligationRule[]`, which erases every literal) and the same obligation
 * to add new values here. Failure-to-compile IS the forcing function, and phase 4's
 * generic loop is where a CALENDAR rule missing a titleKey must fail LOUDLY rather than
 * render a titleless row.
 *
 * ★ NOT narrowed via next-intl's message-key types, AND THAT IS A CHOICE. Doing so is a
 * real refactor (~8 files — see ZK_Core on a3-presentation's `labelKey`) and it belongs to
 * phase 4's narrowing chain, traced end to end rather than bolted on here.
 *
 * ⚠️ This union does NOT prove the messages exist. Each key must be present in BOTH
 * messages/fr.json and messages/en.json; typed messages checks FR only (it is the type
 * source) and EN not at all, so the EN half rests on a grep. That is the standing
 * bilingual gap, not one this union creates.
 *
 * PHASE 4: `'obligationTitle.annualMeeting'` joins this union when `annual_meeting` gets
 * its registry entry — its FR/EN literal pair already exists in feeders/deadlines.ts.
 */
export type TitleKey =
  | 'obligationTitle.reqAnnualUpdate'
  | 'obligationTitle.initialDeclaration'
  | 'obligationTitle.fedAnnualReturn';

/**
 * An obligation that must be SATISFIED before the obligation declaring it can be
 * completed. Both halves are obligations — this used to read "before this FILING can
 * be completed", which named the blocker correctly and the blocked one wrongly, from
 * back when every entry was a filing.
 */
export interface ObligationPrerequisite {
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

export interface ObligationRule {
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
  dueDate?: (ctx: ObligationDueCtx) => Date | null;
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
  /**
   * ★ FRAMEWORK ALLOW-LIST. Omit = ALL frameworks.
   *
   * ⚠️ POLARITY INVERSION vs THE CODE IT DESCRIBES: this is an ALLOW-list, while
   * feeders/deadlines.ts gates the same fact with a DENY-list (`framework !== 'LSA'`).
   * The two agree ONLY because the union has exactly TWO members.
   *
   * ★ AND THAT TWO-MEMBER UNION IS A DERIVED VIEW, NOT THE STORED COLUMN. `lib/types.ts`
   * stores `IncorporationType = 'LSAQ' | 'LSA' | 'CBCA'` — THREE members. The narrowing to
   * two happens at the dashboard page, where LSAQ collapses into LSA.
   *
   * ★ DO NOT CONFLATE THE TWO "THIRDS". A third FRAMEWORK means a NEW PROVINCE. The
   * existing third INCORPORATION_TYPE value ('LSAQ') is already Québec and is NOT one.
   * Multi-province is on the roadmap: whoever adds a province must revisit EVERY entry in
   * this table, because omitting a framework here means opting IN, not out.
   *
   * FIFTEEN inline copies of this union already exist — 5 in components/, 6 in lib/pdf/
   * (all written in the REVERSED member order, which is why a one-order grep undercounts
   * them), 3 elsewhere in lib/, 1 in app/. This is the SIXTEENTH. Consolidation onto one
   * leaf vocabulary type is BANKED as its own item: a registry-OWNED type would look
   * canonical without being canonical, since none of the other copies would import it.
   */
  frameworks?: readonly ('LSA' | 'CBCA')[];
  /**
   * WHO the obligation is exposed to, and HOW it is discharged. Both reuse the Obligation
   * contract's unions via the type-only import at the top of this file — the registry
   * declares no parallel, narrower copy of either.
   *
   * NON-OPTIONAL, both. Every row in this table has an answer, and a row that forgot one
   * must fail to compile. That is the entire gate.
   *
   * ⚠️ `hasFiling` STAYS DERIVED from `actionKind === 'file_externally'` and must NEVER be
   * declared here — see ZK_Core: gate on what the row IS, never on a companion flag
   * someone remembered to set. Declaring it would re-create exactly the
   * boolean-beside-the-fact drift that `overlapMerge` and `boardSuppressCompletenessRows`
   * were, and that `cadence` replaced.
   */
  exposure: ExposureClass;
  actionKind: ObligationAction;
  /**
   * i18n key for the row's DISPLAY TITLE. OPTIONAL — and see `TitleKey` above for why that
   * is STRUCTURAL rather than provisional: an act-instantiated rule (cadence 'event')
   * composes its title PER ACT and can never carry a static key. Every CALENDAR rule
   * carries one.
   */
  titleKey?: TitleKey;
  /**
   * Conditions under which this obligation is PRESUMED DISCHARGED and must not be emitted
   * at all. Generalizes the two caller-computed booleans the deadline feeder takes today —
   * `hasLaterAnnualFiling` (the RE-200) and `currentFedReturnFiled` (the federal return) —
   * into one declarative shape.
   *
   * `yearScope` — WHICH satisfied instance counts:
   *   'attachYear'         — ONLY an instance at this row's own attach year (the fiscal
   *                          year its receipt attaches to). Today's `currentFedReturnFiled`.
   *   'afterIncorporation' — any satisfied instance for a year STRICTLY AFTER
   *                          incorporation. Today's `hasLaterAnnualFiling`: a later
   *                          certified annual filing proves the founding REQ dossier was
   *                          already initialized, so the initial declaration is presumed
   *                          done (Harvey 2026-07-05, Option 1).
   *   'any'                — any satisfied instance, any year.
   *
   * ★ WATCH THE AXIS IF A FOURTH VALUE IS EVER ADDED. These three are NOT on one axis:
   * 'attachYear' and 'any' are QUANTIFIERS OVER YEARS, while 'afterIncorporation' is a
   * RELATION TO A DATE. They cohere only under the question "WHICH satisfied instance
   * discharges this obligation?" — so that question, not the list, is what a new value must
   * answer. A value added on a different axis (e.g. 'sameQuarter', 'ifFiledLate') would
   * COMPILE, and its suppression behaviour would quietly become false. Same hazard the
   * `cadence` docblock guards against in its own union, and the same reason that docblock
   * states its question out loud.
   *
   * ★ `requirementKeys` HAS EXACTLY ONE MEANING WHEN OMITTED: ANY key satisfies. It NEVER
   * defaults to the rule's own `requirementKeys`. Where a SPECIFIC key is meant it is
   * declared explicitly, always. A field whose omission means two different things
   * depending on the reader is the defect class this table exists to remove.
   */
  suppressWhenSatisfied?: {
    requirementKeys?: readonly string[];
    yearScope: 'attachYear' | 'afterIncorporation' | 'any';
  };
  /** Obligations that must be SATISFIED before this filing can be completed. */
  prerequisites: readonly ObligationPrerequisite[];
}

// ─── The table ───────────────────────────────────────────────────────────────

export const OBLIGATION_REGISTRY: readonly ObligationRule[] = [
  {
    // QC REQ annual update — all QC-operating companies. FY-end + 6 months.
    ruleKey: 'qc_req_annual_update',
    requirementKeys: ['lsaq_req_annual_update', 'cbca_req_annual_update_qc'],
    statutoryBasis: 'art. 45 LPLE (RLRQ, c. P-44.1)',
    helpKey: null,
    // GENERIC-EMISSION FIELDS (phase 2 — declared, deliberately UNREAD).
    // `frameworks` OMITTED = both: art. 45 LPLE binds every QC-operating company,
    // whichever regime it was incorporated under.
    // `suppressWhenSatisfied` OMITTED: each fiscal year's update is a SEPARATELY
    // outstandable debt, so a satisfied 2024 update can never presume 2025's.
    exposure: 'external',
    actionKind: 'file_externally',
    titleKey: 'obligationTitle.reqAnnualUpdate',
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
    // GENERIC-EMISSION FIELDS (phase 2 — declared, deliberately UNREAD).
    // ★ THIS IS THE ENTRY WHERE THE ALLOW/DENY POLARITY INVERSION IS LIVE: the allow-list
    // ['CBCA'] is the translation of feeders/deadlines.ts's `framework !== 'LSA'`. They
    // agree only while the union has two members — see the `frameworks` docblock. The
    // exclusion is substantive, not a gate detail: Harvey 2026-07-24 (GREEN, LSAQ art.
    // 8-9-10) found a QUASI-IDENTITY for provincially-incorporated companies — art. 8 lets
    // the declaration ride the articles of incorporation and art. 9 transmits them to the
    // registraire, so being registered IS having filed, and an LSAQ company never owes it.
    exposure: 'external',
    actionKind: 'file_externally',
    titleKey: 'obligationTitle.initialDeclaration',
    frameworks: ['CBCA'],
    // Presumed-done (Harvey 2026-07-05, Option 1) — the declarative twin of the deadline
    // feeder's `hasLaterAnnualFiling`. requirementKeys OMITTED = ANY key satisfies, which
    // is exactly that flag's meaning: any CERTIFIED annual filing for a year strictly after
    // incorporation proves the founding REQ dossier was initialized, whichever key carried
    // it. Never self-defaulting — see the field's docblock.
    suppressWhenSatisfied: { yearScope: 'afterIncorporation' },
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
    // GENERIC-EMISSION FIELDS (phase 2 — declared, deliberately UNREAD).
    // ★ THE ONLY ENTRY CARRYING BOTH A titleKey AND A copyKey, AND THEY RESOLVE TO
    // DIFFERENT STRINGS ON PURPOSE: `obligationTitle.fedAnnualReturn` is "Rapport annuel —
    // Corporations Canada" (what the obligation IS, the row title), while
    // `obligationNotice.fedAnnualReturn.title` is "Dépôt à produire auprès de Corporations
    // Canada" (what the user must DO, the modal). Two namespaces, two jobs — see TitleKey.
    exposure: 'external',
    actionKind: 'file_externally',
    titleKey: 'obligationTitle.fedAnnualReturn',
    frameworks: ['CBCA'],
    // The declarative twin of the deadline feeder's `currentFedReturnFiled` clear-gate:
    // once the receipt for THIS row's attach year is satisfied, the row leaves the board,
    // and it returns when the next FY-end advances the anchor.
    // ★ requirementKeys IS WRITTEN OUT EXPLICITLY PRECISELY BECAUSE IT COINCIDES with this
    // rule's own `requirementKeys`. The coincidence must not be mistaken for a default:
    // omission means ANY key, never self, so a self-referring rule states its key.
    suppressWhenSatisfied: { requirementKeys: ['cbca_annual_return'], yearScope: 'attachYear' },
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
    // GENERIC-EMISSION FIELDS (phase 2 — declared, deliberately UNREAD).
    // ★ titleKey OMITTED, AND PERMANENTLY SO — not pending, not an oversight. cadence
    // 'event' means ACT-INSTANTIATED, and an act's title is COMPOSED PER ACT at the feeder
    // (resolveEventDocTitle + composeDisplayName) from a docKey variant that is not
    // recoverable from the act alone. A per-act title can never be a static registry key.
    // This is the cadence split: calendar rules carry a titleKey, act-instantiated ones
    // cannot. See TitleKey.
    // `frameworks` OMITTED = both: art. 41 LPLE binds every QC-operating company.
    // `suppressWhenSatisfied` OMITTED: each ACT owes its own filing, so one satisfied
    // roster update can never presume another act's.
    exposure: 'external',
    actionKind: 'file_externally',
    deadlineDays: 30,
    triggeredBy: 'roster_change',
    // Instantiated by an ACT, not a calendar — no act, no obligation. Carries no
    // requirementKeys and never reaches the completeness fan-out at all.
    cadence: 'event',
    prerequisites: [],
  },
];

// ─── Derived views (nothing re-lists keys — these are the ONLY readers) ──────────

const _byRuleKey: ReadonlyMap<string, ObligationRule> = new Map(
  OBLIGATION_REGISTRY.map((r) => [r.ruleKey, r]),
);

const _byRequirementKey: ReadonlyMap<string, ObligationRule> = new Map(
  OBLIGATION_REGISTRY.flatMap((r) => r.requirementKeys.map((k) => [k, r] as const)),
);

const _byDocKey: ReadonlyMap<string, ObligationRule> = new Map(
  OBLIGATION_REGISTRY.flatMap((r) => (r.docKeys ?? []).map((k) => [k, r] as const)),
);

/**
 * requirement_keys whose completeness rows are suppressed from the A3 BOARD stream.
 * DERIVED FROM CADENCE: an 'anniversary' obligation is ONE recurring instance, so the
 * completeness engine's per-fiscal-year fan-out is wrong for it and its per-year board
 * rows are discarded in favour of the single deadline row. No other cadence qualifies —
 * 'per-fiscal-year' wants its fan-out kept (and merged), 'once' has none, 'event' never
 * reaches the catalog. Today: fed_annual_return → ['cbca_annual_return'].
 */
const _boardSuppressedKeys: ReadonlySet<string> = new Set(
  OBLIGATION_REGISTRY.filter((r) => r.cadence === 'anniversary').flatMap((r) => r.requirementKeys),
);

/**
 * True when this requirement_key's completeness rows should be dropped from the BOARD
 * obligation stream (completenessToObligations) — a recurring filing represented by its
 * single deadline row. Does NOT affect the completeness COUNT / Complétude / verdict.
 */
export function isBoardSuppressedRequirementKey(key: string): boolean {
  return _boardSuppressedKeys.has(key);
}

export function ruleForRequirementKey(key: string): ObligationRule | undefined {
  return _byRequirementKey.get(key);
}

export function ruleForRuleKey(ruleKey: string): ObligationRule | undefined {
  return _byRuleKey.get(ruleKey);
}

export function ruleForDocKey(docKey: string): ObligationRule | undefined {
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
  OBLIGATION_REGISTRY.filter((r) => r.cadence === 'per-fiscal-year').flatMap((r) =>
    r.requirementKeys.map((k) => [k, r.ruleKey] as const),
  ),
);
