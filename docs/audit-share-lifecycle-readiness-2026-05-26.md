# Share / Shareholder Lifecycle — Phase 3 readiness audit

**Date:** 2026-05-26
**Author:** Claude (READ-ONLY investigation, per #19d Phase 3 brief)
**Scope:** Map existing vs missing surface area for completing the share-lifecycle
acts on Complétude + generation parity with director/officer.
**Constraint:** No code/schema/memory edits, no commit, no deploy. Findings only.

---

## 0. Lifecycle gate (STEP 0 — PASSED)

`docs/feature-lifecycle.md` confirms the surfaces this audit touches are ACTIVE:

| Surface | Status |
|---|---|
| Minute Book — Documents | ACTIVE |
| Minute Book — Complétude | ACTIVE (primary edit surface) |
| Minute Book — Livre (Binder) | ACTIVE |
| Actionnaires | ACTIVE (critical path; Phase 10F/10G temporal registry UX, flipped 2026-05-22) |

No HALT triggered. Investigation proceeds.

---

## 1. ENGINE — `lib/minute-book/event-completeness.ts`

**Status: ALREADY RETURNS share acts.** Shipped under #19c.

### Labels (LABELS map, lines 96-113)

```
share_issuance  → fr: "Émission d'actions",  en: "Share issuance"
share_cessation → fr: "Cessation d'actions", en: "Share cessation"
share_transfer  → fr: "Transfert d'actions", en: "Share transfer"
```

### Flag rules (locked Dom 2026-05-24; header comment lines 10-17)

- Shareholding **issuance**: flagged iff `issue_date > incorporation_date` (founding
  issuances are not separate documentable acts — they're captured in the founding
  packet).
- Shareholding **cessation**: flagged iff `end_date IS NOT NULL` on the
  shareholding row.
- Share **transfer**: ALWAYS flagged (every transfer needs a documentable resolution).

### Data sources (lines 205-216)

- `shareholdings` fetched with full holder polymorphism via
  `shareholding_holders(holder_type, person_id, entity_id, person:..., entity:...)`.
- `share_transfers` fetched independently.
- No `.is('deleted_at', null)` filter on shareholdings — explicit comment notes
  the column does not exist on that table.

### holderName polymorphism (lines 167-177)

Implemented: returns individual name OR entity legal_name; joint holders joined
with `, ` separator. Same helper feeds all three share-act emissions.

### Per-act emission (lines 327-340)

issuance / cessation / transfer all surface via the unified act stream. The
engine treats `event_documents` as the single read path for evidence linkage —
this is explicit in the header comment (lines 30-33):

> "The transfer legacy `share_transfers.resolution_document_id` was already
> backfilled into event_documents (migration 20260524215506), so event_documents
> is the single read path."

**Verdict:** Engine layer is COMPLETE for Phase 3. No work needed here.

---

## 2. PAGE FILTER — `components/minute-book/CompletenessPage.tsx`

**Status: DELIBERATELY EXCLUDES share acts today.** Explicit Phase 3 TODO marker.

### Current filter (lines 179-199)

```ts
// shareholding + share_transfer acts are excluded — Phase 3.
for (const act of events) {
  if (
    (act.event_type !== 'director_mandate' && act.event_type !== 'officer_appointment') ||
    act.event_phase !== 'departure'
  ) {
    continue;
  }
  const fy = fiscalYearForDate(act.date, fiscalYearEndMonth, fiscalYearEndDay);
  if (activeYearSet.has(fy)) { eventsByYear[fy].push(act); }
  else { eventsUnclassified.push(act); }
}
```

### What changes for Phase 3

To surface share acts, the filter must widen to:

- Include `event_type === 'shareholding'` (phases `issuance` | `cessation`).
- Include `event_type === 'share_transfer'` (phase `transfer`).

Share acts have a clean single event date already returned by the engine
(`issue_date` for issuance, `end_date` for cessation, `transfer_date` for
transfer), so `fiscalYearForDate(act.date, ...)` works unchanged.

### Rendering surfaces (in-card vs hors-exercice)

Already wired generically:
- In-card: `RequirementSection` at lines 316-329 with `eventActs={eventsByYear[year]}`
  + `preferredLanguage={preferredLanguage}` + `onEventGenerated={fetchEvents}`.
- Hors-exercice: `EventSection` at lines 333-342.

Both downstream components are act-type-agnostic — they consume the engine's
`event_type` + `event_phase` shape. Once the filter widens, share acts flow
through with no additional rendering work IF (and only if) generation can
service them (Steps 3-4 say it cannot).

**Verdict:** Filter widening is a 5-line change. But it would surface acts with
no actionable "generate" CTA, only "upload" — which may be the deliberate
Phase 3 slicing choice (display-first, mirroring how director/officer rolled).

---

## 3. TEMPLATE REGISTRY — `lib/pdf/lifecycle-templates.ts`

**Status: ZERO share docKeys. Largest content gap in Phase 3.**

### Type unions (lines 40-42)

```ts
type LifecycleEventType = 'director_mandate' | 'officer_appointment';
type LifecycleEventPhase = 'appointment' | 'departure';
```

Neither `shareholding` / `share_transfer` nor `issuance` / `cessation` /
`transfer` is in the unions. Even adding share templates requires extending
both type unions first.

### Existing docKeys (5)

`director_appointment`, `director_departure`, `director_removal`,
`officer_appointment`, `officer_departure`.

### Missing for Phase 3

| docKey (proposed) | Phase | Instrument | Notes |
|---|---|---|---|
| `share_issuance` | issuance | shareholder (or board?) | New issuance post-founding |
| `share_cessation_redemption` | cessation | board+shareholder? | end_reason=redemption |
| `share_cessation_cancellation` | cessation | shareholder | end_reason=cancellation |
| `share_cessation_conversion` | cessation | board? | end_reason=conversion |
| `share_transfer` | transfer | shareholder consent | LSA/CBCA distinct? |

The exact taxonomy (one docKey for cessation or four — one per `end_reason`),
the instrument selection (board-only? shareholder-only? consent vs resolution?),
and the actual FR/EN body text are all LAWYER decisions. **This is not a
plumbing gap — it is a content-authoring gap.**

**Verdict:** Cannot proceed with share generation until template content exists.
Generation parity with director/officer is gated behind a legal-review cycle on
template wording.

---

## 4. GENERATE PATH — `lib/pdf/generate-lifecycle-document.ts` + `app/api/minute-book/generate-lifecycle/route.ts`

**Status: HARDCODED to director_mandate + officer_appointment.** Brief named the
wrong route path — actual route lives at `app/api/minute-book/generate-lifecycle/route.ts`
(not `app/api/documents/...`); route is thin auth wrapper, all logic in orchestrator.

### Orchestrator branches that hardcode director/officer

| Concern | Lines | Hardcoded to |
|---|---|---|
| Event-table dispatch | 160-163 | `director_mandates` vs `officer_appointments` |
| SELECT columns | 165-168 | Officer-only columns (`title`, `custom_title`) gated by event_type |
| Effective-date column | 197-200 | `appointment_date` vs `end_date` |
| Person lookup | 167-168, 188 | `person:company_people(full_name)` (single individual; not polymorphic) |
| Fill context | 207-213 | `personName` only; no `holderName(s)` / `shares` / `shareClass` / `from`/`to` |
| Roster query (instrument='shareholder') | 264-295 | Already exists — used by board+shareholder cert paths. Reads `shareholdings` + `shareholding_holders` polymorphic. |

### What instrument would share acts use?

- **Issuance:** board resolution + shareholder consent typical (LSA + CBCA).
  Possibly DUAL document. Confirms #19d's `instrument` enum
  (`'board'` | `'shareholder'`) may need a third value or per-docKey policy.
- **Cessation by redemption:** board resolution typical.
- **Cessation by cancellation:** shareholder consent.
- **Transfer:** board consent / share-transfer authorization (per by-laws);
  ind-to-ind under closely-held QC companies typically a board endorsement.

The roster-loading code path for `instrument === 'shareholder'` ALREADY EXISTS
(lines 264-295), so reusing the shareholder shell is plumbing-trivial. The
gap is on the EVENT-row side (person vs polymorphic holder) and on docKey
content (Step 3).

**Verdict:** Orchestrator needs a meaningful refactor:
1. Replace `personName: string` with `holderName(s): string` resolved via the
   same polymorphic logic the engine already implements (de-duplicate by
   extracting `holderName()` from `event-completeness.ts` into a shared helper).
2. Add per-event-type table + column dispatch (`shareholdings` /
   `share_transfers`).
3. Extend `ctx` with share-specific vars (`shares`, `shareClass`,
   `transferFromHolder`, `transferToHolder`, `endReasonLabel` for cessation).
4. Decide on `instrument` semantics for dual board+shareholder documents OR
   ship one docKey per instrument and let the UI sequence them.

---

## 5. event_documents SCHEMA

**Status: PERMITS share acts as designed. Parallel-system risk flagged.**

### CHECK constraints (migration 20260524221747, lines 36-42)

```sql
CHECK (
  (event_type = 'director_mandate'    AND event_phase IN ('appointment','departure')) OR
  (event_type = 'officer_appointment' AND event_phase IN ('appointment','departure')) OR
  (event_type = 'shareholding'        AND event_phase IN ('issuance','cessation'))    OR
  (event_type = 'share_transfer'      AND event_phase = 'transfer')
)
```

All four share-act tuples are permitted. The 4-col UNIQUE
`(document_id, event_type, event_id, event_phase)` accommodates them. Schema is
forward-ready.

### Parallel-system flag: `share_transfers.resolution_document_id`

**Confirmed legacy parallel column. Risk-tier: low-but-real.**

Source: migration `20260524215506_create_event_documents.sql`, header lines 26-33:

> "Existing partial precedent: `share_transfers.resolution_document_id` (1:1
> nullable FK to documents). LEFT IN PLACE — flagged for later deprecation
> once event_documents is the single read path. Backfill below copies any
> non-null values into the generic table."

