-- =============================================================================
-- Phase 10A.5 Atom 3 Slice 1/4 — entity display descriptor
-- (corporation sub-label: corporation / holding / nonprofit)
-- =============================================================================
-- Adds a single additive, nullable column `entity_descriptor` to
-- shareholder_entities. This is a DISPLAY label only — it refines how a
-- corporation shareholder is presented in the UI (e.g. "holding" vs "OSBL").
-- It is NOT a structural category: `entity_type` ('trust' | 'corporation')
-- remains the single source of structural truth.
--
-- Semantics (per Slice 1/4 brief, Dom-approved 2026-06-08):
--   * Additive, nullable, NO default, NO backfill — zero risk to existing rows.
--   * Keys are EN snake_case; the FR/EN human label ("OSBL" / "Non-profit")
--     is resolved in the UI i18n layer, never stored in the DB.
--   * The descriptor applies ONLY to corporations — a trust is neither a
--     holding nor a nonprofit. The CHECK therefore allows NULL for any type,
--     but a non-NULL value requires entity_type = 'corporation'.
--   * No 'custom' escape hatch: the legal set is closed (mirrors entity_type,
--     which has no custom value). A new form is a deliberate one-line migration,
--     preferred over a free-text column that would drift.
--
-- Reference: docs/proposals/phase-10a5-decomposition-2026-05-14.md (Atom 3).
-- =============================================================================

ALTER TABLE shareholder_entities
  ADD COLUMN entity_descriptor TEXT
  CHECK (
    entity_descriptor IS NULL
    OR (entity_type = 'corporation' AND entity_descriptor IN ('corporation', 'holding', 'nonprofit'))
  );

COMMENT ON COLUMN shareholder_entities.entity_descriptor IS
  'Display-only sub-label for corporation shareholders (corporation | holding | nonprofit). EN snake_case keys; FR/EN label resolved in UI i18n. NOT a structural category — entity_type remains the structural truth (trust | corporation). Only valid (non-NULL) when entity_type = ''corporation''.';
