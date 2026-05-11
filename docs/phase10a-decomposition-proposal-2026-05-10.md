# Phase 10A — Decomposition Proposal

**Date:** 2026-05-10
**Status:** Uncommitted draft for Max + Dom review — Phase B deliverable per Sprint 10 planning brief
**Author:** Claude Code session
**Predecessor:** `docs/audit-phase10a-temporal-registry-schema-2026-05-10.md` (Phase A, written same day)
**Locks source:** Max's Phase B trigger brief (this session, 2026-05-10) — LOCK-1 through LOCK-10
**Scope:** Propose a sub-batch decomposition of Phase 10A that lets each sub-batch ship as a discrete unit honoring all active working agreements. Apply the locks; do not relitigate them.

---

## §1 — Lock Reconciliation

For each LOCK-N: lock decision verbatim, Phase A audit reference, notes if Phase A drifted from the lock. §8.6 transparency mechanism.

### LOCK-1 — `share_transfers` schema

**Lock:** Q2-locked CREATE TABLE statement per Max's brief (columns: `id`, `company_id`, `from_shareholding_id NULL ON DELETE RESTRICT`, `to_shareholding_id NULL ON DELETE RESTRICT`, `transfer_date`, `quantity_transferred`, `consideration`, `notes`, `resolution_document_id NULL`, `created_at`).

**Phase A reference:** §1.2, §5.2.

**Drift noted:** Phase A §1.2 sample schema drifted on **5 points**, all explicitly dropped by Phase B:
1. Audit proposed `transfer_type` column — **not in lock.** Classification lives on `shareholdings.end_reason` (source row) and `shareholdings.source` (destination row).
2. Audit proposed `source` column on `share_transfers` — **not in lock.** `source` lives on `shareholdings`, not on `share_transfers`.
3. Audit framed `from_shareholding_id` as `NOT NULL` — **lock says NULL** (semantically NULL = initial issuance).
4. Audit framed `to_shareholding_id` as `NOT NULL` — **lock says NULL** (symmetric with from-side).
5. Audit omitted `consideration` and `notes` columns and used `quantity` instead of `quantity_transferred` — **lock includes both text columns and uses `quantity_transferred`**.

Phase B applies LOCK-1 verbatim.

### LOCK-2 — `shareholdings` additions

**Lock:** 5 ADD COLUMN ops per Max's brief: `end_date DATE NULL`, `end_reason TEXT NULL CHECK IN ('transfer','redemption','cancellation','conversion')`, `source TEXT NOT NULL DEFAULT 'direct_issuance' CHECK IN ('direct_issuance')`, `certificate_old TEXT NULL`, `certificate_new TEXT NULL`.

**Phase A reference:** §1.1, §5.1, §6 (Q-A2).

**Drift noted:** Phase A §5.1 drifted on **3 points**, all explicitly dropped:
1. Audit proposed `end_reason` enum `'transferred','repurchased','cancelled','estate'` — **lock uses spec §1.3 verbatim:** `'transfer','redemption','cancellation','conversion'`.
2. Audit used `source DEFAULT 'initial_issuance'` — **lock uses `'direct_issuance'`** per spec §1.3 line 82.
3. Audit Q-A2 proposed three certificate-naming options including dropping `certificate_new`. **Lock applies Q2c verbatim:** ADD both `certificate_old` AND `certificate_new` on the destination shareholding alongside the existing `certificate_number`. Redundancy between `certificate_number` and `certificate_new` is acknowledged as a future revisit, not a Phase 10A scope cut.

Phase A §1.1 hedged on `resolution_document_id` on shareholdings — **lock confirms it lives on `share_transfers` only.** No such column on shareholdings.

v1.1 reserved `source` values (`'option_exercise'`, `'rsu_vest'`, `'warrant_exercise'`) documented in migration comment only, NOT in v1.0 CHECK.

### LOCK-3 — `officer_appointments` addition

**Lock:** `ADD COLUMN end_reason TEXT NULL CHECK IN ('resignation','revocation','term_expired','death','disqualification')` — mirroring `director_mandates.end_reason`.

**Phase A reference:** §1.3, §5.3, §6 (Q-A4).

