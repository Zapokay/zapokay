-- =============================================================================
-- minute_book_requirements.section — le catalogue rejoint le vocabulaire des
-- documents. UN SEUL vocabulaire pour les deux tables.
-- Retire  : avis · administrateurs · dirigeants
-- Ajoute  : resolutions_administratives · depots_federaux · declarations_quebec
--           · autres  (absente de CETTE table jusqu'ici, présente dans documents)
-- Déplace : 6 exigences, une par une, par requirement_key
-- =============================================================================
--
-- ⚠️ CECI EST UN REGISTRE. Le SQL a été appliqué À LA MAIN au tableau de bord
-- Supabase, puis ce fichier est entré à l'histoire. Il inscrit, il ne rejoue pas.
--
-- POURQUOI — ET C'EST LA RÉPARATION D'UN OUBLI, PAS UNE ÉVOLUTION.
-- 20260901183423 a fait passer documents.minute_book_section aux neuf sections
-- du cabinet. Il a oublié que le même vocabulaire vit AUSSI ici : la section
-- d'un document téléversé ou généré est recopiée depuis l'exigence qu'il
-- couvre (lib/upload-document.ts:162 lit req.section ;
-- lib/pdf/generatePdfDocument.ts:539 écrit requirement?.section). Six des 24
-- exigences portaient donc une valeur que documents REFUSE désormais, et toute
-- écriture qui les traverse échouait — l'utilisateur lisant « Échec du
-- téléversement. » sans savoir pourquoi.
--
-- ⚠️ 'autres' ENTRE ICI ALORS QU'ELLE N'Y ÉTAIT PAS. La contrainte d'origine
-- ne portait que HUIT valeurs ; documents en portait neuf. Cette asymétrie
-- n'avait aucune raison d'être et obligerait le code à connaître une exception.
-- Décision : les deux tables partagent exactement les mêmes neuf valeurs.
--
-- ⚠️ CE QUE CE FICHIER NE FAIT PAS. Il ne touche NI au code, NI aux libellés,
-- NI à l'ordre d'affichage. MINUTE_BOOK_SECTIONS, le duplicata SECTIONS de la
-- route binder, le type SectionKey de BinderView, les deux tables de repli
-- DOC_TYPE_FALLBACK / DOC_TYPE_SECTION_MAP — dont le littéral mort
-- `rapport: 'avis'` — et les clés minuteBook.binder.sections.* des deux
-- fichiers de messages portent encore l'ancien vocabulaire. Le lot de code qui
-- suit referme ce désaccord.
--
-- ⚠️ AUCUN BEGIN, AUCUN COMMIT — ET CE N'EST PAS UN OUBLI. L'éditeur SQL du
-- tableau de bord NE TOURNE PAS en transaction : un BEGIN y est ignoré (mesuré
-- 2026-08-24). C'est précisément pourquoi l'ORDRE ci-dessous est la sécurité.
--
-- ★★★ ÉLARGIR, DÉPLACER, RESSERRER — ET SURTOUT PAS L'INVERSE.
-- Supprimer la contrainte, déplacer, la recréer laisserait la colonne SANS
-- AUCUNE contrainte entre deux instructions, et rien ne garantit que la
-- troisième sera collée. Ici :
--   A. le permissif porte les DOUZE valeurs — l'union des huit anciennes et
--      des neuf nouvelles — donc il accepte l'état d'avant comme celui d'après ;
--   B. les six UPDATE se font sous ce permissif ;
--   C. le définitif ne pose ses neuf valeurs qu'une fois plus aucune ligne ne
--      porte les trois retirées.
--
-- ⚠️ LA FORME DU CHECK EST COPIÉE, PAS RÉÉCRITE, ET LE NULL EST LA RAISON.
-- Sous la forme `x = ANY (ARRAY[...])`, une valeur NULL rend NULL — et un CHECK
-- ne rejette que sur FALSE. La contrainte TOLÈRE donc les lignes sans section,
-- et les deux versions ci-dessous gardent cette tolérance. Ce lot change le
-- VOCABULAIRE, pas la nullabilité.
--
-- CIBLAGE : les six UPDATE nomment leur requirement_key. Jamais
-- `WHERE section = 'avis'` — un fichier de registre doit NOMMER ce qu'il
-- déplace, et un balayage par valeur emporterait en silence toute exigence
-- ajoutée entre la mesure et l'application.
--
-- IDEMPOTENCE : DROP ... IF EXISTS puis ADD aux deux étapes de contrainte. Les
-- six UPDATE sont idempotents par nature — poser deux fois la même valeur sur
-- la même clé ne fait rien.
--
-- MESURÉ AVANT L'APPLICATION (2026-09-01) : 24 exigences, dont avis 4 et
-- administrateurs 2. Les six identifiants ci-dessous ont été revérifiés un par
-- un contre la table, tous OK. minute_book_requirements_section_check était
-- VALIDEE avec huit valeurs.
-- =============================================================================


-- ─── A. ÉLARGIR ──────────────────────────────────────────────────────────────
-- Douze valeurs : l'union des huit anciennes et des neuf nouvelles.

ALTER TABLE public.minute_book_requirements
  DROP CONSTRAINT IF EXISTS minute_book_requirements_section_check;

ALTER TABLE public.minute_book_requirements
  ADD CONSTRAINT minute_book_requirements_section_check
  CHECK (section = ANY (ARRAY[
    'statuts'::text,
    'reglements'::text,
    'resolutions_administratives'::text,
    'depots_federaux'::text,
    'declarations_quebec'::text,
    'resolutions'::text,
    'registres'::text,
    'actionnaires'::text,
    'autres'::text,
    'avis'::text,
    'administrateurs'::text,
    'dirigeants'::text
  ]));


-- ─── B. DÉPLACER ─────────────────────────────────────────────────────────────
-- Par requirement_key, une exigence par ligne.

UPDATE public.minute_book_requirements SET section = 'depots_federaux'
  WHERE requirement_key = 'cbca_annual_return';         -- avis → dépôt chez Corporations Canada
UPDATE public.minute_book_requirements SET section = 'declarations_quebec'
  WHERE requirement_key = 'cbca_req_annual_update_qc';  -- avis → dépôt au REQ
UPDATE public.minute_book_requirements SET section = 'declarations_quebec'
  WHERE requirement_key = 'lsaq_declaration_initiale';  -- avis → dépôt au REQ
UPDATE public.minute_book_requirements SET section = 'declarations_quebec'
  WHERE requirement_key = 'lsaq_req_annual_update';     -- avis → dépôt au REQ
UPDATE public.minute_book_requirements SET section = 'resolutions'
  WHERE requirement_key = 'cbca_director_acceptance';   -- administrateurs → Director's Consent
UPDATE public.minute_book_requirements SET section = 'resolutions'
  WHERE requirement_key = 'lsaq_acceptation_mandat';    -- administrateurs → Director's Consent


-- ─── C. RESSERRER ────────────────────────────────────────────────────────────
-- Les neuf définitives, dans l'ordre de rang de la taxonomie, identiques à
-- celles de documents.minute_book_section.

ALTER TABLE public.minute_book_requirements
  DROP CONSTRAINT IF EXISTS minute_book_requirements_section_check;

ALTER TABLE public.minute_book_requirements
  ADD CONSTRAINT minute_book_requirements_section_check
  CHECK (section = ANY (ARRAY[
    'statuts'::text,
    'reglements'::text,
    'resolutions_administratives'::text,
    'depots_federaux'::text,
    'declarations_quebec'::text,
    'resolutions'::text,
    'registres'::text,
    'actionnaires'::text,
    'autres'::text
  ]));
