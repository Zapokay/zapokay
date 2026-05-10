# Sprint 10 Phase Decomposition — Proposal

**Date:** 2026-05-07
**Author:** Max (CTO thread)
**Version:** v1.1 (locked — supersedes v1.0)
**Status:** Pre-10A questions Q1-Q5 LOCKED. Phase 10A unblocked pending CC schema-drift audit results. Q6-Q13 remain open and gate later phases. See §10 Decisions Log for full lock history.
**Inputs:**
- `docs/temporal-registry-audit-2026-04-23.md` (the diagnosis — Tier A/B/C gaps)
- `docs/temporal-registry-product-spec-2026-04-27.md` (the prescription — authoritative per its own §9)
- `docs/onboarding-decisions-handoff-2026-05-01.md` (8 onboarding-specific locks)
- `docs/bilingual-i18n-audit-2026-04-28.md` (parallel-track context)
- Project memory v3.39 (Phase C shipped May 7)

**Companion deliverables (all 2026-05-07):**
- `cc-brief-schema-drift-audit-2026-05-07.md` — Q1+Q5 investigation, fired into CC
- `aria-v2-delta-update-2026-05-07.md` — Aria pre-Sprint-10 prerequisite
- `aria-sprint-10-design-brief-2026-05-07.md` — Aria forward-looking, gated by delta

---

## 1. Read Summary

### What the spec is actually asking for

The April 27 spec is **substantially larger in scope than the April 23 audit**. The audit catalogued 13 temporal-registry items (S10-TR-1 through S10-TR-13) classified as Tier A/B/C gaps. The spec absorbed those AND added entire new categories the audit didn't address:

- **Branched onboarding (Rush vs Complete)** with 4 sub-steps inside Branch B Step 8 — not in audit
- **Document availability engine** (S10-DA-1 through S10-DA-6) — not in audit
- **Re-entry surfaces** (Dashboard banner + Paramètres card + per-page affordances) — not in audit
- **Cap table date scrubbing** + **Historique des mouvements events table** — not in audit
- **Hybrid schema architecture (Option 3)** with reserved enum values for ESOP — not in audit
- **Coming-Soon DD export placeholders** (S10-CS-1, S10-CS-2) — not in audit
- **Reconciliation safety net** (Branch B Sub-step 8c) — not in audit

The spec correctly states it supersedes the audit where they differ. Practical effect: anyone reading only the audit underestimates Sprint 10 scope by roughly 40-50%.

### Q3 = Option B scope addition (locked 2026-05-07)

Sprint 10 now includes citizenship + Canadian-resident ratio compliance work (S10-TR-9, S10-TR-10) as MUST-SHIP, not deferred to v1.1. Tech sector is high client-potential, tech companies are mostly CBCA, and shipping a CBCA-supporting product without 25%-rule visibility is a gap a DD lawyer will flag immediately. Adds ~3-5 sprint-days, distributed across phases 10A (schema) and 10F (UX).

### The three strategic anchors (spec §1)

1. Persona (c) — DD-prep — is the launch persona. Day 1 user behavior is "browse the minute book."
2. Branched onboarding — user self-identifies complexity. No mid-flow switching.
3. Skip-anywhere with capability scaling. Onboarding is never a wall.

### The 16 locked decisions (spec §7) that constrain phase decomposition

Most consequential for execution:
- **Decision 4 (no mid-flow branch switching)** — eliminates an entire class of state-management complexity, but means Branch A and Branch B are independent UIs that can ship in different phases.
- **Decision 5 (DB-backed save-and-resume, not localStorage)** — every onboarding step writes to DB before advance. This is infrastructure that must ship in 10A before any branched UI.
- **Decision 8 (capability scaling) + Decision 9 (soft warnings, not hard blocks)** — drives S10-DA-1 through S10-DA-5 design.
- **Decision 10 (hybrid schema, Option 3)** — `shareholdings.source` and `end_reason` are TEXT enums with reserved ESOP values. Pure-concrete schema is rejected. Sprint 10 schema work is ~10-15% larger than audit's pure-concrete spec to lay this foundation.
- **Decision 13 (reconciliation safety net required)** — Sub-step 8c is non-negotiable for Branch B. This is the highest-complexity single piece of Sprint 10 UX.
- **Decision 16 (8-12 week launch timeline accepted)** — sets expectation that Sprint 10 is the longest sprint to date.

