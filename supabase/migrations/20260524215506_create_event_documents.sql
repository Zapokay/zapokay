-- =============================================================================
-- #19 foundation — event_documents (M:N link between documents and events)
-- =============================================================================
-- Generic polymorphic join enabling lifecycle-history events
-- (director_mandate / officer_appointment / shareholding / share_transfer) to
-- reference the document(s) that evidence them. Powers #19c (event-aware
-- completeness) and #19d (lifecycle PDF generation).
--
-- Chain advances 19 → 20 (predecessor:
--   20260524190548_phase1b_capture_activity_log_event_types.sql).
--
-- Architectural locks:
--   - Polymorphic event reference (event_type CHECK + event_id UUID; NO cross-
--     table FK). Mirrors the "type tag + opaque id" style; cross-table delete
--     integrity is intentionally not enforced at the DB level (Phase 10B
--     as-of-date concerns + 4 disparate event tables make a real FK infeasible).
--   - Denormalized company_id (NOT NULL, FK to companies) for RLS performance
--     and per-tenant scoping. Convention follows existing per-company tables.
--   - RLS policy copied VERBATIM from Phase 10A.5 atom 1
--     (supabase/migrations/20260514101627_..._entity_typed_shareholders.sql):
--       company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())
--   - UNIQUE (document_id, event_type, event_id) prevents duplicate links.
--   - Indexes: (event_type, event_id) for completeness lookups; (document_id)
--     for reverse lookups.
--
-- Existing partial precedent: share_transfers.resolution_document_id (1:1
-- nullable FK to documents). LEFT IN PLACE — flagged for later deprecation
-- once event_documents is the single read path. Backfill below copies any
-- non-null values into the generic table.
--
-- Forward-only and idempotent: CREATE TABLE IF NOT EXISTS; ON CONFLICT DO
-- NOTHING on backfill. Tenant data preservation: no destructive operation;
-- no existing column is dropped or altered.
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'director_mandate',
    'officer_appointment',
    'shareholding',
    'share_transfer'
  )),
  event_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, event_type, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_documents_event
  ON event_documents(event_type, event_id);

CREATE INDEX IF NOT EXISTS idx_event_documents_document_id
  ON event_documents(document_id);

ALTER TABLE event_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company event documents"
  ON event_documents FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- BACKFILL — copy existing share_transfers.resolution_document_id links
-- ---------------------------------------------------------------------------
-- As of investigation 2026-05-24: 0 rows have resolution_document_id IS NOT
-- NULL, so this INSERT is effectively a no-op today. Included for forward
-- consistency in case rows land between this migration's authoring and
-- production deploy. ON CONFLICT DO NOTHING handles re-runs.
INSERT INTO event_documents (document_id, event_type, event_id, company_id)
SELECT resolution_document_id, 'share_transfer', id, company_id
FROM share_transfers
WHERE resolution_document_id IS NOT NULL
ON CONFLICT (document_id, event_type, event_id) DO NOTHING;
