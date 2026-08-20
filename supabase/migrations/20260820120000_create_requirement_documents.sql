-- =============================================================================
-- A1 — requirement_documents (one document DECLARES the requirements it covers)
-- =============================================================================
-- One row = "this document covers this requirement, for this year." A document
-- carrying five rows here covers five requirements: the cabinet PDF that holds
-- the whole founding file, or one PDF grouping five years of annual resolutions.
--
-- ─── HOW THIS IS APPLIED (read before running anything) ──────────────────────
-- Applied via the Supabase DASHBOARD SQL EDITOR, NOT via the CLI.
-- Consequence: supabase_migrations.schema_migrations will have NO row for
-- version 20260820120000, so the CLI believes this migration is still pending.
-- A future `supabase db push` will therefore try to run it again.
--
-- That re-run is SAFE, because every statement below is idempotent:
--   CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS;
--   ENABLE ROW LEVEL SECURITY is a no-op when RLS is already on;
--   the policy is DROP-IF-EXISTS'd before being created, because Postgres has
--   NO `CREATE POLICY IF NOT EXISTS` — not in 17.6, not in any earlier version.
--   (event_documents and event_filings both carry a bare CREATE POLICY, so a
--   replay of THOSE files would fail on a duplicate policy. Not fixed here.)
-- A future non-idempotent migration in the same position would NOT be safe.
--
-- To record it in the ledger if that ever matters:
--   npx supabase migration repair --status applied 20260820120000
--
-- ─── THE TABLE IS INERT, AND THAT IS THE POINT ───────────────────────────────
-- Nothing writes it. Nothing reads it. `documents.requirement_key` and
-- `documents.requirement_year` continue to govern all seven readers.
--
-- This table lives BESIDE those two columns; it does not replace them. The
-- column is the most heavily joined value in the product, and DOUBLE WRITING is
-- what will later allow the readers to be switched over ONE AT A TIME. Ships
-- EMPTY: no backfill, no UPDATE, no INSERT. Stop after this migration and the
-- product is exactly today's, plus an empty table.
--
-- =============================================================================
-- THE SEVEN DECISIONS THAT PRODUCED THIS SHAPE — recorded so they are not
-- re-litigated. Each was measured against the live schema on 2026-08-20.
-- =============================================================================
--
-- 1. THE YEAR LIVES ON THE LINK, not on the document alone.
--    requirement-completeness.ts matches annual rows with a STRICT equality
--    (`d.requirement_year === fy.year`). A PDF grouping five fiscal years is ONE
--    `documents` row whose scalar `requirement_year` can hold ONE value, so four
--    of the five years would read as unsatisfied. Only a per-link year covers it.
--
-- 2. `requirement_year` NULL means EXACTLY "the catalog row this points at is
--    category = 'foundational'". NOT "every year". NOT "unknown".
--    Measured 2026-08-20: 16 documents with a NULL year, all on foundational
--    keys; 67 with a non-NULL year, all on annual keys; zero exceptions across
--    83 keyed rows — those two combinations are the ONLY ones that occur, and
--    no key falls outside the catalog.
--    ⚠️ This invariant is NOT expressible as a CHECK without joining the catalog.
--    It stays an APPLICATION invariant — exactly as the #135 identity already is.
--
-- 3. `NULLS NOT DISTINCT` IS LOAD-BEARING.
--    Postgres treats NULLs as DISTINCT in a unique index by default, and
--    `requirement_year` is NULL on every foundational link — so a bare UNIQUE
--    would NOT stop the same foundational pair being inserted twice.
--    event_documents never hit this: all four columns of its UNIQUE are NOT NULL
--    (measured). The clause requires PG 15+; this database is 17.6 (measured).
--
-- 4. NO UNIQUE on (company_id, requirement_key, requirement_year). Deliberate,
--    for two measured reasons:
--      (a) a replaced document keeps status='superseded' for a 10-day buffer
--          before the cron purges it, and its links must SURVIVE that window —
--          hold-years.ts selects requirement_key on archived documents. A unique
--          here would forbid the replacement from coexisting with the replaced.
--      (b) two overlapping cabinet bundles may legitimately both declare the
--          same requirement. A unique would make the second upload FAIL instead
--          of letting it supersede the first.
--    The "one active per requirement" rule already lives with the supersede
--    writers (generatePdfDocument.ts, upload-document.ts,
--    generate-lifecycle-document.ts) and is not duplicated here. Measured: zero
--    (company, key, year) groups currently hold more than one active document.
--
-- 5. NO STATE COLUMN. Dom's ruling: a single certification checkbox covers every
--    requirement a document declares. `is_finalized` stays on the DOCUMENT — and
--    it is written ONLY at INSERT (upload-document.ts), never by any UPDATE
--    anywhere in the repo (measured). Readers filter `status='active'` on the
--    DOCUMENT side, so the document's state already answers for its links.
--    event_documents carries no state column either; the nearest model agrees.
--
-- 6. NO `framework` COLUMN. The 24 catalog keys are disjoint across regimes
--    (measured: 24 rows, 24 distinct keys, each prefixed cbca_ / lsaq_), and the
--    regime is derivable through company_id — there is no `framework` column on
--    `companies` at all; it is DERIVED from `incorporation_type`. A column here
--    would be a second source of truth.
--    ⚠️ LATENT TRAP, named so it is not a surprise: requirement-completeness.ts
--    queries `.or('framework.eq.<fw>,framework.eq.ALL')`, anticipating a catalog
--    row with framework='ALL'. Zero such rows exist today. The day one is seeded,
--    a key could exist as both ('foo','ALL') and ('foo','LSA') under the catalog's
--    existing UNIQUE, and the key alone stops being unambiguous. THE FIX BELONGS
--    TO THE CATALOG (forbid a key under both), not to this table.
--
-- 7. NO FOREIGN KEY to minute_book_requirements. Not a preference — impossible:
--    `requirement_key` alone carries no unique constraint, the catalog's only one
--    being UNIQUE (requirement_key, framework). Referencing the catalog would
--    force `framework` onto every row here, contradicting decision 6. This also
--    matches the precedent: `documents.requirement_key` has no FK to the catalog
--    today either.
--
-- ─── company_id IS DENORMALIZED DELIBERATELY ─────────────────────────────────
-- Quoting 20260524215506_create_event_documents.sql verbatim:
--   "Denormalized company_id (NOT NULL, FK to companies) for RLS performance and
--    per-tenant scoping. Convention follows existing per-company tables."
-- It holds here for three measured reasons: the RLS policy is expressed on
-- company_id directly (no join to documents, then to companies, per row); the
-- service-role write paths use it as a manual defence-in-depth tenant guard
-- (generate-lifecycle-document.ts adds `.eq('company_id', …)` to its UPDATE for
-- exactly this); and it is the leading column of the composite index below.
--
-- ─── `origin` IS INERT TODAY, AND HERE IS WHEN IT WILL BE READ ───────────────
-- 'declared'  = the user ticked this requirement when importing the document.
-- 'generated' = the link was created by generating a document for it.
--
-- WHY IT EXISTS AT ALL: the #135 auto-supersede predicate
-- (generatePdfDocument.ts) evicts by (company_id, requirement_key, year) with no
-- `source` guard, so an uploaded, uncertified bundle qualifies. Regenerating ONE
-- of the requirements a bundle declares would evict the whole bundle. This column
-- is where that fix will be anchored: the predicate will be able to exclude
-- 'declared' links.
--
-- ⚠️ AND HERE IS THE LIMIT, stated because a sentence that promises more than it
-- holds is worse than no sentence. `origin` is per LINK. The supersede predicate
-- selects DOCUMENTS, and superseding a document carries ALL of its links with it
-- (readers filter on documents.status, not on the link). So a generated document
-- that later receives 'declared' links to K2 and K3 would still lose K2 and K3
-- when K is regenerated. THE COLUMN IS THE SUPPORT FOR THE FIX, NOT THE FIX.
--
-- Nothing reads it today. It is written by nothing. It is here so that the fix,
-- when it lands, does not cost a second migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS requirement_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID        NOT NULL REFERENCES documents(id)  ON DELETE CASCADE,
  company_id       UUID        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  requirement_key  TEXT        NOT NULL,
  requirement_year INTEGER     NULL,
  origin           TEXT        NOT NULL DEFAULT 'declared'
                               CHECK (origin IN ('declared','generated')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (document_id, requirement_key, requirement_year)
);

