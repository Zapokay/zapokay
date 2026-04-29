# ZapOkay — Compliance Taxonomy & Event-Based Rule Inventory

**Date:** April 28, 2026  
**Author:** Dom (Product Owner) + Max (CTO/AI advisor)  
**Status:** Locked v1.0. Hand to CC at Sprint 11 Phase 1 start.

---

## 0. Executive Summary

Sprint 11 Phase 1 (DD Audit Phase 1 — event-based compliance rules in the Minute Book) requires a finalized compliance taxonomy and an enumerated rule inventory. This document satisfies both as the product-decision artifact for Sprint 11 implementation.

**Two unified deliverables:**

1. A two-category compliance taxonomy with v1 labels and per-key category assignments for all 25 seeded `minute_book_requirements` keys.
2. An inventory of 16 event-based rules with full per-rule specifications.

**This document is non-exhaustive by design.** The pre-launch legal review is the natural moment to surface additional rules. Phase 1 implementation accommodates additions cheaply — the engine is pure computation per the locked Phase 1 MVP principle (rules run at Minute Book page-load time against current registry state; no `audit_findings` table). Adding a rule is a metadata + query change, no schema work.

This document supersedes references in `ZapOkay_Project_Memory.md` Sections 17.2 and 17.3 once locked. Memory will reference this doc going forward.

---

## 1. Purpose & Scope

### 1.1 Why this document exists

Two needs converge in one scoping session, per memory Section 17:

- **17.2 Two-category compliance taxonomy** — needed because a single ranked priority list misrepresents the user's situation (collapsing "the government will penalize you" with "a DD reviewer will flag this" produces false equivalence).
- **17.3 Event-based rule inventory** — needed because Sprint 11 Phase 1 must implement a concrete list of rules. Every rule needs trigger, document, severity, remediation, and fiscal-year derivation.

The two artifacts are produced together because category assignment and rule definition are the same conversation: each rule gets a category at the time it is defined.

### 1.2 What's in scope

- The 25 seeded `minute_book_requirements` keys (time-based requirements, already shipped)
- 16 event-based rules (state-based detections fired by registry changes)
- Categories used uniformly across both

### 1.3 What's NOT in scope (Phase 1)

- **Time-based requirements not in the 25 seeded keys** — captured in `minute_book_requirements` table seed; out of scope for re-debate here
- **Content-quality detection** ("does this resolution actually cover the required topics") — needs AI document analysis; deferred to v1.2+
- **Form-level validators** (appointment_date before incorporation_date, etc.) — these belong as input-level guards, not audit rules
- **DD Full Audit export structure** — Sprint 11 Phase 2, separate spec session
- **Legal review additions** — accepted as expected pre-launch input; rule engine designed to absorb additions cheaply

---

## 2. Two-Category Taxonomy

### 2.1 Categories

| | FR (v1) | EN (v1) | Code identifier |
|---|---|---|---|
| Category 1 | À faire maintenant | Do now | `compliance.category.timeSensitive` |
| Category 2 | À corriger | To fix | `compliance.category.toFix` |

**v1 labels.** Aria voice pass pending. Final copy can change without code changes (key names persist; values edited in `messages/fr.json` + `messages/en.json` per the bilingual i18n convention locked in CLAUDE.md commit `26e6b31`).

### 2.2 Category definitions

**À faire maintenant (Do now)** — Time-sensitive, externally enforced. A government agency actively penalizes non-compliance: fines, radiation/dissolution risk, regulatory action. The user's lived experience is a deadline.

**À corriger (To fix)** — Structural/internal. Statute may require it, but no government agency actively checks. Penalty materializes only during DD scrutiny, audit, transaction, or future legal review. The user's lived experience is "my records are incomplete."

### 2.3 Principle for the cut

**"If I ignore this, will a government agency penalize me?"** → AFM. Everything else → AC.

This principle is what makes AFM useful as a category. The moment AFM contains items where statute requires the document but no agency actively enforces, AFM stops meaning "my actual fires" and becomes "anything statutorily required" — which is most of the inventory. The category loses its signaling value.

### 2.4 Edge case policy

**One category per requirement, dominant only.** No dual-tagging.

Reasoning:
- Dual-tagging splits visual signal on the dashboard (two badges per row)
- Doubles count math (a row counted in both buckets misrepresents totals)
- Forces user to parse two states for a single concern
- A row that genuinely feels 50/50 signals the principle needs sharpening, not that the row should split

