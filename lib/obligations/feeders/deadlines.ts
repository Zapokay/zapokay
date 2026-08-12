/**
 * A3 Feeder 3 — deadline obligations (pure, no I/O). ONE consumer: the dashboard server
 * component's A3 board assembly.
 *
 * ★ THIS READ "zero consumers" UNTIL A4 PHASE 3, AND IT WAS TRUE WHEN WRITTEN (c5adc85,
 * 2026-07-02) — the feeder shipped ahead of its UI. `dc5eb27` (2026-07-10) wired the
 * dashboard to it, and the claim then survived 48 commits, because nothing type-checks a
 * header. Recorded rather than quietly overwritten: a comment that says what it got wrong
 * stays trustworthy. Only the COUNT was ever wrong — `pure, no I/O` is still TRUE.
 *
 * Emits recurring/calendar statutory + governance deadlines into the
 * generalized Obligation contract, on Harvey-verified deadlines
 * (harvey-ongoing-compliance-obligations, 2026-07-02). Replaces the deprecated
 * engine's unsourced/buggy calculateDueDate formulas — notably the REQ annual
 * update, corrected from +4mo to +6mo (art. 45 LPLE + reg P-44.1 r.1 art. 3).
 *
 * SCOPE: calendar/recurring deadlines only. EVENT-triggered co-existing
 * deadlines — e.g. a director change firing BOTH the 15-day federal notice AND
 * the 30-day REQ update — are event-relative, not calendar-absolute, so they
 * are feeder 2's (REQ ObligationNotice) territory and are OUT of scope here.
 *
 * QC scope: ZapOkay serves QC-operating corporations; the QC filings below
 * apply to all such companies (both frameworks). Province gating, if ever
 * needed, is the caller's concern — this input carries no province.
 */

import type { Obligation, ObligationAction } from '../obligation';
import { deriveStatus } from '../aggregate';
import { computeLiveness } from '../liveness';
import type { ChecklistItem } from '@/lib/minute-book/requirement-completeness';
import { composeDisplayName } from '@/lib/display-name';
import { parseLocalDate } from '@/lib/utils';
import {
  OBLIGATION_REGISTRY,
  isBoardSuppressedRequirementKey,
  addMonthsClamped,
  completedFiscalYearEnd,
  obligationFiscalYear,
  type CopyKey,
  type TitleKey,
  type ObligationRule,
} from '../obligation-registry';

