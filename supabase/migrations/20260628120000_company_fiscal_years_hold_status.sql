-- Hold-only vault import — widen company_fiscal_years.status to admit 'hold'.
-- `status` was CHECK ('active','archived') (20260508210425_create_company_fiscal_years.sql).
-- This adds a THIRD value, 'hold', for fiscal years that exist only to HOLD
-- out-of-window (archive) imported documents. Vocabulary — the three meanings:
--   'active'   = a tracked compliance year (current+7 window). Scored in
--                completeness; offered in the scored year dropdowns.
--   'archived' = an EMPTY year the user deactivated (hard-guarded to hold no
--                documents). Excluded from scoring + dropdowns. UNTOUCHED here.
--   'hold'     = a year that exists to HOLD out-of-window imported archive
--                documents (NEW). Excluded from scoring + dropdowns because it
--                rides the existing status='active' filter — so the dropdowns
--                and the completeness denominator need NO change. Its finalized
--                docs still reach the year-agnostic binder, and it renders in
--                Complétude as an archive box.
-- Constraint-WIDEN ONLY: no column default change ('active' stays), no data
-- backfill, no row touched, 'archived' semantics untouched. DROP IF EXISTS
-- mirrors the idempotent CHECK-alter pattern in
-- 20260618120100_a_sc_shareholdings_source_check.sql.

ALTER TABLE company_fiscal_years DROP CONSTRAINT IF EXISTS company_fiscal_years_status_check;
ALTER TABLE company_fiscal_years ADD CONSTRAINT company_fiscal_years_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'hold'::text]));
