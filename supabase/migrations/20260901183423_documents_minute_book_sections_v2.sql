-- =============================================================================
-- documents.minute_book_section — la taxonomie du Livre passe à neuf étagères
-- Retire  : avis · administrateurs · dirigeants
-- Ajoute  : resolutions_administratives · depots_federaux · declarations_quebec
-- Déplace : 8 documents, un par un, par identifiant
-- =============================================================================
--
-- ⚠️ CECI EST UN REGISTRE. Le SQL a été appliqué À LA MAIN au tableau de bord
-- Supabase, puis ce fichier est entré à l'histoire. Il inscrit, il ne rejoue
-- pas. La contrainte de départ a été relue depuis la base vivante avec
-- pg_get_constraintdef(), pas retapée depuis un brief.
--
-- POURQUOI. La taxonomie de référence est arrêtée sur le livre de minutes réel
-- d'une société du parc, produit par le cabinet qui l'a constituée. La règle du
-- partage est le REGISTRAIRE, pas la juridiction : ce qui est émis par
-- Corporations Canada ou déposé chez lui va aux dépôts fédéraux ; ce qui est
-- émis par le REQ ou déposé chez lui va aux déclarations du Québec. Les
-- étagères « administrateurs » et « dirigeants » disparaissent : le cabinet ne
-- range pas par organe, il range par nature d'acte.
--
-- ⚠️ CE QUE CE FICHIER NE FAIT PAS. Il ne touche NI au code, NI aux libellés,
-- NI à l'ordre d'affichage. La liste MINUTE_BOOK_SECTIONS de
-- lib/minute-book-section.ts, le duplicata SECTIONS de la route binder, les
-- clés minuteBook.binder.sections.* des deux fichiers de messages et
-- supabase/schema.sql portent encore les NEUF ANCIENNES valeurs. Le produit
-- reste donc temporairement en désaccord avec la base : c'est voulu, et c'est
-- le lot de code qui suit qui le referme.
--
-- ⚠️ AUCUN BEGIN, AUCUN COMMIT — ET CE N'EST PAS UN OUBLI. L'éditeur SQL du
-- tableau de bord NE TOURNE PAS en transaction : un BEGIN y est ignoré (mesuré
-- 2026-08-24). Les écrire donnerait l'illusion d'un tout-ou-rien qui n'existe
-- pas. C'est précisément pourquoi l'ORDRE ci-dessous est la partie qui compte.
--
-- ★★★ ÉLARGIR, DÉPLACER, RESSERRER — ET SURTOUT PAS L'INVERSE.
-- Le geste évident (supprimer la contrainte, déplacer, la recréer) laisse la
-- colonne SANS AUCUNE contrainte entre deux instructions, et rien ne garantit
-- que la troisième sera collée. Ici, à aucun moment la colonne n'est nue, et à
-- aucun moment une ligne existante ne viole la contrainte en place :
--   A. le permissif porte les DOUZE valeurs — les neuf nouvelles ET les trois
--      qui partent — donc il accepte l'état d'avant comme celui d'après ;
--   B. les huit UPDATE se font sous ce permissif ;
--   C. le définitif ne pose ses neuf valeurs qu'une fois plus aucune ligne ne
--      porte les trois retirées.
--
-- ⚠️ LA FORME DU CHECK EST RECOPIÉE, PAS RÉÉCRITE, ET LE NULL EST LA RAISON.
-- La contrainte d'origine est `minute_book_section = ANY (ARRAY[...])`. Sous
-- cette forme, une valeur NULL rend NULL — et un CHECK ne rejette que sur
-- FALSE, jamais sur NULL. La contrainte TOLÈRE donc les lignes sans section.
-- Les deux versions ci-dessous gardent la même forme pour garder la même
-- tolérance. Une réécriture en `IS NOT NULL AND ...` aurait fermé cette porte
-- sans que personne l'ait demandé. (Mesuré au passage : zéro ligne porte NULL
-- aujourd'hui — mais la contrainte, elle, ne l'interdit pas.)
--
-- IDEMPOTENCE — le choix est DROP ... IF EXISTS puis ADD, aux deux étapes de
-- contrainte. Les huit UPDATE sont idempotents par nature : poser deux fois la
-- même valeur sur le même identifiant ne fait rien.
--
-- MESURÉ AVANT L'APPLICATION (2026-09-01) : avis 5 · administrateurs 2 ·
-- dirigeants 1, toutes lignes confondues, aucune au rancart. Table entière :
-- 115 lignes. Aucune valeur hors CHECK.
-- =============================================================================


-- ─── A. ÉLARGIR ──────────────────────────────────────────────────────────────
-- Douze valeurs : les neuf de la nouvelle taxonomie, plus les trois qui partent.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_minute_book_section_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_minute_book_section_check
  CHECK (minute_book_section = ANY (ARRAY[
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
-- Par IDENTIFIANT, jamais par titre : deux paires partagent leur titre —
-- « REQ Annual Update » (Acme, 2024 et 2025) et « Déclaration d'acceptation du
-- mandat d'administrateur » (Acme et droussy).

UPDATE public.documents SET minute_book_section = 'declarations_quebec'
  WHERE id = '864d4e17-4cbc-4f80-beb2-9247da89469b';  -- Acme · REQ Annual Update · 2024
UPDATE public.documents SET minute_book_section = 'declarations_quebec'
  WHERE id = 'f1d98c7f-c800-4f0e-a3ad-99c78399569f';  -- Acme · REQ Annual Update · 2025
UPDATE public.documents SET minute_book_section = 'declarations_quebec'
  WHERE id = 'a37ceb0f-c34b-475f-aafc-d9d8e3ec87ba';  -- droussy · Déclaration initiale (RE 200)
UPDATE public.documents SET minute_book_section = 'declarations_quebec'
  WHERE id = 'a9eb4c20-639d-4613-b8c7-efcd3a64fcc2';  -- droussy · Mise à jour annuelle au REQ — 2025
UPDATE public.documents SET minute_book_section = 'depots_federaux'
  WHERE id = '08b4486d-9a3b-45d6-9703-ae0eb58e69c4';  -- DePictura · Rapport annuel — Corporations Canada
UPDATE public.documents SET minute_book_section = 'resolutions'
  WHERE id = 'e1aead13-a71c-4988-abfe-e8888095fe99';  -- Acme · Déclaration d'acceptation du mandat d'administrateur
UPDATE public.documents SET minute_book_section = 'resolutions'
  WHERE id = '6f84580d-01f8-4b6c-9d55-c933c25a1729';  -- droussy · Déclaration d'acceptation du mandat d'administrateur
UPDATE public.documents SET minute_book_section = 'autres'
  WHERE id = 'da29dc3f-3c8c-4ede-a4e8-512db9cc667f';  -- Acme · ECW516L Datasheet 2


-- ─── C. RESSERRER ────────────────────────────────────────────────────────────
-- Les neuf définitives, dans l'ordre de rang de la taxonomie. L'ordre du
-- tableau ne porte aucune sémantique pour Postgres ; il est écrit ainsi pour
-- qu'un lecteur retrouve la table de référence sans la chercher ailleurs.

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_minute_book_section_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_minute_book_section_check
  CHECK (minute_book_section = ANY (ARRAY[
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
