# Audit — Unified Complétude Math (Tier 1 #21)

**Date:** 2026-05-30
**Author:** CC (read-only investigation under brief)
**Parent commit:** 906000a `feat(transfer): capture + generate slice …`
**Scope:** Read-only. No source files modified. Output is this doc.

---

## Step 0 — Preflight result

- `git log -1 --oneline HEAD` → `906000a feat(transfer): capture + generate slice — TransferModal, RPC wiring, orchestrator branch, share_transfer template (#19d Phase 3 close)`. Matches expected parent. PROCEED.
- `docs/feature-lifecycle.md` confirms:
  - **Minute Book — Complétude** → ACTIVE, core minute-book surface (line 57).
  - **Dashboard** → composite surface listed at line 54 (status TBD but explicitly listed as a critical-path composite with the Livre-de-minutes-progress widget — i.e. MinuteBookCard).
  - **Minute Book — Livre (Binder)** → ACTIVE, core minute-book surface (line 58).
  - No DEPRECATED/VESTIGIAL/UNCERTAIN flag on any surface touched by either completeness route. PROCEED.

---

## Section 1 — Locked premise (verbatim, from brief)

> **DENOMINATOR PHILOSOPHY (locked with Dom 2026-05-29):**
> Denominator expansion is PER-EXISTING-EVENT, not per-fiscal-year-expected.
> - An event contributes to the denominator IFF it exists in its underlying table.
> - A company with zero events of a type has nothing to be incomplete about for that type.
> - There is NO enumeration of "events that should have happened but didn't."
> - This avoids the impossible-100% trap and matches the #19c emit rules
>   (appointments + issuances flag iff strictly-after incorporation_date;
>    departures + cessations flag iff end_date present; transfers ALWAYS flag).
> All fork options below must treat this as a fixed premise.

All Section 5 fork analysis below treats this as fixed.

---

## Section 2 — Both routes verbatim

### 2.1 `/api/minute-book/completeness`

**File:** `app/api/minute-book/completeness/route.ts`
**Verb:** `GET`
**Auth:** `supabase.auth.getUser()` → 401 on miss.
**Input:** none (no params, body, or query). Company resolved server-side from `companies` where `user_id = auth uid` and `status = 'active'`.

**Caching / revalidation:** No `export const revalidate`, no `export const dynamic`, no `Cache-Control` header set. Effectively dynamic because of `supabase.auth.getUser()` (cookie read forces dynamic in App Router).

**Counting model:**
- Filters `minute_book_requirements` by `framework IN ('LSA'|'CBCA', 'ALL')`.
- Splits requirements into `foundational` vs `annual`.
- For each foundational: 1 checklist row total (no per-year multiplication).
- For each active fiscal year × each annual requirement: 1 checklist row per (year, requirement_key).
- Per-row state derived via `getDocumentState({satisfied, source, is_finalized})` from `lib/minute-book/state.ts`. Three states: `téléversé`, `généré`, `missing`.
- `totalRequired = foundational.length + activeFY.length × annualReqs.length`.
- **Weighted score:** `téléversé`=1.0, `généré`=0.5, `missing`=0.0.
  `score = round((1.0 × totalUploaded + 0.5 × totalGenerated) / totalRequired × 100)`.
- `totalSatisfied = totalUploaded + totalGenerated` (unweighted count of satisfied rows).
- `totalMissing = totalRequired − totalSatisfied`.

**Output shape** (exported as `CompletenessResponse`):

```ts
{
  score: number,           // weighted % rounded
  totalRequired: number,
  totalSatisfied: number,
  totalMissing: number,
  totalUploaded: number,
  totalGenerated: number,
  checklist: ChecklistItem[],
  fiscalYears: { year: number; endDate: string }[]
}
```

`ChecklistItem` shape (see route lines 6–33):
```ts
{
  id, requirement_key, category: 'foundational'|'annual',
  title_fr, title_en, description_fr, description_en,
  section, sort_order, can_generate, can_upload,
  year: number | null, satisfied: boolean,
  source?: 'uploaded'|'generated'|null,
  document_type: VaultDocType,
  document_id?, document_file_url?, document_is_finalized?
}
```

