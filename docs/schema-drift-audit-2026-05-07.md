# Schema Drift + Unfulfillable Requirement Keys Audit

**Date:** 2026-05-07
**Status:** Investigation-only. No edits applied. No migrations written. Read-only PostgREST queries against production Supabase.
**Scope:** Sprint 10 pre-work. Two parent tickets bundled per CC brief 2026-05-07: Tier 1 #3 schema drift backfill + S10-TR-13 unfulfillable-keys follow-up.
**Probe scripts:** `scripts/probe-schema-drift-2026-05-07.mjs` (untracked, idempotent, read-only).

---

## Executive summary

Production Supabase has accumulated **substantial off-repo schema** since the last committed migration (`20260506000000_documents_is_finalized.sql`). Out of 20 tables exposed via PostgREST, **only 8 have any creating migration** in `supabase/migrations/` — 12 tables (60%) exist solely in prod. The headline case is `minute_book_requirements` (25 seeded rows; load-bearing in PDF generation, upload classification, completeness API, due diligence export) which has **no migration at all** despite being touched by every Sprint 7B+ flow. The `documents` table has accreted **18 columns beyond its committed migration** (load-bearing fields like `requirement_key`, `signatories_confirmed`, `is_finalized`, plus dead-weight fields like `fiscal_year`, `generated_for_year`, `catch_up_session_id`).

The good news: **the unfulfillable-keys investigation is clean**. Every requirement key declared in `lib/requirement-doctype.ts` (25 keys) is internally consistent with `REQUIREMENT_MAP` (12 keys) and DB `can_generate` flags. Zero runtime traps. The S10-TR-13 framing was about Sprint 10A *adding* generators for currently-upload-only keys — not a present-day bug.

**Three Sprint 10A blockers** are surfaced below. Schema drift backfill should ship before Phase 10A migrations land, otherwise new migrations will be authored against a phantom baseline and rebuilds-from-scratch will silently lose 60% of the schema.

---

## Sub-task 1 — Schema drift inventory

### Methodology

PostgREST does not expose `information_schema` directly, so introspection used Supabase's OpenAPI endpoint (`/rest/v1/`) which returns full Swagger metadata for every table and column the API exposes (name, type, format, nullability, default, FK descriptors). Constraint enums (CHECK), indexes, and triggers are **not** exposed via this channel — those require direct Postgres connection, which is not configured in `.env.local`. Where a finding could not be verified via PostgREST it is tagged "OPAQUE — needs psql to confirm."

Probe output: 2587 lines of structured JSON in `/tmp/probe-full.txt` (committed-to-tree version is the script that regenerates it).

### Tables exposed in prod (20 total)

```
activity_log                    catch_up_sessions
companies                       company_active_years
company_fiscal_years            company_officers_deprecated
company_people                  compliance_items
compliance_rules                director_mandates
document_templates              documents
feature_flags                   minute_book_requirements
officer_appointments            reminders
req_enterprises                 share_classes
shareholdings                   users
```

### Type A — Net-new tables in prod, NO creating migration

| Table | Cols | Rows (prod) | Code refs | Severity | Remediation hint |
|---|---|---|---|---|---|
| `minute_book_requirements` | 14 | 25 (seeded) | 6 files (PDF gen, upload, completeness, due diligence, priority, minute-book page) | **BLOCKER** — load-bearing in 4+ flows | Author migration that creates table + seeds canonical 25 rows. Lock as canonical source for all Sprint 10A requirement-key additions. |
| `company_fiscal_years` | 5 | (has rows) | 12+ files | **BLOCKER** — load-bearing in Settings, Onboarding, Compliance, Dashboard | Author CREATE TABLE + RLS migration. |
| `activity_log` | 8 | (has rows) | 3 files (`lib/activity-log.ts`, `app/api/activity-log/route.ts`, generation pipeline) | **BLOCKER** — load-bearing for Historique nav (Sprint 7B locked feature) | Author CREATE TABLE + RLS migration. |
| `feature_flags` | 6 | 5 seed rows (`multi_company`, `ai_gap_analysis`, `ai_summaries`, `catch_up_wizard`, `settings_page`) | 3 files (`CompanySwitcher`, `GapAnalysisPanel`, `DocumentsClient`) | **SILENT BREAK** — feature flags drive UI gating; rebuild-from-scratch would default-disable everything | Author CREATE TABLE + RLS migration + seed for the 5 flags. |
| `document_templates` | 18 | 4 draft rows (annual_board_resolution_lsaq/cbca, annual_shareholder_resolution_lsaq/cbca — all `status='draft'`, no `validated_at`) | 0 application files (only `audit-document-templates.mjs` + 3 docs) | **DEAD CODE** — table is scaffolded but never read by application code | DOC ONLY — decide in Sprint 10 whether to wire (per `docs/template-architecture-recommendation-2026-04-29.md`) or drop. |
| `catch_up_sessions` | 9 | 0 rows | 0 application files (FK target only) | **SILENT BREAK risk** — `documents.catch_up_session_id` FK references it; if dropped, drops the FK | DOC ONLY for now — assess whether Phase 10A retains the catch-up wizard concept or supersedes it via temporal registry. |
| `req_enterprises` | 9 | 0 rows | 0 application files | **DOC ONLY** — appears to be a NEQ enterprise import staging table, never wired | Decide: drop or wire as part of NEQ lookup feature. |
| `company_active_years` | 4 | (has rows for at least one company) | 0 application files | **SILENT BREAK** — appears to be an early-iteration table superseded by `company_fiscal_years`; orphaned data | Decide: archive + drop, or fold into `company_fiscal_years`. |
| `company_officers_deprecated` | 7 | 0 rows | 0 application files | DOC ONLY | Already renamed by migration `20260405000000_sprint6_people_ownership.sql`. Safe to drop. |

### Type A — Net-new columns on existing tables, NO migration

#### `companies` (declared in `schema.sql` with 11 cols; prod has 18 — 7 new)

| Column | Type | Default | Code refs | Severity |
|---|---|---|---|---|
| `fiscal_year_end_month` | integer nullable | — | onboarding, settings | **BLOCKER** |
| `fiscal_year_end_day` | integer nullable | — | onboarding, settings | **BLOCKER** |
| `corporation_number` | text nullable | — | onboarding (CBCA) | load-bearing |
| `neq` | text nullable | — | onboarding, NEQ check route, PDF gen | **BLOCKER** — referenced in `generatePdfDocument.ts:163` |
| `archived_at` | timestamptz nullable | — | (likely soft-delete) | DOC ONLY |
| `archived_reason` | text nullable | — | (likely soft-delete) | DOC ONLY |
| `active_fiscal_year` | integer nullable | — | (uncertain — needs grep) | DOC ONLY — verify usage |

