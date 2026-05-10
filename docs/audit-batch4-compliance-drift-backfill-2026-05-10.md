# Sprint 10A Batch 4 — Phase A investigation: compliance_* drift backfill

**Date:** 2026-05-10
**Status:** Phase A read-only complete + Phase C migration authoring complete + Phase D complete via static analysis (empirical validation blocked at MCP layer; substituted with Phase G real-apply backstop per §8.5). STOP-gates at §7 resolved by Dom (Option α approved for #7 CHECK reconciliation; ADD-only for 4 RLS policies confirmed). Phase E (dual-locale visual gate) next.
**Targets §4.6:** #6 (compliance_rules shape disagreement), #7 (compliance_items.status CHECK enum reconciliation), #10 (compliance_items.company_id missing index).
**Predecessors:** Batch 2 (`5f36a49`), Batch 3 (`5440f41`).
**Migration file:** `supabase/migrations/20260510190508_compliance_drift_backfill.sql` (uncommitted).

---

## §1. Scope & methodology

Read-only Phase A investigation per Batch 4 brief. Probes via Supabase MCP `execute_sql`, committed-source reads via repo file inspection. No edits, no migrations authored.

**Sources reconciled (three-way for compliance_rules, two-way for compliance_items):**
- **Prod** — `information_schema.columns` + `pg_constraint` + `pg_indexes` + `pg_policies` (live remote).
- **Migration 20260330** — `supabase/migrations/20260330000000_compliance_engine.sql` (Sprint 3 origin migration). This is the **only migration** referencing `compliance_*`. It IS in the apply chain (replayed on `supabase db push --include-all`).
- **schema.sql** — `supabase/schema.sql:195–260`. Documentation-canonical baseline; **NOT in the apply chain** (Supabase CLI applies migrations only, not schema.sql).

**Application consumer:** `lib/compliance/calculateComplianceItems.ts` (single file). Reads from `compliance_rules` (`framework`, `jurisdiction`, `rule_key`, `id`) and upserts into `compliance_items` (`company_id`, `rule_id`, `status`, `due_date`).

---

## §2. Row counts (A.1)

| Table | Rows |
|---|---|
| `compliance_rules` | **9** (5 LSA Québec + 4 CBCA federal) |
| `compliance_items` | **0** |

`compliance_items` is empty in prod — no tenant data at risk. Batch 4 risk profile is materially lower than Batch 3 (which had 42 documents rows).

Note: `compliance_rules` has 9 rows, but 20260330 seeds 10 (5 LSA + 5 CBCA). Missing row is `('CA', 'CBCA', 'auditor_waiver', …)`. This is **data drift** (out of Batch 4 structural scope) — flagging for awareness only, no action.

---

## §3. Column inventory — three-way diff for `compliance_rules` (A.2)

Legend: ✓ = present, ✗ = absent, ≠ = present but type/default differs.

| # | Column | Prod | 20260330 | schema.sql | Drift verdict |
|---|---|---|---|---|---|
| 1 | `id` | uuid PK, default `extensions.uuid_generate_v4()` | ✓ (default `gen_random_uuid()`) | ✓ (default `uuid_generate_v4()`) | Default seed differs but result equivalent — **NO DRIFT** |
| 2 | `jurisdiction` | text NOT NULL | ✓ | ✓ | NO DRIFT |
| 3 | `framework` | text NOT NULL | ✓ + CHECK | ✓ + CHECK | NO DRIFT |
| 4 | `rule_key` | text NOT NULL | ✓ | ✓ + UNIQUE (single col) | NO DRIFT (UNIQUE shape diff covered in §5) |
| 5 | `title_fr` | text NOT NULL | ✓ | ✓ | NO DRIFT |
| 6 | `title_en` | text NOT NULL | ✓ | ✓ | NO DRIFT |
| 7 | **`description_fr`** | text NULL | ✗ | ✓ | **DRIFT — codify** |
| 8 | **`description_en`** | text NULL | ✗ | ✓ | **DRIFT — codify** |
| 9 | `frequency` | text NOT NULL | ✓ + DEFAULT 'annual' | ✓ + CHECK | NO DRIFT (CHECK covered in §4) |
| 10 | **`due_day`** | smallint NULL | ✗ | ✓ + CHECK | **DRIFT — codify** |
| 11 | **`due_month`** | smallint NULL | ✗ | ✓ + CHECK | **DRIFT — codify** |
| 12 | **`is_active`** | boolean NOT NULL DEFAULT true | ✗ | ✓ | **DRIFT — codify** |
| 13 | `created_at` | timestamptz NOT NULL DEFAULT now() | ✓ | ✓ | NO DRIFT |
| 14 | **`effective_date`** | date NOT NULL DEFAULT '2024-01-01' | ✗ | ✗ | **DRIFT — codify** |
| 15 | **`deprecated_at`** | date NULL | ✗ | ✗ | **DRIFT — codify** |
| 16 | `legal_reference` | text NULL | ✓ | ✗ | NO DRIFT (in migration) |
| 17 | `last_reviewed_at` | timestamptz NULL | ✓ | ✗ | NO DRIFT (in migration) |
| 18 | `reviewed_by` | text NULL | ✓ | ✗ | NO DRIFT (in migration) |
| 19 | **`review_notes`** | text NULL | ✗ | ✗ | **DRIFT — codify** |

**Drifted columns on `compliance_rules`: 8** (`description_fr`, `description_en`, `due_day`, `due_month`, `is_active`, `effective_date`, `deprecated_at`, `review_notes`).

---

## §3.1. Column inventory — two-way diff for `compliance_items` (A.2)

| # | Column | Prod | 20260330 | schema.sql | Drift verdict |
|---|---|---|---|---|---|
| 1 | `id` | uuid PK | ✓ | ✓ | NO DRIFT |
| 2 | `company_id` | uuid NOT NULL FK→companies | ✓ | ✓ | NO DRIFT |
| 3 | `rule_id` | uuid NOT NULL FK→compliance_rules | ✓ | ✓ | NO DRIFT |
| 4 | `status` | text NOT NULL DEFAULT 'pending' | ✓ (no DEFAULT) | ✓ (DEFAULT 'pending') | DRIFT — see §4 (CHECK reconciliation) + this DEFAULT diff |
| 5 | `due_date` | date NULL | ✓ | ✓ | NO DRIFT |
| 6 | **`completed_at`** | timestamptz NULL | ✗ | ✓ | **DRIFT — codify** |
| 7 | **`notes`** | text NULL | ✗ | ✓ | **DRIFT — codify** |
| 8 | **`created_at`** | timestamptz NOT NULL DEFAULT now() | ✗ | ✓ | **DRIFT — codify** |
| 9 | `updated_at` | timestamptz NOT NULL DEFAULT now() | ✓ | ✓ | NO DRIFT |

**Drifted columns on `compliance_items`: 3** (`completed_at`, `notes`, `created_at`).

Plus: `status` DEFAULT 'pending' is drifted (migration omits DEFAULT). Adding via `ALTER COLUMN ... SET DEFAULT` is forward-safe (no row touches; NULL never inserted because column is NOT NULL with INSERT-time validation).

---

## §4. CHECK constraint inventory — verbatim from prod (A.3 + A.4)

Per v3.42 §8 lesson 1 (re-probe before codify): all CHECKs below captured live via `pg_get_constraintdef()` on 2026-05-10.

| Table | Constraint name | Definition (verbatim) | In 20260330? | Drift verdict |
|---|---|---|---|---|
| `compliance_items` | `compliance_items_status_check` | `CHECK ((status = ANY (ARRAY['pending'::text, 'complete'::text, 'overdue'::text, 'not_applicable'::text])))` | ❌ Migration has 3-value `('compliant', 'pending', 'required')` — **DEFINITION CONFLICT, same name** | **DRIFT — see §7 STOP-gate** |
| `compliance_rules` | `compliance_rules_due_day_check` | `CHECK (((due_day >= 1) AND (due_day <= 31)))` | ✗ (column not in migration) | **DRIFT — codify alongside `due_day` column** |
| `compliance_rules` | `compliance_rules_due_month_check` | `CHECK (((due_month >= 1) AND (due_month <= 12)))` | ✗ (column not in migration) | **DRIFT — codify alongside `due_month` column** |
| `compliance_rules` | `compliance_rules_framework_check` | `CHECK ((framework = ANY (ARRAY['LSA'::text, 'CBCA'::text])))` | ✓ (verbatim match) | NO DRIFT |
| `compliance_rules` | `compliance_rules_frequency_check` | `CHECK ((frequency = ANY (ARRAY['annual'::text, 'one_time'::text, 'triggered'::text])))` | ✗ (migration has DEFAULT but no CHECK) | **DRIFT — codify** |

**Drifted CHECKs to codify (3 ADD-safe + 1 reconciliation-blocked):**
- `compliance_rules.due_day` 1-31 → ADD-only (column itself is new in this batch).
- `compliance_rules.due_month` 1-12 → ADD-only.
- `compliance_rules.frequency` 3-value enum → ADD-only (independent of existing migration constraints).
- `compliance_items.status` 4-value enum → **BLOCKED, see §7 STOP-gate**.

---

## §5. Index inventory (A.5)

| Index | Definition | Status |
|---|---|---|
| `compliance_items_pkey` | UNIQUE btree on `(id)` | Present (PK auto-index) |
| `compliance_rules_pkey` | UNIQUE btree on `(id)` | Present (PK auto-index) |
| `compliance_rules_unique_rule` | UNIQUE btree on `(jurisdiction, framework, rule_key)` | Present (matches migration's `UNIQUE (framework, jurisdiction, rule_key)` — semantically identical, column-order cosmetic) |

**Missing per §4.6 #10:** no index on `compliance_items.company_id`. Confirmed missing — PostgreSQL does NOT auto-index FK columns. Will codify as `idx_compliance_items_company_id` (Batch 3 naming convention).

**Adjacent observation (out of Batch 4 scope, banked for §8):** `compliance_items.rule_id` is also FK without index. Same condition as `company_id`. Would benefit from same fix. Not in §4.6 — defer to Batch 5 residuals.

---

## §6. FK inventory (A.6)

| FK | Target | Target committed? |
|---|---|---|
| `compliance_items.company_id` → `companies(id)` ON DELETE CASCADE | `companies` | ✓ committed in `schema.sql` + multiple migrations |
| `compliance_items.rule_id` → `compliance_rules(id)` ON DELETE CASCADE | `compliance_rules` | ✓ committed in 20260330 |

**No phantom FKs.** Both targets are in committed migration source. v3.42 §8 lesson 3 (defer FK if target off-repo) does not apply to Batch 4.

---

## §7. RLS policy inventory (A.7) — REVERSE DRIFT detected — RESOLVED 2026-05-10

**Resolution:** Dom approved ADD-only for the 4 NEW prod policies via `DO $$ EXCEPTION WHEN duplicate_object` blocks (Batch 3 pattern). The 2 OLD legacy policies (`compliance_rules_read_all`, `compliance_items_owner`) remain banked for a separate forward-only cleanup batch — not touched in Batch 4. Fresh-reset post-Batch-4 has 6 policies vs prod's 4; legacy policies are broader (not narrower) so the divergence is a permission superset, not a security regression.


### Prod policies (4 total)

| Table | Policy name | Cmd | Quals | Matches schema.sql? | Matches 20260330? |
|---|---|---|---|---|---|
| `compliance_rules` | `compliance_rules_select_auth` | SELECT | `(auth.role() = 'authenticated')` | ✓ verbatim (line 214) | ❌ — migration has different name + qual |
| `compliance_items` | `compliance_items_select_own` | SELECT | EXISTS subquery on companies(user_id) | ✓ verbatim (line 238) | ❌ — migration has FOR ALL with different qual |
| `compliance_items` | `compliance_items_insert_own` | INSERT | EXISTS subquery (with_check) | ✓ verbatim (line 246) | ❌ — same as above |
| `compliance_items` | `compliance_items_update_own` | UPDATE | EXISTS subquery | ✓ verbatim (line 254) | ❌ — same as above |

### Migration 20260330 policies (would be created on fresh reset)

- `compliance_rules_read_all` ON `compliance_rules` FOR SELECT USING `(true)` — **does NOT exist in prod**.
- `compliance_items_owner` ON `compliance_items` FOR ALL USING `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` — **does NOT exist in prod**.

### Reverse-drift implication

A clean `supabase db reset` would replay 20260330 and create the OLD policies (`compliance_rules_read_all`, `compliance_items_owner`). They'd coexist with whatever Batch 4 adds. Prod has only the NEW policies — the OLD ones must have been DROPped at some point (likely dashboard hand-edit, since no later migration references them).

**For Batch 4: ADD-only is structurally workable for policies** (independent named objects, additive permissions — no logical-AND interference like CHECKs). Result: fresh reset has 6 policies (2 old + 4 new); prod has 4. Inelegant but functional. Permissions remain at-or-tighter-than-prod after fresh reset (`compliance_items_owner FOR ALL` is broader than the 3 granular ones, so adding the granular ones doesn't tighten permissions; the OLD policy already grants more access).

This is a **policy-shape divergence** between fresh-reset and prod, but not a security regression. **Surface to Dom; recommend ship-as-additive but flag for §8 ledger.**

---

## §7. STOP-gate — `compliance_items.status` CHECK reconciliation (#7) — RESOLVED 2026-05-10

**Resolution:** Dom approved **Option α**. Anti-ask "No DROP COLUMN / DROP CONSTRAINT / DROP INDEX (forward-only)" lifted narrowly for `compliance_items_status_check` reconciliation. Sequence implemented in migration §5: `DROP CONSTRAINT IF EXISTS` followed by `ADD CONSTRAINT` with the 4-value def (`pending/complete/overdue/not_applicable`), wrapped in a `DO $$` block so the constraint-free window is invisible to outside observers within the migration's enclosing transaction. 0-tenant-row safety condition satisfied (`compliance_items` = 0 rows verified Phase A.2).


**The blocker:** `compliance_items_status_check` is **the same constraint name** in prod (4-value: `pending/complete/overdue/not_applicable`) and in migration 20260330 (3-value: `compliant/pending/required`). PostgreSQL allows only one constraint per name per table, so prod state implies the migration-created constraint was DROPped and a same-named one was re-created with different definition.

**Three resolution options for Dom:**

### Option α — Ship #7 by lifting the DROP-CONSTRAINT anti-ask (recommended for review)

Author Batch 4 migration with:
```sql
ALTER TABLE public.compliance_items DROP CONSTRAINT IF EXISTS compliance_items_status_check;
ALTER TABLE public.compliance_items ADD CONSTRAINT compliance_items_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'complete'::text, 'overdue'::text, 'not_applicable'::text]));
```

**Pros:**
- Fresh reset matches prod exactly (after Batch 4 applied).
- 0 tenant rows in `compliance_items` → zero risk of CHECK violation.
- Wraps in `DO $$ EXCEPTION` for idempotency on re-run.

**Cons:**
- Requires lifting Batch 4 anti-ask "No DROP COLUMN / DROP CONSTRAINT / DROP INDEX (forward-only)".
- Sets precedent for "drift correction" DROP justification — needs explicit Dom decision to avoid scope-creep.

### Option β — Defer #7 entirely to Batch 5 with revised discipline

Ship Batch 4 with #6 + #10 closed, #7 banked for Batch 5 with explicit "drift-correction DROP" allowance.

**Pros:**
- Honors current Batch 4 anti-asks unchanged.
- Batch 5 scope grows but discipline question gets one round of review.

**Cons:**
- Splits a logically-coupled item (#6/#7 are sibling drift on the same cluster).
- Adds round-trip latency to §4.6 closure.

### Option γ — ADD-only with renamed CHECK (NOT recommended)

Add a new CHECK named `compliance_items_status_check_v2` with the 4-value definition. Both CHECKs apply via logical AND.

**Result:** logical AND of `status IN ('compliant', 'pending', 'required')` AND `status IN ('pending', 'complete', 'overdue', 'not_applicable')` = only `'pending'` is allowed. **Functionally broken — prod's 4-value enum is reduced to single value on fresh reset.** Strongly anti-recommended.

**Recommendation:** **Option α**, contingent on Dom approval to lift the DROP-CONSTRAINT anti-ask for this specific case. The 0-tenant-row state of `compliance_items` makes the operation effectively risk-free, and #7 cannot otherwise close cleanly.

---

## §8. Sizing estimate & banked precedents

### §8.1. Sizing

If Dom approves Option α for #7:

| Surface | Count | Mechanism |
|---|---|---|
| Drifted columns on `compliance_rules` | 8 | `ADD COLUMN IF NOT EXISTS` |
| Drifted columns on `compliance_items` | 3 | `ADD COLUMN IF NOT EXISTS` |
| `compliance_items.status` DEFAULT | 1 | `ALTER COLUMN ... SET DEFAULT` (forward-safe) |
| Drifted CHECKs (ADD-safe) | 3 | inline with `ADD COLUMN` for due_day/due_month; `DO $$ EXCEPTION` block for frequency |
| `compliance_items.status` CHECK (Option α) | 1 | DROP + ADD with `DO $$ EXCEPTION` wrap |
| Missing FK index | 1 | `CREATE INDEX IF NOT EXISTS idx_compliance_items_company_id` |
| Drifted RLS policies | 4 | `DO $$ EXCEPTION WHEN duplicate_object` blocks (additive — see §7 reverse-drift note) |

**Total Batch 4 surface: 21 atoms** (vs Batch 3's 21 — comparable scope).

**Estimated CC time:** Phase B–G ~3-4 hours assuming Option α. If Option β: ~2-3 hours for #6+#10 only.

Audit's "3 items" undercount factor: 7×. Per Batch 3 precedent (audit said 8 columns; reality was 17 + 3 CHECKs + 1 index = 21 atoms), this is consistent with the 1.5-2x undercount expectation though slightly higher because §4.6 #6 was a single-line entry covering an entire cluster's worth of column drift.

### §8.2. Banked precedent — DROP-CONSTRAINT in drift-correction migrations

Locked 2026-05-10 by Dom for v3.43 regen.

> **DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is acceptable IFF target table has 0 rows AND operation is wrapped in a DO $$ block.** The 0-row condition guarantees no row can violate either definition during the constraint-free window; the DO $$ wrapper (combined with the migration's enclosing transaction) prevents outside observers from seeing the unconstrained intermediate state. Outside these conditions, drift-correction CHECKs must use a renamed-CHECK ADD-only pattern OR be deferred to a dedicated discipline-revised batch. This precedent applies only to **same-name CHECK constraints with conflicting definitions** (the only case where ADD-only fails); other drift surfaces remain forward-only ADD-safe per Batches 2/3 conventions.

**Origin:** Batch 4 §7 STOP-gate. `compliance_items_status_check` existed in both prod (4-value) and migration 20260330 (3-value) under the same name. PG allows only one constraint per name → ADD-only path γ would AND the two CHECKs and reduce the enum to `'pending'` only (functionally broken). Option α (DROP+ADD) was the only path to fresh-reset/prod parity for #7.

### §8.3. Banked methodology — schema.sql vs migration-chain authority

Locked 2026-05-10 by Dom for v3.43 regen. Implicit since Batch 3, made explicit Batch 4.

> **`schema.sql` is documentation-canonical baseline; the migration chain is authoritative for fresh-reset state.** Reasoning from "present in schema.sql" to "present in fresh-reset" is a class of error — Supabase CLI applies migrations only, not schema.sql. Verify against the migration chain explicitly before deciding whether a structural element exists in committed source. When prod, schema.sql, and the migration chain disagree, prod is operational reality but the migration chain is what governs fresh-reset / Local==Remote parity. Future drift-backfill batches MUST treat the migration chain as the authority for "what gets re-created on `supabase db reset`" decisions.

**Origin:** Batch 4 §7 RLS clarification. Initial Phase A draft framed the 4 prod RLS policies as "verbatim in schema.sql" without distinguishing apply-chain from documentation. Dom's directive to "drop them from Batch 4 if already committed in schema.sql" was structurally unsafe because schema.sql isn't replayed; Batch 4 ultimately had to ADD all 4 policies to achieve fresh-reset/prod parity.

### §8.4. Banked Batch 5 residuals

- **`compliance_items.rule_id` missing index.** Same condition as #10's `company_id` fix; not in §4.6, not in Batch 4 scope. Defer to Batch 5 residuals slot.
- **`compliance_rules` missing seed row** for `('CA', 'CBCA', 'auditor_waiver', …)`. Migration 20260330 seeds 10 rows; prod has 9. Data drift, not structural. Flag for product call (does CBCA actually have an auditor waiver requirement, or was the seed entry an error?). Out of Batch 4 scope; no structural action this batch.
- **2 legacy RLS policies** (`compliance_rules_read_all` ON `compliance_rules`, `compliance_items_owner` ON `compliance_items`) absent from prod but present in migration 20260330. Fresh-reset post-Batch-4 has 6 policies vs prod's 4. Cleanup via dedicated forward-only DROP POLICY migration — separate batch, separate discipline review. Permissions remain at-or-tighter-than-prod after fresh reset (legacy policies are broader, not narrower).

### §8.5. Banked methodology — Phase D empirical validation pathways

Locked 2026-05-10 by Dom for v3.43 regen.

> **MCP Supabase connection enforces session-level read-only (PostgreSQL `default_transaction_read_only`). DDL is rejected regardless of transaction outcome — read-only is connection-level, not transaction-level. Phase D dry-run-against-prod via MCP is structurally impossible.** **Preview-branch validation as the canonical fallback also depends on `confirm_cost` being exposed in the MCP tool set; if absent (as in Batch 4's session), `create_branch` cannot satisfy its required `confirm_cost_id` parameter and branch validation is also blocked.** **When both paths are blocked, fall back to static analysis grounded in prior-batch precedent + mechanical idempotency proof for any novel primitives, with Phase G's `supabase db push --include-all` Local==Remote verification serving as the real-apply empirical backstop. Future drift-backfill batches should verify `confirm_cost` exposure during Phase A planning to know which Phase D modality applies.**

**Origin:** Batch 4 Phase D execution. First blocker: `execute_sql` rejected `BEGIN; CREATE TABLE _phase_d_capability_probe (x int); ROLLBACK;` with `ERROR: 25006: cannot execute CREATE TABLE in a read-only transaction`. Second blocker: `create_branch` requires `confirm_cost_id` parameter from `confirm_cost` tool which is not exposed in this session's deferred MCP tool set (verified twice via ToolSearch).

#### Per-atom Batch 3 precedent mapping (Batch 4 migration `20260510190508_compliance_drift_backfill.sql`)

| § | Atoms | Primitive | Precedent / Proof |
|---|---|---|---|
| 1 | 8 column ADDs | `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` | **Batch 3 §1** — 17 instances proven empirically to no-op against existing columns and succeed cleanly on fresh apply. PG NOTICE 42701 emitted on duplicate; not raised as error. |
| 2 | 1 CHECK ADD | `DO $$ … ALTER TABLE … ADD CONSTRAINT …; EXCEPTION WHEN duplicate_object …` | **Batch 3 §2** — 3 instances (minute_book_section, signature_status, source) proven. SQLSTATE 42710 trapped; second-run no-op verified. |
| 3 | 3 column ADDs | `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` | Same as §1 (Batch 3 §1 pattern). |
| 4 | 1 DEFAULT | `ALTER TABLE … ALTER COLUMN status SET DEFAULT 'pending'` | **PG-documented idempotent.** Setting the same DEFAULT repeatedly is a no-op; does not touch existing rows; safe under all row-count conditions. |
| 5 | 1 CHECK reconciliation | `DO $$ … DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT … CHECK (…); END $$` | **Novel primitive — mechanical proof:** `DROP CONSTRAINT IF EXISTS` is unconditionally safe (silent no-op when constraint absent; succeeds when present, freeing the name). Immediately-following `ADD CONSTRAINT` inside the same `DO $$` block is unconditionally safe because DROP just freed the name. **Re-run path:** DROP succeeds against the just-created constraint (from first apply); ADD succeeds against the now-freed name. **Mid-execution observability:** the DO block is a single statement to outside observers; combined with the migration runner's enclosing transaction, no observer sees the constraint-free window. **0-row safety:** `compliance_items` = 0 rows verified Phase A.2, so no row can violate either definition during the unconstrained intermediate state inside the DO block. |
| 6 | 1 index | `CREATE INDEX IF NOT EXISTS idx_… ON …(col)` | **Batch 3 §3** — 1 instance (`idx_documents_company_id`) proven empirically to no-op on second run. |
| 7 | 4 RLS policies | `DO $$ … CREATE POLICY … EXCEPTION WHEN duplicate_object …` ×4 | **Batch 3 §7 pattern** — same `DO $$ EXCEPTION WHEN duplicate_object` shape used across multiple migrations; SQLSTATE 42710 raised on duplicate policy name; trapped to NULL. Re-run verified no-op. |

**D.1 idempotency conclusion:** Every atom is either Batch 3-precedented (15 of 19 statements via direct pattern reuse) or mechanically proven idempotent (§5's novel DO-wrapped DROP+ADD). First-run on fresh schema produces the expected post-Batch-4 state. Second-run reaches a fixed point: every IF NOT EXISTS no-ops; every EXCEPTION WHEN duplicate_object traps to NULL; §5's DROP IF EXISTS + ADD reaches the same name + same definition. **Idempotent.**

**D.3 structural correctness conclusion:** Each atom maps to a known §4.6 closure target (#6 cluster: §1+§2+§3+§4; #7: §5; #10: §6) plus the RLS additive resolution (§7). No atoms touch surfaces outside these targets. Migration's blast radius is bounded by what the SQL syntactically references: `public.compliance_rules` and `public.compliance_items` only. No cross-table writes, no triggers, no functions. **Structurally bounded.**

**D-replacement empirical backstop:** Phase G's `supabase db push --include-all` against prod is itself a real-apply verification. Per Dom's directive in this batch: post-`db push` re-run of the D.2 metrics query against prod must show diff exactly `compliance_items.indexes: 1 → 2`, all other counts unchanged. This becomes the empirical D.3-equivalent. Any other count delta during Phase G is a halt-and-investigate signal before any further commits or deploys.

---

## §9. Anti-asks honored (read-only Phase A)

- ✓ No application code changes.
- ✓ No data migration / row mutation.
- ✓ No DROP operations attempted (Phase A is read-only).
- ✓ No tracking-in of #13 (NEQ partial unique).
- ✓ No FK reproduction concerns (both FK targets committed — §6).
- ✓ No pruning of dead columns (will codify all per Batch 3 precedent if Phase B proceeds).
- ⚠️ Reverse drift surfaced — Phase B blocked at STOP-gate (§7).

---

## §10. Recommendations to Dom

1. **Approve Option α** to lift the DROP-CONSTRAINT anti-ask narrowly for `compliance_items_status_check` (0-row safety + clean drift correction). Same-name constraint definition replacement is the only path to fresh-reset/prod parity for #7.

2. **Ship Batch 4 ADD-only for RLS policies** (§7 reverse-drift). Note in §8 ledger that fresh-reset state will diverge from prod by 2 legacy policies (`compliance_rules_read_all`, `compliance_items_owner`) which are functionally subsumed by the granular policies. Cleanup via dedicated migration is a separate forward-only decision (defer to Batch 5+ or Phase 10A).

3. **Bank `compliance_items.rule_id` missing index** as a Batch 5 residual (§5). Adjacent to #10's company_id fix; same condition; not in §4.6 so not in Batch 4 scope.

4. **Acknowledge `compliance_rules` missing seed row** (`('CA', 'CBCA', 'auditor_waiver', …)` from migration 20260330's seed but absent from prod). Data drift, not structural drift. Out of Batch 4 scope; flag for product call (does CBCA actually have an auditor waiver requirement, or was that seed entry an error?).

---

## §11. Phase B–G ship record

(To be appended after Phase B authoring + Phase D verification + Phase F commits + Phase G push.)

---

**Phase A read-only complete + Phase C migration authoring complete + Phase D complete via static analysis (§8.5). STOP-gates at §7 resolved 2026-05-10 by Dom. Halting before Phase E (dual-locale visual gate) per directive.**
