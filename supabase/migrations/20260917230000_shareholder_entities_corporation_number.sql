-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE CE FICHIER CONTIENT, EXACTEMENT — DEUX INSTRUCTIONS
-- ═══════════════════════════════════════════════════════════════════════════
--   ① ALTER TABLE shareholder_entities ADD COLUMN corporation_number TEXT
--      (nullable, sans contrainte, sans DEFAULT) ;
--   ② CREATE OR REPLACE de create_entity_with_signatories, pour qu'elle
--      transporte la colonne neuve. Le corps est celui de 20260910210000,
--      ligne pour ligne, PLUS deux lignes.
-- Aucune table créée. Aucune donnée touchée. Aucune ligne supprimée.
-- Aucun DROP, aucun DEFAULT, aucune contrainte.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔⛔ CE QUE CE FICHIER NE FAIT PAS : IL NE RENOMME PAS `entity_number`
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚖️ Le brief du 2026-09-17 prévoyait `entity_number` → `neq`, à la condition
-- expresse qu'un recensement mécanique ne laisse AUCUN cas ambigu. Il en a
-- laissé UN, et la règle de Dom s'applique : on s'arrête et on ajoute seul.
--
-- ⛔ LE CAS. `docs/proposals/phase-10a5-decomposition-2026-05-14.md:65` déclare :
--     « `entity_number TEXT` (NEQ for QC corps, CORPORATION NUMBER FOR FEDERAL
--       CORPS; nullable for trusts) »
-- La colonne a donc été CONÇUE pour porter l'un OU l'autre selon le régime.
-- La renommer `neq` contredirait un document daté et mentirait sur toute ligne
-- qui porterait un numéro fédéral.
--
-- ★ ET LA MESURE MONTRE QUE LES DEUX SE SONT ÉLOIGNÉS : les quatre surfaces de
-- saisie l'étiquettent « NEQ », refusent par `errorNeq`, et appliquent
-- `replace(/\D/g,'')` + `maxLength={10}` — le format exact du NEQ. Les 8 lignes
-- du parc qui en portent un font TOUTES exactement dix chiffres. L'intention
-- déclarée dit « les deux » ; le code et les données disent « le NEQ ».
-- ⚠️ ET C'EST DÉJÀ CASSÉ POUR LE FÉDÉRAL : un numéro fédéral s'écrit 1709431-1 ;
-- le décapage des non-chiffres en ferait 17094311, sans trait d'union et hors
-- du format attendu. La colonne ne peut pas tenir sa promesse d'origine.
--
-- ⭐ C'EST CE QUI REND LA COLONNE NEUVE DUE, PAS FACULTATIVE : elle donne au
-- numéro fédéral l'endroit que le document de 2026-05-14 croyait lui avoir
-- donné. Le renommage de `entity_number` reste en DETTE, écrite ici et non
-- ailleurs, avec son coût : deux fonctions SQL, `ChargeEntite`,
-- `CorrectifEntite`, `ValeurEntite` et quatre surfaces.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚪ POURQUOI `jurisdiction` RESTE MORTE
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesuré le 2026-09-17 : 0 des 11 entités du parc en portent une ; aucun code
-- ne l'écrit, ne la lit ni ne l'expose — quatre commentaires du dépôt le disent
-- déjà, depuis le 2026-09-11.
-- ⛔ ET LA PAIRE DE NUMÉROS NE LA RESSUSCITE PAS, AU CONTRAIRE : avec les deux
-- numéros, le régime devient DÉRIVABLE — un numéro fédéral vaut société
-- fédérale. Réveiller `jurisdiction` ferait une SECONDE source pour un fait que
-- les numéros portent déjà. Elle reste morte, et cette ligne est sa pierre.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ADDITIVITÉ
-- ═══════════════════════════════════════════════════════════════════════════
-- Colonne nullable, sans DEFAULT et sans CHECK : aucune ligne existante ne peut
-- être refusée — c'est vrai par construction, et mesuré après le push.
-- ⚪ `IF NOT EXISTS` : rejouable sans erreur, comme les migrations voisines.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE shareholder_entities
  ADD COLUMN IF NOT EXISTS corporation_number TEXT;

COMMENT ON COLUMN shareholder_entities.corporation_number IS
  'Numero de societe federal (Corporations Canada) d''une entite actionnaire. '
  'OFFERT, JAMAIS EXIGE (decision de Dom, 2026-09-17) : a l''etape 2 les deux '
  'numeros sont exiges parce que c''est LA societe de l''utilisateur ; ici '
  'c''est un TIERS, dont le numero n''est pas toujours sous la main. '
  'Aucun format impose : un numero federal s''ecrit 1709431-1 ou 17094311, et '
  'refuser une forme legitime coute un client. Voir companies.corporation_number.';

-- ⛔ LA FONCTION DOIT APPRENDRE LA COLONNE, SINON LA VALEUR EST JETÉE EN
--    SILENCE. C'est elle qui insère toute entité créée (inscription et
--    application) ; une clé qu'elle ne nomme pas n'atteint jamais la table.
-- ★ CORPS REPRIS DE 20260910210000, LIGNE POUR LIGNE — seules deux lignes
--    s'ajoutent, la colonne et son NULLIF. Le COALESCE retiré ce jour-là ne
--    revient pas ; les commentaires d'alors sont reconduits.
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
  INSERT INTO shareholder_entities (
    company_id,
    entity_type,
    legal_name,
    jurisdiction,
    entity_number,
    corporation_number,
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
    NULLIF(p_entity ->> 'corporation_number', ''),
    NULLIF(p_entity ->> 'date_constituted', '')::date,
    NULLIF(p_entity ->> 'date_incorporated', '')::date,
    NULLIF(p_entity ->> 'entity_descriptor', ''),
    NULLIF(p_entity ->> 'address_line1', ''),
    NULLIF(p_entity ->> 'address_line2', ''),
    NULLIF(p_entity ->> 'address_city', ''),
    NULLIF(p_entity ->> 'address_province', ''),
    NULLIF(p_entity ->> 'address_postal_code', ''),
    -- ⛔ LE COALESCE EST PARTI (20260910210000) ET NE REVIENT PAS. Le pays suit
    -- le même patron que les autres champs : ce que l'appelant envoie, et rien
    -- d'autre. Une clé absente rend NULL — ce qui est vrai.
    NULLIF(p_entity ->> 'address_country', '')
  )
  RETURNING id INTO v_entity_id;

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
  '''CA''; address_line2 added. 20260917230000: corporation_number carried — '
  'offered, never required.';