### Phase 4d Stream 2's mandatory disclaimer is a stopgap that gets retired by 10B

The current BulkCatchUpModal ships a yellow "Current signatories only" banner + mandatory confirmation checkbox. This was the explicit committed stopgap for the temporal-registry gap until Sprint 10's as-of-date resolver closes it. Once S10-TR-1 + S10-DA-3 ship, the disclaimer can be replaced by per-row partial-data warnings (the "amber tooltip on rows with incomplete history" pattern). **The retirement of that disclaimer is itself a deliverable** — it signals to users that the truthfulness gap is closed.

---

## 2. Gap Reconciliation — Audit vs Spec

### 2.1 Items where audit and spec agree (in Sprint 10 scope)

| Audit ID | Spec ID | What it is |
|----------|---------|------------|
| Audit B1+B2 | S10-TR-1 | As-of-date signatory resolver (`generatePdfDocument({ asOfDate })`) |
| Audit A1+A2 | S10-TR-2 | Shareholder temporal schema (`end_date`, `end_reason`, `source`) + `share_transfers` table |
| Audit B6 | S10-TR-3 / S10-RP-7 | Wire Transférer button |
| Audit A3+C1 | S10-TR-4 | `officer_appointments.end_reason` column + Retirer motif dropdown |
| Audit (B6 contingency) | S10-TR-5 / S10-RP-10 | Hide Transférer button if S10-TR-3 slips |
| Audit B3 | S10-RP-1 / S10-RP-3 | "Anciens administrateurs / dirigeants (N)" collapsible sections |
| Audit B5 | S10-TR-7 / S10-RP-8 | Modifier les actions field-level lockdown (Option A+) |
| Audit B7 | S10-TR-8 / S10-OB-13 | Onboarding officer appointment date |
| Audit (new) | S10-TR-12 / S10-RP-9 | "Annuler une émission" flow (typo-correction escape hatch) |
| Audit §5 Q5 | S10-TR-13 | Acceptation du mandat real implementation (verified full gap 2026-04-24) |

### 2.2 Items in spec but NOT in audit — these are the "expanded scope"

| Spec ID | What it is | Implication |
|---------|------------|-------------|
| S10-OB-1 | Onboarding state schema | Required by Decision 5 (DB-backed save-and-resume) |
| S10-OB-2 | Step 5 branch choice screen | Required by Decision 4 (branched onboarding) |
| S10-OB-3 | Branch A (Rush) — bulk-date pattern per role | Net-new flow |
| S10-OB-4 | Branch B (Complete) — sub-steps | Net-new flow, includes Sub-step 8c reconciliation |
| S10-OB-5 | DB-backed save-and-resume infrastructure | Foundation for OB-3, OB-4 |
| S10-OB-6 | "Quitter l'onboarding" affordance every step | Decision 7 (skip-anywhere) |
| S10-OB-7 | "Passer cette section" with consequence warning | Decision 7 (skip-anywhere) within Branch B |
| S10-OB-8 | Branch B Sub-step 8c — cap table reconciliation | Decision 13 (reconciliation safety net) |
| S10-OB-9 | Step 4 incorporation_date required to advance | Decision 14 |
| S10-OB-10 | Dashboard banner state-aware | Re-entry surface 1 |
| S10-OB-11 | Paramètres "Configuration de votre minute book" card | Re-entry surface 2 (Decision 6) |
| S10-OB-12 | Per-role-page "Ajouter de l'historique" affordance | Re-entry surface 3 |
| S10-RP-5 | Cap table date scrubbing | Net-new — date picker above donut + filtered queries |
| S10-RP-6 | "Historique des mouvements (N)" events table | Net-new — events-based view of share transfers |
| S10-DA-1 | Per-document-type metadata defining "what data is needed" | Net-new engine |
| S10-DA-2 | Real-time evaluation engine: available / partial / blocked | Net-new engine |
| S10-DA-3 | Bulk Catch-Up modal — partial-data row warning + tooltip | Replaces Phase 4d Stream 2 banner |
| S10-DA-4 | PDF footer note for partial-data documents | Net-new |
| S10-DA-5 | Bulk Catch-Up modal uses asOfDate per row | Wires asOfDate through bulk endpoint |
| S10-DA-6 | Dashboard "État de votre minute book" capability widget | SHOULD-SHIP, deferrable |
| S10-CS-1 | Dashboard "Exporter le registre complet" widget (disabled, Coming Soon) | Sprint 11 wires up; placeholder ships now to avoid two UI changes |
| S10-CS-2 | Per-page "Exporter" buttons (disabled, Coming Soon) | Same rationale |

