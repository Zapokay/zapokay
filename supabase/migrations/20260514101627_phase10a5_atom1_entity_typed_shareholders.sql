-- =============================================================================
-- Phase 10A.5 Atom 1 — Entity-Typed Shareholders + Joint Holders Foundation
-- =============================================================================
-- Creates three new tables that together support trust shareholders, corporate
-- shareholders, and joint holders per docs/specs/signature-block-convention-2026-05-14.md §4.2.1.
--
-- Architectural locks (per docs/proposals/phase-10a5-decomposition-2026-05-14.md §6):
--   Q-10A5-1 = (a) no ownership-fraction column
--   Q-10A5-2 = (a) shareholdings.person_id kept here; dropped in atom 2 after R-G audit
--   Q-10A5-3 = (b) mirror officer_appointments.title enum pattern (EN snake_case keys)
--   Q-10A5-4 = (a) inline address columns mirroring company_people
--   Q-10A5-5 = (a) company-scoped entities (company_id NOT NULL on all three tables)
--   Q-10A5-6 = both layers (DB trigger + UI; UI is atom 3)
--   Q-10A5-7 = (a) atomic backfill in same migration
--
-- Deliberate deviations from existing precedent (rationale in commit body):
--   A3: shareholder_entity_signatories uses start_date instead of appointment_date,
--       and omits is_active (relies on `WHERE end_date IS NULL` per Phase 10A LOCK-7).
--   A4: ON DELETE RESTRICT on *.person_id and *.entity_id (deviates from
--       director_mandates/officer_appointments CASCADE to preserve historical
--       signing roster against accidental person/entity deletes).
--
-- Refs:
--   - docs/specs/signature-block-convention-2026-05-14.md (rendering contract)
--   - docs/proposals/phase-10a5-decomposition-2026-05-14.md (atom decomposition)
--   - docs/investigations/trust-and-joint-shareholder-data-model-2026-05-14.md (gap analysis)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- §1. shareholder_entities — trust + corporation entity-shareholder records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shareholder_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('trust', 'corporation')),
  legal_name TEXT NOT NULL,
  jurisdiction TEXT,
  entity_number TEXT,
  date_constituted DATE,
  date_incorporated DATE,
  -- Address columns mirror company_people verbatim (Q-10A5-4)
  address_line1 TEXT,
  address_city TEXT,
  address_province TEXT,
  address_postal_code TEXT,
  address_country TEXT DEFAULT 'CA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shareholder_entities_company_id
  ON shareholder_entities(company_id);
CREATE INDEX idx_shareholder_entities_company_type
  ON shareholder_entities(company_id, entity_type);

ALTER TABLE shareholder_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company shareholder entities"
  ON shareholder_entities FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Reuses update_updated_at_column() defined in 20260405000000_sprint6_people_ownership.sql
CREATE TRIGGER update_shareholder_entities_updated_at
  BEFORE UPDATE ON shareholder_entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ---------------------------------------------------------------------------
-- §2. shareholder_entity_signatories — temporal trustee + signing-officer roster
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shareholder_entity_signatories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES shareholder_entities(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN (
    'trustee',
    'president',
    'vice_president',
    'secretary',
    'treasurer',
    'custom'
  )),
  custom_role TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  end_reason TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (role != 'custom' OR custom_role IS NOT NULL),
  CHECK (role = 'custom' OR custom_role IS NULL)
);

CREATE INDEX idx_shareholder_entity_signatories_company_id
  ON shareholder_entity_signatories(company_id);
CREATE INDEX idx_shareholder_entity_signatories_entity_id
  ON shareholder_entity_signatories(entity_id);
CREATE INDEX idx_shareholder_entity_signatories_person_id
  ON shareholder_entity_signatories(person_id);
CREATE INDEX idx_shareholder_entity_signatories_active
  ON shareholder_entity_signatories(entity_id)
  WHERE end_date IS NULL;

ALTER TABLE shareholder_entity_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company entity signatories"
  ON shareholder_entity_signatories FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE TRIGGER update_shareholder_entity_signatories_updated_at
  BEFORE UPDATE ON shareholder_entity_signatories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- A2: derive company_id from entity_id at write time (defense against app-side drift)
CREATE OR REPLACE FUNCTION sync_signatory_company_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT company_id INTO NEW.company_id
    FROM shareholder_entities
    WHERE id = NEW.entity_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION
      'shareholder_entity_signatories.entity_id % does not resolve to a valid entity',
      NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_signatory_company_id_trigger
  BEFORE INSERT OR UPDATE OF entity_id ON shareholder_entity_signatories
  FOR EACH ROW
  EXECUTE FUNCTION sync_signatory_company_id();


-- ---------------------------------------------------------------------------
-- §3. shareholding_holders — polymorphic join (supports joint holders)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shareholding_holders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shareholding_id UUID NOT NULL REFERENCES shareholdings(id) ON DELETE CASCADE,
  holder_type TEXT NOT NULL CHECK (holder_type IN ('individual', 'entity')),
  person_id UUID REFERENCES company_people(id) ON DELETE RESTRICT,
  entity_id UUID REFERENCES shareholder_entities(id) ON DELETE RESTRICT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (holder_type = 'individual' AND person_id IS NOT NULL AND entity_id IS NULL) OR
    (holder_type = 'entity' AND entity_id IS NOT NULL AND person_id IS NULL)
  )
);

