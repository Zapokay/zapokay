-- =============================================================================
-- #19d Phase 3 (cessation) — activity_log event_type enum expansion
-- =============================================================================
-- Expands the `activity_log.event_type` CHECK enum from 22 → 24 values so the
-- share-cessation modal + edit-former-shareholding modal can write first-class
-- audit-log rows for shareholding lifecycle mutations rather than 23514-failing
-- silently (logActivity swallows insert errors).
--
-- Precedent: 22-value CHECK landed in
--            supabase/migrations/20260524190548_phase1b_capture_activity_log_event_types.sql
--            (constraint name `activity_log_event_type_check` preserved).
--
-- Scope decision (Phase 0c investigation, 2026-05-26):
--   - shareholdings has NO `deleted_at` / NO `is_active` column (Phase 10A
--     Atom 4 invariant — "former" derived purely from end_date IS NOT NULL).
--   - Therefore NO `shareholding_soft_deleted` value is added — there is no
--     soft-delete affordance to emit it.
--   - Two values added:
--       * `shareholding_ended`  — written by EndShareholdingModal on cessation
--       * `shareholding_edited` — written by EditFormerShareholdingModal
--
-- Forward-only and additive-by-value:
--   - DROP CONSTRAINT IF EXISTS  (idempotent — no-op if already dropped)
--   - ADD CONSTRAINT with the original 22 values PLUS 2 new values (24 total).
--   - Every existing row's event_type is within the original 22 ⊂ 24, so no
--     existing row can violate the new constraint. ADD CONSTRAINT performs a
--     full-table scan to validate but does not rewrite or touch rows.
--   - Constraint name preserved verbatim (`activity_log_event_type_check`).
--   - No DEFAULT change, no column change, no index change, no RLS change.
-- =============================================================================

ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    -- Original 18 values (verbatim from 20260508210035_create_activity_log.sql)
    'document_uploaded'::text,
    'document_generated'::text,
    'document_deleted'::text,
    'director_added'::text,
    'director_removed'::text,
    'officer_added'::text,
    'officer_removed'::text,
    'officer_replaced'::text,
    'shareholder_added'::text,
    'shares_issued'::text,
    'share_class_created'::text,
    'company_created'::text,
    'company_updated'::text,
    'fiscal_year_activated'::text,
    'fiscal_year_archived'::text,
    'compliance_item_completed'::text,
    'wizard_completed'::text,
    'settings_updated'::text,
    -- Phase 1B-CAPTURE Bundle 2 additions (4 values)
    'director_edited'::text,
    'officer_edited'::text,
    'director_soft_deleted'::text,
    'officer_soft_deleted'::text,
    -- #19d Phase 3 cessation additions (2 values)
    'shareholding_ended'::text,
    'shareholding_edited'::text
  ]));
