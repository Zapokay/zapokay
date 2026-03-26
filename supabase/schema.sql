-- ============================================================
-- ZapOkay — Complete Database Schema + RLS
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- 1. USERS (extends auth.users)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  preferred_language    TEXT NOT NULL DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en')),
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, preferred_language)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'fr')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 2. COMPANIES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  legal_name_fr         TEXT NOT NULL,
  legal_name_en         TEXT,
  incorporation_type    TEXT NOT NULL CHECK (incorporation_type IN ('LSA', 'CBCA')),
  incorporation_number  TEXT,
  incorporation_date    DATE,
  province              TEXT NOT NULL DEFAULT 'QC' CHECK (province IN ('QC','ON','BC','AB','MB','SK','NS','NB','NL','PE','YT','NT','NU')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "companies_insert_own" ON public.companies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "companies_delete_own" ON public.companies
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 3. COMPANY OFFICERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_officers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('director', 'officer', 'shareholder')),
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "officers_select_own" ON public.company_officers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "officers_insert_own" ON public.company_officers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "officers_update_own" ON public.company_officers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "officers_delete_own" ON public.company_officers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. DOCUMENTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  document_type  TEXT NOT NULL CHECK (document_type IN ('resolution', 'bylaw', 'register', 'certificate', 'other')),
  file_url       TEXT,
  language       TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en', 'bilingual')),
  jurisdiction   TEXT NOT NULL DEFAULT 'QC',
  framework      TEXT NOT NULL CHECK (framework IN ('LSA', 'CBCA')),
  uploaded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_own" ON public.documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_insert_own" ON public.documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_update_own" ON public.documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_delete_own" ON public.documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 5. COMPLIANCE RULES (global — not per-user)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction    TEXT NOT NULL,
  framework       TEXT NOT NULL CHECK (framework IN ('LSA', 'CBCA')),
  rule_key        TEXT NOT NULL UNIQUE,
  title_fr        TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  description_fr  TEXT,
  description_en  TEXT,
  frequency       TEXT NOT NULL CHECK (frequency IN ('annual', 'one_time', 'triggered')),
  due_day         SMALLINT CHECK (due_day BETWEEN 1 AND 31),
  due_month       SMALLINT CHECK (due_month BETWEEN 1 AND 12),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

-- Compliance rules are readable by all authenticated users
CREATE POLICY "compliance_rules_select_auth" ON public.compliance_rules
  FOR SELECT USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 6. COMPLIANCE ITEMS (per-company)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id              UUID NOT NULL REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'overdue', 'not_applicable')),
  due_date             DATE,
  completed_at         TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER compliance_items_updated_at
  BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_items_select_own" ON public.compliance_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "compliance_items_insert_own" ON public.compliance_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "compliance_items_update_own" ON public.compliance_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- 7. REMINDERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminders (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  compliance_item_id   UUID REFERENCES public.compliance_items(id) ON DELETE SET NULL,
  reminder_date        DATE NOT NULL,
  sent_at              TIMESTAMPTZ,
  channel              TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select_own" ON public.reminders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "reminders_insert_own" ON public.reminders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "reminders_update_own" ON public.reminders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id AND c.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- SEED: Compliance rules for QC/LSA and Federal/CBCA
-- ────────────────────────────────────────────────────────────
INSERT INTO public.compliance_rules
  (jurisdiction, framework, rule_key, title_fr, title_en, description_fr, description_en, frequency, due_day, due_month)
VALUES
  ('QC', 'LSA', 'QC_LSA_ANNUAL_MEETING',
   'Assemblée annuelle des actionnaires',
   'Annual Shareholders Meeting',
   'Tenir une assemblée annuelle des actionnaires dans les 15 mois suivant la dernière assemblée.',
   'Hold an annual shareholders meeting within 15 months of the last meeting.',
   'annual', NULL, NULL),

  ('QC', 'LSA', 'QC_LSA_ANNUAL_RETURN',
   'Déclaration annuelle (Registraire)',
   'Annual Return (Registrar)',
   'Déposer la déclaration annuelle auprès du Registraire des entreprises du Québec.',
   'File annual return with the Registraire des entreprises du Québec.',
   'annual', NULL, NULL),

  ('QC', 'LSA', 'QC_LSA_REGISTER_MAINTENANCE',
   'Mise à jour du registre des actionnaires',
   'Shareholder Register Update',
   'Maintenir à jour le registre des actionnaires suite à tout changement.',
   'Keep the shareholder register up to date following any change.',
   'triggered', NULL, NULL),

  ('QC', 'LSA', 'QC_LSA_FINANCIAL_STATEMENTS',
   'Approbation des états financiers',
   'Financial Statements Approval',
   'Faire approuver les états financiers par les administrateurs annuellement.',
   'Have financial statements approved by directors annually.',
   'annual', NULL, NULL),

  ('CA', 'CBCA', 'CA_CBCA_ANNUAL_MEETING',
   'Assemblée annuelle (LSCA)',
   'Annual Meeting (CBCA)',
   'Tenir une assemblée annuelle dans les 15 mois suivant la dernière, et au plus 6 mois après la fin de l''exercice.',
   'Hold an annual meeting within 15 months of the last meeting and no later than 6 months after fiscal year-end.',
   'annual', NULL, NULL),

  ('CA', 'CBCA', 'CA_CBCA_ANNUAL_RETURN',
   'Rapport annuel (Corporations Canada)',
   'Annual Return (Corporations Canada)',
   'Déposer le rapport annuel auprès de Corporations Canada dans les 60 jours suivant l''anniversaire de constitution.',
   'File annual return with Corporations Canada within 60 days of the anniversary of incorporation.',
   'annual', NULL, NULL),

  ('CA', 'CBCA', 'CA_CBCA_REGISTER_ISC',
   'Registre des individus ayant un contrôle important',
   'Register of Individuals with Significant Control',
   'Maintenir et mettre à jour le registre ISC tel qu''exigé par la LSCA depuis 2019.',
   'Maintain and update the ISC register as required by the CBCA since 2019.',
   'triggered', NULL, NULL)
ON CONFLICT (rule_key) DO NOTHING;
