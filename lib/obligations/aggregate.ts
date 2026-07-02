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
 * Flatten every feeder stream into one array, deduped by id (first occurrence
 * wins). No sorting/ranking — that is Phase 3. See
 * a3-obligation-contract-design-2026-07-02.md.
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
  return merged;
}