CREATE INDEX idx_shareholding_holders_company_id
  ON shareholding_holders(company_id);
CREATE INDEX idx_shareholding_holders_shareholding_id
  ON shareholding_holders(shareholding_id);
CREATE INDEX idx_shareholding_holders_person_id
  ON shareholding_holders(person_id)
  WHERE person_id IS NOT NULL;
CREATE INDEX idx_shareholding_holders_entity_id
  ON shareholding_holders(entity_id)
  WHERE entity_id IS NOT NULL;

-- Anti-duplicate-holder constraints
CREATE UNIQUE INDEX uniq_shareholding_holders_person
  ON shareholding_holders(shareholding_id, person_id)
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_shareholding_holders_entity
  ON shareholding_holders(shareholding_id, entity_id)
  WHERE entity_id IS NOT NULL;

ALTER TABLE shareholding_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company shareholding holders"
  ON shareholding_holders FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- A2: derive company_id from shareholding_id at write time
CREATE OR REPLACE FUNCTION sync_holder_company_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT company_id INTO NEW.company_id
    FROM shareholdings
    WHERE id = NEW.shareholding_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION
      'shareholding_holders.shareholding_id % does not resolve to a valid shareholding',
      NEW.shareholding_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_holder_company_id_trigger
  BEFORE INSERT OR UPDATE OF shareholding_id ON shareholding_holders
  FOR EACH ROW
  EXECUTE FUNCTION sync_holder_company_id();

-- Q-10A5-6 DB layer: reject mixed-type joint holdings (spec §4.2.1)
CREATE OR REPLACE FUNCTION check_mixed_holders()
RETURNS TRIGGER AS $$
DECLARE
  v_total INT;
  v_entity_count INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE holder_type = 'entity')
    INTO v_total, v_entity_count
    FROM shareholding_holders
    WHERE shareholding_id = NEW.shareholding_id;

  IF v_total > 1 AND v_entity_count > 0 THEN
    RAISE EXCEPTION
      'Joint shareholdings must be individuals-only (spec §4.2.1). '
      'Shareholding % has % holders including % entity holder(s). '
      'Use separate shareholdings for entity holders.',
      NEW.shareholding_id, v_total, v_entity_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_mixed_holders_trigger
  AFTER INSERT OR UPDATE ON shareholding_holders
  FOR EACH ROW
  EXECUTE FUNCTION check_mixed_holders();


-- ---------------------------------------------------------------------------
-- §4. BACKFILL — populate shareholding_holders from existing shareholdings
-- ---------------------------------------------------------------------------
-- Q-10A5-7: atomic with this migration. One holder row per existing shareholding.
-- sync_holder_company_id_trigger fills company_id from the parent shareholdings row.
INSERT INTO shareholding_holders (shareholding_id, holder_type, person_id, display_order)
SELECT id, 'individual', person_id, 0
FROM shareholdings
WHERE person_id IS NOT NULL;

-- Verification: fail fast if counts mismatch.
DO $$
DECLARE
  v_source_count INT;
  v_target_count INT;
BEGIN
  SELECT COUNT(*) INTO v_source_count
    FROM shareholdings WHERE person_id IS NOT NULL;
  SELECT COUNT(*) INTO v_target_count
    FROM shareholding_holders;

  IF v_source_count != v_target_count THEN
    RAISE EXCEPTION
      'Backfill verification failed: shareholdings.person_id count (%) != shareholding_holders count (%)',
      v_source_count, v_target_count;
  END IF;

  RAISE NOTICE 'Backfill OK: % shareholdings → % shareholding_holders rows',
    v_source_count, v_target_count;
END $$;


-- ---------------------------------------------------------------------------
-- §5. TRANSITIONAL: keep shareholding_holders in sync with shareholdings.person_id
-- ---------------------------------------------------------------------------
-- TRANSITIONAL: drop in atom 2 alongside shareholdings.person_id
--
-- Why: Single Supabase project (dev = prod). Atom 1 migration goes live before
-- atom 3's UI changes ship. Existing IssueSharesModal writes shareholdings.person_id
-- directly; without this trigger, new rows during the atom-1→atom-3 window would
-- lack a corresponding shareholding_holders row.
CREATE OR REPLACE FUNCTION transitional_sync_shareholding_holders()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.person_id IS NOT NULL THEN
    -- Idempotent: skip if a matching holder row already exists
    IF NOT EXISTS (
      SELECT 1 FROM shareholding_holders
      WHERE shareholding_id = NEW.id
        AND person_id = NEW.person_id
    ) THEN
      INSERT INTO shareholding_holders (shareholding_id, holder_type, person_id, display_order)
      VALUES (NEW.id, 'individual', NEW.person_id, 0);
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.person_id IS DISTINCT FROM NEW.person_id THEN
    -- Replace the individual holder row when person_id changes
    DELETE FROM shareholding_holders
    WHERE shareholding_id = NEW.id
      AND holder_type = 'individual';
    IF NEW.person_id IS NOT NULL THEN
      INSERT INTO shareholding_holders (shareholding_id, holder_type, person_id, display_order)
      VALUES (NEW.id, 'individual', NEW.person_id, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRANSITIONAL: drop in atom 2 alongside shareholdings.person_id
CREATE TRIGGER transitional_sync_shareholding_holders_trigger
  AFTER INSERT OR UPDATE OF person_id ON shareholdings
  FOR EACH ROW
  EXECUTE FUNCTION transitional_sync_shareholding_holders();
