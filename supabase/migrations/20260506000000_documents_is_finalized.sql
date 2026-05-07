-- Phase B Batch B1 — documents.is_finalized
-- Adds an explicit "user-certified as final and signed" flag on documents.
--
-- Set to TRUE when the user uploads a document via the unified upload modal
-- and checks the certification box ("I certify this document is final and
-- signed by all required parties").
--
-- Phase B writes this column. Phase C will read it to gate Binder visibility.
--
-- Default: FALSE. No backfill: test data only at this stage, regenerated via
-- the pre-launch test data purge. Existing rows default to FALSE on migration.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE;
