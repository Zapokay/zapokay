-- Sprint 3: Compliance engine tables

-- Table des règles de conformité (seed data séparé)
CREATE TABLE IF NOT EXISTS compliance_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction  text NOT NULL,
  framework     text NOT NULL CHECK (framework IN ('LSA', 'CBCA')),
  rule_key      text NOT NULL,
  title_fr      text NOT NULL,
  title_en      text NOT NULL,
  frequency     text NOT NULL DEFAULT 'annual',
  legal_reference text,
  last_reviewed_at timestamptz,
  reviewed_by   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework, jurisdiction, rule_key)
);

-- Table des items de conformité par entreprise
CREATE TABLE IF NOT EXISTS compliance_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_id     uuid NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('compliant', 'pending', 'required')),
  due_date    date,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_items_company_rule_unique UNIQUE (company_id, rule_id)
);

-- RLS
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_rules_read_all" ON compliance_rules
  FOR SELECT USING (true);

CREATE POLICY "compliance_items_owner" ON compliance_items
  FOR ALL USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Seed: règles LSA Québec
INSERT INTO compliance_rules (jurisdiction, framework, rule_key, title_fr, title_en, frequency, legal_reference)
VALUES
  ('QC', 'LSA', 'annual_board_resolution',       'Résolution annuelle du conseil d''administration', 'Annual board of directors resolution',   'annual', 'LSAQ art. 93'),
  ('QC', 'LSA', 'annual_shareholder_resolution',  'Résolution annuelle des actionnaires',             'Annual shareholders resolution',          'annual', 'LSAQ art. 104'),
  ('QC', 'LSA', 'annual_financial_statements',    'États financiers annuels',                         'Annual financial statements',             'annual', 'LSAQ art. 214'),
  ('QC', 'LSA', 'req_annual_update',              'Mise à jour annuelle REQ',                         'REQ annual update',                       'annual', 'Loi sur la publicité légale'),
  ('QC', 'LSA', 'auditor_waiver',                 'Dispense de vérificateur',                         'Auditor waiver',                          'annual', 'LSAQ art. 223')
ON CONFLICT (framework, jurisdiction, rule_key) DO NOTHING;

-- Seed: règles CBCA fédéral
INSERT INTO compliance_rules (jurisdiction, framework, rule_key, title_fr, title_en, frequency, legal_reference)
VALUES
  ('CA', 'CBCA', 'annual_board_resolution',           'Résolution annuelle du conseil d''administration', 'Annual board of directors resolution',       'annual', 'LSAQC art. 114'),
  ('CA', 'CBCA', 'annual_shareholder_resolution',      'Résolution annuelle des actionnaires',             'Annual shareholders resolution',              'annual', 'LSAQC art. 133'),
  ('CA', 'CBCA', 'annual_financial_statements',        'États financiers annuels',                         'Annual financial statements',                 'annual', 'LSAQC art. 155'),
  ('CA', 'CBCA', 'corporations_canada_annual_return',  'Rapport annuel Corporations Canada',               'Corporations Canada annual return',           'annual', 'LSAQC art. 263'),
  ('CA', 'CBCA', 'auditor_waiver',                     'Dispense de vérificateur',                         'Auditor waiver',                              'annual', 'LSAQC art. 163')
ON CONFLICT (framework, jurisdiction, rule_key) DO NOTHING;
