-- =============================================================================
-- A4 — REPRISE HISTORIQUE : une liaison pour chaque document déjà classé
-- =============================================================================
-- `requirement_documents` est écrite depuis 63ef26d par la modale du Coffre, et
-- AUCUN lecteur ne la lit. Avant qu'un lecteur bascule, les documents ANCIENS
-- doivent y avoir une liaison — sinon ils cesseraient d'un coup de satisfaire
-- quoi que ce soit à l'écran. Cette migration est cette reprise, et rien d'autre :
-- elle n'ajoute aucune colonne, ne touche aucune ligne de `documents`, et ne
-- bascule aucun lecteur.
--
-- Mesuré sur la base le 2026-08-24 :
--   110 documents en tout ;  85 portent un requirement_key ;  25 n'en portent pas
--     7 liaisons existent déjà, sur 4 documents (les écritures d'A2a)
--    81 documents restent à reprendre  =  16 fondationnels + 65 annuels
--   Après cette migration : 88 lignes dans la table, 0 document à clé sans liaison.
--
-- ─── APPLIQUÉE LE 2026-08-24 ─────────────────────────────────────────────────
-- Appliquée par Dom dans l'ÉDITEUR SQL DU TABLEAU DE BORD le 2026-08-24, puis
-- vérifiée dans la foulée. Les cinq chiffres relevés :
--   total_liaisons 88 · docs_a_cle 85 · sans_leur_liaison 0
--   origin 'declared' 31 · origin 'generated' 57
-- 81 lignes insérées, la table portée de 7 à 88, la dérivation d'origin correcte.
--
-- ⚠️ L'exécution a LEVÉ APRÈS L'INSERT, sur une table temporaire qui n'avait pas
-- survécu d'une instruction à l'autre (« relation a4_baseline does not exist »).
-- Le lot était déjà écrit et correct. Le fichier a été corrigé depuis pour être
-- rejouable tel quel : plus de table temporaire, plus de BEGIN/COMMIT. C'est de
-- cet échec que vient le fait mesuré consigné dans le bloc sur la transaction.
--
-- ─── HOW THIS IS APPLIED (read before running anything) ──────────────────────
-- Applied via the Supabase DASHBOARD SQL EDITOR, NOT via the CLI — comme
-- 20260728120000, 20260812120000, 20260812120100 et 20260820120000 avant elle.
-- Consequence: supabase_migrations.schema_migrations will have NO row for
-- version 20260824120000, so the CLI believes this migration is still pending.
-- A future `supabase db push` will therefore try to run it again.
--
-- That re-run is SAFE: the INSERT carries ON CONFLICT DO NOTHING on the unique
-- (document_id, requirement_key, requirement_year) NULLS NOT DISTINCT — a second
-- run inserts zero rows and raises nothing. The guards re-assert the END STATE,
-- so they pass on a re-run exactly as they pass on the first.
--
-- To record it in the ledger if that ever matters:
--   npx supabase migration repair --status applied 20260824120000
--
-- =============================================================================
-- LES SIX DÉCISIONS — toutes mesurées, aucune supposée
-- =============================================================================
--
-- D1. `origin` EST DÉRIVÉ DE `documents.source`. Aucune valeur inventée.
--        source = 'uploaded'  →  origin = 'declared'
--        source = 'generated' →  origin = 'generated'
--     C'est la définition que la colonne porte déjà en base (COMMENT posé par
--     20260820120000:176) : « declared = the user ticked this requirement at
--     import; generated = the link was created by generating a document ». Le
--     critère est PAR QUEL GESTE LA LIAISON NAÎT, pas qui a choisi la clé.
--     Fondé sur le code qui écrit, pas sur le nom des valeurs — trois écritures
--     dans `documents`, toutes en dur, sans branche :
--        lib/upload-document.ts:180            source: 'uploaded'
--        lib/pdf/generatePdfDocument.ts:426    source: 'generated'
--        lib/pdf/generate-lifecycle-document.ts:730  source: 'generated'
--     (la troisième écrit requirement_key: null à :733 — hors de ce lot).
--     Aucun UPDATE ne révise `source` nulle part dans le dépôt.
--     Mesuré sur les 81 : 57 'generated', 24 'uploaded'. Rien d'autre.
--
-- D1bis. ★★ LE `CASE` N'A PAS DE `ELSE`, ET C'EST DÉLIBÉRÉ.
--     Le CHECK admet une troisième valeur, 'imported'. Elle n'est écrite par
--     AUCUN code (mesuré : zéro producteur dans tout le dépôt), portée par
--     AUCUNE ligne (mesuré : 0 dans toute la table), et n'a aucune signification
--     documentée — 20260510134015:30-33 dit qu'elle a été recopiée dans le CHECK
--     parce qu'elle était en prod, « even though application code references
--     only the first two ».
--     Un `ELSE 'generated'` la rangerait en silence du mauvais côté, sur une
--     trace d'audit que personne ne relira jamais pour la corriger. Sans `ELSE`,
--     le CASE rend NULL, et `origin` est NOT NULL : l'INSERT échoue au lieu de
--     mentir. C'est la seconde ligne de défense ; la GARDE 1 est la première.
--
-- D2. `requirement_year` EST COPIÉE VERBATIM DU SCALAIRE. Aucune déduction.
--     L'invariant « année NULLE = la ligne du catalogue est foundational »
--     (20260820120000:173, application invariant, non exprimable en CHECK) n'est
--     donc pas RECALCULÉ par cette migration : il est TRANSPORTÉ. Une copie ne
--     peut pas le violer. Re-mesuré aujourd'hui sur les 85, zéro exception :
--        foundational  16 docs  →  16 année NULLE,   0 année posée
--        annual        69 docs  →   0 année NULLE,  69 année posée
--
-- D3. LES DOCUMENTS `superseded` SONT REPRIS AUSSI — les 28.
--     Une liaison décrit ce qu'un document COUVRE, pas s'il est encore en
--     vigueur. A2a a d'ailleurs DÉJÀ produit une liaison sur un document mis au
--     rancart (mesuré : « Résolution annuelle du conseil d'administration »,
--     status='superseded', 1 liaison lsaq_annual_board_resolution:2021/declared).
--     Les exclure créerait deux régimes dans la même table : les liaisons d'A2a
--     survivent au rancart, celles d'A4 n'existeraient jamais. Un lecteur ne
--     pourrait plus raisonner uniformément. Répartition des 81 : 53 actifs,
--     28 superseded. Voir D6 — c'est le lecteur qui filtre, pas la table.
--
-- D4. IDEMPOTENTE PAR `ON CONFLICT DO NOTHING`.
--     L'arbitre est nommé par sa liste de colonnes, donc l'unique
--     requirement_documents_document_id_requirement_key_requireme_key :
--        UNIQUE NULLS NOT DISTINCT (document_id, requirement_key, requirement_year)
--     (mesuré sur pg_constraint et pg_index, pas dans le fichier de migration).
--     NULLS NOT DISTINCT est LOAD-BEARING ici : requirement_year est NULL sur les
--     16 liaisons fondationnelles, et sans cette clause Postgres les traiterait
--     comme distinctes — un second passage doublerait exactement ces 16 lignes en
--     laissant les 65 annuelles intactes. Nommer les colonnes plutôt qu'un
--     `ON CONFLICT DO NOTHING` nu est aussi une garde : si l'unique disparaissait
--     un jour, l'inférence échouerait bruyamment au lieu d'insérer des doublons.
--
-- D5. ★ DÉCISION DE DOM, 2026-08-24 : ART ET TECHNOLOGIE DEPICTURA INC. EST
--     INCLUSE DANS LA REPRISE. Un document, une ligne :
--        « Rapport annuel — Corporations Canada »
--        source='uploaded'  status='active'  cbca_annual_return / 2026
--        is_finalized=true  →  origin='declared'
--     Aucun filtre par société n'existe dans cette migration ; la décision est
--     écrite ici pour que la trace vive dans le dépôt et non seulement dans une
--     conversation. Les cinq sociétés concernées : Acme Test inc. (43),
--     droussy inc. (36), Wick Inc (5), DePictura (1) — 85 documents à clé, dont
--     81 à reprendre.
--
-- =============================================================================
-- D6. ⚠️⚠️ L'INVARIANT QUE TOUT FUTUR LECTEUR DEVRA RESPECTER
-- =============================================================================
--
--     QUICONQUE INTERROGE requirement_documents DOIT REJOINDRE documents
--     ET FILTRER status = 'active'.
--
--     `requirement_documents` NE PORTE AUCUNE COLONNE D'ÉTAT, et c'est
--     délibéré — 20260820120000:78-84, décision 5 : « Readers filter
--     status='active' on the DOCUMENT side, so the document's state already
--     answers for its links. » L'état vit sur le document, jamais sur la liaison.
--
--     L'index idx_requirement_documents_company_requirement porte sur
--     (company_id, requirement_key) et invite précisément à se passer de la
--     jointure. S'en passer ferait réapparaître LES 28 DOCUMENTS RETIRÉS que
--     cette migration vient de lier comme satisfaisant des exigences.
--
--     Les cinq lecteurs actuels du scalaire filtrent tous status='active' du
--     côté documents (mesuré, lu un par un) :
--        lib/minute-book/requirement-completeness.ts:227
--        app/api/due-diligence/status/route.ts:131
--        app/[locale]/dashboard/minute-book/documents/page.tsx:34
--        lib/minute-book/hold-years.ts:55
--        lib/pdf/generatePdfDocument.ts:399
--     La bascule doit conserver ce filtre. La reprise crée le carburant ; c'est
--     la forme du SELECT du premier lecteur basculé qui décide s'il prend feu.
--
-- =============================================================================
-- ⚠️ CE QUE CETTE MIGRATION NE RÉGLE PAS — nommé pour qu'il ne surprenne personne
-- =============================================================================
-- lib/pdf/generatePdfDocument.ts N'ÉCRIT PAS dans requirement_documents (mesuré :
-- son insert va de :414 à :437, suivi de logActivity :449 et du return :459 —
-- aucune liaison). A2a n'a branché que lib/upload-document.ts. Tout document
-- GÉNÉRÉ après cette reprise naîtra donc avec un scalaire et SANS liaison, et la
-- reprise se périmera en continu — au rythme actuel c'est le chemin qui produit
-- 57 des 81. C'est un lot séparé (A4-bis) et il n'est pas fait ici.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- ⚠️ IL N'Y A PAS DE TRANSACTION ICI, ET C'EST MESURÉ
-- ---------------------------------------------------------------------------
-- L'éditeur SQL du tableau de bord ne fait PAS tourner ce script en une seule
-- transaction — MESURÉ le 2026-08-24 : un `BEGIN;` / `COMMIT;` encadrant ce
-- fichier a été IGNORÉ. L'INSERT a persisté alors que le bloc suivant levait ;
-- si la transaction avait tenu, les 81 lignes auraient été défaites. Elles sont
-- en base. Une erreur en cours de script ne défait donc RIEN.
--
-- LA SÛRETÉ DE CETTE MIGRATION NE REPOSE PAS SUR UN RETOUR ARRIÈRE. Elle repose
-- sur DEUX GARDES QUI TOURNENT AVANT L'INSERT, et sur un INSERT IDEMPOTENT.
-- NE RÉINTRODUIS PAS DE `BEGIN;` ICI EN CROYANT AJOUTER UN FILET : il ne serait
-- pas honoré, et il rendrait à nouveau vraie-en-apparence une phrase fausse.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- GARDE 1 — provenance inattendue
-- ---------------------------------------------------------------------------
-- Mesuré aujourd'hui : ZÉRO. La garde existe pour le jour où ce ne sera plus
-- vrai. Elle couvre exactement la population que l'INSERT touche, et elle inclut
-- NULL : `source` est nullable (attnotnull = false, mesuré) même si aucune ligne
-- n'est NULL aujourd'hui, et NOT IN (...) ne l'attraperait pas seul.
DO $$
DECLARE
  bad_count integer;
  bad_values text;
