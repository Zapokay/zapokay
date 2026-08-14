/**
 * A4 consequence axis — what it COSTS if nothing is done (pure, no I/O).
 *
 * ★ THIS IS NOT `computeLiveness`, AND THE TWO WILL BE CONFUSED. They share a shape
 * — a small pure function over a tiny input returning a graded enum — and they
 * measure DIFFERENT QUANTITIES:
 *
 *   computeLiveness     "is this still the RIGHT ACTION NOW?"
 *                       → live / regularize / remediate
 *   computeConsequence  "what does it COST if nothing is done?"
 *                       → none / penalty / default / strikeoff
 *
 * Orthogonal, and neither derives from the other: an obligation can be `remediate`
 * and carry no statutory consequence at all, and it can be `live` while a penalty
 * already runs.
 *
 * ★★ AND THEY DO NOT HAVE THE SAME AUTHORITY. `REMEDIATE_THRESHOLD_YEARS = 2` in
 * liveness.ts is a ZapOkay CONVENTION — 🟡, lawyer-pending, revisable by product
 * decision, and its own docblock says so. EVERY constant in this file is 🟢 LAW,
 * Harvey-verified against the texts, and each names its article AT ITS OWN LINE for
 * exactly that reason: the module next door is tuned like a setting, and someone
 * will reach for these the same way, and be wrong.
 *
 * ⚠️ THE TWO REGIMES ARE OPPOSITE ON THE SAME FACTS. That is why `framework` is a
 * DECLARED PARAMETER and never inferred. Québec escalates on CONSECUTIVENESS — two
 * consecutive missed years open radiation (art. 59 al. 1 LPLE). The federal regime
 * does NOT escalate at all: one unfiled return puts the corporation in default, and
 * the seventh opens nothing further. A single ladder read without the regime would
 * be wrong for one of them in every state.
 *
 * ⚠️ NO CLOCK PARAMETER, AND THAT IS DELIBERATE — read this before "fixing" the
 * asymmetry with liveness.ts. That neighbour takes `today: Date` because its branch
 * B derives lateness from the calendar (`today.getFullYear() - year`). This ladder
 * derives NOTHING from the calendar: it reads a set of outstanding years the CALLER
 * has already determined, holding the clock and the deadlines itself. A `today` here
 * would be read by nothing — and the repo already carries `void today;` in rank.ts
 * and an unread `legalWindowDays` in liveness.ts, both declared for symmetry with no
 * consumer, both still there months later. Testability is not a reason to add one:
 * `outstandingYears` is a parameter, so a test builds any state at any instant,
 * including inside the window where the federal row goes negative.
 *
 * ⚠️ INERT. Nothing imports this module — not rank.ts, not a feeder, not a renderer.
 * Landing it alone is deliberate: the ladder is a legal claim and gets read on its
 * own before it can move a single board row.
 */

/**
 * The regime whose law applies. DECLARED, never derived — in particular never from a
 * `cbca_` / `lsaq_` requirement-key prefix. That prefix is disjoint across today's
 * catalog (measured 2026-08-13, all 24 rows) but that is a property of the DATA, not
 * a guarantee of the code, and two board-row families carry no requirement key at all.
 *
 * Declared inline rather than imported: the obligation registry's `frameworks`
 * docblock counts sixteen inline copies of this union and banks the consolidation as
 * its own item. This is the seventeenth, and it does not pretend to be canonical.
 */
export type ConsequenceFramework = 'LSA' | 'CBCA';

/**
 * What accrues while the obligation stays undone. Ordered, least to most severe.
 *
 * ★ EACH NAMES A MECHANISM, NOT A GRADE. `low / medium / high` would have been an
 * opinion; these are checkable against a text, and a reader can disagree with one by
 * reading the article beside it.
 */
export type ConsequenceLevel =
  /** Nothing accrues. The obligation is owed; inaction costs nothing yet. */
  | 'none'
  /** A monetary penalty is running — art. 87 LPLE. */
  | 'penalty'
  /** The corporation stands in default, without term — art. 263 · art. 212 LCSA. */
  | 'default'
  /** Striking-off / dissolution is open — art. 59 al. 1 LPLE. */
  | 'strikeoff';

/**
 * The answer, or the refusal.
 *
 * ★ UNKNOWN IS NOT `none`. A row whose consequence we have not established must
 * never be presented as a row that costs nothing. That is why the refusal is a
 * separate ARM and not a fifth `ConsequenceLevel`: tsc forces every caller to narrow
 * on `known` before it can read a level, so the distinction is carried by the TYPE
 * and not by a convention nobody re-reads.
 */
export type ConsequenceAssessment =
  | { readonly known: true; readonly level: ConsequenceLevel }
  // One reason today, inline: a named union would be symmetry, not a consumer. Give
  // it a type the day a caller treats two refusals differently.
  | { readonly known: false; readonly reason: 'no_established_basis' };

/** What the ladder needs, and nothing else. */
export interface ConsequenceInput {
  /**
   * Registry ruleKey — SELECTS the ladder. Only obligations whose consequence law has
   * been established are covered; every other key returns `known: false`.
   */
  ruleKey: string;
  /**
   * The company's regime. Today it acts as an EXERCISED GUARD rather than a selector:
   * `ruleKey` picks the ladder, and this rejects the one impossible pair,
   * (`fed_annual_return`, 'LSA'), which returns `known: false` rather than a level.
   * Stated plainly rather than dressed up: it does one job, and it does it.
   */
  framework: ConsequenceFramework;
  /**
   * The fiscal years for which this obligation is OUTSTANDING — determined by the
   * CALLER, which holds the clock and the deadlines. This module never decides what
   * "outstanding" means; it reads the set it is given.
   *
   * Order and duplicates are irrelevant: the consecutive-run helper normalises before
   * reading, so no caller owes a sort.
   */
  outstandingYears: readonly number[];
}

