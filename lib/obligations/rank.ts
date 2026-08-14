/**
 * A3 Ranking brain — pure base ranker (no I/O, no side effects). ONE consumer: the
 * dashboard server component's A3 board assembly, via `rankObligations`.
 *
 * Turns the merged obligation stream into a fully ordered to-do list: the
 * dashboard board slices the top 5, and the full list backs the "show more (N)"
 * count. Design: a3-ranking-brain-spec-2026-07-03.md §3–§5.
 *
 * ★ THIS HEADER USED TO SAY "zero consumers" IN THE LINE ABOVE, WHILE THE PARAGRAPH
 * IMMEDIATELY BELOW IT DESCRIBED THAT CONSUMER — a document arguing with itself, which is
 * worse than a merely stale claim: a reader resolves the contradiction by trusting whichever
 * half suits them. The claim was true when the ranker shipped ahead of its UI; `dc5eb27`
 * (2026-07-10) wired the dashboard and voided it, and it then survived 48 commits because
 * nothing type-checks a header. Corrected in A4 phase 3, together with the identical stale
 * claim in both feeders and the aggregator. Only the COUNT was wrong — `no I/O, no side
 * effects` is still TRUE.
 *
 * score = stakes × urgency. Stakes = what's at risk (external filing >
 * foundational > internal-annual > low). Urgency = a steep convex ramp on
 * daysUntilDue (D2), with a virtual floor so clock-less foundational work still
 * competes (D3). Ties break by a locked ladder (D5). ABOVE ALL OF IT sits one lane:
 * a row whose consequence is `strikeoff` or `default` precedes one that is not.
 *
 * ADDITIVE: reads the shipped Obligation contract; does NOT modify it, the
 * aggregator, or any feeder. Constants are PROVISIONAL (the tuning point) — the
 * ORDERING and SHAPE are locked, the exact numbers are not.
 *
 * Imports ONLY from ./obligation (the contract). ./aggregate is unused here —
 * the ranker consumes an already-merged, deduped stream.
 */

import type { Obligation, ObligationAction, ObligationLiveness } from './obligation';
import { computeConsequence, type ConsequenceFramework } from './consequence';
import {
  ruleForRequirementKey,
  ruleForRuleKey,
  ruleForDocKey,
  type ObligationRule,
  type ReasonKey,
} from './obligation-registry';

/** A prerequisite obligation that is NOT yet satisfied — surfaced in the modal. */
export interface UnmetPrerequisite {
  requirementKey: string;
  year: number | null;
  labelFr: string;
  labelEn: string;
  reasonKey: ReasonKey;
}

export interface RankedObligation extends Obligation {
  rank: number;              // 1-based position in the full sorted list
  score: number;             // stakes × urgency (tuning/debug, not user display)
  hasDependencies: boolean;  // = unmetPrerequisites.length > 0 (registry-driven)
  unmetPrerequisites?: UnmetPrerequisite[]; // present only when a prerequisite is unmet
}

/**
 * Foundational = a completeness-sourced item with no fiscal year (the founding
 * docs). Confirmed Dom + Max: bare `year === null` is AMBIGUOUS — the deadline
 * feeder's initial-declaration/fed-return and every req_filing item also emit
 * year null — so the source must be ANDed in.
 */
function isFoundational(o: Obligation): boolean {
  return o.source === 'completeness' && o.year === null;
}

// ── STAKES (what's at risk) — ordering LOCKED, values PROVISIONAL ─────────────
const STAKES_EXTERNAL = 1.0;        // government-facing filing — miss = penalty / standing risk
const STAKES_FOUNDATIONAL = 0.9;    // founding docs — the book's backbone
const STAKES_INTERNAL_ANNUAL = 0.6; // recurring internal governance
const STAKES_LOW = 0.3;             // defensive fallback (see note below)

function stakesFor(o: Obligation): number {
  if (o.exposure === 'external') return STAKES_EXTERNAL;
  if (isFoundational(o)) return STAKES_FOUNDATIONAL;
  // Everything remaining is internal (ExposureClass is 'external' | 'internal').
  // INTERNAL_ANNUAL is the live internal tier; STAKES_LOW is a defensive floor,
  // currently unreachable — reserved for a future exposure class or a
  // non-recurring internal split. Flagged for Dom + Max.
  return o.exposure === 'internal' ? STAKES_INTERNAL_ANNUAL : STAKES_LOW;
}

