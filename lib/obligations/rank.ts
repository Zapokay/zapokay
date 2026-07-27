/**
 * A3 Ranking brain — pure base ranker (no I/O, no side effects, zero consumers).
 *
 * Turns the merged obligation stream into a fully ordered to-do list: the
 * dashboard board slices the top 5, and the full list backs the "show more (N)"
 * count. Design: a3-ranking-brain-spec-2026-07-03.md §3–§5.
 *
 * score = stakes × urgency. Stakes = what's at risk (external filing >
 * foundational > internal-annual > low). Urgency = a steep convex ramp on
 * daysUntilDue (D2), with a virtual floor so clock-less foundational work still
 * competes (D3). Ties break by a locked ladder (D5).
 *
 * ADDITIVE: reads the shipped Obligation contract; does NOT modify it, the
 * aggregator, or any feeder. Constants are PROVISIONAL (the tuning point) — the
 * ORDERING and SHAPE are locked, the exact numbers are not.
 *
 * Imports ONLY from ./obligation (the contract). ./aggregate is unused here —
 * the ranker consumes an already-merged, deduped stream.
 */

import type { Obligation, ObligationAction, ObligationLiveness } from './obligation';
import {
  filingForRequirementKey,
  filingForRuleKey,
  filingForDocKey,
  type FilingRule,
  type ReasonKey,
} from './filing-registry';

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

// ── LIVENESS BUCKET (Harvey 2026-07-05) — PRIMARY sort key, absolute hierarchy ──
// Liveness is an ABSOLUTE bucket, not a weight: every 'live' obligation ranks above
// every 'regularize', which ranks above every 'remediate' — no exceptions. It's the
// orthogonal "is this still the right action" axis (Harvey: due ≠ still-the-right-
// action). stakes × urgency (`score`) orders WITHIN a bucket only; it never crosses
// bucket boundaries, so a high-base ancient remediate item can't edge out a current
// live one. (Replaces the Part-1 liveness multiplier, now redundant under buckets.)
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

/** Find the filing-registry rule an obligation IS, via requirementKey → ruleKey (deadline id) → docKey. */
function filingRuleForObligation(o: Obligation): FilingRule | undefined {
  if (o.requirementKey) {
    const r = filingForRequirementKey(o.requirementKey);
    if (r) return r;
  }
  if (o.source === 'deadline') {
    const ruleKey = o.id.split(':')[1]; // id = `deadline:{ruleKey}:{yearSeg}`
    const r = filingForRuleKey(ruleKey);
    if (r) return r;
  }
  if (o.docKey) return filingForDocKey(o.docKey);
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
  const rule = filingRuleForObligation(o);
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

export function rankObligations(obligations: Obligation[], today: Date): RankedObligation[] {
  // `today` is reserved: the v1 urgency ramp reads each obligation's pre-computed
  // daysUntilDue (baked by the feeders); kept in the signature for API symmetry
  // with the feeders and a future freshness recompute.
  void today;

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
  //    as the primary sort bucket below, NOT folded into the score.
  const scored = active.map((o) => ({ o, score: stakesFor(o) * urgencyFor(o) }));

  // 3. Sort desc by score; break ties by the locked D5 ladder.
  scored.sort((a, b) => {
    // PRIMARY bucket: liveness (live < regularize < remediate) — ABSOLUTE. Every
    // live item ranks above every regularize, above every remediate. No exceptions.
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