-- Leading column is company_id, so this index also serves the RLS predicate's
-- company_id lookups; no separate single-column index is needed.
CREATE INDEX IF NOT EXISTS idx_requirement_documents_company_requirement
  ON requirement_documents(company_id, requirement_key);

CREATE INDEX IF NOT EXISTS idx_requirement_documents_document_id
  ON requirement_documents(document_id);

ALTER TABLE requirement_documents ENABLE ROW LEVEL SECURITY;

-- Policy predicate copied VERBATIM from event_documents (20260524215506).
-- DROP-first because Postgres has no CREATE POLICY IF NOT EXISTS; this is what
-- makes a replay safe. Membership is single-owner: companies.user_id, there is
-- no membership table in this schema.
DROP POLICY IF EXISTS "Users can manage their own company requirement documents"
  ON requirement_documents;

CREATE POLICY "Users can manage their own company requirement documents"
  ON requirement_documents FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Semantics carried in the schema itself, not only in this file: a column nobody
-- reads is a column whose meaning is lost by the time someone needs it.
COMMENT ON TABLE requirement_documents IS
  'Links ONE document to the MULTIPLE minute-book requirements it covers (requirement_key + requirement_year per row). INERT as shipped: nothing writes it and nothing reads it — documents.requirement_key/.requirement_year still govern all seven readers. It lives BESIDE those columns to allow a reader-by-reader switchover, and carries NO state: is_finalized and status stay on documents.';

COMMENT ON COLUMN requirement_documents.requirement_year IS
  'NULL means EXACTLY that the catalog row this points at is category = ''foundational''. It does NOT mean "every year" and it does NOT mean "unknown". Not expressible as a CHECK without joining minute_book_requirements, so it is an APPLICATION invariant. Measured 2026-08-20: 16 NULL-year rows all foundational, 67 non-NULL all annual, zero exceptions across 83. Also load-bearing for this table''s UNIQUE, which is NULLS NOT DISTINCT precisely because this column is NULL on every foundational link.';

COMMENT ON COLUMN requirement_documents.origin IS
  'Provenance of the LINK, not state of the document. declared = the user ticked this requirement at import; generated = the link was created by generating a document. Nothing reads it today. It exists for the #135 auto-supersede fix, whose predicate will be able to exclude declared links. LIMIT: origin is per link while supersede selects DOCUMENTS, so superseding a document still carries all its links — this column is the support for that fix, not the fix.';
