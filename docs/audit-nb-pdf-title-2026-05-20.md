# NB-PDF-Title Audit — Hardcoded template literal ignores per-requirement DB title

Date: 2026-05-20
Origin: Tier 1 #17 (open pre-launch blocker); symptom framing per Queue memory.
Status: Audit complete; fix planning in Phase B (separate brief to follow Phase A→B review gate).
Lifecycle precondition: Minute Book — Documents flipped `_TBD_` → `ACTIVE` in `docs/feature-lifecycle.md` immediately prior to this audit (commit `ccaa067`). Critical-path confirmation now satisfied.

---

## 1. Bug summary

Generated resolution PDFs render a single, family-generic title (e.g. `Résolution des actionnaires`) regardless of which requirement was generated. The per-requirement title that the rest of the product treats as authoritative — for example `Première résolution des actionnaires` for `lsaq_premiere_resolution_actionnaires`, or `Résolution annuelle des actionnaires` for `lsaq_annual_shareholder_resolution` — is computed in the route handler, stored on `documents.title`, but **never threaded into the PDF rendering pipeline**. The h1 inside the PDF body, and the footer document-name slot, are filled by a hardcoded string-literal inside the template module instead.

**Memory-framing contradiction (flagged for the brief's hard stop).** Memory describes the bug as a "stripped prefix" — implying the prefix is composed correctly in code and then removed downstream (Class B in the brief's taxonomy). The code shows the inverse: **no ordinal-prefix composition logic exists anywhere in the TypeScript codebase**. Grep `Première|Premiere|First (Board|Shareholder)` across `**/*.{ts,tsx}` returns zero files (only the SQL seed and prior audit docs match). The prefix is data, not code. The PDF template literal happens to coincide with the prefix-removed form, but it was never composed and never stripped — it has been a fixed literal in `lib/pdf-templates/resolution-{board,shareholder}.ts` since those templates were introduced. The DB row is the source of truth and is correct; the renderer simply ignores it. This reclassifies the bug as **Class A — NEVER-COMPOSED**, sub-variant "the title was never plumbed through the pipeline".

---

## 2. Scope

Wide audit of PDF title composition across the generation pipeline:

| Area | Files inspected |
|---|---|
| Entry routes | `app/api/minute-book/generate-item/route.ts`, `app/api/minute-book/bulk-generate/route.ts` |
| Unified pipeline | `lib/pdf/generatePdfDocument.ts`, `lib/pdf/generatePDF.ts` |
| Template layer | `lib/pdf-templates/resolution-board.ts`, `lib/pdf-templates/resolution-shareholder.ts`, `lib/pdf-templates/base-layout.ts`, `lib/pdf-templates/index.ts` |
| Seed | `supabase/migrations/20260508204954_create_minute_book_requirements_with_seed.sql` |
| Consumer search | Grep `generatePdfDocument` → 3 files; `boardResolutionHTML|shareholderResolutionHTML` → 2 consumers (`generatePDF.ts:67,88`); `Première|Premiere|First (Board|Shareholder)` in `*.{ts,tsx}` → **0 files** |

No other consumers of the resolution templates exist. No wizard route exists today (`app/api/wizard/**` Glob returned zero files); the file-header comment in `generatePdfDocument.ts:5-8` referencing `/api/wizard/generate` is stale documentation (banked as §6 follow-up).

---

## 3. Title-composition trace (every hop)

For the canonical exhibit — `requirementKey = 'lsaq_premiere_resolution_actionnaires'`, `language = 'fr'`:

1. **Route entry.** `app/api/minute-book/generate-item/route.ts:9-64` (or `bulk-generate/route.ts:192-201` for the batch path). Auth → service-role client → delegates to `generatePdfDocument({ companyId, requirementKey, ... })`. No title work here.
2. **Requirement lookup.** `lib/pdf/generatePdfDocument.ts:145-149` SELECTs `title_fr, title_en, section, category` FROM `minute_book_requirements` WHERE `requirement_key = $1`. For the exhibit, returns `title_fr = "Première résolution des actionnaires"`, `title_en = "First Shareholder Resolution"`, `category = "foundational"`.
3. **Per-language pick + fallback.** `lib/pdf/generatePdfDocument.ts:154-158`:
   ```ts
   const requirementTitle = language === 'en' ? requirement?.title_en : requirement?.title_fr;
   const documentTitle =
     requirementTitle && requirementTitle.length > 0
       ? requirementTitle
       : (language === 'en' ? 'Resolution' : 'Résolution');
   ```
   For the exhibit, `documentTitle = "Première résolution des actionnaires"`. The fallback literal `'Résolution'` is **NOT** the symptom string (symptom is `Résolution des actionnaires`, fallback omits the trailing suffix) — fallback is not firing in the bug.
