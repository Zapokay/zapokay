-- The federal RE-200 obligation does not exist. Remove it from the catalog.
--
-- ─── HOW THIS IS EXPECTED TO BE APPLIED (read before running anything) ───────
-- Intended for the Supabase DASHBOARD SQL EDITOR, like 20260728120000 before it.
-- The CLI ledger will therefore have no row for version 20260812120100 and a future
-- `supabase db push` will try to run it again. That re-run is SAFE: the DELETE is
-- idempotent (a second run matches nothing) and the guards assert the END STATE.
--
-- To record it in the ledger if that ever matters:
--   npx supabase migration repair --status applied 20260812120100
--
-- ⚠️ RUN 20260812120000 FIRST. That migration is mechanical and moves no user-visible
-- number. This one MOVES THE COMPLETENESS DENOMINATOR. Two gestures, two checks, two
-- ways back — do not merge them.
--
-- ─── THE BASIS ───────────────────────────────────────────────────────────────
-- Position of OUR LEGAL COUNSEL, 2026-08-11.
--
-- art. 38 LPLE DOES NOT APPLY to a federal corporation. art. 30 reserves the
-- deposit-of-the-constituting-act route to legal persons INCORPORATED IN QUEBEC. A
-- federal corporation's obligation is art. 32 — the declaration of registration — and
-- the PRODUCTION of that declaration is the LEGAL CAUSE of registration (art. 30), the
-- NEQ being assigned at the moment of registration (art. 37).
--
-- ★ HOLDING A NEQ IS HAVING PRODUCED IT. Not a presumption to compute — an identity.
-- There is no state in which a registered federal corporation owes this filing, so
-- there is nothing for a catalog row to track. The row is not mis-classified; the
-- obligation it names does not exist for this regime.
--
-- ⚠️ THIS IS OUR COUNSEL'S POSITION, NOT AN EXTERNAL LAWYER'S VERDICT. The A1 CONTENT
-- gate remains the sole GREEN authority and has not reviewed this.
--
-- ⚠️ THE LSAQ ROW IS NOT TOUCHED. `lsaq_declaration_initiale` (framework 'LSA') stays:
-- for a Quebec-incorporated corporation the obligation is real, and its treatment
-- depends on the incorporation route. Guard 3 below asserts it survived.
--
-- ─── WHAT THIS MOVES, MEASURED 2026-08-12 ────────────────────────────────────
-- ATTACHED DOCUMENTS: zero. `SELECT count(*) FROM documents WHERE requirement_key =
-- 'cbca_declaration_initiale_qc'` returned 0 across every company and every status,
-- so this DELETE cannot orphan a document. Guard 1 re-checks that at run time rather
-- than trusting the measurement's age.
--
-- ★ THE DENOMINATOR MOVES, AND THAT IS THE POINT. A CBCA company's foundational rows
-- go from 9 to 8; Wick's requirementsTotal goes 42 -> 41. A CBCA company holding
-- documents will see its completeness PERCENTAGE RISE without having filed anything.
-- That is correct — the denominator was counting an obligation that does not exist —
-- but it is a user-visible number changing with no user action. Accepted by Dom
-- 2026-08-12 on the ground that signup is OFF and no real customer exists yet.
--
-- ⚠️ NOTED, NOT FIXED SEPARATELY: this row's description_fr/en assert "À déposer dans
-- les 60 jours" / "Must be filed within 60 days", which the ruling above denies. The
-- false text leaves with the row. Do not resurrect it in a reverse without revisiting
-- that sentence.
--
-- ⚠️ CODE THIS LEAVES STALE, deliberately out of scope: INITIAL_DECLARATION_KEYS in
-- lib/obligations/feeders/completeness.ts derives from the registry rule
-- `qc_initial_declaration`, whose requirementKeys still name this key. After this
-- migration that half of the list matches no catalog row — inert, but false. Clean it
-- in code, not here.

-- ── BEFORE ───────────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase, requirement_key, framework, category, section, sort_order,
       exempt_from_lateness
