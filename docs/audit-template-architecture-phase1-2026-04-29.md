# ZapOkay — Path C Phase 1 Architecture Audit

**Date:** 2026-04-29
**Author:** Claude Code (CC)
**Status:** Investigation complete. All six Phase 1 decisions LOCKED. Phase 2 unblocked except for F8 (auditor-waiver placement, product decision required for `annual_shareholder` content drafting).
**Memory version at time of audit:** v3.27
**Recommendation doc:** `docs/template-architecture-recommendation-2026-04-29.md`
**Findings doc:** `docs/fr-pdf-findings-2026-04-29.md` (F1-F8 source-of-truth)

---

## 0. Executive Summary

The `document_templates` table holds **4 rows**, all seeded in a single event on 2026-04-04, all `status='draft'`, all `template_body_fr` AND `template_body_en` populated. Repo-wide grep confirms **zero production code references** to the table — it is fully orphaned from runtime, and is also absent from `supabase/schema.sql` and every tracked migration. Its schema, however, is sound: bilingual columns, validation audit-trail columns (`validated_at` / `validated_by` / `validation_notes`), and versioning columns (`deprecated_at` / `effective_date`) are all present.

The `lib/pdf-templates/*` directory (7 files, 771 lines) contains **zero legal-text content**. All structural, label, and layout code lives there; resolution body text arrives via the `resolutions[]` prop. The actual current source of legal text is a hardcoded inline FR-only dictionary at **`lib/pdf/generatePdfDocument.ts:62-89` — function `getResolutionsForType()`**. This single function is the migration target. The 6 known callers (1 API route, 3 UI components, 2 orchestration files) sit upstream of this function and **do not change** under Path C.

**Two findings reframe the migration scope:**
1. **EN rendering is broken in production today.** `getResolutionsForType()` has no `language === 'en'` branch — generating an EN PDF currently produces an EN shell wrapping FR resolution body text. The 4 existing DB rows already have populated `template_body_en` (stub-tier but salvageable). **Path C migration fixes EN rendering as a side-effect** — bilingual UI epic and Path C are more coupled than the recommendation doc anticipated. Section 9 calls this out as out-of-band.
2. **Phase 2 cost dominates; Phase 3 cost shrinks.** The recommendation doc framed Phase 2 as "extract legal text from templates" and Phase 3 as "renderer refactor (~2 days)." Phase B inverted this: there's nothing in templates to extract. Phase 3 is one function migration plus a Mustache helper plus 4 structural F-finding fixes (~1-1.5 days). Phase 2 is dominated by lawyer-review of 4 existing rows + drafting **8 net-new rows** for the 4 resolution types missing from the DB (founding_board, founding_shareholder, share_subscription, auditor_waiver) × 2 frameworks each (~5-7 days, depending on lawyer SLA).

**All six Phase 1 decisions LOCKED** (Section 8). E.2 (Mustache `{{var}}`), E.3 (content/layout boundary), E.6 (`document_type` resolution/pv alignment), E.1 (Markdown content format), E.4 (retain + migrate the 4 rows), E.5 (soft-validation workflow for v1.0).

**Top risks:** (1) F8 (auditor-waiver placement) is a product decision that **blocks Phase 2** drafting of `annual_shareholder` content. (2) The `document_templates` schema is not in `supabase/schema.sql` — Sprint 10 schema work must include tracking it. (3) F3 (share-class bilingual rendering) requires a `share_classes` schema migration and is **out of scope for Path C**; it stays open as a separate epic.

---

## 1. Scope & Methodology

Investigation-only Phase 1 audit per the brief at the top of this conversation (April 29, 2026 evening session). No code changes, no schema changes, no F-finding fixes.

**Sources:**
- Brief (in conversation, April 29 evening, Dom)
- Recommendation doc — `docs/template-architecture-recommendation-2026-04-29.md` (committed earlier April 29)
- F1-F8 source — `docs/fr-pdf-findings-2026-04-29.md` (committed during this audit, commit 9c11669)

**Phase A — DB state (~30 min):**
- Read-only Node script `scripts/audit-document-templates.mjs` (uncommitted; see Section 11 for disposition question). Executes 1 GET against `/rest/v1/document_templates` via Supabase REST + service-role key, computes A.2 / A.3 aggregates in JS (REST has no generic `GROUP BY` without a stored function; investigation-only discipline forbade creating one).
- A.4 ran as separate Grep over `*.{ts,tsx}` plus widened repo-wide sweep, plus targeted check of `supabase/schema.sql` and `supabase/migrations/`.

**Phase B — Code inventory (~1 hour):** Read all 7 files in `lib/pdf-templates/` end-to-end. Per-file STRUCTURAL / CONTENT / VARIABLE / HYBRID classification. Substitution-pattern survey. Cross-file dependency mapping.

**Phase C — Orchestration (~45 min):** Read `lib/pdf/generatePDF.ts`, `lib/pdf/generatePdfDocument.ts`, `lib/pdf-generator.ts`, the 4 caller files (1 API route + 3 UI components). Traced the call chain end-to-end. Verified `app/api/wizard/**` deletion.

**Phase D — F1-F8 classification (~30 min):** Cross-referenced each finding against source location identified in Phases B and C. Classified as content / structural / architectural / open product question, mapped to Phase 2 or 3.

**Phase E — Decisions (~45 min):** Surfaced 6 decision points with options + tradeoffs + recommendations. All 6 locked across the four-checkpoint walkthrough.

