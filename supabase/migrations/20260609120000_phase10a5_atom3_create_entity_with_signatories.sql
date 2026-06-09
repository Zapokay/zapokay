-- =============================================================================
-- Phase 10A.5 Atom 3 Slice 2a — create_entity_with_signatories RPC
-- =============================================================================
-- Atomic creation of a shareholder ENTITY (trust | corporation) plus its
-- temporal signatory roster, in a single implicit-subtransaction. The entity
-- sub-form (Slice 2b) calls this as ONE write, then calls the existing
-- create_shareholding_with_holders with { holder_type:'entity', entity_id }.
--
-- Mirrors the atom-2 Pattern β2 (create_shareholding_with_holders):
--   * SECURITY INVOKER — RLS evaluated under the calling user's auth context.
--     No privilege escalation: the RPC only does what a caller can already do
--     via sequential INSERTs. Owner passes the FOR ALL USING policy on both
--     shareholder_entities and shareholder_entity_signatories.
--   * Implicit subtransaction: any RAISE (entity CHECK, signatory CHECK, or the
--     sync_signatory_company_id trigger) rolls back the entity INSERT and every
--     signatory INSERT as a unit. No partial state.
--
-- Schema anchors (atom 1 20260514101627 + Slice 1 20260608120000):
--   * shareholder_entities has NO company_id sync trigger → company_id supplied
--     here on the entity INSERT.
--   * shareholder_entity_signatories HAS sync_signatory_company_id (BEFORE
--     INSERT) deriving company_id from entity_id → NOT supplied here.
--   * entity_descriptor CHECK: NULL OR (entity_type='corporation' AND IN
--     ('corporation','holding','nonprofit')) → trust callers send '' / omit →
--     NULLIF → NULL → satisfies the CHECK. A non-NULL descriptor on a trust
--     fails the CHECK and rolls the whole RPC back.
--   * role/custom_role CHECK: custom_role non-NULL IFF role='custom'. A
--     non-empty custom_role on a non-custom role fails the CHECK (intended).
--
-- Product decision (Dom): ZERO signatories allowed — no minimum-signatory
-- guard. jsonb_array_length(NULL) IS NULL, so an absent/empty p_signatories
-- simply runs the loop zero times; the entity is still created.
--
-- Refs: docs/proposals/phase-10a5-decomposition-2026-05-14.md (Atom 3).
-- =============================================================================

CREATE OR REPLACE FUNCTION create_entity_with_signatories(
  p_entity jsonb,
  p_signatories jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_entity_id uuid;
  v_sig       jsonb;
  v_idx       int := 0;
  v_count     int;
BEGIN
  -- Entity row. company_id supplied (no sync trigger on shareholder_entities).
  INSERT INTO shareholder_entities (
    company_id,
    entity_type,
    legal_name,
    jurisdiction,
    entity_number,
    date_constituted,
    date_incorporated,
    entity_descriptor,
    address_line1,
    address_city,
    address_province,
    address_postal_code,
    address_country
  )
  VALUES (
    (p_entity ->> 'company_id')::uuid,
    p_entity ->> 'entity_type',
    p_entity ->> 'legal_name',
    NULLIF(p_entity ->> 'jurisdiction', ''),
    NULLIF(p_entity ->> 'entity_number', ''),
    NULLIF(p_entity ->> 'date_constituted', '')::date,
    NULLIF(p_entity ->> 'date_incorporated', '')::date,
    NULLIF(p_entity ->> 'entity_descriptor', ''),
    NULLIF(p_entity ->> 'address_line1', ''),
    NULLIF(p_entity ->> 'address_city', ''),
    NULLIF(p_entity ->> 'address_province', ''),
    NULLIF(p_entity ->> 'address_postal_code', ''),
    COALESCE(NULLIF(p_entity ->> 'address_country', ''), 'CA')
  )
  RETURNING id INTO v_entity_id;

  -- Signatory rows (zero allowed). company_id OMITTED — derived from entity_id
  -- by sync_signatory_company_id_trigger (atom 1 §2 A2).
  v_count := jsonb_array_length(p_signatories);
  IF v_count IS NOT NULL AND v_count > 0 THEN
    FOR v_sig IN SELECT jsonb_array_elements(p_signatories)
    LOOP
      INSERT INTO shareholder_entity_signatories (
        entity_id,
        person_id,
        role,
        custom_role,
        start_date,
        display_order
      )
      VALUES (
        v_entity_id,
        (v_sig ->> 'person_id')::uuid,
        v_sig ->> 'role',
        NULLIF(v_sig ->> 'custom_role', ''),
        (v_sig ->> 'start_date')::date,
        COALESCE((v_sig ->> 'display_order')::int, v_idx)
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  RETURN v_entity_id;
END;
$$;

COMMENT ON FUNCTION create_entity_with_signatories(jsonb, jsonb) IS
  'Phase 10A.5 atom 3 (Slice 2a): atomic INSERT of a shareholder_entities row '
  'plus its shareholder_entity_signatories roster (zero signatories allowed). '
  'SECURITY INVOKER — RLS evaluated under caller. company_id supplied for the '
  'entity, trigger-derived for signatories. Does NOT create the shareholding '
  'link — caller invokes create_shareholding_with_holders with the returned '
  'entity_id afterward.';
