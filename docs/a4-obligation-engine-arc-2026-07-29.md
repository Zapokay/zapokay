# A4 — The Obligation Engine Arc

**Version:** v3 · **Date:** 2026-07-29 · **Status:** PLAN — awaiting two Dom decisions; nothing built
**Author:** Max, from CC's investigations 2026-07-28/29
**HEAD at drafting:** `e9bc5fb` (+ `8a0bf79`, docs-only, unpushed)
**Supersedes in scope:** the "feeder consolidation" framing in ZK_Queue. That entry sized the work from the merge; this one sizes it from the emission.

> **★ SYNC RULE (boot protocol):** this file lives in BOTH `docs/` and project knowledge. Amend one, amend the other, and bump the version above. Max reads project knowledge; CC reads the repo; neither can see the other's.

---

## 1. Why this exists

Four ranking patches were considered and rejected on 2026-07-29. Dom: **"there is no point of having a fix that is not a global solution."** He also asked, and it is the honest question: *"our entire system is so overwhelming and complicated — is it me?"*

It is not. Every defect found across two days traces to **one decision**, and this arc removes it. The plan exists so that a fresh Max does not re-derive three hours of measurement.

---

## 2. ★★ THE ROOT CAUSE — one decision, three symptoms

**`CompanyComplianceInput` is deliberately pure — "no I/O" — so `deadlines.ts` cannot see the checklist or the fiscal-year set.** The purity is real, documented in the file's own comments, and was defensible. Its running cost is roughly **one interface field per new obligation, forever.**

Three consequences, all previously chased as separate bugs:

1. **One boolean per obligation in the input.** `hasLaterAnnualFiling`, `currentFedReturnFiled`, `noPriorAnnualMeetingRecorded` — a fourth obligation means a fourth flag.
2. **One hand-written block per obligation in the body.** The feeder must be taught each rule's name.
3. **One clock for one year**, because only one anchor is passed in — which is why six of seven historical filing years are permanently dateless, and why the board cannot see them as overdue.

**★ The irony is recorded in the code:** `ANNUAL_MEETING_RECORD_KEYS` is *exported from* `deadlines.ts` so the caller can compute a fact and hand it back. **The feeder already owns the knowledge; it just isn't allowed to hold the data.**

---

## 3. MEASURED FACTS — do not re-derive these

All measured by CC 2026-07-28/29 at `e9bc5fb`. Line numbers are snapshots; re-anchor before use.

### 3a. `deadlines.ts` is a hand-written switch

- **It never iterates `FILING_REGISTRY`. Not once.** Three hardcoded string literals reach it: `filingForRuleKey('qc_initial_declaration')`, `('qc_req_annual_update')`, `('fed_annual_return')`. **The registry is a lookup table the switch reads, not a table the engine walks.**
- **Adding a registry entry today emits nothing.**
- **389 lines: ~61% per-obligation special-casing, ~36% shared machinery.** The four emission blocks are 199 lines (51%). Executable-only: ~84 bespoke vs ~73 shared. **Control flow is 100% bespoke.**
- **Four obligations, four hand-written `if` blocks:** RE-200, QC REQ annual update, federal annual return, annual meeting.
- **★ `annual_meeting` has NO registry entry at all** — `ruleKey: 'annual_meeting'` is a bare literal, its statutory basis an inline three-branch ternary. Deliberate: the registry is documented as *"the single source of truth for **government filing** obligations"* and the annual meeting is internal governance.
- All eight title strings are **inline literals** in the feeder, not i18n keys.

### 3b. The three flags are not structurally required

All computed in `app/[locale]/dashboard/page.tsx` from `completeness.checklist`. **All three are `checklist.some(...)` predicates the feeder could evaluate itself.** `currentFedReturnFiled` even hardcodes `'cbca_annual_return'`, which the registry already declares as `fed_annual_return.requirementKeys`. **The caller restates what the registry knows.**

### 3c. One-row-per-rule is INCIDENTAL, not essential

- The emission is a single `push` guarded by `if (fyEnd)` at the most recently completed FY. **The guard does double duty: "has any FY closed?" and "here is the only year I care about."**
- **`push` already takes `yearSeg` and `year` as parameters** and builds `id = deadline:{ruleKey}:{yearSeg}`.
- **★ `mergeObligations` already indexes twins by `` `${ruleKey}|${year}` `` — a map built to pair N deadline rows with N completeness rows. It has simply never received more than one.**
- **`fiscalYears: { year, endDate }[]` already exists** on `RequirementCompletenessResult`, built for each active year, and is **the same set the completeness checklist fans out over** — so a per-year loop guarantees a twin for every completeness row.
- ⚠️ **Caveat:** those `endDate`s are composed from the company's *current* year-end for every historical year. A year-end change retroactively rewrites them. `completedFiscalYearEnd` has the same flaw today, so this is not a regression — but scaling from one anchor to N **multiplies the blast radius**. See the deferred fiscal-year work in ZK_Core.