export interface CompanyComplianceInput {
  framework: 'LSA' | 'CBCA';
  fyEndMonth: number;
  fyEndDay: number;
  incorporationDate: string | null;
  immatriculationDate: string | null;
  /**
   * The completeness checklist, PASSED IN — not fetched. UNREAD as of phase 3: no
   * expression in this feeder touches it, and the entry destructure deliberately does not
   * name it. Phase 4's generic loop is what reads it.
   *
   * ★ PURITY IS PRESERVED, and that distinction is the reason passing it is safe: this
   * feeder still performs NO I/O. The caller ALREADY holds this array — it computes all
   * three booleans below from it — so handing the array over adds a parameter, not a
   * query.
   *
   * What the arrival DOES falsify is an older architectural justification, not the purity
   * itself. That correction is recorded ONCE, on `hasLaterAnnualFiling` below, where the
   * claim originated — deliberately not repeated here, because a correction that exists in
   * two places drifts as soon as someone deletes one copy.
   */
  checklist: readonly ChecklistItem[];
  /**
   * The company's fiscal-year set — the SAME one the completeness checklist fans out over
   * (`RequirementCompletenessResult.fiscalYears`). PASSED IN, and UNREAD as of phase 3.
   *
   * This is what phase 4's per-year loop will iterate, and taking it from the completeness
   * result rather than recomputing it is what makes "every per-year deadline row has a
   * completeness twin" true BY CONSTRUCTION instead of by coincidence.
   *
   * ⚠️ INHERITED CAVEAT, carried here so phase 4 does not rediscover it: these `endDate`s
   * are composed from the company's CURRENT year-end applied to every HISTORICAL year. Per
   * ZK_Core a fiscal year's boundaries belong to THAT year, so a company that changed its
   * year-end has years whose real boundaries differ from what this set reports. Phase 4
   * MULTIPLIES that known blast radius from one anchor to N — it does not create it, and
   * fixing it is not phase 4's job.
   */
  fiscalYears: readonly { year: number; endDate: string }[];
  // ─── ★ TRANSIENT DOUBLE SOURCE — THE `checklist` ABOVE IS AUTHORITATIVE ──────────
  // The three booleans below are NOT independent facts. Each is a CALLER-COMPUTED
  // PROJECTION of the very `checklist` declared above — literally a `checklist.some(...)`
  // predicate — and now that the array itself arrives on this input, the feeder could
  // evaluate every one of them itself.
  //
  // ★ IF THE TWO EVER DISAGREE, THE BOOLEANS ARE WRONG. The checklist is the record; a
  // boolean is one question asked of that record, at one moment, by one caller.
  //
  // REDUNDANT BY DESIGN AND ONLY TEMPORARILY — AND THE REDUNDANCY IS NOW PARTIAL. A4 phase
  // 4a's generic loop reads `checklist` and evaluates each rule's own
  // `suppressWhenSatisfied`, so `hasLaterAnnualFiling` and `currentFedReturnFiled` are
  // DECLARED AND UNREAD here: still on this interface, still passed by both callers, read by
  // nothing in this feeder. Nothing in the toolchain flags that — noUnusedLocals is off — so
  // this comment is the only signal. `noPriorAnnualMeetingRecorded` IS still read, by the
  // annual_meeting block below.
  //
  // ⚠️ SO THE DOUBLE SOURCE STILL EXISTS and the warning above still stands: two
  // representations of one fact remain on this interface until A4 PHASE 4c deletes all three.
  //
  // ⚠️ THIS PARAGRAPH USED TO END "they survive this phase only because phase 3 is additive —
  // nothing here may read the checklist yet." That was a constraint on PHASE 3, and phase 4a
  // lifted it. Recorded rather than retrofitted.
  //
  // ★ WHY THIS NOTE EXISTS AND NOT JUST THE @deprecated TAGS: a flag that describes how to
  // CORRECT another component's output is exactly what `cadence` replaced in the obligation
  // registry — `overlapMerge` and `boardSuppressCompletenessRows` were instructions for
  // fixing the completeness fan-out, written as though they described the obligation. This
  // is that same shape, tolerated deliberately for one phase and marked so that no future
  // reader mistakes a transitional projection for a source of truth.
  /**
   * @deprecated Transitional projection of `checklist` — a `checklist.some(...)` over
   * satisfied annual rows for a year after incorporation. Read `checklist` directly.
   * Slated for removal in phase 4 of the A4 arc, when the generic loop derives it.
   *
   * RE-200 presumed-done signal (Harvey 2026-07-05). True when the company has at least
   * one CERTIFIED (satisfied) annual filing for a year strictly after incorporation —
   * which necessarily means its founding REQ dossier was already initialized, so the
   * initial declaration must NOT surface as an action. The caller computes it from the
   * completeness checklist.
   *
   * ★ HISTORY, RECORDED ONCE FOR ALL THREE OF THESE BOOLEANS: the justification that used
   * to close this block said the feeder "stays record-agnostic (it receives the fact, it
   * does not look filings up)", and the other two booleans referred back to it. Phase 3
   * falsified the label — this feeder now HOLDS the checklist. It still performs no I/O, so
   * the PURITY the label was reaching for survives; the label itself does not, and nothing
   * type-checks a justification. The two booleans below therefore carry no such claim.
   */
  hasLaterAnnualFiling: boolean;
  /**
   * @deprecated Transitional projection of `checklist` — a `checklist.some(...)` matching
   * (`cbca_annual_return`, the current fiscal year, satisfied). Read `checklist` directly.
   * Slated for removal in phase 4 of the A4 arc.
   *
   * Federal-return clear-gate: true when the CURRENT-fiscal-year cbca_annual_return
   * receipt is already uploaded (satisfied). Skips the fed_annual_return push so the
   * row leaves the board once filed; when the next FY-end passes, the fiscal-year
   * anchor advances → new current-FY row (unsatisfied) → the push fires again.
   * Caller-derived from the checklist, like hasLaterAnnualFiling above.
   */
  currentFedReturnFiled: boolean;
  /**
   * @deprecated Transitional projection of `checklist` — a `checklist.some(...)` over
   * ANNUAL_MEETING_RECORD_KEYS. Read `checklist` directly. Slated for removal in phase 4
   * of the A4 arc. ⚠️ REMOVING IT DOES NOT REMOVE CONDITION (2) BELOW: that half is a
   * date comparison, not a checklist question, so it has no projection to delete and no
   * `checklist` expression can replace it. Deleting only the first half would leave the
   * first-meeting predicate incomplete.
   *
   * FIRST-annual-meeting proxy, condition (1): true when NO annual shareholders'
   * resolution has ever been recorded, for any year (see ANNUAL_MEETING_RECORD_KEYS).
   * Condition (2) — inc + 18mo still in the FUTURE — is applied INSIDE this feeder,
   * which already holds incorporationDate and today. BOTH are load-bearing; see the
   * annual_meeting push.
   *
   * Three separate claims, so each can be checked on its own rather than bundled under one
   * label: the caller still derives this value — TRUE. This feeder performs no I/O — TRUE.
   * This feeder cannot see the underlying records — FALSE as of phase 3.
   */
  noPriorAnnualMeetingRecorded: boolean;
}

