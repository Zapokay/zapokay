# Sprint 10A Batch 3 — Documents Drift Backfill Investigation

**Date:** 2026-05-10
**Author:** Claude Code (CC)
**Brief:** Sprint 10A Batch 3 (Dom 2026-05-10)
**Status:** Investigation complete. Migration plan locked. Awaiting Phase B authoring.
**Companion migration:** `supabase/migrations/<timestamp>_documents_drift_backfill.sql` (created by `npx supabase migration new documents_drift_backfill`)
**Parent audit:** `docs/schema-drift-audit-2026-05-07.md` §1 + §4.6

---

## 1. §4.6 status corrective preamble

Memory v3.41 (last updated 2026-05-08) listed 4/13 §4.6 items closed as `{#2, #3, #5, #11}`. Phase A reconciliation against the Batch 2 ship (`5f36a49`) plus the Batch 1 ship (`c5c1d56`) shows the actual ledger differs:

| §4.6 item | Status | Closed by |
|---|---|---|
| #1  `minute_book_requirements` table | **CLOSED** | Batch 2 (`5f36a49`) |
| #2  `company_fiscal_years` table | **CLOSED** | Batch 2 (`5f36a49`) |
| #3  `activity_log` table | **CLOSED** | Batch 2 (`5f36a49`) |
| #4  `feature_flags` seed | **CLOSED** | Batch 2 (`5f36a49`) |
| #5  documents columns (3 named: `requirement_key`, `requirement_year`, `signatories_confirmed`) | OPEN | — |
| #6  `compliance_rules` shape disagreement | OPEN | — |
| #7  `compliance_items.status` CHECK enum | OPEN | — |
| #8  Migration 20260405 partial-execution | **CLOSED** | Batch 1 (`c5c1d56`) |
| #9  `documents.company_id` missing index | OPEN | — |
| #10 `compliance_items.company_id` missing index | OPEN | — |
| #11 `activity_log.event_type` 18-value CHECK | **CLOSED** | Batch 2 (`5f36a49`, rolled into activity_log create) |
| #12 documents 6 off-repo CHECKs | OPEN | — |
| #13 NEQ partial unique index | OPEN | — |

**Pre-Batch-3 ledger:** Closed = `{#1, #2, #3, #4, #8, #11}` (6/13). Open = `{#5, #6, #7, #9, #10, #12, #13}` (7/13).

This preamble is the canonical source of truth going forward. End-of-session v3.42 memory regen will match.

---

## 2. Additional audit corrections surfaced by Phase A

Beyond the §4.6 ledger, Phase A surfaced three other audit-level inaccuracies worth banking before Batch 4-5 work:

1. **`documents.status` CHECK.** Audit §1 wrote: *"`status` … CHECK constraint enum opaque to PostgREST"*, implying a CHECK exists. Phase A psql probe (via `pg_constraint`) confirms **no CHECK exists on `status`**. The column has `DEFAULT 'active'` but is otherwise unconstrained. Migration adds the column with default but **no CHECK**.

2. **§4.6 item #12 wording.** Audit said *"`documents` has 6 off-repo CHECK enums."* Phase A confirms 3 of those 6 are committed (`document_type` via migration 20260329; `framework` + `language` via `schema.sql:151–153`). Actual off-repo CHECKs on `documents` = **3** (`minute_book_section`, `signature_status`, `source`). Batch 3 codifies these 3.

3. **Brief column list typo.** Sprint 10A Batch 3 brief listed `title` among 8 drifted columns. `title` is committed (`schema.sql:148` — `title TEXT NOT NULL`). False positive, dropped from migration scope.

---

## 3. Phase A inventory (verbatim probe results)

### 3.1 Column shape (probe `information_schema.columns`)

Prod has **28 columns**. Committed baseline = 11 (10 from `schema.sql:145–156`, +1 from migration `20260506`). Net-new drifted = **17**.

The 17 drifted columns (in ordinal-position order):