/**
 * art. 59 al. 1 LPLE (RLRQ, c. P-44.1) — the registrar may strike off a registrant
 * that has failed to file its annual updating declaration for TWO CONSECUTIVE years.
 *
 * ⚠️ CONSECUTIVE, NEVER CUMULATIVE. A company that missed 2019 and 2022 and filed
 * everything else is NOT exposed under this article; one that missed 2023 and 2024
 * is. A cumulative count would send the first to a lawyer for nothing — and it is
 * the easier of the two to write by accident.
 *
 * ⚠️ AND IT IS A COUNT OF DETERMINATE YEARS, NOT A DURATION. liveness.ts writes
 * `-365 * REMEDIATE_THRESHOLD_YEARS` and calls itself approximate, which it is
 * entitled to do because its threshold is a ZapOkay convention. This one is a
 * statutory count: days never enter it, and must not be substituted for it.
 *
 * 🟢 Harvey, verified against the text.
 */
const QC_STRIKEOFF_CONSECUTIVE_YEARS = 2;

/**
 * art. 87 LPLE — the penalty for a late annual updating declaration runs from the
 * FIRST day of lateness. There is no grace period to model: one outstanding year is
 * already one penalty running. 🟢 Harvey.
 */
const QC_PENALTY_FROM_OUTSTANDING_YEARS = 1;

/**
 * art. 263 LCSA (the annual return) with art. 212(1)a)(iii) LCSA (the Director may
 * dissolve a corporation that has not sent a document required by the Act).
 *
 * ⚠️ THE FEDERAL LADDER DOES NOT ESCALATE, and this constant is where that is said.
 * One unfiled return puts the corporation in default and opens the art. 212 exposure.
 * A second opens nothing further. Neither does a seventh. The exposure also DOES NOT
 * PRESCRIBE: it neither grows nor lapses with time.
 *
 * ★ SOMEONE WILL WANT A HIGHER FEDERAL RUNG, because "seven years late" reads worse
 * than "one year late" and every other ladder in this product escalates. There is no
 * article to hang one on. Reading "more years = worse" into the federal regime is the
 * error this constant exists to prevent.
 *
 * 🟢 Harvey, verified against the texts.
 */
const FED_DEFAULT_FROM_OUTSTANDING_YEARS = 1;

/**
 * True when `years` contains a run of `run` consecutive integers. Normalises first,
 * so the caller owes neither an order nor a de-duplication.
 */
function hasConsecutiveRun(years: readonly number[], run: number): boolean {
  // The loop cannot answer run <= 1 (a single element is already a run of one), so
  // the stated contract is honoured here rather than left to the caller.
  if (run <= 1) return years.length >= run;
  const sorted = Array.from(new Set(years)).sort((a, b) => a - b);
  let streak = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    streak = sorted[i] === sorted[i - 1] + 1 ? streak + 1 : 1;
    if (streak >= run) return true;
  }
  return false;
}

/**
 * Map an obligation's outstanding years onto the consequence ladder for its regime.
 * Pure.
 *
 * Returns `known: false` for any obligation whose consequence law has not been
 * established — never `none`, which would assert that inaction is free.
 */
export function computeConsequence(input: ConsequenceInput): ConsequenceAssessment {
  const { ruleKey, framework, outstandingYears } = input;

  if (ruleKey === 'qc_req_annual_update') {
    // BOTH frameworks reach this ladder, and the REGISTRY SAYS SO rather than leaving
    // it to the article: `qc_req_annual_update` declares two requirementKeys —
    // `lsaq_req_annual_update` and `cbca_req_annual_update_qc` — and OMITS
    // `frameworks`, which is that table's "every framework". A CBCA company reaches
    // this ladder by its OWN key. The legal ground is art. 45 LPLE, binding every
    // company operating in Québec whichever regime it was incorporated under; the
    // declaration is where a reader can CHECK it. `framework` is therefore not
    // consulted here, and that is correct rather than an omission.
    if (hasConsecutiveRun(outstandingYears, QC_STRIKEOFF_CONSECUTIVE_YEARS)) {
      // ⚠️ EXPOSURE, NEVER IMMINENCE. art. 73 LPLE routes the striking-off through a
      // formal mise en demeure, and THAT DATE EXISTS NOWHERE IN THIS SYSTEM — not on
      // `companies`, not in the catalog, not in any feeder. This branch says the
      // exposure is OPEN. It can never say how far the procedure has advanced, or that
      // it is near. Do not add a field for it: an invented date is worse than none.
      return { known: true, level: 'strikeoff' };
    }
    if (outstandingYears.length >= QC_PENALTY_FROM_OUTSTANDING_YEARS) {
      return { known: true, level: 'penalty' };
    }
    return { known: true, level: 'none' };
  }

  if (ruleKey === 'fed_annual_return') {
    // The guard, exercised: the rule declares `frameworks: ['CBCA']` in the obligation
    // registry, so an LSA company cannot hold this obligation. The impossible pair
    // returns a refusal rather than a level — we decline, we do not guess a zero.
    if (framework !== 'CBCA') return { known: false, reason: 'no_established_basis' };
    if (outstandingYears.length >= FED_DEFAULT_FROM_OUTSTANDING_YEARS) {
      // No rung above this one, at any number of years. See the constant.
      return { known: true, level: 'default' };
    }
    return { known: true, level: 'none' };
  }

  // Every other obligation: we have not established what inaction costs. Saying so is
  // the answer; `none` would be a claim we cannot support.
  return { known: false, reason: 'no_established_basis' };
}
