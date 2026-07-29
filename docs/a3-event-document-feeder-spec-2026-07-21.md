# A3 Board — Event-Document Feeder + Filing-Confirmation Lifecycle (Part A + Part B)

**Build spec · authored 2026-07-21 (Max thread) · for a fresh-thread pickup.**
**Status:** DESIGNED + DOM-APPROVED, not built. Part A is the next build. Part B is the follow-on phase.
**Companion:** the 7 ZK files (Core/Features/Queue/ShipLog/Lessons/Template/MinuteBook) — attach alongside this doc. This doc is the zoomed-in build spec; the ZK Queue item points here.

> **★ READ FIRST — re-verify against HEAD before building.** Every code fact below was verified by CC on 2026-07-21 against the then-HEAD (`92d6c26`). That is a SNAPSHOT. The standing rule is grep-is-ground-truth: a fresh Max must have CC re-confirm the key anchors (function signatures, the docKey dispatch, the ungated reqObs call site, the absence of a "filed" column) against the CURRENT HEAD before scoping the CC brief. This doc is a strong starting point, not stale gospel. Do not inherit line numbers from it without re-checking.

---

## 0. ONE-PARAGRAPH SUMMARY

The A3 dashboard board ("Que faire maintenant") is meant to be the single "do this until your book is done" surface, but it is NOT a complete path: it silently drops every event's resolution DOCUMENT. It surfaces requirement documents (via the completeness feeder) and event GOVERNMENT FILINGS (via the req feeder), but there is no event-DOCUMENT feeder — so the ~17 not-done event resolutions (director/officer changes, share issuances/transfers — the ÉVÉNEMENTS sections of the Livre) never become board obligations. A user who works the board to zero would still have an incomplete minute book. The fix: a new event-document feeder (Part A) that emits the event resolutions as board obligations, with a per-event two-stage lifecycle (document → filing) living in the feeder; plus a filing-confirmation mechanism (Part B) — a user "I filed this" button backed by a new `event_filings` table — so a roster event item can complete and leave the board.

---

## 1. THE FINDING (why this exists) — the coverage hole

Dom's question that surfaced it: *"If the user works ONLY through the board — clear an item, the next appears — does the board eventually walk them through all not-done items until the book is complete? Or is the list shorter than the book needs?"*

**Answer (read-only coverage harness against Acme, 2026-07-21): NO — the board drops 18 of 53 not-done book items.**

Acme numbers (live data drifts ±1–2 between runs; structure is stable):
- **Book not-done = 53** (requirements + events).
- **Board ranked list = ~45**, by feeder: **completeness ~35** (requirement documents) + **deadline 3** + **req_filing 7** (= 10 non-document government filings).
- **Board covers = 35** (requirement documents only).
- **STILL UNDONE after zeroing the board = 18:**
  - **17 event resolution documents** — never emitted as board obligations (the real gap).
  - **1 requirement** — the presumed-done initial declaration (RE-200), intentionally suppressed. Not a bug.

**Root cause (structural):** the dashboard builds the board from three feeders — `completenessToObligations` (requirement docs), `deadlineObligations`, `reqObligations` (events → *government filings only*). There is **no event-document feeder**. The board treats an event only as "file this with the government" (the 7 `file_externally` obligations), never as "generate/record the resolution document." So event documents — which Complétude DOES show and the inventory line's 58-total DOES count — are invisible on the board. **The board and Complétude diverge:** Complétude counts event documents; the board shows only their filings.

**This was the disease behind a symptom Dom first spotted:** the board's numbers didn't reconcile ("16/39" progress vs "38/43/44 autres" list vs "52" inventory not-done). No progress number could be made honest because the list it measures isn't the whole book. Fixing coverage dissolves the number-incoherence.

---

## 2. THE DECIDED MODEL (Dom-approved) — one item per event, two-stage lifecycle

**One board item per event.** It CHANGES what it asks for as the work progresses — it does not spawn two parallel items.

