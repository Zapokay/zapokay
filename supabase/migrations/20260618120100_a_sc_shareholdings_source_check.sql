-- A-SC (ZK_Queue) — harden shareholdings.source with a CHECK constraint.
-- `source` was added as unconstrained TEXT NOT NULL DEFAULT 'direct_issuance'
-- (20260511140949); the CHECK was deferred (noted in 20260527120000). Vocabulary
-- verified against BOTH code (only literals written: 'direct_issuance' via the
-- column default + create_shareholding_with_holders; 'transfer' via transfer_shares())
-- AND live data (distinct sources: direct_issuance=28, transfer=4 — no others).
-- Source-CHECK ONLY: no price-NOT-NULL constraint here (deferred to the post-launch
-- purge — 30 NULL-price fixtures would fail it). DROP IF EXISTS mirrors the
-- idempotent end_reason CHECK pattern in 20260511140949.

ALTER TABLE shareholdings DROP CONSTRAINT IF EXISTS shareholdings_source_check;
ALTER TABLE shareholdings ADD CONSTRAINT shareholdings_source_check
  CHECK (source IN ('direct_issuance', 'transfer'));
