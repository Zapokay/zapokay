-- Foundational lateness exemption.
--
-- ─── HOW THIS WAS APPLIED (read before running anything) ─────────────────────
-- Applied via the Supabase DASHBOARD SQL EDITOR on 2026-07-28, NOT via the CLI.
-- Consequence: supabase_migrations.schema_migrations has NO row for version
-- 20260728120000, so the CLI believes this migration is still pending. A future
-- `supabase db push` will therefore try to run it again.
--
-- That re-run is SAFE: this file is idempotent (ADD COLUMN IF NOT EXISTS, and an
-- UPDATE that re-sets the same 9 rows to the value they already hold). A future
-- non-idempotent migration in the same position would NOT be safe.
--
-- To record it in the ledger if that ever matters:
--   npx supabase migration repair --status applied 20260728120000
--
-- Harvey 2026-07-24 + 2026-07-28, GREEN on statutory structure. The external lawyer
-- remains the sole GREEN authority for the A1 CONTENT gate and has NOT reviewed this.
--
-- GOVERNING PRINCIPLE (Dom, endorsed by Harvey as the thing to keep explicit):
-- WHO ELSE HOLDS THE PROOF. The more a document's proof is held elsewhere (the
-- registraire, the public register), the more benign its absence from the minute book;
-- the more it exists only inside the company, the graver. This grades the list without
-- any reference to duration, which Harvey ruled legally neutral on 2026-07-28 (5c543a8).
--
-- The column is named for BEHAVIOUR, not reason, deliberately: the exempt set mixes two
-- distinct rationales (proof-held-elsewhere for statuts / certificat / acceptation de
-- mandat; suppletif for the by-laws), so any reason-shaped name would be false for part
-- of the list.
--
-- An exempt row is still COUNTED in requirementsTotal, still uploadable and replaceable,
-- and still enters the binder on certification. It simply carries NO lateness tier and
-- feeds NEITHER overdueRegularize NOR overdueProlonged.
--
-- Additive and backfilled to false: every existing row keeps today's behaviour. Nothing
-- reads this column until the predicate lands in requirement-completeness.ts, so applying
-- this migration alone is inert.

ALTER TABLE minute_book_requirements
  ADD COLUMN IF NOT EXISTS exempt_from_lateness boolean NULL DEFAULT false;

COMMENT ON COLUMN minute_book_requirements.exempt_from_lateness IS
  'When true, this requirement is counted in the total but carries no lateness tier and feeds neither overdue counter. Graded by WHO ELSE HOLDS THE PROOF (Harvey 2026-07-24 / 2026-07-28, GREEN on statutory structure only). Behaviour-named, not reason-named: the exempt set mixes proof-held-elsewhere and suppletif rationales.';

-- ─── Seed: 9 exempt of the 16 foundational rows ──────────────────────────────
--
--   HORS    statuts + certificat de constitution -- the registraire holds them, so their
--           absence from the book is a missing copy, not a missing act.
--   FAIBLE  reglement interieur -- suppletif (art. 113-114 LSAQ + the "a defaut" pattern
--           at 52, 115-117, 134, 137-138, 164, 170). The law supplies its own defaults,
--           so a company without by-laws is not ruleless. The LCSA has an equivalent
--           mechanism under different article numbers.
--   FAIBLE  acceptation de mandat -- directors are declared at the REQ (art. 8-9 LSAQ,
--           art. 33 LPLE) and federally via the avis d'administrateurs.
--   PROOF   lsaq_declaration_initiale -- the LSA proof slot: the REQ already holds the
--           filing (art. 8-9 LSAQ, "une quasi-identite"). Before this change it rendered
--           "a venir" -- NOT YET DUE -- permanently, for a slot that has no due date and
--           never acquires one.
--
--   cbca_bylaw_2 (borrowing by-law) is DOM'S CALL, not a Harvey ruling. It extends the
--   suppletif reasoning: LCSA s.189 gives directors borrowing power unless the articles
--   or by-laws otherwise provide, so a borrowing by-law only restricts a power that
--   already exists by default.

UPDATE minute_book_requirements
SET exempt_from_lateness = true
WHERE requirement_key IN (
  'cbca_articles_incorporation',
  'cbca_certificate_incorporation',
  'cbca_bylaw_1',
  'cbca_bylaw_2',
  'cbca_director_acceptance',
  'lsaq_statuts_constitution',
  'lsaq_reglement_interieur',
  'lsaq_acceptation_mandat',
  'lsaq_declaration_initiale'
);

-- ─── Deliberately NOT exempt: the remaining 7 ────────────────────────────────
--
--   FORT     cbca_share_subscription, lsaq_souscription_actions
--            Proof exists ONLY internally (registre des valeurs mobilieres, art. 33 LSAQ
--            / art. 50 LCSA). Nobody else holds it; its absence is a real gap.
--
--   MODERE   cbca_first_board_resolution, cbca_first_shareholder_resolution,
--            lsaq_premiere_resolution_ca, lsaq_premiere_resolution_actionnaires
--            "Revelateurs" -- their absence suggests the founding acts may never have
--            been performed at all, not merely that the paper is missing.
--
--   FILING   cbca_declaration_initiale_qc
--            A FILING, not a constitutive document, so the constitutive-document
--            reasoning does not reach it. For a CBCA company WITHOUT hasLaterAnnualFiling
--            the deadline twin IS emitted and is genuinely overdue, so ddf061d's guard
--            stays load-bearing for a company shape we have no fixture for. Exempting it
--            would make Completude say "not late" while the board says "overdue" about the
--            same obligation. One boolean -- flip it if Harvey clears the extra-provincial
--            registration point.

-- Verification (read-only, run after applying):
--   SELECT requirement_key, framework, exempt_from_lateness
--   FROM minute_book_requirements
--   WHERE category = 'foundational'
--   ORDER BY framework, sort_order;
-- Expect exactly 9 true / 7 false.