4. **Mapping → template type + resolutionType.** `lib/pdf/generatePdfDocument.ts:139` looks up `REQUIREMENT_MAP[requirementKey]` (lines 39-54). For the exhibit, returns `{ type: 'shareholder-resolution', resolutionType: 'founding_shareholder' }`. The mapping carries `resolutionType` only for the body-content list at step 7 (see step 6); it does NOT carry the title.
5. **Template payload build.** `lib/pdf/generatePdfDocument.ts:226-237`. The `templateData` object includes `companyName`, `neq`, `resolutionDate`, `fiscalYear`, `language`, `framework`, `directors`, `shareholders`, `resolutions`, `signatories`. **`documentTitle` is NOT included in `templateData`.** This is the hop where the chain breaks — the title computed at step 3 is consumed only at step 9 (the DB `documents.title` insert), never passed to the renderer.
6. **Resolution-list build.** `getResolutionsForType('founding_shareholder')` (`generatePdfDocument.ts:62-89, 69-73`) returns the per-bullet titles + bodies that render inside the body of the PDF. These are body items, not the document title. Spot check confirms none contains "Première" or any ordinal-prefix logic — the prefix is absent at this layer entirely.
7. **PDF dispatch.** `lib/pdf/generatePDF.ts:51-90`. Switch on `type === 'shareholder-resolution'` builds a `ShareholderResolutionData` from the input (lines 78-87) and calls `shareholderResolutionHTML(tmplData)`. The `ShareholderResolutionInput` interface (lines 25-34) does NOT declare a `documentTitle` field; it has `companyName`, `neq`, `resolutionDate`, `fiscalYear`, `language`, `shareholders`, `resolutions`, `signatories`. So even if `generatePdfDocument` tried to forward a `documentTitle`, this adapter would drop it.
8. **Template render — title hardcode.** `lib/pdf-templates/resolution-shareholder.ts:16-41` defines a `LABELS` table:
   ```ts
   const LABELS = {
     fr: { title: 'Résolution des actionnaires', ... },
     en: { title: 'Shareholders\' Resolution', ... },
     bilingual: { title: "Résolution des actionnaires / Shareholders' Resolution", ... },
   } as const;
   ```
   At lines 78-87, the template calls `baseLayoutHTML({ documentTitle: l.title, ..., footerDocName: l.title, ... })`, where `l = LABELS[data.language]`. **The per-requirement title computed at step 3 is never used.** The h1 in the rendered HTML is the literal `Résolution des actionnaires`.
9. **HTML emission.** `lib/pdf-templates/base-layout.ts:250` emits `<h1>${escapeHtml(data.documentTitle)}</h1>` inside `.title-block`; line 260 emits `<span>${escapeHtml(data.footerDocName)}</span>` in the footer. The base layout is data-driven (correctly); the regression is upstream of it.
10. **Puppeteer render.** `lib/pdf/generatePDF.ts:110` → `renderPDF(html)` from `lib/pdf-generator` (not opened — out of scope; not implicated in title composition).
11. **Persistence — divergence point.** `lib/pdf/generatePdfDocument.ts:262-286` inserts the documents row with `title: documentTitle` (line 269). So `documents.title` = `"Première résolution des actionnaires"` (correct), while the PDF binary uploaded at step 11.0 contains the body title `"Résolution des actionnaires"` (wrong). This is the load-bearing divergence: the listing-page row title and the PDF body title disagree by design, because they come from two different sources that nothing keeps in sync.

The board-resolution path is structurally identical: `lib/pdf-templates/resolution-board.ts:16-38` carries the same shape with `LABELS.fr.title = "Résolution du conseil d'administration"` and `LABELS.en.title = "Board of Directors Resolution"`, also used as both `documentTitle` and `footerDocName` at lines 75-84.

---

## 4. Root-cause classification

**Class A — NEVER-COMPOSED.** The per-requirement title is computed in `generatePdfDocument.ts` (step 3) and stored on `documents.title` (step 11), but is never plumbed into the template-input interface (`ShareholderResolutionInput` / `BoardResolutionInput` in `lib/pdf/generatePDF.ts:14-34`) and therefore never reaches the template. The template, lacking any input title, falls back to a family-generic hardcoded literal it owns internally.