### 2.2 `/api/minute-book/event-completeness`

**File:** `app/api/minute-book/event-completeness/route.ts` (thin handler → `lib/minute-book/event-completeness.ts` does the work)
**Verb:** `GET`
**Auth:** `supabase.auth.getUser()` → 401 on miss.
**Input:** none. Company resolved server-side.

**Caching / revalidation:** Same as above — no explicit caching directives; dynamic by virtue of cookie read.

**Counting model** (locked rules per `event-completeness.ts` L13–28):
- Source tables: `director_mandates`, `officer_appointments`, `shareholdings`, `share_transfers`.
- Emit rules (denominator):
  - `director_mandate` appointment — flag iff `appointment_date > incorporation_date` (strictly-after).
  - `director_mandate` departure — flag iff `end_date` present.
  - `officer_appointment` appointment — flag iff `appointment_date > incorporation_date`.
  - `officer_appointment` departure — flag iff `end_date` present.
  - `shareholding` issuance — flag iff `issue_date > incorporation_date`.
  - `shareholding` cessation — flag iff `end_date` present AND `end_reason !== 'transfer'` (suppresses transfer double-count).
  - `share_transfer` transfer — ALWAYS flag.
- Exclusions: soft-deleted directors/officers (`deleted_at IS NOT NULL`); founding cohort (acts on/before `incorporation_date`); when `incorporation_date IS NULL`, appointment + issuance acts are excluded and `incorporationDateMissing=true` set.
- Satisfaction: an act is satisfied iff `event_documents` has ≥1 row matching `(company_id, event_type, event_id, event_phase)`. `.order('created_at' desc)` ensures newest link wins in the satisfaction map.
- `totalActs = acts.length`.
- **Unweighted score:** `score = totalActs === 0 ? 100 : round(totalSatisfied / totalActs × 100)`.
- `totalSatisfied = acts.filter(a => a.satisfied).length`.
- `totalMissing = totalActs − totalSatisfied`.

**Output shape** (`EventCompletenessResponse`, L85–99):

```ts
{
  score: number,                  // 100 when totalActs===0; else round(satisfied/total*100)
  totalActs: number,
  totalSatisfied: number,
  totalMissing: number,
  incorporationDateMissing: boolean,
  acts: EventActStatus[]
}
```

`EventActStatus` shape (L47–83):
```ts
{
  event_type, event_id, event_phase,
  label_fr, label_en,
  personName: string | null,
  date: string,                   // ISO YYYY-MM-DD
  satisfied: boolean,
  documentId: string | null,
  endReason: string | null,
  officerTitle: string | null,
  officerCustomTitle: string | null,
  documentSource: 'uploaded'|'generated'|null,
  documentIsFinalized: boolean | null
}
```

### 2.3 Key divergence between the two scoring formulas

| Property | `/completeness` | `/event-completeness` |
|---|---|---|
| Denominator basis | Catalog × active FY (`minute_book_requirements`) | Emitted acts (per Section 1 premise) |
| Score formula | **Weighted** (téléversé=1.0, généré=0.5) | **Unweighted** (satisfied / total) |
| Empty-set default | 0 (because `totalRequired > 0` check returns 0) | **100** (explicit special case) |
| State buckets | Three (téléversé / généré / missing) | Two (satisfied / not) |

This divergence is the **core obstacle** to a unified figure. Any merge fork has to pick one formula or expose both.

---

## Section 3 — Three surfaces traced

### (3a) Complétude page TOP-BAR — "X% complet · N téléversés · N à signer · N manquants"

**Component file:** `components/minute-book/CompletenessPage.tsx`
**Fetch site:** L67 — `fetch('/api/minute-book/completeness')` inside `fetchData()` (useCallback, called from `useEffect` at L97–100).
**Fields consumed (L270–303):**
- `data.score` → "X% complet"
- `data.totalUploaded` → "N téléversés"
- `data.totalGenerated` → "N à signer"
- `data.totalMissing` → "N manquants"
- `data.score` again → `<CompletenessProgressBar score={data.score} />`
**Client-side math:** none. Pure pass-through of the route's numbers.
**Event-completeness role:** Page also calls `/event-completeness` at L85 but only consumes `json.acts` (per-year grouping for in-card EventSection rows). **It does NOT fold event scores into the top-bar.** Events render visually but contribute 0 to the headline — the gap this Tier 1 is meant to close.