Memory's locked principle aligns: "category assignment is per-requirement_key, decided once deliberately."

### 2.5 Category assignment policy for event-based rules

Each event-based rule is assigned a category at the time the rule is defined, written into the rule spec — not computed at runtime. Same one-category dominant-only rule applies.

---

## 3. Category Assignments — 25 Seeded `minute_book_requirements` Keys

### 3.1 Distribution

**5 AFM / 20 AC.**

The lopsided distribution is accurate. Only the 5 government filings are externally enforced. The other 20 are structural gaps the government doesn't actively check but that fail under DD scrutiny. The dashboard displaying "5 government deadlines / 20 internal gaps" is the user's actual situation, told straight. AC is also where ZapOkay's DD-readiness positioning lives — "we catch what the lawyer would catch, before the lawyer is in the room."

### 3.2 Full assignment table

| # | requirement_key | Group | Category |
|---|---|---|---|
| 1 | lsaq_statuts_constitution | Articles / certificates | AC |
| 2 | cbca_certificate_incorporation | Articles / certificates | AC |
| 3 | cbca_articles_incorporation | Articles / certificates | AC |
| 4 | lsaq_reglement_interieur | Bylaws | AC |
| 5 | cbca_bylaw_1 | Bylaws | AC |
| 6 | cbca_bylaw_2 | Bylaws | AC |
| 7 | lsaq_declaration_initiale | Government filing | **AFM** |
| 8 | cbca_declaration_initiale_qc | Government filing | **AFM** |
| 9 | cbca_annual_return | Government filing | **AFM** |
| 10 | lsaq_req_annual_update | Government filing | **AFM** |
| 11 | cbca_req_annual_update_qc | Government filing | **AFM** |
| 12 | lsaq_acceptation_mandat | Director acceptance | AC |
| 13 | cbca_director_acceptance | Director acceptance | AC |
| 14 | lsaq_premiere_resolution_ca | Foundational resolution | AC |
| 15 | cbca_first_board_resolution | Foundational resolution | AC |
| 16 | lsaq_premiere_resolution_actionnaires | Foundational resolution | AC |
| 17 | cbca_first_shareholder_resolution | Foundational resolution | AC |
| 18 | lsaq_souscription_actions | Share subscription | AC |
| 19 | cbca_share_subscription | Share subscription | AC |
| 20 | lsaq_annual_board_resolution | Annual resolution | AC |
| 21 | cbca_annual_board_resolution | Annual resolution | AC |
| 22 | lsaq_annual_shareholder_resolution | Annual resolution | AC |
| 23 | cbca_annual_shareholder_resolution | Annual resolution | AC |
| 24 | lsaq_auditor_waiver | Auditor waiver | AC |
| 25 | cbca_auditor_waiver | Auditor waiver | AC |

### 3.3 Reasoning for the judgment-call keys

**Annual resolutions (rows 20–23).** LSAQ Art. 137 / CBCA s.133 statutorily require annual meetings or unanimous written resolutions. There is a statutory deadline (CBCA: within 15 months of last meeting; LSAQ similar). Argument for AFM existed: deadline-driven, statute-mandated. Argument for AC won: no government agency actively enforces; no penalty in practice; exposed only via DD review. The user's lived experience is "my minute book has gaps for 2022 and 2023" — a structural concern, not a deadline. Putting these in AFM creates false urgency and dilutes what AFM is for.

**Auditor waivers (rows 24–25).** CBCA s.163 / LSAQ equivalent — unanimous shareholder waiver required to skip auditor appointment. Same shape: statutory requirement, no active government enforcement, exposed via DD. Same call: AC. Note the existing product behavior reinforces this — auditor waivers go to *all* shareholders with mandatory checkboxes (memory Section 7 ALL_REQUIRED_KEYS), treated as a structural integrity item rather than a deadline item.

### 3.4 Annual vs foundational firing semantics

The 25 keys split into two firing modes (already implemented in `minute_book_requirements.category` field):

- **Foundational keys** fire once total per company (no fiscal-year scoping). Missing = single row in Minute Book.
- **Annual keys** fire once per *active* fiscal year. Missing across N active years = N rows.

Category assignment in this section applies to **all instances** of a key (across all years where annual). Example: `cbca_annual_return` is AFM for every active fiscal year where it's missing.

