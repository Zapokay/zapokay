-- =============================================================================
-- Le registre des particuliers ayant un contrôle important (LCSA art. 21.1)
-- SECONDE MIGRATION — la forme que l'autorité a tranchée
--   significant_control_individuals               : les particuliers, art. 21.1(1)a) à d)
--   significant_control_individual_citizenships   : leurs citoyennetés, 21.1(1)a.1)
--   significant_control_individual_tax_residences : leurs résidences fiscales, 21.1(1)b)
--   significant_control_diligence_steps           : chaque mesure prise, 21.1(1)f)
--   significant_control_statements                : la déclaration de la société qui n'en
--                                                   identifie aucun, art. 21.2 LCSA et
--                                                   art. 34.1 DORS/2001-512
-- =============================================================================
--
-- ⚖️ POURQUOI, 2026-09-14 : l'avocat a répondu, et le gabarit de Corporations Canada a
-- été relevé. Trois choses posées par 20260914160000 étaient fausses contre la source —
-- deux manières de détenir au lieu de trois, un nom en un champ au lieu de trois, un
-- pourcentage là où la loi porte deux tests — et trois colonnes attendaient leur forme.
--
-- ⛔ DROP ET RECRÉATION, PAR DÉCISION, PLUTÔT QU'UNE PILE D'ALTER. Les deux tables ont
-- été mesurées vides, et aucun code ne les lit. Le bloc DO qui suit REFUSE de continuer
-- si une seule ligne y est apparue depuis : un DROP sur une table qui aurait reçu une
-- ligne n'est pas une option.
--
-- ⛔ LE SOCLE RESTE INERTE. Aucun écran, aucune route, aucun registre au Livre, aucune
-- entrée dans l'archive — check:significant-control le vérifie, sur les cinq tables.
--
-- ⛔ AUCUN LIBELLÉ ICI. Une colonne fermée stocke une CLÉ ; le libellé officiel se
-- rendra à l'affichage, depuis le catalogue i18n, avec la première surface.
--
-- ★ CHAQUE ENSEMBLE FERMÉ NOMME SA SOURCE ET SA DATE, en COMMENT ON CONSTRAINT : la garde
-- de parité impose la cohérence d'une CHECK et de son type, pas leur justesse — ils
-- peuvent être faux ensemble.
--
-- ⚪ LES CINQ POLITIQUES PORTENT LA FORME DE LA MAISON, « Users can manage their own
-- company … », PAR DÉCISION (2026-09-14). Leurs noms dépassent 63 octets et Postgres
-- les tronque — il les tronque aussi dans un DROP POLICY écrit en toutes lettres :
-- mesuré, le DROP réussit. Ne pas les « raccourcir ».
--
-- ⛔ ADDITIVE AU DÉPLOIEMENT : rien ne lit ces tables, l'ordre face au code est sans
-- conséquence.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.significant_control_individuals)
     OR EXISTS (SELECT 1 FROM public.significant_control_diligence_steps) THEN
    RAISE EXCEPTION 'significant_control_* a reçu une ligne : cette migration refuse de la supprimer. Écrire des ALTER.';
  END IF;
END
$$;

DROP TABLE public.significant_control_individuals;
DROP TABLE public.significant_control_diligence_steps;

-- -----------------------------------------------------------------------------
-- A. Les particuliers
-- -----------------------------------------------------------------------------
CREATE TABLE public.significant_control_individuals (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name                   text NOT NULL,
  middle_name                  text,
  last_name                    text NOT NULL,
  date_of_birth                date,
  address_line1                text,
  address_line2                text,
  address_city                 text,
  address_province             text,
  address_postal_code          text,
  address_country              text,
  service_address_line1        text,
  service_address_line2        text,
  service_address_city         text,
  service_address_province     text,
  service_address_postal_code  text,
  service_address_country      text,
  start_date_of_control        date NOT NULL,
  end_date_of_control          date,
  holding_manner               text NOT NULL
    CONSTRAINT significant_control_individuals_holding_manner_check
    CHECK (holding_manner IN ('direct', 'indirect', 'both')),
  concert_manner               text NOT NULL
    CONSTRAINT significant_control_individuals_concert_manner_check
    CHECK (concert_manner IN ('individually', 'jointly', 'in_concert')),
  type_of_interest_or_control  text NOT NULL
    CONSTRAINT significant_control_individuals_interest_type_check
    CHECK (type_of_interest_or_control IN ('shares', 'control_in_fact', 'combination')),
  type_additional_info         text,
  percentage_votes             numeric,
  percentage_fair_market_value numeric,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT significant_control_individuals_control_dates_check
    CHECK (end_date_of_control IS NULL OR end_date_of_control >= start_date_of_control)
);