#### `documents` (declared in `schema.sql` with 10 cols + 1 from migration `20260506`; prod has 28 — 17 new beyond `is_finalized`)

| Column | Type | Default | Code refs | Severity |
|---|---|---|---|---|
| `file_name` | text nullable | — | generation, upload | **BLOCKER** |
| `file_size` | integer nullable | — | generation, upload, ai-summary | load-bearing |
| `status` | text | `'active'` | many (DocumentsClient, etc.) | **BLOCKER** — CHECK constraint enum opaque to PostgREST |
| `document_year` | integer nullable | — | foundational vs annual logic in PDF gen + UI | **BLOCKER** |
| `fiscal_year` | text nullable | — | **0 application refs** | DEAD CODE — drop candidate |
| `ai_summary_fr` | jsonb nullable | — | ai/document-summary | load-bearing |
| `ai_summary_en` | jsonb nullable | — | ai/document-summary | load-bearing |
| `source` | text | `'uploaded'` | upload-document, generatePdfDocument | **BLOCKER** |
| `generated_for_year` | integer nullable | — | **0 application refs** | DEAD CODE — drop candidate |
| `catch_up_session_id` | uuid nullable (FK → catch_up_sessions) | — | **0 application refs** | DEAD CODE if `catch_up_sessions` is dropped |
| `requirement_key` | text nullable | — | PDF gen, upload, completeness, priority, due diligence, **droussy migration script** | **BLOCKER** — load-bearing across 6+ files |
| `requirement_year` | integer nullable | — | PDF gen, upload (annual rows) | **BLOCKER** — droussy migration touched this |
| `minute_book_section` | text nullable | — | PDF gen, completeness | load-bearing |
| `signature_status` | text | `'draft'` | DocumentsClient, generatePdfDocument | load-bearing |
| `signed_at` | timestamptz nullable | — | (signature flow) | load-bearing |
| `signed_version_url` | text nullable | — | (signature flow) | load-bearing |
| `signatories_confirmed` | jsonb nullable | — | generatePdfDocument, SignatoriesModal | load-bearing |

#### `users` (declared in `schema.sql` + migration `20260409` adds `preferred_theme`)

| Column | Drift | Severity |
|---|---|---|
| `preferred_theme` | Migration `20260409` declares no DEFAULT, but prod has `DEFAULT 'original'` | **Type B drift** — minor; cosmetic |

#### `compliance_rules` (declared in `schema.sql` with one shape, in migration `20260330` with a different shape)

The two committed sources disagree on this table's shape. Prod has the union plus 3 additional columns:
- Both sources agree: `id`, `jurisdiction`, `framework`, `rule_key`, `title_fr`, `title_en`, `frequency`, `created_at`
- Only schema.sql: `description_fr`, `description_en`, `due_day`, `due_month`, `is_active` (default true)
- Only migration 20260330: `legal_reference`, `last_reviewed_at`, `reviewed_by`, UNIQUE(framework, jurisdiction, rule_key)
- **Prod-only (Type A net-new columns)**: `effective_date` (date, default `'2024-01-01'`, NOT NULL), `deprecated_at` (date nullable), `review_notes` (text nullable)

**Severity: BLOCKER.** Two committed migrations declare divergent shapes; neither matches prod. This is a documentation hazard for Sprint 10A any time compliance rules need to evolve.

#### `compliance_items` (migration `20260330` vs `schema.sql`)

The two sources disagree on the `status` CHECK enum:
- migration 20260330: `('compliant', 'pending', 'required')`
- schema.sql: `('pending', 'complete', 'overdue', 'not_applicable')`
- prod: `default 'pending'` (CHECK opaque to PostgREST — needs psql)

**Severity: SILENT BREAK risk** — code may write a value valid under one declaration but rejected by the prod CHECK.

### Type B — Columns exist in migration but with different type / default / nullability in prod

| Object | Drift | Severity |
|---|---|---|
| `users.preferred_theme` | Migration `20260409` declares no DEFAULT; prod has `DEFAULT 'original'` | DOC ONLY |
| `compliance_rules.frequency` | Migration `20260330`: `text NOT NULL DEFAULT 'annual'`. Schema.sql: `text NOT NULL CHECK ('annual','one_time','triggered')`, no default. Prod: `text NOT NULL`, no default exposed | DOC ONLY (unverifiable enum) |

### Type C — Seed data in prod with no committed seed script

| Table | Rows | Coverage gap |
|---|---|---|
| `minute_book_requirements` | 25 (16 foundational + 9 annual; LSA=11, CBCA=14; sections: statuts=3, reglements=3, avis=5, resolutions=10, actionnaires=2, administrateurs=2) | **BLOCKER** — entire seed off-repo |
| `feature_flags` | 5 (`multi_company` off; `ai_gap_analysis`, `ai_summaries`, `catch_up_wizard`, `settings_page` on) | **SILENT BREAK** — rebuild defaults all flags off |
| `compliance_rules` | 9 in prod (4 LSA + 5 CBCA). Migration 20260330 seeds **10** (5 LSA + 5 CBCA — includes `lsaq auditor_waiver`). Prod is **missing `(QC, LSA, auditor_waiver)`** | **Type D adjacent** — migration's `ON CONFLICT DO NOTHING` should have inserted this row; either the seed never ran, or it was hand-deleted post-seed. Prod also matches migration shape (lowercase rule_keys), so `schema.sql`'s ALL_CAPS-keyed seed never executed. |
| `document_templates` | 4 draft rows | DEAD CODE (no application reads — see Sub-task 2) |
| `company_active_years` | rows present | DOC ONLY (orphaned data) |

### Type D — Migration declares structure not present in prod

| Object | Drift | Severity |
|---|---|---|
| `compliance_rules.(QC,LSA,auditor_waiver)` row | Migration 20260330 seeds it with `ON CONFLICT DO NOTHING`; prod does not have it | DOC ONLY — investigate if intentional waiver removal or migration partial-run |
| `schema.sql` compliance_rules seed (`QC_LSA_ANNUAL_MEETING` etc., ALL_CAPS keys) | Never executed in prod | DOC ONLY — `schema.sql` is bootstrap-only and was superseded |
| `schema.sql` reminders table | Migration not present in `supabase/migrations/`; table exists in prod with the schema.sql shape | The table exists, but `schema.sql` is not registered as a migration. Severity: DOC ONLY for `reminders`. |