### 2.3 Items the audit deferred to v1.1 that are now MUST-SHIP

Per Q3 = Option B (locked 2026-05-07):

| Item | What it is | Phase placement |
|------|------------|-----------------|
| S10-TR-9 | Citizenship field for non-residents (conditional reveal when Résident canadien = OFF) | Schema in 10A; UX in 10F |
| S10-TR-10 | Canadian-resident ratio indicator (visible only when type_de_constitution = CBCA) | UX in 10F |

Audit §6.3 wizard Step 3 date anchoring (S10-TR-11) remains deferrable per audit Decision 1 fallback order. Not in MUST-SHIP yet — revisit if 10D timeline allows.

### 2.4 Drift between audit and spec — RESOLVED 2026-05-07

**Drift #1: `share_transfers` schema shape — RESOLVED via Q2 lock.**

| Audit version | Spec version | LOCKED v1.1 (Q2 amendment) |
|---|---|---|
| `from_person_id`, `to_person_id` | `from_shareholding_id`, `to_shareholding_id` | **Spec linkage** |
| `share_class_id` | (resolved through linked shareholding rows) | (resolved through linkage) |
| `quantity` | `quantity_transferred` | `quantity_transferred` |
| `certificate_old`, `certificate_new` | (absent) | **Carried on destination shareholding row** |
| `resolution_document_id` (nullable) | (absent) | **Added back: `resolution_document_id UUID NULL REFERENCES documents(id)`** |
| (absent) | `consideration`, `notes` | Both kept |