**Excluded by brief Section 2.2 (out of scope):** Sprint 10 temporal registry, Sprint 11 event-based audit rules, bilingual UI completeness epic, EN content drafting, lawyer review process design, performance benchmarking, refactor design, re-debating Path C.

**Note on conflict between brief and recommendation doc:** No substantive conflicts found. Two minor reframings: (a) brief framed `lib/pdf-templates/*` as "small system, not sprawling" (recommendation §2.2) and "Content (legal body text...) is interleaved with layout code" — the second part is **wrong**; templates contain no legal text. Phase B documents this. (b) Brief Phase 5 estimate "F1-F8 fixes folded in (~1 day)" stands but should be split: F4/F6 fold into Phase 2 (content drafting), F1/F2/F5/F7 fold into Phase 3 (renderer), F3 is out-of-scope, F8 is a product decision.

---

## 2. `document_templates` Table Audit

### 2.1 Row inventory (A.1)

All 4 rows seeded simultaneously at `2026-04-04T03:33:15.228016+00:00`. All `status='draft'`. All `validated_at`, `validated_by`, `validation_notes`, `deprecated_at`, `effective_date` are NULL. All `created_at == updated_at` (untouched since seed).

| `template_key` | `framework` | `jurisdiction` | `document_type` | FR body sections | EN body sections |
|---|---|---|---|---|---|
| `annual_board_resolution_lsaq` | LSA | QC | resolution | Approbation états financiers; Confirmation des dirigeants; Nomination experts-comptables | Approval of FS; Confirmation of officers; Appointment of accountants |
| `annual_shareholder_resolution_lsaq` | LSA | QC | pv | Ratification actes du conseil; Élection administrateurs; Dispense vérificateur (cites LSAQ implicitly) | Ratification of board acts; Election of directors; Waiver of auditor (cites Business Corporations Act of Quebec) |
| `annual_board_resolution_cbca` | CBCA | CA | resolution | Approbation états financiers; Confirmation des dirigeants; Dispense vérificateur (cites art. 163 LCSA) | Approval of FS; Confirmation of officers; Waiver of auditor (cites s. 163 CBCA) |
| `annual_shareholder_resolution_cbca` | CBCA | CA | pv | Ratification actes du conseil; Élection administrateurs; Rapport annuel | Ratification of board acts; Election of directors; Annual return |

**EN content quality assessment:** stub-tier ("the undersigned, being the sole director of the corporation, resolves as follows") — clearly machine-translated or template-author drafted, not lawyer-reviewed. Salvageable as Phase 2 starting point per E.4 lock; not lawyer-grade.

### 2.2 Per-column population (A.2)

```
total_rows: 4
has_template_key: 4    has_title_fr: 4         has_title_en: 4
has_template_body_fr: 4    has_template_body_en: 4    has_variables: 4
has_validated_at: 0    has_deprecated_at: 0    has_effective_date: 0
distinct frameworks: 2 [LSA, CBCA]
distinct jurisdictions: 2 [QC, CA]
distinct document_types: 2 [resolution, pv]
distinct statuses: 1 [draft]
```

All bilingual columns populated. Zero validation audit trail. Zero versioning. All `draft`.

### 2.3 Distribution (A.3)

Perfect 1-row-per-tuple split:
- (draft, LSA, QC, resolution): 1
- (draft, LSA, QC, pv): 1
- (draft, CBCA, CA, resolution): 1
- (draft, CBCA, CA, pv): 1

No duplicates, no orphans, no gaps within the 4-row coverage.

### 2.4 Code references (A.4)

**Zero references** in `*.ts`/`*.tsx`. Repo-wide hits:
- `scripts/audit-document-templates.mjs` (created during this audit)
- `docs/template-architecture-recommendation-2026-04-29.md`
- `docs/audit-phase-4d-stream-1-2026-04-22.md`

**Not in `supabase/schema.sql`. Not in any of 4 tracked migrations.** The table was created out-of-band (Supabase dashboard, presumably). See Section 9.

### 2.5 Variables JSONB structure

All 4 rows store a wrapper key:
```json
{ "variables": [ { "key": "...", "source": "...", "label_fr": "..." }, ... ] }
```

Two levels of `variables` (column name + wrapper key). Wrapper is unnecessary; flag for cleanup at next row migration.

**`label_en` is missing on every variable definition.** Variable metadata is FR-only despite body content being bilingual. Bilingual gap.

**`source` paths are FR-only:** e.g., `companies.legal_name_fr`. No locale-aware source resolution defined. Architectural finding — Path C variable substitution layer must either (a) per-locale resolve sources at render time or (b) extend variable definitions with `source_fr` / `source_en`.

### 2.6 Variable usage by row

Every row uses `{{company_name}}`, `{{fiscal_year_end_date}}`, `{{director_name}}`, `{{resolution_date}}`. Board rows additionally use `{{officer_name}}`, `{{officer_role}}`. Shareholder rows additionally use `{{shareholder_name}}`. Six unique variables across the corpus.

### 2.7 LSA vs LSAQ naming

DB stores `framework='LSA'`. Orchestrator computes `LSA` (`generatePdfDocument.ts:208`). Brief, recommendation doc, memory, and CLAUDE.md all use `LSAQ`. Inconsistency to reconcile in docs (DB is the system of record). See Section 9.

---

## 3. `lib/pdf-templates/*` Code Inventory

### 3.1 Per-file content classification (B.1)