// ── URGENCY (how soon) — steep ramp, D2/D3. Shape LOCKED, values PROVISIONAL ──
const URGENCY_MAX = 1.0;            // overdue
const URGENCY_FLOOR_LOW = 0.15;     // far-out clock / no-clock non-foundational
const VIRTUAL_URGENCY_FLOOR = 0.55; // D3 — clock-less foundational stands mid-high
/**
 * The escalation window (days). THIS is the real value the feeders' provisional
 * DUE_SOON_WINDOW=30 was a placeholder for — the ranking brain owns it now.
 */
const ESCALATION_WINDOW = 45;

function urgencyFor(o: Obligation): number {
  const d = o.daysUntilDue;
  if (d === null) {
    // No clock. Foundational stands mid-high so it competes with (and usually
    // beats) low-clock work but yields to imminent deadlines (D3); every other
    // clock-less item sits at the floor.
    return isFoundational(o) ? VIRTUAL_URGENCY_FLOOR : URGENCY_FLOOR_LOW;
  }
  if (d < 0) return URGENCY_MAX; // overdue
  if (d <= ESCALATION_WINDOW) {
    // Convex climb from the floor (window edge) up to MAX (due now).
    // Starts AT the floor for continuity; monotonic per D2 — no dip.
    const t = d / ESCALATION_WINDOW;
    return URGENCY_FLOOR_LOW + (URGENCY_MAX - URGENCY_FLOOR_LOW) * (1 - t * t);
  }
  // Beyond the escalation window: the flat floor. Seamless — the convex evaluates
  // to the floor at the window edge — so urgency is monotonic as daysUntilDue
  // decreases (never dips). The former bridge zone is gone: the fixed ramp already
  // lands on the floor, leaving nothing to bridge down to.
  return URGENCY_FLOOR_LOW;
}

// ── LIVENESS BUCKET (Harvey 2026-07-05) — absolute, WITHIN a promotion group ──────
// Liveness is an ABSOLUTE bucket, not a weight: every 'live' obligation ranks above
// every 'regularize', which ranks above every 'remediate'. It's the orthogonal "is
// this still the right action" axis (Harvey: due ≠ still-the-right-action). stakes ×
// urgency (`score`) orders WITHIN a bucket only; it never crosses bucket boundaries,
// so a high-base ancient remediate item can't edge out a current live one.
// (Replaces the Part-1 liveness multiplier, now redundant under buckets.)
//
// ⚠️ THIS USED TO READ "PRIMARY sort key" AND "no exceptions". BOTH BECAME FALSE WITH
// THE CONSEQUENCE LANE, and are corrected here rather than left standing. Exactly ONE
// thing now sits above the bucket: a row whose consequence is `strikeoff` or
// `default` (see `promotedRowIds`). Dom 2026-07-05, in full — "avoid falling behind
// IF AND ONLY IF the high-consequence items are gone". The bucket was always the
// first half of that rule; the condition could not be written until consequence
// existed as an axis, which it did not on 5 July.
const LIVENESS_RANK: Record<ObligationLiveness, number> = {
  live: 0,
  regularize: 1,
  remediate: 2,
};

// ── TIE-BREAK ladder (within a liveness bucket, on a score tie) ───────────────
const EPSILON = 0.001; // scores within EPSILON are "tied" → fall through to the ladder

/** Quick-win-first effort order. review = FUTURE action (no emitter); ranked last. */
const ACTION_RANK: Record<ObligationAction, number> = {
  finalize: 0,
  file_externally: 1,
  upload: 2,
  generate: 3,
  none: 4,
  review: 5,
};

/** Find the obligation-registry rule an obligation IS, via requirementKey → ruleKey (deadline id) → docKey. */
function ruleForObligation(o: Obligation): ObligationRule | undefined {
  if (o.requirementKey) {
    const r = ruleForRequirementKey(o.requirementKey);
    if (r) return r;
  }
  if (o.source === 'deadline') {
    const ruleKey = o.id.split(':')[1]; // id = `deadline:{ruleKey}:{yearSeg}`
    const r = ruleForRuleKey(ruleKey);
    if (r) return r;
  }
  if (o.docKey) return ruleForDocKey(o.docKey);
  return undefined;
}

