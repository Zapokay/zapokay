# Audit — Template structure for auditor-waiver + share-subscription doctypes

**Date:** 2026-05-22
**Author:** Claude Code (CC) — Session #18 INVESTIGATION ONLY
**Status:** Investigation complete. No app code changed. Path C verdict + per-doctype "what renders today" + auditor-waiver/subscription fix-shape verdicts captured below for Dom + lawyer review.
**Memory version at time of audit:** v3.51
**Cross-references:**
- `docs/audit-nb-pdf-title-2026-05-20.md` §7 (open questions — `lib/pdf-templates/*.ts` shadowing surface; auditor-waiver/subscription structural correctness was the §7 follow-up that triggered this audit)
- `docs/audit-template-architecture-phase1-2026-04-29.md` §0, §2, §F8 (Path C design + statutory placement open question)
- `docs/template-architecture-recommendation-2026-04-29.md` (Path C product rationale)
- `ZapOkay_Project_Memory_Core.md` §5 E.6 (`document_type` taxonomy — resolution / pv / certificate)
- Lawyer-ready exports: `docs/templates-lawyer-export/{lsaq_auditor_waiver,cbca_auditor_waiver,lsaq_souscription_actions,cbca_share_subscription}.md`

---

## 1. Bug summary

Four `requirement_key`s flagged by Dom for soft-launch gating produce PDFs that diverge from their declared title and description:

| Key | Title (FR / EN) | Current shell | Body content | Fitness |
|---|---|---|---|---|
| `lsaq_auditor_waiver` | Résolution — Dispense de vérificateur / Auditor Waiver Resolution | shareholder-resolution | 1-line generic FR, no statutory cite | Shell OK; body deficient |
| `cbca_auditor_waiver` | Résolution — Dispense de vérificateur (art. 163 LCSA) / Auditor Waiver Resolution (CBCA s.163) | shareholder-resolution | Same 1-line generic FR, title-cite not in body | Shell OK; title↔body mismatch + body deficient |
| `lsaq_souscription_actions` | Lettre de souscription d'actions / Share Subscription Letter | **board-resolution** | 1-line "Le conseil autorise" FR | Three-way mismatch (genre + signer + content) |
| `cbca_share_subscription` | Lettre de souscription d'actions / Share Subscription Letter | **board-resolution** | Same 1-line FR | Three-way mismatch (genre + signer + content) |

This audit captures the active render path, classifies the fix shape for each, and surfaces the product+legal questions that gate Phase B drafting.

---

## 2. Active render path — Path A / B / C verdict

**Verdict: Path A pure (hardcoded code templates). Path C is NOT live.**

### Evidence

- `document_templates` table: **absent from every tracked migration** in `supabase/migrations/` (verified by `Grep` over the directory, zero matches for `document_templates`, `template_body_fr`, `template_body_en`).
- Zero references to `document_templates` in `lib/` or `app/` (Grep clean).
- The April 29 Phase 1 audit (`docs/audit-template-architecture-phase1-2026-04-29.md` §2.1) found 4 rows DO exist in prod Supabase (seeded 2026-04-04 outside the migration pipeline) — but the audit itself confirmed: *"fully orphaned from runtime, and is also absent from supabase/schema.sql and every tracked migration."*
- The 4 rows cover `annual_board_resolution_{lsaq,cbca}` + `annual_shareholder_resolution_{lsaq,cbca}` only — **none of the 4 keys in this audit's scope.**

### Active render chain

1. API entry: `app/api/minute-book/generate-item/route.ts` (and `app/api/wizard/generate/route.ts` for catch-up wizard) → both call `generatePdfDocument(...)`.
2. `lib/pdf/generatePdfDocument.ts` resolves `REQUIREMENT_MAP[requirementKey]` (**lines 39-54**, 12 keys) to `{ type, resolutionType }`.
3. Title comes from `minute_book_requirements.title_{fr,en}` (line 154, language-branched).
4. Body comes from `getResolutionsForType(resolutionType)` (**lines 62-89**) — a hardcoded FR-only dictionary keyed by `resolutionType`. **No `language` parameter.**
5. Template payload assembled at lines 226-238 and passed to `generatePDF({ type: mapping.type, data })` (line 241).
6. Dispatch to `boardResolutionHTML` or `shareholderResolutionHTML`, both of which wrap `baseLayoutHTML`.

No DB-template machinery is consulted at any point. `document_templates` is dead in the runtime graph.

### Line-number reconciliation (memory amendment)

| Symbol | Memory said | Actual | Delta |
|---|---|---|---|
| `REQUIREMENT_MAP` | 43-53 | 39-54 (12 keys span 41-53) | minor |
| `getResolutionsForType` | 62-89 | 62-89 | exact |
| Body FR-only | claimed | confirmed (no `language` param) | confirmed |

---

