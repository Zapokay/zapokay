-- Phase 10A Atom 3: SHARE_TRANSFERS_GREENFIELD
-- Per LOCK-1 (sprint-10-phase-decomposition-2026-05-07.md §2.4)
-- Per LOCK-8 (4 indexes) and LOCK-9 (RLS mirroring shareholdings)

CREATE TABLE IF NOT EXISTS share_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  to_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  transfer_date DATE NOT NULL,
  quantity_transferred INTEGER NOT NULL,
  consideration TEXT,
  notes TEXT,
  resolution_document_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOCK-8: 4 indexes
CREATE INDEX IF NOT EXISTS idx_share_transfers_company_id
  ON share_transfers (company_id);
CREATE INDEX IF NOT EXISTS idx_share_transfers_transfer_date
  ON share_transfers (transfer_date);
CREATE INDEX IF NOT EXISTS idx_share_transfers_from_shareholding_id
  ON share_transfers (from_shareholding_id);
CREATE INDEX IF NOT EXISTS idx_share_transfers_to_shareholding_id
  ON share_transfers (to_shareholding_id);

-- LOCK-9: enable RLS + mirror shareholdings policy
-- Mirrored verbatim from Sub-task 1c capture:
--   shareholdings policy "Users can manage their own company shareholdings"
--   cmd=ALL, qual carries as-is (references company_id which is identical
--   on share_transfers), with_check=null. Policy name updated to reflect
--   target table per brief.
ALTER TABLE share_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company share transfers"
  ON share_transfers
  FOR ALL
  USING (
    company_id IN (
      SELECT companies.id
      FROM companies
      WHERE companies.user_id = auth.uid()
    )
  );