### Roster events (director/officer appoint/depart/remove) — TWO stages:
1. **Stage 1 — DOCUMENT.** The item's ACTION is "generate / upload+certify the resolution." (There is no filing without the document first — the resolution is what you file.)
2. **Stage 2 — FILING.** Once the document is final (`is_finalized === true`), the SAME item's action converts to "file with the REQ" + a **"J'ai fait la déclaration" / "I've filed this"** button.
3. **DONE.** User clicks the button → we record filed → the item LEAVES the board. (Item leaves only when BOTH document is final AND filing is confirmed.)

### Share events (share_issuance / share_cessation / share_transfer) — ONE stage:
1. **Stage 1 — DOCUMENT** only → done → leaves the board. **No Stage 2, no filing** (Harvey: share events are internal art. 33 LSAQ register entries, NO external filing deadline).

### THE DEADLINE INFO CHANNEL (always-on, independent of the action) — the crux decision
The **action (button)** follows the two-stage order (document first). But the **deadline info marker** — `ObligationMarker` "Formalité à produire · [date]" (shipped `715efb9`) — **stays visible from Stage 1 onward on any roster event with a live 30-day clock, regardless of stage.** So a ticking filing deadline is NEVER hidden, even while the button still says "generate the document."

**Why this matters (the ② risk it resolves):** the 30-day REQ filing clock runs from the EVENT date (art. 41 LPLE), not the document date. If we gated deadline VISIBILITY behind document-finalized, a slow-to-draft user could be pushed past a deadline they couldn't see. Keeping the marker always-visible separates the two channels:
- **Button = the action** (what to do now: document first, then file).
- **Marker = the deadline you're accountable to** (event date + 30, visible immediately).
No contradiction: the user sees "generate this resolution" (button) AND "filing due June 25" (marker) at the same time. The marker earns its place under Dom's row-earning rule — filing is a user-only act ZapOkay cannot discharge.

**Marker rule:** driven by the event's own 30-day clock (event date + 30), independent of button stage. `computeEventCompleteness` already computes this liveness/date for roster events.

---

## 3. VERIFIED BUILD FACTS (CC, 2026-07-21 @ HEAD `92d6c26` — RE-CONFIRM against current HEAD)