| File | Lines | Class breakdown | Notable embedded content |
|---|---|---|---|
| `index.ts` | 14 | 100% structural (re-exports) | None. `signature-blocks` re-export missing — internal use only. |
| `base-layout.ts` | 274 | ~95% structural; 2 inline FR/EN ternaries | `confidential` ("Confidentiel — Usage interne"), `generatedOnLabel` ("Généré le"). Both labels, not legal content. |
| `cover-page.ts` | 123 | ~85% structural; 4 inline FR/EN/bilingual ternaries | `confidential`, `preparedLabel`, `dateLabel`, `generatedLabel` (e.g., "Generated via ZapOkay — Digital Minute Book"). Labels + brand. Zero legal text. |
| `signature-blocks.ts` | 46 | ~90% structural | 2 labels: `dateLabel` ("Date"), `sectionLabel` ("Authorized Signatures" / "Signatures autorisées"). |
| `resolution-board.ts` | 85 | ~70% structural; LABELS dict (5 keys × 3 locales) | Labels: title, subtitle, "IL EST RÉSOLU QUE :", sigLabel, date. **No legal body text** — body arrives via `data.resolutions[].body` prop. |
| `resolution-shareholder.ts` | 88 | ~70% structural; LABELS dict (6 keys × 3 locales) | Labels including `sharesLabel`. **No legal body text** — body arrives via `data.resolutions[].body` prop. |
| `annual-register.ts` | 141 | ~80% structural; LABELS dict (13 keys × 3 locales) | Column headers + section titles. **Tabular/data-driven, no recital text** — does not fit `template_body_*` shape. |

**Headline finding: zero legal-recital text in any of the 7 files.** All "content" is labels (UI strings + brand) or data-driven (`annual-register` reads from runtime data structures). Body content for resolutions arrives entirely via the `resolutions[]` prop sourced from upstream code (Section 4).

### 3.2 Substitution patterns (B.2)

Four distinct mechanisms in code, **disjoint** from DB-side Mustache:

| Pattern | Where | Example |
|---|---|---|
| JS template-literal prop interpolation | All 7 files | `${escapeHtml(data.companyName)}` |
| Locale-keyed labels dict | `resolution-board`, `resolution-shareholder`, `annual-register` | `LABELS[data.language].title` |
| Inline FR/EN/bilingual ternary | `base-layout`, `cover-page`, `signature-blocks`, one in `annual-register:126` | `data.language === 'en' ? 'X' : 'Y'` |
| Mustache `{{var}}` | **Only the 4 DB rows.** Zero occurrences in code. | `{{company_name}}` |

**The Mustache substitution layer does not exist in code.** Phase 3 must add one. See Section 7 for the recommended order of operations.

### 3.3 Cross-file dependency graph (B.3)

```
index.ts ─── re-exports ──► base, cover, board, shareholder, register
                            (signature-blocks intentionally not re-exported)

base-layout.ts ◄── imports baseLayoutHTML / escapeHtml ── cover, board, shareholder, register
signature-blocks.ts ◄── imports signatureBlocksHTML ── board, shareholder
                                                      (NOT register — registers don't sign)
```

No cycles. `base-layout` is universal. `signature-blocks` shared by the two resolution templates only.

### 3.4 The `bilingual` mode

All renderers accept `language: 'fr' | 'en' | 'bilingual'` and produce interleaved bilingual output for the third value ("Préparé pour / Prepared for"). **The orchestrator narrows the type to `'fr' | 'en'`** (`generatePdfDocument.ts:117`), making `bilingual` mode unreachable in production. Dead code today. See Section 11 — deprecate or implement is a Phase 1-adjacent question that did not block any decision.

### 3.5 CLAUDE.md bilingual convention violations

Eight inline `data.language === 'en' ? 'X' : 'Y'` ternaries across 4 files in `lib/pdf-templates/*` exactly match the pattern CLAUDE.md says "NEVER." The convention is UI-scoped (`useTranslations()`) but the spirit is universal. PDF rendering is server-side; alignment would use `next-intl`'s `getTranslations` server helper. See Section 9.

---

## 4. Generation Orchestration Map

### 4.1 The migration target

**`lib/pdf/generatePdfDocument.ts:62-89` — function `getResolutionsForType()`** is a hardcoded inline FR-only dictionary. Reproduced shape:

```ts
function getResolutionsForType(resolutionType: string): Resolution[] {
  const map: Record<string, Resolution[]> = {
    founding_board:        [...3 resolutions, FR only...],
    founding_shareholder:  [...3 resolutions, FR only...],
    share_subscription:    [...1 resolution, FR only...],
    annual_board:          [...1 resolution, FR only...],
    annual_shareholder:    [...2 resolutions, FR only...],
    auditor_waiver:        [...1 resolution, FR only...],
  };
  return map[resolutionType] ?? [{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.' }];
}
```

This is the **single Path C insertion point**. Under Path C, the function becomes a DB lookup against `document_templates` keyed by `template_key` derived from `resolutionType + framework`.

### 4.2 Call chain

```
GenerateDocumentButton.tsx (UI button)
  └─► useGenerateWithSignatories.ts (POST hook)
        └─► POST /api/minute-book/generate-item    ◄── only HTTP entry point
              └─► generatePdfDocument()                  lib/pdf/generatePdfDocument.ts
                    ├─ load requirement (minute_book_requirements)
                    ├─ load company
                    ├─ load directors / shareholders (current state)
                    ├─ getResolutionsForType()           ◄── ★ Path C insertion
                    └─► generatePDF()                    lib/pdf/generatePDF.ts (adapter)
                          └─► boardResolutionHTML / shareholderResolutionHTML / coverPageHTML
                                └─► baseLayoutHTML
                                      └─► (HTML string)
                                            └─► renderPDF()  lib/pdf-generator.ts (Puppeteer)
                                                  └─► (PDF buffer)
                                                        └─► Supabase Storage upload
                                                              └─► documents row insert
                                                                    └─► activity_log
```

