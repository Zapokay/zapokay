-- =============================================================================
-- Sprint 10A Batch 3 — Foundation backfill of pre-existing production columns.
-- Table: documents
-- =============================================================================
-- This migration codifies the live structure of `documents` into committed
-- migration source. Forward-only, idempotent, zero structural change to prod.
--
-- Reference: docs/schema-drift-audit-2026-05-07.md §4.6 items #5 + #9 + #12
-- Investigation: docs/audit-batch3-documents-drift-backfill-2026-05-10.md
--
-- Scope (locked 2026-05-10 by Dom):
--   - 17 column ADDs via ALTER TABLE … ADD COLUMN IF NOT EXISTS
--   - 3 CHECK constraints (minute_book_section, signature_status, source)
--     codified verbatim from pg_get_constraintdef() Phase A capture
--   - 1 FK index (idx_documents_company_id) closing §4.6 #9
--
-- Tenant data preservation: zero INSERT/UPDATE/DELETE. ADD COLUMN IF NOT EXISTS
-- is a no-op against existing columns (emits NOTICE 42701). The 42 production
-- rows in documents are untouched.
--
-- Notes on shape:
--   - status column reproduced WITHOUT CHECK constraint. Phase A confirmed prod
--     has no CHECK on status; default 'active' only. Adding a CHECK now would
--     be a structural change banned by Batch 3 anti-asks.
--   - catch_up_session_id column reproduced WITHOUT FK. The FK in prod points
--     to catch_up_sessions, which is itself off-repo (audit §1 DOC-ONLY).
--     Reproducing the FK before its target table is committed would create a
--     phantom dependency. FK is deferred to whichever batch tracks-in
--     catch_up_sessions.
--   - source CHECK encodes all 3 prod values verbatim ('uploaded', 'generated',
--     'imported') even though application code references only the first two.
--     Per Batch 2 lesson: CHECK can outlive seed/usage rows. Pruning is a
--     separate decision.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — Column ADDs (17 columns)
-- ---------------------------------------------------------------------------
-- Listed in prod ordinal order (positions 11–27, between is_finalized=28's
-- prior position and the committed 1–10 baseline). Aligned with Phase A.3.1.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name             text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size             integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status                text DEFAULT 'active';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_year         integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS fiscal_year           text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary_fr         jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_summary_en         jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source                text DEFAULT 'uploaded';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS generated_for_year    integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS catch_up_session_id   uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS requirement_key       text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS requirement_year      integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS minute_book_section   text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signature_status      text DEFAULT 'draft';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signed_at             timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signed_version_url    text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signatories_confirmed jsonb;

-- ---------------------------------------------------------------------------
-- Section 2 — CHECK constraints (3 off-repo CHECKs codified)
-- ---------------------------------------------------------------------------
-- Verbatim from pg_get_constraintdef() captured 2026-05-10 (Phase A.3.2).
-- Each block is wrapped in DO $$ … EXCEPTION WHEN duplicate_object so that
-- re-running on a database where the constraint already exists is a no-op
-- (Postgres raises SQLSTATE 42710 for "constraint already exists").

DO $$
BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_minute_book_section_check
    CHECK (minute_book_section = ANY (ARRAY[
      'statuts'::text,
      'avis'::text,
      'reglements'::text,
      'resolutions'::text,
      'administrateurs'::text,
      'dirigeants'::text,
      'actionnaires'::text,
      'registres'::text
    ]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_signature_status_check
    CHECK (signature_status = ANY (ARRAY[
      'draft'::text,
      'pending_signature'::text,
      'signed'::text
    ]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE documents
    ADD CONSTRAINT documents_source_check
    CHECK (source = ANY (ARRAY[
      'uploaded'::text,
      'generated'::text,
      'imported'::text
    ]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Section 3 — Indexes (1 FK index, closes §4.6 #9)
-- ---------------------------------------------------------------------------
-- documents.company_id is the most-queried FK in the application. Currently
-- prod has no index on this column, so every documents-list query is a
-- sequential scan. This index closes §4.6 #9.

CREATE INDEX IF NOT EXISTS idx_documents_company_id
  ON documents(company_id);
