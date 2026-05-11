# Phase 10A Investigation — Temporal Registry Schema Baseline

**Date:** 2026-05-10
**Status:** Uncommitted draft for Max review — Phase A deliverable per Sprint 10 planning brief
**Author:** Claude Code session
**Inputs read in full:**
- `docs/temporal-registry-product-spec-2026-04-27.md` (750 lines)
- `docs/sprint-10-phase-decomposition-2026-05-07.md` (386 lines, v1.1)
- `docs/temporal-registry-audit-2026-04-23.md` (373 lines)
- `docs/feature-lifecycle.md` (Sprint 10A north star)

**Scope:** Confirm prod baseline for the five tables Phase 10A will touch (`shareholdings`, `share_transfers`, `officer_appointments`, `companies`, `company_people`), audit the migration chain for those tables, reconnoiter the four pipeline call sites where current-state mutations happen today, and enumerate the declared-but-unfulfillable requirement keys.

**No code or schema changes made.** Migration authoring is Phase 10A-G implementation, not Phase A.

---

## §1 — Per-table prod inventory

Probed via MCP `list_tables` (verbose) + `pg_indexes` + targeted `execute_sql` against prod.

### §1.1 `shareholdings` — EXISTS, missing temporal columns

| Aspect | Prod state | Spec target (S10-TR-2) | Drift |
|---|---|---|---|
| Columns | `id`, `company_id`, `person_id`, `share_class_id`, `quantity (>0 CHECK)`, `issue_date`, `issue_price_per_share (numeric)`, `certificate_number (text, nullable)`, `created_at` | + `end_date`, `end_reason`, `source`, `certificate_old`, `certificate_new`, possibly `resolution_document_id` | 5–6 columns missing |
| Row count | 16 | — | — |
| Indexes | `pkey`, `idx_*_company_id`, `idx_*_person_id`, `idx_*_share_class_id` | Spec adds nothing index-wise (Phase 10A-G adds none) | None |
| RLS | Enabled, owner-scope policy | Same | None |
| FK semantics | `person_id` → `company_people.id` (ON DELETE CASCADE per migration); `share_class_id` → `share_classes.id` (ON DELETE CASCADE) | Spec keeps CASCADE for legacy single-row lineage but Phase 10A introduces transfers; CASCADE on share_classes may become a hazard once split rows exist | **Open question Q-A1 (see §6)** |
| `certificate_number` semantics today | Single populated values seen in prod: `'001'` (×8 rows), `'002'` (×6), `'003'` (×2). Onboarding pads as `String(certNum).padStart(3, '0')` per certificate counter per company (not per shareholding). | Spec calls for `certificate_old` and `certificate_new` to track lineage during transfers. Existing `certificate_number` keeps "current" meaning. | Naming/semantic choice for Phase 10A-G to lock — see §6 Q-A2 |

### §1.2 `share_transfers` — ABSENT

`information_schema.tables` query for `table_name LIKE '%transfer%' OR '%share_event%' OR '%share_history%'` returned **zero rows**. No naming variants exist. Greenfield create in Phase 10A-G.

Spec target (Decomposition §2.4, locked Q2):

```
share_transfers (
  id uuid PK,
  company_id uuid NOT NULL FK,
  from_shareholding_id uuid NULL FK,          -- NULL = initial issuance
  to_shareholding_id   uuid NOT NULL FK,
  quantity int NOT NULL CHECK > 0,
  transfer_date date NOT NULL,
  transfer_type text CHECK (initial_issuance, transfer, repurchase, cancellation, …),
  resolution_document_id uuid NULL FK documents,
  source text,
  created_at timestamptz default now()
)
```

`certificate_old` / `certificate_new` live on the **destination shareholding** (locked in Q2), not on `share_transfers`. Confirmed during Phase A.

### §1.3 `officer_appointments` — EXISTS, missing `end_reason`

| Aspect | Prod state | Spec target (S10-TR-4) | Drift |
|---|---|---|---|
| Columns | `id`, `company_id`, `person_id`, `title (CHECK)`, `custom_title`, `is_primary_signing_authority`, `appointment_date`, `end_date`, `is_active`, `created_at` | + `end_reason` (CHECK like director_mandates) | 1 column missing |
| Row count | 18 | — | — |
| Indexes | `pkey`, `idx_*_company_id`, `idx_*_person_id` | — | None |
| RLS | Enabled, owner-scope | Same | None |
| `title` CHECK | `'president','secretary','treasurer','vice_president','custom'` | Spec doesn't change this in 10A-G; stays | None |