The migration's backfill (lines 70-74) one-shot copied existing values into
`event_documents` (verified as 0-row no-op at investigation time per migration
comment). **However:**

- The column still exists on `share_transfers`.
- No DB trigger keeps it in sync forward.
- If ANY code path writes to `share_transfers.resolution_document_id` (e.g.
  legacy capture UI, a partially-extracted import flow), the two views diverge
  silently.
- Engine code reads `event_documents` exclusively (header comment in
  `event-completeness.ts` lines 30-33), so divergence would manifest as the
  engine under-counting transfer evidence even when a doc exists at the
  legacy link.

**Mitigation already in place:** Investigation found ZERO code references to
`share_transfers` anywhere except in the engine's polymorphic event fetch
(`grep -r share_transfers` returned 1 file: `lib/minute-book/event-completeness.ts`).
There is no transfer capture UI today (see §6), so the legacy column is
write-cold. Deprecation cleanup (column drop) can happen at the next safe
migration window.

**Verdict:** Schema layer is READY. Parallel-system flag is dormant given
absence of capture UI — but should be DROPPED before any transfer capture UI
ships, to avoid re-introducing the divergence risk.

---

## 6. CAPTURE STATE — are share lifecycle events fully captured?

**Status: Issuance OK. Cessation + Transfer have NO capture UI.**