### 4.3 REQUIREMENT_MAP coverage

`generatePdfDocument.ts:39-54` maps **12 `requirement_key`s → 6 unique `resolutionType`s**:

| resolutionType | requirement_keys | Has DB row? |
|---|---|---|
| `founding_board` | `lsaq_premiere_resolution_ca`, `cbca_first_board_resolution` | **No** |
| `founding_shareholder` | `lsaq_premiere_resolution_actionnaires`, `cbca_first_shareholder_resolution` | **No** |
| `share_subscription` | `lsaq_souscription_actions`, `cbca_share_subscription` | **No** |
| `annual_board` | `lsaq_annual_board_resolution`, `cbca_annual_board_resolution` | **Yes (×2)** |
| `annual_shareholder` | `lsaq_annual_shareholder_resolution`, `cbca_annual_shareholder_resolution` | **Yes (×2)** |
| `auditor_waiver` | `lsaq_auditor_waiver`, `cbca_auditor_waiver` | **No** |

**Coverage is 33%** (4 of 12 requirement keys have a DB precursor). Phase 2 must draft 8 net-new rows minimum (4 missing types × 2 frameworks).

### 4.4 Storage / output layer (C.3)

- `lib/pdf-generator.ts` (96 lines) — Puppeteer + headless Chrome. Unchanged by Path C.
- Storage: Supabase `documents` bucket, path `${companyId}/${requirementKey}_${sanitizedName}_${date}.pdf` (`generatePdfDocument.ts:222-236`). Unchanged.
- DB write: `documents` table insert (`generatePdfDocument.ts:239-261`). Path C affects only `document_type` column under E.6 lock — orchestrator must return `'pv'` for shareholder docs.
- Activity log: `document_generated` event (`generatePdfDocument.ts:271-279`). Unchanged.

### 4.5 Architectural details

- **`framework` is dead pass-through.** Computed at `generatePdfDocument.ts:208`, passed into `templateData`, but neither `BoardResolutionData` nor `ShareholderResolutionData` declares a `framework` field. Templates ignore it. **Today's CBCA and LSAQ resolutions render identical body text.** Path C makes framework distinction live for the first time (DB lookup keyed by `template_key` which encodes framework). Phase 3 regression-test risk — see Section 9.
- **`mapToDocumentType()` always returns `'resolution'`** (`generatePdfDocument.ts:91-93`). Per E.6 lock, this changes in Phase 3 to return `'pv'` for shareholder types.
- **Silent fallback at line 88.** Unrecognized resolution types render a one-line stub ("La résolution est adoptée."). Currently dead (REQUIREMENT_MAP only feeds known types) but Section 9 — preserve under Path C as defensive code.
- **Orchestrator is FR-only.** `getResolutionsForType()` has no `language === 'en'` branch despite the function being called inside a flow that accepts `language: 'fr' | 'en'`. EN PDFs today render FR body text inside an EN shell. Section 9 — broken EN rendering.
- **Stale docstring** at lines 1-22 references the deleted `/api/wizard/generate` route (Phase 4d Stream 3, commit 7698bda). Section 9 cosmetic.

---

## 5. The 6 Known Callers — Adaptation Matrix

| Caller | Role | What it imports / calls | Path C adaptation |
|---|---|---|---|
| `app/api/minute-book/generate-item/route.ts` | API entry point | Auth via Supabase server client; service-role admin client; delegates to `generatePdfDocument` | **None** — payload pass-through |
| `components/documents/SignatoriesModal.tsx` | UI signatory picker | Fetches `/api/documents/signatories`; renders checkboxes; emits `Signatory[]` | **None** — content-agnostic |
| `components/documents/useGenerateWithSignatories.ts` | POST hook | Calls `/api/minute-book/generate-item` | **None** — payload pass-through |
| `components/documents/GenerateDocumentButton.tsx` | UI button | Pre-checks signatories; opens modal or generates directly | **None** — content-agnostic |
| `lib/pdf/generatePDF.ts` | Renderer adapter | Dispatches `{type, data}` to template HTML functions | **None** — switch case unchanged; templates still receive `resolutions[]` from caller |
| `lib/pdf/generatePdfDocument.ts` | Orchestrator | Loads context; **currently calls `getResolutionsForType()` for body**; renders + uploads + inserts | **All Path C work lives here.** Replace `getResolutionsForType()` with DB lookup; add Mustache substitution; align `mapToDocumentType()` per E.6. |

**Net Path C adaptation surface: one file (`generatePdfDocument.ts`).** No caller changes required.

**CLAUDE.md cross-reference:** all 4 caller files (the 3 UI components + the route) violate the bilingual convention with hardcoded FR strings or `locale === 'fr' ? '...' : '...'` ternaries. Out of scope for Path C; flagged in Section 9 for the bilingual UI epic.

---

## 6. F1-F8 Classification

Findings are sourced from `docs/fr-pdf-findings-2026-04-29.md` (verbatim list). Classification per Phase D, with traces back to Phases B and C.

