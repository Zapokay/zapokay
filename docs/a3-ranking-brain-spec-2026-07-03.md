# A3 Ranking Brain — Design Spec v1
### The "What do I do now" prioritization intelligence

**Date:** 2026-07-03 · **Status:** PAPER DESIGN — for Dom's approval; nothing built · **Author:** Max (five decisions locked one-by-one with Dom)
**Baseline:** feeder layer COMPLETE at HEAD `ab7464c` (contract `a23df04` · completeness `0eef9a2` · deadline `c5adc85` · REQ `ab7464c`)
**Companion docs:** `a3-obligation-contract-design-2026-07-02.md` (the Obligation contract this ranks) · `harvey-ongoing-compliance-obligations-2026-07-02.md` (the verified deadline rulebook) · ZK_Core §4 "A3 prioritization board"

---

## 1. What this document is

The ranking intelligence that turns the merged obligation stream (all feeders → `mergeObligations`) into the guided top-5 list the dashboard board shows. This is Phase 3 of the locked A3 sequence (contract ✅ → feeders ✅ → **ranking brain** → Aria's board). CC builds from this after Dom's sign-off; Aria designs the board against §7.

**The product promise it implements (Dom):** the user opens ZapOkay and is taken by the hand — "here is your single most important action right now, then the next." Guide, don't flood. Encourage, never nag.

---

## 2. THE FIVE LOCKED DECISIONS (2026-07-02/03, Dom)

**D1 — Stakes × Urgency, time-adaptive.** Rank = how much is at risk (stakes) weighted by how soon it's due (urgency). Government-facing = high stakes, but an item only rises to the top as its clock tightens; with runway (e.g. 6 months) it yields to what matters more today (e.g. a missing foundation). NOT a fixed category order — the brain adapts as clocks tick.

**D2 — Steep urgency ramp.** Urgency stays low and flat while there's comfortable runway, then climbs sharply as the deadline approaches. A filing at 5 months sits quiet; at 5 days it shoots to the top. This is "guide, don't flood" made mathematical — the board is calm about the not-yet and loud about the now.

**D3 — Foundational = virtual-urgency floor.** Foundational gaps (the minute book's spine) have no clock, so in a pure model they'd never escalate. Instead they carry a STANDING urgency floor — steadily high, consistently pressing, woven into the one ranked list — while a genuinely imminent government deadline can still pass above them. One intelligent list; fire-alarm for the time-critical, architect-pressure for the foundation.

**D4 — Top-5, #1 emphasized.** The board shows the top FIVE ranked actions; #1 gets dominant visual treatment ("do this first"). Full ranked list exists under the hood; the UI shows 5. "Show more" routes to the Complétude page (the full work surface) — the board itself never expands into a flood.

**D5 — Quick-win-first tie-break.** Among close-scored items, surface the fast one first (momentum; the encouragement loop fires often). Full tie-break order: **exposure → foundational → effort (quick-win-first) → oldest-year → stable-id.** Big items still win on SCORE when they genuinely outrank; this governs near-ties only.

---

## 3. The scoring model (precise)

Every `Obligation` in the merged stream gets a score. `score = stakes × urgency`. List = sort descending, apply tie-breaks (§5), take top 5 for display.

### 3a. Stakes (how bad is it if undone) — from fields the contract already carries

| Input | Contribution |
|---|---|
| `exposure: 'external'` (government-facing filing) | HIGH base stakes — real penalties, an authority is watching (fines, radiation d'office risk) |
| foundational (`year === null` on a completeness-sourced item, per the catalog's foundational category) | HIGH base stakes — the spine; fails due diligence |
| `exposure: 'internal'`, annual/recurring | MEDIUM — latent risk (bites at sale/audit/dispute) |
| best-practice / informational (`actionKind: 'none'` etc.) | LOW |

Stakes values are a small named-constant table (e.g. EXTERNAL=1.0, FOUNDATIONAL=0.9, INTERNAL_ANNUAL=0.6, LOW=0.3) — **the exact numbers are TUNING constants, not design decisions**; they ship as named constants CC can adjust under gate-tested review, with the ORDERING above locked.

### 3b. Urgency (how pressing right now) — from the clock

- If `daysUntilDue` is a number: a **steep ramp function** of days remaining (D2). Shape: ≈ flat-low beyond a comfort horizon, rising sharply inside an escalation window, maxed at/past due. Reference shape (constants are tuning, shape is locked):
  - `daysUntilDue < 0` (overdue) → urgency = MAX (and status is already `overdue`)
  - `0 ≤ d ≤ ESCALATION_WINDOW` → steep climb toward MAX as d → 0
  - `d > COMFORT_HORIZON` → LOW floor (visible in the full list, quiet on the board)
  - This also FIXES the provisional `DUE_SOON_WINDOW = 30` in feeders 2/3: the ranker's escalation window is the real Phase-3 value those placeholders awaited. One constant, defined here, consumed everywhere (single source).
- If no clock (`daysUntilDue === null`):
  - foundational → the **virtual-urgency floor** (D3): a standing mid-high constant so the foundation competes and usually beats low-clock work
  - non-foundational, clockless → LOW standing urgency
- `status === 'satisfied'` → excluded from the board entirely (it feeds the encouragement/progress display, not the to-do list).

### 3c. Effort (tie-break input only — D5)

Derived from `actionKind`, cheapest first: `finalize` (a certify tick) < `file_externally` (a filing) < `upload` < `generate`. Effort NEVER changes score — it only orders near-ties (quick-win-first). This preserves "among equals, do the easy one" without ever hiding a hard-but-important item behind easy wins.

---

## 4. What the board consumes and emits

**Input:** `mergeObligations(completeness, deadlines, req, …)` — the one normalized stream (all live feeders + future ai_anomaly/lawyer_rule slots).
**Output (the ranker's contract to the UI):** the full ordered list, each item carrying its rank, score components (for debugging/tuning, not user display), and the display-relevant fields: titles (or null → UI supplies i18n label, per the REQ feeder's lawyer-pending-copy rule), status, dueDate/daysUntilDue, actionKind, exposure, `hasDependencies` (§6), source, helpKey.
**The UI takes the top 5** (D4); the full list backs the "show more → Complétude" route and any future views.

**Encouragement loop (Dom design requirement, carried from the contract doc):** when an item clears (its status becomes `satisfied` / `fulfilled` flips), the board acknowledges the win and the next item slides in — the swap moment is celebrated, progress visible, never nagging. The ranker's job in this: stable ordering (§5) so the swap is a clean single-item change, not a reshuffle.

---

## 5. Stable ordering & tie-breaks (D5)

Scores within a small epsilon are "tied." Tie-break order, applied in sequence:
1. **exposure** — external before internal
2. **foundational** before non-foundational
3. **effort** — quick-win-first (finalize < file_externally < upload < generate)
4. **oldest year first** (internal backlog builds chronologically — the record references prior state)
5. **stable id** (lexicographic) — absolute determinism; the list NEVER reshuffles between loads without a real state change

---

## 6. THE DEPENDENCY-CHAIN DESTINATION (architected now, built later — Dom 2026-07-03)

**Where this is going (Dom's example, verbatim in spirit):** the Annual Return is filed on the government site but REQUIRES the financial statements. So the board shouldn't just say "Annual Return due in 60 days" — it should reason backward and surface the PREREQUISITE as the actionable item: "Do your financial statements now, so your Annual Return (due in 60 days) can be filed on time." Obligations have prerequisites; the board surfaces the chain.

**★ HARVEY-VERIFIED CHAIN FACTS (2026-07-03) — the dependency data, confirmed:**
- **There is essentially ONE real dependency chain:** the **federal Annual Return ← APPROVED financial statements ← AGM (or written resolution in lieu).** The financials must be APPROVED (not merely drafted), approval happens at the AGM/by written resolution, then the return is fileable.
- **The prerequisite IS the real deadline.** The Annual Return itself is an administratively simple, quick online filing ONCE the approved financials exist — the long-lead, effortful part is the financials + AGM. So the board should drive toward the FINANCIALS-AND-AGM deadline (the real work), not the return's date (the easy tail). This is exactly the "financials become the item" insight — Harvey confirmed and sharpened it.
- **Everything else is INDEPENDENT, not chained:** the director/officer-change notices (REQ 30-day, federal 15-day) and the internal resolution are PARALLEL obligations sharing a trigger event, NOT a chain (the government filing doesn't require the resolution to exist first) — feeder 2/3 already model these correctly, no change. The QC REQ annual update and initial declaration are standalone, no prerequisites.
- **Implication:** the dependency layer is NARROW and high-value — one deep chain (return ← financials ← AGM), not a sprawling web. It mixes internal acts (prepare financials, hold AGM/pass approving resolution) gating an external filing (the return) — the internal→external chain the board surfaces.

**★ DEPENDENCY-LAYER BEHAVIOR — DECISION (A), LOCKED (Dom 2026-07-03): surface the prerequisite as the live item; the downstream filing appears only when unblocked.** The board shows the actionable prerequisite ("prepare + approve your financial statements") as the item, timed to a derived deadline (return deadline − lead-time). The downstream Annual Return becomes its OWN board item ONLY once its prerequisite is cleared (financials approved) — the board never shows a blocked, un-actionable item in the top-5. The FULL chain (what's blocked, what's coming) is visible on demand via the dependency-chain INDICATOR (the lit button, §7), NOT by cluttering the guided list with items the user can't act on yet. Rationale: "take the user by the hand to the ONE thing they can do now" — transparency lives in the indicator, guidance lives in the list. (Rejected (B) = showing the blocked return as a visible-but-greyed downstream item; more transparent but contradicts "what to do NOW".)

**Build sequencing (locked):** base ranker FIRST (this spec), dependency layer SECOND — the dependency FACTS are now Harvey-verified (above), so layer 2 builds on confirmed data. The base ranker must WELCOME the layer, not require a rewrite:

- **The contract already carries the seams:** stable `id` per obligation + `dueDate` → "X depends on Y" is expressible as an id-link, and a derived earlier deadline for the prerequisite is computable from Y's deadline minus a lead-time. Verify at build time that no contract change is needed for the ranker itself.
- **The ranker's architecture rule:** dependency reasoning, when it lands, changes WHICH obligations exist and their EFFECTIVE deadlines (the financials become a surfaced item with a derived due date) — it feeds INTO the scorer upstream, it does not replace the scorer. A clean Stakes × Urgency scorer is exactly the floor the dependency layer stands on.
- **`hasDependencies` flag (REQUIRED NOW, inert):** each ranked item exposes whether it has chain items, so Aria's dependency-indicator button (lit vs dimmed) is designable and buildable from day one. v1: the flag exists in the ranker's output shape and is `false` everywhere (no chains defined yet). The later dependency layer flips it live — a data change, not a UI/contract change.
- **Harvey brief (parallel, to draft next):** map the real chains + lead-times — Annual Return → financial statements (approved vs drafted? does the AGM sit in the chain? what lead-time makes the 60-day window respected?), and any other government filing with prerequisites. Verified facts before the chain-walker exists.

---

## 7. Board placement + Aria design intent (captured for the Aria brief — Aria decides the HOW)

- **Lives on the DASHBOARD** — displaces the current "Actions requises (N)" panel + the "Prochaine échéance / Foundational document" card (the surface Dom called "useless, tells the client nothing"). This is the first user-facing A3 ship → dual-locale visual gate (Dom = camera, FR + EN), regression check on the displaced cards, deliberate pace.
- **5 items, #1 visually dominant** ("do this first"), the other 4 as visible context.
- **Per-item dependency-chain indicator** — a button/affordance, LIT when the item has chain items, DIMMED when not (driven by `hasDependencies`; dimmed everywhere in v1).
- **"Show more" button → routes to the Complétude page** (the full work surface). The board never expands in place; guided top-5 stays clean.
- Per-item content available to Aria: title (i18n-supplied where the feeder emits null — the REQ label is lawyer-pending copy, single-sourced), status/urgency signal, due date where one exists, the action verb from `actionKind` — with the **external/internal verb rule** (Harvey): external = "file with the government by X", internal = "hold/record by X", NEVER "file" for internal acts.
- **Encouragement moments** (Dom design requirement): the clear-and-swap celebration, visible progress. Aria designs the feel.
- Banked Aria question (not decided): whether a quiet "view all" exists anywhere beyond the show-more-to-Complétude route.

## 8. Explicitly OUT of scope for the ranker build

- The dependency chain-walker + the Harvey-verified chain data (layer 2; only the inert `hasDependencies` seam ships now)
- Aria's visuals + the dashboard wiring (Phase 4 — a separate, visual-gate-heavy ship)
- The fulfillment/resolved-state (mark-as-filed) — the contract's inert `fulfilled` seam, lands with A3's fulfillment phase
- Persistence — v1 ranking is computed, not stored
- Tuning-constant finalization — the stakes table, ramp constants, comfort horizon, escalation window and epsilon ship as NAMED constants with the locked ORDERING/SHAPE; exact values tune against real fixture data at the gate

## 9. Next steps

1. **Dom sign-off on this spec** (this is the review artifact).
2. **Harvey dependency-chain brief** (parallel): map Annual Return → financials (+AGM?) chains + lead-times.
3. **CC build brief — the ranker** (pure function over the merged stream: score, sort, tie-break, top-5 slice, `hasDependencies:false` seam; additive, zero consumers, same discipline as the feeders).
4. **Aria brief — the board** (§7 as the design intent; against the ranker's real output shape).
5. **The dashboard wiring ship** — the first user-facing A3 change: dual-locale gate, displaced-cards regression check.
6. Memory bump when the spec is approved (Core: the five decisions; Queue: phase status; this doc registered like the contract doc).