COMMENT ON TABLE public.significant_control_individuals IS
  'Les particuliers ayant un contrôle important (LCSA art. 21.1(1)a) à d)). Jeu de champs : gabarit 06.1 de Corporations Canada (demande de renseignements), partie B, daté 2023-12, relevé le 2026-09-14 — à revérifier contre la source avant de construire une surface. SOCLE INERTE : aucun lecteur ni écrivain applicatif, garde check:significant-control. Citoyennetés et résidences fiscales : tables significant_control_individual_citizenships et significant_control_individual_tax_residences. Ne pas réemployer company_people.citizenship.';
COMMENT ON COLUMN public.significant_control_individuals.first_name IS
  'Le nom est en trois champs, comme au gabarit : first_name, middle_name, last_name. Le nom complet se COMPOSE en un seul endroit, écrit avec la première surface qui le lit — ni stocké ici, ni composé avant elle.';
COMMENT ON COLUMN public.significant_control_individuals.address_line1 IS
  'Adresse résidentielle : les six colonnes address_*, sous les mêmes noms que company_people.';
COMMENT ON COLUMN public.significant_control_individuals.service_address_line1 IS
  'Adresse aux fins de signification, si elle a été fournie (art. 21.1(1)a)(iii)) : les six colonnes service_address_*, toutes nullables.';
COMMENT ON COLUMN public.significant_control_individuals.end_date_of_control IS
  'NULL = contrôle en cours. Jamais antérieure au début (significant_control_individuals_control_dates_check) : un registre légal dont l''intervalle est inversé est indéfendable. Le même jour est admis — une acquisition et une perte le même jour existent.';
COMMENT ON COLUMN public.significant_control_individuals.holding_manner IS
  'direct | indirect | both — pendant TypeScript : SignificantControlHoldingManner (lib/supabase/significant-control-types.ts). Trois valeurs : 20260914160000 en portait deux, tirées d''un registre de cabinet et non du gabarit.';
COMMENT ON COLUMN public.significant_control_individuals.concert_manner IS
  'individually | jointly | in_concert — pendant TypeScript : SignificantControlConcertManner (lib/supabase/significant-control-types.ts).';
COMMENT ON COLUMN public.significant_control_individuals.type_of_interest_or_control IS
  'shares | control_in_fact | combination — une CLÉ, jamais le libellé rendu ; pendant TypeScript : SignificantControlInterestType (lib/supabase/significant-control-types.ts). NOT NULL : la description de la manière dont chaque particulier a un contrôle important est exigée (art. 21.1(1)d)).';
COMMENT ON COLUMN public.significant_control_individuals.type_additional_info IS
  'Le champ libre du gabarit, à côté du type d''intérêt ou de contrôle. Il porte aussi la précision que la transmission perd : elle n''envoie qu''un pourcentage, le registre en tient deux.';
COMMENT ON COLUMN public.significant_control_individuals.percentage_votes IS
  'Le test des droits de vote (art. 2.1(3)a) LCSA). Saisi tel que déclaré, jamais calculé : le produit ne détermine pas qui a un contrôle important. AUCUNE CHECK ne le lie au type d''intérêt : le formulaire demande le pourcentage sans condition, et une CHECK est une affirmation juridique.';
COMMENT ON COLUMN public.significant_control_individuals.percentage_fair_market_value IS
  'Le test de la juste valeur marchande (art. 2.1(3)b) LCSA), indépendant de celui des voix : un particulier peut avoir un contrôle important par l''un sans l''avoir par l''autre, et le registre dit lequel. Saisi tel que déclaré, jamais calculé.';

COMMENT ON CONSTRAINT significant_control_individuals_holding_manner_check ON public.significant_control_individuals IS
  'SOURCE DE L''ÉNUMÉRATION : Corporations Canada, gabarit 06.1 (demande de renseignements), partie B — gabarit daté 2023-12, relevé le 2026-09-14.';