---

## 4. Event-Based Rule Inventory

### 4.1 Distribution

**16 rules. 4 AFM / 12 AC.**

### 4.2 Scope boundary — what's NOT included

The following were considered and explicitly deferred:

- **Citizenship/residency rules** — defer to v1.1 (S10-TR-9, S10-TR-10 are v1.1; rules can't fire without the citizenship field)
- **Content-quality rules** — defer to v1.2+ (needs AI content analysis)
- **Shareholder agreement absence advisory** ("you have 2+ shareholders, no agreement on file") — defer to v1.1; best-practice advisory rather than hard rule
- **Date-integrity validations** — belong as form-level validators
- **Duplicate certificate numbers** — defer to v1.1; niche data integrity
- **Resolution signed by ineligible signatory** (former R16) — dropped; redundant for generated docs (generator already enforces signing capacity), unenforceable for uploaded docs (no signatory metadata)
- **Auditor waiver missing required signatures** (former R17) — dropped; same structural reason as R16

These deferrals are honest about what the rule engine can and can't do: it detects **what's missing from the registry** (no acceptance form, no covering resolution, no certificate). It does not detect **what's wrong inside an existing document** (wrong signatory, incomplete signature set, content quality). The latter is a different capability (AI document analysis) on a different roadmap.

### 4.3 Scoping principle for each rule

Per memory Section 17.3, each rule specifies:

- **Name** — human-readable + code identifier
- **Category** — AFM or AC
- **Trigger** — what registry state causes the rule to fire
- **Implied document** — what document's absence the rule detects
- **Remediation path** — how the user resolves it
- **Fiscal year derivation** — which date field on the triggering entity maps the finding to a fiscal year (for Minute Book row grouping; active-years filter applies normally)
- **Dependencies** — schema, activity_log event_types, or other infrastructure required for the rule to fire correctly

Findings render as Minute Book rows in the derived fiscal year. They inherit fiscal-year grouping, active-years filter, and priority ordering from time-based requirements (memory Section 17.1).

### 4.4 Family 1 — Person/role events (5 rules)

#### R1 — Director appointed without acceptance form

- **Code ID:** `director_appointment_no_acceptance`
- **Category:** AC
- **Trigger:** `director_mandates` row exists where `is_active=true` (or `appointment_date IS NOT NULL`), AND no `documents` row exists with `requirement_key IN ('lsaq_acceptation_mandat', 'cbca_director_acceptance')` AND `status='active'` whose `signatories_confirmed` references this person.
- **Implied document:** Acceptation du mandat d'administrateur, framework-specific (LSAQ → `lsaq_acceptation_mandat`; CBCA → `cbca_director_acceptance`).
- **Remediation:** Generate acceptation form via S10-TR-13 trigger; OR upload pre-signed copy with appropriate `requirement_key`.
- **Fiscal year derivation:** Fiscal year containing `director_mandates.appointment_date`.
- **Dependencies:** S10-TR-13 (acceptation generator implementation, Sprint 10).

#### R2 — Director removed without authorizing resolution

- **Code ID:** `director_removal_no_resolution`
- **Category:** AC
- **Trigger:** `director_mandates.end_date IS NOT NULL` AND `end_reason` indicates an action requiring authorization (e.g., `removed_by_resolution`, retirement of named scope), AND no covering board resolution OR shareholder resolution exists with reasonable temporal proximity to `end_date` whose scope references this removal.
- **Implied document:** Board resolution OR shareholder resolution authorizing removal. CBCA s.109 allows shareholder removal of directors; LSAQ Art. 144 similar. Framework determines which is appropriate.
- **Remediation:** Generate authorizing resolution dated to cover the removal; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing `director_mandates.end_date`.
- **Dependencies:** None beyond Sprint 10 already-shipped temporal infrastructure.

#### R3 — Officer appointed without authorizing resolution

- **Code ID:** `officer_appointment_no_resolution`
- **Category:** AC
- **Trigger:** `officer_appointments` row with `is_active=true`, AND the appointment is NOT covered by the foundational board resolution (`lsaq_premiere_resolution_ca` / `cbca_first_board_resolution`) AND no other covering board resolution exists with reasonable temporal proximity to `appointment_date`.
- **Implied document:** Board resolution appointing officer.
- **Remediation:** Generate authorizing board resolution; OR upload pre-existing.
- **Fiscal year derivation:** Fiscal year containing `officer_appointments.appointment_date`.
- **Dependencies:** None beyond Sprint 10 already-shipped.

#### R4 — Officer ended without authorizing resolution

- **Code ID:** `officer_termination_no_resolution`
- **Category:** AC
- **Trigger:** `officer_appointments.end_date IS NOT NULL`, no covering board resolution exists with reasonable temporal proximity to `end_date`.
- **Implied document:** Board resolution authorizing officer change/removal.
- **Remediation:** Generate authorizing resolution; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing `officer_appointments.end_date`.
- **Dependencies:** None beyond Sprint 10 already-shipped.

#### R5 — Director count outside articles min/max

- **Code ID:** `director_count_out_of_range`
- **Category:** AC
- **Trigger:** Count of `director_mandates` where `is_active=true` is < `companies.director_min` OR > `companies.director_max`.
- **Implied document:** Either appointment/removal resolution to align with articles, OR shareholder resolution + amended articles + filing if articles need updating.
- **Remediation:** Add/remove directors to align with articles, OR amend articles.
- **Fiscal year derivation:** Current fiscal year (state-based, not event-based).
- **Dependencies:** **Schema dependency NOT in Sprint 10.** Requires `companies.director_min`, `companies.director_max` fields. **Rule ships dormant in Phase 1 and activates when fields land (likely v1.1).** Captured for completeness; implementation can stub the rule with always-false trigger until schema arrives.

### 4.5 Family 2 — Share events (6 rules)

#### R6 — Shareholder issuance without subscription letter

- **Code ID:** `shareholding_no_subscription`
- **Category:** AC
- **Trigger:** `shareholdings` row exists where `source ≠ 'transfer'` (i.e., it's an initial issuance), AND no document with `requirement_key IN ('lsaq_souscription_actions', 'cbca_share_subscription')` references this holder + share_class + issuance.
- **Implied document:** Lettre de souscription d'actions (framework-specific).
- **Remediation:** Generate subscription letter; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing the shareholding's subscription/issuance date.
- **Dependencies:** S10-TR-2 (`shareholdings.source` field). Until ships, rule may over-fire on transfers (Phase 1 acceptable noise).

#### R7 — Shareholder issuance without share certificate

- **Code ID:** `shareholding_no_certificate`
- **Category:** AC
- **Trigger:** `shareholdings` row exists (active, `source ≠ 'transfer'`), no certificate document linked to this holder + share_class.
- **Implied document:** Share certificate.
- **Remediation:** Generate share certificate; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing the shareholding's issuance date.
- **Dependencies:** S10-TR-2 (`shareholdings.source`).

#### R8 — Share issuance without authorizing board resolution

- **Code ID:** `shareholding_no_board_resolution`
- **Category:** AC
- **Trigger:** `shareholdings` row exists (active, `source ≠ 'transfer'`), AND the issuance is NOT covered by the foundational board resolution AND no other covering board resolution exists with reasonable temporal proximity to issuance date authorizing this issuance.
- **Implied document:** Board resolution authorizing issuance.
- **Remediation:** Generate authorizing board resolution; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing issuance date.
- **Dependencies:** S10-TR-2 (`shareholdings.source`).

#### R9 — Share transfer without authorizing resolution

- **Code ID:** `share_transfer_no_resolution`
- **Category:** AC
- **Trigger:** `share_transfers` row exists, no covering board resolution referencing this transfer with reasonable temporal proximity.
- **Implied document:** Board resolution authorizing transfer.
- **Remediation:** Generate authorizing resolution; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing `share_transfers.transfer_date`.
- **Dependencies:** S10-TR-2 (`share_transfers` table creation, Sprint 10).

#### R10 — Share transfer without certificate reissuance

- **Code ID:** `share_transfer_no_new_certificate`
- **Category:** AC
- **Trigger:** `share_transfers` row exists, no new share certificate document exists for the new holder dated `>= transfer_date` matching `share_class_id` and quantity.
- **Implied document:** New share certificate (also implicitly: cancellation of old certificate, captured by linkage).
- **Remediation:** Generate new share certificate; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing `share_transfers.transfer_date`.
- **Dependencies:** S10-TR-2 (`share_transfers` table).

#### R11 — Share issuance cancelled without authorizing resolution

- **Code ID:** `shareholding_cancellation_no_resolution`
- **Category:** AC
- **Trigger:** `shareholdings.end_date IS NOT NULL` AND `shareholdings.end_reason='cancelled'`, no covering board resolution referencing the cancellation with reasonable temporal proximity.
- **Implied document:** Board resolution authorizing cancellation.
- **Remediation:** Generate authorizing resolution; OR upload existing.
- **Fiscal year derivation:** Fiscal year containing `shareholdings.end_date`.
- **Dependencies:** S10-TR-2 (`shareholdings.end_date`, `end_reason`); S10-TR-12 (Annuler une émission cancellation flow).

### 4.6 Family 3 — Corporate-level change events (4 rules)

#### R12 — Legal name change without authorizing resolution + filing

- **Code ID:** `legal_name_change_no_compliance`
- **Category:** **AFM**
- **Trigger:** `activity_log` row with `event_type='company_legal_name_changed'`, AND any of: (a) no shareholder special resolution authorizing the change exists, OR (b) no government filing document recording the change (REQ Avis de modification for LSAQ; Corporations Canada Articles of Amendment / Form 4 for CBCA).
- **Implied document:** Special shareholder resolution authorizing name change + amended articles + REQ/Corporations Canada filing.
- **Remediation:** Generate special shareholder resolution; AND complete government filing (filing typically external — user uploads confirmation).
- **Fiscal year derivation:** Fiscal year containing `activity_log.created_at`.
- **Dependencies:** **NEW activity_log event_type** `company_legal_name_changed` — added in Sprint 11 implementation hooks at the company-update write path(s).

#### R13 — Registered office address change without declaration filing

- **Code ID:** `address_change_no_filing`
- **Category:** **AFM**
- **Trigger:** `activity_log` row with `event_type='company_address_changed'`, no government filing document recording the change.
- **Implied document:** REQ Avis de modification (LSAQ) + Corporations Canada Form 3 (CBCA, for CBCA corps with QC presence both filings required per memory's two-layer compliance principle); board resolution authorizing change may be required depending on framework.
- **Remediation:** Complete government filing(s); upload confirmation. Generate board resolution if required by framework.
- **Fiscal year derivation:** Fiscal year containing `activity_log.created_at`.
- **Dependencies:** **NEW activity_log event_type** `company_address_changed`.

#### R14 — Fiscal year end change without authorizing board resolution

- **Code ID:** `fiscal_year_change_no_resolution`
- **Category:** AC
- **Trigger:** `activity_log` row with `event_type='fiscal_year_end_changed'` (or detected change to `companies.fiscal_year_end_month` / `fiscal_year_end_day` via audit trail), no covering board resolution.
- **Implied document:** Board resolution authorizing fiscal year end change.
- **Remediation:** Generate authorizing board resolution.
- **Fiscal year derivation:** Fiscal year containing the change event (note: the change itself shifts fiscal year boundaries — derivation uses `activity_log.created_at` mapped to whichever fiscal year that timestamp falls in under the *new* fiscal year definition).
- **Dependencies:** **NEW activity_log event_type** `fiscal_year_end_changed`.

#### R15 — Share class added post-incorporation without articles amendment

- **Code ID:** `share_class_added_no_amendment`
- **Category:** **AFM**
- **Trigger:** `share_classes.created_at` > `companies.incorporation_date + 30 days` (proxy for "post-incorporation"), AND any of: (a) no shareholder special resolution authorizing class addition, OR (b) no government filing recording articles amendment.
- **Implied document:** Special shareholder resolution + amended articles + government filing (Statuts de modification for LSAQ; Form 4 Articles of Amendment for CBCA).
- **Remediation:** Generate special shareholder resolution; AND complete government filing (external — user uploads confirmation).
- **Fiscal year derivation:** Fiscal year containing `share_classes.created_at`.
- **Dependencies:** Verify `share_classes.created_at` field exists (likely already does; confirm in implementation).

### 4.7 Family 4 — Foundational data integrity (1 rule)

#### R16 — NEQ missing post-onboarding

- **Code ID:** `neq_missing_post_onboarding`
- **Category:** **AFM**
- **Trigger:** `users.onboarding_completed=true` for the company's owner AND `companies.neq IS NULL` (or empty string).
- **Implied document:** REQ enterprise registration confirmation.
- **Remediation:** Complete REQ registration at https://www.registreentreprises.gouv.qc.ca; upload NEQ to company profile.
- **Fiscal year derivation:** Current fiscal year (state-based, not event-based).
- **Dependencies:** None — uses existing schema.

---

## 5. Sprint 11 Phase 1 Dependencies

### 5.1 Schema dependencies from Sprint 10

These ship in Sprint 10 (locked per `temporal-registry-product-spec-2026-04-27.md`) and unblock the relevant Phase 1 rules:

| Sprint 10 item | Unblocks |
|---|---|
| S10-TR-2 — `shareholdings.end_date`, `end_reason`, `source`; create `share_transfers` | R6, R7, R8, R9, R10, R11 |
| S10-TR-12 — Annuler une émission cancellation flow | R11 |
| S10-TR-13 — Acceptation du mandat real implementation | R1 |

If Sprint 10 ships on schedule, Phase 1 rules R1, R6–R11 are implementable from day one of Sprint 11.

### 5.2 New activity_log event_types required (Phase 1 implementation work)

Sprint 11 Phase 1 implementation must add logging hooks at the relevant write paths:

| event_type | Triggered by | Used by |
|---|---|---|
| `company_legal_name_changed` | Company update path where `legal_name_fr` or `legal_name_en` changes | R12 |
| `company_address_changed` | Company update path where address fields change | R13 |
| `fiscal_year_end_changed` | Company update path where `fiscal_year_end_month` or `fiscal_year_end_day` changes | R14 |

Estimated overhead: 1–2 days inside Sprint 11 Phase 1 effort. Logging hooks are small and well-isolated.

### 5.3 Future schema dependencies (rules ship dormant)

| Field | Required by | Target sprint |
|---|---|---|
| `companies.director_min`, `companies.director_max` | R5 | v1.1 |

R5 is captured in this document for completeness. Phase 1 implementation can include the rule definition with an always-false trigger until schema arrives, OR omit the rule entirely from the Phase 1 rule registration and add in v1.1. Implementation discretion — recommend the latter (cleaner, no scaffolding pattern).

### 5.4 Implementation principle (reaffirmed)

Per memory Section 17.1 and locked Sprint 11 architecture:

- **Pure computation, no `audit_findings` table.** Rules run at Minute Book page-load time against current registry state. Output is ephemeral rows.
- **Materialized snapshots are a Phase 2 problem.** Phase 2 (DD Full Audit export) requires frozen point-in-time snapshots — that justifies the table at that point, not earlier.
- **Findings inherit Minute Book row semantics.** Same fiscal-year grouping, active-years filter, and priority ordering as the 25 time-based requirements. No new UI surface.
- **Adding a rule is a metadata + query change, no schema work.** Pre-launch legal review additions absorb cheaply.

### 5.5 Rule severity within a category

Within AFM and within AC, the existing priority logic (memory Section 3 — "oldest non-compliance first: foundational, then oldest active year, then progressively newer") applies. Event-based findings sort alongside time-based requirements in the same fiscal year. Category determines bucket; priority logic determines order within bucket.

---

## 6. Decisions Log

The following are locked v1.0. Do not re-debate without explicit re-opening:

1. **Two categories, not a single ranked priority.** AFM (Do now) and AC (To fix). Working FR/EN labels: *À faire maintenant* / *À corriger* and *Do now* / *To fix*.
2. **Principle for the cut: "active government enforcement only"** → AFM. Statute-required-but-not-enforced → AC.
3. **One category per item, dominant only.** No dual-tagging.
4. **v1 labels deferred to Aria voice pass.** Key names locked; values editable in JSON.
5. **25 seeded keys: 5 AFM / 20 AC.** AFM = the 5 government filings (`lsaq_declaration_initiale`, `cbca_declaration_initiale_qc`, `cbca_annual_return`, `lsaq_req_annual_update`, `cbca_req_annual_update_qc`).
6. **Annual resolutions and auditor waivers go to AC**, not AFM. Reasoning: no active government enforcement, exposed via DD.
7. **16 event-based rules in Phase 1: 4 AFM / 12 AC.** AFM = R12, R13, R15, R16.
8. **Former R16 (signing capacity) and R17 (auditor waiver signatures) dropped.** Engine cannot enforce; redundant with generator for generated docs, unenforceable for uploaded docs.
9. **R5 ships dormant in Phase 1.** Activates when `companies.director_min` / `director_max` schema lands (v1.1).
10. **Each event-based rule has a category at definition time.** Not computed at runtime.
11. **Phase 1 is pure computation.** No `audit_findings` table; rules run at page-load time against current registry state.
12. **Pre-launch legal review will surface additional rules.** Phase 1 design absorbs additions cheaply (metadata + query change, no schema work).
13. **All rules ship together in Sprint 11.** No subset folded into Sprint 10 even when tightly coupled (per locked Sprint 10/11 architectural separation, memory Section 9 / `temporal-registry-audit-2026-04-23.md` Decision 4).

---

## 7. Open Questions & Deferred Items

### 7.1 To resolve during Phase 1 implementation

1. **"Reasonable temporal proximity" tolerance** for matching covering resolutions to events (R2, R3, R4, R8, R9, R11). Default suggestion: ±90 days, adjustable per rule. Implementation discretion.
2. **`signatories_confirmed` JSON path for person matching** (R1). Verify exact JSON shape used by current generation pipeline before writing the NOT EXISTS query.
3. **Foundational resolution scope coverage** for R3 and R8 — does the lsaq_premiere_resolution_ca / cbca_first_board_resolution generated PDF actually enumerate which officers/issuances it covers, or is the coverage assumed by date proximity? Spot-verify in implementation.
4. **R5 disposition** — confirm "ship omitted, add in v1.1 when schema lands" (recommended) vs. "ship with always-false trigger as registered rule." Recommend the former.

### 7.2 Deferred to v1.1

- Citizenship/residency rules (S10-TR-9, S10-TR-10 schema dependent)
- Shareholder agreement absence advisory
- Duplicate certificate number detection
- Bulk import (CSV/Excel) creating events that need backfill rules
- R5 (director count out of range) when min/max schema lands

### 7.3 Deferred to v1.2+

- Content-quality detection (AI document analysis)
- Reinstatement of R16/R17 if AI parsing of uploaded documents becomes available

### 7.4 Deferred to ESOP Sprint

- Option pool / vesting / convertible-related rules (depends on ESOP schema, separate sprint)

---

## 8. References

- `ZapOkay_Project_Memory.md` Sections 17.1, 17.2, 17.3 (this doc supersedes 17.2 and 17.3 detail)
- `docs/temporal-registry-product-spec-2026-04-27.md` (Sprint 10 schema source of truth)
- `docs/temporal-registry-audit-2026-04-23.md` (Sprint 10/11 separation Decision 4)
- `CLAUDE.md` (i18n convention — applies to category label rendering)
- `Virtual_Minute_Book_Product_Spec.pdf` (source taxonomy reference)

---

## 9. Aria Handoff Notes (post-lock)

When Aria reviews:

1. **Voice pass on category labels.** Current v1: "Do now" / "To fix" (EN), "À faire maintenant" / "À corriger" (FR). Free to refine for warmth, clarity, brand voice. Constraint: keys (`compliance.category.timeSensitive`, `compliance.category.toFix`) are locked; only values change.
2. **Visual treatment of the two categories.** Dashboard "Prochaine échéance" card needs to reflect both categories cleanly. Memory Section 3 flagged this as TBD.
3. **Sprint 9J clarity pass** uses these categories as primary nouns. Honest copy on dashboard cards depends on the labels being lived-in.
4. **DD report structure** (Sprint 11 Phase 2) mirrors the same taxonomy. Visual treatment locked here propagates.

---

## 10. CC Handoff Notes (Sprint 11 Phase 1 start)

1. **Read this doc first.** Then `temporal-registry-product-spec-2026-04-27.md` Sections 5.1–5.6 for Sprint 10 schema context.
2. **Investigation phase first** (mandatory per project process discipline): for each rule, confirm the trigger query is implementable against current schema, flag ambiguities, propose tolerance values where spec says "reasonable."
3. **Implementation principle:** pure computation, no new tables. Metadata file (`lib/audit-rules.ts` or similar) declares the 16 rules; query functions evaluate at request time; output rendered as Minute Book rows.
4. **Add the 3 new activity_log event_types** at the relevant company-update write paths. Hook before rule implementation.
5. **R5 disposition:** recommend omit from Phase 1 registration; add in v1.1 when min/max schema lands.

---

**End of Compliance Taxonomy & Event-Based Rule Inventory v1.0**
