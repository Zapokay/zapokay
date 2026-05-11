-- Phase 10A.FK_RESTRICT — switch shareholdings FKs from CASCADE to RESTRICT.
--
-- Two constraint operations: DROP existing FK, ADD same-named FK with ON DELETE RESTRICT.
-- Both wrapped in DO $$ ... $$ blocks per Batch 3 precedent (commit 5440f41,
-- 20260510134015_documents_drift_backfill.sql Section 5 — CHECK constraint DROP + ADD pattern).
--
-- Rationale: once atom 3 creates share_transfers referencing shareholdings, accidental cascade-
-- delete of a share_class or company_person would silently wipe transfer history. RESTRICT
-- forces explicit handling at the application layer.
--
-- Source lock: docs/phase10a-decomposition-proposal-2026-05-10.md LOCK-6.
-- Precedent (operational): 20260510134015_documents_drift_backfill.sql (DO $$ pattern).
-- Precedent (FK creation): 20260405000000_sprint6_people_ownership.sql (sprint 6 base FKs).
-- Methodology: docs/audit-batch4-compliance-drift-backfill-2026-05-10.md §8.5, §8.6.
--
-- Pipeline preservation: none required at the SQL layer. No existing code path executes DELETE
-- against company_people or share_classes (verified P-FK-2 of atom 2 cycle; see findings doc).
-- Forward-only safe: RESTRICT is stricter than CASCADE; no migration-time row touches.
-- Visual gate: not required (no app code change, no current-state semantics affected).


-- LOCK-6 part A — shareholdings.share_class_id: CASCADE → RESTRICT
DO $$
BEGIN
  ALTER TABLE shareholdings
    DROP CONSTRAINT IF EXISTS shareholdings_share_class_id_fkey;

  ALTER TABLE shareholdings
    ADD CONSTRAINT shareholdings_share_class_id_fkey
    FOREIGN KEY (share_class_id) REFERENCES share_classes(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FK_RESTRICT atom: share_class_id constraint switch failed: %', SQLERRM;
END $$;


-- LOCK-6 part B — shareholdings.person_id: CASCADE → RESTRICT
DO $$
BEGIN
  ALTER TABLE shareholdings
    DROP CONSTRAINT IF EXISTS shareholdings_person_id_fkey;

  ALTER TABLE shareholdings
    ADD CONSTRAINT shareholdings_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES company_people(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FK_RESTRICT atom: person_id constraint switch failed: %', SQLERRM;
END $$;
