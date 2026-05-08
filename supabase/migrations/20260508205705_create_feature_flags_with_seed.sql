-- =============================================================================
-- Sprint 10A Batch 2 — Foundation Backfill (file 2 of 4)
-- Table: feature_flags
-- =============================================================================
-- Backfills the production-only `feature_flags` reference table (CREATE +
-- 5-row seed) so a fresh database recreation reproduces the live shape.
-- Original DDL applied via Supabase Dashboard SQL Editor in early April 2026
-- and never landed in source control.
--
-- Audit reference: docs/schema-drift-audit-2026-05-07.md §4.6 item #5 (silent break)
-- Investigation:   docs/audit-batch2-foundation-backfill-2026-05-08.md §3.2
--
-- Forward-only and idempotent:
--   - CREATE TABLE IF NOT EXISTS
--   - ENABLE ROW LEVEL SECURITY (no-op if already enabled)
--   - SELECT policy guarded by EXCEPTION WHEN duplicate_object
--   - 5 INSERTs use ON CONFLICT (flag_key) DO NOTHING
--
-- Note on description text: live `description` strings contain stripped
-- apostrophes (`dajouter`, `lIA`). These are reproduced verbatim per Batch 2
-- anti-ask #2 (no row modifications) — "fixing" them would create drift
-- from production state.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feature_flags (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  flag_key    text        NOT NULL,
  is_enabled  boolean              DEFAULT false,
  enabled_for jsonb,
  description text,
  created_at  timestamptz          DEFAULT now(),
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT feature_flags_flag_key_key UNIQUE (flag_key)
);

-- ---------------------------------------------------------------------------
-- Section 2 — Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY feature_flags_read
    ON feature_flags
    FOR SELECT
    USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Section 3 — Seed (5 rows, idempotent via ON CONFLICT (flag_key))
-- ---------------------------------------------------------------------------

INSERT INTO feature_flags (flag_key, is_enabled, enabled_for, description) VALUES ('ai_gap_analysis', true, NULL, 'Analyse des gaps par lIA') ON CONFLICT (flag_key) DO NOTHING;
INSERT INTO feature_flags (flag_key, is_enabled, enabled_for, description) VALUES ('ai_summaries', true, NULL, 'Résumés IA des documents') ON CONFLICT (flag_key) DO NOTHING;
INSERT INTO feature_flags (flag_key, is_enabled, enabled_for, description) VALUES ('catch_up_wizard', true, NULL, 'Assistant de rattrapage des résolutions manquantes') ON CONFLICT (flag_key) DO NOTHING;
INSERT INTO feature_flags (flag_key, is_enabled, enabled_for, description) VALUES ('multi_company', false, NULL, 'Permet aux users dajouter plusieurs compagnies') ON CONFLICT (flag_key) DO NOTHING;
INSERT INTO feature_flags (flag_key, is_enabled, enabled_for, description) VALUES ('settings_page', true, NULL, 'Page Paramètres active') ON CONFLICT (flag_key) DO NOTHING;
