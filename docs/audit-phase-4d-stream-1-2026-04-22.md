# Sprint 9H — Phase 4d Stream 1 Audit

**Date:** 2026-04-22
**Author:** CC (investigation only — no edits)
**Brief:** "CC Brief — Phase 4d Stream 1: Backend Pipeline Unification" (Max)
**Status:** Investigation complete. Awaiting Dominique's review before execution.

---

## TL;DR

Two production routes generate documents today. One emits PDFs, the other emits `.txt`. The PDF engine (`lib/pdf-generator.ts` + `lib/pdf-templates/*` + `lib/pdf/generatePDF.ts`) is already well-factored and reusable; nothing about the wizard's `.txt` path is load-bearing. The unification described in the brief is mechanically straightforward.

Three things turned up that the brief did not anticipate and that Dominique should weigh in on before execution:
1. A **third generation route** exists at `app/api/documents/generate/route.ts` (PDF, no live callers — dead code).
2. The minute-book route **does not emit any activity_log event today**. Wizard does. Unifying will incidentally close this gap.
3. The wizard does **not resolve current-state signatories from the DB** — it uses hand-typed names from `confirmedInfo`. The minute-book route does query `director_mandates` / `shareholdings`. The two routes have *different signatory-resolution semantics today*, and the brief's prescribed unification flips the wizard from "trust the user's typed names" to "trust the DB current state." This is the only judgment call in the refactor.

---

## 2.1 — Pipeline inventory

### `/api/minute-book/generate-item/route.ts`

- **File:** `app/api/minute-book/generate-item/route.ts` (343 lines)
- **Entry signature (POST body):**
  ```ts
  {
    companyId: string,
    requirementKey: string,
    signatories?: Array<{ id, name, role }>,
    year?: number   // omitted for foundational; required for annual rows
  }
  ```
- **Underlying generation function:** `generatePDF({ type, data })` from `@/lib/pdf/generatePDF` (a thin adapter), which calls `generatePDF(html)` from `@/lib/pdf-generator` (Puppeteer). HTML built by `boardResolutionHTML` / `shareholderResolutionHTML` / `coverPageHTML` from `@/lib/pdf-templates`.
- **Storage path:** `${companyId}/${fileName}` in bucket `documents`.
- **Filename convention:** `${requirementKey}_${toStorageSafeName(legal_name_fr, 60)}_${YYYY-MM-DD}.pdf`
- **DB rows:**
  - `documents` — full insert with `company_id`, `document_type` (mapped: `board-resolution` / `shareholder-resolution` → `resolution`), `title` (from `minute_book_requirements.title_fr`), `file_name`, `file_url` (relative key), `file_size`, `language: 'fr'`, `status: 'active'`, `source: 'generated'`, `framework`, `document_year`, `requirement_key`, **conditionally** `requirement_year` (only when caller passed `year`), `minute_book_section` (from `minute_book_requirements.section`), and **conditionally** `signatories_confirmed` + `signature_status: 'pending_signature'` if signatories provided.
  - **No** `activity_log` insert. **No** `revalidatePath`.
- **Signatory resolution:** Two passes — (1) caller-provided `signatories` array used in template; (2) DB-loaded `directors` (from `director_mandates` where `is_active=true`) and `shareholders` (from `shareholdings` joined to `share_classes`) used in template fallback signature blocks. Both are current-state.
- **Data substitution:** Loads `companies` (`legal_name_fr`, `neq`, `incorporation_type`), builds `templateData` object, hands to PDF template renderers.

### `/api/wizard/generate/route.ts`

- **File:** `app/api/wizard/generate/route.ts` (550 lines, ~280 of which are inline FALLBACK templates)
- **Entry signature (POST body):**
  ```ts
  {
    companyId: string,
    incorporationType: string,        // 'CBCA' | 'LSAQ' (anything else maps to 'lsaq')
    selections: Array<{ year: number, type: 'board'|'shareholder', endDate: string }>,
    confirmedInfo: {
      companyName, directorName, officerName, officerRole, resolutionDate
    },
    locale: 'fr' | 'en'
  }
  ```