| F# | Severity | Source location | Class | Phase |
|---|---|---|---|---|
| **F1** | High | `base-layout.ts:32-33` (label "Généré le") + `:262` (footer slot) + `:6-10` (acknowledged-but-unfixed comment). Slot fed `data.resolutionDate` from `resolution-{board,shareholder}.ts:80,83`. | Structural | **Phase 3** |
| **F2** | Medium | `resolution-shareholder.ts:21` `sigLabel: 'Actionnaire'` + mirror in `resolution-board.ts:21` `'Administrateur'`. Manifests only in no-signatories fallback path (`:59-70` / `:56-67`); modal-driven path uses `signature-blocks.ts:32` `'Signatures autorisées'` (already plural). | Structural | **Phase 3** |
| **F3** | Med/Arch | `share_classes.name TEXT NOT NULL` — single-column schema (`supabase/migrations/20260405_sprint6_people_ownership.sql:88`). Bilingual content user-entered into a monolingual column. Renderer outputs verbatim (`generatePdfDocument.ts:184,190`). | Architectural — **NOT Path C** | **Out of scope.** Separate `share_classes` schema migration epic. |
| **F4** | Medium | `getResolutionsForType().annual_shareholder` (`generatePdfDocument.ts:80-83`) — only 2 sections. DB row `annual_shareholder_resolution_lsaq` is richer (3 sections), still missing F4's expected items (director election/re-election, officer confirmation, Art. 354 statement). | Content | **Phase 2** |
| **F5** | Low | `base-layout.ts:27-30` — static `confidential` label, not document-type aware. | Structural | **Phase 3** |
| **F6** | Low | `getResolutionsForType()` FR-only fallbacks have generic "Conformément à la loi applicable" without article numbers (`generatePdfDocument.ts:72,82,85`). Compare DB row `annual_board_resolution_cbca` which cites "art. 163 LCSA" — DB richer. | Content | **Phase 2** |
| **F7** | Low | `base-layout.ts:259-263` footer has no document-ID or template-version fields; `effectiveDate` slot is misused for `resolutionDate` (see F1). Fix requires `BaseLayoutData` extension + pre-generating UUID before render in `generatePdfDocument.ts` (currently `documents.id` materialized only at insert step, after render). | Structural (+ small architectural — order-of-ops change in orchestrator) | **Phase 3** (`templateVersion` field meaningful only post-Path C) |
| **F8** | Open | Embedded clause in `getResolutionsForType().annual_shareholder[1]` ("Dispense de vérificateur") AND standalone via `auditor_waiver` resolutionType (`generatePdfDocument.ts:84-86`) AND independent requirement keys `lsaq_auditor_waiver` / `cbca_auditor_waiver` (`:46,53`). **Code state: BOTH today.** | Product decision | **Blocks Phase 2** annual_shareholder content drafting |

### 6.1 Phase 2 starting state per finding

Per Dom directive: Phase 2 content drafting starts from the **better of (inline dict, existing DB row)**, then improves under lawyer review.

| Type | Inline dict source (`generatePdfDocument.ts`) | Existing DB row | Phase 2 starting state |
|---|---|---|---|
| `annual_board` | 1 section, FR-only, no statutory ref | 3 sections × FR + EN, art. 163 LCSA cited (CBCA row) | **DB row** |
| `annual_shareholder` | 2 sections, FR-only, generic "loi applicable" | 3 sections × FR + EN, "Business Corporations Act of Quebec" cited | **DB row** (blocked on F8) |
| `founding_board` | 3 sections, FR-only | None | **Inline dict** + lawyer drafting |
| `founding_shareholder` | 3 sections, FR-only | None | **Inline dict** + lawyer drafting |
| `share_subscription` | 1 section, FR-only | None | **Inline dict** + lawyer drafting |
| `auditor_waiver` | 1 section, FR-only | None | **Inline dict** + lawyer drafting |

### 6.2 Cross-finding observations

- **F1 + F7 are coupled.** The `effectiveDate` slot is misused as resolutionDate. Fixing F1 (rename slot or relabel) unblocks F7 (slot becomes available for the actual generation timestamp). Phase 3 should fix together.
- **F2 fix should cover both `Actionnaire`→`Actionnaire(s)` AND `Administrateur`→`Administrateur(s)`** symmetrically. Per CLAUDE.md, FR plurals should use ICU `=0` clauses; this is server-side PDF rendering without `next-intl`. Recommended approach for v1.0: small inline pluralization helper. Full ICU migration aligns with the broader bilingual UI epic.
- **F4 + F6 improve as Path C side-effects** before lawyer review, because DB rows are already richer than the inline dict. Phase 2 starts from "better of two," not "draft from scratch" — for the 2 resolution types that have DB rows.

---

## 7. Variable Substitution Pattern Findings

### 7.1 Current state

| Layer | Pattern | Coverage |
|---|---|---|
| `lib/pdf-templates/*` (rendering) | JS template literals + locale-keyed LABELS dicts | All 7 files |
| `lib/pdf/generatePdfDocument.ts` (orchestration) | JS object construction, `templateData.resolutions = [...]` | Single file |
| `document_templates` table (DB rows) | Mustache `{{variable_name}}` | All 4 rows |
| Mustache replacement layer | **DOES NOT EXIST** | Zero locations |

The code-side and DB-side patterns are not "different versions of the same thing" — they are two different layers, with the connecting Mustache replacement layer entirely absent from the codebase today.

### 7.2 Path C order of operations (Phase 3)

