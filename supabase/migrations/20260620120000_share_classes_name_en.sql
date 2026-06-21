-- =============================================================================
-- #137 — share_classes.name_en (EN-doc-labels pass)
-- =============================================================================
-- Adds a nullable EN label for share classes. `name` stays NOT NULL as the
-- FR/default; `name_en` is the optional English counterpart rendered when a
-- document's language is EN (resolution generation + lifecycle issuance/
-- cessation/transfer docs + the bilingual annual-register template).
--
-- Mirrors the companies.legal_name_fr / legal_name_en precedent: FR required,
-- EN nullable, render-time fallback `name_en ?? name`. Forward-only and
-- idempotent (IF NOT EXISTS). No backfill — existing rows get NULL name_en and
-- fall back to `name` at render time, so there is zero regression; rows improve
-- as users fill the EN field via the share-class modal.
--
-- Out of scope (separate, lawyer-gated ticket): the FR-only register routes
-- (shareholders / stated-capital / directors / officers) which are FR-by-design.
-- =============================================================================

ALTER TABLE share_classes ADD COLUMN IF NOT EXISTS name_en TEXT;
