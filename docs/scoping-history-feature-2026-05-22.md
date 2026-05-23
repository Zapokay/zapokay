# Scoping — Lifecycle history feature (capture → view → completeness → generate)

**Date:** 2026-05-22
**Scope:** Cross-surface scoping for the lifecycle history feature across Administrateurs / Dirigeants / Actionnaires.
**Mode:** INVESTIGATION / SCOPING ONLY — read-only on all app code; no build, no commit, no deploy.
**Predecessor:** `docs/audit-people-surfaces-2026-05-22.md` (Task D + A.1 + A.6 + A.4a).
**Critical-Path Justification (Dom, 2026-05-22):** core compliance loop = LAUNCH-BLOCKING. Reclassifies Queue Tier 1 #19 from post-launch to launch-critical. Surfaces (Administrateurs / Dirigeants / Actionnaires) all ACTIVE per `docs/feature-lifecycle.md`.

---

## Part 1 — Answers to the five investigation questions

### Q1. History data + queries per surface

| Surface | Table | Lifecycle fields available today | Active-only client query? |
|---|---|---|---|
| Administrateurs | `director_mandates` | `appointment_date`, `end_date`, `end_reason` (5-value enum: resignation / revocation / death / disqualification / term_expired), `is_active` | YES — `DirectorsClient.tsx:68` `.eq('is_active', true)` |
| Dirigeants | `officer_appointments` | `appointment_date`, `end_date`, `is_active`. **No `end_reason` column** (audit A.6 confirmed via schema + types) | YES — `OfficersClient.tsx:55` `.eq('is_active', true)` |
| Actionnaires | `shareholdings` | `issue_date`, `end_date`, `end_reason` (4-value enum: transfer / redemption / cancellation / conversion), `source`, `certificate_old`, `certificate_new` | NO at fetch (`ShareholdersClient.tsx:66`) — but display filters `end_date === null` (`ShareholdersClient.tsx:92-95`) |

**Source of truth:** `lib/supabase/people-types.ts:30-46` (Director), `:53-71` (Officer), `:96-124` (Shareholding).

**Existing history-capable surface in production:** `BinderView.tsx` consumes `/api/registers/{directors,officers,shareholders}` and renders three RegisterCards inside the `registres` binder section.

| Register API | Returns lifecycle fields? | BinderView columns rendered |
|---|---|---|
| `/api/registers/directors` | YES — `appointment_date`, `end_date`, `end_reason`, `is_active`. Sort: active first, then by recency. | Nom, Résidence, Début, **Fin**, **Actif** (`BinderView.tsx:65-71`) ✅ full lifecycle |
| `/api/registers/officers` | YES — `appointment_date`, `end_date`, `is_active`. No `end_reason` (matches schema gap). | Nom, Titre, Début, **Actif** (`BinderView.tsx:89-93`) ⚠️ Fin column **omitted** even though API exposes it |
| `/api/registers/shareholders` | NO — entry shape is `{ full_name, share_class, quantity, certificate_number, issue_date, issue_price_per_share }` (`app/api/registers/shareholders/route.ts:54-62`). No `end_date`, no `end_reason`, no `is_active`. Fetches every row including end-dated ones, then strips the lifecycle fields. | Nom, Catégorie, Qté, Cert., Émission (`BinderView.tsx:108-114`) ❌ no lifecycle |

**Per-person history view:** does NOT exist today. `Glob app/api/people/**` returns zero results; no `PersonHistory*` component exists. The three Client pages drive cards by current-state only.

**Reusable scaffolding to build on:**
- Directors register response shape (full lifecycle + sort) is the canonical pattern.
- Officers register API already returns end_date — only the view drops it. Closing the gap is a `BinderView.tsx` + `RegisterCard` column-add patch (1-line view, 0-line API).
- Shareholders register requires API shape extension (add `end_date`, `end_reason`, `is_active = end_date === null` derivation) + BinderView columns.

---

