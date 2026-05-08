# Sprint 10A Batch 2 — Foundation Backfill Investigation

**Date:** 2026-05-08
**Scope:** Pre-authoring inventory of 4 production-only tables targeted by Batch 2:
`minute_book_requirements`, `feature_flags`, `activity_log`, `company_fiscal_years`.
**Reference audit:** `docs/schema-drift-audit-2026-05-07.md` §4.6 items #2, #3, #5, #11.
**Reference Batch 1 migration:** `supabase/migrations/20260508120000_complete_sprint6_people_ownership.sql`.

This investigation captures the live shape of each table on the remote project as
observed via MCP `execute_sql` (read-only). The findings drive the authoring of
4 forward-only, idempotent migration files in Phase B. **No DDL was executed in
this phase.**

---

## 1. Stop-condition checks

| Table                       | Audit-claimed rows | Observed rows | Verdict |
|-----------------------------|--------------------|---------------|---------|
| `minute_book_requirements`  | 25                 | **25**        | PASS    |
| `feature_flags`             | 5                  | **5**         | PASS    |
| `activity_log`              | tenant data        | 163           | PASS (tenant data must be preserved) |
| `company_fiscal_years`      | tenant data        | 32            | PASS (tenant data must be preserved) |

No stop-condition triggered. Proceeding to authoring is safe.

---

## 2. Surprises vs audit §4.6

These were **not** surfaced (or not surfaced precisely) in the audit and must be
honored in Phase B authoring:

1. **`minute_book_requirements.section` CHECK enumerates 8 values**, not 6.
   Live values: `statuts`, `reglements`, `resolutions`, `registres`, `avis`,
   `actionnaires`, `administrateurs`, `dirigeants`. The 25 seed rows currently
   only populate 6 of those 8 (`statuts`, `reglements`, `avis`, `resolutions`,
   `actionnaires`, `administrateurs`) — but the CHECK leaves room for the
   remaining two (`registres`, `dirigeants`). Migration must encode all 8.

2. **`minute_book_requirements` UNIQUE is composite** `(requirement_key, framework)`
   — not `requirement_key` alone. This is the correct shape (LSA and CBCA share
   `requirement_key` values like `auditor_waiver`-style overlaps would otherwise
   collide). Migration `ON CONFLICT (requirement_key, framework)` not
   `ON CONFLICT (requirement_key)`.

3. **No triggers on any of the 4 tables.** No `updated_at` columns either.
   No need to re-declare `update_updated_at_column()` (already created by the
   Sprint 6 completion migration `20260508120000`).

4. **All 4 tables already have RLS enabled** with policies matching the audit
   spec. No re-enable needed; migration ENABLE/policy creation must be guarded
   by `IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN duplicate_object $$`.

---

## 3. Per-table inventory

### 3.1 `minute_book_requirements`

**Columns (14):**

| # | Column           | Type        | Nullable | Default              |
|---|------------------|-------------|----------|----------------------|
| 1 | `id`             | uuid        | NO       | `gen_random_uuid()`  |
| 2 | `requirement_key`| text        | NO       | —                    |
| 3 | `category`       | text        | NO       | —                    |
| 4 | `jurisdiction`   | text        | NO       | —                    |
| 5 | `framework`      | text        | NO       | —                    |
| 6 | `title_fr`       | text        | NO       | —                    |
| 7 | `title_en`       | text        | NO       | —                    |
| 8 | `description_fr` | text        | YES      | —                    |
| 9 | `description_en` | text        | YES      | —                    |
| 10| `section`        | text        | NO       | —                    |
| 11| `sort_order`     | integer     | YES      | `0`                  |
| 12| `can_generate`   | boolean     | YES      | `false`              |
| 13| `can_upload`     | boolean     | YES      | `true`               |
| 14| `created_at`     | timestamptz | YES      | `now()`              |

