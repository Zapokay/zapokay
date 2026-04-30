# ZapOkay — Template Architecture Recommendation

**Date:** April 29, 2026
**Author:** Dom (Product Owner) + Max (CTO/AI advisor)
**Status:** Recommendation — Dom decides
**Purpose:** Resolve the architectural question raised tonight about how PDF templates should be stored to satisfy the locked requirement that templates be exportable/importable in both languages for lawyer review.

---

## 1. Hard Requirement (locked tonight)

Templates MUST be easily exportable and importable in both languages so that lawyers can review, redline, and return them. This is a non-negotiable product requirement that drives the architectural decision.

## 2. Current State (verified April 29, 2026)

### 2.1 The `document_templates` table — well-designed, underused

Table exists in production with a strong bilingual-ready schema:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | PK |
| `template_key` | text | Stable identifier (analogous to `requirement_key`) |
| `title_fr` / `title_en` | text | Bilingual titles |
| `template_body_fr` / `template_body_en` | text | **Bilingual content** |
| `document_type` | text | Resolution / certificate / etc. |
| `jurisdiction` | text | Province scope |
| `framework` | text | LSAQ / CBCA |
| `variables` | jsonb | Variable definitions for substitution |
| `status` | text | Active / draft / deprecated lifecycle |
| `validated_at` / `validated_by` / `validation_notes` | timestamp / text / text | **Lawyer-review audit trail built in** |
| `deprecated_at` / `effective_date` | timestamp / date | **Versioning built in** |
| `created_at` / `updated_at` | timestamp | Standard |

This schema is the bilingual, lawyer-reviewable, versioned architecture Dom remembered designing. It satisfies the locked export/import requirement essentially out of the box.

**Current row count: 4.** These rows are likely Phase 4d wizard-era artifacts. Status of these specific rows needs verification (active or deprecated), but the schema itself is sound.

### 2.2 The `lib/pdf-templates/*` directory — small, well-structured

7 files, 771 lines total. This is a small system, not a sprawling one:

