-- =============================================================================
-- #19c prep — event_documents.event_phase (act-granular link refinement)
-- =============================================================================
-- event_documents links a document to an event ROW, but a single mandate /
-- appointment row encodes TWO documentable acts (appointment + departure);
-- shareholdings encode issuance + cessation. To let #19c score "departure
-- documented but appointment not" (and vice versa), the link must record WHICH
-- act of the event row it evidences.
--
-- This atom:
--   1. Adds event_phase TEXT NOT NULL (safe: table empty as of 2026-05-24).
--   2. Adds a CHECK constraint pinning valid event_phase values per event_type.
--   3. Replaces the uniqueness grain to include event_phase, so the same
--      document can legitimately evidence two phases of the same event row
--      (e.g. one PV that covers both appointment + departure).
--   4. Adds idx_event_documents_company_id to support #19c's per-company
--      lookup pattern.
--
-- Chain advances 20 → 21 (predecessor:
--   20260524215506_create_event_documents.sql).
--
-- Tenant data preservation: event_documents is empty (verified via
-- supabase-js smoke select pre-write); NOT NULL add + UNIQUE swap are
-- zero-risk. No rows to backfill.
--
-- Constraint-name rationale: the existing UNIQUE was inline in CREATE TABLE,
-- so Postgres auto-named it deterministically as
--   event_documents_document_id_event_type_event_id_key
-- per its <table>_<col1>_<col2>_..._key convention. DROP uses IF EXISTS as
-- belt-and-suspenders.
-- =============================================================================

ALTER TABLE event_documents
  ADD COLUMN event_phase TEXT NOT NULL;

ALTER TABLE event_documents
  ADD CONSTRAINT event_documents_type_phase_check CHECK (
    (event_type = 'director_mandate'    AND event_phase IN ('appointment','departure')) OR
    (event_type = 'officer_appointment' AND event_phase IN ('appointment','departure')) OR
    (event_type = 'shareholding'        AND event_phase IN ('issuance','cessation'))    OR
    (event_type = 'share_transfer'      AND event_phase = 'transfer')
  );

ALTER TABLE event_documents
  DROP CONSTRAINT IF EXISTS event_documents_document_id_event_type_event_id_key;

ALTER TABLE event_documents
  ADD CONSTRAINT event_documents_document_event_phase_key
  UNIQUE (document_id, event_type, event_id, event_phase);

CREATE INDEX IF NOT EXISTS idx_event_documents_company_id
  ON event_documents(company_id);
