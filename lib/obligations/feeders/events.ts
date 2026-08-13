/**
 * A-2 Feeder — event acts → Obligation (pure translation, mirrors feeder 1).
 *
 * Normalizes each NOT-DONE lifecycle act (director/officer/share appointment,
 * departure, issuance, cessation, transfer) into the generalized Obligation
 * contract, so the A3 board covers event documents the same way it covers
 * requirement documents. Replaces the ungated `reqObs` block in the dashboard
 * (Finding ① — that block emitted the Stage-2 government filing even when the
 * resolution document did not exist yet).
 *
 * Design: a3-obligation-contract-design-2026-07-02.md (§7 feeder mapping) +
 * a3-event-document-feeder-spec-2026-07-21.md. ADDITIVE: no I/O, no side
 * effects. The event engine (event-completeness.ts) is READ, never modified.
 *
 * TWO-STAGE STATE MACHINE (one obligation per act, whichever stage applies):
 *   NOT-DONE PREDICATE = documentIsFinalized !== true (the event-completeness
 *   invariant — an event doc is DONE only when finalized, per the certify-
 *   checkbox rule, not merely when a document is linked).
 *
 *   Stage 1 — documentIsFinalized !== true → THE DOCUMENT. No clock; liveness is
 *     the act's pre-computed tier (the engine already tiered every not-done act).
 *     actionKind mirrors the completeness feeder (missing→generate, généré→
 *     finalize). exposure 'internal'.
 *   Stage 2 — documentIsFinalized === true AND the docKey has a REQ filing
 *     (obligationsForDocKey(docKey).length > 0 → roster) → THE FILING. The act's
 *     OWN 30-day REQ clock (art. 41 LPLE, event date + 30). liveness is
 *     RECOMPUTED here — act.liveness is null for a finalized act (the engine only
 *     tiers not-done ones). exposure 'external'.
 *   Done — documentIsFinalized === true AND no REQ filing (SHARE events, art. 33)
 *     → emit NOTHING (drops off the board: Stage 1 done, no Stage 2).
 *
 * "filed" is always false in A-2 (no persistence yet — Part B builds
 * event_filings), so a finalized ROSTER act always emits Stage 2.
 */

import type { Obligation, ObligationAction } from '../obligation';
import { deriveStatus, type BaseState } from '../aggregate';
import { computeLiveness } from '../liveness';
import { obligationsForDocKey } from '../req-obligations';
import { deriveDocKey } from '../derive-dockey';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';
import { formatEventDisplayName } from '@/lib/minute-book/event-act-helpers';
import { getDocumentState, STATE_WEIGHT, type DocumentState } from '@/lib/minute-book/state';
import { addDays, parseLocalDate } from '@/lib/utils';

/**
 * Phase-3 due-soon ranking window (days). Stage 1 has no clock, so this is only
 * meaningful for Stage 2; it matches the REQ 30-day window that starts the clock.
 * (Mirrors req.ts:52 — a placeholder pending the Phase-3 ranking decision.)
 */
const DUE_SOON_WINDOW = 30;

/** Map the completeness three-state model onto the contract's base state. */
const STATE_TO_BASE: Readonly<Record<DocumentState, BaseState>> = {
  'téléversé': 'satisfied',
  'généré': 'to_finalize',
  'missing': 'open',
};

/** Per §7: the next user action implied by each document state. Identical to the
 *  completeness feeder's actionForState; every derivable event has a lifecycle
 *  template, so canGenerate is always true here. */
function actionForState(state: DocumentState): ObligationAction {
  switch (state) {
    case 'missing':
      return 'generate';
    case 'généré':
      return 'finalize';
    case 'téléversé':
      return 'none';
  }
}

/**
 * Translate the not-done event acts into obligations. Pure: at most one
 * Obligation per act, order preserved. Acts whose docKey can't be derived
 * (unknown type) are skipped. Done SHARE acts (finalized, no filing) are
 * skipped. Everything else emits its Stage-1 or Stage-2 obligation.
 */
/**
 * Days from `today` to a filing deadline — ONE implementation, used by BOTH stages.
 *
 * It was written twice before: stage 2 computed it inline and stage 1 hardcoded `null`.
 * Two copies of one calculation diverge at the first change to either (the `968a7ae`
 * book-currency motive), and a clock that disagrees with itself between two rows of the
 * same act is worse than no clock at all.
 *
 * Returns null only when there is no deadline to measure against — a SHARE event, which
 * carries no REQ filing.
 */