The renderer must process variables before Markdown rendering, otherwise variable values containing brackets or special characters could be partially eaten by Markdown's link/anchor parsing. Recommended pipeline for resolution body text:

```
1. Fetch row by template_key from document_templates
2. Pick body = template_body_fr OR template_body_en per request locale
3. Mustache substitute: body.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] ?? '')
4. Markdown render (per E.1 — `marked` or similar, ~3kB)
5. HTML escape any user-supplied variable values BEFORE step 3 (defense in depth)
6. Wrap in resolution-board.ts / resolution-shareholder.ts layout with title/labels from LABELS dict
7. Wrap in baseLayoutHTML
8. Render via Puppeteer
```

### 7.3 Recommended substitution helper

Single inline replacer is sufficient — DB rows don't use sections, lambdas, or partials:

```ts
function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
```

(Returns the original token on missing key for fail-loud behavior — easier to spot in QA than silent empty strings.)

No external Mustache library required for this codebase.

---

## 8. Decisions Required Before Phase 2

All six decisions LOCKED via the four-checkpoint Phase 1 walkthrough.

### E.1 — Content format for `template_body_fr` / `_en`: **LOCKED — Markdown**

**Rationale:** Existing 4 rows already use plain text with `\n\n` paragraph breaks, which is valid Markdown — zero migration cost on existing rows. Markdown adds formatting headroom (`**bold**`, `- lists`, headings) for richer Phase 2 templates without constraining lawyer review (Word↔Markdown roundtrips natively in Office 365 and via pandoc for older Word). Constrained HTML rejected because hostile to lawyer redlining (recommendation doc §3 Path B).

**Implementation note:** Phase 3 renderer pipeline (Section 7.2) runs Mustache substitution before Markdown rendering.

### E.2 — Variable substitution syntax: **LOCKED — Mustache `{{variable_name}}`**

**Rationale:** Existing 4 rows already use `{{var}}` exclusively. Switching to ICU MessageFormat would require rewriting 4 row bodies for zero architectural gain. ICU is overkill for resolution body text — plurals/selects are extremely rare in legal templates per recommendation doc §7. Mustache is well-known to non-developers (lawyers won't trip), simple, doesn't conflict with Markdown.

**Implementation note:** No external library required; inline replacer per Section 7.3.

### E.3 — Content/layout boundary: **LOCKED**

| File / surface | Verdict | Rationale |
|---|---|---|
| `lib/pdf-templates/base-layout.ts` | Stays code | Pure HTML/CSS shell |
| `lib/pdf-templates/signature-blocks.ts` | Stays code | Layout component, label-only |
| `lib/pdf-templates/cover-page.ts` | Move labels to `messages/*.json` | All "content" is labels + brand, no legal text. Aligns with CLAUDE.md bilingual convention. |
| `lib/pdf-templates/annual-register.ts` | Stays code (data-driven) | Tabular registry, no recital text |
| `lib/pdf-templates/resolution-board.ts` | Stays code (LABELS only); body via DB | Body content arrives via `resolutions[]` prop sourced from DB rows under Path C |
| `lib/pdf-templates/resolution-shareholder.ts` | Stays code (LABELS only); body via DB | Same |
| `getResolutionsForType()` in `generatePdfDocument.ts:62-89` | **Migrates to DB lookup** | THE Path C migration target |

Boundary rule: **only legal-recital body text migrates to `template_body_*`**. Labels, structural layout, and tabular data stay in code or `messages/*.json`. Only `document_type IN ('resolution', 'pv')` rows live in DB.

### E.4 — Disposition of current 4 rows: **LOCKED — retain + migrate**

**Rationale:** Existing EN content is stub-tier but salvageable as Phase 2 lawyer-review starting point. Throwing it away creates re-authoring work for content that already exists. Phase 2 work = (a) lawyer-review the 4 existing rows with `validated_at`/`validated_by` populated on approval; (b) draft 8 net-new rows for the 4 missing resolution types × 2 frameworks (`founding_board`, `founding_shareholder`, `share_subscription`, `auditor_waiver`). Total post-migration: minimum 12 rows.

**Sub-decision:** auditor_waiver row count depends on F8 resolution. If kept embedded only, no waiver-specific rows. If kept standalone only or both, 1-2 waiver-specific rows.

**Sub-decision:** `LSA` framework value is the system of record. Documentation and memory should align to `LSA` (not `LSAQ`). See Section 9.

### E.5 — `validated_at` / `validated_by` workflow: **LOCKED — soft indicator for v1.0**

**Rationale:** Code uses any row regardless of validation status; admin UI badges non-validated rows ("draft" pill). Audit trail preserved without launch blocker. Phase 4 (export/import tooling) populates `validated_at` systematically as part of the lawyer roundtrip. v1.1 can promote to gating once review cadence stabilizes.

**Sub-decisions:**
- `validated_by` content: free-text `TEXT` (lawyer name + firm, e.g., `"Me Marie Tremblay, Dunton Rainville LLP"`), distinct from `auth.uid` of the admin who imported the lawyer-approved version. Admin's ID can go in `validation_notes`.
- `validation_notes`: free-text. Captures session date, scope of review, redline reference.
- Review cadence: per-template-version (using `effective_date`), not per-row-update. Small typo fixes don't trigger full re-review.

### E.6 — `document_type` taxonomy alignment: **LOCKED — Option 1 (align to resolution/pv split)**

**Rationale:** ZapOkay's product promise is compliance accuracy. A founder filtering Coffre-fort should see the same taxonomy a lawyer would name (procès-verbaux d'actionnaires vs résolutions du conseil). Decoupling is architecturally cheaper but creates ongoing "explain the divergence" cost.

