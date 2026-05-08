-- =============================================================================
-- Sprint 6 — People & Ownership — Completion Migration
-- =============================================================================
-- Completes partial execution of 20260405000000_sprint6_people_ownership.sql.
-- The original migration was applied via Dashboard SQL Editor in early April
-- 2026 but executed only partially: tables, RLS policies, and CHECK constraints
-- landed; the 10 declared indexes, the update_updated_at_column() helper
-- function, and the update_company_people_updated_at trigger did not.
--
-- Audit reference: docs/schema-drift-audit-2026-05-07.md §4.6 item #1
--                  (and §4.2 / §4.3 for evidence)
--
-- This migration is forward-only and idempotent:
--   - The original 20260405000000 migration file is NOT modified.
--   - All CREATE statements use IF NOT EXISTS / CREATE OR REPLACE.
--   - The trigger uses DROP IF EXISTS before CREATE so a partial prior run
--     of this completion migration is safe to re-apply.
--
-- Performance impact: eliminates sequential scans on company_id / person_id /
-- share_class_id foreign-key filters across company_people, director_mandates,
-- officer_appointments, share_classes, and shareholdings.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — PL/pgSQL helper function
-- ---------------------------------------------------------------------------
-- Generic updated_at bumper. Wired to company_people in Section 3. Other
-- Sprint 6 tables do not have an updated_at column and intentionally do not
-- attach this trigger.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Section 2 — Indexes (10 missing FK / composite indexes)
-- ---------------------------------------------------------------------------

-- company_people
CREATE INDEX IF NOT EXISTS idx_company_people_company_id
  ON company_people(company_id);

-- director_mandates
CREATE INDEX IF NOT EXISTS idx_director_mandates_company_id
  ON director_mandates(company_id);
CREATE INDEX IF NOT EXISTS idx_director_mandates_person_id
  ON director_mandates(person_id);
CREATE INDEX IF NOT EXISTS idx_director_mandates_active
  ON director_mandates(company_id, is_active);

-- officer_appointments
CREATE INDEX IF NOT EXISTS idx_officer_appointments_company_id
  ON officer_appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_officer_appointments_person_id
  ON officer_appointments(person_id);

-- share_classes
CREATE INDEX IF NOT EXISTS idx_share_classes_company_id
  ON share_classes(company_id);

-- shareholdings
CREATE INDEX IF NOT EXISTS idx_shareholdings_company_id
  ON shareholdings(company_id);
CREATE INDEX IF NOT EXISTS idx_shareholdings_person_id
  ON shareholdings(person_id);
CREATE INDEX IF NOT EXISTS idx_shareholdings_share_class_id
  ON shareholdings(share_class_id);

-- ---------------------------------------------------------------------------
-- Section 3 — Trigger on company_people
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_company_people_updated_at ON company_people;

CREATE TRIGGER update_company_people_updated_at
  BEFORE UPDATE ON company_people
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
