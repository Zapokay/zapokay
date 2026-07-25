/**
 * A3 Feeder 3 — deadline obligations (pure, no I/O, zero consumers).
 *
 * Emits recurring/calendar statutory + governance deadlines into the
 * generalized Obligation contract, on Harvey-verified deadlines
 * (harvey-ongoing-compliance-obligations, 2026-07-02). Replaces the deprecated
 * engine's unsourced/buggy calculateDueDate formulas — notably the REQ annual
 * update, corrected from +4mo to +6mo (art. 45 LPLE + reg P-44.1 r.1 art. 3).
 *
 * ADDITIVE: does NOT import or modify lib/compliance/calculateComplianceItems
 * and does NOT touch compliance_rules/compliance_items — the old engine stays
 * live and untouched. The date helpers below are REPLICATED from that file
 * (marked per-helper) because they are file-private there; the sole shared
 * import is parseLocalDate from @/lib/utils.
 *
 * SCOPE: calendar/recurring deadlines only. EVENT-triggered co-existing
 * deadlines — e.g. a director change firing BOTH the 15-day federal notice AND
 * the 30-day REQ update — are event-relative, not calendar-absolute, so they
 * are feeder 2's (REQ ObligationNotice) territory and are OUT of scope here.
 *
 * QC scope: ZapOkay serves QC-operating corporations; the QC filings below
 * apply to all such companies (both frameworks). Province gating, if ever
 * needed, is the caller's concern — this input carries no province.
 */

import type { Obligation } from '../obligation';
import { deriveStatus } from '../aggregate';
import { computeLiveness } from '../liveness';
import { composeDisplayName } from '@/lib/display-name';
import { parseLocalDate } from '@/lib/utils';
import {
  filingForRuleKey,
  addMonthsClamped,
  completedFiscalYearEnd,
  filingFiscalYear,
} from '../filing-registry';

export interface CompanyComplianceInput {
  framework: 'LSA' | 'CBCA';
  fyEndMonth: number;
  fyEndDay: number;
  incorporationDate: string | null;
  immatriculationDate: string | null;
  /**
   * RE-200 presumed-done signal (Harvey 2026-07-05). True when the company has
   * at least one CERTIFIED (satisfied) annual filing for a year strictly after
   * incorporation — which necessarily means its founding REQ dossier was already
   * initialized, so the initial declaration must NOT surface as an action. The
   * caller computes it from the completeness checklist; this feeder stays
   * record-agnostic (it receives the fact, it does not look filings up).
   */
  hasLaterAnnualFiling: boolean;
  /**
   * Federal-return clear-gate: true when the CURRENT-fiscal-year cbca_annual_return
   * receipt is already uploaded (satisfied). Skips the fed_annual_return push so the
   * row leaves the board once filed; when the next FY-end passes, the fiscal-year
   * anchor advances → new current-FY row (unsatisfied) → the push fires again. Same
   * record-agnostic pattern as hasLaterAnnualFiling — the caller derives it from the
   * checklist.
   */
  currentFedReturnFiled: boolean;
  /**
   * FIRST-annual-meeting proxy, condition (1): true when NO annual shareholders'
   * resolution has ever been recorded, for any year (see ANNUAL_MEETING_RECORD_KEYS).
   * Condition (2) — inc + 18mo still in the FUTURE — is applied INSIDE this feeder,
   * which already holds incorporationDate and today. BOTH are load-bearing; see the
   * annual_meeting push. Same record-agnostic pattern as the two flags above: the
   * caller derives it from the checklist, this feeder never looks anything up.
   */
  noPriorAnnualMeetingRecorded: boolean;
}

/**
 * Checklist requirement_keys whose presence RECORDS that an annual shareholders'
 * meeting happened (the resolution in lieu of meeting / its minutes). The caller
 * derives `noPriorAnnualMeetingRecorded` from these; the list is exported HERE, beside
 * the only rule that consumes it, so it cannot drift from its consumer. Not a filing —
 * deliberately NOT a FILING_REGISTRY entry (annual_meeting is exposure 'internal',
 * held in the book and never filed with a government).
 */