/**
 * Resolve a filing row's UNMET prerequisites. Reads the two indices built from the
 * RAW obligation list (satisfied rows survive there — see the ★ trap in rankObligations).
 * Gated on `o.dueDate != null` so only rows that actually render as filings light the
 * dep icon (mirrors the board's isFilingRow), never a dateless completeness half.
 * ABSENT prerequisite → treated as UNMET (conservative: flag the dependency).
 */
/** Most recent obligation by year (highest year wins; null-year rows sort last). */
function mostRecentByYear(rows: readonly Obligation[]): Obligation | undefined {
  let best: Obligation | undefined;
  for (const r of rows) {
    if (!best || (r.year ?? -Infinity) > (best.year ?? -Infinity)) best = r;
  }
  return best;
}

function resolveUnmetPrerequisites(
  o: Obligation,
  byReqYear: ReadonlyMap<string, Obligation>,
  byReqKey: ReadonlyMap<string, Obligation[]>,
  satisfiedByReqKey: ReadonlySet<string>,
): UnmetPrerequisite[] {
  if (o.dueDate == null) return [];
  const rule = ruleForObligation(o);
  if (!rule || rule.prerequisites.length === 0) return [];

  const out: UnmetPrerequisite[] = [];
  for (const pre of rule.prerequisites) {
    // sameYear is honoured when the filing carries a concrete year; a year-less
    // filing (e.g. the anniversary-based federal return) has no year to match, so
    // it falls back to "any satisfied instance" — that filing asks for the LAST
    // (most recent) occurrence, which any-satisfied models correctly.
    const found = o.year != null ? byReqYear.get(`${pre.requirementKey}|${o.year}`) : undefined;
    const met =
      pre.sameYear && o.year != null
        ? found?.status === 'satisfied'
        : satisfiedByReqKey.has(pre.requirementKey);
    if (!met) {
      // Label source: a concrete-year filing keeps the same-year row (identical to
      // before). A YEAR-LESS filing (o.year == null — e.g. the anniversary federal
      // return) has no same-year row, so use the MOST RECENT matching prerequisite
      // row's title instead of the raw snake_case key. Fall back to the key ONLY when
      // the key has no rows at all (unmet-by-absence). Does NOT touch met/unmet.
      const labelSource =
        o.year == null ? mostRecentByYear(byReqKey.get(pre.requirementKey) ?? []) : found;
      out.push({
        requirementKey: pre.requirementKey,
        year: o.year, // the FILING's year (context) — NOT the prerequisite row's year
        labelFr: labelSource?.titleFr ?? pre.requirementKey,
        labelEn: labelSource?.titleEn ?? pre.requirementKey,
        reasonKey: pre.reasonKey,
      });
    }
  }
  return out;
}

/**
 * A QC annual-update year counts as MISSED once the clock is this many CALENDAR
 * years past it.
 *
 * WHY TWO: the art. 45 LPLE deadline falls at fiscal-year end + 6 months, so at the
 * latest in June of Y+1 (worst case, a 31-December year end). `today.getFullYear()
 * - Y >= 2` first observes on 1 January of Y+2 — AFTER every possible deadline,
 * whatever the company's year end, and WITHOUT having to know it.
 *
 * ⚠️ IT UNDER-REPORTS BY UP TO ONE YEAR, DELIBERATELY, and this line is the only
 * place that says so. A year missed in Y is not counted until Y+2. The bias is
 * chosen: a false `strikeoff` sends someone to a lawyer for nothing, while a late
 * one merely delays a promotion.
 *
 * ⚠️ AND IT IS NOT `liveness`. Branch B of computeLiveness flips on 1 January, which
 * diverges from the art. 45 deadline by up to 332 days for a 31-December year end
 * (measured, ZK_Core). A December-year-end company would be counted in default
 * nearly a year early, and could reach `strikeoff` on two false positives.
 */
const QC_MISSED_YEARS_BEHIND = 2;