COMMENT ON CONSTRAINT significant_control_individuals_concert_manner_check ON public.significant_control_individuals IS
  'SOURCE DE L''ÉNUMÉRATION : Corporations Canada, gabarit 06.1 (demande de renseignements), partie B — gabarit daté 2023-12, relevé le 2026-09-14.';
COMMENT ON CONSTRAINT significant_control_individuals_interest_type_check ON public.significant_control_individuals IS
  'SOURCE DE L''ÉNUMÉRATION : Corporations Canada, gabarit 06.1 (demande de renseignements), partie B — gabarit daté 2023-12, relevé le 2026-09-14.';

ALTER TABLE public.significant_control_individuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control individuals"
  ON public.significant_control_individuals FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

CREATE TRIGGER update_significant_control_individuals_updated_at
  BEFORE UPDATE ON public.significant_control_individuals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- A.1 Les citoyennetés, et A.2 les résidences fiscales — une ligne par pays
-- -----------------------------------------------------------------------------
-- ⭐ LA LOI DIT LE SINGULIER (art. 21.1(1)a.1) et b)), LE GABARIT DE DÉPÔT DEMANDE LES
-- PAYS AU PLURIEL — et un particulier à double citoyenneté dont une seule est inscrite
-- rendrait le registre non exhaustif (art. 21.1(2)). Deux tables, pas deux colonnes.
-- ⛔ AUCUNE CHECK N'ÉNUMÈRE LES PAYS : la liste est lib/countries.ts (COUNTRY_CODES), et
-- une liste SQL en serait une seconde déclaration. La base accepte donc tout texte ; la
-- liste s'imposera à la saisie, avec la première surface.
-- ★ Pas de company_id : la propriété passe par le particulier. Pas d'updated_at : une
-- ligne se crée ou se supprime, elle ne se modifie pas.
CREATE TABLE public.significant_control_individual_citizenships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id uuid NOT NULL
    CONSTRAINT significant_control_citizenships_individual_fkey
    REFERENCES public.significant_control_individuals(id) ON DELETE CASCADE,
  country_code  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT significant_control_citizenships_individual_country_key
    UNIQUE (individual_id, country_code)
);

COMMENT ON TABLE public.significant_control_individual_citizenships IS
  'Les citoyennetés d''un particulier ayant un contrôle important (LCSA art. 21.1(1)a.1)), une ligne par pays. SOCLE INERTE : garde check:significant-control.';
COMMENT ON COLUMN public.significant_control_individual_citizenships.country_code IS
  'Code ISO 3166-1 alpha-2 de lib/countries.ts (COUNTRY_CODES), jamais d''une liste neuve. Aucune CHECK : la base ne l''impose pas.';

ALTER TABLE public.significant_control_individual_citizenships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control citizenships"
  ON public.significant_control_individual_citizenships FOR ALL
  USING (individual_id IN (
    SELECT id FROM public.significant_control_individuals
    WHERE company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  ));

CREATE TABLE public.significant_control_individual_tax_residences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id uuid NOT NULL
    CONSTRAINT significant_control_tax_residences_individual_fkey
    REFERENCES public.significant_control_individuals(id) ON DELETE CASCADE,
  country_code  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT significant_control_tax_residences_individual_country_key
    UNIQUE (individual_id, country_code)
);

COMMENT ON TABLE public.significant_control_individual_tax_residences IS
  'Les pays où un particulier ayant un contrôle important est résident à des fins fiscales (LCSA art. 21.1(1)b)), une ligne par pays. SOCLE INERTE : garde check:significant-control.';
COMMENT ON COLUMN public.significant_control_individual_tax_residences.country_code IS
  'Code ISO 3166-1 alpha-2 de lib/countries.ts (COUNTRY_CODES), jamais d''une liste neuve. Aucune CHECK : la base ne l''impose pas.';

ALTER TABLE public.significant_control_individual_tax_residences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control tax residences"
  ON public.significant_control_individual_tax_residences FOR ALL
  USING (individual_id IN (
    SELECT id FROM public.significant_control_individuals
    WHERE company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  ));

