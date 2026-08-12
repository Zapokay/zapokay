/**
 * A3 Feeder 1 — completeness → Obligation (pure translation). ONE consumer: the dashboard
 * server component's A3 board assembly.
 *
 * Normalizes each minute-book ChecklistItem (the founding + annual document
 * completeness signal) into the generalized Obligation contract. This is the
 * first real emitter proving the approved contract against live data shapes.
 *
 * Design: a3-obligation-contract-design-2026-07-02.md (§7 feeder mapping).
 * ADDITIVE: no I/O, no side effects. The completeness lib
 * (requirement-completeness.ts, state.ts) is READ, never modified.
 *
 * ★ THIS FILE CLAIMED NO CONSUMERS TWICE — once above and once on the ADDITIVE line — and
 * both were TRUE WHEN WRITTEN: the feeder shipped ahead of its UI. `dc5eb27` (2026-07-10)
 * wired the dashboard to it and voided both at once; they then survived 48 commits, because
 * nothing type-checks a header. Corrected together in A4 phase 3, deliberately: two copies
 * of one claim that are fixed separately are two copies that drift. Sibling feeder
 * deadlines.ts carried the identical stale claim and is corrected in the same commit. Only
 * the COUNT was wrong — `pure translation`, `no I/O` and `no side effects` are still TRUE.
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
import {
  isBoardSuppressedRequirementKey,
  ruleForRequirementKey,
  ruleForRuleKey,
} from '../obligation-registry';

/**
 * WHERE `exposure` AND `hasFiling` COME FROM — the history, recorded once.
 *
 * Both used to be read from a single predicate that meant "this requirement_key HAS A
 * REGISTRY ENTRY", used as a proxy for "is external". The two agreed only while every
 * entry in the table was a government filing.
 *
 * Dom's decision D-B admits INTERNAL obligations to the registry, so membership stops
 * implying exposure the instant the first one lands — the predicate would have reported
 * the annual meeting as external. Both fields now read a DECLARED field off the rule
 * instead, which removes the proxy rather than correcting it; the predicate itself is
 * deleted. The mechanics live at the lookup and at each field, not here.
 *
 * Before the registry existed, these keys were a hardcoded Set in this file.
 */

/**
 * The foundational initial-declaration (RE-200) requirement keys — Harvey 2026-07-05
 * presumed-done suppression. Derived from the registry's qc_initial_declaration entry
 * (its requirementKeys) so the RE-200 key list lives in ONE place. Suppressed from the
 * A3 obligation stream ONLY — the minute-book completeness COUNT is unaffected.
 */
const INITIAL_DECLARATION_KEYS: ReadonlySet<string> = new Set(
  ruleForRuleKey('qc_initial_declaration')?.requirementKeys ?? [],
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
  bookCurrencyCap: Date | null,
): Obligation[] {
  return items
    // Harvey 2026-07-05 presumed-done — a company with later satisfied annuals has
    // initialized its dossier; suppress the foundational initial declaration as a
    // board action (consistent with the deadline-twin suppression in Part 1). The
    // minute-book completeness COUNT is intentionally unaffected — that's the
    // separate % path (computeRequirementCompleteness), which we do not touch.
    .filter((item) => !(hasLaterAnnualFiling && INITIAL_DECLARATION_KEYS.has(item.requirement_key)))
    // Harvey 2026-07-24 — a RECURRING filing (the federal annual return) is ONE
    // obligation, not N per-year debts. Suppress its per-year completeness rows from
    // the A3 obligation stream ONLY; the single deadline row (fed_annual_return)
    // represents it on the board. Mirrors the INITIAL_DECLARATION_KEYS board-only
    // suppression above — the minute-book completeness COUNT / Complétude / verdict
    // are intentionally UNAFFECTED (Dom: Complétude keeps its per-year record).
    // Registry-derived from `cadence: 'anniversary'` — no new literal.
    .filter((item) => !isBoardSuppressedRequirementKey(item.requirement_key))
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

    // Hoisted rather than looked up at each field, so the shared INPUT is explicit.
    // Two separate lookups would let a later edit change one call site and split the
    // pair silently — the same shape as the flags `cadence` replaced.
    //
    // `undefined` when no registry rule maps this requirement_key. That branch is
    // FORCED BY THE RETURN TYPE (`ObligationRule | undefined`), not by convention.
    const rule = ruleForRequirementKey(item.requirement_key);
    return {
      id: `completeness:${item.requirement_key}:${item.year ?? 'foundational'}`,
      source: 'completeness',
      titleFr: composeDisplayName(item.title_fr, null, rowYear),
      titleEn: composeDisplayName(item.title_en, null, rowYear),
      descriptionFr: item.description_fr,
      descriptionEn: item.description_en,
      status,
      // No clock — year-based liveness. FOUNDATIONAL ROWS (year === null) TAKE THE
      // BOOK-CURRENCY CAP INSTEAD, when it exists and has passed: they carry no legal
      // deadline (Harvey GREEN), so 'live' — glossed "not yet due" — was asserting a
      // currency the book may no longer have. See bookCurrencyCap in
      // obligation-registry.ts for the rule, and why it is a PRODUCT rule, not a legal
      // claim. ONE DATE PER COMPANY: the cap arrives as a parameter, identical for
      // every row, and is never re-derived per row.
      //
      // ⚠️ THE CAP IS APPLIED HERE, AT THE CALL SITE, AND NOT IN liveness.ts. That
      // function's `year === null → 'live'` branch is SHARED with the checklist path
      // (requirement-completeness.ts), which feeds Complétude and the verdict counters.
      // Measured 2026-08-11: moving the 8 Wick foundational rows on the BOARD left all
      // four verdict counters untouched (10/8/20, defaut_prolonge). Changing liveness.ts
      // would have moved both. The two paths are disjoint; keep them that way.
      //
      // cap null — no fiscal year closed yet, or no incorporation date — keeps 'live'.
      // Both cases are argued on bookCurrencyCap itself.
      liveness:
        item.year === null && bookCurrencyCap !== null && today > bookCurrencyCap
          ? 'regularize'
          : computeLiveness({ daysUntilDue: null, legalWindowDays: null, year: item.year, today }),
      weight: STATE_WEIGHT[state],
      dueDate: null,
      triggeredBy: null,
      deadlineDays: null,
      daysUntilDue: null,
      year: item.year,
      actionKind: actionForState(state, item.can_generate),
      requirementKey: item.requirement_key,
      docKey: null,
      exposure: rule ? rule.exposure : 'internal',
      // hasFiling asks a DIFFERENT question from exposure above, off the same rule:
      // does discharging this obligation require a filing OUTSIDE ZapOkay? That is the
      // rule's VERB (`actionKind`), not its audience — and it must never be re-derived
      // from exposure, or the ranking fact and the display fact become one expression
      // and merge by accident (ZK_Core). The predicate both fields used to share, and
      // why it went, are in the file docblock above.
      //
      // This feeder carries no clock; the marker/pill only light up once a dueDate
      // arrives — for the REQ annual update that comes from the deadline twin at the
      // aggregate merge.
      hasFiling: rule ? rule.actionKind === 'file_externally' : false,
      statutoryBasis: null,
      helpKey: null,
      fulfilled: false,
      canUpload: item.can_upload,
      canGenerate: item.can_generate,
      docSource: item.source ?? null,
    };
  });
}