### 3d. What the registry already does right — the reason this is reachable

- **`dueDate(ctx)` is already a name-free pure function.** `qc_req_annual_update` is `(ctx) => ctx.fyEnd ? addMonthsClamped(ctx.fyEnd, 6) : null`. **Hand a generic loop an `fyEnd` and a rule and it computes the date with no name-awareness.**
- **`cadence` already DRIVES behaviour**, not merely describes it: `OVERLAP_MERGE` and `_boardSuppressedKeys` both derive from it. Working proof the pattern holds.
- Four consumers that used to drift (`OVERLAP_MERGE`, `isExternalRequirementKey`, `isBoardSuppressedRequirementKey`, rank's prerequisite resolver) are already views onto one table. **The registry fix worked. The emission never got the same treatment.**

### 3e. The registry's gaps — what a generic loop needs and cannot get

1. **Applicability** — no `frameworks` field; `framework === 'CBCA'` lives in `if` conditions
2. **Exposure / actionKind** — hardcoded per push
3. **Titles** — both locales inline in the feeder
4. **A suppression predicate** — no declarative home for the three booleans
5. **Upload-attach fields** — `requirementKey` + `canUpload` hand-set on the federal push only
6. **Multi-limb statutory basis** — `annual_meeting` needs three, chosen by framework and limb
7. **`FilingDueCtx` has no per-year `fyEnd`** — it carries the singular anchor

### 3f. The board, measured

- **The board caps at 5** (`A3Board.tsx:34`). "Show more" is a `<Link>` to Complétude — **it never expands in place.** Both are per spec D4 and correct.
- **`LIVENESS_RANK` is an ABSOLUTE primary sort key above the score** (`rank.ts:104-115`), introduced by `c5c0637` (2026-07-06) — **three days after the ranking spec, which has no such concept.** It contradicts two locked decisions in their own words: D1 *"NOT a fixed category order"* and D3 *"a genuinely imminent government deadline can still pass above them."*
- **It fixed a real defect** — *"ancient-overdue items outranking current actions"*, verified as *"2026 resolutions above 2018 filings."* But **the root cause is `rank.ts:90`, a flat overdue ceiling** (`if (d < 0) return URGENCY_MAX`): one day late and eight years late score identically, then tie-break rung 4 *"oldest year first"* actively promotes the older. **The ancient item won on the tie-break, not the merits. Line 90 is untouched at HEAD.**
- **★ It was verified on Acme only** — the one fixture that structurally cannot show the side effect, since Acme has zero unsatisfied foundational rows on the board. **The inversion needs an empty book, and Acme is the opposite of one.**
- **The "Part-1 liveness multiplier" the comment says it replaced never existed** (`git show c5c0637^` — zero liveness references). **The weighted form was skipped entirely.**
- Scores confirmed: `STAKES_EXTERNAL=1.0`, `STAKES_FOUNDATIONAL=0.9`, `STAKES_INTERNAL_ANNUAL=0.6`, `STAKES_LOW=0.3`, `URGENCY_MAX=1.0`, `URGENCY_FLOOR_LOW=0.15`, `VIRTUAL_URGENCY_FLOOR=0.55`, `ESCALATION_WINDOW=45`. **`0.4950 = 0.9 × 0.55.`**
- **Acme's REQ update for 2025 — 27 days overdue, external — scores `1.0000`, the highest in either fixture, and ranks 2**, beneath a `0.0900` share-issuance draft that isn't due. **The scoring model worked and the bucket overrode it.**

### 3g. ★ The modelling that decides the sequence

A verified re-sort probe (self-checked three ways — identity, reversed, stride-7 — reproducing today's order exactly) modelled **`remediate` last; `live` and `regularize` compete on score**:

- **ACME: fixed.** The `1.0000` REQ update moves 2 → 1. Top 5 becomes REQ update, annual meeting, auditor waiver, director departure, officer departure.
- **★★ WICK: NOT ONE POSITION MOVES.** All eight founding documents stay at ranks 1-8. **A new company's board is identical before and after.**
- The ancient-overdue defect does **not** return: all 38 pre-2024 rows across both fixtures are `remediate` and stay demoted.

**Why Wick doesn't move:** its 2025 REQ update is `regularize` and **clockless at `0.1500`**. Give it a clock → `1.0000`, but today's bucket keeps it at rank 19. Remove the bucket → still `0.1500`, below `0.4950`. **Neither fix alone moves a new company's board. Both together put the overdue filing at rank 1.**

### 3h. The seam is in the wrong place

**Nothing is epistemically irreducible between the two engines.** Given the same inputs — checklist, fiscal-year set, company scalars, registry — one function could compute every field both produce. **`OVERLAP_MERGE` is the receipt for the split.**

**Two feeders remains the floor** — but on **cadence**, not on completeness-vs-deadline: `per-fiscal-year | anniversary | once` are all **calendar-instantiated**; `event` is **act-instantiated**. Different instantiation sources, genuinely two shapes. **`cadence` already names the correct axis; it just doesn't drive emission yet.**

---

## 4. ★★ TWO DECISIONS GATE THE ARC — Dom's, pending

### D-A · Multiplicity: cadence wins — and it must land FIRST, not last

Dom ruled months ago that **registry `cadence` beats catalog `category`**, but sequenced it *last* because it moves a visible number. **CC's finding reverses the sequencing:** a generic engine driven by `cadence` hits the disagreement on day one (`fed_annual_return` is `cadence: 'anniversary'` but `category: 'annual'`, so completeness fans it out and a derivation exists purely to discard the fan-out). **You cannot design around an unresolved data disagreement.**

**Cost, unchanged and already accepted in principle: Wick's `requirementsTotal` drops by seven and the completeness percentage moves.** Dom sees the number change deliberately.

**Status: needs Dom's confirmation that it lands FIRST.**

### D-B · Does the registry hold INTERNAL obligations?

`annual_meeting` has no registry entry because the registry is scoped to *government filings*. **If it stays out, the switch survives** — one hand-written block instead of four, and every future *internal* obligation stays code.

**Max's lean: expand it.** The concept the product needs is **obligations**, not filings. Otherwise half of future work is still code changes, which is what Dom said he cannot afford.

**Status: needs Dom's ruling.**

---

## 5. THE TARGET

**Adding a new obligation = a catalog row + a registry entry. No code change.**

- The registry declares *what* an obligation is, *when* it is due, *how many* of it there are, and *when it does not apply*.
- **Two feeders, split on `cadence`:** calendar-instantiated and act-instantiated.
- One feeder produces the row **whole** — clock, document state, metadata — so `OVERLAP_MERGE` and the field union die by construction, taking the `helpKey`/`copyKey` drop with them.
- One liveness per row. One year unit.

---

## 6. THE PHASES

Each is separately shippable and separately gated.

| # | Phase | Ships | Gate |
|---|---|---|---|
| **0** | The two decisions (§4) | nothing | Dom |
| **1** | **Multiplicity: cadence drives the fan-out** | visible % change | ⚠️ Section D and the denominator BOTH move. Dom sees the number. |
| **2** | **Registry gains the six fields** (§3e) | inert | ★ Section D **byte-identical** |
| **3** | **Widen `CompanyComplianceInput`** — pass the checklist and the fiscal-year set; nothing reads them yet | inert | ★ Section D **byte-identical** |
| **4** | **The generic loop** replaces the four blocks; **per-year clocks fall out of it** | the big one | ⚠️ Section D **moves on purpose** — see §7 |
| **5** | **The bucket:** `remediate` last; `live` and `regularize` compete on score | board reorders | Modelled result in §3g is the prediction to check against |
| **6** | **Foundational stakes gradation** (Harvey's FORT/MODÉRÉ/FAIBLE) | board reorders | ⚠️ needs more than the boolean — see §8 |

**Phases 2 and 3 are the inert-first discipline** (Lessons §41) — additive, provable, and they make phase 4 a behaviour change with everything already in place.

---

## 7. ★ WHAT "CORRECT" LOOKS LIKE — the acceptance criteria invert at phase 4

**Phases 2-3: Section D byte-identical — ⚠️ AMENDED 2026-07-29. The reference is now `327 rows, md5 `e35801c6…`, at `item4-before2/BEFORE-2026-07-27.txt`.** The earlier figure (`4438011d618b104b6ae1a4b056936ce1`, 317 rows, `item4-before/`) held unchanged across five ships and **can no longer be produced** — Wick gained three ranked rows when its federal-return receipt was deleted (§9e). **Gate against `item4-before2/`; the old hash would fail spuriously.** Any movement beyond that still means the change leaked.

**★ THE ROUTE GATE, restated to remove an ambiguity that has been quoted wrongly for five ships:** the correct figure is **19 pages + 21 API = 40 EXECUTABLE PATHS**, which renders as **41 TABLE ROWS** in the build output because `/_not-found` occupies a row. *"40 routes"* meant executable paths; a build reporting 41 rows is correct and unchanged. **State which you are counting.**

**★ Phases 4-6: Section D SHOULD MOVE, and that is the point.** The old brief's byte-identity target was wrong. Dom's framing decides it: **"ZapOkay should somewhat feel like a calendar."** In a calendar a row either **has a date** or is **honestly dateless**. Acme's FY2019 REQ update is neither — no date, status `open`, six years past due. **The six unclocked rows are a defect, not a design.**

So the phase-4 gate is a **deliberate before/after comparison**, not a hash:

- every fiscal year of a per-fiscal-year obligation carries a due date
- Acme's `1.0000` REQ update reaches rank 1 (phase 5)
- **★ WICK's overdue filings rise above the founding documents** — the criterion that matters, because Wick is the shape of every new customer
- ancient-overdue does **not** return: pre-2024 rows stay `remediate` and demoted
- the harness clock-invariance test still passes for foundational rows
- **Dom's camera is a real gate from phase 4 on** — unlike the four ships of 2026-07-28, this changes the main surface

---

## 8. OPEN QUESTIONS AND RISKS

- **★ `exempt_from_lateness` is a BOOLEAN and Harvey's gradation has THREE tiers.** Phase 6 needs either a second column or a graded one. **The plumbing people assume is there is not.**
- **★ A product question inside phase 6:** the spec locks `EXTERNAL > FOUNDATIONAL`. Harvey called the share subscription *exposition réelle* — proof of who owns the company. **Does that outrank an overdue government filing?** Arguably yes before a sale, no against a radiation risk. **Not a tuning constant — it amends the spec.**
- **`rank.ts:90`, the flat overdue ceiling, is untouched.** Both `c5c0637` and phase 5 route around it. Decaying ancient urgency would let the score express what the bucket currently partitions. **Priced but not scoped.**
- **★ The ranking spec needs a v2.** `a3-ranking-brain-spec-2026-07-03.md` **predates the liveness axis entirely** — no vocabulary for `regularize`/`remediate`, and it never says how the axis feeds the score. **That gap is what let `c5c0637` add an absolute primary sort without anyone noticing it contradicted D1 and D3.**
- **The year-end-change caveat** (§3c) — per-year anchors multiply an existing known flaw. Say it out loud rather than widening it silently.
- **Harvey, still open:** is an unfiled REQ annual update from 2019 still legally owed, or extinguished by later ones? **Decides whether the historical rows become `overdue` or should stop existing.**
- **A fixture gap:** neither Acme nor Wick is a CBCA company without `hasLaterAnnualFiling`, so the RE-200 deadline-twin path `ddf061d` guards is **unverified by construction**.

---

## 9a. ★★ FINDINGS FROM THE PHASE 1 MEASUREMENT (2026-07-29) — all independent of the arc

**Phase 1 measured smaller than the plan assumed: ONE catalog row, ONE framework.** 20 of 25 catalog rows have no `FilingRule` at all; 4 of the 5 that do already agree with their cadence. **Only `cbca_annual_return` disagrees** (category `annual`, cadence `anniversary`). Acme does not move — it is LSA and never selects that key. **Wick `requirementsTotal` 49 → 42.** ⚠️ The plan's `2.04% → 2.38%` figures no longer reproduce (see §9e — Wick's numerator is now 0, so it is 0% → 0% today); the **−7 denominator move stands**.

**★ A DESIGN DECISION LIVES INSIDE PHASE 1, and it reads in §6 as a pure data change.** The engine has TWO loops — foundational (`year: null` + the lateness floor) and annual (per-FY). **`anniversary` fits neither.** Dropping the survivor into `foundationalReqs` would inherit the floor and make a *correctly filed, current* federal return read `regularize` — a new falsehood traded for an old one.
**MAX'S RULING (CTO): a THIRD bucket.** `cadence: 'anniversary'` emits **one row**, at the year the deadline feeder already uses for its attach key (`filingFiscalYear`), with **NO foundational floor**. It must stay counted (*the book is the product*), it is not foundational (it has a clock), and it is not per-fiscal-year (one live instance). ⚠️ **UNVERIFIED: confirm `filingFiscalYear` yields the same year the completeness row carries, or the two will not merge and we get TWO rows where there is one today.**
- `_boardSuppressedKeys` (derived from `cadence === 'anniversary'`, existing purely to discard the wrong fan-out) **dies — but only if the surviving row is the deadline row or does not reach the board.** Depends on the ruling above.
- `OVERLAP_MERGE` is untouched by Phase 1; it serves the two REQ keys where category and cadence agree. It dies at Phase 4.

## 9b. ★★ THE ORPHANED-DOCUMENT CLASS — two producers, zero detectors

**A document whose `(requirement_key, requirement_year)` matches no checklist row becomes INVISIBLE IN COMPLÉTUDE, FULLY VISIBLE IN THE VAULT AND THE BINDER, and is silently subtracted from the completeness numerator.** Not data loss, not a broken link — **a document the user can see and download in two places and can never certify from the surface where documents are managed.** Nothing in the codebase detects or reports it.

**★ PRODUCER 1 — CHANGING `incorporation_type` IN SETTINGS. Real, measured, live in our own fixture.** Acme carries two orphans right now: `cbca_auditor_waiver_2024` and `cbca_first_board_resolution`. **Both were GENERATED IN-APP** (`source: 'generated'`, `uploaded_at: NULL`), through the normal UI flow, with proper `document_generated` log entries. The `activity_log` shows `incorporation_type` changed at 19:29:29 on 2026-06-17; the three documents generated after it were produced while Acme genuinely **was** CBCA — so the CBCA key was correct and *"art. 163 LCSA"* was the correct citation. **They became wrong RETROACTIVELY when the framework was set back.**
- **The generator does NOT filter by framework** (`generatePdfDocument.ts` selects the requirement by key alone, where the completeness engine filters `framework.eq.LSA,framework.eq.ALL`). **But adding that check would not have prevented this** — at generation time the key was valid. **The gap is that `incorporation_type` is editable with no handling for documents already keyed to the old framework.**
- **★★ THIS IS THE THIRD INSTANCE OF ONE ARCHITECTURAL DEFECT.** Core: *"a fiscal year's boundaries are a property of THE YEAR, not of THE COMPANY."* **A document's framework is a property of THE DOCUMENT — the regime it was created under — not of the company as it stands today.** Same shape as `fiscal_year_end_month/_day`, and the same family as Lessons §60. **There is a real corporate act behind it: CONTINUANCE** (a CBCA company continued under LSAQ and vice versa). Harvey has not been asked.

**PRODUCER 2 — PHASE 1 ITSELF**, deliberately: six per-year `cbca_annual_return` rows cease to exist. **On THIS database the risk is nil — zero `cbca_annual_return` documents exist for any company.** On a shipped product it would not be: that key has `can_upload = true` and those rows render with an upload affordance today.

**★ THE DETECTOR — priced, not built.** Two limbs: **FRAMEWORK ORPHAN** (`requirement_key` not in the company's framework ∪ `ALL`) and **YEAR ORPHAN** (`requirement_year` outside the active fiscal-year set, or a null/non-null mismatch against `category`). Joins over three tables on indexed columns, hundreds of rows per company — **milliseconds. The query is not the cost; deciding what the USER should do about them is.**
- **A SCRIPT beside `probe-consolidation.ts` — cheapest, hours, and the right FIRST move.** It answers the question Phase 1 actually needs before shipping to anyone with data: *how many real users would be affected.* It cannot fix anything and nobody runs it twice.
- **A COMPLÉTUDE SECTION** ("Autres documents / documents non rattachés") is the only option that closes the loop for the user, since the failure mode is precisely *visible in the vault, invisible where documents are managed*. Prior art: `f6534e9`'s binder "Autres documents" grouping. **Real UI work — bilingual strings, Aria, Dom's camera, and a product decision about what actions the row offers (re-key? delete? leave?).**
- An API route on its own: no. It earns its place only as the Complétude section.
- ⚠️ **A detector finds orphans; it does not tell the user what to do about them and it does not stop either producer.**

## 9c. ★★ THE SETTINGS PADLOCK IS ON THE WRONG FIELDS

`incorporation_type`, `neq`, `province` and `incorporationDate` are behind `unlockedFields` — a padlock that must be clicked, a confirmation to pass, and it **re-arms on every page load** (`useState<Set<string>>(new Set())`, per-render state). Changing the framework is therefore a **deliberate, confirmed act**, which downgrades Producer 1's likelihood without changing its nature.

**★ `fiscal_year_end_month` and `fiscal_year_end_day` ARE NOT GATED. They are as freely editable as the legal name.**

**That is backwards.** Per §3c and Core's deferred fiscal-year section, **historical `endDate`s are composed from the company's CURRENT rule, so changing the FY-end retroactively rewrites every historical due date.** It is **easier to trigger AND broader in blast radius** than the framework change, and it is the only one of the five with no friction at all.
- **The machinery already exists** — adding two fields to a gate that is already built, already confirming, already re-arming.
- **Harvey's ruling is NOT violated:** he ruled ZapOkay must not *validate* an FY-end change (the user or their accountant enters it; ZapOkay propagates). **A padlock is not validation — it makes a rare act deliberate.**
- ⚠️ **CORRECTED 2026-07-29 — an earlier draft of this section claimed "Acme's fiscal year-end was changed that day" from the 2026-06-17 19:29:29 log entry. THE DATA DOES NOT SUPPORT THAT.** Those fields appeared in `changed_fields` because they were written on **every** save of that form, touched or not — their presence is guaranteed, not evidential. Only `incorporation_type` is real evidence of intent, because it was gated. **★ AND THAT IS THE BETTER ARGUMENT FOR THE GATE: an ungated field that writes unconditionally leaves an audit trail that cannot distinguish "changed" from "saved". Gating it fixes the log as a side effect.** (CC's correction, taken.)

## 9d. ★ AN UNLOGGED HARD-DELETE PATH EXISTS IN PRODUCTION

**`app/api/cron/purge-superseded/route.ts` hard-deletes documents and Storage objects and writes NO `activity_log` entry** — its only record is a `console.log` that ages out of Vercel's function logs. **After it runs, there is no durable evidence the document existed.** On a product whose premise is *the book is the product*, that is a gap in its own right.

**It is NOT what removed Wick's document**, and the elimination is clean: the selection requires `status = 'superseded'` AND `superseded_at` non-null AND older than a 10-day buffer. Wick's federal return receipt (`ba08b816…`, uploaded 2026-07-25 01:47, logged) was `status = 'active'` and four days old. **So the deletion was a direct DB operation or another unlogged path.** A "test-data purge" named in that route's header comment has not been read — the obvious next place to look.

## 9e. ★ THE FIXTURE CHANGED MID-ARC — and it closed a gap by accident

**Wick lost one document** between the `item4-before/` capture (2026-07-28 17:12) and 2026-07-29: the certified `cbca_annual_return` for FY2026. **One deleted row moved 458 lines** across Sections A, C, D and E2, because it was the only row satisfying **two** caller-computed booleans at once — `hasLaterAnnualFiling` (un-suppressing the RE-200 on BOTH feeders) and `currentFedReturnFiled` (reopening the federal return's clear-gate). **An unplanned demonstration that the three flags §2 identifies as the root cause work exactly as designed.**

**Acme was byte-identical across the same window — the instrument is sound; this is data, not drift.**

**★ USE `item4-before2/` AS THE REFERENCE. `item4-before/` records a state that no longer exists.**

**★ DO NOT RESTORE WICK'S DOCUMENT.** §8 records a fixture gap: *"neither Acme nor Wick is a CBCA company without `hasLaterAnnualFiling`."* **Wick is now exactly that company, and lacks `currentFedReturnFiled` too.** Both previously unverifiable paths — the RE-200 deadline twin that `ddf061d` guards, and the federal clear-gate's reopen behaviour — are live and measurable for the first time. **The gap closed by accident; restoring the document would reopen it.**

## 9. IF THIS THREAD DIES — start here

1. Boot protocol, then the seven ZK files, then the read-back. Do not skip it.
2. Read this document, then `docs/a3-ranking-brain-spec-2026-07-03.md` and `a3-obligation-contract-design-2026-07-02.md`.
3. **Do not re-run the investigations in §3.** They are measured, at `e9bc5fb`, and they cost three hours. Re-anchor line numbers; do not re-derive facts.
4. **Ask Dom for the two §4 decisions before scoping anything.**
5. The instruments exist — `Max - CTO/baselines/probe-consolidation.ts`, parameterised by clock, plus capture sets. **Do not build a new one.**
6. **Nothing in this arc is launch-gating.** A1 (lawyer content GREEN) and the signup toggle are. The pace is Dom's.