Parallel structure with `director_mandates.end_reason` (which has CHECK `'resignation','revocation','death','disqualification','term_expired'`) implies Phase 10A-G should mirror or adapt that enum for officers. Officer-specific reasons may differ — spec §1.3 should be re-checked for exact enum values; brief flagged this as TBD-by-Phase-B.

### §1.4 `companies` — EXISTS, missing all onboarding state columns

| Aspect | Prod state | Spec target (S10-OB-1) | Drift |
|---|---|---|---|
| Existing onboarding-adjacent columns | `incorporation_date`, `province`, `status`, `incorporation_type`, `archived_at`, `archived_reason`, `active_fiscal_year` | All preserved | None |
| Required by spec | `onboarding_branch` (`'rush' \| 'complete' \| NULL`), `onboarding_step` (int or text key), `onboarding_completed_at` (timestamptz), `history_phases_status` (jsonb tracking which §3 history phases are complete vs skip-anywhere) | 4 columns missing | 4 column adds |
| Row count | 9 | — | — |
| Partial drift? | **None detected.** Spot-check across the 18 visible column names shows zero onboarding_* prefix matches. No half-shipped state. | — | Clean greenfield add |

### §1.5 `company_people` — EXISTS, citizenship modeling ambiguity

| Aspect | Prod state | Spec target (S10-OB-2 mention) | Drift |
|---|---|---|---|
| Citizenship modeling today | `is_canadian_resident boolean DEFAULT true` (column already exists) | Spec text in §3 onboarding step "Administrateur" calls for **citizenship**, not residency. These are legally distinct (LSAQ 110: residency requirement) | **Naming/semantics drift — surface to Max (§6 Q-A3)** |
| Row count | 19 | — | — |
| Indexes | `pkey`, `idx_*_company_id` | Sufficient for 10A | None |
| RLS | Enabled, owner-scope | Same | None |
| Other relevant cols | `full_name`, `email`, `phone`, `address_*` block, `address_country` (default `'CA'`), `created_at`, `updated_at` (+ trigger) | Spec doesn't touch in 10A | None |

**Recommendation flagged to Max:** retain `is_canadian_resident` (currently load-bearing for director residency-eligibility logic per LSAQ 110 / CBCA s. 105) and add `citizenship` as a separate text field if spec genuinely needs both. Do **not** rename or repurpose the existing column. Phase B will lock.

---

## §2 — Migration chain anchor map (4 critical tables)

Authoritative migration order, surfaced via `list_migrations` MCP call. All applied in prod.

| Version | File | Touches relevant tables? | Notes |
|---|---|---|---|
| 20260329000000 | `documents_vault.sql` | Touches `documents` only | Pipeline ancestor — `documents.requirement_key` lives here-ish; spec references `resolution_document_id` FK pointing here |
| 20260330000000 | `compliance_engine.sql` | `compliance_rules`, `compliance_items` only | Out of scope (Batch 4 abandoned — see feature-lifecycle.md) |
| **20260405000000** | **`sprint6_people_ownership.sql`** | **Creates `company_people`, `director_mandates`, `officer_appointments`, `share_classes`, `shareholdings`** | **The foundational anchor.** Defines current shapes. Phase 10A-G additive migration extends these. |
| 20260409000000 | `preferred_theme_nullable.sql` | `users` only | N/A |
| 20260506000000 | `documents_is_finalized.sql` | `documents` only | N/A |
| **20260508120000** | **`complete_sprint6_people_ownership.sql`** | **Adds 10 missing indexes + `update_updated_at_column()` trigger** | Sprint 10A Batch 1 — already shipped. All indexes spec wants for 10A-G already exist. |
| 20260508204954 | `create_minute_book_requirements_with_seed.sql` | `minute_book_requirements` | Foundation backfill — required for §4 declared-but-unfulfillable analysis |
| 20260508205705 | `create_feature_flags_with_seed.sql` | `feature_flags` | Onboarding branch may want a flag (TBD by Phase B) |
| 20260508210035 | `create_activity_log.sql` | `activity_log` | Phase 10A-F/G must emit events here for temporal mutations |
| 20260508210425 | `create_company_fiscal_years.sql` | `company_fiscal_years` | N/A for 10A-G schema, but onboarding flow may need to know fiscal year |
| 20260510134015 | `documents_drift_backfill.sql` | `documents` only | N/A |