**Constraints:**
- PK `minute_book_requirements_pkey` on `(id)`
- UNIQUE `minute_book_requirements_requirement_key_framework_key` on `(requirement_key, framework)`
- CHECK `minute_book_requirements_category_check`: `category IN ('foundational','annual')`
- CHECK `minute_book_requirements_section_check`: `section IN ('statuts','reglements','resolutions','registres','avis','actionnaires','administrateurs','dirigeants')`

**Indexes:** PK + UNIQUE only (no extra indexes — read-once-per-page table).

**RLS:** enabled. Policy `minute_book_requirements_read` (SELECT, qual = `true`).

**Triggers:** none.

**Seed rows: 25 (16 foundational + 9 annual; LSA=11, CBCA=14).** Full inventory
(sorted by `sort_order`, `framework`):

| sort_order | requirement_key                          | category     | jurisdiction | framework | section          | can_generate | can_upload |
|------------|------------------------------------------|--------------|--------------|-----------|------------------|--------------|------------|
| 10         | lsaq_statuts_constitution                | foundational | QC           | LSA       | statuts          | false        | true       |
| 10         | cbca_certificate_incorporation           | foundational | CA           | CBCA      | statuts          | false        | true       |
| 15         | cbca_articles_incorporation              | foundational | CA           | CBCA      | statuts          | false        | true       |
| 20         | lsaq_reglement_interieur                 | foundational | QC           | LSA       | reglements       | false        | true       |
| 20         | cbca_bylaw_1                             | foundational | CA           | CBCA      | reglements       | false        | true       |
| 25         | cbca_bylaw_2                             | foundational | CA           | CBCA      | reglements       | false        | true       |
| 30         | lsaq_declaration_initiale                | foundational | QC           | LSA       | avis             | false        | true       |
| 35         | cbca_declaration_initiale_qc             | foundational | CA           | CBCA      | avis             | false        | true       |
| 40         | lsaq_premiere_resolution_ca              | foundational | QC           | LSA       | resolutions      | true         | true       |
| 40         | cbca_first_board_resolution              | foundational | CA           | CBCA      | resolutions      | true         | true       |
| 50         | lsaq_premiere_resolution_actionnaires    | foundational | QC           | LSA       | resolutions      | true         | true       |
| 50         | cbca_first_shareholder_resolution        | foundational | CA           | CBCA      | resolutions      | true         | true       |
| 60         | lsaq_souscription_actions                | foundational | QC           | LSA       | actionnaires     | true         | true       |
| 60         | cbca_share_subscription                  | foundational | CA           | CBCA      | actionnaires     | true         | true       |
| 70         | cbca_director_acceptance                 | foundational | CA           | CBCA      | administrateurs  | false        | true       |
| 70         | lsaq_acceptation_mandat                  | foundational | QC           | LSA       | administrateurs  | false        | true       |
| 100        | cbca_annual_board_resolution             | annual       | CA           | CBCA      | resolutions      | true         | true       |
| 100        | lsaq_annual_board_resolution             | annual       | QC           | LSA       | resolutions      | true         | true       |
| 110        | cbca_annual_shareholder_resolution       | annual       | CA           | CBCA      | resolutions      | true         | true       |
| 110        | lsaq_annual_shareholder_resolution       | annual       | QC           | LSA       | resolutions      | true         | true       |
| 120        | cbca_auditor_waiver                      | annual       | CA           | CBCA      | resolutions      | true         | true       |
| 120        | lsaq_auditor_waiver                      | annual       | QC           | LSA       | resolutions      | true         | true       |
| 130        | cbca_annual_return                       | annual       | CA           | CBCA      | avis             | false        | true       |
| 130        | lsaq_req_annual_update                   | annual       | QC           | LSA       | avis             | false        | true       |
| 140        | cbca_req_annual_update_qc                | annual       | CA           | CBCA      | avis             | false        | true       |

Full title/description text captured in MCP query output (file: investigation
notes — not duplicated here for brevity, will be embedded as INSERT statements
in the Phase B migration verbatim).