/**
 * Checklist requirement_keys whose presence RECORDS that an annual shareholders'
 * meeting happened (the resolution in lieu of meeting / its minutes). The caller
 * derives `noPriorAnnualMeetingRecorded` from these; the list is exported HERE, beside
 * the only rule that consumes it, so it cannot drift from its consumer. Not a filing —
 * deliberately NOT a OBLIGATION_REGISTRY entry (annual_meeting is exposure 'internal',
 * held in the book and never filed with a government).
 */
export const ANNUAL_MEETING_RECORD_KEYS: readonly string[] = [
  'lsaq_annual_shareholder_resolution',
  'cbca_annual_shareholder_resolution',
];

/**
 * Due-soon ranking window (days). PROVISIONAL — the real value is a Phase-3
 * ranking decision; 30 is a placeholder so deriveStatus has a clock to overlay.
 */
const DUE_SOON_WINDOW = 30;

/**
 * FR/EN strings for each `TitleKey`. A RESOLUTION TABLE, not a second declaration:
 * WHICH title a rule has is declared on the rule (`titleKey`) and is now READ; WHAT
 * that title says lives here. One fact, one rendering.
 *
 * ★ WHY THE STRINGS ARE HERE AND NOT READ FROM messages/*.json: this feeder is pure
 * and has no translator. Resolving i18n would make it async and server-bound, which
 * the module is documented not to be. The destination is `Obligation` gaining a
 * `titleKey` field so the UI resolves it — at which point THIS MAP IS DELETED and its
 * contents are already in the locale files. That is a deletion, not a reconciliation.
 *
 * ★ `Record<TitleKey, …>` IS EXHAUSTIVE, AND THAT IS THE POINT. A new member of the
 * TitleKey union with no entry here is a tsc error, so the union's forcing function
 * reaches the strings instead of stopping at the key.
 *
 * ⚠️ WHAT IS **NOT** CHECKED, AND THE RISK IS ONE-DIRECTIONAL. Two things are
 * compile-checked — the union is complete, and this map covers it. NOTHING checks that
 * these strings still MATCH `obligationTitle.*` in messages/fr.json and messages/en.json.
 * They were identical when this map was written (measured, all six). A reader of this
 * map sees the warning; a reader of the locale files sees nothing, because JSON takes no
 * comments and the string "obligationTitle.reqAnnualUpdate" does not appear there — so
 * grep-the-claim breaks at exactly that boundary. AND THE LIKELY EDIT DIRECTION IS THE
 * UNMITIGATED ONE: translation passes happen in the locale files. Until the map is
 * deleted, any edit to `obligationTitle.*` must be made here too.
 */
const TITLES: Record<TitleKey, { fr: string; en: string }> = {
  'obligationTitle.initialDeclaration': {
    fr: 'Déclaration initiale (RE-200)',
    en: 'Initial Declaration (RE-200)',
  },
  'obligationTitle.reqAnnualUpdate': {
    fr: 'Mise à jour annuelle au REQ',
    en: 'REQ Annual Update',
  },
  'obligationTitle.fedAnnualReturn': {
    fr: 'Rapport annuel — Corporations Canada',
    en: 'Annual Return — Corporations Canada',
  },
};

/**
 * REGISTRY VALIDATION, AT MODULE LOAD — deliberately not per call.
 *
 * Both checks are pure structural properties of a static const array: they depend on no
 * company, no clock and no ctx, so evaluating them per render would repeat a constant.
 * ★ AND THE BLAST RADIUS DECIDES IT: the registry is COMPILE-TIME DATA, so a malformed
 * entry should break the BUILD, not a user's dashboard. Running here, the module fails on
 * import. [MEASURED 2026-07-30 — a participating rule with no dueDate, planted in a
 * throwaway worktree: `npm run build` EXIT 1, "Failed to collect page data for
 * /[locale]/dashboard", throw text verbatim in stderr. It does not print-and-pass.
 * ⚠️ Next DOES swallow its own sentinel errors in that same phase — DYNAMIC_SERVER_USAGE
 * is how it detects a dynamic route — but it propagates arbitrary throws. Do not
 * generalise from the swallowed ones to this.] Running inside the feeder, a bad entry pushed by someone who never opened the
 * page would take out /dashboard in production for every company — the wrong failure
 * surface for a developer mistake.
 *
 * WHY THROW RATHER THAN SKIP: both conditions produce INVISIBLE defects. A participating
 * rule with no date rule is a board row that silently never appears; one with no title is
 * a blank row. Silence is the hardest defect class here, so neither is a `continue`.
 *
 * ★ `titleKey` CANNOT SIMPLY BE MADE NON-OPTIONAL, and the reason is structural rather
 * than an oversight: an act-instantiated rule (`cadence: 'event'`) composes its title PER
 * ACT at the feeder and can never carry a static key. So the field is legitimately
 * optional on the type, while "required for a rule this feeder emits" is an invariant the
 * type cannot express. That is precisely what an assertion is for.
 */
