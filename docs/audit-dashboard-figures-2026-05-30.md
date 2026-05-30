# Audit — Dashboard figure reconciliation (read-only investigation)

**Date:** 2026-05-30
**HEAD at audit:** `f97e60c` (post-Tier-1-#21 unified completeness merge)
**Scope:** Definition-mapping only. No code touched, no redesign proposed. Establishes what
every numeric figure on the Dashboard + Complétude surface actually counts, at the data-source
level, so the dashboard redesign can show figures that reconcile.

---

## Step 0 — Preflight

- `git log -1 --oneline HEAD` → `f97e60c feat(completeness): unify requirement + event scoring (Tier 1 #21)`. Working tree clean.
- Lifecycle (`docs/feature-lifecycle.md`):
  - **Minute Book — Complétude** = `ACTIVE` (L57). ✅
  - **Dashboard** = `_TBD_` (L54) — composite surface, never flipped ACTIVE.
  - **Compliance surface** feeding the Dashboard compliance widget = **DEPRECATED** (L69, L77):
    `lib/compliance/calculateComplianceItems.ts` + `compliance_rules` / `compliance_items`
    tables, "one remaining live consumer: Dashboard's compliance widget," cleanup queued
    post-temporal-registry. Known pre-existing bug recorded at L77: writes a 3-value enum that
    violates prod's 4-value CHECK, so writes silently fail.
- **Step-0 gate tripped** (Dashboard UNCERTAIN + compliance DEPRECATED). Surfaced to Dom; greenlit
  to proceed with the deprecated-compliance status as the audit **headline finding** (Option 1).

---

## HEADLINE VERDICT — the compliance figure runs on code already slated for deletion

The Dashboard compliance percentage ("Taux de conformité" + "Conformité LSAQ") is produced by
`calculateComplianceItems`, which the lifecycle tracker marks DEPRECATED with a scheduled
teardown (replace with a `minute_book_requirements`-backed equivalent, then DROP the
`compliance_*` tables). **Reconciling a redesign against this figure means reconciling against a
number whose engine is being removed.** Three concrete sub-findings below (A.1–A.3) answer
exactly what a user sees today, what a correct figure would be sourced from, and whether the two
on-screen compliance numbers actually differ.

---

## The figures, traced to source (Step 1)

### FIGURE A — Compliance ("Taux de conformité" / "Conformité LSAQ")

**Where rendered** (`app/[locale]/dashboard/page.tsx`):
- StatCard **"Taux de conformité"** — L326-336, value `${percentage}%` (L328), sub "obligations remplies".
- Block 2 **"Conformité LSAQ/CBCA"** — L590-662, big `{percentage}%` (L620); breakdown
  `Complétés {compliantCount}/{total}` (L641), `En attente {pendingCount}/{total}` (L649),
  `À corriger {urgentCount}/{total}` (L657).
- Block 1 **"Actions requises ({actionCount})"** — L525, `actionCount = urgentCount + pendingCount` (L224).
- All bind to the same locals computed L218-224 from `complianceResult`.

**Source query:** `calculateComplianceItems(company.id, supabase, undefined, activeYears)` (L170-172).

**Exact computation** (`lib/compliance/calculateComplianceItems.ts`):
- Reads `compliance_rules` (L129-146), filtered by framework — LSA/QC, or CBCA(+req_annual_update). Reads `documents` where `status != 'archived'` (L120-124).
- **Single fiscal year only.** `fyEnd = currentFiscalYearStart(...)` (L153); `fyStart = fyEnd − 12mo` (L154). A document counts only if `uploaded_at ?? created_at >= fyStartStr` (L162).
- **Match by `document_type`** via `DOCUMENT_TYPE_TO_RULE` (`complianceRules.ts` L43-48): only 4 types map — `resolution→annual_board_resolution`, `pv→annual_shareholder_resolution`, `rapport→annual_financial_statements`, `statuts→req_annual_update`.
- Per rule: `compliant` if a matching doc found this FY; else `pending` if due date is future; else `required` (overdue) (L196-202).
- `activeYears` gate: if current FY isn't active, **all** items drop → empty result (L243-247).
- Counts (L250-254): `compliantCount`, `pendingCount`, `urgentCount(=required)`, `total = filteredItems.length`, `percentage = round(compliant/total × 100)`.

**Denominator basis:** count of applicable `compliance_rules` for the **current fiscal year only** (one FY; obligations, not documents). The breakdown's `/N` is that rule count.

#### A.1 — What does the user actually see today, given the silent-write bug?

**The displayed number is LIVE and computed-as-designed — NOT stale, NOT meaningless.** The
silent-write at L232-237 upserts into `compliance_items` (a 3-value `status`,
`complianceRules.ts:1, vs prod's 4-value CHECK) and the result is `await`ed but never
error-checked → it fails silently. But the returned figures (L262-269) are computed **in-memory**
from `filteredItems` (L250-254), with **zero dependency on that upsert**. Nothing on the dashboard
reads `compliance_items` back. So the bug corrupts/never-populates an **unused persistence
table**; it does **not** make the on-screen percentage stale or wrong.

What *is* questionable about the number's meaning:
- **Single-FY scope** — it reflects only the current fiscal year, while the completeness figure
  spans all active years. Two adjacent cards silently measure different time windows.
- **Two rules can never be satisfied.** `ACTION_DESCRIPTIONS` (page.tsx L64-89) enumerates 6
  rule_keys including `auditor_waiver` and `corporations_canada_annual_return`, but
  `DOCUMENT_TYPE_TO_RULE` maps only 4. Any `auditor_waiver` / `corporations_canada_annual_return`
  rule present in the rule set has no document_type that can mark it compliant → it sits
  permanently `pending`/`required`, structurally dragging the percentage **below the true state**
  regardless of what the user has filed. (Classified BUG — D1b.)
- **Coarse matching** — by `document_type` within a date window, not by `requirement_key` /
  `requirement_year`. Any board resolution in the window satisfies the rule, regardless of which
  year it actually belongs to.

#### A.2 — Where would a CORRECT compliance number be sourced from?

The lifecycle note (L77) points to a `minute_book_requirements`-backed equivalent. Relevant fact:
**the data already exists.** `computeRequirementCompleteness` (`lib/minute-book/requirement-completeness.ts`)
already scores per-requirement, per-FY satisfaction off `minute_book_requirements` +
`documents.requirement_key`/`requirement_year` with 3-state weighting. A basic FY-scoped
"% of this year's required docs present" can be derived by filtering that existing checklist to
the current FY's annual obligations — **no new engine needed for that.**

What is **not** free: "compliance" as Dom defines it (legal obligations **met this FY**, the
time-sensitive AFM gov-filing subset) is narrower than completeness and carries logic the
completeness engine does **not** have — due-date computation (`calculateDueDate`, L41-78,
incl. the FY-end+6mo / REQ +4mo-day-15 / Corporations-Canada-anniversary rules), the
AFM-vs-AC split, and overdue→`required` escalation. That deadline logic lives **only** in the
deprecated lib today. So a trustworthy compliance figure = **port the due-date/obligation logic
onto the requirements catalog + retire `compliance_rules`/`compliance_items`** — more than a label
swap, less than a from-scratch engine. **This is a real scoping decision, not a redesign detail.**

#### A.3 — Are there TWO compliance computations, or one rendered twice?

**One computation, rendered twice.** Both "Taux de conformité" (L328) and "Conformité LSAQ"
(L620) bind to the **same** `percentage` local (L221). In current code they **cannot differ**.
There is exactly one `calculateComplianceItems` call (L170). If a prior screenshot showed
"50%" and "25%" side by side, that divergence is **not reproducible at `f97e60c`** — either a
stale screenshot or a since-removed second computation. Both today route through the deprecated lib.

---

### FIGURE B — Completeness ("Complétude du livre" / Complétude header)

**Where rendered:**
- Dashboard `MinuteBookCard` (`components/dashboard/MinuteBookCard.tsx`) — fetches
  `/api/minute-book/completeness` (L24). Shows `CompletenessBar score` (L56-61),
  `{totalSatisfied} / {totalRequired} documents requis` (L65), `{totalMissing} manquants` (L67-71).
- Complétude page header (`components/minute-book/CompletenessPage.tsx` L272-301):
  `{score}% complet · {totalUploaded} téléversés · {totalGenerated} à signer · {totalMissing} manquants`,
  with legend "Signé et téléversé / À signer / À générer ou à téléverser."

**Source:** `GET /api/minute-book/completeness` (post-#21 server-merge), runs both engines via
`Promise.all` (route L75-88) and sums numerators + denominators:
- `combinedNum = requirementsWeightedNum + eventsWeightedNum` (L94)
- `combinedDenom = requirementsTotal + events.totalActs` (L95)
- `score = combinedDenom === 0 ? 0 : round(combinedNum / combinedDenom × 100)` (L96-98)
- `totalRequired = requirementsTotal + totalActs` (L109)
- `totalSatisfied = (reqUploaded + reqGenerated) + events.totalSatisfied` (L108, L110)
- `totalMissing = totalRequired − totalSatisfied` (L111)
- `totalUploaded = reqUploaded + eventsUploaded` (L112); `totalGenerated = reqGenerated + eventsGenerated` (L113)

**Denominator basis** (`requirement-completeness.ts` L120-175): `|foundational reqs|` (1 each) +
`|annual reqs| × |active fiscal years|` + `|event acts|`. This is a **catalog-of-obligations ×
years** basis — **not** a count of document rows. Event acts (`event-completeness.ts`) add
director/officer/share lifecycle acts.

**Weighting vs raw — the core B reconciliation point:**
- `score` is **WEIGHTED**: téléversé=1.0, généré=0.5, missing=0.0 (`lib/minute-book/state.ts` L46-50).
- `totalSatisfied` (the `X` in "X / Y au livre") is a **RAW** count: uploaded + generated each count as 1.
- Therefore **`score%` ≠ `totalSatisfied / totalRequired`** whenever any `généré` rows exist. A book
  at 10/39 raw (≈26%) renders a *lower* weighted headline (e.g. 18%) because generated-but-unsigned
  docs count half. The fraction and the percent are answering two different questions on purpose.

**The three header buckets are a clean partition of the total** (confirmed via `getDocumentState`,
state.ts L68-76: satisfied ⇒ uploaded|generated, not-satisfied ⇒ missing):

```
totalUploaded ("téléversés")  +  totalGenerated ("à signer")  +  totalMissing ("manquants")  =  totalRequired
        (signed final)                  (generated, unsigned)            (not in book)
        \__________________________________________________/
                       totalSatisfied  ("X / Y au livre")
```

So **"à signer" rows are SATISFIED, not missing.** "À signer" (totalGenerated) and "manquants"
(totalMissing) are **disjoint** buckets. The legend label "À générer ou à téléverser" *is* the
**missing** bucket (CompletenessPage L300 ↔ L279) — i.e. `missing` already means "to generate or
upload." (See D4.)

> **Note on the brief's screenshot figures (18% / 10-of-39 / 29 manquants / à générer 17 / à signer 2):**
> these are from the May-26 dashboard, which **predates Tier-1-#21** (shipped 2026-05-30). The
> current route folds event acts into every figure, so a pre-#21 triple is not reproducible at
> `f97e60c`. The brief's framing "à générer 17 + à signer 2 partition the 29 manquants" does **not**
> match the code: per the partition above, "à signer 2" lives inside the satisfied 10, and
> "à générer ou à téléverser" *is* the 29. There is no missing "other 10" — the premise mixes the
> satisfied and missing buckets.

---

### FIGURE C — AI ("N documents" / Records analysis)

**Where rendered:** dashboard AI panel `GapAnalysisPanel` (`components/ai/GapAnalysisPanel.tsx`),
mounted at page.tsx L446. Header "⚡ Analyse de votre registre / Records analysis" (L132); button
text **"Analyser mon registre / Analyze my records"** (L154). Gated behind
`feature_flags.ai_gap_analysis` (L66-71) + requires ≥1 active fiscal year (L74-85).

**Finding: no current component renders an "N documents" / "24 documents" count.** The AI button
cites no document count. The analysis route `POST /api/ai/gap-analysis`:
- reads `documents` where `status='active'` with `document_year` set (route L76-88),
- computes per-FY gaps against `REQUIRED_DOCS` (LSA: `resolution/pv/rapport` = 3; CBCA: +`statuts` = 4) (L11-14, L90-105),
- returns `{ gaps, summary, hasGaps }` — **no count field.**

The only **live document counters** in the surfaces audited:
- Coffre-fort header `${filtered.length} document(s)` (`DocumentsClient.tsx` L208) — the current
  year-mode/search-filtered subset of the company's documents (page query has no `status` filter,
  documents page L36-40).
- Dashboard `allDocs.length` (page.tsx L180) — **all** `documents` rows (no status filter, includes
  archived); used only to slice `recentDocs`, never displayed as a count.

**Verdict C:** "24 documents" is **not** emitted by any current code path. It is either a stale/removed
screenshot element or a mislabeled counter. If the redesign wants the AI entry point to cite a
document count, that count has to be **defined** — it does not exist today. (See D6.)

---

## Step 2 — Reconciliation map

Live DB values were not queried (read-only + skip-live-introspection discipline; the brief's
screenshot numbers are pre-#21 and no longer reproducible). The map is therefore **definitional** —
what each figure counts and how the engines relate for the **same** company.

| # | Figure (label) | Engine / file | Tables read | Match key | Time scope | Denominator | Weighted? |
|---|---|---|---|---|---|---|---|
| A | Taux de conformité / Conformité LSAQ `%` + Complétés/En attente/À corriger | `calculateComplianceItems` (**DEPRECATED**) | `compliance_rules`, `documents`, (writes `compliance_items` — silently fails) | `document_type` → rule_key, **4 of 6** keys mapped, within FY window | **current FY only** | applicable `compliance_rules` count | No (`compliant/total`) |
| B | Complétude `%` + X/Y au livre + téléversés/à signer/manquants | merged `/completeness` = `computeRequirementCompleteness` + `computeEventCompleteness` | `minute_book_requirements`, `company_fiscal_years`, `documents`, `event_documents`, lifecycle tables | `requirement_key` + `requirement_year` (precise); event acts by `(event_type,event_id,event_phase)` | **all active FYs + foundational + events** | catalog × years + event acts | **Yes** (1.0/0.5/0.0) for `score`; raw for X/Y |
| C | AI "Records analysis" (button cites **no count** today) | `/api/ai/gap-analysis` | `documents` (active, `document_year` set), `company_fiscal_years` | `document_type` per `document_year` vs `REQUIRED_DOCS` (3 LSA / 4 CBCA) | per active FY | n/a (gap list, no %) | No |

**Brief's specific questions, answered:**

1. **Is "à générer 17" + "à signer 2" a partition of "29 manquants"?**
   **No.** Per current code the partition is `uploaded + generated + missing = total`. "À signer"
   (generated) rows are **satisfied** (inside the X-of-Y), **disjoint** from "manquants" (missing).
   "À générer ou à téléverser" is the *label* for the missing bucket itself. There is no leftover
   "other 10" — the 17/2/29 triple is a pre-#21 screenshot and the premise conflates satisfied vs
   missing buckets.

2. **Is the AI's "24 documents" = active document rows, or something else?**
   Neither — **no current code emits it.** Closest live counters: Coffre-fort header (filtered
   active-doc subset, `DocumentsClient` L208) or the raw `documents` row count (`allDocs.length`,
   page.tsx L180). The AI panel currently shows no count.

3. **Do compliance (A) and completeness (B) share any underlying rows?**
   **Only the `documents` table — read by both, but via different keys.** A matches by
   `document_type` within a 12-month window; B matches by `requirement_key` + `requirement_year`.
   They share **no requirement catalog**: A's denominator is `compliance_rules`, B's is
   `minute_book_requirements` × active FYs (+ events). A document can satisfy a compliance rule
   (right type, right window) while being unlinked to any `requirement_key` (so unsatisfied in B),
   and vice versa. **The two counts measure genuinely different sets and cannot be made to add up
   to each other.** C is a third independent basis (document_type per year vs `REQUIRED_DOCS`).

**Which figures CAN'T be reconciled vs which just aren't labeled:**
- **Genuinely independent (no clean relationship): A ↔ B ↔ C.** Three engines, three denominators,
  three match strategies. No arithmetic ties them. This is a DEFINITION problem — the product must
  decide which figures survive the redesign and what each canonically means.
- **Correct math, just unlabeled (within B):** `score%` (weighted) vs `X/Y` (raw); the
  uploaded/à-signer/missing partition. The numbers are right; the UI never shows the relationship.

---

## Step 3 — Discrepancy classification

| ID | Discrepancy | Class | Fix lever |
|---|---|---|---|
| D1 | Compliance figure powered by DEPRECATED `calculateComplianceItems` + `compliance_*` tables, scheduled for teardown; canonical compliance source undecided | **DEFINITION** | Product decision: does compliance survive the redesign, and if so source it from `minute_book_requirements` (A.2) |
| D1a | `compliance_items` upsert writes 3-value enum vs prod 4-value CHECK → silent write failure (L232-237) | **BUG** | Real but **inert** (table unread); moots itself on cleanup |
| D1b | `auditor_waiver` + `corporations_canada_annual_return` rules have no `DOCUMENT_TYPE_TO_RULE` entry → can never be `compliant` → percentage structurally understated | **BUG** | Either map them or exclude them from the denominator |
| D2 | "Taux de conformité" and "Conformité LSAQ" are two cards bound to the **same** `percentage`; two cards imply two metrics | **LABELING** | One figure; don't render it as if two distinct measures |
| D3 | Complétude `score%` (signed-weighted) vs "X / Y au livre" (raw count) diverge by design | **LABELING** | Math correct; copy must distinguish "signed-weighted %" from "raw count in book" |
| D4 | "à signer N" vs "manquants M" read as if both are part of missing; they're disjoint (à signer = satisfied-generated) | **LABELING** | Make the uploaded/à-signer/missing **partition** legible |
| D5 | Completeness `totalSatisfied` counts unsigned drafts (généré) as satisfied — diverges from Dom's "finalized+signed in the book" intent | **DEFINITION** | Decide whether "in the book" means present, or signed-final only |
| D6 | AI "N documents" (e.g. "24") has **no source** in current code; AI button cites no count | **LABELING** | If a count is wanted, define it; otherwise it's a removed/stale element |
| D7 | A, B, C use three different document-match bases + denominators → independent, non-reconcilable counts shown side by side | **DEFINITION** | Canonical definitions + decide which figures the redesign keeps |

**Tally: 4 LABELING (D2, D3, D4, D6) · 3 DEFINITION (D1, D5, D7) · 2 BUG (D1a, D1b).**

---

## Bottom line for the redesign

- The **single biggest reconciliation blocker is DEFINITION, not arithmetic.** Compliance (A) and
  completeness (B) are independent engines over different catalogs; they will never "add up." The
  redesign must pick canonical definitions and decide whether the compliance figure survives at all.
- If it survives, it must be **re-sourced off `minute_book_requirements`** (the deprecated lib is
  being deleted), which is a **scoping decision** carrying the due-date/obligation logic that today
  lives only in the deprecated path — not a cosmetic change.
- The **within-completeness** confusions (D2/D3/D4) are pure labeling: the math is correct, the UI
  just never shows that the headline is signed-weighted while the fraction is raw, or that
  uploaded/à-signer/missing partition the total.
- The two BUGs are low-urgency: D1a is inert (writes to an unread table), D1b understates the
  deprecated compliance %, which the teardown moots anyway.
- "24 documents" has no live source — treat it as a removed/stale element, not a figure to reconcile.

*Read-only investigation. No redesign decided here; this feeds that decision.*
