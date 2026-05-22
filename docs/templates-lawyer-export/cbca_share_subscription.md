# Lawyer Export — cbca_share_subscription

**Source:** `lib/pdf/generatePdfDocument.ts` (REQUIREMENT_MAP line 50) + `getResolutionsForType('share_subscription')` (lines 74-76) + shell `lib/pdf-templates/resolution-board.ts`
**Framework:** CBCA (Canada Business Corporations Act / Loi canadienne sur les sociétés par actions)
**Jurisdiction:** CA
**Category:** foundational (no fiscal-year subtitle)
**Document title (FR):** Lettre de souscription d'actions
**Document title (EN):** Share Subscription Letter
**Requirement description (from seed):** *"Souscription initiale des actionnaires fondateurs aux actions de la société."* / *"Initial subscription by founding shareholders to the corporation's shares."*
**Path C status:** Not seeded in `document_templates`. The April 29 Phase 1 audit identified 4 rows in that table; none correspond to `share_subscription`.

---

## Current rendered body — what is generated today

Shell: **`board-resolution`** template (`lib/pdf-templates/resolution-board.ts`). Identical body and signer model to the LSAQ counterpart; only the framework metadata differs.

### Header band
- Right: {{companyName}} — NEQ {{neq}}

### Title block (centred)
- H1: **Lettre de souscription d'actions** (from `minute_book_requirements.title_fr`)
- Subtitle: *(none — foundational category, no fiscal-year subtitle)*

### Body — FR ONLY (rendered identically for FR and EN PDFs today)

> **IL EST RÉSOLU QUE :**
>
> **1. Souscription et émission des actions**
> Le conseil autorise l'émission et la souscription des actions conformément aux résolutions initiales.

### Signatures
- Section label: **Administrateur** *(directors — NOT shareholders/subscribers)*
- One signature entry per active director:
  - Signature line
  - {{directors[].name}}
  - Administrateur
  - Date: _______________

### Footer
- Left: document title • Centre: {{companyName}} — Confidentiel — Usage interne • Right: Généré le {{resolutionDate}}

---

## Structural assessment (CC, unvalidated)

Three-way mismatch identical to the LSAQ counterpart:

1. **Genre mismatch.** Title says "Lettre" / "Letter" (letter / agreement genre). Shell renders a resolution.
2. **Signer mismatch.** Description says founding shareholders subscribe. Shell signs with directors.
3. **Content mismatch.** Subscription requires per-subscriber detail (class, quantity, price paid, consideration tendered). Body is a single generic FR line with no subscriber data.

Available variables in scope at render time that the current template does NOT surface:
- `shareholders[]` (name, shares, class) — loaded at `generatePdfDocument.ts:188-215` but ignored by `board-resolution` shell.
- Per-subscriber price/consideration — **not loaded today**; no schema field plumbed.

---

## OPEN QUESTION FOR LEGAL

**Genre fork — please decide.** Two valid product interpretations exist; current code implements neither cleanly:

- **(A) Subscriber-signed subscription letter.** Each founding shareholder signs an instrument stating they subscribe to a stated number of shares of a stated class at a stated price. Signer = each shareholder. Body = per-subscriber subscription terms. This is what the title + description point to.

- **(B) Board resolution authorizing issuance.** The board passes a resolution authorizing the corporation to issue shares to named subscribers in stated quantities/classes/prices. Signer = directors. Body = authorizing resolution. This is what the current render approximates, badly (no subscriber detail).

The current production render is shell-B but with title-A and description-A — neither lawyer nor product currently has a clean answer to give a founder asking "what is this document?"

**Additional question:** is a *companion* board-authorization document also expected alongside the subscriber letter (the standard CBCA pattern is: board resolves under s.25 to issue → subscribers tender subscription letters → share certificates issue)? If yes, this requires either two separate `requirement_key`s or a multi-page composite template.

---

## Required body content (once genre is locked)

If **(A) subscription letter:**
- Preamble identifying subscriber ({{shareholders[i].name}}) and corporation ({{companyName}}, NEQ {{neq}}).
- Subscription terms: class ({{shareholders[i].class}}), quantity ({{shareholders[i].shares}}), price per share ({{NOT_LOADED_TODAY}}), total consideration ({{NOT_LOADED_TODAY}}).
- Representations / acknowledgements as required.
- Signature: {{shareholders[i].name}}, dated.
- One document per subscriber, OR one document with per-subscriber sections (lawyer decides).

If **(B) board authorization resolution:**
- Resolution body authorizing issuance to each subscriber with class + quantity + price + consideration enumerated.
- Director signatures (existing shell is fine).
- CBCA statutory cite if applicable (s.25 governs share issuance; please confirm).

---

## Proposed structure (designed, unvalidated)

No Path C drafted body exists for this key (the `document_templates` row inventory for `share_subscription` is empty across both frameworks). This export is the lawyer's drafting starting point, not a redline against pre-existing prose.
