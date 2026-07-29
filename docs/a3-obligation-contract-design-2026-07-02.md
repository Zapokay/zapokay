# A3 Obligation Contract — Design Document v1

**Date:** 2026-07-02 · **Status:** PAPER DESIGN — approved by Dom, not yet built · **Author:** Max (with Dom's decisions locked one-by-one)
**Baseline:** HEAD `715efb9` · CC signal-source inventory + exact-shapes investigation (both read-only, 2026-07-01)
**Companion memory:** ZK_Core v5.14 "Canonical obligation source + A3 prioritization board" (architecture lock) · ZK_Queue v5.14 A3 entry

---

## 1. What this document is

The generalized obligation contract — the universal shape every A3 signal feeder normalizes into — designed on paper against the real, verbatim source shapes CC extracted from the codebase. This is Step 1 of the locked A3 build sequence (contract → feeders → ranking brain → Aria's board). Nothing in this document is code yet; CC builds from this after Dom's sign-off.

**A3 recap (one line):** the "What do I do now" prioritization board — ingests signals from many sources, ranks them, hands the user a guided top-N to-do list (one clears → the next appears). Un-gated; the lawyer adds rules to the input over time, not structure to the engine.

**The foundation problem this contract solves:** the app has FIVE parallel, conflicting definitions of "what's missing" (`getGaps()`, `computeRequirementCompleteness`, `calculateComplianceItems`, the AI gap-analysis's hardcoded `REQUIRED_DOCS`, the dashboard's inline `computeFiscalYearHistory`). Ranking on five disagreeing sources = confidently ranking contradictory data. The contract is the ONE language they all translate into; an aggregator merges one clean stream; the ranking brain only ever sees that stream.

---

## 2. The product model the contract is built on (Dom's corrections, locked)

The three-page document flow — the contract encodes this, not the current UI labels:

- **Documents (vault):** every document at any stage. Raw intake.
- **Complétude:** the workspace. The user works each file through its states. Shows ALL in-flight states deliberately.
- **Binder:** finished records only. A document reaches it ONLY when the user consciously ticks the certify checkbox ("I certify this document is final… Otherwise, the document will not be added to the Binder").

**The invariant:** upload alone ≠ done. Even a signed, uploaded document is NOT done until certified. "Done" = certified final + in the Binder. The board must never tell a user something is handled when it isn't — no false comfort.

**Known-imperfect labels (banked, deferred):** the current Complétude legend wording ("Signed and uploaded", "To sign") is deliberately NOT being relabeled until A3's intelligence is built. The truer concept is "Signed or Final." **The contract is built on the true state-meaning, so the future relabel is a display-string change only — zero board-logic impact.**

**The app's observability limit (grounds the status design):** the app has NO signature signal. `StateInput` = `{satisfied, source, is_finalized, can_generate}` — nothing tells the app whether a "to sign" document has actually been signed. Only the user knows; the certify checkbox is the moment they tell the app. The status axis therefore only claims what the app can honestly observe.

---

## 3. DECISION 1 — The unified status axis (LOCKED)

**Five states, replacing three conflicting internal vocabularies** (`téléversé/généré/missing` · `compliant/pending/required` · the orphan `pending/complete/overdue` in lib/types.ts):

| Status | Meaning | Complétude icon the user already knows |
|---|---|---|
| `satisfied` | Final (signed, or certified-final-no-signature-required) AND in the Binder. Truly done. | ✅ green check |
| `to_finalize` | Present but not certified — sign if needed, then tick the certify box. The app cannot distinguish "signed, awaiting tick" from "unsigned" (no signature signal), so one honest state covers both. | ◑ half-circle ("to sign") |
| `open` | Nothing there yet — generate or upload. | ✕ red X |
| `due_soon` | Any owed state (`to_finalize` or `open`) with a deadline clock running down. | (owed icon) + clock |
| `overdue` | Any owed state with the deadline passed. | (owed icon) + clock passed |

**Derivation rule:** base state (`satisfied` / `to_finalize` / `open`) is computed from document reality; if the item carries a clock and is not `satisfied`, the clock overlays: past deadline → `overdue`; within the due-soon window → `due_soon`; otherwise the base state stands. (The due-soon window threshold is a Phase-3 ranking parameter, not fixed here.)

**Why five and not four:** attestation is a first-class act in this product — the certify checkbox exists as a deliberate gate. Flattening "present-but-not-certified" into "nothing there" would ignore a distinction the product architecture itself enforces. Why five and not six: each state must change what the user should DO (nothing / finalize it / create it / hurry / you're late). Splitting further (e.g. empty vs needs-signing inside `open`… both are "do real work") fails that test — `actionKind` carries that nuance instead.

**Complétude is untouched:** it keeps its full detailed legend. The board is a ranking lens ABOVE Complétude, not a replacement. Two surfaces, two jobs.

---

## 4. DECISION 2 — Both clock models (LOCKED)

Two genuinely different kinds of "when" exist in the product:

- **Event-relative:** the REQ filing — "30 days after the roster change is recorded." No event → no clock. (Shipped shape: `triggeredBy` + `deadlineDays`.)
- **Calendar-absolute:** annual deadlines — "fiscal-year-end + 6 months," exists every year regardless of events. (Orphaned engine's computed `due_date`.)

**The contract holds BOTH, reconciled by one computed number:**

- `dueDate` (absolute ISO date) — calendar-anchored obligations; also holds the resolved date of an event-relative clock once its trigger event exists
- `triggeredBy` + `deadlineDays` — the relative rule, preserved even after resolution
- `daysUntilDue` — the single computed "days until due," whichever model produced it. **The ranking brain sorts on this number only** and never cares which clock model an obligation came from.

**Why both:** forcing everything to an absolute date means inventing fake dates or hiding un-triggered rules. Holding both lets each feeder emit what is TRUE, and preserves before-the-fact guidance ("recording this change will start a 30-day filing clock") — exactly the hand-holding A3 exists for.

---

## 5. DECISION 3 — New type, additive; `ObligationNotice` survives (LOCKED)

- The generalized type is named **`Obligation`** (new).
- **`ObligationNotice` (shipped in `715efb9`) is NOT modified.** It remains the small static-map type the REQ marker/modal consume today. The REQ feeder *translates* `ObligationNotice → Obligation`.
- Result: the generalization is purely additive. Nothing shipped changes shape; the marker, modal, and their single consumer (`EventActRow`) are untouched. This honors CC's ripple analysis (adding is safe everywhere; renaming/repurposing is the only breakage vector).

---

## 6. The contract — `Obligation` v1

```typescript
type ObligationSource =
  | 'completeness'   // feeder: ChecklistItem / getDocumentState (missing & incomplete docs)
  | 'req_filing'     // feeder: ObligationNotice / OBLIGATIONS_BY_DOCKEY (government filings)
  | 'deadline'       // feeder: calculateComplianceItems' harvested date math (annual clocks)
  | 'ai_anomaly'     // FUTURE — no emitter today (confirmed: no anomaly detection exists)
  | 'lawyer_rule';   // FUTURE — Harvey-structured, lawyer-confirmed rule additions

type ObligationStatus = 'satisfied' | 'to_finalize' | 'open' | 'due_soon' | 'overdue';

type ObligationAction =
  | 'generate'          // create the document in-app
  | 'upload'            // bring the signed/external document in
  | 'finalize'          // sign if needed + tick the certify box (the to_finalize closer)
  | 'file_externally'   // done outside the app (REQ filing at the government)
  | 'review'            // FUTURE — inspect an AI-flagged anomaly
  | 'none';             // informational

type ExposureClass = 'external' | 'internal';
  // external = government-facing (REQ updates, annual returns) — visible to authorities,
  //            live penalty risk (e.g. radiation d'office after consecutive defaults)
  // internal = the minute book itself — latent risk (due diligence, audits, disputes)

interface Obligation {
  // ── IDENTITY ──
  id: string;                    // stable, feeder-namespaced:
                                 // "completeness:annual_board_resolution:2025"
                                 // "req:director_departure:<eventId>"
                                 // "deadline:corporations_canada_annual_return:2026"
  source: ObligationSource;

  // ── WHAT IT IS (for the user; Two-Layer Language Model: both languages carried) ──
  titleFr: string;
  titleEn: string;
  descriptionFr: string | null;  // one line: why this matters
  descriptionEn: string | null;

  // ── STATUS (Decision 1) ──
  status: ObligationStatus;
  weight: number;                // 0.0–1.0 completeness contribution (preserves STATE_WEIGHT
                                 // semantics: 1.0 / 0.5 / 0.0); non-completeness feeders emit
                                 // their natural weight

  // ── WHEN (Decision 2 — both clock models) ──
  dueDate: string | null;        // absolute ISO 'YYYY-MM-DD'; null if un-triggered or timeless
  triggeredBy: string | null;    // event key that starts a relative clock ('roster_change');
                                 // null if calendar-anchored or timeless
  deadlineDays: number | null;   // relative offset in days, pairs with triggeredBy
  daysUntilDue: number | null;   // THE ranking number; computed whichever model applies

  // ── YEAR DIMENSION ──
  year: number | null;           // fiscal year the obligation belongs to; null = foundational
                                 // (mirrors ChecklistItem.year; ranking tiebreaker: oldest first)

  // ── WHAT TO DO ──
  actionKind: ObligationAction;
  requirementKey: string | null; // link to the catalog / generatable doc; null for
                                 // non-document obligations (REQ filing happens at the gov't)
  docKey: string | null;         // lifecycle docKey when one applies

  // ── RANKING INPUTS (Decision-3-phase dimensions carried on the item) ──
  exposure: ExposureClass;       // the 3-years-behind insight: external outranks internal

  // ── PROVENANCE ──
  statutoryBasis: string | null; // 'art. 41 LPLE (RLRQ, c. P-44.1)'; null for pure
                                 // completeness items
  helpKey: string | null;

  // ── FULFILLMENT SEAM (inert v1 — the deferred REQ resolved-state lands here) ──
  fulfilled: boolean;            // default false; mark-as-filed flips it later. Present from
                                 // day one so the schema seam exists; unused until A3's
                                 // fulfillment phase (obligation_fulfilled / fulfilled_at /
                                 // fulfilled_by / proof-attachment — Aria design already banked)
}
```

**Deliberately future-ready, by Dom's approval:** `ai_anomaly` + `lawyer_rule` sources, `review` action, and the `fulfilled` seam are inert today. A few inert fields now vs a contract-widening migration later — the right trade for a spine.

**One vocabulary collision to kill at build time:** `lib/types.ts:6` carries a second, unrelated `ComplianceStatus` (`pending|complete|overdue`) conflicting with `complianceRules.ts`'s. The new `ObligationStatus` must not collide — CC to place the new types in `lib/obligations/` and NOT import/extend either existing status type.

---

## 7. Feeder mapping (how each source translates)

| # | Source (today) | → status mapping | → clock | → action | Ripple constraint |
|---|---|---|---|---|---|
| 1 | `ChecklistItem` + `getDocumentState` (3-state: téléversé/généré/missing, weights 1.0/0.5/0.0) | téléversé-certified→`satisfied` · généré / uploaded-not-final→`to_finalize` · missing→`open` | none natively (no due-date exists in this system) | can_generate→`generate`; else `upload`; present-not-final→`finalize` | HIGHEST ripple type (many readers incl. re-export via completeness route). Feeder EMITS ALONGSIDE — never modifies ChecklistItem. |
| 2 | `ObligationNotice` / `OBLIGATIONS_BY_DOCKEY` (REQ, 6 docKeys) | un-filed→`open`/`due_soon`/`overdue` by clock; (later) fulfilled→`satisfied` | event-relative: `triggeredBy:'roster_change'` + `deadlineDays:30`; dueDate resolves off the event date | `file_externally` | Lowest ripple (one consumer: EventActRow). Type untouched (Decision 3). |
| 3 | `calculateComplianceItems` / `EnrichedComplianceItem` (compliant/pending/required + real date math) | compliant→`satisfied` · pending→`open`/`due_soon` by daysUntilDue · required→`overdue` | calendar-absolute: harvest the `calculateDueDate` formula map (FY-end+6mo; REQ annual = FY-end+4mo day 15; federal return = incorporation anniversary) | `generate`/`upload` per catalog capability | Engine is ORPHANED (direct-URL route only) but still WRITES `compliance_items` on every call. Harvest the FORMULAS; the engine + tables retire IN THE SAME BUILD (anti-divergence, Core). Formulas get lawyer validation before their source tables go. |
| 4 | `UrgentGap` / `getGaps()` (dashboard "Actions requises"; dueDate always-null confirmed) | missing→`open` | none (GAP-F: catalog has no due_date column) | per catalog capability | One consumer (dashboard page). SUBSUMED by feeder 1 (same catalog underneath) — getGaps retires when Aria's board displaces the "Actions requises" panel + "Prochaine échéance" card. `getOldestGap()` has zero consumers. |
| 5 | AI gap-analysis `REQUIRED_DOCS` (hardcoded, narrates only) | (not a feeder v1) | — | — | Its parallel gap definition RETIRES; the AI panel later narrates the AGGREGATED stream instead of computing its own. `ai_anomaly` slot reserved for a real future detector. |

**The aggregator:** merges all feeder outputs into one stream, dedupes by `id`, applies the status-derivation rule (§3). The catalog (`minute_book_requirements`) stays canonical for WHAT is required — feeder 1 is its voice.

**Additive-safety guarantee:** every feeder emits `Obligation`s ALONGSIDE its existing output. No existing type changes shape. Existing completeness/dashboard reads are untouched until Phase 4 deliberately displaces the two incumbent dashboard surfaces.

---

## 8. Ranking inputs banked for Phase 3 (the brain — NOT designed here)

Locked during this design session, to be composed into the ranking function in Phase 3:

1. **Exposure beats year.** External/government-facing obligations in default outrank everything internal, regardless of year — the government can see them and holds live penalties (radiation risk on consecutive REQ defaults). A company "3 years behind" isn't lucky; it's on a countdown. `Overdue external` is the top of the board.
2. **Foundational documents next** — the spine nothing else stands without (existing locked principle).
3. **Internal backlog: oldest year → newest.** Not because old years are urgent (nothing external chases them) but because the record builds chronologically — each year references the prior state. Oldest-first = a coherent book. (Refines, not replaces, the locked "oldest non-compliance first" principle: it survives as the ordering INSIDE the internal tier.)
4. **The current year rides its own clocks** — priority when `daysUntilDue` says so, not because it's current.
5. **Candidate ranking dimensions:** urgency (`daysUntilDue`) · exposure · severity (hard legal deadline vs best-practice) · effort (`actionKind`: a `finalize` tick is near-zero effort vs `generate`) · blocking-ness (does this gate other items) · year (tiebreaker).
6. **Encouragement is a design requirement (Dom).** The board is a momentum machine: clearing an item is acknowledged and the next action surfaces immediately ("Done — next up: …"). Progress visible and rewarding; guide, never nag. Feeds Phase 3 (swap-when-cleared logic) AND Phase 4 (Aria: celebrate progress).

**Phase-3 parameters deliberately NOT fixed here:** the due-soon window threshold; top-N size; the exact dimension weights.

---

## 9. Deferred / banked / lawyer-lane (tracked, not blocking)

- **Complétude legend relabel** ("Signed and uploaded" → "Signed or Final"; review "To sign" / "To generate or upload" wording) — known-imperfect copy, deliberately deferred until A3 intelligence is built. Display-only against this contract. Dual-locale gate when it lands. → Queue on next memory bump.
- **REQ resolved-state** (mark-as-filed, `obligation_fulfilled` schema, reversibility, History entry, proof-attachment seam; Aria design banked) — lands as A3's fulfillment phase via the `fulfilled` seam. Not v1.
- **Radiation/penalty specifics** (consecutive-default counts, reactivation path, amounts) — knowable statutory facts, Harvey structures now, lawyer confirms wording before the board ASSERTS them to users. Ranking logic does not wait.
- **Catch-up generation mechanics** for behind years — #175 adoption-mode (paused, needs #176 director history). The board RANKS the backlog today; historically-accurate generation for old years keeps its existing dependency.
- **CBCA federal ~15-day director-change notice** — reserved second `ObligationNotice[]` slot; needs `incorporation_type` threaded to EventActRow; Harvey-unverified. Enters as a `req_filing`-feeder rule when confirmed.
- **REQ YELLOW libellé** (`obligationNotice.req.title/body`) — lawyer-pending wording, tracked in ZK_Template + lawyer checklist Section B. Facts are Harvey-GREEN.

## 10. Explicitly OUT of scope for the contract build

- The ranking function itself (Phase 3 — designed with Dom after feeders emit real data)
- Aria's board visual (Phase 4 — parallelizable once this item shape is final)
- Any persistence/schema for obligations (v1 aggregation is computed, not stored; the `fulfilled` schema comes with the fulfillment phase)
- Modifying `ObligationNotice`, `ChecklistItem`, or any existing consumer
- The `compliance_rules`/`compliance_items` retirement executes in the FEEDER build (same-build discipline), not the contract build

## 11. Next steps

1. **Dom sign-off on this document** (the paper review — this IS the review artifact).
2. Memory bump (ZK lockstep): Core gets the locked contract decisions; Queue gets the banked items (legend relabel, etc.).
3. CC brief: build the `Obligation` type + the aggregator skeleton (types only, no feeders yet) — small, additive, per-edit approval.
4. Feeder 1 (completeness) + Feeder 3 (deadline math harvest, WITH the same-build retirement of the orphaned engine) — each its own brief, each additive, each gate-checked.
5. Phase 3 ranking design session (Dom + Max, on paper, against real feeder output).
6. Aria engaged for Phase 4 once the item shape is proven with real data.