**Phase 3 work scope:**
1. `mapToDocumentType()` in `generatePdfDocument.ts:91-93` returns `'pv'` for `'shareholder-resolution'` type, `'resolution'` for `'board-resolution'` type (3 lines).
2. `documents.document_type` CHECK constraint expansion to allow `'pv'` (1 migration file).
3. One-time backfill: `UPDATE documents SET document_type = 'pv' WHERE source = 'generated' AND requirement_key LIKE '%shareholder%'` (or equivalent — verify pattern in Phase 3).

Estimated half-day Phase 3 work.

---

## 9. Findings Requiring Out-of-Band Attention

Items that surfaced during this investigation that should be tracked separately from Path C Phase 2-5 execution.

### 9.1 Out-of-band schema state — `document_templates` not in repo (HIGHEST PRIORITY)

The `document_templates` table exists in production Supabase but is absent from `supabase/schema.sql` and every tracked migration file. The table was created out-of-band (Supabase dashboard, presumably). **Sprint 10 schema migration must include "track `document_templates` in `supabase/schema.sql`" as a follow-up task** — not blocking Path C Phase 2, but blocking long-term schema integrity.

### 9.2 Broken EN rendering today

`getResolutionsForType()` is FR-only. Generating an EN PDF today produces an EN shell wrapping FR resolution body text. The 4 existing DB rows already have populated `template_body_en` (stub-tier, salvageable). **Path C migration fixes this as a side-effect** — it's the strongest practical argument for sequencing Path C ahead of any other v1.1 EN content work. Should be flagged prominently in launch-readiness assessments.

### 9.3 Stale docstring referencing deleted wizard route

`lib/pdf/generatePdfDocument.ts:1-22` docstring references `/api/wizard/generate`, deleted in Phase 4d Stream 3 (commit 7698bda). Cosmetic. Fix during Phase 3 alongside the orchestrator changes — not its own commit.

### 9.4 CLAUDE.md bilingual convention violations beyond `lib/pdf-templates/*`

The bilingual UI epic surface is wider than `lib/pdf-templates/*`. Confirmed violations:
- `components/documents/SignatoriesModal.tsx` — `const fr = locale === 'fr'` + ternaries (lines 33, 104-109, 141, 157, 199, 212, 227)
- `components/documents/GenerateDocumentButton.tsx` — same pattern (lines 36, 88-91)
- `components/documents/useGenerateWithSignatories.ts` — hardcoded FR error string (line 39)
- `app/api/minute-book/generate-item/route.ts` — hardcoded FR strings (lines 24, 48, 93)
- `lib/pdf/generatePdfDocument.ts` — hardcoded FR strings (lines 141, 156, 276)
- 8 inline FR/EN/bilingual ternaries across 4 `lib/pdf-templates/*` files

**Out of scope for Path C.** Tracked here so the bilingual UI epic owner sees the full surface.

### 9.5 LSA vs LSAQ naming inconsistency

DB stores `framework='LSA'`. Orchestrator computes `LSA`. Brief, recommendation doc, memory, and CLAUDE.md use `LSAQ`. **DB is the system of record** — align documentation to `LSA` (less data churn). One-pass docs cleanup; not a blocker.

### 9.6 `framework` is dead pass-through in templates

`generatePdfDocument.ts:208` passes `framework` into `templateData`, but renderers ignore it. Today's CBCA and LSAQ resolutions render identical body text. **Phase 3 regression test:** verify framework-distinct outputs for the same resolution type post-Path C — this is a behavior change, not just a code-organization change.

### 9.7 Silent fallback at `generatePdfDocument.ts:88`

`map[resolutionType] ?? [{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.' }]` — unrecognized resolution types render a one-line stub. Currently dead code (REQUIREMENT_MAP only feeds known types). **Preserve under Path C** as defensive code; consider hard-error in dev environments.

### 9.8 `variables` JSONB wrapper key

All 4 rows store `{ "variables": [...] }` (column-name + wrapper-key collision). Wrapper is unnecessary. Cleanup at Phase 4 export/import tooling time — easier to fix when the row write path is being touched anyway.

### 9.9 Variable definitions FR-only despite bilingual bodies

`label_en` missing from every variable definition; `source` paths are FR-only (`companies.legal_name_fr`). Path C variable substitution layer must either per-locale resolve sources or extend variable definitions with `source_fr` / `source_en`. Phase 3 design point.

### 9.10 `bilingual` mode is dead code

All renderers support `language: 'fr' | 'en' | 'bilingual'` but the orchestrator narrows to `'fr' | 'en'`. `bilingual` mode is unreachable in production. Open: deprecate the third arm or wire it through. See Section 11.

### 9.11 Cosmetic plural quirk in audit script

`scripts/audit-document-templates.mjs` outputs `distinct_statuss` (English plural quirk). Cosmetic. Fix on next touch of the script.

### 9.12 Cosmetic commit-message escape

Commit `9c11669` (the F1-F8 findings doc) body contains literal `\xc2\xa76` instead of `§6` due to single-quoted heredoc not processing the escape. Cosmetic. Per Dom direction: leave it, no amend.

---

## 10. Phase 2 Readiness Assessment

### 10.1 Blockers