### Q2. Completeness engine — THE LINCHPIN

**Location:** `app/api/minute-book/completeness/route.ts` (single 220-line file). No `lib/completeness*` helper exists.

**Scoring model (confirmed by reading the route end-to-end):**

```
score = Σ(row_weight) / totalRequired  where row_weight ∈ {1.0 téléversé, 0.5 généré, 0.0 missing}
```

**Inputs:**
1. `minute_book_requirements` filtered by framework (CBCA or LSAQ + ALL). 25 seeded rows: 16 foundational + 9 annual. Source: `lib/requirement-doctype.ts` exhaustive map.
2. `company_fiscal_years` (active rows) for the annual axis.
3. `documents` rows where `requirement_key IS NOT NULL` and `status = 'active'`.

**Cross-product:** foundational requirements scored once. Annual requirements scored once per active fiscal year. A row is "satisfied" iff a `documents` row matches `requirement_key` (and for annual, `requirement_year`).

**Critical answer to the brief's central question:**

> **Does the engine score EVENT gaps (director removal w/o resolution; appointment/transfer w/o authorizing doc) or only FISCAL-YEAR gaps (missing annual resolutions)?**

**Answer: Only FISCAL-YEAR + foundational requirement-row gaps. ZERO awareness of lifecycle events.**

The engine queries:
- `companies`, `minute_book_requirements`, `company_fiscal_years`, `documents`

The engine does **NOT** query:
- `director_mandates`, `officer_appointments`, `shareholdings`, `share_transfers`, `share_classes`

It cannot, today, surface any of these gaps:
- "Director X has `end_date` set but no `end_reason`" — but DirectorRemove modal already forces an end_reason, so this gap shouldn't occur post-Sprint 6. Backfill-era data is the only risk.
- "Officer Y was replaced without an authorizing resolution document" — officer replacement writes only to `officer_appointments`; nothing links the appointment to a `documents` row.
- "Share transfer Z has no certificate number / no authorizing resolution" — `share_transfers.resolution_document_id` exists (FK to documents), but the engine never reads it.
- "Annual director election resolution missing for the year in which a director was added" — engine treats annual resolutions as scalar slots per fiscal year, no event correlation.

**Architectural implication for the feature:**

The "completeness scoring" layer of the feature requires **a second scoring dimension**: an event-gap scorer that joins requirement rows AGAINST `director_mandates` / `officer_appointments` / `shareholdings` / `share_transfers` to detect lifecycle events that have no authorizing/recording document. Two viable shapes:

- **Option A — extend the existing route.** Add an `eventChecklist` array to `CompletenessResponse`. Each entry: `{ event_id, event_type, event_date, person_or_class, requirement_key?, satisfied, document_id? }`. Score weighting can be additive or a separate sub-score. Pro: one source of truth. Con: route grows from 220 to ~400+ lines and starts touching every lifecycle table.
- **Option B — separate `/api/minute-book/event-completeness` route.** Returns its own array; client merges with existing completeness. Pro: bounded blast radius on the existing route. Con: two queries on every dashboard load, two cache stories.

**Recommendation (defer to Dom):** Option B for Phase 2 implementation. The existing route is load-bearing (dashboard MinuteBookCard, catch-up wizard, Sprint 10 Phase B header counts). Touching it = wide regression surface. Phase 2 ships event scoring isolated; Phase 4 considers consolidation.

**Catch-up generator .txt issue:** Resolved historically. Per `lib/pdf/generatePdfDocument.ts:7-9` header comment, Sprint 9H Phase 4d Stream 1 replaced the wizard's prior `.txt` generation path. Both `/api/minute-book/generate-item` and `/api/wizard/generate` are now thin wrappers around `generatePdfDocument`. **No remaining .txt path.** The brief's premise on this item is outdated.

---

### Q3. Transfer feature — sizing for launch build

**Schema status:** `share_transfers` table shipped via `supabase/migrations/20260511131314_create_share_transfers.sql`. 10 columns:

