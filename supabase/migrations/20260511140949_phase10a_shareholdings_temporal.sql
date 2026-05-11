-- Phase 10A Atom 4: SHAREHOLDER_TEMPORAL_COUPLED
-- Per LOCK-2 (sprint-10-phase-decomposition §2.4) and reconciled LOCK-7
-- 5 column adds to shareholdings + CHECK constraint on end_reason

ALTER TABLE shareholdings
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS end_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'direct_issuance',
  ADD COLUMN IF NOT EXISTS certificate_old TEXT NULL,
  ADD COLUMN IF NOT EXISTS certificate_new TEXT NULL;

-- end_reason enum constraint (per LOCK-2: 4-value enum)
-- Per §8.10 DO $$ block pattern for constraint operations
DO $$
BEGIN
  ALTER TABLE shareholdings DROP CONSTRAINT IF EXISTS shareholdings_end_reason_check;
  ALTER TABLE shareholdings ADD CONSTRAINT shareholdings_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('transfer','redemption','cancellation','conversion'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'shareholdings_end_reason_check: %', SQLERRM;
END $$;