| ord | column | type | nullable | default | classification |
|---|---|---|---|---|---|
| 11 | `file_name` | text | YES | — | drifted (BLOCKER per §1) |
| 12 | `file_size` | integer | YES | — | drifted (load-bearing) |
| 13 | `status` | text | YES | `'active'` | drifted (BLOCKER); **no CHECK in prod** |
| 14 | `document_year` | integer | YES | — | drifted (BLOCKER) |
| 15 | `fiscal_year` | text | YES | — | drifted (DEAD per §1; codified for completeness, not pruned) |
| 16 | `ai_summary_fr` | jsonb | YES | — | drifted (load-bearing AI) |
| 17 | `ai_summary_en` | jsonb | YES | — | drifted (load-bearing AI) |
| 18 | `source` | text | YES | `'uploaded'` | drifted (BLOCKER, has CHECK) |
| 19 | `generated_for_year` | integer | YES | — | drifted (DEAD per §1; codified for completeness) |
| 20 | `catch_up_session_id` | uuid | YES | — | drifted (DEAD per §1; column-only, FK deferred) |
| 21 | `requirement_key` | text | YES | — | drifted (BLOCKER) |
| 22 | `requirement_year` | integer | YES | — | drifted (BLOCKER) |
| 23 | `minute_book_section` | text | YES | — | drifted (load-bearing, has CHECK) |
| 24 | `signature_status` | text | YES | `'draft'` | drifted (load-bearing, has CHECK) |
| 25 | `signed_at` | timestamptz | YES | — | drifted (load-bearing) |
| 26 | `signed_version_url` | text | YES | — | drifted (load-bearing) |
| 27 | `signatories_confirmed` | jsonb | YES | — | drifted (load-bearing) |

Dead columns (`fiscal_year`, `generated_for_year`, `catch_up_session_id`) are codified into the migration anyway — backfill aim is "committed source matches prod," and pruning is a separate decision (Phase 10A or later).

### 3.2 Constraints (probe `pg_constraint`/`pg_get_constraintdef()`)

| conname | type | committed? |
|---|---|---|
| `documents_pkey` | PK | YES (`schema.sql`) |
| `documents_company_id_fkey` (CASCADE) | FK | YES (`schema.sql`) |
| `documents_document_type_check` (6-value enum) | CHECK | YES (migration 20260329) |
| `documents_framework_check` (LSA/CBCA) | CHECK | YES (`schema.sql`) |
| `documents_language_check` (fr/en/bilingual) | CHECK | YES (`schema.sql`) |
| `documents_minute_book_section_check` | CHECK | **NO — codify** |
| `documents_signature_status_check` | CHECK | **NO — codify** |
| `documents_source_check` | CHECK | **NO — codify** |
| `documents_catch_up_session_id_fkey` | FK | **NO — defer** (references off-repo `catch_up_sessions`) |

Verbatim CHECK definitions (captured via `pg_get_constraintdef()` on 2026-05-10):

- `documents_minute_book_section_check`:
  `CHECK ((minute_book_section = ANY (ARRAY['statuts'::text, 'avis'::text, 'reglements'::text, 'resolutions'::text, 'administrateurs'::text, 'dirigeants'::text, 'actionnaires'::text, 'registres'::text])))`
- `documents_signature_status_check`:
  `CHECK ((signature_status = ANY (ARRAY['draft'::text, 'pending_signature'::text, 'signed'::text])))`
- `documents_source_check`:
  `CHECK ((source = ANY (ARRAY['uploaded'::text, 'generated'::text, 'imported'::text])))`

### 3.3 Indexes (probe `pg_indexes`)

Only `documents_pkey`. **No FK index on `company_id`** — confirms §4.6 #9. Migration adds `idx_documents_company_id` to close that gap.

### 3.4 RLS state + policies (probe `pg_class.relrowsecurity`, `pg_policies`)

- `relrowsecurity = true`, `relforcerowsecurity = false`
- 4 policies: `documents_select_own`, `documents_insert_own`, `documents_update_own`, `documents_delete_own`
- All four use `EXISTS (SELECT 1 FROM companies c WHERE c.id = documents.company_id AND c.user_id = auth.uid())`
- **All four match `schema.sql:160–190` verbatim — zero drift, no codification needed**

### 3.5 Triggers (probe `pg_trigger`)

**Zero user-defined triggers on `documents`.** No codification needed.

### 3.6 Inbound FK dependencies

**Zero tables FK-reference `documents`.** No fan-out concern.

### 3.7 Row count

**42 rows.** Well under 10K threshold; ALTER ADD COLUMN performance is a non-issue.

### 3.8 Sample row inspection

Top-5 by `created_at DESC` (Acme Test inc., `aceaceac-...-002`): all FR/QC/LSA, mix of `is_finalized` true/false, valid `requirement_key` values from `lib/requirement-doctype.ts`, valid `minute_book_section` values from §3.2's 8-value enum. No null violations. No CHECK violations. No surprises.

---

## 4. Migration plan

### 4.1 Scope (locked 2026-05-10 by Dom)

| Element | Count | Mechanism |
|---|---|---|
| Column ADDs | 17 | `ALTER TABLE documents ADD COLUMN IF NOT EXISTS …` |
| CHECK constraints | 3 | `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$` |
| Indexes | 1 | `CREATE INDEX IF NOT EXISTS idx_documents_company_id ON documents(company_id)` |
| FK constraints | 0 | `catch_up_session_id` reproduced as column only |
| Row touches | 0 | Zero INSERT/UPDATE/DELETE |
| Trigger/function changes | 0 | None present in prod, none codified |
| RLS changes | 0 | Already committed and matches prod |