### Issuance — CAPTURED ✓

- Column: `shareholdings.issue_date` (DATE NOT NULL).
- Capture UI: `components/shareholders/IssueSharesModal.tsx` writes
  `issue_date` (line 130). Edit UI: `EditShareholdingModal.tsx` exposes
  `issueDate` and persists it (lines 31, 58).
- Holder polymorphism via `shareholding_holders` is captured (transitional
  sync trigger from migration 20260514101627 §5 also keeps `person_id` in
  sync with the holder table during the atom-1→atom-3 window).

### Cessation — NOT CAPTURED ✗

- Columns: `shareholdings.end_date`, `shareholdings.end_reason` (added by
  migration 20260511140949 Phase 10A Atom 4). `end_reason` CHECK enum:
  `{transfer, redemption, cancellation, conversion}`.
- Capture UI: **NONE.** `grep` of `end_date|end_reason|cessation|cesser|cease`
  across `components/shareholders/*.tsx` returns ZERO matches. The Phase 10A
  Atom 4 migration created the columns but no UI was ever shipped to populate
  them.
- Impact on engine: shareholding cessation acts can only flag for rows where
  `end_date` is non-null. With no UI to write that column, the flag is
  effectively unreachable in production.

### Transfer — NOT CAPTURED ✗

- Table: `share_transfers` (from migration 20260511131314). Columns:
  `from_shareholding_id`, `to_shareholding_id`, `transfer_date`,
  `quantity_transferred`, `consideration`, `notes`, `resolution_document_id`
  (legacy).
- Capture UI: **NONE.** `grep` of `share_transfers` across the entire repo
  returns ONE file: `lib/minute-book/event-completeness.ts` (engine fetch).
  No modal, no API route, no client-side mutator.
- Impact on engine: `share_transfers` is empty in production. Transfer acts
  cannot surface because nothing writes to the table.

**Verdict:** Capture parity with director/officer requires net-new UI work for
BOTH cessation and transfer before any Complétude widening becomes
user-visible. This is the most consequential gap.

---

## 7. ATOM-3 / PHASE 6 BOUNDARY — what is launch-buildable NOW vs gated?

Per memory anchors (Tier 1 #19 LAUNCH-CRITICAL; Phase 6 entity/joint-holder
reclassified LAUNCH-CRITICAL per Dom override v3.55; ind-to-ind transfer =
A.4a launch build; entity-target/joint = Phase 6 / atom-3 gated):