- **F8 — auditor waiver placement.** Product decision required from Dom: embedded only (drop standalone), standalone only (strip from `annual_shareholder`), keep both (current behavior — risk of redundant waivers in the binder), or per-company configurable. **Blocks Phase 2 drafting of `annual_shareholder` content.** All other resolution types are unblocked.

### 10.2 Phase 2 effort revision

The recommendation doc estimated Phase 2 at 2-3 days ("content extraction"). Phase 1 audit revises this to **5-7 days lawyer-elapsed-time** (with CC drafting in foreground, lawyer review in background):

| Workstream | Effort |
|---|---|
| Lawyer-review existing 4 rows (FR + EN) | 1-2 days lawyer-elapsed |
| Draft 8 net-new rows for missing types (founding_board, founding_shareholder, share_subscription, auditor_waiver) × 2 frameworks | 2-3 days CC drafting |
| Lawyer-review the 8 net-new rows | 2-3 days lawyer-elapsed |
| F4/F6 content fixes folded into the above | 0 (done as side-effect) |

The dominant cost shifted from "extracting from code" (essentially zero since templates have no legal text) to "drafting and reviewing content for the 4 resolution types that have no DB precursor."

### 10.3 Phase 3 effort revision

Recommendation doc estimated Phase 3 at 2 days ("renderer refactor"). Phase 1 audit revises this **down to 1-1.5 days**:

| Workstream | Effort |
|---|---|
| Replace `getResolutionsForType()` with DB lookup | 0.5 day |
| Add Mustache substitution helper (Section 7.3) | 0.25 day |
| F1 + F7 fix (footer slot rename + UUID pre-generation) | 0.25 day |
| F2 fix (pluralize sigLabel) | 0.25 day |
| F5 fix (document-type-aware confidentiality footer) | 0.25 day |
| E.6 work (`mapToDocumentType` + CHECK constraint + backfill) | 0.5 day |
| Stale docstring + silent-fallback hardening | 0 (rolled in) |
| Regression tests (framework distinction, locale rendering, F-finding regression) | 0.5 day |

### 10.4 Risks and mitigations

**Risk:** Lawyer review SLA exceeds Phase 2 estimate. Mitigation: Phase 2 sequencing decouples — non-`annual_shareholder` rows can ship to lawyer review as soon as drafted, parallelizing with F8 resolution.

**Risk:** EN content drafting workflow is unproven. Mitigation: existing EN rows in DB (stub-tier as they are) prove the schema works; Phase 4 export/import tooling de-risks the lawyer roundtrip.

**Risk:** Phase 3 framework-distinction (Section 9.6) introduces visible behavior changes for existing CBCA users. Mitigation: regression test compares pre/post-Path C PDF output for same `requirement_key + framework` combos; lawyer-reviewed CBCA content goes through validation gate before activating.

**Risk:** F3 (share-class bilingual rendering) blocks bilingual launch. Mitigation: F3 is independent of Path C — owner and timeline tracked separately. If Path C ships before F3, FR-only PDFs are unaffected; EN PDFs render share-class names with bilingual inline strings, which is degraded but not blocking.

### 10.5 Specific blockers Dom must resolve before Phase 2

1. **F8** — auditor waiver placement (embedded / standalone / both / configurable).
2. (None other — all other Phase 2 prerequisites are LOCKED in Section 8.)

---

## 11. Open Questions

Items surfaced during this investigation that don't have a clean answer yet — for Dom decision or future-investigation triage.

1. **`bilingual` rendering mode — deprecate or wire through?** All renderers support it; orchestrator type narrows it away. Production usage = zero. Either deprecate the third arm of every LABELS dict (cleanup) or extend orchestrator + DB schema to support a `bilingual` content path (feature). No urgency — flag for Phase 5 polish.

2. **F3 (share_classes schema migration) — owner and timing?** Path C does not address it. Bilingual UI epic? Sprint 10? Independent ticket? Needs an owner and a slot.

3. **Should `annual-register.ts` get a DB-backed analog?** E.3 lock says no (data-driven, no recital text). Worth re-asking in v1.1 if registers grow legal-text content (e.g., compliance attestations attached to register exports).

4. **Phase 4 export/import format.** Recommendation doc §8 question 5 — single Word doc per framework, separate docs per template, or hierarchical? Phase 4 design work, not Phase 1 blocker.

5. **`scripts/audit-document-templates.mjs` disposition.** Created during this audit, not yet committed. Two reasonable paths: (a) commit alongside this audit doc as a permanent fixture (matches `scripts/audit-doctypes.mjs` and `audit-requirements.mjs` precedent — those are committed); (b) leave uncommitted as a one-off and delete after audit acceptance. CC default: option (a) — committed. Awaiting Dom direction.

6. **Cosmetic plural quirk in audit script** (`distinct_statuss`). Not Phase 1 blocker. Fix on next touch — not its own commit.

7. **Cosmetic commit-message escape** (`\xc2\xa76` in commit `9c11669`). Per Dom direction: leave it, no amend.

8. **Phase 1-adjacent coupling check.** Bilingual UI Phase 1 (per memory) runs in parallel; Phase 1 of this migration informs whether bilingual UI work needs to coordinate with content migration timing — likely no, but flagged. Sprint 10 schema migration (per memory): does NOT touch `document_templates` columns based on this audit, but if it adds new tables/columns, the same out-of-band-schema risk (§9.1) applies. The 4 small bilingual UX tasks (field rename, clarification notes, topbar tooltip, CLAUDE.md update) are independent.

---

End of Phase 1 audit.