function daysUntilDueFrom(dueDate: string | null, today: Date): number | null {
  if (!dueDate) return null;
  return Math.round((parseLocalDate(dueDate).getTime() - today.getTime()) / 86_400_000);
}

export function eventsToObligations(acts: EventActStatus[], today: Date): Obligation[] {
  const out: Obligation[] = [];

  for (const act of acts) {
    const derivation = deriveDocKey(act);
    if (!derivation) continue; // unknown act type — no docKey, nothing to emit
    const docKey = derivation.docKey;

    // Shared identity + labels (single-sourced from the pure helper; #156 — the
    // legal title follows the document's language, so both locale fields carry
    // the doc-language title once a document exists, else the per-locale registry
    // title). resolveTitle (a3-presentation) reads titleFr/titleEn first.
    const id = `event:${act.event_type}:${act.event_id}:${act.event_phase}`;
    const titleFr = formatEventDisplayName(act, 'fr');
    const titleEn = formatEventDisplayName(act, 'en');
    const eventLink = {
      event_type: act.event_type,
      event_id: act.event_id,
      event_phase: act.event_phase,
    };
    const year = parseLocalDate(act.date).getFullYear();
    const hasReqFiling = obligationsForDocKey(docKey).length > 0;
    const isFinalized = act.documentIsFinalized === true;

    if (!isFinalized) {
      // ── Stage 1 — the document (generate / finalize the resolution) ──────────
      const state = getDocumentState({
        satisfied: act.satisfied,
        source: act.documentSource,
        is_finalized: act.documentIsFinalized,
      });
      const base = STATE_TO_BASE[state];
      const docSource: 'uploaded' | 'generated' | null =
        state === 'missing' ? null : state === 'généré' ? 'generated' : 'uploaded';

      // B1 — ROSTER events carry the filing deadline (event date + 30) at Stage 1
      // too, so the board's always-on ObligationMarker has its date from Stage 1
      // onward (Dom's locked decision — a brand-new roster event shows the
      // filing-due marker alongside its Stage-1 document button). daysUntilDue
      // stays null so deriveStatus keeps `status` keyed on the DOCUMENT state, not
      // the filing clock. SHARE events (no filing) keep dueDate/deadlineDays null.
      const notice = hasReqFiling ? obligationsForDocKey(docKey)[0] : null;
      const stage1DueDate = notice ? addDays(act.date, notice.deadlineDays) : null;
      const stage1DeadlineDays = notice ? notice.deadlineDays : null;
      const stage1DaysUntilDue = daysUntilDueFrom(stage1DueDate, today);

      out.push({
        id,
        source: 'event',
        titleFr,
        titleEn,
        descriptionFr: null,
        descriptionEn: null,
        // No clock — deriveStatus returns `base` unchanged (D1 overlay chokepoint).
        status: deriveStatus(base, null, DUE_SOON_WINDOW),
        // REUSE the act's pre-computed tier — the engine tiers every not-done act.
        liveness: act.liveness ?? 'live',
        weight: STATE_WEIGHT[state],
        dueDate: stage1DueDate, // roster: event date + 30 (marker only); share: null
        triggeredBy: null,
        deadlineDays: stage1DeadlineDays,
        // ★ THE CLOCK REACHES THE RANKER. This field used to be `null` here, with the note
        // "keep status on the DOCUMENT state, not the filing clock". THAT REASON IS STILL
        // VALID and is still honoured — the status pill above must follow the document
        // (to produce / produced / finalized), never the filing deadline. Dom's locked
        // decision; nothing here touches it.
        //
        // ★★ WHAT WAS WRONG IS THAT ONE FIELD CARRIED TWO RESPONSIBILITIES: the status
        // label AND the ranking urgency. Nulling it here switched off the first and lost
        // the second as collateral damage. `obligation.ts` calls this field "THE ranking
        // number"; `rank.ts`'s urgencyFor is its ONLY reader outside the feeders (measured
        // 2026-08-13, no component, no view), and a null there means the URGENCY FLOOR
        // while an overdue clock means URGENCY_MAX — the widest gap the function produces.
        //
        // ★ THE TWO USES WERE ALREADY INDEPENDENT AT THE CALL SITE, which is why this costs
        // nothing: deriveStatus does not read this field, it takes a PARAMETER, and it is
        // still handed a LITERAL null a few lines above. Setting the field cannot move a
        // pill. [MEASURED: 0 status changes, 0 bucket changes, four fixtures, by id.]
        //
        // THE COST WAS VISIBLE ON ACME: a director's departure 47 days past its art. 41
        // LPLE deadline sat at rank 6, behind TWO share issuances carrying no deadline at
        // all at ranks 1-2. The row's date was on screen the whole time — the marker
        // rendered it — and the ranker was the only thing not reading it.
        //
        // ⚠️ AND THE BUCKET DOES NOT MOVE FOR A REASON WORTH STATING PRECISELY, because the
        // obvious wording is wrong: it is NOT that liveness ignores the filing clock. A
        // roster act's tier IS derived from that clock, UPSTREAM, in
        // event-completeness.ts ("roster acts tier by the 30-day REQ filing window"). This
        // feeder nulled the field DOWNSTREAM, after the tier was already computed. So this
        // line RESTORES AN AGREEMENT THAT ALREADY EXISTED — it does not create one, and it
        // cannot reopen the 2026-07-05 absolute-bucket decision.
        //
        // ⚠️ GUARDED BY FACT 6 in scripts/check-obligations.ts: at equal bucket, a row with
        // a PAST deadline must outrank a row with none. Re-null this field and that fact
        // fails by name. Nothing else covers this path — tsc cannot (null is a legal value
        // of `number | null`) and no other gate imports this feeder.
        daysUntilDue: stage1DaysUntilDue,
        year,
        actionKind: actionForState(state),
        requirementKey: null,
        docKey,
        exposure: 'internal',
        // ROSTER acts must still be filed at the REQ (art. 41) — true even at
        // Stage 1, while the in-app document is still being produced. Reuses the
        // same fact this feeder already computed above; SHARE events → false.
        // exposure stays 'internal' so ranking is unchanged.
        hasFiling: hasReqFiling,
        statutoryBasis: null,
        helpKey: null,
        fulfilled: false,
        canUpload: true,
        canGenerate: true,
        docSource,
        eventLink,
      });
      continue;
    }

    // isFinalized === true from here.
    if (!hasReqFiling) continue; // SHARE event — Stage 1 done, no Stage 2 (art. 33)
    // Part B — document final + roster + FILED → DONE. The government filing has
    // been recorded (event_filings), so the board's Stage-2 obligation drops off
    // entirely. (Complétude keeps the act row but hides its marker — EventActRow.)
    if (act.filed) continue;

    // ── Stage 2 — the REQ filing (roster event past its finalized document) ────
    // The act's OWN 30-day clock. RECOMPUTE liveness (act.liveness is null for a
    // finalized act) using req.ts:64-67's formula VERBATIM so the row's tier and
    // the always-on ObligationMarker date stay in lockstep.
    const notice = obligationsForDocKey(docKey)[0];
    const dueDate = addDays(act.date, notice.deadlineDays);
    const daysUntilDue = daysUntilDueFrom(dueDate, today);
    // docSource carries forward whatever finalized the doc (generated vs uploaded).
    const docSource: 'uploaded' | 'generated' | null =
      act.documentSource === 'uploaded' ? 'uploaded' : 'generated';

    out.push({
      id,
      source: 'event',
      titleFr,
      titleEn,
      descriptionFr: null,
      descriptionEn: null,
      status: deriveStatus('open', daysUntilDue, DUE_SOON_WINDOW),
      liveness: computeLiveness({
        daysUntilDue,
        legalWindowDays: null,
        year: null,
        today,
      }),
      weight: 0, // open/unfulfilled filing — STATE_WEIGHT semantics (open = 0.0)
      dueDate,
      triggeredBy: notice.triggeredBy, // 'roster_change'
      deadlineDays: notice.deadlineDays, // 30
      daysUntilDue,
      year,
      actionKind: 'file_externally',
      requirementKey: null,
      docKey,
      exposure: 'external', // government-facing filing
      hasFiling: hasReqFiling, // provably true here (guarded !hasReqFiling continue @ :158)
      statutoryBasis: notice.statutoryBasis, // 'art. 41 LPLE (RLRQ, c. P-44.1)'
      helpKey: notice.helpKey ?? null, // 'req'
      fulfilled: false,
      canUpload: false,
      canGenerate: false,
      docSource,
      eventLink,
    });
  }

  return out;
}