### Buildable NOW (no Phase 6 / atom-3 dependency)

| Capability | Buildable now? | Notes |
|---|---|---|
| Engine returns share acts | ✓ shipped | No further work |
| event_documents stores share evidence | ✓ shipped | Schema ready |
| Display share acts on Complétude | ✓ trivially | Widen filter at `CompletenessPage.tsx:179-199` |
| Upload-to-satisfy share acts | ✓ existing plumbing | Engine reads event_documents — any existing upload-to-event flow services this for free |
| Issuance capture | ✓ exists | IssueSharesModal already polymorphic via shareholding_holders |
| Ind-to-ind transfer capture | ⚠ NEEDS BUILD | Schema ready; UI does not exist |
| Cessation capture (any reason) | ⚠ NEEDS BUILD | Schema ready; UI does not exist |
| Share resolution GENERATION | ✗ blocked | Zero docKeys; lawyer-gated template content |

### Gated behind Phase 10A.5 atom-3 / Phase 6

| Capability | Gate |
|---|---|
| Joint-holder issuance UX | Atom-3 UI (current modal is single-person; DB trigger blocks mixed types) |
| Entity-target transfers (transfer TO a trust/corp) | Phase 6 entity-shareholder workflow |
| Joint-holder transfers | Phase 6 |
| Trust/corp shareholder roster on generated shareholder resolutions | Phase 6 polymorphic shell (orchestrator's shareholder-roster query already polymorphic — but the PDF shell may not render entity names yet) |

**Verdict:** Atom-3 and Phase 6 work matters only for ENTITY-target and JOINT
flows. The ind-to-ind path (the launch-required A.4a scenario) is buildable
today as soon as capture UI + template content land.

---

## SUMMARY — recommended Phase 3 slicing

### What EXISTS (Phase 3 free wins)

- Engine emits all three share-act types with labels, flag rules, polymorphic
  holders.
- event_documents schema accepts the share tuples with phase granularity.
- Generation orchestrator's shareholder-resolution roster query already runs
  polymorphic queries — can be reused.
- Issuance capture UI exists end-to-end.

### What is MISSING (Phase 3 must build)

1. **Page-filter widening** at `CompletenessPage.tsx:179-199` (cheap; 5 LOC).
2. **Cessation capture UI** — new modal or row-action on shareholdings to set
   `end_date` + `end_reason`. No legal review needed (data only).
3. **Transfer capture UI** — new modal that writes `share_transfers`
   (from/to/date/quantity/consideration). Decision: only ind→ind for launch;
   entity-target gated behind Phase 6.
4. **Template content + docKey registry expansion** — lawyer-authored FR/EN
   bodies for: issuance, cessation×{redemption|cancellation|conversion},
   transfer. Decide instrument (board / shareholder / dual).
5. **Orchestrator generalization** — table dispatch, polymorphic holderName,
   share-specific ctx vars. Significant refactor; extract shared
   `holderName()` helper from `event-completeness.ts`.

### Parallel-system flags

- **`share_transfers.resolution_document_id`** — legacy 1:1 FK. Currently
  write-cold (no capture UI exists). MUST be either (a) dropped, or (b)
  gated by a trigger that mirrors writes into `event_documents`, BEFORE the
  Phase 3 transfer capture UI ships. Otherwise the engine's "single read
  path" invariant breaks the moment someone wires a transfer modal to the
  legacy column.

### Recommended Phase 3 slicing (for Dom's decision)

Two natural slices, in dependency order:

**Slice A — display-first (mirrors how director/officer rolled in #19c):**
- Widen page filter; share acts surface as "missing" with upload-to-satisfy
  CTA. No generate button yet. No new capture UI. Tiny, low-risk ship that
  closes the visibility loop and makes the gap visible to users.

**Slice B — capture parity:**
- Ship cessation modal + transfer modal (ind→ind only). Drop or trigger-guard
  the legacy `resolution_document_id` column FIRST.

**Slice C — generation parity (long pole, lawyer-gated):**
- Authoring of share-resolution templates (FR + EN). Orchestrator
  generalization. Extend LIFECYCLE_TEMPLATES type unions + 1-N new docKeys.

If launch needs only DISPLAY + UPLOAD parity (not generation), Slice A alone
unblocks Tier 1 #19. If launch needs GENERATION parity, Slices A+B+C are all
required and the long pole is Slice C (template authoring).

---

**STOP.** Report ends here. No scoping decisions taken, no code or schema
written, no commit, no deploy. Per brief.
