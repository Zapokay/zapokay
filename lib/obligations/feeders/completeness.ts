/**
 * A3 Feeder 1 — completeness → Obligation (pure translation, zero consumers).
 *
 * Normalizes each minute-book ChecklistItem (the founding + annual document
 * completeness signal) into the generalized Obligation contract. This is the
 * first real emitter proving the approved contract against live data shapes.
 *
 * Design: a3-obligation-contract-design-2026-07-02.md (§7 feeder mapping).
 * ADDITIVE: no I/O, no side effects, no consumers today. The completeness lib
 * (requirement-completeness.ts, state.ts) is READ, never modified.
 *
 * This feeder has NO clock: every clock field (dueDate, triggeredBy,
 * deadlineDays, daysUntilDue) is null. deriveStatus is still called so the D1
 * overlay rule stays the single status chokepoint — with a null clock it
 * returns the base state unchanged. The `today` param feeds the year-based
 * liveness branch only (currentYear − item.year); there is still no due-date clock.
 */

import type { Obligation, ObligationAction } from '../obligation';
import { deriveStatus, type BaseState } from '../aggregate';
import { computeLiveness } from '../liveness';
import type { ChecklistItem } from '@/lib/minute-book/requirement-completeness';
import { composeDisplayName } from '@/lib/display-name';
import {
  getStateForChecklistItem,
  STATE_WEIGHT,
  type DocumentState,
} from '@/lib/minute-book/state';
import { isExternalRequirementKey, filingForRuleKey } from '../filing-registry';

/**
 * External (government-facing) requirement keys — now a VIEW onto the filing
 * registry (the AFM set from the Core-locked taxonomy is one registry entry per
 * filing). Was a hardcoded Set here; `isExternalRequirementKey` returns identical
 * membership (any requirement_key that maps to a FILING_REGISTRY entry).
 */

/**
 * The foundational initial-declaration (RE-200) requirement keys — Harvey 2026-07-05
 * presumed-done suppression. Derived from the registry's qc_initial_declaration entry
 * (its requirementKeys) so the RE-200 key list lives in ONE place. Suppressed from the
 * A3 obligation stream ONLY — the minute-book completeness COUNT is unaffected.
 */
const INITIAL_DECLARATION_KEYS: ReadonlySet<string> = new Set(
  filingForRuleKey('qc_initial_declaration')?.requirementKeys ?? [],
);

/**
 * Phase-3 due-soon ranking window. Unused on a null clock (this feeder emits
 * no due dates), but passed to deriveStatus so the overlay rule remains the
 * single chokepoint. The real window is a Phase-3 input.
 */
const COMPLETENESS_NO_CLOCK_WINDOW = 0;

/** Map the completeness three-state model onto the contract's base state. */
const STATE_TO_BASE: Readonly<Record<DocumentState, BaseState>> = {
  'téléversé': 'satisfied',
  'généré': 'to_finalize',
  'missing': 'open',
};

/** Per §7: the next user action implied by each completeness state. */
function actionForState(state: DocumentState, canGenerate: boolean): ObligationAction {
  switch (state) {
    case 'missing':
      return canGenerate ? 'generate' : 'upload';
    case 'généré':
      return 'finalize';
    case 'téléversé':
      return 'none';
  }
}

/**
 * Translate the completeness checklist into obligations. Pure: one Obligation
 * per ChecklistItem, order preserved. Calls getStateForChecklistItem exactly
 * once per item; the derived DocumentState drives status (via BaseState),
 * weight, and actionKind.
 */
export function completenessToObligations(
  items: ChecklistItem[],
  today: Date,
  hasLaterAnnualFiling: boolean,
  incYear: number | null,
): Obligation[] {
  return items
    // Harvey 2026-07-05 presumed-done — a company with later satisfied annuals has
    // initialized its dossier; suppress the foundational initial declaration as a
    // board action (consistent with the deadline-twin suppression in Part 1). The
    // minute-book completeness COUNT is intentionally unaffected — that's the
    // separate % path (computeRequirementCompleteness), which we do not touch.
    .filter((item) => !(hasLaterAnnualFiling && INITIAL_DECLARATION_KEYS.has(item.requirement_key)))
    .map((item): Obligation => {
    const state = getStateForChecklistItem(item);
    const base = STATE_TO_BASE[state];
    // Null clock → deriveStatus returns `base` unchanged; the call keeps the
    // D1 overlay rule as the single status chokepoint.
    const status = deriveStatus(base, null, COMPLETENESS_NO_CLOCK_WINDOW);

    // DISPLAY year: annual rows use item.year (populated); foundational rows
    // (item.year === null) fall back to the incorporation year (Dom's ruling —
    // plain year, no qualifier). Does NOT touch the obligation's own `year:`
    // field below, which feeds ranking/grouping.
    const rowYear = item.year ?? incYear;
    return {
      id: `completeness:${item.requirement_key}:${item.year ?? 'foundational'}`,
      source: 'completeness',
      titleFr: composeDisplayName(item.title_fr, null, rowYear),
      titleEn: composeDisplayName(item.title_en, null, rowYear),
      descriptionFr: item.description_fr,
      descriptionEn: item.description_en,
      status,
      // No clock — year-based liveness (foundational year==null → 'live').
      liveness: computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: item.year, today }),
      weight: STATE_WEIGHT[state],
      dueDate: null,
      triggeredBy: null,
      deadlineDays: null,
      daysUntilDue: null,
      year: item.year,
      actionKind: actionForState(state, item.can_generate),
      requirementKey: item.requirement_key,
      docKey: null,
      exposure: isExternalRequirementKey(item.requirement_key)
        ? 'external'
        : 'internal',
      // Registry view — an external requirement is one satisfied by a government
      // filing (it maps to a FILING_REGISTRY entry). This feeder carries no clock;
      // the marker/pill only light up once a dueDate arrives — for the REQ annual
      // update that comes from the deadline twin at the aggregate merge.
      hasFiling: isExternalRequirementKey(item.requirement_key),
      statutoryBasis: null,
      helpKey: null,
      fulfilled: false,
      canUpload: item.can_upload,
      canGenerate: item.can_generate,
      docSource: item.source ?? null,
    };
  });
}