### Part A is low-risk — the data + dispatch already exist:
- **`computeEventCompleteness` already carries everything a document feeder needs**, per act: linkage (`event_type`/`event_id`/`event_phase` = the board's upload/generate targets), document state (`satisfied`, `documentSource`, `documentIsFinalized` → `getDocumentState` → téléversé/généré/missing), `documentId` (for finalize/replace), date → fiscal year (`parseLocalDate(a.date).getFullYear()`, already done for liveness), `docKey` via `deriveDocKey(act)`. Every known event is generatable (a `deriveDocKey` result → a lifecycle template exists) OR uploadable. So `actionKind` maps just like the completeness feeder: missing → generate, généré → finalize/certify.
- **A document feeder mirrors `completenessToObligations` almost 1:1** — swap `requirementKey` for `docKey` + `eventLink`, derive year from the act date, reuse `getDocumentState`/`computeLiveness`. Buildable, low-risk.
- **The roster/share dispatch is ALREADY encoded** — `OBLIGATIONS_BY_DOCKEY` / `obligationsForDocKey(docKey)` (in `req-obligations.ts`): roster docKeys (director_*, officer_*) → `[REQ_QC]` (30-day filing); share docKeys (share_issuance/cessation/transfer) → `[]` (no filing). This is the same dispatch behind the `ObligationMarker` appearing on roster rows only. The feeder reuses `obligationsForDocKey(docKey).length > 0` to mean "this event has a Stage-2 filing." **No new roster/share logic needed.**

### The two-stage logic lives in the FEEDER, not the ranker:
- **`hasDependencies` (rank.ts) is purely inert** — hard-set false, an A3Item indicator renders off it that never lights; the AGM→financials→annual-return chain is documented but unwired. **Do NOT try to use the dependency seam for this.** Dom's model is one item that changes stage, not two items where B blocks on A. The two-stage logic is a per-event STATE MACHINE in the feeder:
  - `document not-finalized` → Stage 1 (generate / upload+certify)
  - `document finalized + roster + !filed` → Stage 2 (file + "I filed this" button)
  - `document finalized + roster + filed` → DONE (leaves board)
  - `document finalized + share` → DONE (no filing, art. 33)
- `hasDependencies` stays inert; the feeder emits the current-stage obligation. **No new ranker logic.**

### The ranker handles ~53 fine:
- `rankObligations` has no cap/slice/limit; A3Board slices top-5 + counts the rest ("N autres"). Folding 17 event obligations in just grows "N autres." Honesty gradient holds (strict liveness buckets are the primary sort, count-agnostic). Event obligations carry the same liveness pattern already computed (roster = 30-day window, share = event-year age). No structural concern.

### ★ FINDING ① — a current bug Part A incidentally fixes:
- The current `reqObs` are emitted **UNCONDITIONALLY** — `events.acts.flatMap(deriveDocKey → reqObligations)` at the dashboard page (no `is_finalized` gate). **So today the board shows the Stage-2 filing ("Déclarer au gouvernement") on an event EVEN WHEN the resolution document doesn't exist yet.** That is the reverse of Dom's document-then-file order. **Part A must REPLACE the ungated `reqObs` with the state-machine feeder** — otherwise you double-count (a Stage-1 document AND an ungated Stage-2 filing for the same event).

### ★ FINDING ② — the 30-day-from-event risk (RESOLVED by the marker-stays-visible decision):
- The 30-day clock runs from the EVENT date, not the document date. Gating the filing ACTION behind document-final is correct, but must NOT hide the DEADLINE. Resolved: keep the `ObligationMarker` visible across both stages (§2). No longer design-blocking; Harvey confirms the sequencing (below), not gates it.

---

## 4. PART A — BUILD SCOPE (the coverage fix — do this first)

**Goal:** the board surfaces every not-done event resolution DOCUMENT, so working the board to zero completes the *recorded* book (documents). Ships the coverage fix. Stage-2 filing renders as the existing informational marker until Part B makes it completable.

1. **New event-document feeder** (`lib/obligations/feeders/` — mirror `completenessToObligations`). Input: `computeEventCompleteness(...).acts`. For each not-done act, emit an `Obligation` with: `docKey`, `eventLink` ({event_type,event_id,event_phase}), document state → `actionKind` (missing→generate, généré→finalize/upload), year from act date, liveness (already computed). The obligation carries the two-stage state so the board renders the right action.
2. **The two-stage state machine in the feeder** (§3): document-not-final → Stage 1 action; document-final + roster + !filed → Stage 2 action (the filing; in Part A this is the existing informational marker/label, not yet completable); document-final + share → satisfied (drops from board). "filed" is always false in Part A (no store yet — Part B).
3. **REPLACE the ungated `reqObs`** (Finding ①) with this feeder's output, so a Stage-2 filing appears ONLY post-document-finalize, not from the raw event. No double-count.
4. **Keep the `ObligationMarker` visible** on roster events across both stages (§2 — the always-on deadline channel), driven by the event's 30-day clock independent of button stage.
5. **Wire into the dashboard `merged` stream** alongside completeness + deadline feeders → `rankObligations`. Confirm the ranker output grows to ~53 and the honesty gradient holds.
6. **Board rows reuse the existing wired actions** — the B-1/B-2 `useRowUpload` (upload/replace) + `GenerateDocumentButton` (generate/regenerate) already handle event uploads via `eventLink` (the `8ffa9a8` event-upload path). Event-document obligations should render the same per-state button set as any other board row (the B-2 model). Verify the event obligation carries what `useRowUpload`'s `requirementRef`/event source needs.

**Part A camera gate (dual-surface × dual-locale, and test COVERAGE):**
- The board now shows event-document rows (director/officer/share events) with generate/upload actions, FR+EN.
- A roster event with no document shows the generate action AND the "Formalité à produire · [date]" marker (deadline visible at Stage 1).
- Generating/uploading+certifying an event resolution finalizes it → it reaches the Livre (the `8ffa9a8` path) → and the board item advances (roster → Stage 2 filing label; share → drops).
- **Coverage check:** the board's list count now reflects event documents (the ~17 previously-missing items appear). Working an event document to final removes it from Stage 1.

---

## 5. PART B — BUILD SCOPE (the filing-confirmation lifecycle — the follow-on)

**Goal:** a roster event item can COMPLETE and leave the board — the user confirms they filed with the REQ, and the item drops. This is the deferred REQ resolved-state (banked from `715efb9`), now built for real, shaped by Dom's model.

**Why it's separate / greenfield:** CC confirmed there is **NO persisted "filed" home** anywhere — no `filed_at`/`obligation_fulfilled`/`req_filed`/`filing_confirmed`/`declared_at` column in any migration; `Obligation.fulfilled` is an inert in-memory seam ("always false in v1"); `share_transfers.resolution_document_id` was dropped (migration `20260527120000`). `ObligationModal` is informational-only (props `howToLabel` + `comingSoonLabel` + `ackLabel`-that-just-closes; zero fetch/supabase/insert/update). So the button + persistence is entirely new; the "coming soon" placeholder is literally waiting for this.

1. **NEW MIGRATION** — an `event_filings` table (or equivalent), keyed by `(company_id, event_type, event_id, event_phase)` with `filed_at` (+ who/when), parallel to `event_documents`. This is the "user confirmed filed" store. (App-code-only ships end here for Part A; Part B carries a migration → `npx supabase db push` in the deploy chain, atomic with the code.)
2. **The "J'ai fait la déclaration" / "I've filed this" button** — on the Stage-2 (roster, document-final, not-filed) board item. Click → POST → insert the `event_filings` row. Extend/replace the `ObligationModal` "coming soon" placeholder with the real action, or render the button on the row directly (design call — likely Aria).
3. **The feeder READS `filed_at`** — a roster event with document-final AND a filing row → `satisfied` → drops from the board (the item finally leaves). This closes the state machine's `document finalized + roster + filed → DONE` branch.
4. **Undo/consistency** — decide whether "I filed this" is reversible (mis-click recovery). Likely a small undo window or an un-file action; scope at build.

**Part B camera gate:** a roster event with a finalized document shows "file with REQ" + the button; clicking it records filed and the item leaves the board; FR+EN; the filing state persists across reload; a share event never shows the button.

---

## 6. OPEN HARVEY QUESTION (route in parallel — confirms, does not block Part A)

**The sequencing premise:** Dom's model = resolution fully signed, THEN file (no filing without a signed document). The current code does NOT assume this (it emits the 30-day filing from the event date regardless of the document). **Harvey question:** For QC roster changes (director/officer), must the resolution be signed/finalized BEFORE the REQ declaration — and does the 30-day clock run from the EVENT date or the document date (art. 41 LPLE)?
- **Why it's not Part-A-blocking:** the marker-stays-visible decision (§2) means the deadline is never hidden regardless of Harvey's answer. Part A is correct either way.
- **Where it matters:** Part B — whether "filed" should be gated on document-final at all, or allowed independently (if a user could legitimately file before finalizing the doc in their records). Get Harvey's read before Part B locks the gate.

---

## 7. FRESH-THREAD OPENING MOVE

1. Attach the 7 ZK files + this spec doc.
2. First message to Max: *"Starting Part A of the A3 event-document feeder. Read this spec + the ZK Queue item. Have CC re-confirm the build facts against current HEAD (the feeder-mirror pattern, `obligationsForDocKey` dispatch, the ungated `reqObs` call site, `computeEventCompleteness` output shape, the absence of a filed column), then scope the Part A CC brief."*
3. Max re-anchors on disk (investigation-first — do NOT inherit this doc's line numbers), then scopes Part A per §4.
4. Part A ships (app-code-only, no migration). Part B follows (§5, carries a migration).

**Standing disciplines that apply (from ZK):** per-edit approval (Option 1); guarded `.mjs` splices + disk-grep, never the panel; `'use client'` on any new client hook/component; push-before-deploy + tsc-0 gate; dual-locale (and dual-theme if UI-touching) camera; the certify-checkbox invariant (upload alone is never done — event documents finalize via the certify checkbox, same as everything else). The event-upload path (`8ffa9a8`) + the B-1/B-2 board wiring are the precedent for how event documents reach the Livre — reuse, don't reinvent.
