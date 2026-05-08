-- =============================================================================
-- Sprint 10A Batch 2 — Foundation Backfill (file 3 of 4)
-- Table: activity_log
-- =============================================================================
-- Backfills the production-only `activity_log` table (CREATE only — no seed)
-- so a fresh database recreation reproduces the live shape. Original DDL was
-- applied via Supabase Dashboard SQL Editor and never landed in source control.
--
-- Audit reference: docs/schema-drift-audit-2026-05-07.md §4.6 item #11
-- Investigation:   docs/audit-batch2-foundation-backfill-2026-05-08.md §3.3
--
-- Forward-only and idempotent:
--   - CREATE TABLE IF NOT EXISTS  (no-op against the live table holding 163+ rows)
--   - CREATE INDEX IF NOT EXISTS  (no-op for both indexes)
--   - ENABLE ROW LEVEL SECURITY    (no-op if already enabled)
--   - Policies guarded by EXCEPTION WHEN duplicate_object
--
-- Tenant data preservation: this migration touches no rows. The CREATE TABLE
-- IF NOT EXISTS clause guarantees no rewrite, and there is no INSERT/UPDATE/
-- DELETE/ALTER on the live table.
--
-- Notes on shape:
--   - event_type CHECK enumerates 18 values, captured verbatim from
--     pg_constraint.pg_get_constraintdef() on 2026-05-08.
--   - FK on company_id is ON DELETE CASCADE.
--   - FK on user_id is ON DELETE SET NULL (nullable column, audit trail
--     should survive user deletion).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_log (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL,
  user_id    uuid,
  event_type text        NOT NULL,
  title_fr   text        NOT NULL,
  title_en   text        NOT NULL,
  details    jsonb                DEFAULT '{}'::jsonb,
  created_at timestamptz          DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT activity_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT activity_log_event_type_check
    CHECK (event_type = ANY (ARRAY[
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
      'settings_updated'::text
    ]))
);

-- ---------------------------------------------------------------------------
-- Section 2 — Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_activity_log_company
  ON activity_log(company_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON activity_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- Section 3 — Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY activity_log_read_own
    ON activity_log
    FOR SELECT
    USING (
      company_id IN (
        SELECT companies.id
        FROM companies
        WHERE companies.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY activity_log_insert_own
    ON activity_log
    FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT companies.id
        FROM companies
        WHERE companies.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
