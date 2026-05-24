-- =============================================================================
-- Phase 1B-CAPTURE Bundle 2 — Step 1.5 — activity_log event_type enum expansion
-- =============================================================================
-- Expands the `activity_log.event_type` CHECK enum from 18 → 22 values so the
-- edit-former modals + soft-delete affordance (Step 2 app-code) can write
-- first-class audit-log rows for legal-fact mutations rather than 23514-failing
-- silently (logActivity swallows insert errors). Migration chain 18 → 19.
--
-- Reference: docs/audit-history-phase-1b-capture-readiness-2026-05-23.md §10
--            (audit anticipated `*_edited` / `*_soft_deleted` event types).
-- Precedent: original 18-value CHECK landed in
--            supabase/migrations/20260508210035_create_activity_log.sql
--            (constraint name `activity_log_event_type_check` verified live
--            via pg_get_constraintdef on 2026-05-24).
--
-- Forward-only and additive-by-value:
--   - DROP CONSTRAINT IF EXISTS  (idempotent — no-op if already dropped)
--   - ADD CONSTRAINT with the original 18 values PLUS 4 new values (22 total).
--   - Every existing row's event_type is within the original 18 ⊂ 22, so no
--     existing row can violate the new constraint. ADD CONSTRAINT performs a
--     full-table scan to validate but does not rewrite or touch rows.
--   - Constraint name preserved verbatim (`activity_log_event_type_check`) so
--     future migrations and pg_constraint queries continue to find it.
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
    -- Phase 1B-CAPTURE Bundle 2 additions (4 new values)
    'director_edited'::text,
    'officer_edited'::text,
    'director_soft_deleted'::text,
    'officer_soft_deleted'::text
  ]));