### Indexes, constraints, FKs — unverifiable via PostgREST

PostgREST exposes FK descriptors via `description` strings, but does not expose:
- CHECK constraint values (e.g., `documents.status` enum, `documents.document_type` enum)
- All indexes (only PK is signaled)
- Triggers (`set_updated_at`, `update_updated_at_column`, etc.)
- RLS policies in detail

**Verified FKs in prod that have no migration**:
- `activity_log.company_id → companies(id)`
- `activity_log.user_id → users(id)`
- `catch_up_sessions.company_id → companies(id)`
- `catch_up_sessions.user_id → users(id)`
- `company_fiscal_years.company_id → companies(id)`
- `company_active_years.company_id → companies(id)`
- `documents.catch_up_session_id → catch_up_sessions(id)` (the dead FK noted above)

**Recommendation**: full Phase 1A of any remediation should connect via psql (DATABASE_URL or pg connection string) to dump `pg_indexes`, `pg_constraint` (check defs), `pg_trigger`, and `pg_policies`. Without that, this audit is necessarily incomplete on the constraint/index axis.

### `minute_book_requirements` row inventory (full, ordered by sort_order)

| sort | requirement_key | category | jur | fwk | section | can_generate | can_upload | In REQUIREMENT_MAP? |
|---|---|---|---|---|---|---|---|---|
| 10 | cbca_certificate_incorporation | foundational | CA | CBCA | statuts | false | true | no |
| 10 | lsaq_statuts_constitution | foundational | QC | LSA | statuts | false | true | no |
| 15 | cbca_articles_incorporation | foundational | CA | CBCA | statuts | false | true | no |
| 20 | cbca_bylaw_1 | foundational | CA | CBCA | reglements | false | true | no |
| 20 | lsaq_reglement_interieur | foundational | QC | LSA | reglements | false | true | no |
| 25 | cbca_bylaw_2 | foundational | CA | CBCA | reglements | false | true | no |
| 30 | lsaq_declaration_initiale | foundational | QC | LSA | avis | false | true | no |
| 35 | cbca_declaration_initiale_qc | foundational | CA | CBCA | avis | false | true | no |
| 40 | cbca_first_board_resolution | foundational | CA | CBCA | resolutions | true | true | **yes** |
| 40 | lsaq_premiere_resolution_ca | foundational | QC | LSA | resolutions | true | true | **yes** |
| 50 | cbca_first_shareholder_resolution | foundational | CA | CBCA | resolutions | true | true | **yes** |
| 50 | lsaq_premiere_resolution_actionnaires | foundational | QC | LSA | resolutions | true | true | **yes** |
| 60 | cbca_share_subscription | foundational | CA | CBCA | actionnaires | true | true | **yes** |
| 60 | lsaq_souscription_actions | foundational | QC | LSA | actionnaires | true | true | **yes** |
| 70 | cbca_director_acceptance | foundational | CA | CBCA | administrateurs | false | true | no |
| 70 | lsaq_acceptation_mandat | foundational | QC | LSA | administrateurs | false | true | no |
| 100 | cbca_annual_board_resolution | annual | CA | CBCA | resolutions | true | true | **yes** |
| 100 | lsaq_annual_board_resolution | annual | QC | LSA | resolutions | true | true | **yes** |
| 110 | cbca_annual_shareholder_resolution | annual | CA | CBCA | resolutions | true | true | **yes** |
| 110 | lsaq_annual_shareholder_resolution | annual | QC | LSA | resolutions | true | true | **yes** |
| 120 | cbca_auditor_waiver | annual | CA | CBCA | resolutions | true | true | **yes** |
| 120 | lsaq_auditor_waiver | annual | QC | LSA | resolutions | true | true | **yes** |
| 130 | cbca_annual_return | annual | CA | CBCA | avis | false | true | no |
| 130 | lsaq_req_annual_update | annual | QC | LSA | avis | false | true | no |
| 140 | cbca_req_annual_update_qc | annual | CA | CBCA | avis | false | true | no |

Distributions:
- byCategory: `foundational=16, annual=9`
- bySection: `statuts=3, reglements=3, avis=5, resolutions=10, actionnaires=2, administrateurs=2`
- byFramework: `CBCA=14, LSA=11`
- byJurisdiction: `CA=14, QC=11`

This row set is **the canonical S10-TR-13 input**. Any Sprint 10A migration that adds new requirement keys (e.g., to flip `acceptation_mandat` from upload-only to generable) MUST land alongside an updated REQUIREMENT_MAP entry and a template — see Sub-task 2 for the gating check.

---

## Sub-task 2 — Declared-but-unfulfillable requirement keys audit

### Methodology

Cross-referenced four sources:
1. **DB seed** — 25 rows of `minute_book_requirements` (full inventory above).
2. **Upload-side classifier** — `lib/requirement-doctype.ts` `REQUIREMENT_DOC_TYPE` map (lines 36–77): 25 keys.
3. **Generation-side map** — `lib/pdf/generatePdfDocument.ts` `REQUIREMENT_MAP` (lines 39–54): 12 keys.
4. **Signatory-type map** — `lib/requirement-map.ts` `REQUIREMENT_SIGNATORY_MAP`: 12 keys.
5. **PDF templates** — `lib/pdf-templates/`: 7 source files (3 component partials + 4 templates: `cover-page`, `resolution-board`, `resolution-shareholder`, `annual-register`).
6. **Generation router** — `lib/pdf/generatePDF.ts` switch on `type`: handles `'board-resolution'`, `'shareholder-resolution'`, `'cover-page'` (REQUIREMENT_MAP only emits the first two).

### Inventory

