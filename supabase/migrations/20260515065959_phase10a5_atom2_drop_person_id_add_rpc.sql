-- =============================================================================
-- Phase 10A.5 Atom 2 — Drop transitional state + add holders-aware RPC
-- =============================================================================
-- Destructive close-out of atom 1's transitional bridge. Drops:
--   - transitional_sync_shareholding_holders_trigger (atom 1 §5)
--   - transitional_sync_shareholding_holders()       (atom 1 §5)
--   - idx_shareholdings_person_id                    (Sprint 6 FK index)
--   - shareholdings.person_id                        (Sprint 6 column + FK)
--
-- Adds:
--   - create_shareholding_with_holders(jsonb, jsonb) — atomic two-table INSERT
--     used by IssueSharesModal (W1), OnboardingFlow (W2), seed script (W3)
--     per R-G2 audit §4 + Q-R-G2-A lock = Pattern β2.
--
-- Atomic deploy lock (Q-R-G2-D): this migration MUST land in the same commit
-- as the 9 MIGRATE-verdict app-code sites (R1–R6, W1–W3) per audit §7.
-- Single Supabase project (WA #13) makes atomic enforceable.
--
-- Refs:
--   - docs/audit-rg2-shareholdings-person-id-consumers-2026-05-15.md (precondition)
--   - supabase/migrations/20260514101627_phase10a5_atom1_entity_typed_shareholders.sql (parent)
--   - docs/proposals/phase-10a5-decomposition-2026-05-14.md §3 atom 2 sketch
-- =============================================================================


-- ---------------------------------------------------------------------------
-- §1. Drop transitional trigger (atom 1 §5)
-- ---------------------------------------------------------------------------
-- R-G2 §7: zero application-code dependency. Trigger drop is safe given the
-- 3 Class W sites switch to create_shareholding_with_holders() in this commit.
DROP TRIGGER IF EXISTS transitional_sync_shareholding_holders_trigger
  ON shareholdings;


-- ---------------------------------------------------------------------------
-- §2. Drop transitional function (atom 1 §5)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS transitional_sync_shareholding_holders();


-- ---------------------------------------------------------------------------
-- §3. Drop FK index on shareholdings.person_id
-- ---------------------------------------------------------------------------
-- Verified present in live DB (npx supabase db query --linked 2026-05-15).
-- Postgres would cascade-drop this when the column drops in §4, but explicit
-- drop documents intent and survives future migration reorders.
DROP INDEX IF EXISTS public.idx_shareholdings_person_id;


-- ---------------------------------------------------------------------------
-- §4. Drop shareholdings.person_id column
-- ---------------------------------------------------------------------------
-- CASCADE drops the FK constraint shareholdings_person_id_fkey. No data loss:
-- atom 1 §4 backfilled all rows into shareholding_holders (verification block
-- in atom 1 §4 fail-fast on count mismatch). R-G2 §3/§4 confirms all 9 reads
-- and 3 writes migrate in the same commit; W4 (UPDATE) does not touch the
-- column. PostgREST FK-resolved embeds (R1, R3, R6) re-route through
-- shareholding_holders in the app-code changes shipping alongside this file.
ALTER TABLE shareholdings DROP COLUMN IF EXISTS person_id CASCADE;


-- ---------------------------------------------------------------------------
-- §5. create_shareholding_with_holders RPC (Q-R-G2-A = Pattern β2)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (not DEFINER): RLS evaluates under the calling user's auth
-- context. Caller must already pass the "Users can manage their own company
-- shareholdings" RLS policy on shareholdings, and the parallel policy on
-- shareholding_holders. No privilege escalation — RPC is purely an atomicity
-- wrapper around what callers can do today via two sequential INSERTs.
--
-- Atomicity: PL/pgSQL functions execute in an implicit subtransaction. Any
-- raised exception (including from check_mixed_holders AFTER INSERT trigger
-- on shareholding_holders) rolls back both INSERTs as a unit. No partial
-- state possible.
--
-- Joint-holder rejection: check_mixed_holders_trigger (atom 1 §3) enforces
-- "joint shareholdings must be individuals-only" at the DB layer. RPC body
-- contains NO redundant guard — relying on the trigger is correct per
-- defense-in-depth and avoids divergence between trigger and RPC logic.
--
-- Holder shape: p_holders is jsonb array of objects matching one of:
--   { "holder_type": "individual", "person_id": "<uuid>", "display_order": 0 }
--   { "holder_type": "entity",     "entity_id": "<uuid>", "display_order": 0 }
-- display_order is optional and defaults to the array index (0-based).
CREATE OR REPLACE FUNCTION create_shareholding_with_holders(
  p_shareholding jsonb,
  p_holders      jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_shareholding_id uuid;
  v_holder          jsonb;
  v_idx             int := 0;
  v_holders_count   int;
BEGIN
  -- Guard: at least one holder is required. The new model's invariant is
  -- "every shareholding has 1+ holders." Reject empty arrays at the RPC
  -- boundary rather than letting a structurally broken row land.
  v_holders_count := jsonb_array_length(p_holders);
  IF v_holders_count IS NULL OR v_holders_count = 0 THEN
    RAISE EXCEPTION
      'create_shareholding_with_holders: at least one holder required';
  END IF;

  -- Insert the shareholding row. Required keys per ShareholdingInsert
  -- (post-atom-2 shape, with person_id removed):
  --   company_id, share_class_id, quantity, issue_date
  -- Optional: issue_price_per_share, certificate_number, source,
  --           certificate_old, certificate_new
  INSERT INTO shareholdings (
    company_id,
    share_class_id,
    quantity,
    issue_date,
    issue_price_per_share,
    certificate_number,
    source,
    certificate_old,
    certificate_new
  )
  VALUES (
    (p_shareholding ->> 'company_id')::uuid,
    (p_shareholding ->> 'share_class_id')::uuid,
    (p_shareholding ->> 'quantity')::int,
    (p_shareholding ->> 'issue_date')::date,
    NULLIF(p_shareholding ->> 'issue_price_per_share', '')::numeric,
    NULLIF(p_shareholding ->> 'certificate_number', ''),
    COALESCE(NULLIF(p_shareholding ->> 'source', ''), 'direct_issuance'),
    NULLIF(p_shareholding ->> 'certificate_old', ''),
    NULLIF(p_shareholding ->> 'certificate_new', '')
  )
  RETURNING id INTO v_shareholding_id;

  -- Insert each holder row. company_id derives from shareholding_id via the
  -- sync_holder_company_id_trigger (atom 1 §3 A2). holder_type / person_id /
  -- entity_id consistency enforced by atom 1 §3 CHECK constraint. Joint
  -- mixed-type rejection enforced by check_mixed_holders_trigger.
  FOR v_holder IN SELECT jsonb_array_elements(p_holders)
  LOOP
    INSERT INTO shareholding_holders (
      shareholding_id,
      holder_type,
      person_id,
      entity_id,
      display_order
    )
    VALUES (
      v_shareholding_id,
      v_holder ->> 'holder_type',
      NULLIF(v_holder ->> 'person_id', '')::uuid,
      NULLIF(v_holder ->> 'entity_id', '')::uuid,
      COALESCE((v_holder ->> 'display_order')::int, v_idx)
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_shareholding_id;
END;
$$;

COMMENT ON FUNCTION create_shareholding_with_holders(jsonb, jsonb) IS
  'Phase 10A.5 atom 2: atomic two-table INSERT for shareholding + holders. '
  'Replaces the dual-write pattern at IssueSharesModal / OnboardingFlow / '
  'seed-canonical-fixture. SECURITY INVOKER — RLS evaluated under caller. '
  'Joint mixed-type holders rejected by check_mixed_holders_trigger.';