### 4.2 Out of scope

- FK on `catch_up_session_id`. Reason: references `catch_up_sessions` which is itself off-repo (§1 lists as DOC-ONLY, possibly drop candidate). Reproducing the FK before its target table is committed creates a phantom dependency. **Deferred to whichever batch tracks-in `catch_up_sessions`.**
- CHECK on `status`. Reason: prod has none. Adding one would be a structural change, banned by Batch 3 anti-asks (§3 of the brief).
- Index for `catch_up_session_id`. Reason: column has 0 application reads; index would be unused.
- Pruning of dead columns (`fiscal_year`, `generated_for_year`, `catch_up_session_id`). Reason: backfill is mirror-only; pruning is a separate forward-only decision.

### 4.3 Idempotency mechanisms (per Batch 2 methodology)

- Columns: `ADD COLUMN IF NOT EXISTS` — Postgres no-op against existing column; emits NOTICE 42701.
- Index: `CREATE INDEX IF NOT EXISTS` — Postgres no-op against existing index.
- CHECKs: wrapped in `DO $$ BEGIN ALTER TABLE … ADD CONSTRAINT … CHECK …; EXCEPTION WHEN duplicate_object THEN NULL; END $$` (per `20260508210035_create_activity_log.sql:87–117` template).
- All operations forward-only. No `DROP`, no `ALTER COLUMN`, no row touches.

### 4.4 Verbatim CHECK strings via `format(%L)` lesson

Per Batch 2 lesson 1, CHECK enum values were extracted via `pg_get_constraintdef()` (Phase A.3.2) rather than hand-typed. The verbatim definitions are pasted directly into the migration file — no apostrophe-escaping ambiguity, no enum-narrowing risk.

### 4.5 CHECK-width discipline (Batch 2 lesson 2)

`source` CHECK includes `'imported'` (3 values). Audit §1 noted code references only `'uploaded'` and `'generated'`; `'imported'` is unused at the application layer. Per Batch 2 lesson — *"CHECK can outlive seed rows"* — migration encodes all 3 values verbatim. Pruning the unused enum value is a separate decision.

---

## 5. Stop-condition verdict

| Condition | Verdict |
|---|---|
| §4.6 column missing from prod | N/A — all 3 columns from #5 present |
| Additional column in prod referenced in code, absent from audit | None — §1 inventory matches prod 1:1 (17 net-new) |
| FK references uncommitted table | YES (`catch_up_session_id` → off-repo `catch_up_sessions`); already documented in §1 as dead FK; **handled by deferring FK reproduction** |
| RLS policy depends on uncommitted function | No (uses `auth.uid()`) |
| 5th drifted document-system table | No — `document_templates` is dead (0 reads), retained as DOC-ONLY |
| Row count > 10K | No — 42 rows |

**No hard stops. Proceed to Phase B authoring.**

---

## 6. Post-Batch-3 §4.6 projection

Once Batch 3 ships:

- **Closed (9/13):** `{#1, #2, #3, #4, #5, #8, #9, #11, #12}`
- **Open (4/13):** `{#6, #7, #10, #13}`

Natural Batch 4 / 5 decomposition (Dom 2026-05-10):

- **Batch 4 — compliance_* cluster:**
  - #6 `compliance_rules` shape disagreement (schema.sql vs migration 20260330 vs prod)
  - #7 `compliance_items.status` CHECK enum reconciliation
  - #10 `compliance_items.company_id` missing index
- **Batch 5 — residuals:**
  - #13 NEQ partial unique index (`idx_companies_neq_unique`)
  - Any residual drift uncovered during Batches 3-4

---

## 7. References

- `docs/schema-drift-audit-2026-05-07.md` §1 (documents column drift table) + §4.6 (numbered blocker list)
- `docs/audit-batch2-foundation-backfill-2026-05-08.md` (Phase A template; Batch 2 idempotency pattern source)
- `supabase/migrations/20260508210035_create_activity_log.sql:87–117` (canonical `DO $$ EXCEPTION WHEN duplicate_object` policy block, repurposed for CHECK)
- `supabase/schema.sql:145–190` (committed `documents` baseline)
- `supabase/migrations/20260329000000_documents_vault.sql` (committed `document_type` CHECK replacement + `framework` default)
- `supabase/migrations/20260506000000_documents_is_finalized.sql` (committed `is_finalized` ADD)

---

End of Batch 3 investigation.
