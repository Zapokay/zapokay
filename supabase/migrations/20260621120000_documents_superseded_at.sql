ALTER TABLE documents ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
COMMENT ON COLUMN documents.superseded_at IS 'Timestamp when status was set to superseded; NULL for legacy pre-Part3 rows (never auto-purged). Anchors the 10-day hard-purge buffer (#135 Part 3).';
