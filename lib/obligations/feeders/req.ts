/**
 * A3 Feeder 2 — REQ ObligationNotice → Obligation (pure, no I/O, zero consumers).
 *
 * Translates the shipped REQ filing obligation (req-obligations.ts, 715efb9)
 * into the generalized Obligation contract. This is the event-relative case the
 * contract was designed to also hold: unlike feeder 3's calendar-absolute
 * deadlines (triggeredBy null), a REQ obligation's clock STARTS when a roster
 * change is recorded — triggeredBy 'roster_change' + deadlineDays 30.
 *
 * Design: a3-obligation-contract-design-2026-07-02.md. ADDITIVE: does NOT
 * modify req-obligations.ts, the event engine, or the shipped ObligationMarker.
 *
 * PURE + docKey-as-input: the marker's docKey derivation (deriveDocKey) is a
 * file-private function inside EventActRow.tsx — NOT lib-importable. This feeder
 * does NOT re-derive; the caller (which already has the derived docKey + event
 * date at the event point) supplies them via ReqEventInput.
 *
 * Deadline parity: dueDate = addDays(eventDate, notice.deadlineDays) — reads
 * deadlineDays FROM the notice (30), so this matches the shipped
 * ObligationMarker's displayed deadline exactly, with no hardcoded-30 drift
 * (the marker itself hardcodes 30 in EventActRow.tsx:205; this reads the source).
 *
 * Titles null by design — the REQ label is lawyer-pending copy single-sourced
 * from the obligationNotice.req.* i18n keys the shipped ObligationMarker uses;
 * the UI supplies the display label, the feeder carries only structured facts.
 *
 * BANKED FAST-FOLLOW (out of scope here): for a CBCA company, a roster change
 * ALSO triggers the federal 15-day notice (art. 113 LCSA) — a SECOND, co-existing
 * obligation. That needs `framework` threaded to the event point (available at
 * the completeness page, not yet at EventActRow); deferred to a follow-up.
 */

import type { Obligation } from '../obligation';
import { deriveStatus } from '../aggregate';
import { computeLiveness } from '../liveness';
import { obligationsForDocKey } from '../req-obligations';
import { addDays, parseLocalDate } from '@/lib/utils';

export interface ReqEventInput {
  /** The already-derived lifecycle docKey (one of the 6 REQ keys, or any docKey). */
  docKey: string;
  /** ISO 'YYYY-MM-DD' — act.date, the roster-change date that starts the clock. */
  eventDate: string;
  /** Stable id for the event, for Obligation id namespacing (so two changes don't collide). */
  eventId: string;
}

/**
 * Due-soon ranking window (days). PROVISIONAL — the real value is a Phase-3
 * ranking decision; 30 is a placeholder so deriveStatus has a clock to overlay.
 */
const DUE_SOON_WINDOW = 30;

/**
 * Translate a recorded roster-change event into its REQ filing obligation(s).
 * Pure: honors the ObligationNotice[] the map returns (today always [REQ_QC],
 * but the list is respected). Returns [] for a non-REQ docKey — a clean no-op.
 */
export function reqObligations(input: ReqEventInput, today: Date): Obligation[] {
  const notices = obligationsForDocKey(input.docKey);

  return notices.map((notice): Obligation => {
    // addDays returns an ISO 'YYYY-MM-DD' string (lib/utils.ts:51), used directly.
    const dueDate = addDays(input.eventDate, notice.deadlineDays);
    const daysUntilDue = Math.round(
      (parseLocalDate(dueDate).getTime() - today.getTime()) / 86_400_000,
    );

    return {
      id: `req:${notice.obligationName}:${input.eventId}`,
      source: 'req_filing',
      titleFr: null,
      titleEn: null,
      descriptionFr: null,
      descriptionEn: null,
      status: deriveStatus('open', daysUntilDue, DUE_SOON_WINDOW),
      // Event-relative legal clock (art. 41 = 30d); daysUntilDue<0 = past the deadline.
      liveness: computeLiveness({ daysUntilDue, legalWindowDays: notice.deadlineDays, year: null, today }),
      weight: 0, // open/unfulfilled — STATE_WEIGHT semantics (open = 0.0)
      // EVENT-RELATIVE clock — the distinguishing feature of feeder 2:
      dueDate,
      triggeredBy: notice.triggeredBy,   // 'roster_change'
      deadlineDays: notice.deadlineDays, // 30
      daysUntilDue,
      year: null, // event-scoped, not fiscal-year
      actionKind: 'file_externally', // filed at the government
      requirementKey: null,
      docKey: input.docKey,
      exposure: 'external', // government-facing filing
      statutoryBasis: notice.statutoryBasis, // 'art. 41 LPLE (RLRQ, c. P-44.1)'
      helpKey: notice.helpKey ?? null,       // 'req'
      fulfilled: false, // inert A3 resolved-state seam
    };
  });
}
