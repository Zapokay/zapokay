# Signature Block Title Convention — v1.0 LOCKED

**Status:** v1.0 LOCKED — May 14, 2026
**Author:** Max (CTO)
**Reviewers signed off:** Dom (FR-language fidelity, Quebec legal-section refs, scope locks)
**Pending reviewer:** Aria (PDF visual layout / typography — non-blocking for spec lock; blocks PDF template implementation in Phase 10A.5 atom 4)
**Origin:** Q-OFFICER-SIG-1 Concern 1 (signature title fidelity for due diligence)
**Companion docs:**
- `docs/audit-dirigeants-2026-05-12.md` §6 (origin gap)
- `docs/investigations/trust-and-joint-shareholder-data-model-2026-05-14.md` (CC gap analysis)
- `docs/proposals/phase-10a5-decomposition-2026-05-14.md` (implementation plan)
- `docs/decisions/q-officer-sig-1-closure-2026-05-14.md` (Concern 2 + 3 deferral — to author)

**Changes from v0.1:** Q1 LOCKED Yes (trusts), Q2 LOCKED LSAQ art. 239 / CBCA s. 163, Q3 LOCKED inclusive forms, Q4 LOCKED Yes (joint holders). Decision A LOCKED (A.2 separate `shareholder_entities` table). Decision B LOCKED (generalize entity types to include corporations). §4.2 expanded with three new sub-cases (trust, corporate, joint). §10 transitions from Open Questions to Locked Decisions.

---

## 1. Purpose

Lock the canonical signature block convention for every document type ZapOkay generates in v1.0. The convention drives three things in the PDF rendering pipeline:

1. The **closing-sentence string** that precedes the signature block and establishes signing capacity.
2. The **signature line format** per signatory type (individual / trust / corporation).
3. The **per-signatory grouping** when shareholders include trusts, corporations, or joint holders.

This is the spec the Phase 10A.5 data model and Phase 10B as-of-date resolver both consume.

---

## 2. Scope

### In scope (v1.0 generated documents)

| Doc type | Template keys | Signatory capacity |
|---|---|---|
| Founding board resolution | `founding_board_resolution_lsaq`, `_cbca` | Director(s) at incorporation date |
| Founding shareholder resolution | `founding_shareholder_resolution_lsaq`, `_cbca` | Founding shareholder(s) |
| Annual board resolution | `annual_board_resolution_lsaq`, `_cbca` | Director(s) as-of fiscal year end |
| Annual shareholder resolution | `annual_shareholder_resolution_lsaq`, `_cbca` | Shareholder(s) as-of fiscal year end |
| Auditor waiver resolution | `auditor_waiver_lsaq`, `_cbca` | Shareholder(s) (unanimous consent) |
| Share subscription letter | `share_subscription_lsaq`, `_cbca` | The subscriber |
| Director acceptance form | `cbca_director_acceptance`, `lsaq_acceptation_mandat` (post S10-TR-13) | The appointed director (unilateral) |

### Shareholder types in scope (v1.0)

- **Individual shareholder** — a natural person
- **Trust shareholder** — a Quebec or other-jurisdiction trust, signing through one or more trustees (`fiduciaires`)
- **Corporate shareholder** — a corporation (Quebec or federal), signing through an authorized officer
- **Joint holders** — two or more individuals co-owning a single shareholding (e.g., spouses)

### Out of scope (upload-only in v1.0, generated post-v1.0)

- Share certificates — Pattern D (officer-capacity)
- By-Law No. 1 / No. 2 adoption — Pattern C (secretary-capacity)
- Third-party contracts — Pattern D/E
- Ad-hoc resolutions beyond the v1.0 set (dividend, share repurchase, etc.)
- Public-offering shareholders — `is_primary_signing_authority` toggle deferred per Q-OFFICER-SIG-1 Concern 3

---

## 3. Core Principle

> **Capacity in which the document is signed determines the signature block format. Officer titles do not appear on documents signed in director or shareholder capacity.**

