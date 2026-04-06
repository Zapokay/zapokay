-- =============================================================================
-- Sprint 6 — People & Ownership — SQL Migration
-- Run this in Supabase SQL Editor BEFORE deploying the frontend code.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. company_people — Central person registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_people (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_city TEXT,
  address_province TEXT,
  address_postal_code TEXT,
  address_country TEXT DEFAULT 'CA',
  is_canadian_resident BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE company_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company people"
  ON company_people FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_company_people_company_id ON company_people(company_id);

-- ---------------------------------------------------------------------------
-- 2. director_mandates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS director_mandates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  end_date DATE,
  end_reason TEXT CHECK (end_reason IN ('resignation', 'revocation', 'death', 'disqualification', 'term_expired')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE director_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company director mandates"
  ON director_mandates FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_director_mandates_company_id ON director_mandates(company_id);
CREATE INDEX idx_director_mandates_person_id ON director_mandates(person_id);
CREATE INDEX idx_director_mandates_active ON director_mandates(company_id, is_active);

-- ---------------------------------------------------------------------------
-- 3. officer_appointments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS officer_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (title IN ('president', 'secretary', 'treasurer', 'vice_president', 'custom')),
  custom_title TEXT,
  is_primary_signing_authority BOOLEAN DEFAULT FALSE,
  appointment_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE officer_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company officer appointments"
  ON officer_appointments FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_officer_appointments_company_id ON officer_appointments(company_id);
CREATE INDEX idx_officer_appointments_person_id ON officer_appointments(person_id);

-- ---------------------------------------------------------------------------
-- 4. share_classes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS share_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'common' CHECK (type IN ('common', 'preferred')),
  voting_rights BOOLEAN DEFAULT TRUE,
  votes_per_share INTEGER DEFAULT 1,
  max_quantity INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE share_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company share classes"
  ON share_classes FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_share_classes_company_id ON share_classes(company_id);

-- ---------------------------------------------------------------------------
-- 5. shareholdings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shareholdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES share_classes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  issue_date DATE NOT NULL,
  issue_price_per_share DECIMAL(12,4),
  certificate_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shareholdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company shareholdings"
  ON shareholdings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE INDEX idx_shareholdings_company_id ON shareholdings(company_id);
CREATE INDEX idx_shareholdings_person_id ON shareholdings(person_id);
CREATE INDEX idx_shareholdings_share_class_id ON shareholdings(share_class_id);

-- ---------------------------------------------------------------------------
-- 6. Deprecate old table
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS company_officers RENAME TO company_officers_deprecated;

-- ---------------------------------------------------------------------------
-- 7. updated_at trigger for company_people
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_people_updated_at
  BEFORE UPDATE ON company_people
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