- **Underlying generation function:** `substituteVariables(template, info, fiscalYearEndDate)` — regex `{{var}}` replacement on a flat text template, then `TextEncoder().encode(content)` → bytes. **No PDF rendering.**
- **Template source:** First tries `document_templates` table (rows keyed by `template_key` = `annual_${board|shareholder}_resolution_${cbca|lsaq}`); falls back to inline `FALLBACK_TEMPLATES` constant (4 keys × 2 locales = 8 hardcoded text blobs).
- **Storage path:** `${companyId}/generated/${selection.year}/${typeSlug}-${selection.year}.txt` in bucket `documents`. (`typeSlug` = `resolution-conseil` or `pv-actionnaires`.)
- **Filename convention:** `${typeSlug}-${selection.year}.txt`.
- **DB rows:**
  - `documents` — insert with `company_id`, `title` (built ad-hoc), `document_type` (`resolution` for board, `pv` for shareholder), `document_year`, `file_url` (relative key), `language`, `framework`, `uploaded_at`, `status: 'active'`, `source: 'generated'`, `requirement_key`, `requirement_year`, `minute_book_section: 'resolutions'` (hardcoded). **Missing**: `file_name`, `file_size`, `signatories_confirmed`, `signature_status`.
  - `activity_log` — emits `document_generated` per file, plus a `wizard_completed` event at the end.
  - `revalidatePath` — three paths invalidated.
- **Signatory resolution:** **None from DB.** Uses `confirmedInfo.directorName` / `confirmedInfo.officerName` / `confirmedInfo.officerRole` directly, as filled in by the user in the wizard's "Confirm info" step. These are inserted into the text via regex substitution.
- **Data substitution:** Direct regex `{{company_name}}`, `{{director_name}}`, `{{officer_name}}`, `{{officer_role}}`, `{{fiscal_year_end_date}}`, `{{resolution_date}}` on the flat template body.

---

## 2.2 — Shared vs. divergent logic

### Effectively the same
- Both load Supabase service-role client.
- Both write to bucket `documents` with `upsert: true` (minute-book) or `upsert: true` (wizard).
- Both insert into `documents` table with `source: 'generated'`, `status: 'active'`, `requirement_key`, `framework`, `document_year`.
- Both populate `minute_book_section`.
- Both stamp `file_url` as the **relative** storage key (good — aligned with `lib/storage-path.ts` convention).

### Genuinely different

| Concern | Minute-book route | Wizard route |
|---|---|---|
| Output format | PDF (Puppeteer) | UTF-8 text (`.txt`) |
| Template source | `lib/pdf-templates/*` (HTML, code) | `document_templates` table + inline `FALLBACK_TEMPLATES` (text) |
| Substitution | Structured data passed to renderer | Regex `{{var}}` replacement |
| Signatories | DB-resolved (current-state from `director_mandates`/`shareholdings`) + optional caller override | Hand-typed in wizard form, no DB lookup |
| `file_name` column | Set | Not set |
| `file_size` column | Set | Not set |
| `signatories_confirmed`, `signature_status` | Conditionally set | Never set |
| `requirement_year` | Conditionally set (only when caller passes `year`) | Always set |
| `uploaded_at` | Not set | Set to `new Date().toISOString()` |
| `activity_log` | **Not emitted** | Emitted (`document_generated` + `wizard_completed`) |
| `revalidatePath` | Not called | Called (3 paths) |
| Auth | None — service role only, public POST | `supabase.auth.getUser()` enforced; 401 if no session |
| Documents per call | One | Many (one per selection) |
| Storage path shape | `${companyId}/${fileName}` | `${companyId}/generated/${year}/${fileName}` |

### Shared helpers actually used today
- `toStorageSafeName` (`lib/storage-key.ts`) — used by minute-book; **not** used by wizard.
- `logActivity` (`lib/activity-log.ts`) — used by wizard; **not** used by minute-book.
- `filePathFromFileUrl` (`lib/storage-path.ts`) — used by neither *generation* route, but enforces the relative-key contract that both routes already follow on write.
- `uploadDocument` (`lib/upload-document.ts`) — **used by neither**. It's the upload-side helper for the Coffre-fort and Minute Book silent-upload paths. It is *not* a fit for the generation paths because it takes a `File` object and resolves `minute_book_section` from a `requirements` array shipped from `/api/minute-book/completeness`. It is a useful **reference** for the desired shape but should not be reused as-is for generation.

### Helpers that exist but are wizard-only
- `substituteVariables`, `formatDate`, `getTemplateKey`, `FALLBACK_TEMPLATES` — all wizard-internal text-templating logic. **All become deletable** when the wizard is migrated to the unified PDF function.

---

## 2.3 — PDF generation engine

The PDF engine is already three layers, well-factored, and reusable. No refactoring inside the engine is required.