BEGIN
  SELECT count(*) INTO bad_count
  FROM documents d
  WHERE d.requirement_key IS NOT NULL
    AND (d.source IS NULL OR d.source NOT IN ('uploaded', 'generated'));

  IF bad_count <> 0 THEN
    SELECT string_agg(DISTINCT coalesce(d.source, '(NULL)'), ', ')
      INTO bad_values
    FROM documents d
    WHERE d.requirement_key IS NOT NULL
      AND (d.source IS NULL OR d.source NOT IN ('uploaded', 'generated'));

    RAISE EXCEPTION
      'A4 GARDE 1 — provenance inattendue : % document(s) a requirement_key portent une source hors de (uploaded, generated) : %. origin ne peut pas en etre derive sans inventer une valeur. Rien n''a ete insere.',
      bad_count, bad_values;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- GARDE 2 — clé orpheline
-- ---------------------------------------------------------------------------
-- ⚠️ OBLIGATOIRE, PAS DÉCORATIVE. Il n'existe AUCUNE clé étrangère de
-- requirement_documents vers minute_book_requirements, et il ne peut pas y en
-- avoir : l'unique du catalogue porte sur (requirement_key, framework), donc
-- référencer le catalogue forcerait une colonne `framework` sur chaque liaison
-- (20260820120000:118-124, décision 7). RIEN D'AUTRE QUE CETTE GARDE n'empêche
-- une liaison orpheline d'entrer. Mesuré aujourd'hui : zéro orphelin, 15 clés
-- distinctes portées par des documents, toutes présentes dans les 24 du catalogue.
DO $$
DECLARE
  orphan_count integer;
  orphan_keys  text;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM documents d
  WHERE d.requirement_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM minute_book_requirements m
      WHERE m.requirement_key = d.requirement_key
    );

  IF orphan_count <> 0 THEN
    SELECT string_agg(DISTINCT d.requirement_key, ', ' ORDER BY d.requirement_key)
      INTO orphan_keys
    FROM documents d
    WHERE d.requirement_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM minute_book_requirements m
        WHERE m.requirement_key = d.requirement_key
      );

    RAISE EXCEPTION
      'A4 GARDE 2 — cle orpheline : % document(s) portent une requirement_key absente de minute_book_requirements : %. Aucune FK ne protege cette table. Rien n''a ete insere.',
      orphan_count, orphan_keys;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- L'INSERT ET SA VÉRIFICATION — UN SEUL BLOC, DÉLIBÉRÉMENT