The capacity statement lives in the **closing sentence** preceding the signature lines, not embedded in the signature lines themselves. This mirrors the dominant Quebec law-firm convention (verified against the seven sample documents Dom collected May 14, 2026).

A person who holds both a director mandate and an officer appointment (e.g. Président-secrétaire) signs a board resolution as `[NAME]` only — their officer title does *not* appear on that signature line. Their officer title only surfaces when they sign a document in officer capacity (out of v1.0 generated scope).

**For entity shareholders (trust and corporation), the entity is the legal shareholder; the human signatory signs in representative capacity.** The signature block must surface both: entity name as header, individual signer with their representative role on a `Par : / Per:` line.

---

## 4. The Cell Table

Convention per (doc type × signatory case). All strings render bilingually per `users.preferred_language` — per-locale, not side-by-side. EN copy in §5.

### 4.1 Board resolutions

| Sub-case | Closing sentence (FR canonical) | Signature lines |
|---|---|---|
| 1 director | `Les résolutions qui précèdent sont par les présentes adoptées et signées par le seul administrateur de la Société.` | `[NAME]` (bold caps, no title) — Pattern A |
| 2+ directors | `Les résolutions qui précèdent sont par les présentes adoptées et signées par tous les administrateurs de la Société.` | `[NAME]` per director (bold caps, no title), one line per signatory |

### 4.2 Shareholder resolutions (general, including annual)

The closing sentence is uniform regardless of underlying shareholder entity types. Per-signatory rendering branches based on shareholder type.

| Sub-case | Closing sentence (FR canonical) |
|---|---|
| 1 shareholder (any type) | `Les présentes résolutions sont par les présentes adoptées et signées par l'unique actionnaire de la Société.` |
| 2+ shareholders (any types) | `Les présentes résolutions sont par les présentes adoptées et signées par tous les actionnaires de la Société habiles à voter en l'occurrence.` |

### 4.2.1 Per-signatory rendering — by shareholder entity type

**Individual shareholder:**
```
[NAME]
```
(bold caps, single line, no title — Pattern B individual)

**Trust shareholder (1+ trustees):**
```
[TRUST LEGAL NAME]

Par : ____________________________
        [Trustee Name 1], fiduciaire

Par : ____________________________
        [Trustee Name 2], fiduciaire
```
(Entity name in bold caps as header. One `Par :` line per trustee. Pattern B trust.)