Not Class B (composed-then-stripped): nothing strips, and nothing composes. The two-template-literals are not the output of any composition step — they are checked-in source-code constants whose existence pre-dates the symptom.

Not Class C (data-driven): the DB row is correct. The seed (`supabase/migrations/20260508204954_create_minute_book_requirements_with_seed.sql:98-101`) stores:
- `cbca_first_board_resolution` → FR `Première résolution du conseil d'administration`, EN `First Board Resolution`
- `lsaq_premiere_resolution_ca` → FR `Première résolution du conseil d'administration`, EN `First Board Resolution`
- `cbca_first_shareholder_resolution` → FR `Première résolution des actionnaires`, EN `First Shareholder Resolution`
- `lsaq_premiere_resolution_actionnaires` → FR `Première résolution des actionnaires`, EN `First Shareholder Resolution`

Phase B does not need to touch the DB seed. Phase B needs to plumb the already-computed title through the renderer.

---

## 5. Scope findings

### 5.1 Locale

Both FR and EN affected. Both `LABELS.fr.title` and `LABELS.en.title` are hardcoded family-generic literals in both templates; the DB has correct per-requirement strings for both `title_fr` and `title_en`. The bilingual variant (`LABELS.bilingual.title`) is structurally identical — also a hardcoded concatenation — but no active route invokes the pipeline with `language: 'bilingual'` today (`GeneratePdfDocumentParams.language` is typed `'fr' | 'en'` at `generatePdfDocument.ts:117`). Bilingual rendering is a latent open question banked at §6.