| requirement_key | DB can_generate | classifier | REQUIREMENT_MAP | signatory map | template wired | classification |
|---|---|---|---|---|---|---|
| cbca_certificate_incorporation | false | yes | no | no | n/a | **upload-only (correct)** |
| lsaq_statuts_constitution | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_articles_incorporation | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_bylaw_1 | false | yes | no | no | n/a | **upload-only (correct)** |
| lsaq_reglement_interieur | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_bylaw_2 | false | yes | no | no | n/a | **upload-only (correct)** |
| lsaq_declaration_initiale | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_declaration_initiale_qc | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_first_board_resolution | true | yes | yes | yes (board) | resolution-board | **fulfillable** |
| lsaq_premiere_resolution_ca | true | yes | yes | yes (board) | resolution-board | **fulfillable** |
| cbca_first_shareholder_resolution | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| lsaq_premiere_resolution_actionnaires | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| cbca_share_subscription | true | yes | yes | yes (shareholder) | resolution-board (board type) | **fulfillable** — note signatory map says shareholder, REQUIREMENT_MAP routes via `'board-resolution'` type. Internal inconsistency, but harmless: signatory map drives the signatory picker, REQUIREMENT_MAP drives the renderer. Worth flagging for Sprint 10 review. |
| lsaq_souscription_actions | true | yes | yes | yes (shareholder) | resolution-board (board type) | **fulfillable** — same routing-vs-signatory mismatch as cbca_share_subscription |
| cbca_director_acceptance | false | yes | no | no | n/a | **upload-only (correct)** — S10-TR-13 candidate to flip to `can_generate=true` |
| lsaq_acceptation_mandat | false | yes | no | no | n/a | **upload-only (correct)** — S10-TR-13 candidate to flip to `can_generate=true` |
| cbca_annual_board_resolution | true | yes | yes | yes (board) | resolution-board | **fulfillable** |
| lsaq_annual_board_resolution | true | yes | yes | yes (board) | resolution-board | **fulfillable** |
| cbca_annual_shareholder_resolution | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| lsaq_annual_shareholder_resolution | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| cbca_auditor_waiver | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| lsaq_auditor_waiver | true | yes | yes | yes (shareholder) | resolution-shareholder | **fulfillable** |
| cbca_annual_return | false | yes | no | no | n/a | **upload-only (correct)** |
| lsaq_req_annual_update | false | yes | no | no | n/a | **upload-only (correct)** |
| cbca_req_annual_update_qc | false | yes | no | no | n/a | **upload-only (correct)** |

### Findings

- **Zero declared-but-unfulfillable keys today.** Every key in the classifier is either (a) generable end-to-end (`can_generate=true` in DB AND in REQUIREMENT_MAP AND has a wired template) or (b) explicitly upload-only (`can_generate=false` AND not in REQUIREMENT_MAP, with `generatePdfDocument.ts:140` correctly returning `{ ok: false, canGenerate: false }`).
- **Zero runtime traps.** `generatePdfDocument.ts` line 139–142 guards every call with `REQUIREMENT_MAP[requirementKey]` lookup. UI surfaces the Generate button only when `can_generate=true` in the DB row (`RequirementSection.tsx:95`, `CompletenessPage.tsx:155`).
- **One dead template file.** `lib/pdf-templates/annual-register.ts` exports `annualRegisterHTML`, re-exported from `lib/pdf-templates/index.ts:13`, but no application code imports it (only `lib/pdf-templates/*` files reference it). DEAD CODE.
- **One inconsistency worth flagging.** `cbca_share_subscription` and `lsaq_souscription_actions` are wired in REQUIREMENT_MAP as `'board-resolution'` (board template, board signatories) but in the signatory map (`lib/requirement-map.ts`) as `'shareholder'` type. The two maps disagree about who signs share subscription resolutions. This is **not a runtime crash**, but it means the UI signatory picker and the rendered PDF could surface different signatory rosters. Worth resolving in Sprint 10 — will become more visible if Phase 10C surfaces signature reconciliation features.
- **`document_templates` table is dead in current code.** 4 draft rows, 0 application reads. The earlier Path C audit (`docs/audit-template-architecture-phase1-2026-04-29.md`) flagged this; recommendation is still pending.
- **S10-TR-13 framing clarification.** The brief mentions S10-TR-13 (acceptation du mandat) was discovered as "declared-but-unfulfillable." In the current codebase that's not literally true — `lsaq_acceptation_mandat` is correctly marked `can_generate=false` in DB and correctly excluded from REQUIREMENT_MAP. The Sprint 10A intent is to **flip** it to generable, which will require coordinated changes to: (1) DB seed update, (2) REQUIREMENT_MAP entry, (3) signatory map entry, (4) template (likely a new `acceptance-of-mandate` template, or extending resolution-board), (5) `lib/requirement-doctype.ts` may need a new `VaultDocType` value if "consent form" warrants its own pill. The audit recommendation below proposes a CI guard so any future flip cannot land partially.

### Recommended Sprint 10 invariant (CI guard)

A regression script (modeled on `scripts/audit-doctypes.mjs`) should assert, after every PR merge:

> For every row in `minute_book_requirements` where `can_generate = true`:
> 1. The `requirement_key` must exist as a key in `REQUIREMENT_MAP` (`lib/pdf/generatePdfDocument.ts`).
> 2. The `requirement_key` must exist as a key in `REQUIREMENT_SIGNATORY_MAP` (`lib/requirement-map.ts`).
> 3. The `mapping.type` returned must be a valid case in `lib/pdf/generatePDF.ts` switch.
> 4. The signatory map's type and REQUIREMENT_MAP's type must agree (board ↔ board signatories, shareholder ↔ shareholder signatories) — fix the share-subscription inconsistency first, then enforce.

This is the cheapest insurance against re-introducing the unfulfillable-key class of bug as Sprint 10A churns the requirement table.

---

## What this blocks in Sprint 10

### Phase 10A schema migrations — BLOCKING

- **`minute_book_requirements` cannot accept new rows from a migration** until that table itself has a creating migration. Any Sprint 10A migration that does `INSERT INTO minute_book_requirements (...)` will succeed in prod but fail in any rebuilt-from-scratch environment (CI, staging, new dev machines). Backfill the table-creation migration **before** Phase 10A row-additions.
- **`compliance_rules` shape is ambiguous** between two committed migrations and prod. Any Sprint 10 work touching compliance rules (acceptance of mandate is technically compliance-adjacent) will face: which `frequency` enum is canonical? Does `is_active` exist? Resolve the schema-vs-migration disagreement before Phase 10A modifies this table.
- **`compliance_items.status` CHECK enum is opaque and contradicted across sources.** Phase 10A code that writes a new `status` value risks silent rejection. Connect via psql to dump the actual CHECK definition before authoring code that relies on enum values.

### Phase 10A code expectations — SILENT-BREAK risk