**Corporate shareholder:**
```
[CORPORATION LEGAL NAME]

Par : ____________________________
        [Officer Name], [Officer Title]
```
(Entity name in bold caps as header. Single `Par :` line for the authorized signing officer. Title is the officer's role — `président`, `secrétaire`, `administrateur autorisé`, etc.)

**Joint holders (2+ co-owners of a single shareholding):**
```
[NAME 1] et [NAME 2]
```
(Single signature line with both names joined by `et`. If three or more, comma-separated with `et` before the last: `[NAME 1], [NAME 2] et [NAME 3]`. Pattern B joint.)

> **Note on joint + entity interactions:** joint-holder support in v1.0 is scoped to **joint individuals only.** A trust co-owning a shareholding with an individual is out of scope; if encountered, the data model rejects the configuration and the UI gates with "Use separate shareholdings instead." Same constraint applies to corp+individual joint holding.

### 4.3 Auditor waiver (LSAQ art. 239 / CBCA s. 163)

LSAQ article 239 is the Quebec equivalent to CBCA section 163: a corporation that does not make a public offering may decide by unanimous shareholder consent not to appoint an auditor. This requires the consent of every shareholder, including those who would not otherwise be entitled to vote.

| Sub-case | Closing sentence (FR canonical) |
|---|---|
| 1 shareholder | `La présente résolution est par les présentes adoptée et signée à l'unanimité par l'actionnaire unique de la Société, conformément à [l'article 163 LCSA \| l'article 239 LSAQ].` |
| 2+ shareholders | `La présente résolution est par les présentes adoptée et signée à l'unanimité par tous les actionnaires de la Société, conformément à [l'article 163 LCSA \| l'article 239 LSAQ].` |

Per-signatory rendering follows §4.2.1 (individual / trust / corporate / joint).

### 4.4 Share subscription letter

| Sub-case | Convention | Signature line |
|---|---|---|
| Single subscriber (individual) | Document title (`Lettre de souscription d'actions`) establishes capacity. | `[NAME]` (bold caps) below effective date — Pattern F |
| Single subscriber (trust or corporation) | Same document title; body modified to declare entity as subscriber. | Entity-block per §4.2.1 |

### 4.5 Director acceptance form (post S10-TR-13)

| Sub-case | Convention | Signature line |
|---|---|---|
| Single director acceptance | Body declares: `Je, soussigné·e, [NAME], accepte le mandat d'administrateur·trice de [LEGAL_NAME] à compter du [START_DATE], conformément aux articles applicables de [la LCSA \| la LSAQ].` | `[NAME], administrateur·trice` (capacity restated on signature line — unilateral declaration) |

**Gender convention LOCKED:** spec uses inclusive Quebec FR forms (`administrateur·trice`, `soussigné·e`, `comptable agréé·e`) throughout. EN side uses gender-neutral terms naturally.

---

## 5. Closing Sentence Library — EN parity

Per-locale render. EN canonical strings for each FR string above:

| FR canonical | EN canonical |
|---|---|
| `...adoptées et signées par le seul administrateur de la Société.` | `...adopted and signed by the sole director of the Corporation.` |
| `...adoptées et signées par tous les administrateurs de la Société.` | `...adopted and signed by all the directors of the Corporation.` |
| `...adoptées et signées par l'unique actionnaire de la Société.` | `...adopted and signed by the sole shareholder of the Corporation.` |
| `...adoptées et signées par tous les actionnaires de la Société habiles à voter en l'occurrence.` | `...adopted and signed by all the shareholders of the Corporation entitled to vote thereon.` |
| `...adoptée et signée à l'unanimité par l'actionnaire unique...conformément à l'article 163 LCSA.` | `...unanimously adopted and signed by the sole shareholder...pursuant to section 163 of the CBCA.` |
| `...adoptée et signée à l'unanimité par tous les actionnaires...conformément à l'article 239 LSAQ.` | `...unanimously adopted and signed by all the shareholders...pursuant to section 239 of the Quebec Business Corporations Act.` |
| `Je, soussigné·e, [NAME], accepte le mandat d'administrateur·trice...` | `I, the undersigned, [NAME], accept the mandate of director...` |
| `[NAME], administrateur·trice` (signature label) | `[NAME], Director` |
| `Par : [Trustee Name], fiduciaire` (trust per-trustee line) | `Per: [Trustee Name], Trustee` |
| `Par : [Officer Name], [Title]` (corporate signing officer) | `Per: [Officer Name], [Title]` (Title translates if standard: `président`→`President`, `secrétaire`→`Secretary`) |
| `[NAME 1] et [NAME 2]` (joint holders) | `[NAME 1] and [NAME 2]` |

---

## 6. Signature Line Formats

Typography convention from the source documents:

- **Bold uppercase name** for the signatory line.
- Signature space anchored to a horizontal line.
- **No title under the name** in director/shareholder capacity — capacity is in the closing sentence above.
- **For trust shareholders:** trust legal name in bold uppercase as header, then `Par :` lines with `[Trustee], fiduciaire` label (matches Image 5).
- **For corporate shareholders:** corporation legal name in bold uppercase as header, then `Par :` line with `[Officer], [Title]` label.
- **For joint holders:** single signature line with both names joined inline; if signature space requires separate lines, fall back to per-individual signature lines under a shared `Par :` heading (Aria implementation detail).

**Aria action:** lock font weights, spacing, indents, and signature-line geometry in the PDF template style sheet. Current `lib/pdf-templates/*` uses Helvetica; sample documents suggest Times-family serif body + bold sans-serif caps for signature names — confirm desired aesthetic.

---

## 7. Pattern References (real-document validation)

Seven samples Dom captured May 14, 2026:

| Pattern | Sample | What it validates |
|---|---|---|
| A — Sole-director board resolution | Images 4, 6 | Closing sentence `...par le seul administrateur de la Société.` + name-only signature line |
| B individual | Image 5 bottom signature | Bold caps `DOMINIQUE ROUSSY` for individual shareholder |
| B trust | Image 5 top block | `FIDUCIE FAMILIALE ROUSSY` header + per-trustee `Par : [Name], fiduciaire` (three trustees) |
| B corporate | (No QC sample; convention from QC practice) | Corporation name as header + `Par : [Officer], [Title]` line |
| B joint | (No QC sample; convention from QC practice) | Single line `[NAME 1] et [NAME 2]` |
| C — By-law adoption (OUT v1.0) | Image 7 | `ADOPTÉ ... RATIFIÉ ...` + `NAME, Secrétaire`. Reserved for Phase 10F. |
| D — Officer-capacity (OUT v1.0) | Image 1 | `Président-secrétaire` italic format. Reserved for share-cert and contract gen. |
| E — Trust as contracting party (EN) | Image 2 | `FIDUCIE FAMILIALE ROUSSY / Per: Dominique Roussy, Trustee` |
| F — Identity-only signature | Image 3 | Subscription / share-cert front pattern — name only with effective date |

> **Aria action:** source one example each of B-corporate and B-joint from real Quebec corporate documents to complete the visual reference set before PDF template implementation in Phase 10A.5 atom 4.

---

## 8. Edge Cases

### 8.1 No directors

Hard-error rather than render unsigned resolution. Actionable error surfaces back to Administrateurs surface.

### 8.2 Director who later resigned, resolution dated when active

Phase 10B as-of-date resolver handles. Resolution dated 2024-12-31 lists directors whose `director_mandates.appointment_date <= 2024-12-31 AND (end_date IS NULL OR end_date > 2024-12-31)`. Convention strings follow as-of-date count.

### 8.3 Single director who is also single officer (Président-secrétaire)

Person signs board resolution as `[NAME]` only (Pattern A). Officer title `Président-secrétaire` does NOT appear here. Officer title surfaces only on share cert / by-law / contract (post-v1.0).

### 8.4 Joint shareholders (LOCKED in scope per Q4)

Joint holders are individuals co-owning one shareholding. Per §4.2.1 joint-holder convention. **Constraint:** v1.0 joint holders are individuals only. Mixed-type joint holdings rejected; UI directs to separate shareholding rows instead.

### 8.5 Non-resident director conventions

25% Canadian residency rule does not change signature block convention. Residency surfaces in registers and certificate listings, not signature blocks.

### 8.6 Catch-up wizard signature attribution

Each retroactive resolution's signatory list is as-of the resolution date (Phase 10B). UI warns: "Verify that listed signatories were actually in office on the resolution date" — matches QC law-firm practice of user-confirmation on historical signatures.

### 8.7 Declined director appointment

A director whose `acceptation du mandat` was declined was never legally a director. Does not appear in signature lists. Phase 10B + S10-TR-13 handle state machine.

### 8.8 Trust dissolution / trustee change mid-period

Trustee roster is temporal (same pattern as director mandates — designed in Phase 10A.5 atom 1). As-of-date resolver returns trustees in office on the resolution date.

### 8.9 Corporate shareholder whose authorized signing officer changes

Same as 8.8 — corporate authorized-signatory record is temporal.

### 8.10 Ownership chain (single-shareholder corp that is itself owned by trust/holdco)

Pure ownership chain. Does not change v1.0 signature convention. The Société's shareholder is the trust/holdco; the trust/holdco's internal ownership structure is not surfaced on the Société's resolutions.

---

## 9. Bilingual Rendering Rules

1. **Per-locale, not side-by-side.** User selects document language per generation.
2. **Locale source = `documents.language`** at generation time. Independent from `companies.legal_name_fr` vs `legal_name_en`.
3. **Legal-section refs translate.** FR↔EN section ref pairing per §5.
4. **Entity names** (trust, corporation) render in canonical legal form regardless of locale (`FIDUCIE FAMILIALE ROUSSY`, `9876-5432 QUÉBEC INC.` are proper nouns). `Par : / Per:` and role labels translate.
5. **Inclusive forms LOCKED for FR.** `administrateur·trice`, `soussigné·e`, `comptable agréé·e`. EN uses naturally gender-neutral terms.

---

## 10. Locked Decisions

### Q1 — Trust shareholders in v1.0 scope
**LOCKED YES** (May 14, 2026). §4.2.1 trust-block convention applies. Implementation in Phase 10A.5.

### Q2 — LSAQ section reference for auditor waiver
**LOCKED:** `LSAQ article 239` (QC equivalent of CBCA s. 163). Allows non-public-offering corporations to waive auditor by unanimous shareholder consent. EN: "section 239 of the Quebec Business Corporations Act."

### Q3 — Inclusive gendered forms vs strict masculine
**LOCKED:** inclusive forms applied consistently across FR strings.

### Q4 — Joint shareholders in v1.0 scope
**LOCKED YES** (May 14, 2026). §4.2.1 joint-holder convention applies. v1.0 constraint: individuals-only joint holders (per §8.4).

### Decision A — Schema shape for entity-typed shareholders
**LOCKED A.2** (May 14, 2026). Separate `shareholder_entities` table with polymorphic FK from `shareholdings` / `shareholding_holders`. Cleaner row-shape separation. Detailed design in `docs/proposals/phase-10a5-decomposition-2026-05-14.md`.

### Decision B — Corporate shareholders generalization
**LOCKED: generalize now** (May 14, 2026). `shareholder_entities.entity_type` is `ENUM('trust', 'corporation')`. Corporate shareholders are v1.0 supported.

---

## 11. Dependencies & Consumers

### Consumes

Nothing. Foundational convention spec.

### Consumed by

- **Phase 10A.5 brief** (`docs/proposals/phase-10a5-decomposition-2026-05-14.md`) — implementation of `shareholder_entities` + `shareholding_holders` + per-type UI + PDF render branching. **Blocks Phase 10B.**
- **Phase 10B brief** — as-of-date resolver feeds this convention with historical signatory roster, branching per entity type.
- **PDF template implementation** at `lib/pdf/generatePdfDocument.ts` + `lib/pdf-templates/*`. Templates source closing-sentence strings + signature-line formats from this spec.
- **`document_templates` table rows** (12 rows per Path C Phase 2 + 2 post-S10-TR-13) reference this spec for body content.
- **Catch-up wizard** — uses §8.6 attribution rule.
- **i18n string registry** — closing sentences and labels enter FR/EN string tables (e.g. `signatures.closing.board.sole_director.fr`).

---

## 12. Versioning & Change Control

- **v0.1 (May 14, 2026):** Initial draft. Q1–Q4 open.
- **v1.0 (May 14, 2026):** All six decisions locked. Aria visual review pending but non-blocking.
- **Future revisions:** Each lifecycle gate (Phase 10F officer-signed doc generation, contract generation) extends with new cells. v1.0 cells must not be silently broken by extensions; backward-compat required.

---

## Appendix A — Source documents (May 14, 2026 sample set)

Seven real Quebec corporate documents collected by Dom from his own historical minute books. To be stored at:
`docs/specs/signature-block-convention-source-samples-2026-05-14/` (Images 1-7).

---

**End of v1.0 LOCKED.** Implementation work proceeds per `docs/proposals/phase-10a5-decomposition-2026-05-14.md`.