### 3.2 `feature_flags`

**Columns (6):**

| # | Column        | Type        | Nullable | Default             |
|---|---------------|-------------|----------|---------------------|
| 1 | `id`          | uuid        | NO       | `gen_random_uuid()` |
| 2 | `flag_key`    | text        | NO       | —                   |
| 3 | `is_enabled`  | boolean     | YES      | `false`             |
| 4 | `enabled_for` | jsonb       | YES      | —                   |
| 5 | `description` | text        | YES      | —                   |
| 6 | `created_at`  | timestamptz | YES      | `now()`             |

**Constraints:** PK on `(id)`, UNIQUE `feature_flags_flag_key_key` on `(flag_key)`. No CHECK constraints.

**Indexes:** PK + UNIQUE only.

**RLS:** enabled. Policy `feature_flags_read` (SELECT, qual = `true`).

**Triggers:** none.

**Seed rows: 5.** ON CONFLICT key = `flag_key`.

| flag_key            | is_enabled | description                                      |
|---------------------|------------|--------------------------------------------------|
| `multi_company`     | false      | Permet aux users dajouter plusieurs compagnies   |
| `ai_gap_analysis`   | true       | Analyse des gaps par lIA                         |
| `ai_summaries`      | true       | Résumés IA des documents                         |
| `catch_up_wizard`   | true       | Assistant de rattrapage des résolutions manquantes |
| `settings_page`     | true       | Page Paramètres active                           |

Note: live `description` text contains apostrophe-stripped artifacts (e.g.,
`dajouter`, `lIA`). Migration must reproduce these **exactly** to remain a
no-op against current state. No "cleanup" — anti-ask #2 (no row modifications).

### 3.3 `activity_log`

**Columns (8):**

| # | Column        | Type        | Nullable | Default             |
|---|---------------|-------------|----------|---------------------|
| 1 | `id`          | uuid        | NO       | `gen_random_uuid()` |
| 2 | `company_id`  | uuid        | NO       | —                   |
| 3 | `user_id`     | uuid        | YES      | —                   |
| 4 | `event_type`  | text        | NO       | —                   |
| 5 | `title_fr`    | text        | NO       | —                   |
| 6 | `title_en`    | text        | NO       | —                   |
| 7 | `details`     | jsonb       | YES      | `'{}'::jsonb`       |
| 8 | `created_at`  | timestamptz | YES      | `now()`             |

**Constraints:**
- PK on `(id)`
- FK `activity_log_company_id_fkey`: `(company_id) REFERENCES companies(id) ON DELETE CASCADE`
- FK `activity_log_user_id_fkey`: `(user_id) REFERENCES users(id) ON DELETE SET NULL`
- CHECK `activity_log_event_type_check`: 18 values —
  `document_uploaded`, `document_generated`, `document_deleted`,
  `director_added`, `director_removed`,
  `officer_added`, `officer_removed`, `officer_replaced`,
  `shareholder_added`, `shares_issued`, `share_class_created`,
  `company_created`, `company_updated`,
  `fiscal_year_activated`, `fiscal_year_archived`,
  `compliance_item_completed`, `wizard_completed`, `settings_updated`.

**Indexes:**
- PK
- `idx_activity_log_company` on `(company_id)`
- `idx_activity_log_created` on `(created_at DESC)`

**RLS:** enabled. Policies:
- `activity_log_read_own` (SELECT) — `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())`
- `activity_log_insert_own` (INSERT) — same `with_check` clause

**Triggers:** none.

**Tenant rows:** 163 — must be preserved. Migration is CREATE-only (no seed).

### 3.4 `company_fiscal_years`

**Columns (5):**

| # | Column       | Type        | Nullable | Default             |
|---|--------------|-------------|----------|---------------------|
| 1 | `id`         | uuid        | NO       | `gen_random_uuid()` |
| 2 | `company_id` | uuid        | NO       | —                   |
| 3 | `year`       | integer     | NO       | —                   |
| 4 | `status`     | text        | NO       | `'active'::text`    |
| 5 | `created_at` | timestamptz | YES      | `now()`             |

