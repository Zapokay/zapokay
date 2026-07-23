/**
 * A3 obligation aggregator skeleton — pure functions, no I/O.
 * Design: a3-obligation-contract-design-2026-07-02.md
 * ADDITIVE: zero consumers today. Ranking/sorting is Phase 3, NOT here.
 */

import type { Obligation, ObligationStatus } from './obligation';

/** The three feeder-supplied base states, before the clock overlay. */
export type BaseState = 'satisfied' | 'to_finalize' | 'open';

/**
 * D1 clock-overlay rule — maps a feeder base state + due-clock to the final
 * ObligationStatus. See a3-obligation-contract-design-2026-07-02.md (D1).
 * `dueSoonWindowDays` is a REQUIRED Phase-3 ranking input — no default.
 */
export function deriveStatus(
  base: BaseState,
  daysUntilDue: number | null,
  dueSoonWindowDays: number,
): ObligationStatus {
  // A done item is never re-opened by the clock.
  if (base === 'satisfied') return 'satisfied';
  // No clock → the base state stands.
  if (daysUntilDue === null) return base;
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= dueSoonWindowDays) return 'due_soon';
  return base;
}

/**
 * Overlap-merge map: obligations emitted by BOTH the completeness feeder (a
 * DOCUMENT to have) and the deadline feeder (a statutory FILING with a due date).
 * Keyed completeness `requirementKey` → deadline `ruleKey` — NOT titles, which are
 * display strings that drift. One line per merge pair; extend as pairs are found.
 * (Today: the QC REQ annual update. RE-200 is a latent second pair, currently
 * suppressed on both sides.)
 */
export const OVERLAP_MERGE: Readonly<Record<string, string>> = {
  lsaq_req_annual_update: 'qc_req_annual_update',
  cbca_req_annual_update_qc: 'qc_req_annual_update',
};

/** Deadline ids are namespaced `deadline:{ruleKey}:{yearSeg}`; extract the ruleKey. */
function deadlineRuleKey(id: string): string | null {
  const parts = id.split(':');
  return parts[0] === 'deadline' && parts.length >= 3 ? parts[1] : null;
}

/**
 * Flatten every feeder stream into one array, deduped by id (first occurrence
 * wins), then MERGE overlap twins. See a3-obligation-contract-design-2026-07-02.md.
 *
 * Overlap merge: when a completeness obligation and its deadline twin (per
 * OVERLAP_MERGE, same year) both appear, they collapse to ONE row carrying both
 * halves — the completeness DOCUMENT affordances (kept id/source/requirementKey/
 * canUpload… so the satisfied→drop path at rank.ts still clears it via a
 * document — THE BOOK IS THE PRODUCT) PLUS the deadline CLOCK (dueDate,
 * daysUntilDue, statutoryBasis) and its overdue status. The deadline twin is
 * removed. We merge HERE, at the single combine point — never suppress at a
 * feeder — so pure filings with no completeness twin flow through untouched.
 */
export function mergeObligations(...streams: Obligation[][]): Obligation[] {
  const seen = new Set<string>();
  const merged: Obligation[] = [];
  for (const stream of streams) {
    for (const ob of stream) {
      if (seen.has(ob.id)) continue;
      seen.add(ob.id);
      merged.push(ob);
    }
  }

  // Index deadline obligations by (ruleKey, year) for twin lookup.
  const deadlineByKey = new Map<string, Obligation>();
  for (const o of merged) {
    if (o.source !== 'deadline') continue;
    const rk = deadlineRuleKey(o.id);
    if (rk) deadlineByKey.set(`${rk}|${o.year}`, o);
  }

  const removed = new Set<Obligation>();
  const result = merged.map((o): Obligation => {
    if (o.source !== 'completeness' || o.requirementKey == null) return o;
    const rk = OVERLAP_MERGE[o.requirementKey];
    if (!rk) return o;
    const twin = deadlineByKey.get(`${rk}|${o.year}`);
    if (!twin) return o;
    removed.add(twin);
    // Field union: keep the completeness half (id, source, requirementKey,
    // canUpload/canGenerate/docSource, descriptionFr/En, actionKind='upload',
    // titleFr/En, liveness, weight, year), take the deadline clock + basis.
    return {
      ...o,
      dueDate: twin.dueDate,
      daysUntilDue: twin.daysUntilDue,
      deadlineDays: twin.deadlineDays,
      triggeredBy: twin.triggeredBy,
      statutoryBasis: twin.statutoryBasis,
      exposure: twin.exposure,
      // UNION — a merged row is a filing row if EITHER half carried the filing
      // fact (the completeness external-key half OR the deadline file_externally
      // twin). Independent of exposure, which is taken from the twin above.
      hasFiling: o.hasFiling === true || twin.hasFiling === true,
      // Overdue wins over open; a satisfied (document uploaded) row still clears —
      // the only way a merged row leaves the board is a document (the principle).
      status: o.status === 'open' ? twin.status : o.status,
    };
  });
  return result.filter((o) => !removed.has(o));
}
