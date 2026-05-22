# Lawyer Export — cbca_auditor_waiver

**Source:** `lib/pdf/generatePdfDocument.ts` (REQUIREMENT_MAP line 53) + `getResolutionsForType('auditor_waiver')` (lines 84-86) + shell `lib/pdf-templates/resolution-shareholder.ts`
**Framework:** CBCA (Canada Business Corporations Act / Loi canadienne sur les sociétés par actions)
**Jurisdiction:** CA
**Category:** annual (requirement_year-scoped)
**Document title (FR):** Résolution — Dispense de vérificateur (art. 163 LCSA)
**Document title (EN):** Auditor Waiver Resolution (CBCA s.163)
**Path C status:** Not seeded in `document_templates`. The April 29 Phase 1 audit identified 4 rows in that table; none correspond to `auditor_waiver`.

---

## Current rendered body — what shareholders see today

Shell: `shareholder-resolution` template (`lib/pdf-templates/resolution-shareholder.ts`). Same shell as the LSAQ counterpart; only the title differs.

### Header band
- Right: {{companyName}} — NEQ {{neq}}

### Title block (centred)
- H1: **Résolution — Dispense de vérificateur (art. 163 LCSA)** (from `minute_book_requirements.title_fr`)
- Subtitle: Exercice fiscal {{fiscalYear}}

### Body — FR ONLY (rendered identically for FR and EN PDFs today)

> **IL EST RÉSOLU QUE :**
>
> **1. Dispense de vérificateur**
> Conformément à la loi applicable, les actionnaires consentent unanimement à ne pas nommer de vérificateur.

### Signatures
- Section label: Actionnaire
- One signature entry per active shareholder:
  - Signature line
  - {{shareholders[].name}}
  - {{shareholders[].shares}} actions ({{shareholders[].class}})
  - Date: _______________

### Footer
- Left: document title • Centre: {{companyName}} — Confidentiel — Usage interne • Right: Généré le {{resolutionDate}}

---

## Structural assessment (CC, unvalidated)

- Resolution shell is **title-consistent** (title self-identifies as "Résolution").
- Shareholder signer column is signer-correct (CBCA s.163 unanimous shareholder resolution).
- **Title ↔ body mismatch:** title self-cites "art. 163 LCSA" / "CBCA s.163"; body cites no statute.
- Body is **content-incomplete**: generic phrasing, no statutory citation, no unanimity formality language.
- Body is **FR-only** at runtime (EN PDFs render this French body inside an English shell — separately tracked).

---

## FOR LEGAL REVIEW

1. **Statutory cite — confirm and incorporate into body.**
   - Title currently self-cites **art. 163 LCSA** (FR) / **CBCA s.163** (EN).
   - Body does NOT cite the statute.
   - LSAQ counterpart unresolved: web-search lock **LSAQ art. 239** vs seed-code **LSAQ art. 223**, neither lawyer-verified — flagged in the LSAQ export.
   - **Please confirm CBCA s.163 is correct for this waiver** and provide body language that incorporates the citation (e.g., "Pursuant to section 163 of the Canada Business Corporations Act…").

2. **Body phrasing.** Replace the current single-sentence body with lawyer-validated waiver language: unanimity declaration, fiscal-year scope ({{fiscalYear}}), CBCA s.163 formalities (written resolution signed by all shareholders entitled to vote at an annual meeting).

3. **Bilingual rendering.** EN PDFs currently render the FR body. Please provide the lawyer-validated EN counterpart aligned to the confirmed FR source.

---

## Proposed structure (designed, unvalidated)

No Path C drafted body exists for this key (the `document_templates` row inventory for `auditor_waiver` is empty across both frameworks). This export is the lawyer's drafting starting point, not a redline against pre-existing prose.
