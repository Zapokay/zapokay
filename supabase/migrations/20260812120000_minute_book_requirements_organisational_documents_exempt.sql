-- The six organisational documents carry no statutory deadline.
--
-- ─── HOW THIS IS EXPECTED TO BE APPLIED (read before running anything) ───────
-- Intended for the Supabase DASHBOARD SQL EDITOR, like 20260728120000 before it.
-- Consequence: supabase_migrations.schema_migrations will have NO row for version
-- 20260812120000, so the CLI will believe this migration is still pending and a
-- future `supabase db push` will try to run it again.
--
-- That re-run is SAFE: this file is idempotent. The UPDATE only touches rows whose
-- value is not already `true`, and the guard below asserts the END STATE rather than
-- the number of rows changed — so a second run finds nothing to do and still passes.
--
-- To record it in the ledger if that ever matters:
--   npx supabase migration repair --status applied 20260812120000
--
-- ─── THE BASIS ───────────────────────────────────────────────────────────────
-- Position of OUR LEGAL COUNSEL, 2026-08-11, texts read word for word, both regimes:
-- art. 11 LSAQ and art. 104 LCSA use the verb "peut" / "may". The organisation of a
-- corporation after incorporation is a POWER, not a duty with a term. No provision
-- fixes a delay for the first resolutions or the share subscription.
--
-- ⚠️ THIS IS OUR COUNSEL'S POSITION, NOT AN EXTERNAL LAWYER'S VERDICT. The A1 CONTENT
-- gate remains the sole GREEN authority and has not reviewed this. What this migration
-- changes is how ZapOkay RANKS and COUNTS the rows, never what it tells a user the law
-- requires.
--
-- ─── WHAT THIS DOES AND DOES NOT DO ──────────────────────────────────────────
-- `exempt_from_lateness` is named for BEHAVIOUR, not reason (see 20260728120000). An
-- exempt row is still COUNTED in requirementsTotal, still uploadable, still generated,
-- and still enters the binder on certification. It simply carries no lateness tier and
-- feeds neither overdue counter.
--
-- ⚠️ THE DENOMINATOR DOES NOT MOVE. This migration changes one boolean on six existing
-- rows; it inserts and deletes nothing. The completeness percentage is unaffected.
--
-- ★ THE SIX KEYS ARE WRITTEN OUT AND THEIR COUNT IS ASSERTED, DELIBERATELY.
-- `lsaq_premiere_resolution_actionnaires` is PLURAL. It was cited in the singular while
-- this work was scoped, and `UPDATE ... WHERE key IN (...)` does NOT complain about a
-- key that matches nothing: the migration would have touched FIVE rows out of six and
-- reported success. The guard below turns that silence into a failure.

-- ── BEFORE ───────────────────────────────────────────────────────────────────
SELECT 'BEFORE' AS phase, requirement_key, framework, section, exempt_from_lateness
FROM minute_book_requirements
WHERE requirement_key IN (
  'cbca_first_board_resolution',
  'cbca_first_shareholder_resolution',
  'cbca_share_subscription',
  'lsaq_premiere_resolution_ca',
  'lsaq_premiere_resolution_actionnaires',
  'lsaq_souscription_actions'
)
ORDER BY framework, sort_order;

-- ── GUARD 1 — the six keys must all EXIST before we touch anything ───────────
DO $$
DECLARE found_count integer;
BEGIN
  SELECT count(*) INTO found_count
  FROM minute_book_requirements
  WHERE requirement_key IN (
    'cbca_first_board_resolution',
    'cbca_first_shareholder_resolution',
    'cbca_share_subscription',
    'lsaq_premiere_resolution_ca',
    'lsaq_premiere_resolution_actionnaires',
    'lsaq_souscription_actions'
  );
  IF found_count <> 6 THEN
    RAISE EXCEPTION
      'ABORT: expected 6 organisational requirement keys, found %. A key is misspelled or missing; IN () would have silently skipped it.',
      found_count;
  END IF;
END $$;

-- ── THE CHANGE — idempotent: only rows not already true are written ──────────
UPDATE minute_book_requirements
SET exempt_from_lateness = true
WHERE requirement_key IN (
  'cbca_first_board_resolution',
  'cbca_first_shareholder_resolution',
  'cbca_share_subscription',
  'lsaq_premiere_resolution_ca',
  'lsaq_premiere_resolution_actionnaires',
  'lsaq_souscription_actions'
)
AND exempt_from_lateness IS DISTINCT FROM true;

-- ── GUARD 2 — assert the END STATE, so a second run still passes ─────────────
DO $$
DECLARE exempt_count integer;
BEGIN
  SELECT count(*) INTO exempt_count
  FROM minute_book_requirements
  WHERE requirement_key IN (
    'cbca_first_board_resolution',
    'cbca_first_shareholder_resolution',
    'cbca_share_subscription',
    'lsaq_premiere_resolution_ca',
    'lsaq_premiere_resolution_actionnaires',
    'lsaq_souscription_actions'
  )
  AND exempt_from_lateness = true;
  IF exempt_count <> 6 THEN
    RAISE EXCEPTION
      'ABORT: expected 6 rows at exempt_from_lateness = true, found %.',
      exempt_count;
  END IF;
END $$;

-- ── AFTER ────────────────────────────────────────────────────────────────────
SELECT 'AFTER' AS phase, requirement_key, framework, section, exempt_from_lateness
FROM minute_book_requirements
WHERE requirement_key IN (
  'cbca_first_board_resolution',
  'cbca_first_shareholder_resolution',
  'cbca_share_subscription',
  'lsaq_premiere_resolution_ca',
  'lsaq_premiere_resolution_actionnaires',
  'lsaq_souscription_actions'
)
ORDER BY framework, sort_order;

-- ── REVERSE, if this is ever wrong ───────────────────────────────────────────
-- UPDATE minute_book_requirements
-- SET exempt_from_lateness = false
-- WHERE requirement_key IN (
--   'cbca_first_board_resolution',
--   'cbca_first_shareholder_resolution',
--   'cbca_share_subscription',
--   'lsaq_premiere_resolution_ca',
--   'lsaq_premiere_resolution_actionnaires',
--   'lsaq_souscription_actions'
-- );