- **`documents` columns `requirement_key`, `requirement_year`, `signatories_confirmed`** are load-bearing today but exist only in prod. A new dev who builds from migrations alone will see PDF generation succeed (since the Supabase client doesn't enforce strict schemas at insert time) but with NULLs in their local DB, breaking flows that read these columns back.
- **`feature_flags` rows** (`ai_summaries`, `catch_up_wizard`, `settings_page`) are not seeded in any migration; Sprint 10 rebuilds will default-disable all gated features. Author a seed migration before Sprint 10 lands or onboard new devs through a documented data-import path.

### Sprint 10A unfulfillable-key vector — IF NOT GUARDED

- If Phase 10A flips any current-`can_generate=false` requirement to `true` without simultaneously landing the REQUIREMENT_MAP/signatory-map/template trio, the UI will surface a Generate button that returns `{ ok: false, canGenerate: false }` from the API — visible runtime error. Mitigation: ship the CI guard above as part of Phase 10A's first PR.

---

## Files referenced

- Probe scripts (untracked): `scripts/probe-schema-drift-2026-05-07.mjs`
- Existing audit scripts (committed, used as prior art): `scripts/audit-doctypes.mjs`, `scripts/audit-requirements.mjs`, `scripts/audit-document-templates.mjs`
- Application files inventoried (not modified): `lib/requirement-doctype.ts`, `lib/pdf/generatePdfDocument.ts`, `lib/pdf/generatePDF.ts`, `lib/requirement-map.ts`, `lib/pdf-templates/*`
- Migrations inventoried: `supabase/migrations/20260329000000_documents_vault.sql`, `supabase/migrations/20260330000000_compliance_engine.sql`, `supabase/migrations/20260405000000_sprint6_people_ownership.sql`, `supabase/migrations/20260409000000_preferred_theme_nullable.sql`, `supabase/migrations/20260506000000_documents_is_finalized.sql`
- Schema bootstrap: `supabase/schema.sql` (note: not registered as a migration)

## Out of scope (per brief)

No edits, no migrations authored, no production data writes, no commits, no memory updates, no CLAUDE.md updates. All findings are observations.

---

## §4 — psql/MCP supplement (added 2026-05-08)

**Status:** Investigation-only follow-up to §1–§3. All probes executed via Supabase MCP server (`mcp__supabase__execute_sql`, `mcp__supabase__list_extensions`) configured with `read_only=true` in `.mcp.json`. No DDL or DML attempted; server-side guardrail not exercised. SQL queries and result interpretations are inline.

**Headline finding (new BLOCKER, not surfaced in §1–§3):** Migration `20260405000000_sprint6_people_ownership.sql` is **partially executed in prod**. The tables, RLS policies, and CHECK constraints landed, but **all 10 declared indexes did not**, and **the `update_updated_at_column()` trigger function (and its `update_company_people_updated_at` trigger) was never created**. This is a bigger problem than the off-repo schema covered in §1 — it means a committed migration silently failed mid-run and prod has been operating without the perf indexes for a month plus. Detail in §4.2 and §4.3.

### §4.1 CHECK constraints

```sql
SELECT conname, conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;
```

28 CHECK constraints in prod across 16 tables. Cross-referenced against `supabase/schema.sql` (bootstrap), `20260329` (vault), `20260330` (compliance), `20260405` (people/ownership), `20260409` (preferred_theme), `20260506` (is_finalized).

| Constraint | Definition (prod) | Source classification | Severity |
|---|---|---|---|
| `users_preferred_language_check` | `('fr','en')` | schema.sql declares; no migration | **MIGRATION-DRIFT** (bootstrap-only — schema.sql is not a registered migration) |
| `users_preferred_theme_check` | `IS NULL OR ('light','dark','original')` | migration 20260409 | **MIGRATION-AGREES** |
| `companies_incorporation_type_check` | `('LSA','CBCA')` | schema.sql | **MIGRATION-DRIFT** |
| `companies_province_check` | 13-province enum | schema.sql | **MIGRATION-DRIFT** |
| `companies_status_check` | `('active','inactive')` | schema.sql | **MIGRATION-DRIFT** |
| `documents_document_type_check` | `('statuts','resolution','pv','registre','rapport','autre')` | migration 20260329 | **MIGRATION-AGREES** — schema.sql declared a now-stale enum `('resolution','bylaw','register','certificate','other')`; migration 20260329 explicitly drops/replaces it |
| `documents_framework_check` | `('LSA','CBCA')` | schema.sql | **MIGRATION-DRIFT** |
| `documents_language_check` | `('fr','en','bilingual')` | schema.sql | **MIGRATION-DRIFT** |
| `documents_minute_book_section_check` | 8-value enum (`statuts, avis, reglements, resolutions, administrateurs, dirigeants, actionnaires, registres`) | **off-repo** | **MIGRATION-DRIFT** — load-bearing in PDF gen + completeness; matches `minute_book_requirements_section_check` value set (good — internally consistent) |
| `documents_signature_status_check` | `('draft','pending_signature','signed')` | **off-repo** | **MIGRATION-DRIFT** |
| `documents_source_check` | `('uploaded','generated','imported')` | **off-repo** | **MIGRATION-DRIFT** — code reads/writes `'uploaded'` and `'generated'`; `'imported'` is unused (probable dead enum value) |
| `compliance_items_status_check` | `('pending','complete','overdue','not_applicable')` | schema.sql | **MIGRATION-CONTRADICTS** — migration 20260330 declares `('compliant','pending','required')` (3 values, different vocabulary). Prod matches schema.sql, NOT the migration. Confirms the §1 BLOCKER. |
| `compliance_rules_framework_check` | `('LSA','CBCA')` | both schema.sql AND migration 20260330 | **MIGRATION-AGREES** |
| `compliance_rules_frequency_check` | `('annual','one_time','triggered')` | schema.sql declares CHECK; migration 20260330 declares NO CHECK (only `DEFAULT 'annual'`) | **MIGRATION-CONTRADICTS** — migration omits the CHECK that prod enforces. |
| `compliance_rules_due_day_check` | `1..31` | schema.sql; migration 20260330 doesn't have the column | **MIGRATION-DRIFT** |
| `compliance_rules_due_month_check` | `1..12` | schema.sql; migration 20260330 doesn't have the column | **MIGRATION-DRIFT** |
| `share_classes_type_check` | `('common','preferred')` | migration 20260405 | **MIGRATION-AGREES** |
| `shareholdings_quantity_check` | `quantity > 0` | migration 20260405 | **MIGRATION-AGREES** |
| `officer_appointments_title_check` | `('president','secretary','treasurer','vice_president','custom')` | migration 20260405 | **MIGRATION-AGREES** |
| `director_mandates_end_reason_check` | `('resignation','revocation','death','disqualification','term_expired')` | migration 20260405 | **MIGRATION-AGREES** |
| `company_officers_role_check` | `('director','officer','shareholder')` | schema.sql (kept after rename to `_deprecated`) | **MIGRATION-DRIFT** (legacy) |
| `reminders_channel_check` | `('email')` | schema.sql | **MIGRATION-DRIFT** |
| `activity_log_event_type_check` | **18-value enum** (see §4.6 #11) | **off-repo** | **MIGRATION-DRIFT** — load-bearing for Sprint 7B Historique nav |
| `catch_up_sessions_status_check` | `('in_progress','completed','abandoned')` | **off-repo** | **MIGRATION-DRIFT** |
| `company_fiscal_years_status_check` | `('active','archived')` | **off-repo** | **MIGRATION-DRIFT** |
| `document_templates_status_check` | `('draft','pending_review','validated','deprecated')` | **off-repo** | **MIGRATION-DRIFT** (table dead per §1) |
| `minute_book_requirements_category_check` | `('foundational','annual')` | **off-repo** | **MIGRATION-DRIFT** (table off-repo; load-bearing) |
| `minute_book_requirements_section_check` | 8-value enum (matches `documents_minute_book_section_check`) | **off-repo** | **MIGRATION-DRIFT** |

#### CHECK summary

- **MIGRATION-AGREES**: 8 constraints
- **MIGRATION-DRIFT**: 17 constraints (12 from schema.sql which is bootstrap-only; 8 entirely off-repo)
- **MIGRATION-CONTRADICTS**: 2 constraints (`compliance_items_status`, `compliance_rules_frequency`) — both confirm §1 BLOCKERs
- **MISSING**: zero — every code-implied CHECK exists in prod

#### Sprint 10A pre-flight

- **`shareholdings.quantity > 0`** present, will reject zero/placeholder rows.
- **`officer_appointments.title` 5-value enum** present; has `'custom'` escape hatch + `custom_title TEXT` column, so most extensions accommodated.
- **`company_people.*` CHECKs**: none. Confirms `citizenship` is not present (S10-TR-9 will add cleanly).

### §4.2 Indexes

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

31 indexes returned. Tables with **only PK index** (no other indexes): `compliance_items`, `users`, `company_people`, `documents`, `share_classes`, `shareholdings`, `officer_appointments`, `director_mandates`, `catch_up_sessions`, `reminders`.

#### Indexes declared in migrations but ABSENT from prod (Type D — major)

Migration `20260405000000_sprint6_people_ownership.sql` declares **10 indexes**. **None are in prod.**

| Declared index | Table | In prod? |
|---|---|---|
| `idx_company_people_company_id` | `company_people` | **NO** |
| `idx_director_mandates_company_id` | `director_mandates` | **NO** |
| `idx_director_mandates_person_id` | `director_mandates` | **NO** |
| `idx_director_mandates_active` | `director_mandates(company_id, is_active)` | **NO** |
| `idx_officer_appointments_company_id` | `officer_appointments` | **NO** |
| `idx_officer_appointments_person_id` | `officer_appointments` | **NO** |
| `idx_share_classes_company_id` | `share_classes` | **NO** |
| `idx_shareholdings_company_id` | `shareholdings` | **NO** |
| `idx_shareholdings_person_id` | `shareholdings` | **NO** |
| `idx_shareholdings_share_class_id` | `shareholdings` | **NO** |

**Severity: BLOCKER.** Combined with the missing trigger/function (§4.3), the most likely explanation is a partially-executed migration — likely run via Dashboard SQL Editor with an early statement abort or partial copy-paste. Every Sprint 6+ query that filters by `company_id` on these five tables is doing a sequential scan in prod.

#### Foreign-key indexes MISSING entirely (no migration, no prod)

| Table | FK column | Severity |
|---|---|---|
| `documents` | `company_id` | **BLOCKER** — most-queried FK in the app; seq-scan on every documents-list query |
| `documents` | `catch_up_session_id` | DOC ONLY (column dead per §1) |
| `compliance_items` | `company_id` | **BLOCKER** — gap-analysis page queries by company_id |
| `compliance_items` | `rule_id` | load-bearing |
| `catch_up_sessions` | `company_id` | DOC ONLY (table low-traffic, possibly dead) |
| `catch_up_sessions` | `user_id` | DOC ONLY |
| `reminders` | `company_id` | load-bearing (low traffic) |
| `reminders` | `compliance_item_id` | DOC ONLY |

#### Indexes present in prod with no creating migration (Type A drift)

| Index | Definition | Severity |
|---|---|---|
| `idx_activity_log_company` | btree(company_id) | off-repo (table off-repo per §1) |
| `idx_activity_log_created` | btree(created_at DESC) | off-repo (good for Historique nav) |
| `idx_company_active_years_company` | btree(company_id) | off-repo |
| `idx_companies_neq_unique` | **partial UNIQUE on neq WHERE neq IS NOT NULL AND neq <> ''** | **BLOCKER** — NEQ uniqueness is a product invariant; this index is the only thing enforcing it; entirely off-repo |
| `idx_req_enterprises_neq` | UNIQUE btree(neq) | off-repo |
| `company_active_years_company_id_year_key` | UNIQUE(company_id, year) | off-repo |
| `company_fiscal_years_company_id_year_key` | UNIQUE(company_id, year) | off-repo (load-bearing) |
| `document_templates_template_key_key` | UNIQUE(template_key) | off-repo (table dead) |
| `feature_flags_flag_key_key` | UNIQUE(flag_key) | off-repo (load-bearing) |
| `minute_book_requirements_requirement_key_framework_key` | UNIQUE(requirement_key, framework) | **BLOCKER** off-repo — canonical S10-TR-13 uniqueness constraint |

#### Indexes present in prod that match migrations

- `compliance_rules_unique_rule` UNIQUE(jurisdiction, framework, rule_key) — migration 20260330 declares as inline UNIQUE constraint, prod materializes as unique index. **MIGRATION-AGREES**
- All `*_pkey` from PK declarations.

#### Index summary

- **10 indexes declared by migration 20260405, 0 in prod** — partial-execution (BLOCKER, new)
- **2 BLOCKER FK indexes missing entirely** (`documents.company_id`, `compliance_items.company_id`) — never declared
- **5 off-repo indexes** load-bearing for product invariants (NEQ uniqueness, requirement_key+framework uniqueness, feature_flags lookup, fiscal year uniqueness)

### §4.3 Triggers

```sql
SELECT tgname, tgrelid::regclass::text, pg_get_triggerdef(oid), tgenabled::text
FROM pg_trigger
WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
  AND tgname NOT LIKE 'RI_ConstraintTrigger%' AND tgname NOT LIKE 'pg_%';
```

**Result: only 2 user-defined triggers on public schema tables.**

| Trigger | Table | Function | Enabled | Source |
|---|---|---|---|---|
| `companies_updated_at` | `companies` | `set_updated_at()` | `O` | schema.sql:77–79 |
| `compliance_items_updated_at` | `compliance_items` | `set_updated_at()` | `O` | schema.sql:232–234 |

Function body:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
```

#### Functions: `update_updated_at_column` MISSING from prod

Migration `20260405` lines 137–148 declare:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column() ...
CREATE TRIGGER update_company_people_updated_at
  BEFORE UPDATE ON company_people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Verification:

```sql
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('set_updated_at', 'update_updated_at_column', 'handle_new_user');
```

**Result:** `set_updated_at` and `handle_new_user` exist; **`update_updated_at_column` does NOT exist in prod**. The migration's CREATE FUNCTION never executed; the CREATE TRIGGER consequently never executed (would have errored on missing function — confirming the partial-execution theory in §4.2).

**Severity: BLOCKER (corroborates §4.2).**

#### Triggers declared but missing (Type D)

| Declared | Source | Status |
|---|---|---|
| `update_company_people_updated_at` ON `company_people` | `20260405:145` | **NOT IN PROD** |

Practical impact: `company_people.updated_at` is never auto-bumped on UPDATE. Today the column is set on INSERT only (`DEFAULT NOW()`). Application code touching company_people would need to set `updated_at` explicitly — search target for follow-up.

#### Trigger summary

- 2 triggers in prod, both declared in schema.sql — clean
- 1 trigger declared in migration, 0 in prod — partial-execution evidence
- 1 function declared in migration, 0 in prod — same partial-execution
- schema.sql's `set_updated_at` function and 2 attaching triggers were applied via the `schema.sql` bootstrap path (explains why they landed even though `schema.sql` isn't registered as a migration)

### §4.4 RLS policies

```sql
SELECT schemaname, tablename, policyname, cmd, permissive, roles::text, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
```

#### RLS enable status

**All 20 public tables have `rls_enabled = true`. None have `rls_forced = true`.** No security finding on the RLS-enable axis.

(Note on `rls_forced=false`: Supabase's table owner is `postgres` and the service-role client uses `bypassrls`, so `rls_forced` is moot — application code uses anon/authenticated keys which always go through RLS.)

#### Policy inventory: 36 policies across 20 tables

| Table | Policies | Notable findings |
|---|---|---|
| `activity_log` | INSERT, SELECT (own via company) | off-repo; correct shape |
| `catch_up_sessions` | ALL (own via user_id) | off-repo |
| `companies` | SELECT, INSERT, UPDATE, DELETE (own) | matches schema.sql |
| `company_active_years` | SELECT, INSERT, DELETE (own via company) | off-repo; **no UPDATE policy** — acceptable for append/delete table |
| `company_fiscal_years` | ALL (own via company) | off-repo |
| `company_officers_deprecated` | SELECT, INSERT, UPDATE, DELETE | legacy; policies retained from schema.sql post-rename |
| `company_people` | ALL (own via company) | matches migration 20260405 |
| `compliance_items` | SELECT, INSERT, UPDATE (own via company) | matches schema.sql; **no DELETE policy** — write code cannot DELETE today |
| `compliance_rules` | SELECT (auth) — `compliance_rules_select_auth` | **MIGRATION-CONTRADICTS** — migration 20260330 declares `compliance_rules_read_all` with `USING (true)`. Prod has different name AND different qual (`auth.role() = 'authenticated'`). Prod matches schema.sql, not migration. Same pattern as the §1 compliance_rules shape disagreement: schema.sql ran first, migration 20260330's `IF NOT EXISTS`/`ON CONFLICT` was a no-op for the table+policy and only succeeded for the seed inserts. |
| `director_mandates` | ALL (own via company) | matches migration 20260405 |
| `document_templates` | SELECT (true — public read) | off-repo; dead table |
| `documents` | SELECT, INSERT, UPDATE, DELETE (own via company) | matches schema.sql |
| `feature_flags` | SELECT (true — public read) | off-repo; load-bearing |
| `minute_book_requirements` | SELECT (true — public read) | off-repo; load-bearing |
| `officer_appointments` | ALL (own via company) | matches migration 20260405 |
| `reminders` | SELECT, INSERT, UPDATE (own via company) | matches schema.sql; **no DELETE policy** |
| `req_enterprises` | SELECT (auth role) | off-repo; uses `{authenticated}` role explicitly (only table that does) |
| `share_classes` | ALL (own via company) | matches migration 20260405 |
| `shareholdings` | ALL (own via company) | matches migration 20260405 |
| `users` | SELECT, INSERT, UPDATE (own via id) | matches schema.sql; **no DELETE policy** |

#### Notable policy-level findings

- **No DELETE policy on `users`, `compliance_items`, `reminders`** — by design or oversight. App code cannot DELETE rows in these tables via the authenticated client. Sprint 10A should clarify intent.
- **`compliance_rules` policy mismatch** — prod-vs-migration disagreement (matches schema.sql's name+qual). Same pattern as the `compliance_items.status` CHECK in §4.1: prod followed schema.sql, not migration 20260330. Strong evidence that migration 20260330 was applied AFTER schema.sql and used `IF NOT EXISTS` / `CREATE POLICY` (no `OR REPLACE` available for policies) so the schema.sql state won.
- **`document_templates`, `feature_flags`, `minute_book_requirements`** all expose `SELECT USING (true)` — public read. Acceptable for read-only reference data, but worth documenting that these tables contain no PII and are intentionally world-readable.
- **`req_enterprises`** is the only public-schema policy targeting `{authenticated}` role explicitly. Functionally equivalent — anonymous clients can't satisfy any of the `auth.uid()`-based quals either way — but stylistic outlier.

#### RLS summary

- 20/20 tables have RLS enabled — **no security finding**
- 36 policies inventoried; 1 prod-vs-migration mismatch (`compliance_rules`) on top of the `compliance_items` mismatch already in §1
- 4 tables with no DELETE policy — verify intent before Sprint 10A

### §4.5 Extensions

Output of `mcp__supabase__list_extensions` (filtered to **installed** extensions only — `installed_version IS NOT NULL`):

| Extension | Version | Schema |
|---|---|---|
| `plpgsql` | 1.0 | `pg_catalog` (built-in) |
| `pgcrypto` | 1.3 | `extensions` |
| `uuid-ossp` | 1.1 | `extensions` |
| `supabase_vault` | 0.3.1 | `vault` |
| `pg_stat_statements` | 1.11 | `extensions` |

Many other extensions are *available* in the Supabase image (`postgis`, `vector`, `pg_cron`, `pg_net`, `pg_graphql`, etc.) but `installed_version` is null for all of them. Only the five above are actually installed.

#### Sprint 10A relevance

- **`uuid-ossp`** installed → `uuid_generate_v4()` available (used in schema.sql tables).
- **`pgcrypto`** installed → `gen_random_uuid()` available (used in migration 20260405 + 20260330 tables). Both UUID functions available; **prefer `gen_random_uuid()`** going forward — modern recommendation, and migration 20260405 already established it as the project pattern.
- **No `pg_cron`, no `pg_net`** — any "scheduled compliance reminder" feature will need an external scheduler (Supabase Scheduled Edge Functions or app-side cron). Not a blocker for Sprint 10A specifically.
- **No `vector`** — if AI gap-analysis ever moves to embedding-based retrieval, this extension would need to be installed first. AI summaries today are stored as `jsonb` (per §1's `documents.ai_summary_*`).

### §4.6 Updated Sprint 10A blockers

**Carried forward from §1–§3 (unchanged):**
1. `minute_book_requirements` table has no creating migration → BLOCKER
2. `company_fiscal_years` table has no creating migration → BLOCKER
3. `activity_log` table has no creating migration → BLOCKER
4. `feature_flags` seed has no migration → SILENT BREAK risk
5. `documents.requirement_key`, `requirement_year`, `signatories_confirmed` columns have no migration → SILENT BREAK risk
6. `compliance_rules` shape disagreement → BLOCKER (now corroborated by §4.4 policy mismatch — pattern is consistent)
7. `compliance_items.status` CHECK enum disagreement → BLOCKER (confirmed by §4.1 — prod enforces 4-value schema.sql enum, not migration 20260330's 3-value enum)

**New blockers surfaced by §4 (not in §1–§3):**

8. **Migration 20260405 partially executed** → **NEW BLOCKER**. Tables and CHECK constraints landed, but **10 indexes did not**, **`update_updated_at_column()` function did not**, and **`update_company_people_updated_at` trigger did not**. Phase 10A foundation backfill should include a "completion migration" for these missing pieces. Verify on apply that the migration history table doesn't already mark 20260405 as applied — if it does, the completion migration needs a new timestamp + `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` patterns.

9. **`documents.company_id` has no index** → **NEW BLOCKER (perf)**. Most-queried FK in the system; sequential scan on every documents-list query. Phase 10A should add `CREATE INDEX idx_documents_company_id ON documents(company_id)` as part of the documents-baseline migration.

10. **`compliance_items.company_id` has no index** → **NEW (perf)**. Same class of finding, lower traffic.

11. **`activity_log.event_type` 18-value CHECK is off-repo** → **NEW (silent break risk)**. The 18 values: `document_uploaded, document_generated, document_deleted, director_added, director_removed, officer_added, officer_removed, officer_replaced, shareholder_added, shares_issued, share_class_created, company_created, company_updated, fiscal_year_activated, fiscal_year_archived, compliance_item_completed, wizard_completed, settings_updated`. Sprint 7B Historique is locked feature; any new event-type added by S10A code without backfilling the CHECK will fail at insert. Phase 10A's activity_log creating-migration must reproduce this exact 18-value enum and document the canonical extension procedure.

12. **`documents` has 6 off-repo CHECK enums** (`document_type` via 20260329 = AGREES, `framework`, `language`, `minute_book_section`, `signature_status`, `source`). Three are declared in schema.sql but schema.sql is not a registered migration; three are entirely off-repo. Phase 10A's documents-baseline migration must declare all six explicitly.

13. **NEQ uniqueness is enforced by an off-repo partial unique index** (`idx_companies_neq_unique`). NEQ uniqueness is a product invariant referenced in onboarding, generation, and the `req_enterprises` lookup table. Phase 10A's companies-baseline migration must reproduce this index verbatim, including the partial `WHERE neq IS NOT NULL AND neq <> ''` clause.

**Updated severity ranking for Phase 10A foundation backfill order:**

1. Migration 20260405 completion (indexes + function + trigger) — execute first, smallest surface area, highest perf impact
2. `minute_book_requirements` table + seed (BLOCKER #1) — execute before any S10-TR-13 work
3. `documents` table baseline (columns + CHECKs + the missing `company_id` index) — execute before any documents-touching S10A code
4. `compliance_rules` reconciliation (drop migration 20260330's stale declaration, replace with the actual prod shape) — required before any compliance work
5. `compliance_items.status` enum reconciliation — same rationale
6. `activity_log` table baseline + 18-value CHECK + 2 off-repo indexes
7. `company_fiscal_years` table baseline + UNIQUE
8. `feature_flags` table baseline + seed + UNIQUE
9. `companies` baseline columns (NEQ, fiscal_year_end_*, corporation_number) + NEQ partial unique index
10. Lower-priority: `company_active_years` archive decision, `company_officers_deprecated` drop, `req_enterprises` wire-or-drop, `catch_up_sessions` retain-or-drop, `document_templates` wire-or-drop

Total: 13 Phase 10A foundation-backfill items. The brief's Batch 1 = "foundation backfill migrations" will land at minimum items 1–8; items 9–13 may slip to Batch 2 depending on Sprint 10A's actual touch surface.

---

End of §4.

---
**[2026-05-10 update — Batch 3 corrective ledger]**

Post-Batch-3 §4.6 status: closed = {#1, #2, #3, #4, #5, #8, #9, #11, #12} (9/13), open = {#6, #7, #10, #13} (4/13).

Phase A (Batch 3) surfaced 4 corrections to this document:
1. §1 implied a CHECK on `documents.status` — Phase A confirms none exists in prod. Migration 20260510134015 reproduces the column with default 'active' but no CHECK.
2. §4.6 #12 stated "6 off-repo CHECK enums on documents." Actual count is 3 (document_type committed via 20260329; framework + language committed via schema.sql:151–153). The 3 actually-off-repo CHECKs (minute_book_section, signature_status, source) are codified in 20260510134015.
3. §1 documents drift table is correct (17 net-new columns); the Sprint 10A Batch 3 brief listed only 8 plus `title`. `title` is committed in schema.sql:148 (false positive in brief).
4. Memory v3.41 §4.6 ledger listed wrong closed/open items. v3.42 corrects.

Canonical corrective ledger lives in `docs/audit-batch3-documents-drift-backfill-2026-05-10.md` §1–§2.
---