**Drift noted:** Phase A §6 Q-A4 flagged the enum as TBD; **it is not — the 2026-04-23 audit §6.1 S10-TR-4 explicitly locked it as "same 5-option dropdown as directors".** Phase B applies the audit lock.

### LOCK-4 — `companies` additions

**Lock:** 4 ADD COLUMN ops per Max's brief: `onboarding_branch TEXT NULL CHECK ('rush','complete')`, `onboarding_step TEXT NULL` (no CHECK; app-enforced), `onboarding_completed_at TIMESTAMPTZ NULL`, `history_phases_status JSONB NULL`.

**Phase A reference:** §1.4, §5.4, §6 (Q-A5, Q-A6).

**Drift noted:** Phase A §6 Q-A5 listed text-vs-int as open — **lock is TEXT.** Phase A §6 Q-A6 asked about JSONB shape — **lock specifies the canonical shape** `{directors,officers,shareholdings: 'complete'|'deferred'|'incomplete'}` documented in migration comment, no JSON Schema constraint for v1.0.

### LOCK-5 — `company_people` addition

**Lock:** `ADD COLUMN citizenship TEXT NULL`. `is_canadian_resident` stays unchanged.

**Phase A reference:** §1.5, §5.5, §6 (Q-A3).

**Drift noted:** None — Phase A §1.5 recommendation matched the lock (keep both, add citizenship as separate column). Phase B applies it directly.

### LOCK-6 — FK semantics on `shareholdings`

**Lock:** Switch both `shareholdings.share_class_id` FK and `shareholdings.person_id` FK from `ON DELETE CASCADE` to `ON DELETE RESTRICT` via constraint DROP + ADD.

**Phase A reference:** §6 (Q-A1).

**Drift noted:** None — Phase A §6 Q-A1 flagged this as Phase B decision; **lock = both switch to RESTRICT.** Phase B applies it.

Note: the literal constraint names in Max's brief (`shareholdings_share_class_id_fkey`, `shareholdings_person_id_fkey`) must be verified against `20260405000000_sprint6_people_ownership.sql` at authoring time. Phase A confirmed both FKs exist with `ON DELETE CASCADE` semantics (sprint 6 migration lines 110–111).

### LOCK-7 — Pipeline-preservation atomic coupling

**Lock:** `shareholdings.end_date` column add (part of LOCK-2) MUST ship in the same atomic sub-batch as:
1. `lib/pdf/generatePdfDocument.ts:184` SELECT update — add `WHERE end_date IS NULL` filter to the shareholdings query.
2. Confirmation that all 6 R-G1 generators (`lsaq_souscription_actions`, `lsaq_annual_shareholder_resolution`, `lsaq_auditor_waiver`, `cbca_share_subscription`, `cbca_annual_shareholder_resolution`, `cbca_auditor_waiver`) are covered by that one query path OR receive parallel updates.

**Phase A reference:** §3.3, §4, §6 (Q-A7, R-G1).

**Drift noted:** None — Phase A §3.3 surfaced the coupling concern; lock formalizes it as a hard atomic-coupling requirement with visual gate.

Visual gate: **mandatory** — dual-fixture (Acme + droussy), FR + EN, Completeness tab + Binder tab. Per Q4 amendment in decomp §3.2.1.

### LOCK-8 — `share_transfers` indexes

**Lock:** 4 indexes — `idx_share_transfers_company_id`, `idx_share_transfers_from_shareholding_id`, `idx_share_transfers_to_shareholding_id`, `idx_share_transfers_transfer_date`.

**Phase A reference:** §5.6.

**Drift noted:** None — Phase A §5.6 listed the same 4 indexes by name.

### LOCK-9 — `share_transfers` RLS

**Lock:** Owner-scope policy mirroring `shareholdings` RLS — `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` shape, applied as `FOR ALL`.

**Phase A reference:** §5.6.

**Drift noted:** None — Phase A §5.6 surfaced this; lock confirms canonical-pattern reuse.

Reference policy: `"Users can manage their own company shareholdings"` defined in `20260405000000_sprint6_people_ownership.sql` lines 121–123.

### LOCK-10 — Forward-only & migration discipline

