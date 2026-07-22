-- =============================================================================
-- Part B — event_filings (records the government filing done for a roster act)
-- =============================================================================
-- One row = "the REQ filing for this lifecycle act has been produced." The A3
-- board's Stage-2 obligation (file_externally, art. 41 LPLE) and the Complétude
-- "Formalité à produire" marker both read this: a filed act drops the board's
-- Stage-2 item entirely and loses the Complétude marker (the act ROW stays —
-- Complétude is inventory). "filed" was hardcoded false until this table exists.
--
-- Mirrors event_documents (20260524215506 + 20260524221747_event_documents_
-- event_phase) VERBATIM, minus document_id: a filing is keyed to the ACT
-- (event_type, event_id, event_phase), not to a document, and is 1:1 with the
-- act (not 1:N like documents), so the natural key is the act triple.
--
-- Architectural locks (same as event_documents):
--   - Polymorphic event reference (event_type CHECK + event_id UUID; NO cross-
--     table FK — the "type tag + opaque id" style, cross-table integrity not
--     enforced at the DB level per the 4-disparate-event-tables constraint).
--   - Denormalized company_id (NOT NULL, FK to companies) for RLS + per-tenant
--     scoping.
--   - RLS policy copied VERBATIM from event_documents:
--       company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
--   - event_phase CHECK copied VERBATIM from event_documents_event_phase (all
--     four act types). Roster-only is an APP rule (the feeder gates on
--     obligationsForDocKey); the schema does not duplicate it, matching how
--     event_documents accepts all four types.
--
-- Rulings baked in:
--   - NO filed_by. No *_by column exists in any of the 33 prior migrations; the
--     repo's audit answer is activity_log, and event_documents carries none. The
--     filer is implicit via company_id -> companies.user_id (single-owner model).
--   - company_id is a COLUMN (RLS keys on it) but NOT in the UNIQUE: event_id is
--     a UUID, so (event_type, event_id, event_phase) is already globally unique.
--     Mirrors event_documents, whose UNIQUE also excludes company_id.
--   - filed_at TIMESTAMPTZ NOT NULL DEFAULT NOW() — the universal temporal-table
--     timestamp convention (share_transfers, event_documents).
--
-- Forward-only and idempotent: CREATE TABLE IF NOT EXISTS; CREATE INDEX IF NOT
-- EXISTS. Non-destructive: no existing column dropped or altered. Ships EMPTY —
-- nothing writes to it until Part B-2 adds the filing button.
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'director_mandate',
    'officer_appointment',
    'shareholding',
    'share_transfer'
  )),
  event_id UUID NOT NULL,
  event_phase TEXT NOT NULL CHECK (
    (event_type = 'director_mandate'    AND event_phase IN ('appointment','departure')) OR
    (event_type = 'officer_appointment' AND event_phase IN ('appointment','departure')) OR
    (event_type = 'shareholding'        AND event_phase IN ('issuance','cessation'))    OR
    (event_type = 'share_transfer'      AND event_phase = 'transfer')
  ),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, event_id, event_phase)
);

CREATE INDEX IF NOT EXISTS idx_event_filings_event
  ON event_filings(event_type, event_id);

CREATE INDEX IF NOT EXISTS idx_event_filings_company_id
  ON event_filings(company_id);

ALTER TABLE event_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company event filings"
  ON event_filings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
