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
 * returns the base state unchanged.
 */

import type { Obligation, ObligationAction } from '../obligation';
import { deriveStatus, type BaseState } from '../aggregate';
import type { ChecklistItem } from '@/lib/minute-book/requirement-completeness';
import {
  getStateForChecklistItem,
  STATE_WEIGHT,
  type DocumentState,
} from '@/lib/minute-book/state';

/**
 * External (government-facing) requirement keys — the AFM set from the
 * Core-locked compliance taxonomy (2026-04-28). Source of truth:
 * docs/obligation-inventory-2026-05-30.md ("AFM = rows 7, 8, 23, 24, 25")
 * + docs/compliance-taxonomy-2026-04-28.md. Two structural proxies are
 * currently 1:1 with this set (section==='avis'; document_type==='rapport'
 * via requirementToDocType) — deliberately NOT used as the encoding because
 * both serve display/doctype purposes and could drift. Re-verify the 1:1
 * against the seed if this list is ever edited.
 */
const EXTERNAL_REQUIREMENT_KEYS: ReadonlySet<string> = new Set([
  'lsaq_declaration_initiale',
  'cbca_declaration_initiale_qc',
  'cbca_annual_return',
  'lsaq_req_annual_update',
  'cbca_req_annual_update_qc',
]);

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
export function completenessToObligations(items: ChecklistItem[]): Obligation[] {
  return items.map((item): Obligation => {
    const state = getStateForChecklistItem(item);
    const base = STATE_TO_BASE[state];
    // Null clock → deriveStatus returns `base` unchanged; the call keeps the
    // D1 overlay rule as the single status chokepoint.
    const status = deriveStatus(base, null, COMPLETENESS_NO_CLOCK_WINDOW);

    return {
      id: `completeness:${item.requirement_key}:${item.year ?? 'foundational'}`,
      source: 'completeness',
      titleFr: item.title_fr,
      titleEn: item.title_en,
      descriptionFr: item.description_fr,
      descriptionEn: item.description_en,
      status,
      weight: STATE_WEIGHT[state],
      dueDate: null,
      triggeredBy: null,
      deadlineDays: null,
      daysUntilDue: null,
      year: item.year,
      actionKind: actionForState(state, item.can_generate),
      requirementKey: item.requirement_key,
      docKey: null,
      exposure: EXTERNAL_REQUIREMENT_KEYS.has(item.requirement_key)
        ? 'external'
        : 'internal',
      statutoryBasis: null,
      helpKey: null,
      fulfilled: false,
    };
  });
}
