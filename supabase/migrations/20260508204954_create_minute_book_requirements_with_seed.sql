-- =============================================================================
-- Sprint 10A Batch 2 — Foundation Backfill (file 1 of 4)
-- Table: minute_book_requirements
-- =============================================================================
-- Backfills the production-only `minute_book_requirements` reference table
-- (CREATE + 25-row seed) so a fresh database recreation reproduces the live
-- shape. The original DDL was applied via the Supabase Dashboard SQL Editor
-- in early April 2026 and never landed in source control.
--
-- Audit reference: docs/schema-drift-audit-2026-05-07.md §4.6 item #2
-- Investigation:   docs/audit-batch2-foundation-backfill-2026-05-08.md §3.1
--
-- This migration is forward-only and idempotent:
--   - CREATE TABLE IF NOT EXISTS  (no-op if already present)
--   - ENABLE ROW LEVEL SECURITY    (no-op if already enabled)
--   - SELECT policy guarded by EXCEPTION WHEN duplicate_object
--   - 25 INSERTs use ON CONFLICT (requirement_key, framework) DO NOTHING
--
-- Data shape (live, captured 2026-05-08):
--   25 rows total: 16 foundational + 9 annual; LSA=11, CBCA=14
--   Composite UNIQUE on (requirement_key, framework) — a row may share
--   requirement_key across LSA/CBCA frameworks.
--   `section` CHECK enumerates 8 values (statuts, reglements, resolutions,
--   registres, avis, actionnaires, administrateurs, dirigeants); only 6 are
--   currently populated by seed data, but the wider list is preserved verbatim
--   from production to avoid divergence on fresh recreations.
--
-- Description text strings are reproduced verbatim from the live table via
-- pg_format(%L) escaping. No "cleanup" of typography or punctuation per
-- Batch 2 anti-ask #2 (no row modifications).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1 — Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS minute_book_requirements (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  requirement_key text        NOT NULL,
  category        text        NOT NULL,
  jurisdiction    text        NOT NULL,
  framework       text        NOT NULL,
  title_fr        text        NOT NULL,
  title_en        text        NOT NULL,
  description_fr  text,
  description_en  text,
  section         text        NOT NULL,
  sort_order      integer              DEFAULT 0,
  can_generate    boolean              DEFAULT false,
  can_upload      boolean              DEFAULT true,
  created_at      timestamptz          DEFAULT now(),
  CONSTRAINT minute_book_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT minute_book_requirements_requirement_key_framework_key
    UNIQUE (requirement_key, framework),
  CONSTRAINT minute_book_requirements_category_check
    CHECK (category = ANY (ARRAY['foundational'::text, 'annual'::text])),
  CONSTRAINT minute_book_requirements_section_check
    CHECK (section = ANY (ARRAY[
      'statuts'::text,
      'reglements'::text,
      'resolutions'::text,
      'registres'::text,
      'avis'::text,
      'actionnaires'::text,
      'administrateurs'::text,
      'dirigeants'::text
    ]))
);

-- ---------------------------------------------------------------------------
-- Section 2 — Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE minute_book_requirements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY minute_book_requirements_read
    ON minute_book_requirements
    FOR SELECT
    USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Section 3 — Seed (25 rows, idempotent via composite ON CONFLICT)
-- ---------------------------------------------------------------------------

INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_certificate_incorporation', 'foundational', 'CA', 'CBCA', 'Certificat de constitution', 'Certificate of Incorporation', 'Certificat délivré par Corporations Canada confirmant la constitution de la société fédérale.', 'Certificate issued by Corporations Canada confirming the federal corporation''s incorporation.', 'statuts', 10, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_statuts_constitution', 'foundational', 'QC', 'LSA', 'Statuts de constitution', 'Articles of Incorporation', 'Le document fondateur de votre société, délivré par le Registraire des entreprises du Québec. Contient le nom, le NEQ, la date de constitution et les annexes.', 'The founding document of your corporation, issued by the Quebec Registrar. Contains the name, NEQ, incorporation date and schedules.', 'statuts', 10, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_articles_incorporation', 'foundational', 'CA', 'CBCA', 'Statuts constitutifs (Formulaire 1)', 'Articles of Incorporation (Form 1)', 'Le formulaire fédéral déposé pour constituer la société. Contient le nom, les catégories d''actions, les restrictions et les administrateurs.', 'The federal form filed to incorporate. Contains name, share classes, restrictions and directors.', 'statuts', 15, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_bylaw_1', 'foundational', 'CA', 'CBCA', 'Règlement intérieur (Règlement nº 1)', 'By-Law No. 1 (Internal Governance)', 'Règlement général régissant le fonctionnement interne de la société fédérale.', 'General by-law governing the federal corporation''s internal operations.', 'reglements', 20, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_reglement_interieur', 'foundational', 'QC', 'LSA', 'Règlement intérieur (Règlement nº 1)', 'By-Law No. 1 (Internal Governance)', 'Le règlement général qui régit le fonctionnement interne de la société : assemblées, vote, administrateurs, dirigeants, dividendes.', 'The general by-law governing the corporation''s internal operations: meetings, voting, directors, officers, dividends.', 'reglements', 20, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_bylaw_2', 'foundational', 'CA', 'CBCA', 'Règlement d''emprunt (Règlement nº 2)', 'Borrowing By-Law (By-Law No. 2)', 'Règlement autorisant la société à emprunter, émettre des titres de créance et hypothéquer ses biens.', 'By-law authorizing the corporation to borrow, issue debt securities and mortgage its assets.', 'reglements', 25, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_declaration_initiale', 'foundational', 'QC', 'LSA', 'Déclaration initiale (RE-200)', 'Initial Declaration (RE-200)', 'Formulaire déposé auprès du Registraire des entreprises dans les 60 jours suivant la constitution. Contient les informations sur les administrateurs et le siège social.', 'Form filed with the Registrar within 60 days of incorporation. Contains director and head office information.', 'avis', 30, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_declaration_initiale_qc', 'foundational', 'CA', 'CBCA', 'Déclaration initiale au Québec (RE-200)', 'Quebec Initial Declaration (RE-200)', 'Obligatoire pour toute société fédérale ayant son siège ou exerçant au Québec. À déposer dans les 60 jours.', 'Required for any federal corporation headquartered or operating in Quebec. Must be filed within 60 days.', 'avis', 35, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_first_board_resolution', 'foundational', 'CA', 'CBCA', 'Première résolution du conseil d''administration', 'First Board Resolution', 'Résolution d''organisation : règlements, dirigeants, émission d''actions, exercice financier, experts-comptables.', 'Organizational resolution: by-laws, officers, share issuance, fiscal year, accountants.', 'resolutions', 40, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_premiere_resolution_ca', 'foundational', 'QC', 'LSA', 'Première résolution du conseil d''administration', 'First Board Resolution', 'Résolution d''organisation adoptée par le premier conseil : adoption des règlements, nomination des dirigeants, émission d''actions, fixation de l''exercice financier.', 'Organizational resolution adopted by the first board: by-law adoption, officer appointments, share issuance, fiscal year.', 'resolutions', 40, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_first_shareholder_resolution', 'foundational', 'CA', 'CBCA', 'Première résolution des actionnaires', 'First Shareholder Resolution', 'Ratification des règlements, élection des administrateurs, dispense de vérificateur (art. 163 LCSA).', 'Ratification of by-laws, election of directors, auditor waiver (CBCA s.163).', 'resolutions', 50, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_premiere_resolution_actionnaires', 'foundational', 'QC', 'LSA', 'Première résolution des actionnaires', 'First Shareholder Resolution', 'Ratification des règlements adoptés par le conseil, élection des administrateurs, dispense de vérificateur.', 'Ratification of by-laws adopted by the board, election of directors, auditor waiver.', 'resolutions', 50, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_share_subscription', 'foundational', 'CA', 'CBCA', 'Lettre de souscription d''actions', 'Share Subscription Letter', 'Souscription initiale des actionnaires fondateurs aux actions de la société.', 'Initial subscription by founding shareholders to the corporation''s shares.', 'actionnaires', 60, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_souscription_actions', 'foundational', 'QC', 'LSA', 'Lettre de souscription d''actions', 'Share Subscription Letter', 'Document par lequel chaque actionnaire fondateur souscrit à ses actions initiales. Indique la catégorie, le nombre et le prix payé.', 'Document by which each founding shareholder subscribes to their initial shares. Shows class, quantity and price paid.', 'actionnaires', 60, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_director_acceptance', 'foundational', 'CA', 'CBCA', 'Déclaration d''acceptation du mandat d''administrateur', 'Director Acceptance of Mandate', 'Acceptation formelle du mandat, déclaration de résidence canadienne et d''éligibilité (18 ans+, non failli).', 'Formal acceptance of mandate, Canadian residency and eligibility declaration (18+, not bankrupt).', 'administrateurs', 70, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_acceptation_mandat', 'foundational', 'QC', 'LSA', 'Déclaration d''acceptation du mandat d''administrateur', 'Director Acceptance of Mandate', 'Chaque administrateur accepte formellement son mandat, déclare sa résidence canadienne et son éligibilité.', 'Each director formally accepts their mandate, declares Canadian residency and eligibility.', 'administrateurs', 70, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_annual_board_resolution', 'annual', 'CA', 'CBCA', 'Résolution annuelle du conseil d''administration', 'Annual Board Resolution', 'Approbation des états financiers, confirmation des dirigeants, nomination de l''expert-comptable.', 'Approval of financial statements, officer confirmation, accountant appointment.', 'resolutions', 100, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_annual_board_resolution', 'annual', 'QC', 'LSA', 'Résolution annuelle du conseil d''administration', 'Annual Board Resolution', 'Approbation des états financiers, confirmation des dirigeants, nomination de l''expert-comptable.', 'Approval of financial statements, officer confirmation, accountant appointment.', 'resolutions', 100, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_annual_shareholder_resolution', 'annual', 'CA', 'CBCA', 'Résolution annuelle des actionnaires', 'Annual Shareholder Resolution', 'Ratification des résolutions du conseil, réélection des administrateurs, fixation du nombre d''administrateurs.', 'Ratification of board resolutions, director re-election, board size confirmation.', 'resolutions', 110, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_annual_shareholder_resolution', 'annual', 'QC', 'LSA', 'Résolution annuelle des actionnaires', 'Annual Shareholder Resolution', 'Ratification des résolutions du conseil, réélection des administrateurs, dispense de vérificateur.', 'Ratification of board resolutions, director re-election, auditor waiver.', 'resolutions', 110, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_auditor_waiver', 'annual', 'CA', 'CBCA', 'Résolution — Dispense de vérificateur (art. 163 LCSA)', 'Auditor Waiver Resolution (CBCA s.163)', 'Les actionnaires renoncent unanimement à la nomination d''un vérificateur conformément à l''article 163 de la LCSA.', 'Shareholders unanimously waive the appointment of an auditor per CBCA section 163.', 'resolutions', 120, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_auditor_waiver', 'annual', 'QC', 'LSA', 'Résolution — Dispense de vérificateur', 'Auditor Waiver Resolution', 'Les actionnaires renoncent unanimement à la nomination d''un vérificateur pour l''exercice en cours.', 'Shareholders unanimously waive the appointment of an auditor for the current fiscal year.', 'resolutions', 120, true, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_annual_return', 'annual', 'CA', 'CBCA', 'Rapport annuel — Corporations Canada', 'Annual Return — Corporations Canada', 'Rapport annuel obligatoire déposé auprès de Corporations Canada dans le mois anniversaire de la constitution.', 'Mandatory annual return filed with Corporations Canada during the anniversary month of incorporation.', 'avis', 130, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('lsaq_req_annual_update', 'annual', 'QC', 'LSA', 'Mise à jour annuelle au REQ', 'REQ Annual Update', 'Déclaration annuelle de mise à jour auprès du Registraire des entreprises du Québec.', 'Annual update declaration filed with the Quebec Registrar of Enterprises.', 'avis', 130, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
INSERT INTO minute_book_requirements (requirement_key, category, jurisdiction, framework, title_fr, title_en, description_fr, description_en, section, sort_order, can_generate, can_upload) VALUES ('cbca_req_annual_update_qc', 'annual', 'CA', 'CBCA', 'Mise à jour annuelle au REQ (société fédérale au QC)', 'REQ Annual Update (Federal corp in QC)', 'Obligatoire pour toute société fédérale exerçant au Québec — en plus du rapport annuel fédéral.', 'Required for any federal corporation operating in Quebec — in addition to the federal annual return.', 'avis', 140, false, true) ON CONFLICT (requirement_key, framework) DO NOTHING;