**schema.sql ↔ migration chain authority check:** No discrepancies were probed at file level for this Phase A — §8.3 of banked methodology says migration chain is authoritative, so schema.sql snapshot is informational only. Phase 10A-G migration should not consult schema.sql for shapes.

**Anchor for Phase 10A-G:** The forthcoming migration extends `20260405000000` semantically. All additions should be `ADD COLUMN IF NOT EXISTS` style (per §8.2 banked discipline) since the migration is forward-only and shareholders/officers tables hold prod data.

---

## §3 — Pipeline-preservation reconnaissance (Q4 non-negotiable)

Q4 lock (decomposition v1.1 §3.2.1): **pipeline-preservation is non-negotiable for Phase 10A.** Existing current-state generation must keep working through every intermediate migration state.

### §3.1 Section classifier — `app/api/minute-book/binder/route.ts`

Lines 4–28: SECTIONS array (8 sections), `DOC_TYPE_SECTION_MAP`, `resolveSection(doc)`. Resolution precedence:

1. `doc.minute_book_section` (the canonical FK-shaped column on documents)
2. `doc.minute_book_requirements?.section` (joined fallback)
3. `DOC_TYPE_SECTION_MAP[doc.document_type]` (legacy type-based fallback)

**Phase 10A-G touch surface:** None expected. Phase 10F/G adds `Administrateurs / Dirigeants / Actionnaires` sidebar nav, not new minute_book sections (those three section keys already exist in `minute_book_section` CHECK). Verify in Phase B by listing requirements per section vs. sidebar surfaces.

### §3.2 Requirement → doctype classifier — `lib/requirement-doctype.ts`

REQUIREMENT_DOC_TYPE explicit map (25 keys, all seeded `minute_book_requirements.requirement_key` values). Section fallback for free-form uploads.

**Phase 10A-G touch surface:** None. Phase 10A-G adds schema columns, not new requirement_keys. If Phase 10F/G introduces *new* generable docs (e.g. director resignation forms), they ride on a separate migration adding new keys to `minute_book_requirements` + entries here. Out of scope for 10A schema.

**Banked finding:** Known gap (line 18–21 of `requirement-doctype.ts`) — three bylaws keys still classified as `'autre'` pending a `'bylaws'` VaultDocType value. Independent of 10A; flagged for Phase 10H or later.

### §3.3 PDF generation — `lib/pdf/generatePdfDocument.ts`

`REQUIREMENT_MAP` (lines 39–54) — 12 generable keys.

Critical Phase 10A-G concern (lines 172–193):
- **Active directors** loaded via `director_mandates.is_active = true` (line 176).
- **Current-state shareholders** loaded via `shareholdings.*` with NO end-date or active filter (line 184–187).

When Phase 10A-G adds `shareholdings.end_date`/`end_reason` columns, this query **must** be updated to filter `WHERE end_date IS NULL` (or equivalent active predicate) to preserve current-state semantics. **This is the highest-risk pipeline coupling.** Surface as **Phase B locked decision** — additive migration must not break current-state until callers are updated, or both must ship in the same phase.

### §3.4 Director-add trigger site — `components/directors/AddDirectorModal.tsx`

Lines 91–103: inserts into `director_mandates` with `(company_id, person_id, appointment_date, is_active=true)`. No end_reason concern at insert time.

**Phase 10A-G/F touch:** Modal will get an "End mandate" capability somewhere (per spec §3 Administrateurs surface). Insert path unchanged. Out of scope for 10A schema phase; relevant only at 10F UX.

### §3.5 Onboarding pipeline — `components/onboarding/OnboardingFlow.tsx`

- **Directors** (lines 120–142): inserts `company_people` (with `is_canadian_resident`) + `director_mandates` (with `is_active=true`, no end_date, no end_reason). Mirrors AddDirectorModal pattern. Unaffected by 10A schema changes.

- **Shareholders** (lines 148–212): creates/reuses `company_people`, creates default share_class if missing, inserts `shareholdings` with `(person_id, share_class_id, quantity, issue_date, certificate_number)`. Generates `certificate_number` via a local counter (`String(certNum).padStart(3, '0')`). **Phase 10A-G concern:** when adding `source` column to shareholdings (and possibly `certificate_old`/`certificate_new`), onboarding insert must default `source = 'initial_issuance'` and leave `certificate_old`=NULL. Phase 10A-G migration must default `source` so existing inserts continue working; alternatively, frontend insert is updated in same phase.

