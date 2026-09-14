-- =============================================================================
-- Le socle du registre des particuliers ayant un contrôle important (LCSA art. 21.1)
--   significant_control_individuals      : la Partie A du formulaire, les particuliers
--   significant_control_diligence_steps  : la Partie B, les mesures de diligence
-- =============================================================================
--
-- ⚖️ UN SOCLE INERTE, PAR DÉCISION (2026-09-14). Ces deux tables n'ont aucun
-- lecteur ni écrivain dans l'application — check:significant-control le vérifie et
-- échoue le jour où une surface les branche. Aucun écran, aucune route, aucun
-- registre au Livre, aucune entrée dans l'archive.
-- La raison : trois champs exigés par l'art. 21.1(1) attendent la réponse de
-- l'avocat sur leur FORME (voir le commentaire de la table A). Un registre montré
-- sans eux serait un registre légal incomplet qui ne dit pas qu'il l'est.
--
-- ⛔ LE NOMMAGE ÉVITE LE SIGLE ANGLAIS DE TROIS LETTRES. Le dépôt le porte déjà
-- comme licence de paquets npm : tout balayage de ce concept en serait pollué.
-- `significant_control_` se cherche sans bruit.
--
-- ⛔ LE PRODUIT NE DÉTERMINE JAMAIS QUI A UN CONTRÔLE IMPORTANT. Ces tables
-- tiennent ce que la société déclare ; aucune colonne n'est calculée.
--
-- ⛔ ADDITIVE, UNE SEULE MIGRATION. Rien ne lit ces tables : son ordre face au
-- déploiement est sans conséquence. `supabase db push` applique TOUT ce qui est
-- en attente — au 2026-09-14, le distant et le dépôt s'arrêtent tous deux à
-- 20260913150000, donc cette migration est la seule qu'il appliquera.
--
-- ★ CALQUÉE SUR company_people : RLS « propriétaire de la société » citant
-- auth.uid(), updated_at tenu par update_updated_at_column(), aucune politique de
-- lecture publique. Aucun DEFAULT ne fabrique une valeur déclarée : seuls l'id et
-- les deux horodatages en portent un, comme sur toutes les tables du dépôt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Les particuliers
-- -----------------------------------------------------------------------------
CREATE TABLE public.significant_control_individuals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_legal_name             text NOT NULL,
  date_of_birth               date,
  address_line1               text,
  address_line2               text,
  address_city                text,
  address_province            text,
  address_postal_code         text,
  address_country             text,
  service_address_line1       text,
  service_address_line2       text,
  service_address_city        text,
  service_address_province    text,
  service_address_postal_code text,
  service_address_country     text,
  start_date_of_control       date NOT NULL,
  end_date_of_control         date,
  holding_manner              text NOT NULL
    CONSTRAINT significant_control_individuals_holding_manner_check
    CHECK (holding_manner IN ('direct', 'indirect')),
  concert_manner              text NOT NULL
    CONSTRAINT significant_control_individuals_concert_manner_check
    CHECK (concert_manner IN ('individually', 'jointly', 'in_concert')),
  percentage_interest         numeric,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT significant_control_individuals_control_dates_check
    CHECK (end_date_of_control IS NULL OR end_date_of_control >= start_date_of_control)
);

COMMENT ON TABLE public.significant_control_individuals IS
  'Partie A du registre des particuliers ayant un contrôle important (LCSA art. 21.1). SOCLE INERTE : aucun lecteur ni écrivain applicatif, garde check:significant-control. TROIS COLONNES DÉLIBÉRÉMENT ABSENTES : citizenship, tax_residence, type_of_interest_or_control — en attente de la réponse de l''avocat sur leur forme ; voir le registre du cabinet, colonnes au PLURIEL. Ne pas les créer au singulier, et ne pas réemployer company_people.citizenship.';
COMMENT ON COLUMN public.significant_control_individuals.address_line1 IS
  'Adresse résidentielle : les six colonnes address_*, sous les mêmes noms que company_people.';
COMMENT ON COLUMN public.significant_control_individuals.service_address_line1 IS
  'Adresse de signification, si elle diffère : les six colonnes service_address_*, toutes nullables.';
COMMENT ON COLUMN public.significant_control_individuals.end_date_of_control IS
  'NULL = contrôle en cours. Jamais antérieure au début (significant_control_individuals_control_dates_check) : un registre légal dont l''intervalle est inversé est indéfendable. Le même jour est admis — une acquisition et une perte le même jour existent.';
COMMENT ON COLUMN public.significant_control_individuals.holding_manner IS
  'direct | indirect — pendant TypeScript : SignificantControlHoldingManner (lib/supabase/significant-control-types.ts).';
COMMENT ON COLUMN public.significant_control_individuals.concert_manner IS
  'individually | jointly | in_concert — pendant TypeScript : SignificantControlConcertManner (lib/supabase/significant-control-types.ts).';
COMMENT ON COLUMN public.significant_control_individuals.percentage_interest IS
  'Saisi tel que déclaré, jamais calculé : le produit ne détermine pas qui a un contrôle important.';

ALTER TABLE public.significant_control_individuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own company significant control individuals"
  ON public.significant_control_individuals FOR ALL
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

CREATE TRIGGER update_significant_control_individuals_updated_at
  BEFORE UPDATE ON public.significant_control_individuals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- B. Les mesures de diligence
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
  'Partie B du registre des particuliers ayant un contrôle important (LCSA art. 21.1) : les mesures prises pour identifier ces particuliers. SOCLE INERTE : aucun lecteur ni écrivain applicatif, garde check:significant-control.';
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