```
id, company_id, from_shareholding_id, to_shareholding_id, transfer_date,
quantity_transferred, consideration, notes, resolution_document_id, created_at
```

Plus 4 indexes (LOCK-8) + RLS policy mirroring shareholdings (LOCK-9). Schema is complete; nothing to migrate.

**UI status:** ZERO consumers across `app/`, `components/`, `lib/`. Only `docs/` + the migration file reference it. The Transfer button on `ShareholderCard.tsx:174-182` is `disabled` (post-`34227a3` tooltip is `Bientôt disponible` / `Coming soon`).

**Minimum viable Transfer UI (sizing):**

1. **TransferModal component** — `components/shareholders/TransferShareholdingModal.tsx`:
   - Select source shareholding (defaulted from card context)
   - Select target holder (existing person via picker OR new person via inline create OR existing entity once atom 3 lands)
   - Quantity transferred (≤ source quantity)
   - Transfer date (default today; respect audit A.3 fix)
   - Consideration (free text), notes (free text)
   - Optional: certificate_new value if partial transfer creates new cert
2. **Transaction (DB)** — atomic operation in a single Postgres function or client-side multi-step:
   - Insert `share_transfers` row
   - End-date source shareholding (`end_date`, `end_reason = 'transfer'`, `certificate_old = source.certificate_number`)
   - Insert new `shareholdings` row for the transferee (with `holders` via the existing RPC `create_shareholding_with_holders`)
   - Link `share_transfers.from_shareholding_id` / `.to_shareholding_id` to both
3. **Card affordance** — flip the disabled button to active, wire `onTransfer={(sh) => setTransferringShareholding(sh)}`.
4. **History rendering** — see Q1; transfer events surface in the shareholders register once that route is extended.

**Rough size:**
- ~250 LOC for TransferShareholdingModal (parallel to IssueSharesModal which is ~325 LOC).
- ~50 LOC RPC `transfer_shareholding(from_id, to_holder_kind, ..., quantity, ..., transfer_date)` OR ~80 LOC client-side multi-step with manual rollback. RPC is the safer pattern (matches `create_shareholding_with_holders`).
- ~10 LOC ShareholderCard wiring.
- Bilingual JSON keys (~12 strings).

**Total estimate: 1 bundle (modal + RPC + wiring), Tier 1.**

**Reclassification:** A.4a from ACCEPT → launch build. Tooltip-strip already shipped via `34227a3` is correct interim; activation work is the Sprint-7-named-deferred body of work, now pulled forward.

**Caveat — atom 3 overlap:** for the transferee side, if the destination is an entity holder (not individual), the new shareholding's `shareholding_holders` row needs `holder_type = 'entity'` + `entity_id`. Atom 3 is the prerequisite for entity-target transfers. **Individual-to-individual transfers can ship independent of atom 3.** Entity transfers are atom-3-gated. The modal can ship with `holder_type = 'individual'` only and a tooltip "Transferts à des entités — disponibles bientôt" until atom 3 lands.

---

### Q4. Atom 3 overlap + sequencing

**Atom 3 in flight (per `ZapOkay_Project_Memory_Core.md` §5 + Queue §15):** entity-shareholder UI rebuild — surfaces `shareholder_entities` (trusts + corporations) + signatory hydration on the Actionnaires page. Schema (atoms 1+2) shipped; UI rebuild pending.

**What can proceed independent of atom 3:**

- ✅ **Directors history** — entirely independent. `director_mandates` is people-only; no entity involvement. Card history pane, register Fin/Statut columns, removal-reason gap detection all atom-3-free.
- ✅ **Officers history** — entirely independent. `officer_appointments` is people-only. The A.6 `end_reason` schema add is its own atomic migration. Card history + register Fin column + removal-reason capture all atom-3-free.
- ✅ **Individual-holder shareholdings history** — independent. Existing `holders` rows where `holder_type = 'individual'` are atom-2 stable. Card history pane + register lifecycle columns (end_date, end_reason, is_active) extend the existing inverted-join shape from `app/api/registers/shareholders/route.ts:28-40`.
- ✅ **Share transfer (individual-to-individual)** — independent (see Q3 caveat).
- ✅ **Completeness event scoring for director/officer events** — independent. The event scorer joins on people tables, not entities.

