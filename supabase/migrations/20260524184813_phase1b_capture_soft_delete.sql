-- =============================================================================
-- Phase 1B-CAPTURE Bundle 2 — Step 1 — SOFT-DELETE column
-- =============================================================================
-- Adds a nullable `deleted_at TIMESTAMPTZ` soft-delete column to BOTH
-- people-history tables. This is the FIRST schema change since LOCK-3
-- (Phase 10A foundation). Migration chain advances 17 → 18.
--
-- Audit reference: docs/audit-history-phase-1b-capture-readiness-2026-05-23.md §8
-- Precedent:       supabase/migrations/20260508210425_create_company_fiscal_years.sql
--                  (TIMESTAMPTZ NULL soft-delete convention)
--
-- Forward-only and idempotent:
--   - ADD COLUMN IF NOT EXISTS  (no-op against any pre-existing column)
--   - No DEFAULT (NULL is the default; existing rows get NULL)
--   - No INDEX (deferred per audit §8c — revisit on real perf data)
--   - No RLS change (column lives under existing per-company RLS — audit §8e)
--
-- Tenant data preservation: this migration touches no rows. ADD COLUMN with
-- no DEFAULT does not rewrite the table; PostgreSQL stores the column as
-- NULL for all existing rows without a heap rewrite.
--
-- App-layer convention (Step 2 brief — NOT this migration):
--   On soft-delete: UPDATE ... SET deleted_at = NOW(), is_active = false WHERE id = ?
--   Existing `.eq('is_active', true)` filters then automatically exclude
--   soft-deleted rows from active-state consumers. Former-section partitioning
--   + binder register API (4 leak sites per audit §8d) require explicit
--   `.is('deleted_at', null)` filters; those changes ship in Step 2.
-- =============================================================================

ALTER TABLE director_mandates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE officer_appointments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