-- ---------------------------------------------------------------------------
-- ★ AUCUN `WHERE` SUR `source`. Les gardes ont déjà tranché. Un filtre ici ferait
-- SAUTER en silence une ligne inattendue au lieu de la faire échouer — et une
-- ligne sautée est un document qui cesserait de satisfaire son exigence le jour
-- de la bascule, sans que rien ne l'ait signalé.
--
-- ★ AUCUN `WHERE` SUR `status` NON PLUS. Voir D3 : les 28 superseded sont repris.
--
-- Le CASE sans ELSE (D1bis) rend NULL sur toute autre valeur, et origin est
-- NOT NULL : l'INSERT échouerait plutôt que d'écrire une provenance fausse.
--
-- ★ POURQUOI TOUT TIENT DANS UN SEUL `DO` : insertion, comptage et vérification
-- sont ensemble parce que RIEN NE SURVIT d'une instruction à l'autre dans
-- l'éditeur du tableau de bord (mesuré — voir le bloc sur la transaction plus
-- haut). Une table temporaire portant le compte d'avant a été essayée le
-- 2026-08-24 et a levé « relation a4_baseline does not exist » au bloc suivant.
-- `GET DIAGNOSTICS` lit le ROW_COUNT de l'INSERT dans le MÊME bloc PL/pgSQL : il
-- ne dépend de rien d'extérieur.
-- ⚠️ Le `BEGIN` ci-dessous OUVRE LE BLOC PL/pgSQL. Ce n'est pas un `BEGIN;` de
-- transaction, et il n'en tient pas lieu.
--
-- ATTENDU À TOUT REJEU : 0 inséré, 88 au total, 0 sans sa propre liaison.
-- Le premier passage, le 2026-08-24, a inséré 81 et porté la table de 7 à 88.
--
-- `still_unlinked` est le seul des trois qui soit une CONDITION et pas une
-- observation : s'il n'est pas nul, la reprise est incomplète et un lecteur
-- basculé afficherait des exigences insatisfaites. Il lève donc, il ne notifie pas.
--
-- ★ CE QU'IL TESTE EXACTEMENT : que chaque scalaire a SA liaison — MÊME CLÉ ET
-- MÊME ANNÉE — et non pas « ce document porte une liaison, n'importe laquelle ».
-- La distinction est réelle et pas théorique : A2a écrit N liaisons par document
-- dont UNE SEULE correspond au scalaire, donc un document lié à une AUTRE
-- exigence passerait la forme faible en laissant son propre scalaire orphelin.
--
-- ⚠️ `IS NOT DISTINCT FROM` sur l'année, JAMAIS `=`. `NULL = NULL` rend NULL et
-- non vrai : avec `=`, les 16 fondationnels — dont requirement_year est NULL par
-- l'invariant D2 — seraient comptés comme non liés et la migration lèverait alors
-- que tout serait correct. C'est la même raison qui rend NULLS NOT DISTINCT
-- porteur sur l'unique (D4), appliquée ici du côté de la vérification.
--
-- ⚠️ CE `RAISE EXCEPTION` NE DÉFAIT PAS L'INSERT si le script n'est pas enveloppé,
-- et il ne l'est pas (mesuré). IL SIGNALE, IL NE RÉPARE PAS. Le rejeu, lui, est
-- sans danger : l'ON CONFLICT rend tout passage suivant inerte.
DO $$
DECLARE
  inserted_count integer;
  table_total    integer;
  still_unlinked integer;