This is **NOT a Two-Layer Language Model violation** — the pipeline reads `language` from caller-passed param (which the inline route hard-codes from `body.language` defaulting to `'fr'`; bulk-generate doesn't pass it at all, so defaults to `'fr'`). UI locale is not coupled here. The fix lives at the rendering boundary, not the locale boundary.

### 5.2 Document scope — wider than first-resolution

The hardcoded-template-literal pattern affects **all six requirements** that funnel through `REQUIREMENT_MAP` (`generatePdfDocument.ts:39-54`). Spot-checking each requirement's DB title vs. the template literal it renders to:

| requirement_key (LSAQ + CBCA) | DB title_fr | Rendered PDF title | Divergence |
|---|---|---|---|
| `lsaq_premiere_resolution_ca` / `cbca_first_board_resolution` | `Première résolution du conseil d'administration` | `Résolution du conseil d'administration` | **lost "Première"** (memory's reported symptom — confirmed) |
| `lsaq_premiere_resolution_actionnaires` / `cbca_first_shareholder_resolution` | `Première résolution des actionnaires` | `Résolution des actionnaires` | **lost "Première"** (memory's reported symptom — confirmed) |
| `lsaq_annual_board_resolution` / `cbca_annual_board_resolution` | `Résolution annuelle du conseil d'administration` | `Résolution du conseil d'administration` | **lost "annuelle"** (not in memory's framing — new finding) |
| `lsaq_annual_shareholder_resolution` / `cbca_annual_shareholder_resolution` | `Résolution annuelle des actionnaires` | `Résolution des actionnaires` | **lost "annuelle"** (new finding) |
| `lsaq_auditor_waiver` / `cbca_auditor_waiver` | `Résolution — Dispense de vérificateur (art. 163 LCSA)` (CBCA) / `Résolution — Dispense de vérificateur` (LSA) | `Résolution des actionnaires` (mapped to `shareholder-resolution` type at line 46/53) | **completely wrong title** — document identity erased, no mention of the auditor waiver (new finding) |
| `lsaq_souscription_actions` / `cbca_share_subscription` | `Lettre de souscription d'actions` | `Résolution du conseil d'administration` (mapped to `board-resolution` type at line 43/50) | **completely wrong title** — and arguably the wrong document template entirely; share subscription is a subscription letter, not a board resolution (new finding) |

6 logical requirements × 2 frameworks (LSA + CBCA) × 2 locales (FR + EN) = **24 document × locale combinations affected**. The "first resolution" symptom in memory is one of three distinct symptom shapes the same single root cause produces.

### 5.3 Path scope

Both the inline single-doc route (`app/api/minute-book/generate-item/route.ts`) and the batch route (`app/api/minute-book/bulk-generate/route.ts`) call `generatePdfDocument` and share the entire pipeline including the template layer. A single fix in the template layer / `generatePDF` adapter / `generatePdfDocument.ts` covers both.

The wizard path the brief asks about is dead: `app/api/wizard/**` does not exist (Glob returned zero files); the comment block at `lib/pdf/generatePdfDocument.ts:5-8` referencing it is stale. The wizard's `.txt` emission concern is moot because no wizard route is calling this code today. (Stale-comment cleanup is §6.4 follow-up — not Phase B scope.)

---

## 6. Phase B intervention site + candidate approaches

### 6.1 Exact fix sites (proposal — not implemented)

Five files would touch in Phase B regardless of approach choice:

| # | File:line | Change kind |
|---|---|---|
| 1 | `lib/pdf-templates/resolution-shareholder.ts:5-14` (`ShareholderResolutionData` interface) | Add `documentTitle: string` field |
| 2 | `lib/pdf-templates/resolution-shareholder.ts:16-41` (`LABELS`) | Drop the `title` field from each language variant (or keep as fallback — see Approach 2) |
| 3 | `lib/pdf-templates/resolution-shareholder.ts:81,85` (call to `baseLayoutHTML`) | Replace `documentTitle: l.title` + `footerDocName: l.title` with `documentTitle: data.documentTitle` + `footerDocName: data.documentTitle` |
| 4 | `lib/pdf-templates/resolution-board.ts:5-14, 16-38, 78,82` | Same shape as 1-3 for board-resolution template |
| 5 | `lib/pdf/generatePDF.ts:14-34` (interfaces) + `51-90` (switch body) | Add `documentTitle: string` field to `BoardResolutionInput` + `ShareholderResolutionInput`; forward into `tmplData` at lines 57-66 and 78-87 |
| 6 | `lib/pdf/generatePdfDocument.ts:226-237` (`templateData` object) | Add `documentTitle` field set to the existing `documentTitle` local computed at line 155-158 |

No DB seed touch needed. No new helper. No migration. Test fixtures (none in tree) — out of scope.

### 6.2 Approach 1 — Direct plumbing (CC recommendation)

**Shape.** Add `documentTitle: string` to both template-input interfaces. Drop `LABELS.{fr,en,bilingual}.title` from both templates entirely. Templates consume `data.documentTitle` for both the h1 in `.title-block` (via `baseLayoutHTML.documentTitle`) and the footer document-name slot (via `baseLayoutHTML.footerDocName`). The existing `documentTitle` computed at `generatePdfDocument.ts:155-158` (with its `'Résolution'` / `'Resolution'` fallback) becomes the single source of truth that flows through the pipeline.

**LOC.** Net ≈ **−10 LOC**: interfaces +2, LABELS shrink by ~6, plumbing +2 hops, no removals elsewhere.

**Regression risk.** Low. Single chokepoint; the only path that could divergently render now goes through `data.documentTitle`, which is non-optional in the interface so TypeScript enforces caller-supplies. The existing fallback at `generatePdfDocument.ts:158` covers the empty-DB-row case (would render the bare word `Résolution` / `Resolution` — same defensive behavior the route already exhibits).

**Convergence argument.** Strong. Removes the duplicated source of truth (template literal vs. DB row) — there will no longer be two strings to keep in sync, only the DB row. The hardcoded literal becoming a dead constant is exactly the type of latent shadow §8 of the NB-Date audit called out as a discipline failure; Approach 1 removes the shadow entirely.

### 6.3 Approach 2 — Optional title with template fallback

**Shape.** Same plumbing changes as Approach 1, but `documentTitle?: string` is optional and `LABELS.{fr,en,bilingual}.title` is preserved as a fallback when the caller doesn't pass a per-document title. Template selects `data.documentTitle ?? l.title`.

**LOC.** Net ≈ **+0 LOC**: interfaces +2 optional, LABELS unchanged, plumbing +2 hops, no removals.

**Regression risk.** Lowest of the three — no LABELS change, no signature change for hypothetical-but-nonexistent other callers.

**Convergence argument.** Weakest. Both code paths remain. The bug is closed for the two routes that exist today (they will pass `documentTitle`), but the hardcoded literal stays as a latent reactivation point for any future caller that omits the field. This is the same convergence-failure shape Approach 1 explicitly avoids — and is what the NB-Date audit's §8 observed historically when `lib/utils.ts:formatDate` was left dead alongside scattered safe-parses.

### 6.4 Approach 3 — Plumbing + bilingual title composition in caller

**Shape.** Same as Approach 1, plus `generatePdfDocument.ts` composes a bilingual title `${title_fr} / ${title_en}` when called with `language: 'bilingual'`. Currently `language` is typed `'fr' | 'en'` at the param boundary, so this is forward-looking only — included as an option in case product wants bilingual PDFs at or near launch.

**LOC.** Net ≈ **−5 LOC**: Approach 1 minus, plus ~5 LOC for the bilingual composer.

**Regression risk.** Low. The bilingual branch is currently unreachable through any route, so the composer is dead code until either (a) a route is updated to pass `language: 'bilingual'`, or (b) the param type is widened. Phase B can defer the bilingual composer if product is not asking for bilingual PDFs at launch — leaves Approach 1 unchanged structurally.

### 6.5 CC recommendation

**Approach 1 — Direct plumbing.** Removes the hardcoded title literal entirely, makes the DB row authoritative, removes the duplicated source of truth that produced the bug, and aligns the PDF body title with the `documents.title` listing-page row title. Strongest convergence; lowest latent-shadow risk; smallest LOC delta of the converging options.

Final choice deferred to Dom + Max at the Phase A→B review gate. Approach 2 is the most conservative; Approach 1 is the recommended fix; Approach 3 is Approach 1 with a forward-looking bilingual hook that can be deferred if not launch-blocking.

---

## 7. Open questions / product gates surfaced

Banked for the Phase A→B review gate; not investigated further in Phase A.

- **Auditor-waiver and share-subscription render with the wrong document template, not just the wrong title.** `lsaq_auditor_waiver` / `cbca_auditor_waiver` map to `shareholder-resolution` (line 46, 53 of `generatePdfDocument.ts`); `lsaq_souscription_actions` / `cbca_share_subscription` map to `board-resolution` (line 43, 50). Fixing the title via Approach 1 will correctly show "Résolution — Dispense de vérificateur" and "Lettre de souscription d'actions" in the h1, but the body still renders as a generic resolution (resolved-text + numbered-resolutions block + director/shareholder signature columns). For the share-subscription case in particular, a subscription letter has a materially different document structure than a board resolution — Phase B title-only fix may be insufficient; a separate template may be needed. Surface for product before Phase B if launch acceptance requires structural correctness.
- **Subtitle vs. header swap.** Current behavior: h1 is the family-generic title, fiscal year (when applicable) is the subtitle. Approach 1 swap puts the per-requirement title (e.g. `Première résolution des actionnaires`) in the h1 and keeps fiscal year as subtitle. Is that the right visual hierarchy, or should the family-generic title be retained somewhere (e.g. subtitle, or first line of body) for category recognition? Defer to product.
- **Bilingual PDF rendering.** Templates support `language: 'bilingual'` but no caller invokes it today (`generatePdfDocument.ts:117` types `language` as `'fr' | 'en'`). Per the Two-Layer Language Model, document language is per-company `preferred_language` — Phase B should confirm whether launch requires single-language PDFs only or also bilingual PDFs. If bilingual, Approach 3 (or its equivalent caller-side composer) becomes load-bearing.
- **`documents.title` already correct — UI-side surfaces are fine.** Per §3 step 11, the listing page and Coffre-fort show the correct per-requirement title (e.g. `Première résolution des actionnaires`) because `documents.title` is set from the DB row, not from the template. Only the PDF binary itself shows the wrong title. So the user-visible impact is concentrated on the downloaded PDF — no need to backfill `documents.title` rows, no need to regenerate or rename existing PDFs unless product wants to. Phase B may need a regeneration cycle for already-generated PDFs (those binaries are immutable) — bank for product.
- **Stale comment in `lib/pdf/generatePdfDocument.ts:5-8`** references `/api/wizard/generate`, a route that does not exist (verified via Glob). Out of NB-PDF-Title scope; bank as tier-4 housekeeping.
- **`bulk-generate` does not pass `language`.** `app/api/minute-book/bulk-generate/route.ts:192-201` calls `generatePdfDocument` without a `language` param, defaulting to `'fr'`. Single-doc route also doesn't pass it through (it reads `requirementKey` only). This means EN-preferred users cannot generate EN PDFs through either current route. Cross-reference §5.1 above; this is a Two-Layer Language Model adjacency — banked as a separate finding, not in NB-PDF-Title scope.