FROM minute_book_requirements
WHERE requirement_key IN ('cbca_declaration_initiale_qc', 'lsaq_declaration_initiale')
ORDER BY framework;

SELECT 'BEFORE' AS phase, count(*) AS attached_documents
FROM documents
WHERE requirement_key = 'cbca_declaration_initiale_qc';

-- ── GUARD 1 — refuse to orphan a document ────────────────────────────────────
DO $$
DECLARE doc_count integer;
BEGIN
  SELECT count(*) INTO doc_count
  FROM documents
  WHERE requirement_key = 'cbca_declaration_initiale_qc';
  IF doc_count <> 0 THEN
    RAISE EXCEPTION
      'ABORT: % document(s) still reference cbca_declaration_initiale_qc. Deleting the catalog row would leave them orphaned — visible in the vault and the binder, invisible in Complétude, subtracted from the numerator. Resolve the documents first.',
      doc_count;
  END IF;
END $$;

-- ── THE CHANGE — idempotent: a second run matches nothing ────────────────────
DELETE FROM minute_book_requirements
WHERE requirement_key = 'cbca_declaration_initiale_qc';

-- ── GUARD 2 — the federal row is gone ────────────────────────────────────────
DO $$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM minute_book_requirements
  WHERE requirement_key = 'cbca_declaration_initiale_qc';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'ABORT: cbca_declaration_initiale_qc still present (% row(s)).', remaining;
  END IF;
END $$;

-- ── GUARD 3 — the LSAQ row SURVIVED ──────────────────────────────────────────
DO $$
DECLARE lsaq_count integer;
BEGIN
  SELECT count(*) INTO lsaq_count
  FROM minute_book_requirements
  WHERE requirement_key = 'lsaq_declaration_initiale' AND framework = 'LSA';
  IF lsaq_count <> 1 THEN
    RAISE EXCEPTION
      'ABORT: expected exactly 1 lsaq_declaration_initiale row to survive, found %. The Quebec obligation is real and must not be removed.',
      lsaq_count;
  END IF;
END $$;

-- ── AFTER ────────────────────────────────────────────────────────────────────
SELECT 'AFTER' AS phase, requirement_key, framework, category, section, sort_order,
       exempt_from_lateness
FROM minute_book_requirements
WHERE requirement_key IN ('cbca_declaration_initiale_qc', 'lsaq_declaration_initiale')
ORDER BY framework;

SELECT 'AFTER' AS phase, framework, count(*) AS foundational_rows
FROM minute_book_requirements
WHERE category = 'foundational'
GROUP BY framework
ORDER BY framework;

-- ═════════════════════════════════════════════════════════════════════════════
-- REVERSE — the complete re-INSERT, every column, values as of 2026-08-12.
-- This travels WITH the migration because a DELETE is not reversible without it.
-- The `id` is the original one, so any future reference to it resolves again.
--
-- ⚠️ Before running this, re-read the "noted, not fixed" paragraph above: the
-- description columns below carry the 60-day claim the ruling denies. Restoring the
-- row restores that sentence.
--
-- INSERT INTO minute_book_requirements (
--   id, requirement_key, category, jurisdiction, framework,
--   title_fr, title_en, description_fr, description_en,
--   section, sort_order, can_generate, can_upload, exempt_from_lateness
-- ) VALUES (
--   'd633cc27-fb94-4570-b40c-545ebcff861b',
--   'cbca_declaration_initiale_qc',
--   'foundational',
--   'CA',
--   'CBCA',
--   'Déclaration initiale au Québec (RE-200)',
--   'Quebec Initial Declaration (RE-200)',
--   'Obligatoire pour toute société fédérale ayant son siège ou exerçant au Québec. À déposer dans les 60 jours.',
--   'Required for any federal corporation headquartered or operating in Quebec. Must be filed within 60 days.',
--   'avis',
--   35,
--   false,
--   true,
--   false
-- );
-- ═════════════════════════════════════════════════════════════════════════════