export const ANNUAL_MEETING_RECORD_KEYS: readonly string[] = [
  'lsaq_annual_shareholder_resolution',
  'cbca_annual_shareholder_resolution',
];

/**
 * Due-soon ranking window (days). PROVISIONAL — the real value is a Phase-3
 * ranking decision; 30 is a placeholder so deriveStatus has a clock to overlay.
 */
const DUE_SOON_WINDOW = 30;

// ─── Date helpers ────────────────────────────────────────────────────────────
// Local formatting helpers. The DATE-ANCHOR helpers (completedFiscalYearEnd,
// filingFiscalYear, addMonthsClamped) now live in filing-registry.ts — their single
// home now that lib/compliance is deleted — and are imported above.

function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ─── Feeder ──────────────────────────────────────────────────────────────────

export function deadlineObligations(
  input: CompanyComplianceInput,
  today: Date,
): Obligation[] {
  const { framework, fyEndMonth, fyEndDay, incorporationDate, immatriculationDate, hasLaterAnnualFiling, currentFedReturnFiled, noPriorAnnualMeetingRecorded } = input;
  const obligations: Obligation[] = [];

  // DISPLAY-year fallback: rows without a fiscal year (RE-200 initial declaration,
  // CBCA federal anniversary) use the incorporation year (Dom's ruling — same
  // treatment as foundational, plain year). Calendar rows (REQ update, annual
  // meeting) already carry o.year and never hit this fallback.
  const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;

  // Fiscal-year-END anchor + its label year — GUARDED. null until the company's
  // FIRST fiscal year has actually closed (completedFiscalYearEnd). The raw
  // calendar helper returned a PRE-INCORPORATION FY-end for a young company
  // (inc 2026-03-01 + Dec-31 year-end → 2025-12-31), which made every rule
  // anchored here emit a row for a fiscal year the company did not exist in,
  // marked OVERDUE. Each of the three consumers below DECLARES its own answer for
  // the null case — there is deliberately no shared default. The label year is
  // derived INSIDE each guard as a plain `number`, never hoisted as `number | null`,
  // so `String(fyYear)` can never bake the literal "null" into a row id.
  const fyEnd = completedFiscalYearEnd(fyEndMonth, fyEndDay, incorporationDate, today);

  // Shared builder. Every deadline here is base 'open' (unfulfilled) with a
  // calendar-absolute clock. weight follows STATE_WEIGHT semantics: an open
  // (not-yet-done) obligation is 0.0 complete.
  const push = (o: {
    ruleKey: string;
    yearSeg: string;
    year: number | null;
    dueDate: Date;
    exposure: 'external' | 'internal';
    actionKind: 'file_externally' | 'finalize';
    titleFr: string;
    titleEn: string;
    statutoryBasis: string;
    helpKey: string | null;
    copyKey?: string;
    requirementKey?: string; // upload attach-key — set on deadline rows that accept an uploaded receipt
    canUpload?: boolean;     // routes to A3Item's Upload SET branch
  }) => {
    const daysUntilDue = daysBetween(today, o.dueDate);
    // DISPLAY year: calendar rows carry o.year. Year-less rows fall back to the
    // incorporation year — EXCEPT anniversary-anchored rows (the federal annual
    // return): they are RECURRING and anniversary-anchored, so they carry NO year
    // segment even though `year` now holds the FISCAL year the receipt attaches to
    // (an attach-key, not a display fact — hence `null`, not o.year). RE-200
    // (yearSeg 'initial') keeps incYear — it IS the founding-year declaration.
    // Does NOT touch the obligation's own `year:` field below.
    const rowYear = o.yearSeg === 'anniversary' ? null : (o.year ?? incYear);
    obligations.push({
      id: `deadline:${o.ruleKey}:${o.yearSeg}`,
      source: 'deadline',
      titleFr: composeDisplayName(o.titleFr, null, rowYear),
      titleEn: composeDisplayName(o.titleEn, null, rowYear),
      descriptionFr: null,
      descriptionEn: null,
      status: deriveStatus('open', daysUntilDue, DUE_SOON_WINDOW),
      // Calendar-absolute clock: daysUntilDue<0 = past the legal deadline.
      liveness: computeLiveness({ daysUntilDue, legalWindowDays: null, year: o.year, today }),
      weight: 0, // open/unfulfilled — STATE_WEIGHT semantics (open = 0.0)
      dueDate: toISODateString(o.dueDate),
      triggeredBy: null,  // calendar-absolute, NOT event-relative (feeder 2's REQ case)
      deadlineDays: null, // "
      daysUntilDue,
      year: o.year,
      actionKind: o.actionKind,
      requirementKey: o.requirementKey ?? null,
      docKey: null,
      exposure: o.exposure,
      // A file_externally rule IS a government filing by definition; finalize
      // rules (annual_meeting) are held in the book, never filed → false. Derived
      // from actionKind, so every present + future external rule inherits it.
      hasFiling: o.actionKind === 'file_externally',
      statutoryBasis: o.statutoryBasis,
      helpKey: o.helpKey,
      copyKey: o.copyKey, // per-rule modal-copy namespace (registry) — only fed set today
      canUpload: o.canUpload, // deadline rows accepting an uploaded receipt (the fed return)
      fulfilled: false,
    });
  };

  // ── GOVERNMENT FILINGS (external · file_externally) ─────────────────────────

  // QC initial declaration (RE-200) — all QC-operating companies. One-time:
  // immatriculation + 60 days. Skipped when immatriculationDate is null (the
  // CBCA-registered-in-QC exact date is a banked data gap; the caller passes
  // companies.incorporation_date as the QC-LSA proxy).
  // Harvey 2026-07-05: a company with a later CERTIFIED annual filing has
  // necessarily initialized its founding REQ dossier — the initial declaration is
  // presumed satisfied and must never surface as "file now". hasLaterAnnualFiling
  // (from the caller) suppresses the emission entirely (Option 1: presumed done).
  if (immatriculationDate && !hasLaterAnnualFiling) {
    const rule = filingForRuleKey('qc_initial_declaration')!;
    const due = rule.dueDate!({ immatriculationDate, today }); // immatriculation + 60d
    if (due) {
      push({
        ruleKey: rule.ruleKey,
        yearSeg: 'initial',
        year: null,
        dueDate: due,
        exposure: 'external',
        actionKind: 'file_externally',
        titleFr: 'Déclaration initiale (RE-200)',
        titleEn: 'Initial Declaration (RE-200)',
        statutoryBasis: rule.statutoryBasis,
        helpKey: rule.helpKey,
      });
    }
  }

  // QC REQ annual update — all QC-operating companies. FY-end + 6 MONTHS.
  // CORRECTION: the deprecated engine used +4mo/day-15; Harvey verified +6mo.
  //
  // NULL-FY ANSWER (a) — no closed fiscal year → NO ROW. art. 45 LPLE ties the
  // annual update to a COMPLETED fiscal year (it is filed alongside the income tax
  // return); before one closes there is nothing to declare, so a due date here is
  // not merely early, it is fictional. NOTHING IS LOST: the completeness feeder
  // already emits a clock-less {lsaq,cbca}_req_annual_update row for the first
  // fiscal year, so the obligation stays visible as upcoming — it simply has no
  // deadline yet. When the first FY closes, this deadline twin appears at the SAME
  // year as that completeness row and OVERLAP_MERGE fires correctly for the first
  // time (it silently missed before: completeness half 2026 vs deadline half 2025,
  // no pair → the REQ update rendered TWICE).
  if (fyEnd) {
    const fyYear = fyEnd.getFullYear();
    const reqAnnual = filingForRuleKey('qc_req_annual_update')!;
    push({
      ruleKey: reqAnnual.ruleKey,
      yearSeg: String(fyYear),
      year: fyYear,
      dueDate: reqAnnual.dueDate!({ fyEnd, today })!, // FY-end + 6mo (registry)
      exposure: 'external',
      actionKind: 'file_externally',
      titleFr: 'Mise à jour annuelle au REQ',
      titleEn: 'REQ Annual Update',
      statutoryBasis: reqAnnual.statutoryBasis,
      helpKey: reqAnnual.helpKey,
    });
  }

  // Federal annual return (CBCA only) — incorporation anniversary month.
  // YELLOW (Harvey): the anniversary-month deadline is set administratively by
  // Corporations Canada, NOT by statute → flagged "à confirmer" + helpKey.
  // Needs incorporationDate to compute the anniversary; skipped when null.
  // Clear-gate: once the CURRENT-FY receipt is filed, the row leaves the board (it
  // rolls over automatically when the next FY-end passes — the fiscal-year anchor
  // advances). Dom's confirmed gap: between filing and the next FY-end, no
  // federal row shows (current done, next not yet due).
  if (framework === 'CBCA' && incorporationDate && !currentFedReturnFiled) {
    const fedRule = filingForRuleKey('fed_annual_return')!;
    // Next future incorporation anniversary (leap-year Feb-29 edge banked — rare,
    // and this rule is YELLOW). Computed by the registry rule.
    const anniv = fedRule.dueDate!({ incorporationDate, today });
    if (anniv) {
      push({
        ruleKey: fedRule.ruleKey,
        yearSeg: 'anniversary',
        // ANNIVERSARY clock (dueDate) but the FISCAL year is the receipt's attach-key
        // (upload → cbca_annual_return:{year}). Two axes, deliberately: the clock is
        // the anniversary, the attach-key is the fiscal year. No year segment is
        // shown (rowYear null for 'anniversary' — see push).
        //
        // NULL-FY ANSWER (c) — this push STILL FIRES. Its dueDate is anniversary-
        // anchored and wholly independent of the fiscal year, so it is correct even
        // before the first FY closes; only the ATTACH-KEY needed fixing.
        // filingFiscalYear returns the first UPCOMING fiscal year while none has
        // closed, never the phantom pre-incorporation one — and the year it returns
        // HAS a checklist row BY CONSTRUCTION, because it delegates to
        // fiscalYearForDate, the same function computeDefaultActiveYears uses to
        // build company_fiscal_years. That matters: the clear-gate matches on
        // (requirement_key, year), so a pre-incorporation attach-key was a receipt
        // that could never satisfy anything and a row that could never leave.
        year: filingFiscalYear(fyEndMonth, fyEndDay, incorporationDate, today),
        dueDate: anniv,
        exposure: 'external',
        actionKind: 'file_externally',
        titleFr: 'Rapport annuel — Corporations Canada',
        titleEn: 'Annual Return — Corporations Canada',
        statutoryBasis: fedRule.statutoryBasis,
        helpKey: fedRule.helpKey,
        copyKey: fedRule.copyKey,
        // Upload identity — makes the row take A3Item's Upload SET branch; the receipt
        // attaches to the current-FY completeness row (requirement_key + year).
        requirementKey: 'cbca_annual_return',
        canUpload: true,
      });
    }
  }

  // ── INTERNAL GOVERNANCE (internal · finalize — HOLD/RECORD, never file) ──────

  // Annual meeting / annual resolutions. INTERNAL: the user records these in the
  // minute book; they are never filed with a government.
  //
  // NULL-FY ANSWER (b) — no closed fiscal year → NO ROW (Dom 2026-07-25, on
  // Harvey's principled threshold): an annual meeting presents the financial
  // statements for a COMPLETED fiscal year, so before one closes there is nothing
  // to present and the meeting is not yet preparable. The 18-month first-meeting
  // deadline is not yet due either — and a not-yet-due obligation must NEVER
  // render as a lateness, which is exactly what the pre-incorporation FY-end
  // produced (a four-month-old company shown "Assemblée annuelle 2025", OVERDUE).
  if (fyEnd) {
    const fyYear = fyEnd.getFullYear();
    // FIRST meeting vs SUBSEQUENT — two DIFFERENT statutory limbs (Harvey
    // 2026-07-24, GREEN, verified word-for-word against both statutes).
    // art. 133(1) LCSA: (a) the first meeting ≤ 18 months after the corporation
    // comes into existence; (b) "subsequently / par la suite" ≤ 15 months after the
    // last AND ≤ 6 months after the preceding financial year end. "Subsequently"
    // opens (b) and governs everything in it, INCLUDING the 6-month cap — so NO
    // 6-month cap applies to a first meeting. art. 163 LSAQ carries the same
    // 18-month limb (the regimes CONVERGE for the first meeting).
    //
    // PREDICATE — both conditions required, both load-bearing:
    //   (1) noPriorAnnualMeetingRecorded — caller-derived (this feeder never looks
    //       anything up), AND
    //   (2) inc + 18mo still in the FUTURE relative to today.
    // (2) is the WICK GUARD. Wick (inc 2018) has inc+18mo ≈ 2020-02, long past, so
    // it can NEVER take this branch no matter what is recorded. Without (2), any
    // established company mid-onboarding — no resolutions uploaded yet — would be
    // handed a years-old due date and land in `remediate`.
    //
    // KNOWN EDGE (recorded, not solved): a company that held its first meeting on
    // paper but has not uploaded the resolution reads as "never met" and gets the
    // 18-month date. That is honest — we date from what we know — but it IS a
    // PROXY, not a derivation. Harvey recommends recording an actual last-meeting
    // date; BANKED. It would also feed the 15-month limb (uncomputable today, no
    // meeting-date column) and the federal annual return form, which asks for
    // exactly that date.
    const firstMeetingDue = incorporationDate
      ? addMonthsClamped(parseLocalDate(incorporationDate), 18)
      : null;
    const isFirstMeeting =
      noPriorAnnualMeetingRecorded && firstMeetingDue !== null && firstMeetingDue > today;
    push({
      ruleKey: 'annual_meeting',
      yearSeg: String(fyYear),
      year: fyYear,
      dueDate: isFirstMeeting && firstMeetingDue ? firstMeetingDue : addMonthsClamped(fyEnd, 6),
      exposure: 'internal',
      actionKind: 'finalize',
      titleFr: 'Assemblée annuelle / résolutions annuelles',
      titleEn: 'Annual meeting / annual resolutions',
      // CITATION follows the LIMB that produced the date, not just the framework
      // (Harvey's asymmetry finding, GREEN). art. 163 LSAQ has only TWO limbs —
      // 18 months, then 15 months after the previous meeting. There is NO 6-month
      // limb in the Québec meeting article at all: Québec's 6-month pressure is
      // art. 225 LSAQ, a constraint on the FINANCIAL STATEMENTS presented (they
      // must cover a fiscal year ended within the 6 months preceding the meeting),
      // NOT a convocation deadline. So an LSAQ row showing an fyEnd+6mo date must
      // surface art. 225 — citing art. 163 alone would show the user a statute that
      // does not contain the rule we are displaying. CBCA is untouched: art. 133
      // LCSA genuinely contains the 6-month limb in paragraph (b).
      statutoryBasis:
        framework === 'CBCA'
          ? 'art. 133 LCSA'
          : isFirstMeeting
            ? 'art. 163 LSAQ'
            : 'art. 163 LSAQ · délai pratique (art. 225 LSAQ)',
      helpKey: null,
    });
  }

  return obligations;
}