-- -----------------------------------------------------------------------------
-- B. Les mesures de diligence — le journal continu, art. 21.1(1)f) et 21.1(2)
-- -----------------------------------------------------------------------------
CREATE TABLE public.significant_control_diligence_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_date   date NOT NULL,
  steps_taken text NOT NULL,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.significant_control_diligence_steps IS
  'Chaque mesure prise pour identifier les particuliers ayant un contrôle important et tenir le registre exact (LCSA art. 21.1(1)f) et 21.1(2)) : le journal continu. SOCLE INERTE : aucun lecteur ni écrivain applicatif, garde check:significant-control.';
COMMENT ON COLUMN public.significant_control_diligence_steps.recorded_by IS
  'Le COMPTE qui a consigné la mesure. NULLABLE et SANS DÉFAUT : mesuré le 2026-09-14, le produit ne lie aucun compte à une personne de company_people — il pourra dire quel compte a consigné, pas quelle personne du dossier ; ce qui en sera rendu n''est pas décidé. ON DELETE SET NULL, PAR DÉCISION (2026-09-14) : le FAIT qu''une diligence a eu lieu à une date est la donnée légalement opérante (art. 21.1(2) LCSA, une fois par exercice) ; l''attribution est accessoire. Une clé bloquante empêcherait la suppression d''un compte, donc un droit à l''effacement, avant que les règles de protection des renseignements personnels (Loi 25, LPRPDE) aient été lues.';

ALTER TABLE public.significant_control_diligence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control diligence steps"
  ON public.significant_control_diligence_steps FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

CREATE TRIGGER update_significant_control_diligence_steps_updated_at
  BEFORE UPDATE ON public.significant_control_diligence_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- C. La déclaration « aucun particulier identifié » — art. 21.2 LCSA, art. 34.1 DORS/2001-512
-- -----------------------------------------------------------------------------
-- ⛔ CE N'EST PAS UN REGISTRE VIDE, C'EST UN REGISTRE REMPLI AUTREMENT. La société incapable
-- d'identifier un particulier consigne AU REGISTRE l'une des deux déclarations, plus un
-- résumé des mesures prises.
-- ★ DISTINCTE DES MESURES DE DILIGENCE : 21.1(1)f) décrit chaque mesure, au fil de l'eau ;
-- 34.1 est une déclaration sur l'état du registre, avec son propre déclencheur.
CREATE TABLE public.significant_control_statements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_date date NOT NULL,
  statement_kind text NOT NULL
    CONSTRAINT significant_control_statements_kind_check
    CHECK (statement_kind IN ('unable_to_identify', 'none_exist')),
  steps_summary  text NOT NULL,
  recorded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.significant_control_statements IS
  'La déclaration consignée au registre par la société incapable d''identifier un particulier ayant un contrôle important (LCSA art. 21.2, DORS/2001-512 art. 34.1). SOCLE INERTE : aucun lecteur ni écrivain applicatif, garde check:significant-control.';
COMMENT ON COLUMN public.significant_control_statements.statement_kind IS
  'unable_to_identify | none_exist — une CLÉ, jamais le libellé rendu ; pendant TypeScript : SignificantControlStatementKind (lib/supabase/significant-control-types.ts).';
COMMENT ON COLUMN public.significant_control_statements.steps_summary IS
  'Le résumé des mesures prises pour tenter d''identifier ces particuliers (art. 34.1b) DORS/2001-512). NOT NULL : la déclaration sans son résumé n''est pas celle que le règlement prescrit.';
COMMENT ON COLUMN public.significant_control_statements.recorded_by IS
  'Le COMPTE qui a consigné la déclaration, jamais une personne du dossier. ON DELETE SET NULL, par la décision prise pour significant_control_diligence_steps.recorded_by : le fait de la déclaration survit à la suppression du compte.';

COMMENT ON CONSTRAINT significant_control_statements_kind_check ON public.significant_control_statements IS
  'SOURCE DE L''ÉNUMÉRATION : DORS/2001-512, art. 34.1a)(i) et (ii) (DORS/2023-88), pris pour l''art. 21.2 LCSA — pas un gabarit : le règlement, texte à jour au 2026-07-21, relevé le 2026-09-14 ; les deux variantes sont confirmées par Corporations Canada.';

ALTER TABLE public.significant_control_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control statements"
  ON public.significant_control_statements FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

CREATE TRIGGER update_significant_control_statements_updated_at
  BEFORE UPDATE ON public.significant_control_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