## 3. Per-doctype "what renders today"

Detailed FR/EN-aware body captures with literal placeholders live in the 4 lawyer-ready exports. Summary table:

| Key | Shell | Body source | Signer column | Statutory cite in title | Statutory cite in body |
|---|---|---|---|---|---|
| `lsaq_auditor_waiver` | shareholder-resolution | `auditor_waiver` (1 res, FR) | Actionnaire | none | none |
| `cbca_auditor_waiver` | shareholder-resolution | `auditor_waiver` (1 res, FR) | Actionnaire | art. 163 LCSA / CBCA s.163 | **none — title↔body mismatch** |
| `lsaq_souscription_actions` | **board-resolution** | `share_subscription` (1 res, FR) | **Administrateur** | none | none |
| `cbca_share_subscription` | **board-resolution** | `share_subscription` (1 res, FR) | **Administrateur** | none | none |

Critical cross-doctype observations:
- All bodies render as French regardless of requested `language`. EN PDFs receive an English shell wrapping French body prose (separately tracked as Tier 3 #75 in Queue v3.51).
- Both subscription keys route to `board-resolution`, but their `minute_book_requirements` titles/descriptions point to a shareholder-signed letter genre.
- Both auditor-waiver keys route to `shareholder-resolution` (signer-correct), but bodies omit the statutory citations the titles promise.

---

## 4. Template machinery capability assessment

### 4.1 Genres expressible in `baseLayoutHTML`

`lib/pdf-templates/base-layout.ts` exposes a generic shell: header (company + NEQ) → title block (H1 + subtitle + separator) → arbitrary `bodyContent` HTML string → footer (doc name • company + "Confidentiel" • generated-on date).

CSS classes prewired in the shell:
- `.resolved` — centred uppercase "IL EST RÉSOLU QUE :" framing (resolution genre)
- `.resolution-item` / `.resolution-body` — numbered resolution items
- `.signatures` / `.sig-col` / `.sig-entry` / `.sig-line` / `.sig-name` / `.sig-title` / `.sig-date` — signature blocks (re-usable across genres)
- `table.register` — register-genre table styling

**No dedicated styling exists for a letter / agreement / consent / certificate genre.** The shell is genre-agnostic at the markup level (`bodyContent` is free-form HTML), but no convention exists today for prose-letter body composition.

### 4.2 Signature primitive reusability

`signatureBlocksHTML` in `lib/pdf-templates/signature-blocks.ts` accepts a `Signatory[]` (id + name + role) and renders a 2-column layout with section label "Signatures autorisées" / "Authorized Signatures". The `Signatory[]` is plumbed end-to-end (caller override at `GeneratePdfDocumentParams.signatories` → templateData → both resolution templates). **This primitive can host shareholder, director, or mixed signers without modification.**

### 4.3 Can auditor-waiver live in the existing shareholder-resolution shell?

**Yes.** Title self-identifies as "Résolution"; shell is genre-consistent; signer column is signer-correct. The only fix is *content*: rewrite the `auditor_waiver` body entry in `getResolutionsForType` to (a) include the correct statutory citation per framework, (b) carry lawyer-validated waiver language, (c) become locale-aware (which requires plumbing a `language` parameter into `getResolutionsForType` — a Tier 3 follow-up #75 already banked).

No new template module. No new shell. No REQUIREMENT_MAP routing change.

### 4.4 Can share-subscription live in any existing shell?

**No, not cleanly.** Three options exist, all requiring product+legal direction first (see §6):

- **Option A — new `subscription-letter.ts` template module.** Letter-genre prose body, per-subscriber detail (class + quantity + price), subscriber signature. New REQUIREMENT_MAP `type` value. New CSS classes likely needed (no `.resolved` framing; new layout for per-subscriber blocks).
- **Option B — reuse shareholder-resolution shell with empty `resolutions[]` + custom body injection via `bodyContent` override.** Possible if `shareholderResolutionHTML` accepts a custom body path — but it does not today; signature is "Actionnaire" hardcoded. Would require shell modification.
- **Option C — keep board-resolution shell, fix only the body to enumerate per-subscriber detail.** Treats subscription as a board authorization (legal interpretation B in §6). Smaller fix; still needs body rewrite and possibly new fields loaded into the template payload (price, consideration).

---

## 5. Verdicts

### 5.1 Auditor-waiver = SMALLER-FIX-IN-EXISTING-SHELL — YES

Both keys can be fixed with body-only changes inside the current shareholder-resolution shell, contingent on lawyer-validated body prose with correct statutory citations.

### 5.2 Subscription = NEEDS-NEW-LAYOUT — YES (subject to product+legal genre decision)

Current render is structurally insufficient regardless of interpretation. Missing pieces:

1. **Genre.** Title says "Lettre" / "Letter"; no letter genre exists in the shell.
2. **Signer model.** Subscription letters are subscriber-signed; current routing emits director signatures.
3. **Per-subscriber detail.** Class, quantity, price, consideration — none surfaced today.
4. **Body content.** Single generic FR sentence; lawyer-validated letter prose required.
5. **Optional company counter-signature.** Reusable via existing `Signatory[]` override; no new primitive needed.

If product+legal pick interpretation **B** (board authorization resolution), the fix narrows to Option C in §4.4 — body rewrite + new fields loaded. If they pick **A** (subscriber-signed letter), Option A in §4.4 applies — new template module.

---

## 6. Open questions for product+legal

### 6.1 Auditor-waiver statutory citations

- **LSAQ side — internal sources disagree:**
  - A May-2026 internal web-search check landed on **LSAQ art. 239** as the Quebec equivalent of CBCA s.163 — recorded in project memory (Queue §15 Q2 LOCKED May 14, 2026), **NOT lawyer-verified**.
  - `compliance_rules` seed (`supabase/migrations/20260330000000_compliance_engine.sql:51`) cites **LSAQ art. 223** — code-vs-memory drift not yet reconciled.
  - Phase 1 audit §F8 left this open as a product+legal question; the May 14 Q2 lock partially answered it via web search but lawyer confirmation is the gating requirement.
- **CBCA side:** title self-cites **art. 163 LCSA / CBCA s.163**. Body must be brought into alignment.
- **Lawyer ask:** confirm governing articles per framework; draft body language that incorporates the citation.

### 6.2 Subscription genre fork

Two valid interpretations of "Lettre de souscription d'actions":
- **(A) Subscriber-signed subscription letter** — each shareholder signs an instrument with class + quantity + price. Signer = each shareholder. Body = per-subscriber subscription terms.
- **(B) Board resolution authorizing issuance** — board passes a resolution authorizing issuance to named subscribers in stated quantities/classes/prices. Signer = directors.

Current render is shell-B with title-A and description-A — neither answer is cleanly delivered.

**Companion-document question:** is a *separate* board-authorization document also expected alongside the subscriber letter (standard pattern: board resolves → subscribers tender letters → certificates issue)? If yes, this is two `requirement_key`s, not one.

### 6.3 Bilingual rendering (cross-cutting)

`getResolutionsForType` is FR-only. EN PDFs render English shells around French bodies. This affects all 12 `requirement_key`s in REQUIREMENT_MAP, not just the 4 in this audit. Banked as Tier 3 #75 in Queue v3.51. Resolution requires either (a) Path C activation per the April 29 recommendation, or (b) extending `getResolutionsForType` with locale branches per template body.

---

## 7. Recommended next steps (CC, unvalidated — Dom decides)

1. **Lawyer review of 4 exports.** Send `docs/templates-lawyer-export/*.md` for body drafting + statutory-cite confirmation + genre fork resolution.
2. **Product+legal decision on subscription genre** (A vs B from §6.2) and companion-document question.
3. **Phase B scoping.** Once §6 is resolved, scope two atoms:
   - Atom 1 (auditor-waiver): body rewrite in `getResolutionsForType` + locale plumbing — small, contained to one function and the REQUIREMENT_MAP.
   - Atom 2 (subscription): scope depends on §6.2 outcome; if Option A, new template module; if Option B, body rewrite + new template payload fields.
4. **Re-evaluate Path C activation timing.** The April 29 recommendation locked Path C; the 4 orphaned rows + statutory-cite + genre questions surfacing here may make Path C activation the cleanest path once lawyer-validated bodies exist. Re-decide after §6 resolves.

---

## 8. Honest gaps

- No MCP/SQL execution tool was available in this session. The Path C verdict relies on the April 29 Phase 1 audit's row inventory + 2026-05-22 repo-grep evidence. A fresh row probe was not performed; if the 4 rows were deleted or modified since April 29, this audit would not detect it.
- `lib/pdf/generatePDF.ts` (the Puppeteer adapter) and the 4 caller routes were not re-read in this session — they are upstream of the body-substitution problem and do not affect the verdicts. Readable on request.
- CBCA s.25 reference in the subscription export (`cbca_share_subscription.md`) is CC's read of the issuance-authority statute, not a lawyer-validated citation. Listed as a candidate, flagged for confirmation.
- LSAQ subscription statutory placement was not researched; the LSAQ subscription export lists this as a lawyer question, not a CC finding.
- Initial draft of this audit + the 4 exports mis-cited "LSAQ Art. 262" as a memory reference; corrected in-session (2026-05-22) to "LSAQ art. 239" per Queue §15 Q2 lock of May 14, 2026 (web-search confidence, lawyer-unverified). The "262" value originated in CC's stale recollection of pre-May-14 memory (`Old/ZapOkay_Project_Memory_*.md`), not current state. The 239/223 lawyer question remains open on Dom's legal side track.
