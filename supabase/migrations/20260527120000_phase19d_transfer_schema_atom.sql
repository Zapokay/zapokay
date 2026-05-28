-- =============================================================================
-- #19d Phase 3 close — Share transfer schema atom
-- =============================================================================
-- Schema foundation for the v1 ind-to-ind share-transfer generate slice.
-- Single-file migration with four statements; app-code slice ships separately.
--
-- v1 product locks (per audit doc 2026-05-27 + schema-atom brief):
--   - ind-to-ind only (no entity / no joint holder transfers)
--   - full transfers only (entire source-holding quantity in one shot)
--   - same-class implied (destination inherits source's share_class_id)
--   - price optional (free-form `consideration` TEXT, mirrors issuance optional price)
--   - founding-cohort allowed (no `> incorporation_date` predicate)
--
-- Refs:
--   - docs/audit-transfer-investigation-2026-05-27.md (precondition; §5 flagged
--     the legacy-FK drop as "BEFORE shipping transfer UI")
--   - supabase/migrations/20260526120000_phase19d_cessation_activity_log_event_types.sql
--     (precedent: DROP/ADD CONSTRAINT enum widen pattern, constraint name preserved)
--   - supabase/migrations/20260515065959_phase10a5_atom2_drop_person_id_add_rpc.sql
--     (precedent: SECURITY INVOKER atomicity-wrapper RPC, sync_holder_company_id_trigger
--     auto-fills shareholding_holders.company_id, check_mixed_holders_trigger guards
--     joint-with-entity at INSERT time)
--   - supabase/migrations/20260511131314_create_share_transfers.sql (target table)
--   - supabase/migrations/20260511140949_phase10a_shareholdings_temporal.sql
--     (shareholdings_end_reason_check already admits 'transfer' — no widen needed)
--   - supabase/migrations/20260524215506_create_event_documents.sql lines 26-29 +
--     L70-74 (legacy column flagged for deprecation; backfill done, 0 rows then)
--
-- Forward-only and tenant-safe:
--   §1 DROP COLUMN IF EXISTS                 — write-cold per audit §5 (0 app-code
--                                              writes; mention is header-comment only)
--   §2 ADD CONSTRAINT (positive-quantity)    — current row count = 0 (no capture UI
--                                              has ever written; verified per audit
--                                              §3 + 2026-05-26 audit §6 "Transfer
--                                              NOT CAPTURED"); CHECK validation
--                                              passes trivially
--   §3 DROP + ADD activity_log enum CHECK    — additive (24 → 25 values); every
--                                              existing row's event_type is in the
--                                              prior 24 ⊂ 25, so no row violates
--   §4 CREATE OR REPLACE FUNCTION            — idempotent; new function, no consumers
--
-- All four statements run in Supabase's per-migration implicit transaction. If any
-- statement fails the whole migration rolls back.
--
-- SECURITY mode (locked Dom 2026-05-27): SECURITY INVOKER, no SET search_path.
-- Mirrors Atom 2 RPC verbatim (see precedent lines 65-69 for full rationale).
-- transfer_shares is purely an atomicity wrapper around writes the caller can
-- already perform via sequential supabase-js. RLS on shareholdings +
-- share_transfers + shareholding_holders + activity_log already enforces
-- per-tenant access — no privilege escalation needed, no manual authz guard
-- in the function body.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- §1. Drop legacy per-table FK `share_transfers.resolution_document_id`
-- ---------------------------------------------------------------------------
-- Origin: Phase 10A Atom 3 (20260511131314_create_share_transfers.sql L14),
-- predating event_documents by 13 days. Superseded by the M:N event_documents
-- join (20260524215506) which is the engine's single read path
-- (lib/minute-book/event-completeness.ts:29-33). Backfill at event_documents
-- creation was a 0-row no-op (per that migration's L66-69 comment), and
-- audit-transfer-investigation-2026-05-27.md §5 verified zero app-code writes
-- as of HEAD = 69fbb3e. Dropping NOW (before any transfer mutator code exists)
-- removes the parallel-system risk the 2026-05-26 audit §5 lines 374-379
-- flagged: "MUST be either dropped, or [...] gated by a trigger that mirrors
-- writes into event_documents, BEFORE the Phase 3 transfer capture UI ships."
ALTER TABLE share_transfers
  DROP COLUMN IF EXISTS resolution_document_id;


-- ---------------------------------------------------------------------------
-- §2. ADD positive-quantity CHECK on share_transfers.quantity_transferred
-- ---------------------------------------------------------------------------
-- Tier-4 hardening gap surfaced by audit-transfer-investigation-2026-05-27.md
-- §1: the table was created without the `quantity > 0` CHECK that shareholdings
-- carries (20260405000000_sprint6_people_ownership.sql L112). With 0 rows in
-- production, retroactive validation is risk-free; failing to add it now would
-- mean a separate forward-only migration later when rows exist.
ALTER TABLE share_transfers
  ADD CONSTRAINT share_transfers_quantity_positive
  CHECK (quantity_transferred > 0);


-- ---------------------------------------------------------------------------
-- §3. Widen `activity_log.event_type` CHECK from 24 → 25 values
-- ---------------------------------------------------------------------------
-- Adds ONE value: 'share_transfer_created', written by transfer_shares() below.
-- NO 'share_transfer_edited' (edit-transfer UX deferred to v1.5 per Q4 lock).
-- NO '_soft_deleted' variant (share_transfers has no `deleted_at` column —
-- same pattern as the cessation slice's omission of shareholding_soft_deleted).
--
-- Mirrors 20260526120000_phase19d_cessation_activity_log_event_types.sql
-- verbatim: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT with the original 24
-- values PLUS 1 new value (25 total). Constraint name
-- `activity_log_event_type_check` preserved across all four enum-touching
-- migrations (20260508210035, 20260524190548, 20260526120000, and this one).
ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_event_type_check;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    -- Original 18 values (verbatim from 20260508210035_create_activity_log.sql)
    'document_uploaded'::text,
    'document_generated'::text,
    'document_deleted'::text,
    'director_added'::text,
    'director_removed'::text,
    'officer_added'::text,
    'officer_removed'::text,
    'officer_replaced'::text,
    'shareholder_added'::text,
    'shares_issued'::text,
    'share_class_created'::text,
    'company_created'::text,
    'company_updated'::text,
    'fiscal_year_activated'::text,
    'fiscal_year_archived'::text,
    'compliance_item_completed'::text,
    'wizard_completed'::text,
    'settings_updated'::text,
    -- Phase 1B-CAPTURE Bundle 2 additions (4 values)
    'director_edited'::text,
    'officer_edited'::text,
    'director_soft_deleted'::text,
    'officer_soft_deleted'::text,
    -- #19d Phase 3 cessation additions (2 values)
    'shareholding_ended'::text,
    'shareholding_edited'::text,
    -- #19d Phase 3 close — transfer addition (1 value)
    'share_transfer_created'::text
  ]));


-- ---------------------------------------------------------------------------
-- §4. transfer_shares RPC — atomic ind-to-ind full share transfer
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (Dom-locked 2026-05-27): RLS evaluates under the calling
-- user's auth context. Caller must already pass the per-tenant RLS policies on
-- shareholdings, shareholding_holders, share_transfers, and activity_log. No
-- privilege escalation — RPC is purely an atomicity wrapper around the same
-- writes the caller can perform via sequential supabase-js. Mirrors Phase
-- 10A.5 Atom 2 rationale (20260515065959_*.sql L65-69) verbatim.
--
-- Atomicity: PL/pgSQL functions execute in an implicit subtransaction. Any
-- RAISE EXCEPTION (including from check_mixed_holders_trigger or any CHECK
-- constraint) rolls back every write performed by this call as a unit. No
-- partial state possible.
--
-- v1 lock guards (defense-in-depth at the DB layer):
--   - Source must exist AND have end_date IS NULL (not already ended)
--   - Source must have exactly 1 holder (no joint-source transfers in v1)
--   - That holder must be holder_type='individual' (no entity-source in v1)
--   - Transfer date must be >= source's issue_date (no time-travel)
--   - Transfer date must be <= CURRENT_DATE (no future-dated transfers)
--
-- Activity log titles (Dom-confirmed 2026-05-27): bilingual format with arrow:
--   FR: "Transfert d'actions : <from> → <to> (<qty> <className>)"
--   EN: "Share transfer: <from> → <to> (<qty> <className>)"
-- share_classes has a single `name` column (no FR/EN split), matching the
-- cessation precedent at EndShareholdingModal.tsx:108-109 which uses
-- share_class.name in both titles.
CREATE OR REPLACE FUNCTION transfer_shares(
  p_from_shareholding_id UUID,
  p_to_person_id         UUID,
  p_transfer_date        DATE,
  p_consideration        TEXT
)
RETURNS TABLE (
  new_transfer_id                  UUID,
  new_destination_shareholding_id  UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_company_id          UUID;
  v_share_class_id      UUID;
  v_quantity            INTEGER;
  v_issue_date          DATE;
  v_source_holder_count INT;
  v_source_holder_type  TEXT;
  v_new_destination_id  UUID;
  v_new_transfer_id     UUID;
  v_from_holder_name    TEXT;
  v_to_holder_name      TEXT;
  v_class_name          TEXT;
BEGIN
  -- (1) Fetch + validate source. RLS hides rows the caller can't access, so
  -- a NULL v_company_id after this SELECT means EITHER the row truly doesn't
  -- exist OR the row exists but the caller lacks RLS access. Both surface as
  -- the same error — no need to distinguish.
  SELECT company_id, share_class_id, quantity, issue_date
    INTO v_company_id, v_share_class_id, v_quantity, v_issue_date
    FROM shareholdings
    WHERE id = p_from_shareholding_id
      AND end_date IS NULL;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Source shareholding not found or already ended';
  END IF;

  -- (1b) v1 holder-shape guards. Combined into a single query (count +
  -- holder_type) since shareholding_holders has at most a handful of rows
  -- per shareholding. MAX(holder_type) is well-defined when count = 1 (the
  -- only case we accept); for joint sources we reject on count != 1 first
  -- and never read v_source_holder_type.
  SELECT COUNT(*), MAX(holder_type)
    INTO v_source_holder_count, v_source_holder_type
    FROM shareholding_holders
    WHERE shareholding_id = p_from_shareholding_id;

  IF v_source_holder_count != 1 THEN
    RAISE EXCEPTION
      'Joint-holder transfers not supported in v1 (source has % holders)',
      v_source_holder_count;
  END IF;

  IF v_source_holder_type != 'individual' THEN
    RAISE EXCEPTION 'Entity-holder transfers not supported in v1';
  END IF;

  -- (2) Date sanity.
  IF p_transfer_date < v_issue_date THEN
    RAISE EXCEPTION
      'Transfer date cannot precede source shareholding issue date';
  END IF;

  IF p_transfer_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Transfer date cannot be in the future';
  END IF;

  -- (3) End the source. end_reason = 'transfer' is admitted by the existing
  -- shareholdings_end_reason_check (20260511140949 L18 — 4-value enum).
  UPDATE shareholdings
    SET end_date   = p_transfer_date,
        end_reason = 'transfer'
    WHERE id = p_from_shareholding_id;

  -- (4) Create the destination shareholding. issue_date PRESERVED from source
  -- (the original issuance event is unchanged; the transfer is a separate
  -- event recorded in share_transfers below). source defaults to
  -- 'direct_issuance' per the column default (20260511140949 L8) — acceptable
  -- for v1; revisit if a 'transfer' source value is desired later.
  INSERT INTO shareholdings (
    company_id,
    share_class_id,
    quantity,
    issue_date
  )
  VALUES (
    v_company_id,
    v_share_class_id,
    v_quantity,
    v_issue_date
  )
  RETURNING id INTO v_new_destination_id;

  -- (5) Wire the destination holder. company_id auto-filled by
  -- sync_holder_company_id_trigger (atom 1 §3 A2). holder_type='individual'
  -- + person_id satisfies the XOR CHECK constraint. check_mixed_holders_trigger
  -- accepts single-holder INSERTs unconditionally.
  INSERT INTO shareholding_holders (
    shareholding_id,
    holder_type,
    person_id,
    display_order
  )
  VALUES (
    v_new_destination_id,
    'individual',
    p_to_person_id,
    0
  );

  -- (6) Record the transfer event.
  INSERT INTO share_transfers (
    company_id,
    from_shareholding_id,
    to_shareholding_id,
    transfer_date,
    quantity_transferred,
    consideration
  )
  VALUES (
    v_company_id,
    p_from_shareholding_id,
    v_new_destination_id,
    p_transfer_date,
    v_quantity,
    p_consideration
  )
  RETURNING id INTO v_new_transfer_id;

  -- (7) Resolve names for activity_log title. v1 ind-only means the source
  -- has exactly one individual holder (asserted above), so the JOIN to
  -- company_people returns exactly one row.
  SELECT cp.full_name
    INTO v_from_holder_name
    FROM shareholding_holders sh
    JOIN company_people cp ON cp.id = sh.person_id
    WHERE sh.shareholding_id = p_from_shareholding_id;

  SELECT full_name
    INTO v_to_holder_name
    FROM company_people
    WHERE id = p_to_person_id;

  SELECT name
    INTO v_class_name
    FROM share_classes
    WHERE id = v_share_class_id;

  -- (8) Activity log. Column shape mirrors lib/activity-log.ts:13-20 verbatim:
  -- company_id, user_id, event_type, title_fr, title_en, details (jsonb).
  -- user_id sourced from auth.uid() (matches the lib/activity-log.ts
  -- contract where the caller passes user.id from supabase.auth.getUser()).
  INSERT INTO activity_log (
    company_id,
    user_id,
    event_type,
    title_fr,
    title_en,
    details
  )
  VALUES (
    v_company_id,
    auth.uid(),
    'share_transfer_created',
    format(
      'Transfert d''actions : %s → %s (%s %s)',
      v_from_holder_name, v_to_holder_name, v_quantity, v_class_name
    ),
    format(
      'Share transfer: %s → %s (%s %s)',
      v_from_holder_name, v_to_holder_name, v_quantity, v_class_name
    ),
    jsonb_build_object(
      'from_shareholding_id', p_from_shareholding_id,
      'to_shareholding_id',   v_new_destination_id,
      'to_person_id',         p_to_person_id,
      'transfer_date',        p_transfer_date,
      'quantity',             v_quantity,
      'consideration',        p_consideration
    )
  );

  -- (9) Return both new IDs so the caller can navigate / link evidence
  -- documents via event_documents (event_type='share_transfer',
  -- event_id=new_transfer_id, event_phase='transfer').
  RETURN QUERY SELECT v_new_transfer_id, v_new_destination_id;
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_shares(UUID, UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION transfer_shares(UUID, UUID, DATE, TEXT) IS
  'Phase 3-close: atomic ind-to-ind full share transfer. Ends source shareholding (end_reason=transfer), creates destination shareholding preserving original issue_date, records transfer event, logs activity. v1 lock: full transfers only, same-class implied, person target only.';