| Layer | File | Role |
|---|---|---|
| Adapter | `lib/pdf/generatePDF.ts` | `generatePDF({ type, data })` — switches on `type`, picks an HTML template, returns a Buffer. **Exported. Reusable.** |
| Renderer | `lib/pdf-generator.ts` | `generatePDF(html)` — owns Puppeteer, holds a cached browser singleton, knows about local-Chrome vs. Vercel-Chromium switching. **Exported. Reusable.** |
| Templates | `lib/pdf-templates/{base-layout,cover-page,resolution-board,resolution-shareholder,annual-register,signature-blocks}.ts` | Pure HTML-string builders. Stateless. **Exported via `lib/pdf-templates/index.ts`.** |

**Vercel/Chromium handling** is in `lib/pdf-generator.ts:32-49`. It checks `process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME` and lazily imports `@sparticuz/chromium`. `next.config.mjs` already declares both `serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']` and `outputFileTracingIncludes: { '/api/**': ['./node_modules/@sparticuz/chromium/**'] }`. **No `next.config.mjs` changes are required** as long as the new shared function lives under `lib/pdf/` and is imported from a route under `app/api/**`.

**Coupling check:** The current `lib/pdf/generatePDF.ts` is *not* coupled to the `generate-item` route. It's a generic adapter. The route-side logic (data fetching, DB insert, storage upload, activity log, signature resolution) is what needs to be extracted into a new shared function.

---

## 2.4 — Other callers

Searched: `grep "/api/wizard/generate"`, `grep "wizard/generate"`, `grep "documents/generate"`, `grep "/api/minute-book/generate-item"`, `grep "FALLBACK_TEMPLATES"`, `grep "document_templates"`, `grep "substituteVariables"`, `grep -i "cron|inngest|trigger.dev"`, glob for project-level `*.test.ts(x)`.

