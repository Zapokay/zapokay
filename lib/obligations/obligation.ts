/**
 * A3 generalized obligation contract — the universal shape every signal
 * feeder normalizes into. Design: a3-obligation-contract-design-2026-07-02.md
 * ADDITIVE: ObligationNotice (req-obligations.ts) is NOT modified; the REQ
 * feeder translates ObligationNotice -> Obligation.
 * Do NOT import either existing ComplianceStatus (complianceRules.ts / lib/types.ts).
 */

// TYPE-ONLY import, deliberately: it is erased at compile, so this contract stays a
// runtime leaf and the new obligation.ts → obligation-registry.ts edge costs nothing in any
// bundle. All four importers of this file are themselves `import type`.
import type { CopyKey } from './obligation-registry';

export type ObligationSource =
  | 'completeness'
  | 'req_filing'
  | 'event'        // A-2 — event-document feeder (Stage 1 = the doc; Stage 2 = its REQ filing)
  | 'deadline'
  | 'ai_anomaly'   // FUTURE - no emitter today
  | 'lawyer_rule'; // FUTURE

export type ObligationStatus = 'satisfied' | 'to_finalize' | 'open' | 'due_soon' | 'overdue';

/** Harvey 2026-07-05 three-state liveness axis. See the `liveness` field below. */
export type ObligationLiveness = 'live' | 'regularize' | 'remediate';

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
  /**
   * Harvey 2026-07-05 three-state liveness. live = within its legal window
   * ('à faire maintenant'). regularize = past its own legal deadline but
   * catch-up-able ('régularisation'). remediate = prolonged default, potential
   * company-status problem ('consulter un professionnel'). Orthogonal to status
   * (completion/clock). The 1→2 flip = the obligation's own legal deadline
   * expiring (GREEN, per-obligation). The 2→3 threshold is YELLOW — lawyer-pending
   * (Harvey's ~2yr convention, tied to REQ striking-off power).
   */
  liveness: ObligationLiveness;
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
  // true = satisfying this obligation requires a filing OUTSIDE ZapOkay (a
  // government filing). INDEPENDENT of `exposure` (which classifies the
  // obligation and drives RANKING — rank.ts) and of `actionKind`: a row can need
  // BOTH an in-app document AND an external filing. That is exactly the Stage-1
  // roster event (exposure 'internal', but the act must still be filed at the REQ)
  // and the merged REQ annual-update row. Gates the board's filing marker + how-to
  // pill on what the row IS, not which feeder/stage emitted it. Optional: feeders
  // that carry no filing omit it (undefined ≡ false).
  hasFiling?: boolean;
  statutoryBasis: string | null;
  helpKey: string | null;
  // Per-rule modal-copy namespace under obligationNotice.* (title/body). Display
  // metadata, stamped by the feeder from the obligation registry's `copyKey`. Optional:
  // only rows needing copy that differs from the default art. 41 roster text set it
  // (today: the federal annual return). Absent → the default req.* copy.
  copyKey?: CopyKey;
  fulfilled: boolean;            // inert v1 seam for the deferred resolved-state
  // Phase B-2 — completeness-row button-set inputs (the A3 board decides Upload/
  // Generate/Regenerate/Replace per state). Optional: ONLY the completeness feeder
  // sets them; req/deadline feeders omit them (those rows get no upload/generate).
  canUpload?: boolean;
  canGenerate?: boolean;
  docSource?: 'uploaded' | 'generated' | null; // distinguishes généré from uploaded-WIP
  // A-2 — event linkage. Set ONLY by the event feeder; carries the act identity
  // triple so the board row can drive useEventGenerate / useRowUpload's `event`
  // source and re-find the act by (event_type, event_id, event_phase). Optional +
  // nullable so completeness / deadline / req feeders are unaffected (same pattern
  // as canUpload/canGenerate/docSource above).
  eventLink?: { event_type: string; event_id: string; event_phase: string } | null;
}
