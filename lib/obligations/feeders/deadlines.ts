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
import { parseLocalDate } from '@/lib/utils';

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
// Replicated from lib/compliance/calculateComplianceItems.ts (file-private
// there). Kept behavior-identical so this feeder's math matches the live engine
// — EXCEPT addMonthsClamped, which corrects a known overflow bug.

/** Verbatim from calculateComplianceItems.ts:13. */
function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Verbatim from calculateComplianceItems.ts:17. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Verbatim from calculateComplianceItems.ts:21. Despite the name, this returns
 * the most-recent PAST occurrence of (month/day) — i.e. the fiscal-year-END
 * anchor. The caller assigns it to `fyEnd`.
 */
function currentFiscalYearStart(month: number, day: number, today: Date): Date {
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  if (thisYear <= today) return thisYear;
  return new Date(today.getFullYear() - 1, month - 1, day);
}

/**
 * Add `months` to a date, CLAMPING the day to the target month's last day.
 * Corrects the deprecated engine's addMonths (calculateComplianceItems.ts:33),
 * whose raw Date.setMonth rolled a short-month overflow FORWARD 1–3 days
 * (e.g. Aug 31 + 6mo → Mar 3). Clamped: Aug 31 + 6mo → Feb 28/29. These are
 * Harvey-verified legal deadlines — they must be correct, not bug-matched.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const monthIndex = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
}

// ─── Feeder ──────────────────────────────────────────────────────────────────

export function deadlineObligations(
  input: CompanyComplianceInput,
  today: Date,
): Obligation[] {
  const { framework, fyEndMonth, fyEndDay, incorporationDate, immatriculationDate, hasLaterAnnualFiling } = input;
  const obligations: Obligation[] = [];

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
  }) => {
    const daysUntilDue = daysBetween(today, o.dueDate);
    obligations.push({
      id: `deadline:${o.ruleKey}:${o.yearSeg}`,
      source: 'deadline',
      titleFr: o.titleFr,
      titleEn: o.titleEn,
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
      statutoryBasis: o.statutoryBasis,
      helpKey: o.helpKey,
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
    const due = parseLocalDate(immatriculationDate);
    due.setDate(due.getDate() + 60); // true 60-day offset (day math, no clamp)
    push({
      ruleKey: 'qc_initial_declaration',
      yearSeg: 'initial',
      year: null,
      dueDate: due,
      exposure: 'external',
      actionKind: 'file_externally',
      titleFr: 'Déclaration initiale (RE-200)',
      titleEn: 'Initial Declaration (RE-200)',
      statutoryBasis: 'art. 38 LPLE',
      helpKey: null,
    });
  }

  // QC REQ annual update — all QC-operating companies. FY-end + 6 MONTHS.
  // CORRECTION: the deprecated engine used +4mo/day-15; Harvey verified +6mo.
  push({
    ruleKey: 'qc_req_annual_update',
    yearSeg: String(fyYear),
    year: fyYear,
    dueDate: addMonthsClamped(fyEnd, 6),
    exposure: 'external',
    actionKind: 'file_externally',
    titleFr: 'Mise à jour annuelle au REQ',
    titleEn: 'REQ Annual Update',
    statutoryBasis: 'art. 45 LPLE (RLRQ, c. P-44.1)',
    helpKey: null,
  });

  // Federal annual return (CBCA only) — incorporation anniversary month.
  // YELLOW (Harvey): the anniversary-month deadline is set administratively by
  // Corporations Canada, NOT by statute → flagged "à confirmer" + helpKey.
  // Needs incorporationDate to compute the anniversary; skipped when null.
  if (framework === 'CBCA' && incorporationDate) {
    const incDate = parseLocalDate(incorporationDate);
    // Anniversary in the current year; if already passed, roll to next year.
    // (Leap-year Feb-29 anniversary edge banked — rare, and this rule is YELLOW.)
    const anniv = new Date(today.getFullYear(), incDate.getMonth(), incDate.getDate());
    if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
    push({
      ruleKey: 'fed_annual_return',
      yearSeg: 'anniversary',
      year: null,
      dueDate: anniv,
      exposure: 'external',
      actionKind: 'file_externally',
      titleFr: 'Rapport annuel — Corporations Canada',
      titleEn: 'Annual Return — Corporations Canada',
      statutoryBasis: 'art. 263 LCSA (délai administratif — à confirmer)',
      helpKey: 'fed_annual_return_admin_date',
    });
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