**Lock:**
- No column DROPs in any Phase 10A sub-batch
- No column RENAMEs
- All new columns nullable OR with safe DEFAULTs so existing inserts continue working unchanged
- Exception: LOCK-6 constraint changes (DROP + ADD) — explicitly allowed
- All `ADD COLUMN` statements use `IF NOT EXISTS` per §8.2 banked discipline
- Migration chain anchor for all Phase 10A sub-batches: `20260405000000_sprint6_people_ownership.sql`

**Phase A reference:** §2, §5.6, §3.5.

**Drift noted:** None — Phase A §5.6 articulated identical constraints. Phase B applies them as the canonical discipline for all sub-batches.

---

## §2 — Natural sub-batch decomposition

Grouping locks by risk + independence + visual gate axes yields **4 sub-batches**, not a forced N. The natural separation lines are: (a) low-risk additive column adds with no pipeline coupling cluster together; (b) constraint DROP+ADD is a distinct operational class; (c) greenfield CREATE TABLE is independent and zero-coupled; (d) the high-risk coupled atom stands alone with mandatory visual gate.

### Sub-batch 10A.LOW_RISK_ADDITIVE

**Locks included:** LOCK-3 (officer_appointments.end_reason), LOCK-4 (companies onboarding cols ×4), LOCK-5 (company_people.citizenship).

**Files touched:**
- `supabase/migrations/{timestamp}_phase10a_low_risk_additive.sql` (single migration, 6 column adds across 3 tables)
- No code files.