**Constraints:**
- PK on `(id)`
- UNIQUE `company_fiscal_years_company_id_year_key` on `(company_id, year)`
- FK `company_fiscal_years_company_id_fkey`: `(company_id) REFERENCES companies(id) ON DELETE CASCADE`
- CHECK `company_fiscal_years_status_check`: `status IN ('active','archived')`

**Indexes:** PK + UNIQUE only.

**RLS:** enabled. Policy `Users own fiscal years` (ALL) —
`company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())`.

**Triggers:** none.

**Tenant rows:** 32 — must be preserved. Migration is CREATE-only (no seed).

---

## 4. Authoring plan (Phase B)

Four separate migration files via `npx supabase migration new`, in order
that respects FK dependencies (`activity_log` and `company_fiscal_years`
both reference `companies` which already exists):

| # | Filename pattern                                                  | Shape          |
|---|-------------------------------------------------------------------|----------------|
| 1 | `<ts>_create_minute_book_requirements_with_seed.sql`              | DDL + 25-row seed (`ON CONFLICT (requirement_key, framework) DO NOTHING`) |
| 2 | `<ts>_create_feature_flags_with_seed.sql`                         | DDL + 5-row seed (`ON CONFLICT (flag_key) DO NOTHING`) |
| 3 | `<ts>_create_activity_log.sql`                                    | DDL only (no seed; tenant data lives there) |
| 4 | `<ts>_create_company_fiscal_years.sql`                            | DDL only (no seed; tenant data lives there) |

All four migrations follow the Batch 1 pattern:
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent: re-enabling is a no-op)
- Policies wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- Seed rows: `INSERT ... ON CONFLICT (<unique_key>) DO NOTHING`
- Header comment block referencing this audit doc + audit §4.6 item #
- Footer note: forward-only, idempotent, no destructive ops

CHECK constraints are **inline in CREATE TABLE** (idempotent because the
table only creates if not exists; once present, the constraint is part of
the table definition).

FKs are **inline in CREATE TABLE** for the same reason.

---

## 5. Risk assessment

- **Tenant data risk:** Zero. Both tenant tables (`activity_log`,
  `company_fiscal_years`) use `CREATE TABLE IF NOT EXISTS` only — no
  ALTER, no DELETE, no UPDATE. If the table exists (and it does, with rows),
  the entire DDL block is a no-op.
- **Seed drift risk:** Zero if `ON CONFLICT` keys are correct.
  - `minute_book_requirements`: composite `(requirement_key, framework)` ✓
  - `feature_flags`: `(flag_key)` ✓
- **Description encoding risk:** Live `feature_flags.description` strings
  contain stripped apostrophes (`dajouter`, `lIA`). Migration string literals
  must use the live form verbatim. Anti-ask #2 forbids "fixing" these.
- **CHECK constraint risk:** All CHECK lists captured verbatim from
  `pg_constraint.pg_get_constraintdef()`. Any divergence in the migration
  authoring would produce a constraint mismatch on a fresh DB recreation
  (e.g., a future branch). Authoring must reproduce the live CHECK lists
  verbatim.
- **Section-CHECK width:** Migration uses the live 8-value `section` CHECK,
  not the 6 inferred from seed data. This avoids a future blocker if a new
  requirement key with `section IN ('registres','dirigeants')` is added.

---

## 6. Open questions / flags for Dom

None. Audit was accurate on all 4 tables. The two surprises (composite
unique on `minute_book_requirements`, 8-value section CHECK) do not require
escalation — they are simply richer than the audit text, and the migration
will encode the live shape verbatim.

---

## 7. Approval gate

This document is Commit 1 of Batch 2 (per Phase F brief). Awaiting approval
to commit before proceeding to Phase B authoring.