- **Officers** (line 215+ per file structure observed): inserts into `officer_appointments`. Likewise unaffected by `end_reason` ADD until officer-end UX ships.

**Summary — three frontend insert sites to track through Phase 10A-G migration:**
| Site | Path | Mutation |
|---|---|---|
| 1 | `OnboardingFlow.tsx:120` | `director_mandates` insert |
| 2 | `OnboardingFlow.tsx:197` | `shareholdings` insert (will need `source` default or update) |
| 3 | `OnboardingFlow.tsx:~215` | `officer_appointments` insert |
| 4 | `AddDirectorModal.tsx:92` | `director_mandates` insert |
| 5 | `lib/pdf/generatePdfDocument.ts:184` | `shareholdings` SELECT (will need `end_date IS NULL` filter once end_date column lands) |

---

## §4 — Declared-but-unfulfillable requirement keys

25 seeded keys in `minute_book_requirements` (verified via prod row count = 25). 12 are mapped in `lib/pdf/generatePdfDocument.ts` REQUIREMENT_MAP (generable). The 13 remaining are upload-only.

Cross-reference table of the 12 generable keys vs. what Phase 10A-G schema *unlocks* (i.e. whether each generator currently runs against the right current-state shape):

| Requirement key | Generator type | Reads from prod | Current-state correctness |
|---|---|---|---|
| `lsaq_premiere_resolution_ca` | founding_board | active directors, shareholders | OK (foundational, all original rows still current) |
| `lsaq_premiere_resolution_actionnaires` | founding_shareholder | same | OK |
| `lsaq_souscription_actions` | share_subscription | shareholdings (any) | **Today:** prints all shareholdings. **After 10A-G:** must filter to issuance event — needs `source='initial_issuance' AND end_date IS NULL` or join from `share_transfers` |
| `lsaq_annual_board_resolution` | annual_board | active directors | OK |
| `lsaq_annual_shareholder_resolution` | annual_shareholder | active shareholders | **Today:** prints all. **After 10A-G:** needs current-state filter (`end_date IS NULL`) |
| `lsaq_auditor_waiver` | shareholder-res. | shareholders | Same as above |
| `cbca_first_board_resolution` | founding_board | same as LSAQ counterpart | Same |
| `cbca_first_shareholder_resolution` | founding_shareholder | same | Same |
| `cbca_share_subscription` | share_subscription | shareholdings | **Same concern as lsaq_souscription_actions** |
| `cbca_annual_board_resolution` | annual_board | active directors | OK |
| `cbca_annual_shareholder_resolution` | annual_shareholder | active shareholders | **Same as lsaq annual** |
| `cbca_auditor_waiver` | shareholder-res. | shareholders | Same |

**Unfulfillable today** (declared but no MAP entry, so `canGenerate: false` is returned):
13 upload-only keys (incorporation certificates, bylaws, declarations, acceptance forms, annual returns). Phase 10A-G doesn't add generators — purely schema phase. Out of scope.

**Net Phase 10A-G generator-correctness concern:** **6 generators** read `shareholdings` and will need a current-state filter once `end_date` lands. Tracked as risk **R-G1** in §6.

---

## §5 — Schema gap diff (consolidated against spec)

Required by Phase 10A-G (decomposition §2 + product spec §1.3). Counted as ADD-only ops; no DROP or RENAME for 10A.

### §5.1 `shareholdings` — 5 ADD COLUMN
- `end_date date NULL`
- `end_reason text NULL CHECK (...)` — exact enum TBD in Phase B (likely `'transferred'`, `'repurchased'`, `'cancelled'`, possibly `'estate'`)
- `source text NOT NULL DEFAULT 'initial_issuance' CHECK (...)` — enum aligned with `share_transfers.transfer_type`
- `certificate_old text NULL`
- `certificate_new text NULL` (or repurpose `certificate_number` as `certificate_new` — Phase B lock)

### §5.2 `share_transfers` — new table (per §1.2 above)

### §5.3 `officer_appointments` — 1 ADD COLUMN
- `end_reason text NULL CHECK (...)` — Phase B locks enum

### §5.4 `companies` — 4 ADD COLUMN
- `onboarding_branch text NULL CHECK ('rush','complete')` — Phase B confirms enum
- `onboarding_step text NULL` (or int — Phase B locks)
- `onboarding_completed_at timestamptz NULL`
- `history_phases_status jsonb NULL DEFAULT '{}'::jsonb`