**Pipeline-preservation exposure:** **None.**
- LOCK-3: `officer_appointments` table has zero current SELECT-with-active-filter usage that reads `end_reason` (no code path filters on it; the column doesn't exist yet). Adding nullable column is safe.
- LOCK-4: `companies` onboarding_* columns are net-new; no existing code reads them.
- LOCK-5: `company_people.citizenship` is net-new; `is_canadian_resident` unchanged so all 5 insert sites (Phase A §3.5) continue working.

**Visual gate requirement:** Not required (migration-only, additive nullable columns). Smoke-test by running existing onboarding + director-add + officer-add flows post-migration to confirm no regression.

**Estimated CC session size:** Single session (authoring brief + migration + Phase G `supabase db push --include-all` verification).

**Dependencies:** None — can ship first.

**Acceptable to ship in parallel with:** 10A.FK_RESTRICT, 10A.SHARE_TRANSFERS_GREENFIELD (no schema overlap). In practice CC authors serially, so this is academic but documented for §8.6 clarity.

---

### Sub-batch 10A.FK_RESTRICT

**Locks included:** LOCK-6 (shareholdings FK CASCADE → RESTRICT for both `share_class_id` and `person_id`).

**Files touched:**
- `supabase/migrations/{timestamp}_phase10a_fk_restrict.sql` (constraint DROP + ADD ×2)
- No code files.

**Pipeline-preservation exposure:** **Low.**
- Switching to RESTRICT is stricter than CASCADE — no data is touched at migration time.
- **Forward UI concern:** if any UI path today executes `DELETE FROM company_people WHERE id = X` for a person who has shareholdings, that path will start failing post-migration. Phase B precondition (§6): grep for such delete paths before authoring this sub-batch's migration. If found, either pre-clean or wrap with a "cannot delete — shareholdings exist" UX guard. Phase A did not surface any such path; the only `company_people` deletes observed are intentional from-user-action with no cascade dependency assumption.
- Same concern for `share_classes` deletion paths.

**Visual gate requirement:** Not required. Migration-only.

**Estimated CC session size:** Single session.

**Dependencies:** None. Can ship before or after 10A.LOW_RISK_ADDITIVE. Should ship before 10A.SHAREHOLDER_TEMPORAL_COUPLED to protect future transfer history from accidental cascade deletion.

**Acceptable to ship in parallel with:** 10A.LOW_RISK_ADDITIVE, 10A.SHARE_TRANSFERS_GREENFIELD.

---

### Sub-batch 10A.SHARE_TRANSFERS_GREENFIELD

**Locks included:** LOCK-1 (CREATE TABLE), LOCK-8 (indexes ×4), LOCK-9 (RLS policy).

**Files touched:**
- `supabase/migrations/{timestamp}_phase10a_share_transfers.sql` (CREATE TABLE + 4 CREATE INDEX + ALTER TABLE ENABLE RLS + CREATE POLICY)
- No code files.

**Pipeline-preservation exposure:** **None.**
- Zero existing code reads or writes `share_transfers` (Phase A §1.2 confirmed absence including naming variants).
- Greenfield table with no triggers, no downstream dependencies in v1.0.

**Visual gate requirement:** Not required. Migration-only.

**Estimated CC session size:** Single session.

**Dependencies:** None for schema correctness. **Soft dependency:** should ship before 10A.SHAREHOLDER_TEMPORAL_COUPLED so that any test-data exploration during the high-risk atom's visual gate can reference share_transfers if needed. Functionally, the order between this and the coupled atom doesn't affect schema correctness — the FKs `from_shareholding_id REFERENCES shareholdings(id)` work on the existing `shareholdings.id` PK regardless of LOCK-2 column adds.

**Acceptable to ship in parallel with:** 10A.LOW_RISK_ADDITIVE, 10A.FK_RESTRICT.

---

### Sub-batch 10A.SHAREHOLDER_TEMPORAL_COUPLED

**Locks included:** LOCK-2 (shareholdings ADD COLUMN ×5), LOCK-7 (pipeline-preservation atomic coupling).

**Files touched:**
- `supabase/migrations/{timestamp}_phase10a_shareholdings_temporal.sql` (5 ADD COLUMN ops, all idempotent)
- `lib/pdf/generatePdfDocument.ts` (line ~184 — add `WHERE end_date IS NULL` filter to the shareholdings SELECT, or equivalent active-state predicate)
- Possibly `components/onboarding/OnboardingFlow.tsx` line ~197 (shareholdings insert) — verify whether explicit `source: 'direct_issuance'` is needed or if DEFAULT covers it. Phase B's recommendation: rely on DB DEFAULT (lock specifies `NOT NULL DEFAULT 'direct_issuance'`); no frontend change required.

**Pipeline-preservation exposure:** **HIGH — this is the highest-risk atom in Phase 10A.**

Reasoning: `lib/pdf/generatePdfDocument.ts:184` currently SELECTs all rows from `shareholdings` filtered only by `company_id`. Today there's no `end_date` column, so every row is "current state." Once `end_date` lands:
- All existing rows (16 in prod, all `end_date IS NULL` via the DEFAULT-less ADD COLUMN) remain readable as current state — **no regression at migration moment.**
- But **6 generators** (R-G1 per Phase A §4) read shareholdings; they need to use the same current-state filter going forward so that any *future* row with `end_date IS NOT NULL` is correctly excluded.

**Phase B precondition (§6 below):** before authoring this sub-batch's brief, verify whether all 6 R-G1 generators traverse the line-184 SELECT path or have independent shareholdings reads.

**Visual gate requirement:** **MANDATORY** — dual-fixture (Acme + droussy), FR + EN, Completeness tab + Binder tab, full generator suite. Per Q4 amendment.

**Estimated CC session size:** Multi-session.
- Session 1: authoring brief + migration draft + per-generator query-path verification (R-G1 audit).
- Session 2: code change + visual gate execution + commit + deploy.

**Dependencies:** **Ships LAST** among the 4 sub-batches. Per Max's brief: "Phase B treats it as such — call it out explicitly, sequence it deliberately."

**Acceptable to ship in parallel with:** None. Final atom in the sequence.

---

## §3 — Recommended sequencing

Linear order. LOCK-7 atom ships last (anchor).

```
1. 10A.LOW_RISK_ADDITIVE          ← migration-only, no pipeline coupling, builds confidence
2. 10A.FK_RESTRICT                ← stricter constraints in place before transfer history exists
3. 10A.SHARE_TRANSFERS_GREENFIELD ← new table available before coupled atom needs it
4. 10A.SHAREHOLDER_TEMPORAL_COUPLED ← highest-risk, mandatory visual gate, depends on prior atoms for context
```

**Rationale:**

- **Why LOW_RISK_ADDITIVE first:** it touches 3 different tables (officer_appointments, companies, company_people) with no pipeline-coupling exposure. Lowest blast radius. Builds operational confidence with the Phase 10A migration cadence before higher-risk atoms ship.

- **Why FK_RESTRICT second:** it's the only sub-batch that touches FK semantics. Shipping it before the temporal layer means any future `share_transfers` row inserted in sub-batch 4 (or later phases) is already protected from cascade deletion via `share_classes` or `company_people` deletions. Constraint DROP + ADD is forward-only-safe; no data is at risk.

- **Why SHARE_TRANSFERS_GREENFIELD third:** greenfield CREATE TABLE with zero current pipeline coupling. Could theoretically be 1st or 2nd, but placing it 3rd keeps the high-risk anchor at position 4 with maximum context built up.

- **Why SHAREHOLDER_TEMPORAL_COUPLED last:** highest pipeline-preservation exposure (LOCK-7), mandatory visual gate, requires R-G1 generator audit as precondition. Shipping it after all other atoms means by the time the visual gate runs, all other schema changes are stable and can't compound any regression diagnosis.

**Q4 amendment respected:** each sub-batch ships as a discrete unit. Q3 amendment respected: no relitigation, locks are applied verbatim.

---

## §4 — Empirical validation plan

Per §8.5 banked discipline: MCP `create_branch` requires `confirm_cost` tool exposure which is not currently available. Static analysis grounded in `20260405000000_sprint6_people_ownership.sql` precedent + migration-chain pattern matching is the pre-apply validation tier. The `supabase db push --include-all` Local==Remote idempotency check at Phase G of each sub-batch is the real-apply empirical backstop.

Per sub-batch validation plan:

### 10A.LOW_RISK_ADDITIVE
- **Static:** confirm all 6 ADD COLUMN statements use `IF NOT EXISTS`. Confirm none of the 3 tables has a column with the target name already (Phase A §1.3, §1.4, §1.5 confirmed).
- **Real-apply:** `supabase db push --include-all` should report only this migration applied with zero further drift. Smoke-test: run `supabase db diff` — expect empty output. Smoke-test: post-migration, execute trivial inserts into each of the 3 touched tables via existing UI paths (officer add, onboarding step 4–7, no-op company update) and confirm no errors.

### 10A.FK_RESTRICT
- **Static:** confirm exact constraint names in `20260405000000` migration. Confirm no path in code today exercises CASCADE-via-share_classes-delete or CASCADE-via-company_people-delete (grep precondition per §6 below).
- **Real-apply:** `supabase db push --include-all` → `supabase db diff` empty. Manually verify `\d shareholdings` shows RESTRICT for both FKs via `mcp__supabase__execute_sql` post-apply.

### 10A.SHARE_TRANSFERS_GREENFIELD
- **Static:** confirm column list matches LOCK-1 verbatim. Confirm RLS policy mirrors `shareholdings` policy from sprint 6 migration lines 121–123. Confirm 4 indexes match LOCK-8 names.
- **Real-apply:** `supabase db push --include-all` → `supabase db diff` empty. Post-apply MCP probe: `list_tables` should show `share_transfers` with RLS enabled and the 4 expected indexes via `pg_indexes`.

### 10A.SHAREHOLDER_TEMPORAL_COUPLED
- **Static:** confirm all 5 ADD COLUMN statements use `IF NOT EXISTS`. Confirm CHECK constraints match LOCK-2 verbatim. Confirm `source` DEFAULT is `'direct_issuance'` (not `'initial_issuance'` — drift from Phase A explicitly avoided).
- **R-G1 precondition audit:** before authoring, grep `lib/pdf/` and `app/api/` for any SELECT on `shareholdings` not going through `generatePdfDocument.ts:184`. Document each path. Update each path's filter in the same atom.
- **Real-apply:** `supabase db push --include-all` → `supabase db diff` empty. Post-apply MCP probe: `\d shareholdings` shows 5 new columns with correct nullability + DEFAULTs.
- **Visual gate (mandatory):**
  - **Fixture Acme:** generate all 6 R-G1 documents (3 LSAQ + 3 CBCA) in FR, confirm output identical to pre-migration baseline; repeat in EN.
  - **Fixture droussy:** same matrix (6 docs × 2 langs).
  - **Surface coverage:** Minute Book → Complétude tab (generate from there); Minute Book → Livre (Binder) tab (regenerate via existing flow, confirm document_id stable on re-render).
  - **Pass criterion:** zero PDF diff vs. pre-migration baseline for current-state (all `end_date IS NULL`) inputs.

---

## §5 — Per-atom precedent map

§8.6 discipline — every novel pattern surfaced, every reused pattern cited.

| Sub-batch | Operation | Precedent migration | Specific lines / pattern |
|---|---|---|---|
| LOW_RISK_ADDITIVE | `ADD COLUMN IF NOT EXISTS` (nullable) | `20260510134015_documents_drift_backfill.sql` | Established for additive nullable columns in `documents`. Identical pattern reused for officer_appointments, companies, company_people. |
| LOW_RISK_ADDITIVE | `ADD COLUMN … CHECK (...)` (nullable) | `20260405000000_sprint6_people_ownership.sql` line 42 (`director_mandates.end_reason`) | Sibling enum on a sibling table. Direct mirror for `officer_appointments.end_reason`. |
| LOW_RISK_ADDITIVE | `ADD COLUMN … JSONB NULL` | None in chain (novel pattern for this codebase) | **Novel.** Phase B flags: the `history_phases_status` JSONB column is the first JSONB column on `companies` (note: `documents.ai_summary_fr/en` is the closest sibling pattern, `documents.signatories_confirmed` is another — both nullable JSONB). Migration comment must document the canonical shape. |
| FK_RESTRICT | Constraint `DROP CONSTRAINT … ; ADD CONSTRAINT … FOREIGN KEY … ON DELETE RESTRICT` | None in chain (novel operational class) | **Novel.** No prior migration has dropped + re-added a FK constraint with changed CASCADE semantics. Phase B flags this as a §8.6 surfaced-novel pattern; the authoring brief should structure as a single `DO $$ ... $$` block per FK for atomic safety, mirroring the `DO $$` blocks used in `20260510134015_documents_drift_backfill.sql` (Section 5 — CHECK constraint DROP + ADD pattern from Batch 4 abandoned migration, salvaged as a methodology precedent). |
| SHARE_TRANSFERS_GREENFIELD | `CREATE TABLE` with `REFERENCES` | `20260405000000_sprint6_people_ownership.sql` (entire migration) | Direct mirror — same five-table style: `CREATE TABLE IF NOT EXISTS`, gen_random_uuid PK, REFERENCES with explicit ON DELETE clauses, `created_at TIMESTAMPTZ DEFAULT NOW()`. |
| SHARE_TRANSFERS_GREENFIELD | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` | `20260405000000_sprint6_people_ownership.sql` lines 119–123 (`shareholdings` policy) | Direct mirror — owner-scope `FOR ALL USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))`. |
| SHARE_TRANSFERS_GREENFIELD | `CREATE INDEX IF NOT EXISTS` ×4 | `20260508120000_complete_sprint6_people_ownership.sql` (entire migration) | Direct mirror — Sprint 10A Batch 1 already established the FK-indexing pattern with `IF NOT EXISTS`. |
| SHAREHOLDER_TEMPORAL_COUPLED | `ADD COLUMN IF NOT EXISTS` with `NOT NULL DEFAULT '…' CHECK (...)` | `20260405000000_sprint6_people_ownership.sql` line 89 (`share_classes.type NOT NULL DEFAULT 'common' CHECK …`) | Sibling pattern — NOT NULL DEFAULT with single-value CHECK enum. Identical shape for `shareholdings.source`. |
| SHAREHOLDER_TEMPORAL_COUPLED | Code update to existing SELECT to add `.is('end_date', null)` or `.eq()` filter | None in chain — first time prior-state column add requires immediate caller update in same atom | **Novel — but the discipline itself is from §8.5 banked pipeline-preservation methodology.** Phase B flags this as the highest-risk surfaced-novel pattern; mitigated by mandatory visual gate (LOCK-7). |

---

## §6 — Risks and Phase 10A.x authoring-brief preconditions

What must be true before each sub-batch's authoring brief is written.

### Preconditions for 10A.LOW_RISK_ADDITIVE
- None blocking. Locks are fully specified. Authoring brief can be written immediately upon Phase B approval.

### Preconditions for 10A.FK_RESTRICT
- **P-FK-1:** verify the literal FK constraint names in `20260405000000_sprint6_people_ownership.sql` match Max's brief shorthand (`shareholdings_share_class_id_fkey`, `shareholdings_person_id_fkey`). Postgres auto-names FKs as `{table}_{column}_fkey`, so the names should be deterministic; Phase A did not literally inspect them. Authoring brief should `SELECT conname FROM pg_constraint WHERE conrelid = 'shareholdings'::regclass AND contype = 'f'` as a pre-check.
- **P-FK-2:** grep the codebase for any path that today executes a `DELETE` against `company_people` or `share_classes` (most likely none in current code — Phase A did not surface any — but worth verifying explicitly). If a delete path exists, the authoring brief must decide between (a) shipping a UX guard that prevents the delete when shareholdings exist, or (b) pre-cleaning prod data such that no orphans exist, or (c) accepting that the delete will start failing post-migration and document the new error UX.

### Preconditions for 10A.SHARE_TRANSFERS_GREENFIELD
- None blocking. Greenfield table; locks fully specified.

### Preconditions for 10A.SHAREHOLDER_TEMPORAL_COUPLED
- **P-COUP-1 (HARD BLOCKER):** R-G1 generator audit. Before authoring brief, grep `app/api/` and `lib/` for every SELECT against `shareholdings`. Document each path. For each path, decide whether to:
  - Apply `WHERE end_date IS NULL` filter (current-state semantics — for 6 R-G1 generators).
  - Apply no filter (historical-state semantics — likely the Phase 10F/G Actionnaires history view).
  - Defer decision to a later phase.

  Phase A §3.3 identified `lib/pdf/generatePdfDocument.ts:184` as the central path; P-COUP-1 verifies this is exhaustive.

- **P-COUP-2:** confirm OnboardingFlow.tsx:197 shareholdings insert does NOT need explicit `source: 'direct_issuance'` because the DB DEFAULT covers it. Lock specifies `NOT NULL DEFAULT 'direct_issuance'` — insert without `source` column reference will succeed. Verify via a single test insert in a Phase G branch (post-apply).

- **P-COUP-3:** visual gate fixture readiness — confirm Acme + droussy fixtures both currently generate all 6 R-G1 documents successfully in FR + EN at baseline (i.e. before the sub-batch's migration runs). Any baseline failure must be resolved before the sub-batch ships, otherwise visual gate signal is unreliable.

---

## §7 — Estimated total Phase 10A duration

Per Max's brief: cross-check against decomposition §3.2's 5–7 sprint-day estimate (Q3 = Option B amendment already applied to that estimate).

| Sub-batch | CC sessions | Calendar days at sustainable cadence |
|---|---|---|
| 10A.LOW_RISK_ADDITIVE | 1 | 1 |
| 10A.FK_RESTRICT | 1 (+ P-FK-2 grep prework, ~0.5) | 1.5 |
| 10A.SHARE_TRANSFERS_GREENFIELD | 1 | 1 |
| 10A.SHAREHOLDER_TEMPORAL_COUPLED | 2 (P-COUP-1 audit + authoring; then code + visual gate + commit + deploy) | 2.5 |
| **Total** | **5 sessions** | **~6 calendar days** |

Aligns within the 5–7 sprint-day band from decomp §3.2.

If P-FK-2 surfaces a delete path requiring UX guard work, add +1 session for the guard implementation in a separate brief. Not anticipated; flagged for transparency.

If P-COUP-1 surfaces R-G1 generators NOT covered by `generatePdfDocument.ts:184` (i.e. independent shareholdings reads), the coupled atom expands to cover each independent path. Each additional path is ~0.25 session. Not anticipated; flagged for transparency.

---

## STOP-gate

End of Phase B. Surfacing for Max + Dom review.

**No commits made. No code changes. No migrations authored. No deploys.**

Two uncommitted deliverables now exist in `docs/`:
1. `docs/audit-phase10a-temporal-registry-schema-2026-05-10.md` (Phase A, accepted by Max as historical record)
2. `docs/phase10a-decomposition-proposal-2026-05-10.md` (Phase B, this document)

Awaiting Max + Dom review before Phase 10A.x authoring-brief cycles begin.

---

**End of Phase B decomposition proposal.**