/**
 * Is THIS row in default for its ladder?
 *
 * ★ THE TWO LADDERS READ DIFFERENT SIGNALS, AND THAT IS A DIFFERENCE IN THE SHAPE
 * OF THE DATA, NOT A SPECIAL CASE.
 *
 * QC rows carry NO clock — measured 2026-08-13, eight of Wick's eight
 * `cbca_req_annual_update_qc` rows have `daysUntilDue: null`, historical ones
 * included. A year count is the only signal that exists there.
 *
 * The federal obligation is ONE row carrying its own clock, and a year count could
 * never work for it: `obligationFiscalYear` never returns a past year, so that row's
 * `today.getFullYear() - year` is always 0 or 1 and would never reach 2. Measured
 * the same day at four clocks.
 */
function isInDefault(ruleKey: string, o: Obligation, today: Date): boolean {
  if (ruleKey === 'fed_annual_return') {
    return o.daysUntilDue !== null && o.daysUntilDue < 0;
  }
  if (ruleKey === 'qc_req_annual_update') {
    return o.year !== null && today.getFullYear() - o.year >= QC_MISSED_YEARS_BEHIND;
  }
  // Any other rule: not in default here. Its consequence law is not established, and
  // `computeConsequence` would decline anyway.
  return false;
}

/**
 * The row ids this ranker PROMOTES above the liveness bucket — AT MOST ONE PER
 * OBLIGATION, the most recent one in default.
 *
 * ★ ONE ROW, NOT ALL OF THEM. Consequence is a property of the COMPANY'S STATE on an
 * obligation, not of each year-row: measured 2026-08-13, Wick has five REQ years in
 * default and Acme six, and promoting them all would fill a five-row board with rows
 * that carry no separately useful action (art. 52 — one year is curable at a time).
 * The most recent row carries the state; the others are already below it.
 *
 * ★ ONLY `strikeoff` AND `default` PROMOTE — the two levels where the company's
 * EXISTENCE is at stake (radiation art. 59 al. 1 · dissolution art. 212). `penalty`
 * is money and `none` is nothing. A refusal (`known: false`) promotes nothing AND
 * demotes nothing: we never assign a level we do not know, which is exactly why this
 * is a LANE and not a re-scoring.
 */
function promotedRowIds(
  byReqKey: ReadonlyMap<string, Obligation[]>,
  framework: ConsequenceFramework,
  today: Date,
): ReadonlySet<string> {
  const out = new Set<string>();
  // Array.from over .entries(), not `for … of` on the Map: this repo's tsconfig
  // rejects direct Map/Set iteration (TS2802) — the same constraint that shapes
  // `Array.from(new Set(...))` in consequence.ts.
  for (const [requirementKey, rows] of Array.from(byReqKey.entries())) {
    const rule = ruleForRequirementKey(requirementKey);
    if (!rule) continue;
    // ⚠️ `status !== 'satisfied'` IS LOAD-BEARING, NOT HYGIENE. `byReqKey` is built
    // from the RAW array, which still holds satisfied rows; `scored` is built from
    // `active`, which does not. Promote a satisfied row and its id would match no
    // entry in `scored` — the promotion would vanish SILENTLY, the worst failure
    // mode this lane has. The two filters must keep agreeing.
    const inDefault = rows.filter(
      (o) => o.status !== 'satisfied' && isInDefault(rule.ruleKey, o, today),
    );
    if (inDefault.length === 0) continue;
    // consequence.ts never decides what "outstanding" means — it reads the set it is
    // given, and the set is derived just above, per ladder.
    const outstandingYears = inDefault
      .map((o) => o.year)
      .filter((y): y is number => y !== null);
    const assessment = computeConsequence({ ruleKey: rule.ruleKey, framework, outstandingYears });
    // Narrowing on `known` is NOT defensive — tsc refuses to read `.level` without
    // it. That is the whole point of the discriminated arm.
    if (!assessment.known) continue;
    if (assessment.level !== 'strikeoff' && assessment.level !== 'default') continue;
    const mostRecent = mostRecentByYear(inDefault);
    if (mostRecent) out.add(mostRecent.id);
  }
  return out;
}