| File | Lines | Purpose |
|---|---|---|
| `base-layout.ts` | 274 | HTML shell (page structure, fonts, headers, footers) |
| `annual-register.ts` | 141 | Annual register document template |
| `cover-page.ts` | 123 | Cover page rendering |
| `resolution-shareholder.ts` | 88 | Shareholder resolution (what generated tonight's PDF) |
| `resolution-board.ts` | 85 | Board resolution |
| `signature-blocks.ts` | 46 | Shared signature component |
| `index.ts` | 14 | Module exports |

The system handles **layout, structure, signature blocks, and HTML rendering primitives**. Content (legal body text, statutory references, document-specific phrasing) is interleaved with layout code — which is the architectural problem.

### 2.3 Active path — only 6 files import this

```
./app/api/minute-book/generate-item/route.ts
./components/documents/SignatoriesModal.tsx
./components/documents/useGenerateWithSignatories.ts
./components/documents/GenerateDocumentButton.tsx
./lib/pdf/generatePDF.ts
./lib/pdf/generatePdfDocument.ts
```

Small refactor surface. No deep coupling across the codebase.

## 3. Three Candidate Paths — Evaluation

### Path A — Stay code-based, build export tooling

**Structure:** Templates remain HTML in `lib/pdf-templates/*`. Build separate tooling that converts HTML templates to Word documents for lawyer review. Lawyer redlines come back in Word; developer manually transcribes changes back into code.

**Pros:**
- No migration effort
- Visual polish stays where rendering happens

**Cons:**
- HTML-to-Word conversion tooling is real work (~1 week effort, ongoing maintenance burden)
- Lawyer redlines don't roundtrip cleanly — every review cycle requires manual transcription
- EN templates in v1.1 = new code files, new wiring, new tests
- Adding a third language (post-launch expansion) = same multiplier
- Doesn't leverage the `document_templates` schema that already exists

**Verdict:** Fights the existing schema. Long-term operational tax. Rejected.

### Path B — Full migration to table-based

**Structure:** All template content moves into `document_templates` table. `lib/pdf-templates/*` becomes a thin renderer that pulls `template_body_fr` (or `_en`) from DB, runs variable substitution, applies layout, outputs PDF.

**Pros:**
- Pure data-driven; clean export/import via straightforward SQL or API
- Lawyer review = export rows, redline, import edits — perfect roundtrip
- EN templates in v1.1 = INSERT statements, no code changes
- Validation, versioning, deprecation already in schema
- Aligns with Dom's original architectural intent

**Cons:**
- HTML structure (signature blocks, multi-section layouts, page breaks) is hard to express purely as text in `template_body_*` columns
- Risk of templates becoming inflexible — complex layouts (e.g., two-column tables) require either rich HTML in `template_body_*` (which lawyers can't redline cleanly) or schema extension
- Larger migration effort (~1.5-2 weeks CC)

**Verdict:** Architecturally clean for content but creates new complexity for layout. Solves the export problem but creates a "lawyers redline embedded HTML" problem.

### Path C — Hybrid (RECOMMENDED)

**Structure:**
- **`lib/pdf-templates/*`** keeps HTML/layout primitives: page structure, signature blocks, headers, footers, fonts, multi-column layouts, image placement. Code where code belongs.
- **`document_templates` table** holds all **legal text content**: resolution body paragraphs, statutory references, recital language, signatory captions. Plain text or lightly-formatted Markdown — lawyer-redlinable.
- **Template rendering**: code template imports legal text from DB at render time using `template_key` → fetches `template_body_fr` (or `_en` based on `asLocale`) → substitutes variables (defined in `variables` JSONB) → renders inside the layout shell.

**Pros:**
- Lawyer review is clean: export plain-text content from DB, redline in Word, import back via SQL/API. **No HTML in lawyer's hands.**
- EN templates in v1.1 = INSERT statements with `template_body_en`. No code changes.
- Visual polish stays in code where it belongs (layout is a developer concern).
- Versioning / validation / deprecation built into existing schema.
- `validated_at` / `validated_by` give us audit trail for lawyer-approved versions.
- Smaller migration than Path B (only content moves, not structure).
- Aligns with Dom's architectural intent while respecting current code investment.

**Cons:**
- Two systems to coordinate (DB + code) — but well-defined boundary mitigates this
- Initial migration effort (~1 week CC) — extracting legal text from current code into DB rows
- Variable substitution logic must be unified (currently differs across systems per Phase 4d Stream 1 audit)

**Verdict:** Best fit for the requirement, the existing schema, and the existing code investment.

## 4. Recommendation: Path C

**Why Path C wins:**

1. **The locked export/import requirement is satisfied perfectly.** Lawyers receive plain-text content (Markdown or plain text), redline in Word, return for import. No HTML surface area for the lawyer to deal with.

2. **The schema already exists.** `document_templates` was designed for exactly this. Path C uses it as intended. Path A wastes the schema; Path B bends it to handle layout it wasn't designed for.

3. **The code investment is preserved.** `base-layout.ts` (274 lines), `signature-blocks.ts`, `cover-page.ts` are layout work that doesn't need to migrate. Only the content paragraphs move.

4. **EN templates become a content task, not an engineering task.** v1.1 EN work = drafting EN content text, getting lawyer review on it, INSERTing rows. No code changes. This makes the partnership track much easier — partner firm contributes content, not pull requests.

5. **Operational story for the lifetime of the product is clean.** Adding a third language post-launch (English Canada provinces, eventually US): INSERT statements. Annual template updates after legal changes: UPDATE statements with `validated_at` audit trail. This is data, not engineering.

## 5. Migration Plan (preliminary — CC investigation will refine)

### Phase 1 — Architecture & schema confirmation (~1 day)
- Audit current 4 rows in `document_templates` — are they active, stubs, or legacy wizard artifacts?
- Decide on content format for `template_body_fr` / `_en` — plain text? Markdown? Constrained HTML subset?
- Define variable substitution syntax (probably `{{variable_name}}` per existing wizard pattern, but verify)
- Document the layout-vs-content boundary explicitly

### Phase 2 — Content extraction (~2-3 days)
- For each existing template in `lib/pdf-templates/*`, extract legal text content into draft rows for `document_templates`
- Existing 6 templates to migrate (cover page may stay code-only — TBD)
- Each row tagged with appropriate `template_key`, `framework`, `jurisdiction`, `document_type`
- Initial `template_body_en` empty or stub-translated; v1.1 work fills these via Path C lawyer-gated process
- All rows marked `status='draft'` until validated

### Phase 3 — Renderer refactor (~2 days)
- `lib/pdf-templates/*` files refactored to fetch content from DB at render time
- Variable substitution logic unified across minute-book and any remaining wizard paths
- All 6 caller files (per current grep) verified working

### Phase 4 — Export/import tooling (~1-2 days)
- CLI script or admin UI to export template rows as a Word/Markdown document, grouped by jurisdiction + framework
- Counterpart import script that accepts edited content back and updates rows (with `validated_at`, `validated_by`, `validation_notes` populated)
- Tested end-to-end with a sample lawyer-review cycle (even self-simulated)

### Phase 5 — F1-F8 fixes folded in (~1 day)
- Tonight's findings F1-F8 from the droussy inc. PDF inspection get addressed during the content extraction phase since most are content-related (sparse body, missing statutory references, label mismatches)
- Architectural fixes (F1 date label, F3 share-class-name rendering) handled in renderer refactor

**Total estimated effort: ~7-9 days CC work** (close to the original FR PDF validation estimate, but produces a far stronger artifact: a working bilingual-ready architecture instead of just an audit).

## 6. What This Replaces

This recommendation **supersedes** the previously-drafted CC investigation brief at `/mnt/user-data/outputs/cc-investigation-brief-fr-pdf-2026-04-29.md`. That brief was scoped against the assumption that current architecture would persist; Path C invalidates that assumption.

A new CC brief should be drafted that:
- Begins with Phase 1 audit (current 4 rows + content format decisions) before any code change
- Sequences phases 2-5 above
- Addresses F1-F8 within the migration as content fixes
- Preserves investigation-only discipline at start of Phase 1 (audit before changing anything)

## 7. Risks & Mitigations

**Risk:** Variable substitution differences across systems cause subtle rendering bugs during migration.
**Mitigation:** Phase 1 includes explicit unification of substitution syntax. Phase 3 renderer refactor includes regression tests against current PDF outputs.

**Risk:** Layout/content boundary is fuzzier than expected — some "content" actually requires inline formatting (bold, italic, lists) that's easier as HTML than plain text.
**Mitigation:** Phase 1 explicitly decides content format. Markdown is a strong candidate — handles inline formatting cleanly, lawyer-friendly, easily renderable.

**Risk:** Existing 4 rows in `document_templates` cause confusion or conflicts during migration.
**Mitigation:** Phase 1 audits and decides explicitly: archive, deprecate, or migrate into new structure.

**Risk:** Migration delays the partnership demo.
**Mitigation:** Migration is ~7-9 days; demo is 2-4 weeks out. Migration completes before demo with buffer. Bilingual UI Phase 1 can run in parallel during migration.

## 8. Open Questions for CC Investigation

1. What are the 4 current rows in `document_templates` — active wizard templates, deprecated stubs, or legacy seed data?
2. What content format should `template_body_fr` / `_en` use — plain text, Markdown, or constrained HTML?
3. What's the right variable substitution syntax — keep `{{var}}`, switch to ICU, or other?
4. Does the cover page (`cover-page.ts`) belong in code (layout-only) or DB (has content)?
5. What's the export format for lawyer review — single Word doc per framework, separate docs per template, or hierarchical?

## 9. Decision Required from Dom

**Accept Path C as the chosen architecture?**

If yes:
- Memory v3.27 captures this decision as locked
- Next session opens with CC drafting Phase 1 audit brief based on this doc
- Previously-drafted FR PDF investigation brief is formally superseded

If pushback:
- Capture the concern; revise

---

**End of recommendation.**
