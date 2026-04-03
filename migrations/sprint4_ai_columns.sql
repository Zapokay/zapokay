-- Sprint 4 — AI columns for document summaries
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS ai_summary_fr JSONB,
ADD COLUMN IF NOT EXISTS ai_summary_en JSONB;