**What is atom-3-gated:**

- ⏸ **Entity-holder shareholding history** — entities' shareholding lifecycles only surface meaningfully once the Actionnaires UI distinguishes entity holders. Atom 3 enables this naturally.
- ⏸ **Transfer to entity holder** — see Q3.
- ⏸ **Joint-holder history rendering** — joint holdings exist in schema (atom 1+2 polymorphic join) but no UI surfaces them today. Atom 3 covers.
- ⏸ **Entity-signatory lifecycle history** — `shareholder_entity_signatories.start_date / end_date / end_reason` exist (`people-types.ts:160-173`) but no UI consumes them.

**Sequencing recommendation:**

- **Phase 1** (directors + officers history; both surfaces, independent of atom 3).
- **Phase 2** (completeness event scoring for director/officer events; independent of atom 3).
- **Phase 3** (individual-holder shareholdings history; register API shape extension; ShareholderCard history pane for `holder_type = 'individual'` only).
- **Phase 4** (Transfer modal — individual-to-individual; explicit "entity transfer coming with atom 3" copy).
- **Phase 5** (document generation for lifecycle events — see Q5; placeholder-template path).
- **Atom 3 lands** somewhere between Phase 3 and Phase 5.
- **Phase 6** (entity-holder coverage: transfer to entity, joint-holder history, entity-signatory history) — post atom 3.

---

### Q5. Document generation for lifecycle events

**REQUIREMENT_MAP (`lib/pdf/generatePdfDocument.ts:39-54`) covers 12 doctypes mapped to 6 resolution archetypes:**

| Archetype | Resolutions hardcoded | Lifecycle events it could document |
|---|---|---|
| `founding_board` | 3 (statuts, bylaws, fiscal-year) | Founding only |
| `founding_shareholder` | 3 (bylaws ratification, director election, auditor waiver) | Founding only |
| `share_subscription` | 1 (subscription + issuance) | Initial share issuance |
| `annual_board` | 1 (financial statements) | Annual scalar |
| `annual_shareholder` | 2 (financial statements, auditor waiver) | Annual scalar |
| `auditor_waiver` | 1 (waiver standalone) | Annual scalar |

**Lifecycle events with NO template in REQUIREMENT_MAP today:**

1. **Officer appointment** (post-founding) — no template. Captured via AddOfficerModal but no resolution generated.
2. **Officer replacement** — no template. ReplaceOfficerModal handles UI state but no document.
3. **Officer removal** — no template. RemoveOfficerModal updates is_active + end_date only.
4. **Director appointment** (post-founding, mid-year) — no template. AddDirectorModal captures but no doc.
5. **Director resignation acceptance** — no template (end_reason is captured but no resolution exists).
6. **Director removal / revocation** — no template.
7. **Share issuance** (post-founding) — partial: `share_subscription` template exists but is founding-flavored.
8. **Share transfer** — no template (no UI either, see Q3).
9. **Share redemption** — no template (no UI either).
10. **Share class amendment / new class** — no template.
11. **Director consent form** — uploadable per requirement (`lsaq_acceptation_mandat`, `cbca_director_acceptance`) but classified `autre` in `lib/requirement-doctype.ts:55-56` and not generated.

**.txt issue:** Already resolved. See Q2 — the wizard's old `.txt` path was replaced by `generatePdfDocument` in Sprint 9H Phase 4d Stream 1. No remaining `.txt` issue to confirm.

**Placeholder-template path viability:**

