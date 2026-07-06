/**
 * A3 liveness axis — Harvey 2026-07-05 three-state model (pure, no I/O).
 *
 * The orthogonal "is this still the right action NOW?" test, separate from the
 * Obligation contract's `status` (completion + due-soon/overdue clock). Per
 * Harvey: "due vs still-the-right-action are two different tests" — an obligation
 * can be `overdue` on the clock yet not the same thing on this axis.
 *
 *   live       — within its legal window ('à faire maintenant')
 *   regularize — past its own legal deadline but catch-up-able ('régularisation')
 *   remediate  — prolonged default, potential company-status problem
 *                ('consulter un professionnel')
 *
 * GREEN vs YELLOW (see per-branch comments):
 *   - The live→regularize flip is the obligation's OWN legal deadline expiring
 *     (daysUntilDue crossing 0, or the fiscal year going a year stale). GREEN —
 *     per-obligation, Harvey-verified.
 *   - The regularize→remediate threshold is REMEDIATE_THRESHOLD_YEARS. YELLOW —
 *     lawyer-pending (see the constant).
 *
 * ADDITIVE: imports only the contract's ObligationLiveness union; no feeder or
 * aggregator dependency.
 */

import type { ObligationLiveness } from './obligation';

/**
 * YELLOW — Harvey convention, lawyer must confirm. The regularize→remediate
 * boundary: the prolonged default at which the REQ's radiation d'office
 * (striking-off for a company in extended non-filing) becomes the real risk, so
 * the board should stop saying "catch up" and start saying "consult a
 * professional". Exact LPLE article pending. Swap the value when confirmed.
 */
export const REMEDIATE_THRESHOLD_YEARS = 2;

export interface LivenessInput {
  /** Days until the legal due date, feeder-computed. null = the obligation has no clock. */
  daysUntilDue: number | null;
  /**
   * The obligation's legal window in days (e.g. REQ art. 41 = 30). RESERVED in
   * v1: the flip logic keys off the SIGN of daysUntilDue (feeders already compute
   * it against the legal dueDate, so <0 already means "past the legal deadline").
   * Carried for contract symmetry + a future window-aware refinement; unused today.
   */
  legalWindowDays: number | null;
  /** Fiscal year of the obligation; null = foundational (no year, no lateness concept). */
  year: number | null;
  /** Evaluation date — supplies the current year for the no-clock (year-based) branch. */
  today: Date;
}

/**
 * Map an obligation onto the three-state liveness axis. Pure; branches on whether
 * the obligation carries a legal clock (daysUntilDue) or is year-based (completeness).
 */
export function computeLiveness(input: LivenessInput): ObligationLiveness {
  const { daysUntilDue, year, today } = input;

  // ── Branch A — the obligation has a legal clock (deadline & REQ feeders) ──────
  if (daysUntilDue !== null) {
    // Within its legal window — still the right action right now.
    if (daysUntilDue >= 0) return 'live';
    // Past its OWN legal deadline. The live→regularize flip = that deadline
    // expiring (daysUntilDue crossed 0) — GREEN, per-obligation. Prolonged
    // default beyond the YELLOW threshold escalates to remediate. Approx 365
    // days/year (not calendar-exact) — a liveness cutoff, not a legal computation.
    if (daysUntilDue < -365 * REMEDIATE_THRESHOLD_YEARS) return 'remediate'; // YELLOW threshold
    return 'regularize'; // GREEN flip
  }

  // ── Branch B — no clock (completeness, year-based) ────────────────────────────
  // Foundational items carry no year and no lateness concept — a founding doc is
  // always the right action. (Confirmed default 2026-07-05: year==null → live.)
  if (year === null) return 'live';
  const yearsBehind = today.getFullYear() - year;
  if (yearsBehind <= 0) return 'live';                              // current/future FY — GREEN
  if (yearsBehind < REMEDIATE_THRESHOLD_YEARS) return 'regularize'; // 1 year stale — GREEN flip
  return 'remediate';                                               // YELLOW threshold (>= 2 stale)
}
