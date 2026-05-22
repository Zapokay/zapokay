# Lawyer Export — lsaq_auditor_waiver

**Source:** `lib/pdf/generatePdfDocument.ts` (REQUIREMENT_MAP line 46) + `getResolutionsForType('auditor_waiver')` (lines 84-86) + shell `lib/pdf-templates/resolution-shareholder.ts`
**Framework:** LSA (Loi sur les sociétés par actions du Québec)
**Jurisdiction:** QC
**Category:** annual (requirement_year-scoped)
**Document title (FR):** Résolution — Dispense de vérificateur
**Document title (EN):** Auditor Waiver Resolution
**Path C status:** Not seeded in `document_templates`. The April 29 Phase 1 audit identified 4 rows in that table; none correspond to `auditor_waiver`.

---

## Current rendered body — what shareholders see today

Shell: `shareholder-resolution` template (`lib/pdf-templates/resolution-shareholder.ts`).

### Header band
- Right: {{companyName}} — NEQ {{neq}}

### Title block (centred)
- H1: **Résolution — Dispense de vérificateur** (from `minute_book_requirements.title_fr`)
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
- Shareholder signer column is signer-correct (LSAQ auditor waiver is shareholder-executed).
- Body is **content-incomplete**: no statutory citation, generic phrasing.
- Body is **FR-only** at runtime (EN PDFs render this French body inside an English shell — separately tracked).

---

## FOR LEGAL REVIEW

1. **Statutory cite — internal sources disagree, please confirm.** (a) A May-2026 internal web-search check landed on **LSAQ art. 239** as the Quebec equivalent of CBCA s.163 — recorded in project memory, **NOT lawyer-verified**. (b) The `compliance_rules` seed (migration `20260330000000_compliance_engine.sql:51`) cites **LSAQ art. 223**. (c) CBCA counterpart self-cites **art. 163 LCSA**. Please confirm the governing LSAQ article.

2. **Body phrasing.** The current single-sentence body must be replaced with lawyer-validated waiver language: unanimity declaration, fiscal-year scope ({{fiscalYear}}), any required formalities under the confirmed statute.

3. **Bilingual rendering.** EN PDFs currently render the FR body. Please provide the lawyer-validated EN counterpart aligned to the confirmed FR source.

---

## Proposed structure (designed, unvalidated)

No Path C drafted body exists for this key (the `document_templates` row inventory for `auditor_waiver` is empty across both frameworks). This export is the lawyer's drafting starting point, not a redline against pre-existing prose.
