-- =============================================================================
-- Le pays d'une société actionnaire cesse d'être fabriqué — le jumeau
--   1a. shareholder_entities.address_line2 — colonne ajoutée
--   1b. shareholder_entities.address_country — DROP DEFAULT
--   1c. les 3 lignes sans lieu passent à NULL (pays ET province)
--   1d. create_entity_with_signatories — le COALESCE tombe, line2 s'ajoute
-- =============================================================================
--
-- ⚠️ CECI N'EST PAS QU'UNE MIGRATION DE SCHÉMA. C'est une CORRECTION DE
-- DONNÉES sur 3 lignes d'une base partagée. L'état antérieur des 3 lignes —
-- id, dénomination, société, pays, province — a été capturé avant exécution et
-- reste restaurable ligne à ligne :
--
--   b4b7d459-8024-4b09-adc3-6876e9693d76  Guitars Inc.  province QC  pays CA
--   1e1e0ff6-30cd-4e3c-b3bc-14b00946467f  Drum Inc.     province QC  pays CA
--   c3967bd2-ad58-40ba-bba3-74b3404b7e90  Bass Inc.     province QC  pays CA
--
-- Les trois appartiennent à la même société, 8ac291cc-bef5-48d1-aad0-cfb750131d8c.
--
-- Elle achève ce que 20260909173000 avait explicitement laissé ouvert. Ce
-- fichier-là écrivait : « ⛔ shareholder_entities.address_country garde SON
-- défaut. Sa fonction d'écriture porte en plus un COALESCE(…, 'CA') qui
-- refabriquerait le pays quoi qu'il arrive : les deux pièces ne se séparent
-- pas, et elles ont leur propre dossier. » C'est ce dossier.
--
-- -----------------------------------------------------------------------------
-- POURQUOI UNE SIXIÈME COLONNE (1a)
-- -----------------------------------------------------------------------------
-- La table n'en portait que CINQ : pas d'address_line2, là où company_people en
-- a six depuis 20260905141500. À six, la forme d'une société devient identique
-- à celle d'une personne, et `adresseRegistre` (lib/address.ts) s'y applique
-- SANS VARIANTE. Une composition d'adresse, pas deux — c'est la condition pour
-- que le registre puisse un jour porter les deux sans se dédoubler.
--
-- ⚪ Le registre des actionnaires NE gagne PAS d'adresse dans ce lot. Une
-- adresse d'entité reste INCORRIGIBLE : 0 UPDATE en code, 0 en SQL, aucun écran
-- d'édition. Imprimer sur un document une donnée que personne ne peut réparer
-- attendra que le chemin de correction existe.
--
-- -----------------------------------------------------------------------------
-- POURQUOI LE DÉFAUT TOMBE (1b) ET POURQUOI ÇA NE SUFFISAIT PAS
-- -----------------------------------------------------------------------------
-- Deux pièces fabriquaient le pays, et retirer une seule n'aurait rien changé :
--
--   · la colonne portait DEFAULT 'CA'::text ;
--   · la fonction portait COALESCE(NULLIF(…, ''), 'CA').
--
-- Le DEFAULT ne se déclenchait même pas : la fonction fournit TOUJOURS une
-- valeur à la colonne, donc c'est le COALESCE qui posait 'CA'. Le défaut était
-- une seconde fabrication, dormante, qui aurait pris le relais le jour où un
-- autre appelant aurait omis la colonne. Les deux tombent ensemble.
--
-- ⛔ Et une TROISIÈME pièce vivait hors de la base : le formulaire n'avait
-- AUCUN champ pays. L'appelant ne pouvait pas envoyer la clé même s'il l'avait
-- voulu. Elle est corrigée dans le même lot, côté applicatif.
--
-- -----------------------------------------------------------------------------
-- POURQUOI CES 3 LIGNES (1c)
-- -----------------------------------------------------------------------------
-- La condition est celle du lot d1746da, mot pour mot — le LIEU, pas la date :
--
--     address_country IS NOT NULL
-- AND address_line1   IS NULL
-- AND address_city    IS NULL
--
-- Mesuré avant exécution : 3 lignes visées, 0 épargnée. La règle attrape TOUT
-- le parc d'entités, et c'est exact — aucune des trois n'a jamais porté une
-- voie ni une ville. Un pays sans aucun lieu ne dit rien de personne.
--
-- ⚠️ LE RISQUE RÉSIDUEL, ÉNONCÉ AU CONDITIONNEL, comme pour les personnes. Si
-- quelqu'un avait déclaré un pays SEUL, sans voie ni ville, cette migration
-- l'effacerait. La mesure dit qu'il n'en existe aucune — mais la règle ne peut
-- pas distinguer une déclaration solitaire d'un défaut, et il faut le dire
-- plutôt que de l'affirmer résolu.
--
-- LA PROVINCE PART AVEC, pour le même motif qu'au lot précédent : les 3 portent
-- « QC », venu d'un useState('QC') de formulaire, sans lieu autour. Fabriquée
-- par le même mécanisme, sur la même ligne. La laisser garderait une moitié du
-- mensonge.
--
-- ★ CONSÉQUENCE VISIBLE : AUCUNE. Recensé avant exécution — rien ne LIT une
-- colonne d'adresse d'entité, nulle part : ni écran, ni PDF, ni export. La
-- carte d'un actionnaire-société montre sa dénomination, son badge et son
-- descripteur, et son bloc d'identité est gardé par `!isEntity`. La
-- fabrication était invisible ; elle n'attendait qu'une colonne de registre
-- pour sortir sur un document.
--
-- -----------------------------------------------------------------------------
-- LA FONCTION EST REMPLACÉE, JAMAIS SUPPRIMÉE PUIS RECRÉÉE (1d)
-- -----------------------------------------------------------------------------
-- ⛔ CREATE OR REPLACE, ET C'EST UNE PRÉCAUTION MESURÉE. Relevé avant
-- réécriture : propriétaire `postgres`, et une ACL qui accorde EXECUTE à
-- PUBLIC, postgres, anon, authenticated et service_role. CREATE OR REPLACE sur
-- la MÊME signature conserve les deux. Un DROP suivi d'un CREATE les
-- réinitialiserait et couperait anon/authenticated EN SILENCE : la RPC
-- tomberait en permission denied à l'exécution, pas à la migration.
--
-- ⛔ SECURITY INVOKER est reconduit EXPLICITEMENT. C'est l'état relevé
-- (prosecdef = false) et un choix documenté depuis 20260609120000 : la RLS
-- s'évalue sous l'utilisateur appelant, aucune escalade.
--
-- ⛔ AUCUN `SET search_path` N'EST AJOUTÉ. Relevé : proconfig est NULL. En
-- poser un serait un changement de comportement, pas une reproduction.
--
-- Le corps ne change que sur deux points : address_country rejoint le patron
-- des onze autres champs — NULLIF(…, '') seul, sans repli — et address_line2
-- s'ajoute. Onze champs sur douze portaient déjà ce patron ; le corps déclarait
-- donc lui-même sa propre exception.
-- =============================================================================