### §5.5 `company_people` — possibly 1 ADD COLUMN
- `citizenship text NULL` — **conditional on Q-A3 resolution** (§6). If Max says "use existing `is_canadian_resident`," no change.

### §5.6 Cross-cutting
- Phase 10A-G migration emits no DROPs and no RENAMEs (Q4 lock).
- All NEW columns are nullable or have safe DEFAULTs, ensuring `INSERT … (existing cols only)` continues to work (§3.5 pipeline preservation).
- RLS policies on `share_transfers` need to be added (owner-scope mirror of `shareholdings`).
- Indexes for `share_transfers`: `company_id`, `from_shareholding_id`, `to_shareholding_id`, `transfer_date`.

---

## §6 — Risks, ambiguities, and questions for Max

Numbered for Phase B resolution.

**Q-A1 — `shareholdings.share_class_id ON DELETE CASCADE`.** Today, deleting a share_class cascade-deletes shareholdings. Once `share_transfers` references shareholdings, cascade through share_class deletion would also wipe transfer history. Phase B should lock: switch to `ON DELETE RESTRICT` for `share_class_id` once temporal layer lands? Same question for `person_id`.

**Q-A2 — Certificate column naming.** Spec calls for `certificate_old` + `certificate_new`. Prod has `certificate_number`. Options:
- (i) Keep `certificate_number` as "current certificate," add `certificate_old` only (the destination shareholding's old number = the source's number).
- (ii) Rename `certificate_number` → `certificate_new` and add `certificate_old`.
- (iii) Add both `certificate_old` and `certificate_new`, leave `certificate_number` as legacy/unused.

(i) is cleanest pipeline-preservation; (ii) breaks Q4. Phase B should lock (i) unless Max prefers explicit "new" naming.

**Q-A3 — `company_people.citizenship` vs `is_canadian_resident`.** Two legally-distinct concepts. Recommend keeping both. Phase B confirms.

**Q-A4 — `officer_appointments.end_reason` enum values.** Spec doesn't enumerate. Director enum (`'resignation','revocation','death','disqualification','term_expired'`) is a candidate; some don't apply to officers (disqualification is a director-only LSAQ concept). Phase B locks the enum.

**Q-A5 — `onboarding_step` shape.** Int vs text key. Text-key (e.g. `'directors_complete'`, `'shareholders_in_progress'`) is more legible across phase changes; int requires a separate authoritative phase enumeration. Phase B locks.

**Q-A6 — `history_phases_status` shape.** JSONB free-form vs typed columns? Spec says "skip-anywhere with capability scaling" — JSONB likely correct, but schema should at least document expected keys. Phase B locks the documented shape (with sample doc in migration comment).

**Q-A7 — Pipeline-preservation switchover for `generatePdfDocument.ts:184`.** Adding `end_date` doesn't auto-break the current SELECT (NULL end_date = current state). But once `end_reason` triggers happen, a transferred shareholding has both `quantity` and `end_date IS NOT NULL`. Decision: ship `end_date IS NULL` filter in the same migration phase that introduces the columns, even though no transfer rows exist yet. Phase B locks.

**R-G1 — Generator current-state correctness.** 6 generators implicitly assume current-state on shareholdings. Tracked under Q-A7.

**R-O1 — Onboarding `source` default coverage.** OnboardingFlow inserts shareholdings without specifying `source`. Migration must `DEFAULT 'initial_issuance'`. Confirmed in §5.1.

---

## §7 — Phase B preview / next-step prep

Pending Max approval to advance from Phase A to Phase B (decomposition proposal).

Phase B deliverable per planning brief: `docs/phase10a-decomposition-proposal-2026-05-10.md` (uncommitted). Will contain:

1. Resolution of Q-A1 through Q-A7 (Phase B locked decisions).
2. Sub-phase decomposition (10A-G migration into 1–N atoms, ordered for forward-only safety).
3. Per-atom precedent map (cite Batch 1 / Batch 2 / Batch 3 migrations that established each pattern).
4. Pipeline-preservation switchover plan (when `generatePdfDocument.ts` SELECT gets updated relative to migration phase).
5. Rollback / forward-only confirmation (no DROPs, no DEFAULT removals on existing data, only ADD + CREATE).
6. Empirical validation plan (MCP toolchain constraints: `create_branch` requires unexposed `confirm_cost` — fallback per §8.5).

**STOP gate:** Awaiting Max review of this Phase A doc before drafting Phase B.

---

**End of Phase A investigation.**