export function rankObligations(
  obligations: Obligation[],
  today: Date,
  framework: ConsequenceFramework,
): RankedObligation[] {
  // `today` was RESERVED and unread until the consequence lane. It is now consumed by
  // `isInDefault` for the QC year count. The urgency ramp still reads each
  // obligation's pre-computed `daysUntilDue`, unchanged.

  // ★ PREREQUISITE INDICES — built from the RAW `obligations` param, NOT `active`.
  // `active` (below) drops satisfied rows, which would make a SATISFIED prerequisite
  // indistinguishable from an ABSENT one → every filing row permanently blocked.
  // byReqYear: `${requirementKey}|${year}` → obligation; byReqKey: requirementKey →
  // all its rows (for any-year label resolution); satisfiedByReqKey: any-year satisfied.
  const byReqYear = new Map<string, Obligation>();
  const byReqKey = new Map<string, Obligation[]>();
  const satisfiedByReqKey = new Set<string>();
  for (const o of obligations) {
    if (o.requirementKey == null) continue;
    byReqYear.set(`${o.requirementKey}|${o.year}`, o);
    const list = byReqKey.get(o.requirementKey);
    if (list) list.push(o);
    else byReqKey.set(o.requirementKey, [o]);
    if (o.status === 'satisfied') satisfiedByReqKey.add(o.requirementKey);
  }

  // 1. Satisfied items feed the progress display, not the to-do list — drop them.
  const active = obligations.filter((o) => o.status !== 'satisfied');

  // 2. Score: stakes × urgency — the WITHIN-bucket priority. Liveness is applied
  //    as a sort bucket below, NOT folded into the score.
  //
  //    `promoted` is computed HERE, ONCE PER ROW, and never inside the comparator:
  //    the comparator runs O(n log n) times, and a criterion recomputed per
  //    comparison would be both wasteful and unstable the day it stopped being a
  //    pure function of the row.
  const promoted = promotedRowIds(byReqKey, framework, today);
  const scored = active.map((o) => ({
    o,
    score: stakesFor(o) * urgencyFor(o),
    promoted: promoted.has(o.id),
  }));

  // 3. Sort desc by score; break ties by the locked D5 ladder.
  scored.sort((a, b) => {
    // ★ PROMOTION LANE — the ONLY comparison above the liveness bucket. A row whose
    // consequence is `strikeoff` or `default` precedes one that is not; WITHIN each
    // of the two groups the existing order is UNTOUCHED, bucket included. Nothing is
    // re-scored and nothing is demoted — which is why a consequence we do NOT know
    // (`known: false`) sits here harmlessly: it simply does not promote.
    if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
    // Bucket: liveness (live < regularize < remediate) — ABSOLUTE within a promotion
    // group. Every live item ranks above every regularize, above every remediate.
    const livA = LIVENESS_RANK[a.o.liveness];
    const livB = LIVENESS_RANK[b.o.liveness];
    if (livA !== livB) return livA - livB;
    // WITHIN a bucket: score (stakes × urgency) desc.
    if (Math.abs(a.score - b.score) > EPSILON) return b.score - a.score;
    // Then the tie-break ladder, within equal (bucket, score):
    // (1) external before internal
    const extA = a.o.exposure === 'external' ? 0 : 1;
    const extB = b.o.exposure === 'external' ? 0 : 1;
    if (extA !== extB) return extA - extB;
    // (2) foundational before non-foundational
    const foundA = isFoundational(a.o) ? 0 : 1;
    const foundB = isFoundational(b.o) ? 0 : 1;
    if (foundA !== foundB) return foundA - foundB;
    // (3) quick-win effort order
    const actA = ACTION_RANK[a.o.actionKind];
    const actB = ACTION_RANK[b.o.actionKind];
    if (actA !== actB) return actA - actB;
    // (4) oldest fiscal year first (year asc, nulls last)
    const yearA = a.o.year ?? Infinity;
    const yearB = b.o.year ?? Infinity;
    if (yearA !== yearB) return yearA - yearB;
    // (5) stable id
    return a.o.id.localeCompare(b.o.id);
  });

  // 4. 1-based rank; resolve prerequisites (registry-driven) — does NOT affect
  //    order or score (computed above), only the dep indicator + modal.
  return scored.map((s, i): RankedObligation => {
    const unmet = resolveUnmetPrerequisites(s.o, byReqYear, byReqKey, satisfiedByReqKey);
    return {
      ...s.o,
      rank: i + 1,
      score: s.score,
      hasDependencies: unmet.length > 0,
      unmetPrerequisites: unmet.length > 0 ? unmet : undefined,
    };
  });
}