-- 1a — la sixième colonne.
ALTER TABLE shareholder_entities ADD COLUMN IF NOT EXISTS address_line2 text;

COMMENT ON COLUMN shareholder_entities.address_line2 IS
  'Suite / appartement. Ajoutée pour que la forme d''adresse d''une société '
  'soit identique à celle d''une personne (company_people en a six depuis '
  '20260905141500), et que lib/address.ts s''y applique sans variante.';

-- 1b — le défaut tombe.
ALTER TABLE shareholder_entities ALTER COLUMN address_country DROP DEFAULT;

-- 1c — les 3 lignes sans lieu.
UPDATE shareholder_entities
   SET address_country  = NULL,
       address_province = NULL
 WHERE address_country IS NOT NULL
   AND address_line1   IS NULL
   AND address_city    IS NULL;

-- 1d — la fonction cesse de fabriquer.
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
    address_line2,
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
    NULLIF(p_entity ->> 'address_line2', ''),
    NULLIF(p_entity ->> 'address_city', ''),
    NULLIF(p_entity ->> 'address_province', ''),
    NULLIF(p_entity ->> 'address_postal_code', ''),
    -- ⛔ LE COALESCE EST PARTI. Le pays suit le même patron que les onze autres
    -- champs : ce que l'appelant envoie, et rien d'autre. Une clé absente rend
    -- désormais NULL — ce qui est vrai — au lieu de 'CA', qui ne l'était pas.
    NULLIF(p_entity ->> 'address_country', '')
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
  'entity_id afterward. 20260910210000: address_country no longer defaulted to '
  '''CA'' — it follows the same NULLIF pattern as every other field; '
  'address_line2 added.';