Two precedents already shipped:
- **Auditor-waiver export** (Queue Tier 1 #18 partial) — placeholder text rendering through `generatePdfDocument`'s `getResolutionsForType` fallback (`generatePdfDocument.ts:88` returns `[{ number: 1, title: 'Résolution', body: 'La résolution est adoptée.' }]` for unknown types).
- **Subscription export** — similar precedent.

**Approach for lifecycle docs:** Add new `resolutionType` keys + `Resolution[]` arrays to the `getResolutionsForType` map. Each lifecycle event gets a placeholder template (1-2 short resolutions, factually correct but generic). Lawyer review later can replace the body strings without schema changes. Eight new templates would cover items 1-6 + 8 + 9 above (item 7 reuses `share_subscription`; items 10-11 deferred to later phases).

**This is content design work, not engineering complexity.** The pipeline `lib/pdf/generatePdfDocument.ts` already handles arbitrary resolutionTypes; adding 8 new entries is a 30-40 LOC patch. The hard part is the resolution copy, which is lawyer-gated.

**Required upstream changes for lifecycle doc generation:**
1. New `minute_book_requirements` rows for the 8 event-driven requirement keys (seed migration).
2. New entries in `REQUIREMENT_MAP` and `REQUIREMENT_DOC_TYPE`.
3. New `resolutionType` arrays in `getResolutionsForType`.
4. Event-aware UI affordance: "Générer la résolution" button on history-pane events that lack a linked document.
5. Storage of `event_id → document_id` link (extend `share_transfers.resolution_document_id` pattern to officer_appointments + director_mandates: add `appointment_resolution_document_id`, `removal_resolution_document_id` columns OR a separate `event_documents` join table).

**Recommendation:** Phase 5 of this scoping is event-document generation. Lawyer-gated copy means a non-engineering blocker — Dom should engage counsel in parallel with Phase 1-4 work so templates are ready when Phase 5 starts.

---

## Part 2 — Phased build plan

### Phase 1 — Director + Officer history (independent of atom 3)
**Scope:**
- Officer Remove modal captures `end_reason` (schema add: 5-value enum mirroring directors; migration + types + RemoveOfficerModal UI + register API field + BinderView column).
- BinderView officers register adds **Fin** column (API already exposes end_date).
- DirectorCard + OfficerCard expose "Historique" disclosure (collapse/expand). Renders ended mandates with start/end/reason inline.
- DirectorsClient + OfficersClient drop the `.eq('is_active', true)` fetch filter, OR keep it and add a second fetch for ended rows surfaced behind a "Voir l'historique" toggle. Latter is simpler.

**Effort:** ~2 small atoms (officer end_reason migration + UI), then 1 medium atom (history disclosure on both cards). One bundle.

**Atom-3-gated?** No.

### Phase 2 — Completeness event scoring (independent of atom 3)
**Scope:**
- New `/api/minute-book/event-completeness` route per Option B (Q2). Queries director_mandates + officer_appointments for events that lack linked documents.
- Dashboard MinuteBookCard surfaces a new "Événements sans document" count alongside existing fiscal-year score.
- Phase 2 detects gaps; Phase 5 generates the docs.

**Effort:** 1 medium atom (new route + dashboard surfacing).

**Atom-3-gated?** No.

### Phase 3 — Individual-holder shareholdings history (independent of atom 3)
**Scope:**
- `/api/registers/shareholders/route.ts` returns `end_date`, `end_reason`, `is_active` in entry shape.
- BinderView shareholders register adds **Fin / Raison / Actif** columns.
- ShareholdersClient adds "Voir l'historique" toggle. ShareholderCard exposes history disclosure for the individual-holder case.

**Effort:** 1 small atom (API shape) + 1 medium atom (card history disclosure).

**Atom-3-gated?** Partial — joint and entity-holder shareholding history is atom-3-gated. Individual-holder lifecycle (the bulk of v1 data) is not.

### Phase 4 — Share transfer (individual-to-individual)
**Scope:** Per Q3 sizing. TransferShareholdingModal + RPC + ShareholderCard wiring + bilingual strings.

**Effort:** 1 bundle (modal + RPC + i18n).

**Atom-3-gated?** Individual-to-individual NO. Entity-target transfers YES.

### Phase 5 — Lifecycle event document generation
**Scope:** Per Q5. New requirement keys + REQUIREMENT_MAP entries + getResolutionsForType arrays + per-event "Générer la résolution" button + event↔document link storage.

**Effort:** 1 bundle engineering + lawyer-gated copy review (off the critical path of code work). Could split into multiple bundles by event type if copy comes in waves.

**Atom-3-gated?** No (for director/officer/individual-shareholder events). Entity events follow Phase 6.

### Phase 6 — Atom 3 follow-ups (post atom 3 lands)
**Scope:** Joint-holder history, entity-holder shareholdings history, transfer-to-entity, entity-signatory lifecycle. All depend on atom 3 schema + UI being live.

**Effort:** Sized after atom 3 ships.

**Atom-3-gated?** YES — by definition.

> **Decision note (Dom override, 2026-05-22):** Phase 6 is **LAUNCH-CRITICAL**, not v1.1. Entity + joint-holder + entity-signatory history must ship before launch. Consequence: **Phase 10A.5 atom 3 is now a HARD LAUNCH GATE for the history feature.** Analysis above (sized-after-atom-3, post-atom-3 sequencing) remains accurate; only the deferral classification changes. Cross-reference: Queue Tier 1 #19 + the atom-3 queue item.

---

## Part 3 — Dependency split (independent vs gated)

**Ship-able independent of atom 3** (Phases 1, 2, 3-individual, 4-individual, 5-non-entity): the bulk of v1 launch content. Covers ~85% of expected user data given that joint/entity holders are a minority in early-stage QC SaaS subscribers.

**Gated on atom 3** (Phase 6): joint-holder + entity-holder + entity-signatory history; transfer to entity.

**Recommended sequencing:** Phases 1-2-3-4 first (Director/Officer/Individual-shareholder + Transfer ind-to-ind). Phase 5 starts in parallel with Phase 3 (engineering side; lawyer copy is off-critical-path). Atom 3 lands when its own work completes. Phase 6 picks up immediately after atom 3.

> **Decision note (Dom override, 2026-05-22):** Phase 6 has been **promoted to LAUNCH-CRITICAL**. The independent/gated split above is correct as a dependency analysis, but the deferral framing ("gated = post-launch acceptable") no longer applies. Both halves must ship before launch. **Phase 10A.5 atom 3 is now a HARD LAUNCH GATE for the history feature.** Atom 3 timing therefore drives the overall launch date for the lifecycle history feature.

---

## Part 4 — Proposed memory reclassifications (DRAFT — await Dom greenlight before applying)

Per WA #11 + WA #14, memory edits below are drafted but **not yet applied**. Each requires explicit per-edit approval. Lockstep version bump v3.54 → v3.55 once Dom greenlights.

### Reclassification 1 — Queue Tier 1 #19 → launch-critical

**Current state (Queue.md §15 Tier 1 #19):** "Lifecycle history → completeness → generate" tier-1 follow-up, post-launch acceptable.

**Proposed new state:** Tier 1 #19 reclassified **launch-critical** per Dom decision 2026-05-22. Breakdown into the four-loop sequence:

```
#19a — capture:    Director + Officer + Individual-shareholder history schema +
                   ended-row queries + Officer end_reason migration. Phase 1 of
                   docs/scoping-history-feature-2026-05-22.md.
#19b — view:       History disclosure on all three Cards + register lifecycle
                   columns (BinderView). Phase 1 + Phase 3 of scoping doc.
#19c — completeness: Event-aware scoring via new /api/minute-book/event-completeness
                   route (Option B). Phase 2 of scoping doc.
#19d — generate:   Lifecycle resolution templates + per-event "Générer" affordance +
                   event↔document link storage. Phase 5 of scoping doc.
                   Lawyer-gated copy; off-critical-path of engineering.
```

Cross-link: `docs/scoping-history-feature-2026-05-22.md`. Atom-3-gated subset isolated to Phase 6 (post-launch acceptable).

### Reclassification 2 — A.4a Transfer ACCEPT → launch build

**Current state (audit doc + Queue):** A.4a Transfer button is **ACCEPT** ("Sprint 7 deferred"); only the tooltip-strip shipped via `34227a3`.

**Proposed new state:** A.4a reclassified **launch build**. Schema (`share_transfers`) is complete; UI (TransferShareholdingModal + RPC) is the build. Sized at ~1 bundle (Phase 4 of scoping doc). Individual-to-individual ships independent of atom 3; entity-target transfers gated to Phase 6 with explicit copy.

### Lockstep version bump

All four memory files (Core / State / Queue / .claude/MEMORY.md if relevant) move v3.54 → v3.55 with these reclassifications + a new engineering-lesson entry pointing back to this scoping doc.

---

## Part 5 — Open questions for Dom (review before any code)

1. **Phase 5 lawyer engagement:** when does counsel review of placeholder resolution copy start? Phases 1-4 can proceed without it, but Phase 5 stalls without copy.
2. **Option A vs Option B for completeness event scoring (Q2):** does Dom prefer single-route consolidation or isolated route? Recommendation is B.
3. **Officer `end_reason` enum values:** mirror Director's 5 values (resignation / revocation / death / disqualification / term_expired) or trim? Officer-specific values like `term_expired_with_position` or `position_eliminated` might apply; Director's set is over-modeled for officers.
4. **Event↔document link storage shape:** new columns on per-event tables (`appointment_resolution_document_id`, `removal_resolution_document_id`) OR a new `event_documents` join table? Recommendation: join table (avoids schema churn for new event types).
5. **History disclosure UX:** inline collapse on each card, OR a dedicated `/dashboard/{directors,officers,shareholders}/history` route? Inline keeps cohesion; dedicated route avoids card clutter for high-churn companies.
6. **Phase 6 timing:** does Phase 6 (atom 3 follow-ups) need to land before launch, or is it explicit v1.1? Recommendation: explicit v1.1 — atom 3 enables the surface but Phase 6 polishes it, and individual-holder coverage (Phase 3) covers launch needs.

   > **RESOLVED (Dom, 2026-05-22):** Phase 6 = **LAUNCH-CRITICAL** (override of the recommendation). Entity + joint-holder + entity-signatory history must ship before launch. Phase 10A.5 atom 3 is now a hard launch gate for the lifecycle history feature. Cross-reference: Queue Tier 1 #19 + atom-3 queue item.

---

## Summary

- **Completeness engine answer (THE LINCHPIN):** today it scores ONLY fiscal-year + foundational requirement rows. ZERO event awareness. Adding event scoring is a new sub-system (Phase 2 of this scoping), not a tweak.
- **Per-surface history readiness:** Directors > Officers > Shareholders. Director register has full lifecycle in BinderView already; Officer register has lifecycle in API but BinderView omits the Fin column; Shareholders register strips lifecycle entirely.
- **Schema gaps:** only Officer `end_reason` is missing. All other lifecycle fields exist.
- **Transfer feature:** schema complete, UI zero. ~1 bundle for individual-to-individual; entity-target gated to atom 3.
- **Document generation:** 8 missing lifecycle templates. Pipeline supports them trivially; copy is lawyer-gated.
- **Atom 3 dependency:** Phases 1-2-3-individual-4-individual-5-non-entity all proceed independent. Phase 6 (joint + entity + entity-signatory) gated.
- **Reclassifications drafted:** Queue Tier 1 #19 → launch-critical (4-loop breakdown); A.4a Transfer ACCEPT → launch build. Lockstep v3.54 → v3.55 pending Dom greenlight.

**STOP — no build. Dom reviews phases + memory reclassification text before any code or memory edit.**
