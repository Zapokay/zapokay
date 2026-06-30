-- Binder "Autres documents" section — widen documents.minute_book_section to
-- admit 'autres'. The CHECK was ('statuts','avis','reglements','resolutions',
-- 'administrateurs','dirigeants','actionnaires','registres') — codified in
-- 20260510134015_documents_drift_backfill.sql. This adds a NINTH value,
-- 'autres', the catch-all binder section for document_type='autre' (previously
-- mis-routed to 'statuts' / "Articles of Incorporation"). PREREQUISITE: must
-- apply BEFORE (a) the backfill of mis-stamped 'autre' docs to 'autres', and
-- (b) deploying the upload helper, which now stamps minute_book_section='autres'
-- for autre uploads — without this widening those inserts fail 23514.
--
-- minute_book_section is validated by this CHECK ALONE (plain text column, no
-- enum type, no trigger — verified across migrations). DROP IF EXISTS + ADD
-- mirrors the idempotent CHECK-alter pattern in
-- 20260618120100_a_sc_shareholdings_source_check.sql and
-- 20260628120000_company_fiscal_years_hold_status.sql. Constraint-WIDEN ONLY:
-- no column/default change, no data touched, no original value dropped.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_minute_book_section_check;
ALTER TABLE documents ADD CONSTRAINT documents_minute_book_section_check
  CHECK (minute_book_section = ANY (ARRAY[
    'statuts'::text,
    'avis'::text,
    'reglements'::text,
    'resolutions'::text,
    'administrateurs'::text,
    'dirigeants'::text,
    'actionnaires'::text,
    'registres'::text,
    'autres'::text
  ]));