### (3b) Complétude PER-YEAR cards — "X/Y" strip in section header

**Component file:** `components/minute-book/RequirementSection.tsx` (rendered once per fiscal year by `CompletenessPage.tsx` L333–346).
**Fetch site:** Inherited via prop from `CompletenessPage`'s `/completeness` fetch (no per-section fetch).
**Field consumed:** `items: ChecklistItem[]` — the per-year slice of `data.checklist`.
**Bar renderer:** `components/minute-book/CompletionBar.tsx` (L47–75).
- `states = items.map(getStateForChecklistItem)` (route exports the field; helper at `lib/minute-book/state.ts` L93 maps `document_is_finalized` → `is_finalized` for the three-state derivation).
- `filledCount = states.filter(s => s !== 'missing').length` → X
- `totalCount = states.length` → Y
**Client-side math:** Unweighted X/Y count derived from `items` only. Distinct from the route's weighted page-level score by design (`CompletionBar.tsx` L41–43 comment locks this).
**Event-completeness role:** `CompletenessPage` passes `eventsByYear[year]` (filtered, grouped by `fiscalYearForDate(act.date, fyMonth, fyDay)`) into `RequirementSection.eventActs` (L342). The rows render inside the card BUT `CompletionBar` reads `items` only — **event acts do not contribute to the section's X/Y count**. Same uncounted-event problem as 3a, at the per-year granularity.

### (3c) Dashboard MinuteBookCard — headline %

**Component file:** `components/dashboard/MinuteBookCard.tsx`
**Fetch site:** L24 — `fetch('/api/minute-book/completeness')` in `useEffect`.
**Fields consumed:**
- `data.score` → headline % via `<CompletenessBar score={data.score} … />` (L56–61)
- `data.totalSatisfied` → "X / Y documents requis" text (L65)
- `data.totalRequired` → same line
- `data.totalMissing` → "N manquants" tail (L68–71, only when > 0)
**Client-side math:** none. Pure pass-through.
**Event-completeness role:** **Not called at all.** Dashboard score reflects requirements only — the same uncounted-event problem as 3a, at the Dashboard granularity. This is the surface that drives the launch-blocking "Dashboard headline ≠ Complétude top-bar" perception risk after #19c events ship.

### 3.x Divergence math demonstration

For a company with: 10 foundational satisfied (all téléversé), 20 annual rows (10 téléversé + 5 généré + 5 missing), and 3 event acts (1 satisfied + 2 missing):

| Surface | What it shows today |
|---|---|
| 3a top-bar | score = round((10×1 + 10×1 + 5×0.5) / 30 × 100) = **75%**; 20 téléversés · 5 à signer · 5 manquants |
| 3b per-year card (say year holds 5 téléversé / 3 généré / 2 missing of annual + 1 event satisfied + 1 event missing) | 8 / 10 (annual only — events render but uncounted) |
| 3c Dashboard | **75%** (matches top-bar — both route off the SAME `/completeness` payload) |
| Event-completeness alone | round(1/3 × 100) = **33%** for events |

Today 3a and 3c agree (both ignore events; both come from the same route). The user-visible divergence threat materializes when ANY of the three surfaces starts folding events in without the other two doing it identically.

---

## Section 4 — Other consumers of `/completeness` (regression surface)

Grep results (`fetch\([^)]*['"\`]/api/minute-book/completeness`):

