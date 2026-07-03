/**
 * A3 generalized obligation contract — the universal shape every signal
 * feeder normalizes into. Design: a3-obligation-contract-design-2026-07-02.md
 * ADDITIVE: ObligationNotice (req-obligations.ts) is NOT modified; the REQ
 * feeder translates ObligationNotice -> Obligation.
 * Do NOT import either existing ComplianceStatus (complianceRules.ts / lib/types.ts).
 */

export type ObligationSource =
  | 'completeness'
  | 'req_filing'
  | 'deadline'
  | 'ai_anomaly'   // FUTURE - no emitter today
  | 'lawyer_rule'; // FUTURE

export type ObligationStatus = 'satisfied' | 'to_finalize' | 'open' | 'due_soon' | 'overdue';

export type ObligationAction =
  | 'generate'
  | 'upload'
  | 'finalize'
  | 'file_externally'
  | 'review'  // FUTURE
  | 'none';

export type ExposureClass = 'external' | 'internal';

export interface Obligation {
  id: string;                    // stable, feeder-namespaced: "completeness:annual_board_resolution:2025"
  source: ObligationSource;
  titleFr: string | null;  // null = label not yet available (lawyer-pending REQ copy); UI supplies label from i18n
  titleEn: string | null;  // null = label not yet available (lawyer-pending REQ copy); UI supplies label from i18n
  descriptionFr: string | null;
  descriptionEn: string | null;
  status: ObligationStatus;
  weight: number;                // 0.0-1.0, preserves STATE_WEIGHT semantics
  dueDate: string | null;        // absolute ISO 'YYYY-MM-DD'
  triggeredBy: string | null;    // event key starting a relative clock
  deadlineDays: number | null;   // relative offset, pairs with triggeredBy
  daysUntilDue: number | null;   // THE ranking number, whichever clock model
  year: number | null;           // fiscal year; null = foundational
  actionKind: ObligationAction;
  requirementKey: string | null;
  docKey: string | null;
  exposure: ExposureClass;
  statutoryBasis: string | null;
  helpKey: string | null;
  fulfilled: boolean;            // inert v1 seam for the deferred resolved-state
}
