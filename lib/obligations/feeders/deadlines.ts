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
  currentFiscalYearStart,
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
}

/**
 * Due-soon ranking window (days). PROVISIONAL — the real value is a Phase-3
 * ranking decision; 30 is a placeholder so deriveStatus has a clock to overlay.
 */
const DUE_SOON_WINDOW = 30;

// ─── Date helpers ────────────────────────────────────────────────────────────
// Local formatting helpers. The DATE-ANCHOR helpers (currentFiscalYearStart,
// addMonthsClamped) now live in filing-registry.ts — their single home now that
// lib/compliance is deleted — and are imported above.

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
  const { framework, fyEndMonth, fyEndDay, incorporationDate, immatriculationDate, hasLaterAnnualFiling } = input;
  const obligations: Obligation[] = [];

  // DISPLAY-year fallback: rows without a fiscal year (RE-200 initial declaration,
  // CBCA federal anniversary) use the incorporation year (Dom's ruling — same
  // treatment as foundational, plain year). Calendar rows (REQ update, annual
  // meeting) already carry o.year and never hit this fallback.
  const incYear = incorporationDate ? parseLocalDate(incorporationDate).getFullYear() : null;

  // Fiscal-year-END anchor (most recent past FY end) + its label year.
  const fyEnd = currentFiscalYearStart(fyEndMonth, fyEndDay, today);
  const fyYear = fyEnd.getFullYear();

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
  }) => {
    const daysUntilDue = daysBetween(today, o.dueDate);
    // DISPLAY year: calendar rows carry o.year. Year-less rows fall back to the
    // incorporation year — EXCEPT anniversary-anchored rows (the federal annual
    // return), which are RECURRING, not a founding-year filing: showing "· 2018"
    // beside a 2026 due date misleads, so they carry NO year segment. RE-200
    // (yearSeg 'initial') keeps incYear — it IS the founding-year declaration.
    // Does NOT touch the obligation's own `year:` field below.
    const rowYear = o.yearSeg === 'anniversary' ? o.year : (o.year ?? incYear);
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
      requirementKey: null,
      docKey: null,
      exposure: o.exposure,
      // A file_externally rule IS a government filing by definition; finalize
      // rules (annual_meeting) are held in the book, never filed → false. Derived
      // from actionKind, so every present + future external rule inherits it.
      hasFiling: o.actionKind === 'file_externally',
      statutoryBasis: o.statutoryBasis,
      helpKey: o.helpKey,
      copyKey: o.copyKey, // per-rule modal-copy namespace (registry) — only fed set today
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

  // Federal annual return (CBCA only) — incorporation anniversary month.
  // YELLOW (Harvey): the anniversary-month deadline is set administratively by
  // Corporations Canada, NOT by statute → flagged "à confirmer" + helpKey.
  // Needs incorporationDate to compute the anniversary; skipped when null.
  if (framework === 'CBCA' && incorporationDate) {
    const fedRule = filingForRuleKey('fed_annual_return')!;
    // Next future incorporation anniversary (leap-year Feb-29 edge banked — rare,
    // and this rule is YELLOW). Computed by the registry rule.
    const anniv = fedRule.dueDate!({ incorporationDate, today });
    if (anniv) {
      push({
        ruleKey: fedRule.ruleKey,
        yearSeg: 'anniversary',
        year: null,
        dueDate: anniv,
        exposure: 'external',
        actionKind: 'file_externally',
        titleFr: 'Rapport annuel — Corporations Canada',
        titleEn: 'Annual Return — Corporations Canada',
        statutoryBasis: fedRule.statutoryBasis,
        helpKey: fedRule.helpKey,
        copyKey: fedRule.copyKey,
      });
    }
  }

  // ── INTERNAL GOVERNANCE (internal · finalize — HOLD/RECORD, never file) ──────

  // Annual meeting / annual resolutions — practical due date FY-end + 6 months
  // (the binding constraint on the financials presented; art. 133 LCSA /
  // art. 163 LSAQ + art. 225 LSAQ). INTERNAL: the user records these in the
  // minute book; they are never filed with a government.
  push({
    ruleKey: 'annual_meeting',
    yearSeg: String(fyYear),
    year: fyYear,
    dueDate: addMonthsClamped(fyEnd, 6),
    exposure: 'internal',
    actionKind: 'finalize',
    titleFr: 'Assemblée annuelle / résolutions annuelles',
    titleEn: 'Annual meeting / annual resolutions',
    statutoryBasis: framework === 'CBCA' ? 'art. 133 LCSA' : 'art. 163 LSAQ',
    helpKey: null,
  });

  return obligations;
}