| Endpoint | Caller(s) |
|---|---|
| `/api/minute-book/generate-item` | `components/documents/useGenerateWithSignatories.ts:32` (single caller — the Minute Book row "Générer" hook). |
| `/api/wizard/generate` | `components/wizard/steps/StepGeneration.tsx:34` (single caller — the wizard's step-5 generation step). **No internal imports of route helpers, no background jobs, no tests.** |
| `/api/documents/generate` | **No live callers in `app/` or `components/`.** Only self-references in the file header and a `.bak` sibling. Dead code. |

`document_templates` table is read **only** from the wizard route. No other consumer.

No tests, no cron jobs, no Inngest/trigger.dev integrations. No `next/server` imports of either route's handler from elsewhere.

---

## 2.5 — Storage bucket / `.txt` artifact state

I cannot query Supabase Storage directly. From the code:

- **Bucket:** `documents`.
- **Wizard `.txt` path prefix:** `${companyId}/generated/${year}/...` — this is a clean filter to enumerate the `.txt` artifacts. Files match `${companyId}/generated/${year}/{resolution-conseil|pv-actionnaires}-${year}.txt`.
- **Documents table reference:** Each `.txt` upload inserts a `documents` row with `source = 'generated'`, `document_type IN ('resolution','pv')`, `requirement_key IN ('lsaq_annual_board_resolution','lsaq_annual_shareholder_resolution','cbca_annual_board_resolution','cbca_annual_shareholder_resolution')`, `minute_book_section = 'resolutions'`, `file_url` ending in `.txt`.

To size the cleanup work, Dominique can run (against prod Supabase):

```sql
SELECT
  count(*)                                               AS total_txt_documents,
  count(*) FILTER (WHERE file_url LIKE '%.txt')          AS by_extension,
  count(DISTINCT company_id)                              AS affected_companies,
  min(created_at), max(created_at)
FROM documents
WHERE source = 'generated'
  AND file_url LIKE '%/generated/%';
```

Cleanup is **not** part of Stream 1. It informs a Sprint 9I/10 task — likely a small migration script that either re-generates the documents as PDF or marks the legacy rows as superseded. Dominique decides.

### Production count results (run 2026-04-23, read-only via service-role)

**Query 1 — totals:**
```json
{
  "total_generated_docs_with_generated_prefix": 10,
  "txt_count": 10,
  "pdf_count": 0,
  "other_extension_count": 0,
  "affected_companies": 1,
  "min_created_at": "2026-04-18T19:36:32.39062+00:00",
  "max_created_at": "2026-04-23T02:11:03.535621+00:00"
}
```

**Query 2 — per-company:**
```json
[
  {
    "company_id": "963a9033-cace-4bd4-8ff6-f07873cbd7e4",
    "legal_name_fr": "droussy inc.",
    "doc_count": 10,
    "txt_count": 10,
    "first": "2026-04-18T19:36:32.39062+00:00",
    "last": "2026-04-23T02:11:03.535621+00:00"
  }
]
```

**Classification:** 10 .txt files, 1 affected company (`droussy inc.`). Per Dominique's rule (≤50 files, all test companies → no action; Sprint 10 test-data purge will handle them), this is below the escalation threshold. **No cleanup action required in Stream 1.**

---

## 2.6 — Recommended approach

**One paragraph:** Extract a single function `generatePdfDocument({ companyId, requirementKey, year?, signatories? })` into `lib/pdf/generatePdfDocument.ts`. It loads the requirement metadata + company + current-state directors/shareholders (mirroring today's minute-book route), resolves signatories (caller override wins; otherwise DB current-state), renders via the existing `generatePDF({ type, data })` adapter, uploads to the `documents` bucket using the minute-book naming convention (`${companyId}/${requirementKey}_${safeName}_${date}.pdf`), inserts the full `documents` row (file_name, file_size, framework, document_year, requirement_key + conditional requirement_year, minute_book_section from `minute_book_requirements.section`, conditional signatories_confirmed + signature_status), and emits a `document_generated` activity_log event. Both routes become thin wrappers: the minute-book route calls it once, the wizard route iterates over `selections` and calls it once per `(year, type)` pair. Wizard's `confirmedInfo` is **dropped from the generation step** — directors/officers come from the DB current state. Wizard's `wizard_completed` event and `revalidatePath` calls stay in the wizard route. This is roughly the same architecture as the brief's Section 3.1.

**Why this shape, not "thread `signatories` through and keep the wizard's hand-typed names":** The wizard's hand-typed `directorName` / `officerName` are not authoritative. Today's wizard text files can be legally wrong if the user typed a name that doesn't match an active mandate. Switching to DB current-state matches the minute-book route and is the more defensible default. **But this is a behavioral change that the user-facing wizard's "Confirm info" step does not warn about** — Dominique should confirm before execution. (Stream 3 retires the wizard UI anyway, so this asymmetry is short-lived.)

---

## Surprises, concerns, escalations

1. **Third pipeline exists and is dead.** `app/api/documents/generate/route.ts` is a PDF-based generation route with no callers. It uses the same engine the unified function will use. Plus a `.bak` sibling. **Recommendation:** flag for Stream 3 deletion. Do NOT touch in Stream 1 (per brief Section 3.2).

2. **Minute-book route emits no activity_log event today.** This contradicts the assumption in brief Section 3.1 ("Emits activity_log event: 'Document généré'"). Wizard emits it; minute-book does not. Unifying will incidentally close this gap on the minute-book side. Worth flagging because it changes the audit trail for existing flows in production — every Minute Book row "Générer" will start producing an activity_log row after Stream 1 ships. Acceptance criteria already covers this (Section 4: "minute_book_section is populated on every document insert from both paths" — by analogy, activity_log should be too).

3. **Signatory-resolution semantics differ.** Wizard uses hand-typed names from the wizard form; minute-book queries DB current state. Unification picks one. Brief implies DB current-state (Section 3.1: "Resolves current-state signatories from director_mandates / officer_appointments / shareholdings"). **This is the only judgment call in Stream 1.** Confirm with Dominique before execution.

4. **`document_templates` DB rows become orphaned.** Wizard reads from this table first, falls back to code constants. After unification nothing reads from it. Stream 1 should leave the rows in place; Stream 3 (or a Sprint 9I cleanup) can drop them.

5. **Wizard auth check is non-trivial.** Wizard route enforces `supabase.auth.getUser()` — minute-book route does not (it's service-role only). The unified shared function should not handle auth — keep the auth check in the route layer. Stream 1 must preserve the wizard's 401 behavior.

6. **`uploaded_at` column.** Wizard sets it; minute-book does not. The column is presumably nullable. The unified function should not set `uploaded_at` for generated documents (it semantically means "user uploaded this file" — `created_at` already exists on the row). This is a small behavior change that aligns the wizard's row shape with the minute-book route's. Confirm with Dominique.

7. **Foreign-key nested select pattern.** Both routes use `company_people(...)` and `share_classes(...)` nested selects without `!inner`. Per memory Section 13 (FK JOIN bug), `!inner` silently returns empty arrays — neither route uses `!inner`, so no bug here. The unified function should continue not to use `!inner`.

8. **No tests anywhere.** `package.json` defines `audit:doctypes` but no `test` script. `npm run audit:doctypes` is the only available verification gate. Acceptance criteria already covers this.

---

## Scope estimate

| File | Action | Approx. lines |
|---|---|---|
| `lib/pdf/generatePdfDocument.ts` | New file | +200 |
| `app/api/minute-book/generate-item/route.ts` | Refactor to thin wrapper | -200 / +60 (≈-140 net) |
| `app/api/wizard/generate/route.ts` | Refactor; delete FALLBACK_TEMPLATES + substituteVariables + getTemplateKey | -480 / +80 (≈-400 net) |
| **Total touched** | **3 files (1 new, 2 modified)** | **net ≈ -340 lines** |

Untouched: `lib/pdf-generator.ts`, `lib/pdf-templates/*`, `lib/pdf/generatePDF.ts`, `lib/upload-document.ts`, `lib/storage-key.ts`, `lib/storage-path.ts`, `lib/activity-log.ts`, `next.config.mjs`, the wizard UI, `useGenerateWithSignatories.ts`, `MinuteBookPage.tsx`.

---

## Awaiting Dominique's decisions before execution

1. **Signatory-resolution policy in unified function.** Confirm: "DB current-state from `director_mandates` and `shareholdings`; caller-provided `signatories[]` override wins when present; wizard's `confirmedInfo.directorName`/`officerName` are dropped." (Or: a different policy.)
2. **`uploaded_at` for generated documents.** Confirm: "Do not set; `created_at` is sufficient." (Or: keep the wizard's behavior.)
3. **Activity log on minute-book path.** Confirm: "Yes, the unified function emits `document_generated` for both routes — this is an intentional fix for the silent minute-book generation."
4. **Third pipeline (`/api/documents/generate`).** Confirm: "Out of scope for Stream 1; flag for Stream 3 deletion."
5. **`document_templates` DB rows.** Confirm: "Leave in place; defer cleanup to Sprint 9I/10."
6. **`.txt` artifact cleanup.** Confirm: "Out of scope for Stream 1; query bucket size separately and decide cleanup approach in Sprint 9I/10."

Once those six decisions are made, the per-edit execution sequence in brief Section 3.3 is correct as written.

---

## Known-but-deferred (added during execution)

1. **EN resolution body text is not handled.** `getResolutionsForType` in `lib/pdf/generatePdfDocument.ts` hardcodes FR titles/bodies for every resolution block. This matches today's minute-book behavior (also FR-only). The wizard's `FALLBACK_TEMPLATES_EN` constant — deleted in Edit 3 — was a translation EN-language wizard users theoretically had. Real-user impact: zero (single-user product, FR locale). Deferred to a future i18n pass; **not** appropriate for Sprint 9I cleanup (larger scope than a cleanup item).

2. **Verify PDF templates consume `templateData.resolutionDate`.** Before local testing, confirm that `boardResolutionHTML` / `shareholderResolutionHTML` (the renderers `generatePDF` switches to) actually render the `resolutionDate` field. If they don't, the date won't appear on the PDF — would be a Stream 2 blocker (Aria Q3's date-per-year input is meaningful only if the value lands on the document). Local-test-time check, not a pre-write blocker.

3. **`generatePdfDocument` return field `fileUrl` is misnamed.** It contains a storage key (relative path inside the `documents` bucket), not a URL. Both callers (`app/api/minute-book/generate-item/route.ts` and `app/api/wizard/generate/route.ts` after Edit 3) call `supabaseAdmin.storage.from('documents').getPublicUrl(result.fileUrl)` when they need an actual URL for the UI response. Sprint 9I cleanup: rename the field to `storagePath` in `GeneratePdfDocumentResult` and update both call sites. Cosmetic — no behavior change.

4. **Binder view Section 1–7 shows "0 documents" despite correct DB state.** Not a Stream 1 regression. Root cause unknown — suspected UI caching, RLS policy difference between service-role script and user-scoped API call, or bug in `/api/minute-book/binder/route.ts`'s response shape. Sprint 9I or Sprint 10 investigation. Tracking as Sprint 10 launch-blocker candidate.

   Verified 2026-04-23 via read-only service-role query against droussy inc.: all 5 recent generated documents have `minute_book_section='resolutions'`, `document_type='resolution'`, `status='active'`, correct `company_id`, correct `requirement_key`. `minute_book_requirements` seed for the four annual keys all have `section='resolutions'`. Every branch (A/B/C) of `resolveSection()` in `app/api/minute-book/binder/route.ts:24-28` would correctly classify these rows into `'resolutions'`. Yet the binder UI reports 0 documents in Section 4. The fault is somewhere between the `documents` table and the binder component's render — not in the generation pipeline.

---

## Investigation scope — methodology lesson

**What was missed:** The initial investigation (Section 2.4 "Other callers") grep'd for `/api/wizard/generate` and `wizard/generate` strings but never enumerated sibling routes under `app/api/wizard/`. As a result, `/api/wizard/download/route.ts` — which is part of the wizard's end-to-end pipeline — was invisible to the audit. Local testing caught it: the refactored generation path correctly wrote PDFs, but the download path (unchanged, with hardcoded `Content-Type: text/plain` and a client-side `.txt` suffix) delivered what looked like `.txt` files to the user, defeating the entire Stream 1 user-visible promise.

**Rule for next time:** Before refactoring any API route, run `ls app/api/<feature>/` (or `Glob app/api/<feature>/**/*.ts`) to enumerate every sibling route in that feature's namespace. Grep is fine for finding callers of a *specific* endpoint; directory enumeration is required for mapping a *feature's* surface area. A route can be part of the same pipeline (generate → download) without any textual reference to its sibling — it's linked by the product flow, not by imports.

**Rule for scope decisions:** When a refactor's user-visible outcome (here: "wizard outputs PDFs") depends on a sibling component that was not originally in scope, prefer extending scope over split-deploy. Deploying the generation fix alone would have shipped a silently broken user experience for the gap between Stream 1 and Stream 3. One consolidated deploy is strictly better than two half-fixes.

**Impact:** Zero production impact — caught during local testing, which is the correct gate for this class of miss. Cost was ~1 hour of extra investigation + 2 small edits. Worth it.

---

## Execution log

| Date | Action | Status |
|---|---|---|
| 2026-04-22 | Investigation (Section 2.1–2.5) | Complete |
| 2026-04-23 | `.txt` artifact production count run | 10 files / 1 test company / no action |
| 2026-04-23 | Edit 1: `lib/pdf/generatePdfDocument.ts` written | Complete |
| 2026-04-23 | Edit 1.5: `notFound` discriminator added to `GeneratePdfDocumentResult` | Complete |
| 2026-04-23 | Edit 2: `app/api/minute-book/generate-item/route.ts` refactor | Complete |
| 2026-04-23 | Edits 1, 1.5, 2 complete + typecheck clean + lint clean | PAUSED — Edit 3 deferred to next fresh session |
| 2026-04-23 | Edit 2.5: `GeneratePdfDocumentResult` gains `title` field (avoids N extra DB round-trips in wizard bulk generation) | Complete |
| 2026-04-23 | Edit 3: `app/api/wizard/generate/route.ts` refactored to thin wrapper (549 → ~150 lines) | Complete |
| 2026-04-23 | Edits 2.5 + 3 typecheck clean + lint clean (4 pre-existing warnings in unrelated files; zero new warnings in Stream 1 files) | Complete |
| 2026-04-23 | Local test surfaced Path-2 download bug — wizard users still receive `.txt` despite PDF generation. Scope extended to fix delivery path. | Diagnostic complete |
| 2026-04-23 | Edit 4: `app/api/wizard/download/route.ts` — Content-Type `text/plain` → `application/pdf`, fallback filename `.txt` → `.pdf`, header comment added | Complete |
| 2026-04-23 | Edit 5: `components/wizard/steps/StepDownload.tsx` — client-side filename suffix `.txt` → `.pdf` (line 55), UI label `.txt` → `.pdf` (line 127) | Complete |
| 2026-04-23 | Edits 4 + 5 typecheck clean + lint clean (same 4 pre-existing warnings; zero new) | Complete |
| 2026-04-23 | Livre tab diagnosis — DB query confirms Stream 1 writes correct values; empty binder view is pre-existing UI/API bug outside Stream 1 scope | Diagnosis complete |
| 2026-04-23 | Local test pass — Path 1 steps 1-8 ✓, Path 2 ✓ end-to-end, Path 1 step 9 (Livre tab) confirmed pre-existing bug out of scope | Complete |
| 2026-04-23 | Production deploy — commit 36515e7 live on zapokay.vercel.app. Env var misconfiguration encountered (shared-team vars not linked to project scope); resolved by adding NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY at project-level. Path 1 + Path 2 verified on production. | Complete |