| Caller | File | Fields read | Sensitivity to route shape |
|---|---|---|---|
| Complétude page top-bar + per-year cards | `components/minute-book/CompletenessPage.tsx` L67 | `score`, `totalUploaded`, `totalGenerated`, `totalMissing`, `checklist`, `fiscalYears` | High — entire surface |
| Dashboard MinuteBookCard | `components/dashboard/MinuteBookCard.tsx` L24 | `score`, `totalSatisfied`, `totalRequired`, `totalMissing` | High — Tier 1 driver |
| Livre (Binder) page header score | `components/minute-book/BinderPage.tsx` L25 | `score` ONLY (consumed at L28, used at L73–77 as `<CompletenessProgressBar score={score} … />`) | Low — only `score` consumed; anything that preserves `score` keeps this working |
| UploadDocumentModal "corresponds to" requirement dropdown | `components/documents/UploadDocumentModal.tsx` L127 | `data.checklist` ONLY (each item's `requirement_key`, `year`, `category`, `title_fr/en`, `document_type`) | Medium — needs `checklist` array preserved; agnostic to scoring fields. Indirectly populates the modal's requirement picker |

Other matches in the grep were **type-only imports or comments**, NOT fetch consumers:
- `lib/upload-document.ts` L25/L42 — `import type { ChecklistItem }` + comment.
- `lib/priority.ts` L34 — comment.
- `app/[locale]/dashboard/minute-book/documents/page.tsx` L53 — comment.
- `components/minute-book/RequirementSection.tsx` L5 — `import type { ChecklistItem }`.
- `app/api/minute-book/event-completeness/route.ts` — comments only.
- `lib/minute-book/state.ts`, `lib/minute-book/event-completeness.ts` — comments.

**Brief-named callers verified:**
- "Sprint 10 Phase B header counts" — searched `DocumentsClient.tsx` for any completeness fetch / `totalRequired` / `totalSatisfied` usage. **No matches.** Phase B work landed on the upload pipeline / row state (commit `7c5e8c5`), not on a documents-page header counter. **No additional caller surfaced.**
- "Catch-up wizard (Rattrapage groupé)" — `BulkCatchUpModal.tsx` consumes only the local `totalMissing` derived from `missingByYear` props passed by `CompletenessPage`; it does NOT fetch `/completeness` itself. The page already feeds it from the single fetch at L67. **Not a separate caller.** `app/api/due-diligence/{export,status}/route.ts` independently compute their own `totalRequired` directly from `minute_book_requirements` — **not consumers of this route.**

### Consumers of `/event-completeness` (for completeness of mapping)

| Caller | File | Fields read |
|---|---|---|
| Complétude page (events rendered per-year) | `components/minute-book/CompletenessPage.tsx` L85 | `json.acts` ONLY |
| Administrateurs per-row state | `app/[locale]/dashboard/directors/DirectorsClient.tsx` L126 | `payload.acts` ONLY (`event_type`, `event_id`, `event_phase`, `satisfied`, `documentId`) |
| Dirigeants per-row state | `app/[locale]/dashboard/officers/OfficersClient.tsx` L122 | `payload.acts` ONLY (same fields) |
| Actionnaires per-row state | `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx` L140 | `payload.acts` ONLY (same fields) |

All four event-completeness callers ignore `score / totalActs / totalSatisfied / totalMissing / incorporationDateMissing` and read only the `acts` array. **No surface currently displays the event score.** This is a relevant fact for the fork: any option that breaks the `acts` array breaks ALL four people-surface generate flows.

---

## Section 5 — Architectural fork (analysis only — NO recommendation)

All three options respect the Section 1 denominator premise: denominator counts emitted events (per #19c rules), never expected-but-missing events.

### Option A — MERGE (one unified `/api/minute-book/completeness`)

Server fold: route handler invokes both engines and returns a unified payload with combined `totalRequired = requirementsTotal + eventsTotal`, combined `totalSatisfied`, combined `score`. Existing engine moves to a sub-function; `computeEventCompleteness` already pure-function-shaped (`lib/minute-book/event-completeness.ts` L168 takes `SupabaseClient + companyId + incorporationDate`) and reusable.

- **Caching consequences:** Single round-trip per consumer (vs. two). No worse than today on the Complétude page; **strictly better** on Dashboard (one fewer fetch when events become a Dashboard concern). Still no caching directives needed — route remains dynamic.
- **Dashboard refactor cost:** Low. MinuteBookCard already consumes only top-line numerics; a merge route can preserve `score / totalSatisfied / totalRequired / totalMissing` semantics by redefining them as combined totals. **No code change strictly required**, but the headline will move (75% → some value folding events). May want to flag this UX change separately.
- **Sprint 10 Phase B header counts impact:** No separate caller identified (see §4). N/A.
- **Migration shape:**
  1. Add `computeRequirementCompleteness` pure function (extracted from current route logic) parallel to the existing `computeEventCompleteness`.
  2. Combine in route handler; preserve all existing top-line field names. Add new fields if separation desired (e.g. `requirementsScore`, `eventsScore`, `combinedScore`).
  3. UploadDocumentModal still reads `data.checklist` — preserve the array.
  4. BinderPage reads `data.score` — preserve.
  5. Decision needed: keep `/event-completeness` as a thin wrapper for the per-row people-surface callers (they consume only `acts`), OR migrate them to read `data.acts` off the merged route. **Easier to keep `/event-completeness` alive as a stable acts-only endpoint** so the four people-surface callers don't churn.
- **Backward-compat path:** Possible if field semantics extended additively (combined score = new field; preserve old `score` as requirements-only for one release; then flip). Or single hard-flip after Dashboard UX sign-off.
- **Risk surface / divergence-constraint upholding:** Strongest guarantee that Dashboard headline ≡ Complétude top-bar because they read identical fields off identical payload. Failure modes: (a) requirement vs event weighting decision must be locked (weighted-1.0/0.5 buckets exist for requirements but not for events — see §2.3 — design call needed on whether events get weights or stay binary); (b) empty-events special case (event engine returns `score=100` when zero acts) needs handling in combined formula to avoid biasing toward 100%.

### Option B — CLIENT-COMBINE (keep both routes, combine on client)

Both consumers (Complétude page top-bar + Dashboard) fetch both routes in parallel and combine on the client.

- **Caching consequences:** Two parallel fetches per consumer. Dashboard gains a second fetch it doesn't have today. Both routes already independent; parallel `Promise.all` keeps wall-time roughly equal to slowest.
- **Dashboard refactor cost:** Medium. MinuteBookCard adds a second `fetch('/api/minute-book/event-completeness')` and client-side combine math. New combined formula has to live in a shared helper (`lib/minute-book/combine-completeness.ts` or similar) to keep page + dashboard in lockstep — otherwise the formula will drift between callers and re-create the original divergence problem in client land.
- **Sprint 10 Phase B header counts impact:** N/A (no caller).
- **Migration shape:**
  1. Build `lib/minute-book/combine-completeness.ts` taking both response shapes → unified totals.
  2. Patch CompletenessPage top-bar to use combined output.
  3. Patch MinuteBookCard to fetch both + use combined output.
  4. Per-year card (3b) — separate decision: client already has `items` (requirements) + `eventsByYear[year]` (events); combine helper extends to per-year as well.
- **Backward-compat path:** No route changes — fully backward compatible at the API layer. All risk is client-side.
- **Risk surface / divergence-constraint upholding:** Divergence constraint upheld iff the shared combine helper is the sole math owner AND both Dashboard and Complétude page use it. Bypass risk is real (someone reading raw `data.score` on Dashboard would re-introduce divergence silently — exactly the failure mode the brief is trying to prevent). UploadDocumentModal + BinderPage stay on `/completeness` unchanged.

### Option C — NESTED (one route invokes the other)

`/api/minute-book/completeness` internally calls `/api/minute-book/event-completeness` (or, more likely, the underlying `computeEventCompleteness` library function — calling a sibling API route over HTTP from a route handler is an anti-pattern in App Router). Functionally this collapses to Option A — the server folds — but presented as composition.

- **Caching consequences:** Same as Option A.
- **Dashboard refactor cost:** Same as Option A.
- **Sprint 10 Phase B header counts impact:** N/A.
- **Migration shape:** Same as Option A in practice. If implemented as actual HTTP sub-fetch, adds a serialization round-trip + cookie-forwarding complexity. If implemented as library composition (which it would be), it's literally Option A.
- **Backward-compat path:** Same as Option A.
- **Risk surface / divergence-constraint upholding:** Same as Option A. **The "nested" framing is mostly a wording distinction over Option A — at the code level they converge unless someone deliberately chooses HTTP-over-HTTP composition (which would be a regression in latency and auth complexity).**

### Cross-cutting design questions surfaced by the fork

These need a Dom decision regardless of fork choice:

1. **Weighting parity:** Requirements engine has three states with weights {1.0, 0.5, 0.0}; event engine is binary {1.0, 0.0}. Combined score formula must decide either (a) extend three-state to events (need `state.ts` adapter for `EventActStatus`), or (b) flatten requirements to binary for the combined headline (loses the "à signer" amber-bucket signal in the top-line %), or (c) compute separately and present two figures.
2. **Empty-events 100% special case:** `computeEventCompleteness` returns `score=100` when `totalActs===0`. In a combined score this should not bias the result — combined total should sum numerators/denominators rather than averaging the two scores.
3. **Per-year (3b) inclusion math:** Today X/Y is unweighted count of requirement satisfaction. Combined per-year needs the same denominator-philosophy applied: events that fall in that FY (via `fiscalYearForDate`) add to BOTH numerator (if satisfied) and denominator. This is already the case in the existing `eventsByYear` grouping at `CompletenessPage.tsx` L186–216 — only the per-section bar (`CompletionBar`) is currently ignoring the events.

---

## Section 6 — Findings to bank (out-of-scope; not acted on)

1. **`UploadDocumentModal` is a hidden checklist consumer.** Surfaced via grep — not in the brief's enumerated consumer list. Any fork that mutates the `checklist` array shape (e.g. embedding events into checklist) would break the "corresponds to" requirement picker. Worth flagging in any merge spec.
2. **No explicit caching anywhere on either route.** Both rely on Next.js dynamic-by-cookie default. If the unified payload grows, may be worth a deliberate cache decision (probably stay dynamic — completeness changes on every upload). Banked for future perf pass.
3. **Per-year card events render but uncounted (3b)** — the brief frames the divergence as Dashboard-vs-page, but the per-year strip shares the same bug at smaller granularity. Already covered in the §3b analysis, noted here so the fork decision doesn't forget the per-year math.
4. **Hors-exercice events bucket.** `CompletenessPage.tsx` L188 puts events whose `fiscalYearForDate` doesn't match any active FY into an `eventsUnclassified` list, rendered as a standalone section (L350–359). Any combined per-year math should decide whether unclassified events count toward the page-level headline (likely yes, per Section 1 premise) but not toward any per-year card. Noted; no action.
5. **`DocumentsClient` (Sprint 10 Phase B surface) has zero completeness consumption today.** Worth noting in the doc that the brief's third caller-of-interest didn't materialize — keeps the fork analysis honest.
6. **`event_documents` newest-wins reduce** (`event-completeness.ts` L237–249) — when multiple `event_documents` rows link the same act, only the most recent doc's `source` + `is_finalized` flows through. Today this only affects per-row state (badge color), but if events get folded into the weighted bucket scheme, the chosen doc's state will weight the combined score. Same data-drift fallback as requirements; mention only.
7. **BinderPage reads only `score`.** Lightweight consumer; any payload extension is safe for this surface. Useful to know for backward-compat shaping.

---

## Quick summary (for the in-terminal callout)

- Two scoring engines today: `/completeness` (weighted, requirements catalog × active FY, 3-state) and `/event-completeness` (unweighted, per-existing-act, 2-state, returns 100% on empty).
- Three surfaces all read `/completeness` only — events render but don't count toward any of the three figures (top-bar, per-year strip, Dashboard headline).
- Four people-surface callers consume `/event-completeness` for **per-row state only**; nobody consumes its score.
- Real route consumers: 4 (CompletenessPage, BinderPage, MinuteBookCard, UploadDocumentModal). UploadDocumentModal is a checklist-only consumer the brief didn't enumerate.
- Fork: A (MERGE server-side) and C (NESTED) functionally converge. B (CLIENT-COMBINE) is the no-route-change path but pushes the combine math + divergence-prevention burden to a shared client helper.
- Open design questions regardless of fork: weighting parity (3-state vs binary), empty-events 100% special case, per-year math.
