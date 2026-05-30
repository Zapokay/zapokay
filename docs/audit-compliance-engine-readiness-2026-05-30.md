# Architecture-readiness audit — Compliance/obligation engine foundation (read-only)

**Date:** 2026-05-30
**HEAD at audit:** `d2fe31b` (parent `f97e60c`, post-Tier-1-#21)
**Scope:** Foundation-level investigation-first. Decides whether the proposed
`minute_book_requirements`-backed compliance engine (per `audit-dashboard-figures-2026-05-30.md`
A.2) can structurally hold the FULL obligation + event universe — shipped, in-progress, AND
roadmapped — **before** we build it. **No code, no data-model changes, no engine design, no
answering of legal questions.** Output is this assessment only.

> Grounding note: specs (`compliance-taxonomy-2026-04-28.md`, `scoping-history-feature-2026-05-22.md`,
> `phase-10a5-decomposition-2026-05-14.md`) describe the *intended* universe; live migrations +
> engine code describe what's *actually built*. Where they disagree, this audit anchors on the
> migrations/code and flags the gap. The compliance-taxonomy spec's "16 event-based rules" are a
> **planned** taxonomy — only a thin subset is implemented (see §2 Shape 3).

---

## EXECUTIVE VERDICT

**The foundation does NOT yet hold the full universe. Verdict per shape:**

| Obligation shape | Can the foundation hold it? |
|---|---|
| **Shape 1** — document-presence-per-period (the 25-key catalog: 16 foundational + 9 annual×FY) | ✅ **HOLDS** — `minute_book_requirements` + `requirement-completeness.ts` already do this |
| **Shape 2** — time-sensitive filings with **due dates** + the **AFM/AC** split | ⚠️ **NEEDS EXTENSION** — catalog has no due-date column, no AFM/AC field, no conditional category; that logic lives ONLY in the deprecated lib |
| **Shape 3a** — lifecycle-act evidence (director/officer/share events) | ⚠️ **NEEDS EXTENSION** — `event-completeness.ts` holds *link-existence*, not instrument-/deadline-correct matching |
| **Shape 3b** — relational/corporate-change obligations (name/address/FY-end/share-class-add, count-range, NEQ) | ❌ **NEEDS NEW STRUCTURE** — no data source exists; required `activity_log` event_types + `companies` columns are unbuilt |

**Three obligation representations already coexist** (`compliance_rules`, `minute_book_requirements`,
and the unbuilt taxonomy spec) with **non-matching key vocabularies** — building a fourth on
`minute_book_requirements` without retiring/reconciling the others repeats the
`company_fiscal_years` ⟂ `company_active_years` divergence trap (§3).

---

## SECTION 1 — The complete obligation + event inventory

Status buckets: **(a) SHIPPED** live in prod · **(b) IN-PROGRESS / LOCKED-NEXT** · **(c) ROADMAPPED / DEFERRED**.

### 1.1 Foundational document obligations (year-independent, `document_year=NULL`)

Catalog: `minute_book_requirements` where `category='foundational'` — **16 rows** (LSA + CBCA).
Trigger: once per company. Due-date: none. Data: `minute_book_requirements` + `documents.requirement_key`.

| Item (representative keys) | Trigger | Due-date | Status |
|---|---|---|---|
| Statuts / Certificate + Articles of incorporation (`statuts` section) | founding | none | **(a)** |
| Règlements / Bylaws (`reglements`) | founding | none | **(a)** |
| Première résolution CA / first board resolution (`resolutions`) | founding | none | **(a)** |
| Première résolution actionnaires / first shareholder resolution | founding | none | **(a)** |
| Souscription d'actions / share subscription | founding (per issuance) | none | **(a)** |
| Registres / registers (`registres`) | founding/ongoing | none | **(a)** |
| Acceptation du mandat / director acceptance (`administrateurs`) | per director | none | **(a)** |
| (16 total across LSA=11 / CBCA=14 catalog; section CHECK enumerates 8 sections, 6 populated) | | | **(a)** |

### 1.2 Annual document obligations (per active fiscal year)

Catalog: `minute_book_requirements` where `category='annual'` — **9 rows**. One instance per active
`company_fiscal_years` row. Trigger: FY close. Data: catalog × FYs + `documents.requirement_year`.

| Item | Trigger | Due-date (intended) | Status |
|---|---|---|---|
| Annual board resolution (LSA + CBCA) | annual/FY | FY-end + 6mo *(deprecated lib only)* | **(a)** scored; **(c)** deadline |
| Annual shareholder resolution (LSA + CBCA) | annual/FY | FY-end + 6mo *(deprecated lib only)* | **(a)** scored; **(c)** deadline |
| Annual financial statements (LSA + CBCA) | annual/FY | FY-end + 6mo *(deprecated lib only)* | **(a)** scored; **(c)** deadline |
| Auditor waiver (LSA + CBCA) — **conditional** | annual, **iff no auditor appointed** | — | **(a)** scored as unconditional; **(c)** condition not modeled |

### 1.3 Time-sensitive government filings with due dates (the AFM subset)

Ground truth = **`compliance_rules` seed** (`20260330000000_compliance_engine.sql`): **5 rules per
framework**, all `frequency='annual'`, each with a `legal_reference`. Due-dates computed by the
**deprecated** `calculateDueDate` (`lib/compliance/calculateComplianceItems.ts:41-78`); the only
due-date STORAGE is `compliance_items.due_date` — on a table slated for DROP.

| rule_key | Framework | legal_reference (as seeded) | Due-date rule (deprecated lib) | Status |
|---|---|---|---|---|
| `annual_board_resolution` | LSA / CBCA | LSAQ art. 93 / art. 114 | FY-end + 6mo | **(a)** via deprecated path |
| `annual_shareholder_resolution` | LSA / CBCA | LSAQ art. 104 / art. 133 | FY-end + 6mo | **(a)** via deprecated path |
| `annual_financial_statements` | LSA / CBCA | LSAQ art. 214 / art. 155 | FY-end + 6mo | **(a)** via deprecated path |
| `req_annual_update` | LSA only | Loi sur la publicité légale | FY-end + 4mo, day 15 | **(a)** via deprecated path |
| `corporations_canada_annual_return` | CBCA only | art. 263 | incorporation anniversary | **(a)** via deprecated path |
| `auditor_waiver` | LSA / CBCA | **LSAQ art. 223** / art. 163 | FY-end + 6mo (default arm) | **(a)** but **unsatisfiable** (no doc mapping) |

> Note 1: only 4 of these 6 keys have a `DOCUMENT_TYPE_TO_RULE` mapping; `auditor_waiver` (LSA) and
> `corporations_canada_annual_return` (CBCA) can never be marked compliant → structural
> understatement (carried from `audit-dashboard-figures-2026-05-30.md` D1b).
> Note 2: **legal_reference drift** — `compliance_rules` seeds auditor_waiver as **LSAQ art. 223**;
> memory Q2-lock + the `minute_book_requirements` seed use **art. 239**. Unreconciled (lawyer-gate §4).

### 1.4 Lifecycle events (post-founding acts)

Ground truth = `event-completeness.ts` (7 act types) + `event_documents` (polymorphic M:N, event_type
CHECK = `director_mandate / officer_appointment / shareholding / share_transfer`, 4-col grain incl.
`event_phase`). "Satisfied" = ≥1 linked `event_documents` row exists.

| Act (event_type · phase) | Trigger | Founding-cohort rule | Capture | Score | Generate | Status |
|---|---|---|---|---|---|---|
| Director appointment | `appointment_date > incorporation` | post-founding only | ✅ | ✅ | ◐ Brief 2c | **(a)** capture/score; **(b)** generate |
| Director departure | `end_date` present | always | ✅ | ✅ | ✅ | **(a)** |
| Director removal (revocation) | `end_date` + `end_reason='revocation'` | always | ✅ | ✅ | ✅ (shareholder instrument) | **(a)** |
| Officer appointment | `appointment_date > incorporation` | post-founding only | ✅ | ✅ | ◐ Brief 2c | **(a)** capture/score; **(b)** generate |
| Officer departure | `end_date` present | always | ✅ | ✅ | ✅ | **(a)** |
| Share issuance | `issue_date > incorporation` | post-founding only | ✅ | ✅ | ✅ (`64f9646`) | **(a)** |
| Share cessation | `end_date` + `end_reason≠transfer` | always | ✅ | ✅ | ✅ (`ce3b3e9`) | **(a)** |
| Share transfer | `share_transfers` row | always | ✅ | ✅ | ✅ (`906000a`) | **(a)** |

### 1.5 Entity-typed + joint-holder variants (Phase 10A.5 / Phase 6)

Schema = `shareholder_entities` (trust/corporation), `shareholder_entity_signatories` (temporal
`start_date`/`end_date`), `shareholding_holders` (polymorphic join) — **atom 1 + atom 2 SHIPPED**
(`20260514101627`, `20260515065959`; `shareholdings.person_id` dropped). `event-completeness.ts`
already reads holders polymorphically.

| Item | Status |
|---|---|
| Entity/joint **schema** (3 tables, holders join, signatory temporal cols) | **(a) SHIPPED** |
| Entity/joint **capture UI** (AddShareholderModal individual/trust/corp picker, joint-holder array, EditShareholding parity) — Atom 3 | **(b) LOCKED-NEXT** (hard launch gate per Dom 2026-05-22) |
| Entity/joint **PDF signature-block render** — Atom 4 | **(b) LOCKED-NEXT** |
| Entity-signatory route expansion (`/api/documents/signatories` past individual-only) | **(c) DEFERRED** |
| Entity-signatory **lifecycle obligation** (trustee/officer add/remove evidenced) — Phase 6 | **(c)** reclassified launch-critical, unbuilt |
| Share-event **generation for entity/joint** holders (issuance/cessation/transfer) | **(c)** atom-3-gated |

### 1.6 Relational / corporate-change obligations (compliance-taxonomy spec, largely UNBUILT)

The spec (`compliance-taxonomy-2026-04-28.md` §4) defines ~16 event-based rules. Only the
**link-existence** subset (§1.4) is built. These are **not represented anywhere** in the live model:

| Spec rule | Needs (not present) | Status |
|---|---|---|
| `legal_name_change_no_filing` (**AFM**) | `activity_log` event_type `company_legal_name_changed` (unemitted) | **(c) NEEDS NEW STRUCTURE** |
| `address_change_no_filing` (**AFM**) | `activity_log` event_type `company_address_changed` (unemitted) | **(c) NEEDS NEW STRUCTURE** |
| `fiscal_year_change_no_resolution` | `activity_log` event_type `fiscal_year_end_changed` (unemitted) | **(c) NEEDS NEW STRUCTURE** |
| `share_class_added_no_amendment` (**AFM**) | `share_classes.created_at` vs incorporation detection | **(c) NEEDS NEW STRUCTURE** |
| `director_count_out_of_range` | `companies.director_min` / `director_max` columns (don't exist) | **(c) NEEDS NEW STRUCTURE** |
| `neq_missing_post_onboarding` (**AFM**) | rule layer over `companies.neq` (data exists, no rule) | **(c)** computable, no engine |
| `*_no_resolution` temporal-proximity rules (acceptance/issuance/transfer covered by a resolution within ±N days) | date-proximity inference (engine only checks explicit links today) | **(c)** semantics gap |

### 1.7 Cross-cutting engine items

| Item | Status |
|---|---|
| Unified completeness math (requirements + events, one score) — Tier 1 #21 | **(a) SHIPPED** (`f97e60c`) |
| Dashboard compliance % (deprecated `calculateComplianceItems`) | **(a)** live but DEPRECATED, scheduled teardown |
| Brief 2 — Téléverser/Remplacer on event rows | **(b) NEXT** |
| Eviction/supersede-on-regen (Tier 4 #135) | **(c)** direction locked, post-launch |
| Materialized `audit_findings` snapshots (DD Full Audit export) | **(c)** Phase 2 |

**Inventory size:** **(a) SHIPPED ≈ 24** (16 foundational + 9 annual catalog [25 keys] + 8 lifecycle
act types + unified math + entity schema + deprecated compliance figure — deduped to ~24 distinct
obligation/event *types*) · **(b) IN-PROGRESS/LOCKED-NEXT = 5** (entity capture UI, entity PDF,
director+officer appointment generation, entity-typed share-event generation, Brief 2 upload) ·
**(c) ROADMAPPED/DEFERRED = 11** (6 corporate-change/relational rules + temporal-proximity matching +
AFM/AC due-date layer + conditional auditor-waiver + entity-signatory lifecycle + supersede/eviction +
DD snapshots — grouped).

---

## SECTION 2 — Can the proposed foundation hold all of it?

The proposed direction: a `minute_book_requirements`-backed compliance engine replacing the
deprecated `compliance_rules` path. Assessing against the §1 inventory.

### What the catalog + existing engines ALREADY represent (HOLDS)

- **Shape 1 — all 25 catalog obligations.** `requirement-completeness.ts` cross-products foundational
  (×1) and annual (× active FYs) and scores by `documents.requirement_key`/`requirement_year` with
  3-state weighting. This is solid and reusable as the compliance base.
- **Shape 3a — lifecycle-act evidence.** `event-completeness.ts` + `event_documents` already score the
  8 act types by link existence, and Tier-1-#21 already folds them into one combined score.

### What needs the catalog/data-model EXTENDED (NEEDS EXTENSION)

The **authoritative blocker**: `minute_book_requirements` columns are
`requirement_key, category, jurisdiction, framework, title_*, description_*, section, sort_order,
can_generate, can_upload` — and **`category` is a binary CHECK (`'foundational' | 'annual'`)**.
That means the catalog **cannot today express**:

1. **Due dates.** No `due_date` / due-date-rule column anywhere on the catalog. The only due-date
   storage in the schema is `compliance_items.due_date` (deprecated table), populated by the
   deprecated `calculateDueDate`. A compliance engine needs a **due-date rule layer** (per-obligation
   formula: FY-end+6mo, REQ+4mo-day-15, CC-anniversary) the requirements model has no slot for.
2. **The AFM-vs-AC distinction.** The "5 government filings (À faire maintenant) vs 20 structural
   (À corriger)" split lives only in the deprecated taxonomy + lib. The catalog has **no
   obligation-class / enforcement-tier field** — adding it is a column + CHECK migration + 25-row
   backfill, not free.
3. **Conditional triggers.** `auditor_waiver` applies *only if no auditor is appointed*; the catalog
   has no condition field, so it's modeled as an unconditional annual requirement (and is
   structurally unsatisfiable in the deprecated engine). A `conditional`/applicability predicate is
   needed.
4. **Overdue escalation.** The completeness engine is **stateless and deadline-blind** — `required`
   vs `pending` vs overdue (the deprecated engine's status ladder) has no equivalent. Needs the
   due-date layer first, then a today-vs-due comparison.

These are all **extensions of the existing catalog** (new columns/category values + a due-date
computation module ported and re-validated from the deprecated lib) — non-trivial but additive.

### What the current model CANNOT hold at all (NEEDS NEW STRUCTURE)

The **Shape 3b** corporate-change / relational obligations (§1.6) have **no data source**:

- **Corporate-change events** (legal name / address / FY-end change / post-founding share-class add)
  require `activity_log` event_types that are **never emitted** today. No obligation row, no rule, no
  detection. A compliance engine claiming "full obligation coverage" while silently omitting these
  would **look like coverage without being it.**
- **Count-range** (`director_count_out_of_range`) needs `companies.director_min`/`director_max`
  columns that don't exist.
- **Temporal-proximity matching** ("an acceptance/issuance/transfer is covered by a resolution within
  ±N days") is a **different satisfaction semantic** than `event_documents` link-existence. The
  current engine marks an act satisfied iff a doc was *explicitly linked*; the spec wants
  *instrument-correct + date-proximate* inference. Bridging this is new logic, not a catalog row.

**§2 verdict: HOLDS for Shape 1 + 3a · NEEDS-EXTENSION for Shape 2 + the AFM/conditional layer ·
NEEDS-NEW-STRUCTURE for Shape 3b (corporate-change, count-range, temporal-proximity).**

---

## SECTION 3 — Gaps + foundation risks

### Explicit GAPS (roadmapped items the current model can't represent)

- **G1.** No due-date storage or rule layer on the requirements catalog (Shape 2).
- **G2.** No AFM/AC enforcement-tier field; the split is code-only and deprecated.
- **G3.** No conditional-applicability field (auditor-waiver "only if no auditor").
- **G4.** No `activity_log` event_types for corporate-change obligations (name/address/FY/share-class).
- **G5.** No `companies.director_min`/`director_max` for count-range rules.
- **G6.** No temporal-proximity satisfaction semantic — only explicit `event_documents` links.
- **G7.** No entity-signatory **lifecycle obligation** (trustee/officer roster changes evidenced),
  though the signatory schema (`start_date`/`end_date`) exists — Phase 6, reclassified launch-critical.

### Foundation RISKS — build-now-rebuild-later traps

**R1 — Three obligation representations already coexist (the divergence trap).** The
`company_fiscal_years` ⟂ `company_active_years` precedent is *already reproduced* in the obligation
domain:
- `compliance_rules` — 5 keys/framework (`annual_board_resolution`, …), has due-dates via
  `compliance_items`, **deprecated**.
- `minute_book_requirements` — 25 keys (`lsaq_annual_board_resolution`, …), **different vocabulary**,
  no due-dates, live in the completeness engine.
- `compliance-taxonomy-2026-04-28.md` — 16 event rules, **never built as a table**.

The *same concept* ("annual board resolution") exists in two seeded tables under **non-matching
keys**. Building a new engine on `minute_book_requirements` **without explicitly retiring
`compliance_rules` + mapping the spec's rules into the new model** creates a **fourth**
representation — the exact divergence the precedent warns against. **This is the headline foundation
risk: pick ONE canonical obligation source and migrate/retire the others as part of the engine
build, not after.**

**R2 — Due-date logic lives in exactly one place and it's being deleted.** `calculateDueDate` +
`compliance_items.due_date` are the only due-date code/storage, and both are on the deprecation
path. Building the new engine without **porting AND re-validating** the formulas loses the AFM
deadline concept entirely (and it was never lawyer-confirmed — §4).

**R3 — Link-existence ≠ legal compliance.** `event_documents` satisfaction means "a document was
attached," not "the correct instrument within the deadline." An engine that keeps this semantic will
mark acts compliant that a lawyer would call non-compliant (wrong instrument / wrong date). Decide
the satisfaction semantic **before** building, or the compliance % is not defensible.

**R4 — Silent coverage gap on corporate-change obligations.** If the engine ships covering Shapes 1
+ 3a only, the headline reads "compliant" while 4 AFM-class obligations (name/address/FY/share-class
filings) + count-range + NEQ aren't even evaluated. Per the figure-audit lesson, **a bounded engine
must declare what it doesn't cover** or it reads as full coverage.

**R5 — `category` CHECK rigidity.** Adding AFM/AC or `conditional` means a CHECK migration + 25-row
backfill on a production reference table; the binary CHECK is a small but real foundation constraint.

### Latent divergence (overlapping concepts already in two systems)

- **Obligation catalogs:** `compliance_rules` vs `minute_book_requirements` (R1).
- **Document↔event linkage:** `event_documents` (canonical) vs the legacy
  `share_transfers.resolution_document_id` 1:1 FK (left in place, flagged for deprecation in the
  migration header) — a second, narrower link path that must be retired to avoid a read-path fork.
- **Completeness vs compliance scoring:** two engines reading `documents` by different keys
  (`requirement_key`+`requirement_year` vs `document_type`-in-window) — carried from
  `audit-dashboard-figures-2026-05-30.md` §Step-2.

---

## SECTION 4 — Lawyer-gate flags

Items whose **completeness or correctness is a LEGAL question**, not an engineering one. Flagged for
Dom's lawyer; **this audit does not attempt to answer them.**

| # | Question for counsel | Anchor |
|---|---|---|
| L1 | Is the **25-key requirement set** the complete set of obligations Quebec law (LSAQ) + CBCA impose on a QC small corp? Anything missing? | §1.1–1.2 |
| L2 | Are the **due-date formulas** legally correct? (annual resolutions/financials FY-end+6mo; `req_annual_update` FY-end+4mo-day-15; `corporations_canada_annual_return` incorporation anniversary; CBCA annual return) | §1.3, G1/R2 |
| L3 | Is the **AFM/AC split** ("active government enforcement → AFM") legally defensible per obligation? Should any AC item be AFM (or vice versa)? | §1.3, G2 |
| L4 | **Auditor-waiver scope** — does it apply to ALL companies or only non-public-offering corps (LSAQ art. 239 / CBCA s.163)? Is it conditional on not appointing an auditor? | §1.2, G3 |
| L5 | **legal_reference drift** — auditor waiver: `compliance_rules` says **LSAQ art. 223**, memory/catalog say **art. 239**. Which is correct? | §1.3 Note 2 |
| L6 | **Director-removal instrument** — board vs shareholder resolution (LSAQ art. 144 / CBCA s.109)? Current code routes `revocation → shareholder`. | §1.4 |
| L7 | **Share-event instruments** — is issuance / transfer / cessation evidenced by board-only, shareholder-only, or dual resolutions? (blocks template authoring) | §1.4, §1.5 |
| L8 | **Corporate-change filings** — what exactly does each trigger (REQ Avis de modification; CBCA Form 3/4; special shareholder resolution + amended articles)? | §1.6 |
| L9 | **Director-election annual deadline** (CBCA s.133 / LSAQ 15-month AGM) — is it captured by the annual-resolution obligation or a separate deadline? | §1.2, §1.3 |
| L10 | **Temporal-proximity tolerance** — is a "±N-day window" for a covering resolution legally meaningful, or must the link be explicit? | R3, G6 |
| L11 | **Trust / corporate signatory conventions** ("Par : [trustee], fiduciaire"; "Per: [officer], [title]") — accurate to Quebec practice? | §1.5 |
| L12 | **Entity-signatory & joint-holder obligations** — what evidence does Quebec law require when a trustee/authorized officer changes, or for joint holdings? | §1.5, G7 |

**Lawyer-gate count: 12.**

---

## REPORT-BACK SUMMARY

- **Inventory size:** (a) SHIPPED ≈ **24** distinct obligation/event types · (b) IN-PROGRESS/LOCKED-NEXT
  = **5** · (c) ROADMAPPED/DEFERRED = **11**.
- **Section 2 verdict:** **HOLDS** Shape 1 (25-key catalog) + Shape 3a (lifecycle-act evidence);
  **NEEDS-EXTENSION** for Shape 2 (due-dates + AFM/AC + conditional + overdue) — all additive columns
  + a ported due-date layer; **NEEDS-NEW-STRUCTURE** for Shape 3b (corporate-change, count-range,
  temporal-proximity) — no data source exists today.
- **Section 3 foundation risks:** **R1 three coexisting obligation representations w/ mismatched keys
  (the divergence trap — headline)**; R2 due-date logic exists only in deprecated, soon-deleted code;
  R3 link-existence ≠ legal compliance; R4 silent coverage gap on corporate-change AFM obligations;
  R5 `category` CHECK rigidity. Plus latent divergence in document↔event linkage
  (`event_documents` vs legacy `share_transfers.resolution_document_id`).
- **Section 4 lawyer-gate count:** **12**.

**Bottom line for the engine-design decision:** the requirements catalog is the right *base* for
Shapes 1 + 3a, but it is **not a drop-in compliance engine** — it must be extended with a due-date /
AFM / conditional layer (Shape 2) and a new detection layer for corporate-change obligations
(Shape 3b). The single highest-leverage foundation decision is **declaring one canonical obligation
source and retiring `compliance_rules` + the legacy link path as part of the build**, so we don't
ship a fourth parallel system. The legal completeness/correctness of the obligation set + due-dates
is a 12-item lawyer conversation, not an engineering one.

*Read-only architecture investigation. No engine design decided here; this feeds that decision.*