for (const rule of OBLIGATION_REGISTRY) {
  if (rule.cadence === 'event') continue; // act-instantiated — feeder 2's territory
  if (typeof rule.dueDate !== 'function') {
    throw new Error(
      `OBLIGATION_REGISTRY: '${rule.ruleKey}' has cadence '${rule.cadence}' but no dueDate ` +
        `function. Calendar-instantiated rules are emitted by this feeder and need one. If ` +
        `the deadline is genuinely not known yet, declare \`dueDate: () => null\` — the loop ` +
        `skips a null date by the normal convention, and "we do not know this date" becomes ` +
        `an explicit declaration rather than an absent field.`,
    );
  }
  if (!rule.titleKey) {
    throw new Error(
      `OBLIGATION_REGISTRY: '${rule.ruleKey}' has cadence '${rule.cadence}' but no titleKey. ` +
        `A rule this feeder emits needs one, or its board row renders blank. Only ` +
        `cadence 'event' rules may omit it (their titles are composed per act).`,
    );
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────
// Local formatting helpers. The DATE-ANCHOR helpers (completedFiscalYearEnd,
// obligationFiscalYear, addMonthsClamped) now live in obligation-registry.ts — their single
// home now that lib/compliance is deleted — and are imported above.

function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Feeder ──────────────────────────────────────────────────────────────────

export function deadlineObligations(
  input: CompanyComplianceInput,
  today: Date,
): Obligation[] {
  // `hasLaterAnnualFiling` and `currentFedReturnFiled` are NO LONGER DESTRUCTURED: the
  // generic loop evaluates each rule's own `suppressWhenSatisfied` against `checklist`
  // instead. Both remain on the interface — the caller still passes them and phase 4c
  // removes them — so this is the first phase in which they are declared and unread.
  // `noPriorAnnualMeetingRecorded` is still read, by the annual_meeting block below.
  const { framework, fyEndMonth, fyEndDay, incorporationDate, immatriculationDate, checklist, noPriorAnnualMeetingRecorded } = input;
  const obligations: Obligation[] = [];

  // DISPLAY-year fallback: rows without a fiscal year (RE-200 initial declaration,
  // CBCA federal anniversary) use the incorporation year (Dom's ruling — same
  // treatment as foundational, plain year). Calendar rows (REQ update, annual
  // meeting) already carry o.year and never hit this fallback.
  const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;

  /**
   * PRESUMED DISCHARGED — the declarative form of the caller-computed booleans this feeder
   * used to take. Evaluates a rule's own `suppressWhenSatisfied` against the checklist the
   * caller now passes whole (A4 phase 3 put it on the input; this is what reads it).
   *
   * ★ `requirementKeys` OMITTED MEANS **ANY** KEY, NEVER SELF. The field's docblock says so
   * explicitly, and `fed_annual_return` writes its keys out even though they COINCIDE with
   * its own `requirementKeys` — precisely so the coincidence is not mistaken for a default.
   * Omission therefore skips the key filter entirely rather than defaulting to the rule.
   *
   * The two yearScope values in use reproduce the two deleted booleans exactly:
   *   'afterIncorporation' — any satisfied row for a year STRICTLY AFTER incorporation.
   *                          Reproduces `hasLaterAnnualFiling`.
   *   'attachYear'         — a satisfied row at THIS row's attach year.
   *                          Reproduces `currentFedReturnFiled`.
   *   'any'                — any satisfied instance, any year. No rule uses it today.
   *
   * [MEASURED 2026-07-30 — compared against the CALLER'S CODE, not against the
   * @deprecated descriptions.] Both reproductions were checked field by field: which rows
   * count as satisfied, `year === null` excluded via `!= null` on both sides, STRICT `>`
   * against the incorporation year, and the key filter (caller hardcodes
   * 'cbca_annual_return'; the rule declares it). The caller computes both booleans from
   * `completeness.checklist` and passes THAT SAME ARRAY as `checklist`. One structural
   * difference with no observable effect: the caller tests `incYear !== null` outside its
   * `.some()`, this helper inside the predicate — both yield false when incYear is null.
   * `obligationFiscalYear` returns `number`, never null, so the `attachYear !== null`
   * guard is always true for 'anniversary' and changes nothing.
   */
  const isPresumedDischarged = (rule: ObligationRule, attachYear: number | null): boolean => {
    const s = rule.suppressWhenSatisfied;
    if (!s) return false;
    return checklist.some((item) => {
      if (!item.satisfied) return false;
      if (s.requirementKeys && !s.requirementKeys.includes(item.requirement_key)) return false;
      switch (s.yearScope) {
        case 'attachYear':
          return attachYear !== null && item.year === attachYear;
        case 'afterIncorporation':
          return incYear !== null && item.year != null && item.year > incYear;
        case 'any':
          return true;
      }
    });
  };

  // Fiscal-year-END anchor + its label year — GUARDED. null until the company's
  // FIRST fiscal year has actually closed (completedFiscalYearEnd). The raw
  // calendar helper returned a PRE-INCORPORATION FY-end for a young company
  // (inc 2026-03-01 + Dec-31 year-end → 2025-12-31), which made every rule
  // anchored here emit a row for a fiscal year the company did not exist in,
  // marked OVERDUE.
  //
  // ⚠️ THIS USED TO CONTINUE "each of the three consumers below DECLARES its own answer for
  // the null case — there is deliberately no shared default", which was true of the three
  // hand-written blocks A4 phase 4a replaced. THE ANSWER IS NOW DECLARED BY EACH RULE, in
  // one place: its `dueDate` returns null when the anchor it needs is absent, and the loop
  // skips a null date. Two behaviours, not three — `qc_req_annual_update` and
  // `annual_meeting` both mean "no row", for different legal reasons recorded on each.
  //
  // The label year is still derived as a plain `number` inside the branch that has one,
  // never hoisted as `number | null`, so `String(year)` can never bake the literal "null"
  // into a row id.
  const fyEnd = completedFiscalYearEnd(fyEndMonth, fyEndDay, incorporationDate, today);

  // Shared builder. Every deadline here is base 'open' (unfulfilled) with a
  // calendar-absolute clock. weight follows STATE_WEIGHT semantics: an open
  // (not-yet-done) obligation is 0.0 complete.
  const push = (o: {
    ruleKey: string;
    yearSeg: string;
    year: number | null;
    dueDate: Date;
    exposure: 'external' | 'internal';
    // ★ WIDENED TO THE FULL UNION IN A4 PHASE 4a — AND DELIBERATELY NOT ASSERTED. Read
    // this before adding a fourth assertion to the loop below; the omission is a decision,
    // not an oversight.
    //
    // It used to read `'file_externally' | 'finalize'`, which DESCRIBED the two verbs the
    // hand-written blocks happened to use. It was never an invariant. The loop now serves
    // any rule the registry can hold, so the honest type is the registry's own.
    //
    // Three assertions guard that loop (dueDate, titleKey, cadence/mode) and a fourth was
    // considered here and REJECTED. [MEASURED — `grep -rn actionKind components/` and the
    // VERB_LABEL table in a3-presentation.ts:] a verb with no VERB_LABEL entry renders NO
    // action button and logs `[A3Item] no verb label for actionKind=…`. And `canRowUpload`
    // is gated on source/requirementKey/canUpload rather than on actionKind, so a wrong
    // verb cannot reach the upload path either. An unsupported verb is therefore an ABSENT,
    // LOGGED control — not a lying one.
    //
    // ★ THE RULE THAT DECIDED IT: AN ASSERTION IS FOR A DEFECT THAT WOULD BE INVISIBLE. A
    // control that is absent and logged is neither invisible nor a lie, and earns no throw.
    actionKind: ObligationAction;
    titleFr: string;
    titleEn: string;
    statutoryBasis: string;
    helpKey: string | null;
    copyKey?: CopyKey;
    requirementKey?: string; // upload attach-key — set on deadline rows that accept an uploaded receipt
    canUpload?: boolean;     // routes to A3Item's Upload SET branch
  }) => {
    const daysUntilDue = daysBetween(today, o.dueDate);
    // DISPLAY year: calendar rows carry o.year. Year-less rows fall back to the
    // incorporation year — EXCEPT anniversary-anchored rows (the federal annual
    // return): they are RECURRING and anniversary-anchored, so they carry NO year
    // segment even though `year` now holds the FISCAL year the receipt attaches to
    // (an attach-key, not a display fact — hence `null`, not o.year). RE-200
    // (yearSeg 'initial') keeps incYear — it IS the founding-year declaration.
    // Does NOT touch the obligation's own `year:` field below.
    const rowYear = o.yearSeg === 'anniversary' ? null : (o.year ?? incYear);
    obligations.push({
      id: `deadline:${o.ruleKey}:${o.yearSeg}`,
      source: 'deadline',
      titleFr: composeDisplayName(o.titleFr, null, rowYear),
      titleEn: composeDisplayName(o.titleEn, null, rowYear),
      descriptionFr: null,
      descriptionEn: null,
      status: deriveStatus('open', daysUntilDue, DUE_SOON_WINDOW),
      // Calendar-absolute clock: daysUntilDue<0 = past the legal deadline.
      liveness: computeLiveness({ daysUntilDue, legalWindowDays: null, year: o.year, today }),
      weight: 0, // open/unfulfilled — STATE_WEIGHT semantics (open = 0.0)
      dueDate: toISODateString(o.dueDate),
      triggeredBy: null,  // calendar-absolute, NOT event-relative (feeder 2's REQ case)
      deadlineDays: null, // "
      daysUntilDue,
      year: o.year,
      actionKind: o.actionKind,
      requirementKey: o.requirementKey ?? null,
      docKey: null,
      exposure: o.exposure,
      // A file_externally rule IS a government filing by definition; finalize
      // rules (annual_meeting) are held in the book, never filed → false. Derived
      // from actionKind, so every present + future external rule inherits it.
      hasFiling: o.actionKind === 'file_externally',
      statutoryBasis: o.statutoryBasis,
      helpKey: o.helpKey,
      copyKey: o.copyKey, // per-rule modal-copy namespace (registry) — only fed set today
      canUpload: o.canUpload, // deadline rows accepting an uploaded receipt (the fed return)
      fulfilled: false,
    });
  };

  // ── THE GENERIC LOOP (A4 phase 4a) ──────────────────────────────────────────
  // Replaces three hand-written blocks — the RE-200, the QC REQ annual update and the
  // federal annual return — with ONE pass over OBLIGATION_REGISTRY reading declared
  // fields. Each rule still emits AT MOST ONE ROW, exactly as the blocks did: iterating
  // per fiscal year is phase 4b and is deliberately NOT here.
  //
  // ★ THE REASONED CONTENT THOSE BLOCKS CARRIED NOW LIVES ON THE REGISTRY ENTRIES, beside
  // the field each piece justifies — the LSAQ quasi-identity, the RE-200 presumed-done
  // ruling, the NEQ-vs-incorporation reasoning, the CBCA residual case Harvey could not
  // map, and the null-fiscal-year answers. It was migrated BEFORE these blocks were
  // deleted, not after.
  //
  // `annual_meeting` is NOT here: it has no registry entry yet (phase 4c), so its
  // hand-written block follows this loop unchanged.
  for (const rule of OBLIGATION_REGISTRY) {
    // PARTICIPATION — SEMANTIC, not structural. An act-instantiated rule is feeder 2's
    // territory (see the file header's SCOPE note). Testing `cadence !== 'event'` rather
    // than "does it have a dueDate" is deliberate: the latter is a structural proxy that
    // agrees today and silently SKIPS a calendar rule whose date was forgotten. A missing
    // board row is the hardest defect class here, so the malformed case throws at module
    // load instead.
    if (rule.cadence === 'event') continue;

    // APPLICABILITY — the frameworks ALLOW-LIST. Omitted = every framework.
    // EMPTY ARRAY = none: the rule is inert and this loop skips it for every company
    // (an empty array is truthy, and `[].includes(x)` is always false). Live example:
    // `qc_initial_declaration`, whose entry explains why.
    if (rule.frameworks && !rule.frameworks.includes(framework)) continue;

    // THE ROW'S FISCAL YEAR, derived from cadence. 'once' carries none (the RE-200 is the
    // founding declaration, not an annual one). 'anniversary' carries the ATTACH-KEY — the
    // year an uploaded receipt lands on — which is a different axis from its clock.
    const year =
      rule.cadence === 'per-fiscal-year'
        ? (fyEnd ? fyEnd.getFullYear() : null)
        : rule.cadence === 'anniversary'
          ? obligationFiscalYear(fyEndMonth, fyEndDay, incorporationDate, today)
          : null;

    // PRESUMED DISCHARGED — the declarative form of the caller-computed booleans this
    // feeder used to take. Evaluated against the checklist the caller now passes whole.
    if (isPresumedDischarged(rule, year)) continue;

    // THE DATE. A null return means "the anchor this rule needs is absent" — no
    // immatriculation date, or no fiscal year has closed — and the RULE declares that
    // itself rather than the feeder guessing on its behalf.
    const due = rule.dueDate!({
      fyEnd: fyEnd ?? undefined,
      immatriculationDate,
      incorporationDate,
      today,
    });

    // ★ THE CADENCE ASSERTION (A4 phase 4a). Only testable on this branch, and free here
    // because it reads the call already made above.
    //
    // The loop does NOT branch on cadence to decide skip-vs-fire — it just skips a null
    // date. That works because every 'per-fiscal-year' rule returns null without a closed
    // fiscal year and no other cadence does. [MEASURED 2026-07-30, all four entries.]
    // ⚠️ BUT THAT CORRESPONDENCE RESTS ON ONE PER-FISCAL-YEAR RULE — it may be
    // construction or it may be coincidence, and a probe cannot tell the difference. So it
    // is asserted rather than assumed, and the assertion protects the rule that does not
    // exist yet.
    if (!fyEnd) {
      const wantsSkip = rule.cadence === 'per-fiscal-year';
      if (wantsSkip !== (due === null)) {
        throw new Error(
          `OBLIGATION_REGISTRY: '${rule.ruleKey}' (cadence '${rule.cadence}') returns ` +
            `${due === null ? 'null' : 'a date'} when no fiscal year has closed, which does ` +
            `not match its cadence. If that is INTENTIONAL, the loop can no longer derive ` +
            `its mode from cadence and the rule needs a DECLARED mode field — a gap A4 ` +
            `phase 4 deferred on the evidence that cadence encoded it. Decide that before ` +
            `relaxing this check.`,
        );
      }
    }

    if (!due) continue;

    // UPLOAD AFFORDANCE — one causal chain, not two. A board-suppressed requirement has no
    // completeness half left on the board, so this deadline row is the ONLY thing that can
    // carry the upload. `requirementKey` is the ATTACH-KEY for that upload, so it is gated
    // on the same condition rather than set for every rule.
    const attachKey = rule.requirementKeys[0];
    const canUpload = attachKey !== undefined && isBoardSuppressedRequirementKey(attachKey);

    const title = TITLES[rule.titleKey!];
    push({
      ruleKey: rule.ruleKey,
      // yearSeg — DERIVED FROM CADENCE. ⚠️ 'once' maps to 'initial', NOT 'once': row ids
      // are `deadline:{ruleKey}:{yearSeg}`, so emitting the cadence name here would change
      // the RE-200's id and move the board for a reason unrelated to this phase.
      yearSeg:
        rule.cadence === 'once'
          ? 'initial'
          : rule.cadence === 'anniversary'
            ? 'anniversary'
            : String(year),
      year,
      dueDate: due,
      exposure: rule.exposure,
      actionKind: rule.actionKind,
      titleFr: title.fr,
      titleEn: title.en,
      statutoryBasis: rule.statutoryBasis,
      helpKey: rule.helpKey,
      copyKey: rule.copyKey,
      requirementKey: canUpload ? attachKey : undefined,
      canUpload: canUpload || undefined,
    });
  }

  // ── INTERNAL GOVERNANCE (internal · finalize — HOLD/RECORD, never file) ──────

  // Annual meeting / annual resolutions. INTERNAL: the user records these in the
  // minute book; they are never filed with a government.
  //
  // NULL-FY ANSWER (b) — no closed fiscal year → NO ROW (Dom 2026-07-25, on
  // Harvey's principled threshold): an annual meeting presents the financial
  // statements for a COMPLETED fiscal year, so before one closes there is nothing
  // to present and the meeting is not yet preparable. The 18-month first-meeting
  // deadline is not yet due either — and a not-yet-due obligation must NEVER
  // render as a lateness, which is exactly what the pre-incorporation FY-end
  // produced (a four-month-old company shown "Assemblée annuelle 2025", OVERDUE).
  if (fyEnd) {
    const fyYear = fyEnd.getFullYear();
    // FIRST meeting vs SUBSEQUENT — two DIFFERENT statutory limbs (Harvey
    // 2026-07-24, GREEN, verified word-for-word against both statutes).
    // art. 133(1) LCSA: (a) the first meeting ≤ 18 months after the corporation
    // comes into existence; (b) "subsequently / par la suite" ≤ 15 months after the
    // last AND ≤ 6 months after the preceding financial year end. "Subsequently"
    // opens (b) and governs everything in it, INCLUDING the 6-month cap — so NO
    // 6-month cap applies to a first meeting. art. 163 LSAQ carries the same
    // 18-month limb (the regimes CONVERGE for the first meeting).
    //
    // PREDICATE — both conditions required, both load-bearing:
    //   (1) noPriorAnnualMeetingRecorded — caller-derived (this feeder never looks
    //       anything up), AND
    //   (2) inc + 18mo still in the FUTURE relative to today.
    // (2) is the WICK GUARD. Wick (inc 2018) has inc+18mo ≈ 2020-02, long past, so
    // it can NEVER take this branch no matter what is recorded. Without (2), any
    // established company mid-onboarding — no resolutions uploaded yet — would be
    // handed a years-old due date and land in `remediate`.
    //
    // KNOWN EDGE (recorded, not solved): a company that held its first meeting on
    // paper but has not uploaded the resolution reads as "never met" and gets the
    // 18-month date. That is honest — we date from what we know — but it IS a
    // PROXY, not a derivation. Harvey recommends recording an actual last-meeting
    // date; BANKED. It would also feed the 15-month limb (uncomputable today, no
    // meeting-date column) and the federal annual return form, which asks for
    // exactly that date.
    const firstMeetingDue = incorporationDate
      ? addMonthsClamped(parseLocalDate(incorporationDate), 18)
      : null;
    const isFirstMeeting =
      noPriorAnnualMeetingRecorded && firstMeetingDue !== null && firstMeetingDue > today;
    push({
      // ── WHY THIS ruleKey IS STILL A BARE LITERAL, AND WHEN IT STOPS BEING ONE ──────
      // IT BELONGS IN THE REGISTRY. Dom's decision D-B admits INTERNAL obligations to
      // OBLIGATION_REGISTRY — the membership test is "does it have a cadence", NOT "is it
      // filed with a government" — and this rule has one (per-fiscal-year). Its absence
      // from the table is SCHEDULING, not a judgement that it does not belong there.
      //
      // IT LANDS IN PHASE 4, NOT PHASE 2, FOR FOUR REASONS — ONE OF WHICH HAS SINCE
      // BEEN REMOVED. Numbering kept so (2)(3)(4) still mean what they meant.
      //
      // (1) ✔ RESOLVED, and not by phase 4. This used to be the disqualifying reason:
      //     the completeness feeder derived exposure from a predicate meaning "has a
      //     registry entry", used as a proxy for "is external", so an INTERNAL rule
      //     joining the table would have made that function silently wrong the moment
      //     it was added. The predicate is deleted — exposure and hasFiling now read
      //     the rule's own `exposure` and `actionKind` fields. No longer a blocker.
      //
      // (2) ITS BASIS IS THREE LIMBS, HARVEY-VERIFIED WORD FOR WORD: art. 133(1)(a) vs
      //     (b) LCSA, art. 163 LSAQ, and art. 225 LSAQ — the financial-statement
      //     constraint Québec's 6-month date actually derives from (see the
      //     `statutoryBasis` ternary below). Moving that into data is a place to
      //     introduce a legal error silently.
      //
      // (3) The filing→obligation RENAME is its own unit of work and carries its own
      //     behaviour change. This rule rides that unit, not this one.
      //
      // (4) ★ AN UNVERIFIED CONCERN, RECORDED AS A CONCERN — NOT AS A FINDING.
      //     `noPriorAnnualMeetingRecorded` and the Wick guard (`firstMeetingDue > today`)
      //     may be ONE first-meeting predicate rather than two independent mechanisms;
      //     per ZK_Core the first-meeting predicate requires BOTH conditions. If that is
      //     so, mapping the first half ALONE onto `suppressWhenSatisfied` would suppress
      //     the annual meeting FOREVER once ANY annual shareholder resolution is
      //     satisfied — and on a per-fiscal-year cadence that means every later year too.
      //     PHASE 4 MUST VERIFY THIS FROM CODE BEFORE MOVING EITHER HALF INTO DATA.
      //
      // TITLE: the FR/EN literals below are already the right strings. They become
      // `obligationTitle.annualMeeting` when the entry is added, and that value joins the
      // TitleKey union in obligation-registry.ts at the same time.
      //
      // ★ SEPARATE PHASE-2 SCOPE RECORD, NOT ABOUT THIS RULE — the upload-attach pair was
      // considered as two new registry fields and STRUCK, because both values are
      // DERIVABLE. `requirementKey` comes from the rule's own `requirementKeys[0]`;
      // `canUpload` comes from the EXISTING board-suppression derivation — NOT from
      // re-testing `cadence === 'anniversary'` a second time. Deriving one fact twice from
      // one source is precisely how `overlapMerge` and `boardSuppressCompletenessRows`
      // came to exist. The causal chain is single and must stay single: anniversary → the
      // completeness half is board-suppressed → the deadline row is therefore the ONLY
      // thing left that can carry the upload affordance.
      ruleKey: 'annual_meeting',
      yearSeg: String(fyYear),
      year: fyYear,
      dueDate: isFirstMeeting && firstMeetingDue ? firstMeetingDue : addMonthsClamped(fyEnd, 6),
      exposure: 'internal',
      actionKind: 'finalize',
      titleFr: 'Assemblée annuelle / résolutions annuelles',
      titleEn: 'Annual meeting / annual resolutions',
      // CITATION follows the LIMB that produced the date, not just the framework
      // (Harvey's asymmetry finding, GREEN). art. 163 LSAQ has only TWO limbs —
      // 18 months, then 15 months after the previous meeting. There is NO 6-month
      // limb in the Québec meeting article at all: Québec's 6-month pressure is
      // art. 225 LSAQ, a constraint on the FINANCIAL STATEMENTS presented (they
      // must cover a fiscal year ended within the 6 months preceding the meeting),
      // NOT a convocation deadline. So an LSAQ row showing an fyEnd+6mo date must
      // surface art. 225 — citing art. 163 alone would show the user a statute that
      // does not contain the rule we are displaying. CBCA is untouched: art. 133
      // LCSA genuinely contains the 6-month limb in paragraph (b).
      statutoryBasis:
        framework === 'CBCA'
          ? 'art. 133 LCSA'
          : isFirstMeeting
            ? 'art. 163 LSAQ'
            : 'art. 163 LSAQ · délai pratique (art. 225 LSAQ)',
      helpKey: null,
    });
  }

  return obligations;
}