Final 10A schema for `share_transfers`:
```sql
CREATE TABLE share_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  to_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  transfer_date DATE NOT NULL,
  quantity_transferred INTEGER NOT NULL,
  consideration TEXT,
  notes TEXT,
  resolution_document_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
With `certificate_old TEXT` and `certificate_new TEXT` carried on the destination shareholding row alongside the existing `certificate_number`.

**Drift #2: "Anciens" sections — read-only or with Restaurer affordance.**
Spec wins — Restaurer affordance ships. Validation rules (no overlapping mandates, end-date semantics) folded into Phase 10F sub-task scope. Locked question Q11 in §5 covers the implementation specifics.

**Drift #3: Acceptation du mandat scope.** Audit S10-TR-13 specifies 7 sub-tasks. Spec §5.7 lists it as a single line item. The audit's detail is the implementation truth — Phase 10A scopes to that level. Locked under Q4 with explicit physical/manual signing MVP confirmed.

---

## 3. Proposed Phase Decomposition

### 3.1 Why 8 phases, not 4

The spec's internal phasing (§5.12) groups Sprint 10 into 4 sub-sprints (10A–10D, weeks 1-3 / 4-6 / 7-9 / 9-10). That structure is fine for calendar planning but **too coarse for ship-shaped sessions** per the discipline that drove Phases A/B/C. Each phase should produce a visible end-of-phase deliverable that can be QA'd, deployed, and learned from before the next phase begins. The Phase A→B→C arc on the Minute Book proved this works: 5 commits / 2 deploys with clean visual gates and zero production rollbacks.

### 3.2 The 8 proposed phases (v1.1 — Q3 + Q4 incorporated)

| Phase | Scope | Effort | Depends on |
|-------|-------|--------|------------|
| **10A** — Schema foundation + Acceptation du mandat + citizenship schema | S10-TR-2 (with Q2 amendments), S10-TR-4, S10-OB-1 migrations + S10-TR-9 schema (`company_people.citizenship`) + S10-TR-13 (template + wiring + triggers) + audit of declared-but-unfulfillable requirement keys | **~5-7 sprint-days** *(was 3-5; +2 days for citizenship schema + S10-TR-9 backfill logic)* | Schema drift backfill (Tier 1 #3) IN FLIGHT — CC investigating now |
| **10B** — As-of-date resolver + document availability engine | S10-TR-1, S10-DA-1, S10-DA-2, S10-DA-3, S10-DA-4, S10-DA-5. Retires Phase 4d Stream 2 banner. | **~5-7 sprint-days** | 10A schema. Aria design for partial-data warning UI |
| **10C** — Onboarding state infrastructure + Step 5 branch choice | S10-OB-5, S10-OB-9, S10-OB-2, S10-OB-6, S10-OB-7. Branched architecture wired but no Branch UI yet. | **~5-7 sprint-days** | 10A. Aria design for Step 5 branch cards |
| **10D** — Branch A (Rush) flow | S10-OB-3 + S10-OB-13 (officer date). Step 6/7/8 with bulk-date pattern + Step 9 confirmation. | **~5-7 sprint-days** | 10C. Aria design for bulk-date pattern visual |
| **10E** — Branch B (Complete) flow + reconciliation | S10-OB-4 + S10-OB-8. The heaviest single phase. Sub-steps 6a/6b, 7a/7b, 8a/8b/8c. Reconciliation is the highest-risk UX in Sprint 10. | **~10-14 sprint-days** | 10C + 10D. Aria design for sub-step layouts + reconciliation 3-path UI |
| **10F** — Role pages: directors + officers + citizenship UX + ratio indicator | S10-RP-1, S10-RP-2, S10-RP-3, S10-RP-4, S10-TR-9 UX (conditional citizenship field on Add Director modal), S10-TR-10 (CBCA-only ratio indicator). "Anciens" collapsibles + Remove flow capture end_date+end_reason. Restaurer affordance. | **~6-8 sprint-days** *(was 5-7; +1 day for S10-TR-9 UX + S10-TR-10 indicator)* | 10A. Aria design for past-state sections + citizenship field placement + ratio indicator visual |
| **10G** — Actionnaires page: temporal cap table + transfers + lockdowns | S10-TR-3 / S10-RP-7 (Transférer wiring), S10-RP-5 (date scrubbing), S10-RP-6 (events table), S10-RP-8 (Modifier lockdown), S10-RP-9 (Annuler émission). Second-heaviest phase. | **~7-10 sprint-days** | 10A. Aria design for cap-table-as-of-date UI + events table + Modifier lockdown helper text |
| **10H** — Re-entry surfaces + Coming-Soon + capability widget + integration QA + test data purge | S10-OB-10/11/12, S10-CS-1/2, S10-DA-6 (if SHOULD-SHIP confirmed), LI-6 test data purge, full bilingual visual gate, cross-phase regression | **~5-7 sprint-days** | All prior phases |

**Total proposed effort: 48-68 sprint-days = roughly 10-14 working weeks at sustainable pace.** *(was 45-64; Q3 = Option B added ~3-5 sprint-days.)* Tracks the spec's 8-12 week realistic estimate, edging toward the upper bound.

### 3.2.1 Phase 10A non-negotiables (Q4 amendment)

Locked May 7 via Q4: **the existing document → Completeness → Binder pipeline (stabilized via Phase A/B/C) MUST NOT regress in 10A.** This is non-negotiable, not a guideline.

Implications for the 10A CC brief:
- S10-TR-13 adds a new VaultDocType (`acceptation_mandat`) and a new minute_book_section category for acceptance forms. Both touch the section classifier in `app/api/minute-book/binder/route.ts` — the same classifier Phase C just stabilized. Investigation-first must confirm the new entries don't shift existing classifications.
- The existing binder query filters to `is_finalized = true` (Phase C C1). Acceptation du mandat documents need to land in the binder with the correct `is_finalized` semantics — pre-decided per Q4 as physical/manual signing, so initial state is `is_finalized = false` (uploaded-signed flips it true, matching existing pattern).
- Visual gate before merge: dual-fixture (Acme + droussy) full-pipeline check on FR + EN, both Completeness tab AND Binder tab, confirming no regression on already-shipped documents AND correct rendering of new acceptation du mandat documents.
- If at any point during 10A the existing pipeline shows regression, STOP. Surface to Max. Do not push through.

### 3.3 How the proposal differs from your first guess (v1.0 retained)

Your initial outline had 7 phases (10A schema → 10B onboarding state → 10C Branch A → 10D Branch B → 10E past-state views → 10F as-of-date+wizard fix → 10G reconciliation+QA). My proposal differs in three meaningful ways:

1. **As-of-date resolver moves from 10F → 10B.** The spec puts S10-TR-1 with the schema work in Sprint 10A because every downstream feature (Bulk Catch-Up, document availability engine, role page generation) depends on it. Pushing it to phase 6 of 7 means six phases ship with the broken behavior.
2. **Reconciliation is folded into Branch B (10E), not a separate phase.** Sub-step 8c is one of three sub-steps inside Branch B Step 8. Splitting it off as Phase 10G makes sense for QA but not for shipping — Branch B isn't deployable without 8c.
3. **Two surfaces you didn't enumerate that the spec requires: document availability engine (10B) and re-entry surfaces (10H).** These aren't optional polish; S10-DA-1 through S10-DA-5 retire Phase 4d Stream 2's stopgap, and S10-OB-10/11/12 are the entire user re-entry path per Decision 6.

---

## 4. Aria Design Dependency Map

Sprint 10 cannot ship without Aria scope. Surfaces requiring design before phase work begins:

| Phase | Aria deliverable needed | Spec reference |
|-------|------------------------|---------------|
| 10B | Bulk Catch-Up partial-data row warning + tooltip visual | §8 open question 1 |
| 10B | PDF footer note styling for partial-data documents | (implementation) |
| 10C | Step 5 branch choice cards (🚀 Rush vs 📚 Complete) — copy locked, visual not | §3.1 |
| 10C | "Quitter l'onboarding" + "Passer cette section" affordance pattern | §3.6 |
| 10D | Bulk-date pattern per role step (e.g., "Tous ces administrateurs sont en poste depuis :") | §3.2 |
| 10D | "Cet administrateur a une date différente" override link | §3.2 |
| 10E | Branch B sub-step layouts (6a/6b/7a/7b/8a/8b/8c) | §3.3 |
| 10E | Sub-step 8c reconciliation safety net — 3 resolution paths visualization | §4.6 |
| 10E | "Ajouter un mouvement" modal (transfert / rachat / annulation / conversion / nouvelle émission) | §3.3 |
| 10F | "Anciens administrateurs / dirigeants (N)" collapsible section typography + accent | §8 open question 5 |
| 10F | Restaurer button affordance | §2.2 |
| 10F | Conditional citizenship field on Add Director modal (S10-TR-9) | audit §6.3 |
| 10F | CBCA-only Canadian-resident ratio indicator (S10-TR-10) | audit §6.3 |
| 10G | Cap table date scrubbing — date picker + "Vue au [date]" banner + "Retour à aujourd'hui" link | §2.3 |
| 10G | Historique des mouvements events table — row layout + filters | §2.4 |
| 10G | Modifier les actions field-level lockdown — disabled-field helper text + page-level info callout | audit S10-TR-7 |
| 10H | Dashboard banner state-aware messaging (5 states: not started / in progress / partial / deferred / complete) | §3.7 |
| 10H | Paramètres "Configuration de votre minute book" card | §3.7 |
| 10H | Per-role-page "Ajouter de l'historique" button | §3.7 |
| 10H | Coming-Soon disabled-button affordance (used in 2 places) | §2.5 |
| 10H | "État de votre minute book" capability widget (if SHOULD-SHIP confirmed) | §5.8 |

**Total: 17 Aria-design artifacts** (was 15 in v1.0; +2 for Q3 = Option B citizenship UX + ratio indicator).

**Aria pipeline status (May 7):**
- v2 delta-update brief: drafted, queued for Dom to forward
- Sprint 10 forward-looking brief: drafted, queued for Dom to forward (gated by v2 delta)
- Aria response cadence: 1-2 weeks per package historically. Total Aria pipeline: ~3-5 weeks before all 17 artifacts have design coverage.

---

## 5. Locked Questions for Dom

### Pre-10A questions — ALL LOCKED 2026-05-07

**Q1 — Schema drift backfill brief: ✅ LOCKED — APPROVED**
CC investigation in flight as of 2026-05-07. Bundles Q5 audit. Output: `docs/schema-drift-audit-2026-05-07.md` (uncommitted, Max review pending).

**Q2 — `share_transfers` schema: ✅ LOCKED — APPROVED (all three sub-decisions)**
- Q2a: Spec's `from_shareholding_id` / `to_shareholding_id` linkage CONFIRMED.
- Q2b: `resolution_document_id UUID NULL REFERENCES documents(id)` ADDED.
- Q2c: `certificate_old / certificate_new` CARRIED on destination shareholding row.
Final schema in §2.4 above.

**Q3 — S10-TR-9 + S10-TR-10 (citizenship + Canadian-resident ratio): ✅ LOCKED — Option B (both MUST-SHIP)**
Tech sector / CBCA-heavy client potential drives this in. Adds ~3-5 sprint-days distributed across 10A (schema) and 10F (UX). Phase estimates updated in §3.2.

**Q4 — Acceptation du mandat signature routing: ✅ LOCKED — physical/manual MVP**
With explicit Q4 amendment: existing document → Completeness → Binder pipeline must not regress. See §3.2.1 for non-negotiables baked into 10A brief.

**Q5 — Declared-but-unfulfillable requirement keys audit: ✅ LOCKED — APPROVED**
Folded into the same CC investigation as Q1 (in flight 2026-05-07).

### Open questions — gate later phases

**Q6 — Phase 4d Stream 2 disclaimer retirement plan (gates 10B).**
RECOMMEND immediate retirement once S10-TR-1 + S10-DA-3 ship. Defense-in-depth via two warnings is confusing.

**Q7 — S10-DA-1 metadata source (gates 10B).**
Per-document-type "what data is needed" definitions — does this live in `minute_book_requirements` (schema-extension), `lib/requirement-doctype.ts` (code), or a new doc-availability config file? Architectural call. May surface in CC schema-drift audit findings.

**Q8 — S10-DA-6 capability widget — SHOULD-SHIP or drop (gates 10C).**
Spec §8 open question 2. Decision can be made after 10A/B progress is visible.

**Q9 — Bilingual i18n strategy for Sprint 10's net-new strings (gates 10C).**
Two paths: (a) ship Sprint 10 strings bilingual from the start, (b) defer EN to a post-Sprint-10 sweep. RECOMMEND (a) — Sprint 10 is a launch sprint and English-broken UI ships English-broken to launch.

**Q10 — Reconciliation 3-path UX copy lock (gates 10E).**
Highest-stakes UX in Sprint 10. Needs explicit copy lock with Aria + Dom before any implementation.

**Q11 — "Restaurer" affordance scope (gates 10F).**
One-click new mandate, or Add Director flow pre-filled? Edge case: person already has an active mandate (multiple non-contiguous mandates per spec §1.7).

**Q12 — Annuler émission flow schema decision (gates 10G).**
Add `shareholdings.status` column vs reuse `end_reason='cancellation'` + `end_date`. RECOMMEND the latter — fewer columns, cleaner enum semantics.

**Q13 — Test data purge timing (gates 10H).**
Purge before Sprint 10 starts (tabula rasa) or as part of 10H (real-data testing throughout)? RECOMMEND purge in 10H.

---

## 6. External Dependencies

| Dependency | Status (May 7 v1.1) | Blocks |
|------------|---------------------|--------|
| Schema drift backfill brief (Tier 1 #3) | **IN FLIGHT** — CC investigating per `cc-brief-schema-drift-audit-2026-05-07.md` | Phase 10A migrations |
| Declared-but-unfulfillable requirement keys audit (S10-TR-13 follow-up) | **IN FLIGHT** — bundled in same CC session as schema drift | Phase 10A scope confirmation |
| Aria v2 delta-update | **DRAFTED** — `aria-v2-delta-update-2026-05-07.md` queued for Dom to forward | Aria Sprint 10 design pipeline |
| Aria Sprint 10 forward-looking brief | **DRAFTED** — `aria-sprint-10-design-brief-2026-05-07.md` queued for Dom to forward (gated by v2 delta) | Phases 10C/D/E/F/G/H UI work |
| Phase 4d Stream 2 disclaimer/checkbox in `BulkCatchUpModal` | LIVE in production | Phase 10B retirement |
| TITLE-I18N-1 (Tier 1 #11) | OPEN — spec exists | Doesn't block; bilingual title strategy intersects S10-DA-3 partial-data tooltips |
| I18N-API-ERRORS-1 (Tier 1 #6) | OPEN | Doesn't block but increases parallel-track load |
| Concern 2 count drift (Tier 1 #1) | OPEN — recommended pre-10B, ~2-3 hours | Not blocking; gets Bulk Catch-Up modal into known-good state before 10B |
| Pre-launch screen audit Dashboard pass | NEXT TARGET | Should run before 10H to surface dashboard surface drift before re-entry surfaces are added |

### Launch infrastructure parallel track (LI-1 through LI-8)

Per spec §5.10. Dom + CC own most items. Coordination touchpoints unchanged from v1.0:
- **LI-6 test data purge** intersects 10H (Q13)
- **LI-2 landing page** competes for Aria bandwidth with Sprint 10 design surface
- **LI-1 Stripe** has zero overlap with temporal registry; can run fully parallel
- **LI-8 Livre tab `minute_book_section` audit/repair** — substantively addressed by Phase A/B/C; verify scope before kickoff

---

## 7. Pre-10A Sequence — Status Update

| Step | Status (May 7 v1.1) |
|------|---------------------|
| 1. Lock the 5 pre-10A questions | ✅ DONE — Q1-Q5 locked May 7 |
| 2. Run the 15-minute declared-but-unfulfillable requirement keys audit | **IN FLIGHT** — bundled with schema drift in CC session |
| 3. Schema drift backfill brief | **IN FLIGHT** — CC investigating |
| 4. Aria Sprint 10 design brief drafted | ✅ DONE — queued for Dom to forward |
| 4b. Aria v2 delta-update drafted | ✅ DONE — queued for Dom to forward (gates Sprint 10 brief) |
| 5. Concern 2 count drift fix (Tier 1 #1) | OPEN — recommended pre-10B, ~2-3 hours, doesn't gate 10A |

After CC's audit lands and Max reviews, three possible follow-ups (per the CC brief):
1. Drift small + remediable in <1 hour → tight remediation brief, next session.
2. Drift medium → structured remediation brief in batches with per-edit approval.
3. Drift large → multi-session remediation arc, splits Sprint 10's pre-work track into a mini-sprint.

The Phase 10A CC brief drafts AFTER schema drift audit + declared-but-unfulfillable findings land. Earliest 10A start: 1-3 days from now if drift is small; 1-2 weeks if drift is large.

---

## 8. Honest Risks (v1.0 retained)

**Risk 1: Phase 10E (Branch B + reconciliation) is the biggest single shippable unit Sprint 10 will produce.** ~10-14 sprint-days for one phase is well outside the Phase A/B/C cadence (~1-3 days each). The reconciliation safety net's 3-path UX, multiple validation paths, and Branch B's nested sub-steps make this the single largest piece of net-new product UX since Sprint 6 onboarding. Mitigation: split 10E into 10E-1 (Branch B Steps 6/7 + 8a/8b without reconciliation) and 10E-2 (Sub-step 8c reconciliation only) if mid-phase context-load becomes a problem. Decision deferrable until 10E starts.

**Risk 2: The spec says "8-12 weeks" but assumes solo CC execution at full bandwidth.** Memory shows the surge cadence (April 30 – May 6) was 23 commits in 12 days — exceptional, not sustainable. A more realistic Sprint 10 calendar at sustainable pace is 12-16 weeks. With Q3 Option B added, that's now 13-17 weeks. Be honest with the launch-date conversation when Stripe + landing page + ToS reviews enter the picture.

**Risk 3: Aria bandwidth is the silent constraint.** Sprint 10 needs 17 design artifacts plus the v2 delta-update plus parallel landing page work. If Aria is solo and weekly cadence is 1-2 deliverables, the design queue is 4-6 months of Aria-time at current cadence. Either accept the design pipeline limits Sprint 10 phase pace, or re-scope expectations on Aria input granularity (some phases ship with "good-enough" mockups Max draws, refined later).

---

## 9. Bottom Line

Sprint 10's spec is correct, the audit is correct, and the gap between them is exactly the work the spec added (branched onboarding + document availability + re-entry surfaces + cap table temporality). 8 phases, 48-68 sprint-days, 10-14 working weeks at sustainable pace, plus parallel launch infrastructure track. Q3 = Option B amendment added Quebec-CBCA compliance work as MUST-SHIP.

5 of 13 questions locked May 7. Q1+Q5 in flight via CC schema-drift audit. Aria pipeline drafted, awaiting Dom forward. Q6-Q13 remain to gate later phases — none block 10A.

Phase 10A unblocks as soon as CC audit lands + Max reviews + remediation scope is set. Earliest 10A start: 1-3 days from now (if drift is small).

---

## 10. Decisions Log

Audit trail of how v1.1 differs from v1.0.

### 2026-05-07 — Q1-Q5 lock session

| ID | v1.0 state | v1.1 lock | Source |
|----|-----------|-----------|--------|
| Q1 | Open question — schema drift backfill go/no-go | ✅ APPROVED — brief opened, CC in flight | Dom 2026-05-07 chat |
| Q2 | Open question — share_transfers schema with 3 sub-calls | ✅ APPROVED — spec linkage + resolution_document_id added + certificate_old/new on destination shareholding | Dom 2026-05-07 chat ("Q2 = APPROUVE") |
| Q3 | Open question — citizenship + Canadian-resident ratio defer-or-MUST-SHIP | ✅ Option B (both MUST-SHIP) — tech-sector / CBCA-heavy rationale | Dom 2026-05-07 chat ("option b. In tech mostly, which is a very good client potential, its mostly CBCA") |
| Q4 | Open question — physical/manual signing MVP | ✅ APPROVED — with explicit pipeline-preservation amendment (document → Completeness → Binder MUST NOT regress) | Dom 2026-05-07 chat ("we now have a user pipeline that works (document to Completeness to binder). Lets avoid breaking it") |
| Q5 | Open question — declared-but-unfulfillable keys audit go/no-go | ✅ APPROVED — bundled with Q1 in CC session | Dom 2026-05-07 chat |

### Scope changes from Q3 = Option B

- 10A effort: 3-5 sprint-days → **5-7 sprint-days** (+citizenship schema + S10-TR-9 backfill logic)
- 10F effort: 5-7 sprint-days → **6-8 sprint-days** (+S10-TR-9 UX + S10-TR-10 indicator)
- Total Sprint 10 effort: 45-64 sprint-days → **48-68 sprint-days** (10-14 working weeks)
- Aria design artifacts: 15 → **17** (+citizenship field placement + ratio indicator visual)
- New §2.3 added covering MUST-SHIP-promoted items

### Q4 amendment baked into v1.1

Pipeline-preservation constraint is now an explicit non-negotiable in Phase 10A scope (§3.2.1). Affects S10-TR-13 implementation specifically — investigation-first must verify the new VaultDocType (`acceptation_mandat`) and new minute_book_section category don't regress the Phase A/B/C pipeline. Visual gate before merge: dual-fixture (Acme + droussy) full-pipeline check on FR + EN.

### v1.1 deliverables shipped same day

- `aria-v2-delta-update-2026-05-07.md` (drafted)
- `aria-sprint-10-design-brief-2026-05-07.md` (drafted)
- `cc-brief-schema-drift-audit-2026-05-07.md` (fired into CC)
- This v1.1 of `sprint-10-phase-decomposition-2026-05-07.md`

### Future amendments

When Q6-Q13 lock, this Decisions Log gets the additions. When CC's schema drift audit lands and Max reviews, the §6 / §7 status tables get updated. Treat this doc as the single forward-looking source of truth for Sprint 10 scope; memory bullets reference this doc.

---

**End of v1.1.** Supersedes v1.0 of 2026-05-07.
