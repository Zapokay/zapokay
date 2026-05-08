-- =============================================================================
-- Sprint 10A Batch 2 — Foundation Backfill (file 4 of 4)
-- Table: company_fiscal_years
-- =============================================================================
-- Backfills the production-only `company_fiscal_years` table (CREATE only —
-- no seed) so a fresh database recreation reproduces the live shape. Original
-- DDL was applied via Supabase Dashboard SQL Editor and never landed in
-- source control.
--
-- Audit reference: docs/schema-drift-audit-2026-05-07.md §4.6 item #3
-- Investigation:   docs/audit-batch2-foundation-backfill-2026-05-08.md §3.4
--
-- Forward-only and idempotent:
--   - CREATE TABLE IF NOT EXISTS  (no-op against the live table holding 32+ rows)
--   - ENABLE ROW LEVEL SECURITY    (no-op if already enabled)
--   - Policy guarded by EXCEPTION WHEN duplicate_object
--
-- Tenant data preservation: this migration touches no rows. The CREATE TABLE
-- IF NOT EXISTS clause guarantees no rewrite, and there is no INSERT/UPDATE/
-- DELETE/ALTER on the live table.
--
-- Notes on shape:
--   - UNIQUE(company_id, year) enforces one row per fiscal year per company.
--   - status CHECK enforces ('active', 'archived'); default 'active'.
--   - FK on company_id is ON DELETE CASCADE (fiscal years die with company).
--   - Live policy "Users own fiscal years" is FOR ALL (not split SELECT/INSERT
--     like activity_log) — preserved verbatim.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_fiscal_years (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL,
  year       integer     NOT NULL,
  status     text        NOT NULL DEFAULT 'active',
  created_at timestamptz          DEFAULT now(),
  CONSTRAINT company_fiscal_years_pkey PRIMARY KEY (id),
  CONSTRAINT company_fiscal_years_company_id_year_key
    UNIQUE (company_id, year),
  CONSTRAINT company_fiscal_years_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT company_fiscal_years_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]))
);

-- ---------------------------------------------------------------------------
-- Section 2 — Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE company_fiscal_years ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users own fiscal years"
    ON company_fiscal_years
    FOR ALL
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