BEGIN
  INSERT INTO requirement_documents
    (document_id, company_id, requirement_key, requirement_year, origin)
  SELECT
    d.id,
    d.company_id,
    d.requirement_key,
    d.requirement_year,
    CASE d.source
      WHEN 'uploaded'  THEN 'declared'
      WHEN 'generated' THEN 'generated'
    END
  FROM documents d
  WHERE d.requirement_key IS NOT NULL
  ON CONFLICT (document_id, requirement_key, requirement_year) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT count(*) INTO table_total FROM requirement_documents;

  SELECT count(*) INTO still_unlinked
  FROM documents d
  WHERE d.requirement_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM requirement_documents rd
      WHERE rd.document_id = d.id
        AND rd.requirement_key = d.requirement_key
        AND rd.requirement_year IS NOT DISTINCT FROM d.requirement_year
    );

  RAISE NOTICE 'A4 — lignes inserees : %', inserted_count;
  RAISE NOTICE 'A4 — total requirement_documents : %', table_total;
  RAISE NOTICE 'A4 — documents a cle SANS leur propre liaison : %', still_unlinked;

  IF still_unlinked <> 0 THEN
    RAISE EXCEPTION
      'A4 VERIFICATION — % document(s) a requirement_key n''ont pas de liaison portant LEUR cle ET LEUR annee. Le lot est incomplet. Rien n''a ete defait : relancer ce fichier est sans danger.',
      still_unlinked;
  END IF;
END $$;
