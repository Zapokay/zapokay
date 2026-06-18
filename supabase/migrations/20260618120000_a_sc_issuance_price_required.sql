-- A-SC (ZK_Queue) — stated capital account: issuance-price requiredness.
-- Redefines create_shareholding_with_holders to RAISE when a DIRECT ISSUANCE
-- omits issue_price_per_share. Source-scoped: transfers (source='transfer')
-- are capital-neutral and legitimately carry no consideration, so they are
-- EXEMPT. Mechanism note: editing the original migration (20260515065959)
-- would be a no-op on the live DB (migrations run once); a fresh
-- CREATE OR REPLACE is what redefines the deployed function. Body reproduced
-- VERBATIM from 20260515065959 + the guard only — no other behavioral change.

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

  -- A-SC guard: a direct issuance must carry consideration so the stated-capital
  -- account (art. 68 LSAQ / s.26 CBCA) can be computed. Source-scoped — the
  -- requirement is issuance-scoped, NOT RPC-scoped: transfers (source='transfer')
  -- are exempt. The 'source' read mirrors the INSERT's own COALESCE/NULLIF below.
  IF COALESCE(NULLIF(p_shareholding ->> 'source', ''), 'direct_issuance') = 'direct_issuance'
     AND NULLIF(p_shareholding ->> 'issue_price_per_share', '') IS NULL THEN
    RAISE EXCEPTION
      'create_shareholding_with_holders: issue_price_per_share is required for direct issuances';
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
