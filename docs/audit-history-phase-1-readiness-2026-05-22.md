# Audit — Phase 1 Readiness (Director + Officer history: capture + view)

**Date:** 2026-05-22
**Scope:** Lifecycle History Phase 1A — ground-truth investigation, read-only. Feeds the Phase 1B build brief.
**Cross-refs:** `docs/scoping-history-feature-2026-05-22.md` Phase 1 + Phase 3, `docs/audit-people-surfaces-2026-05-22.md` A.1/A.6.
**Critical-Path:** LAUNCH-CRITICAL (Tier 1 #19a + #19b per Queue v3.55, Dom override 2026-05-22).
**Mode:** INVESTIGATION ONLY — no code edits, no migration, no build, no deploy. This doc is the only write.

---

## Preflight (PASS)

| Surface | `docs/feature-lifecycle.md` status | Notes |
|---|---|---|
| Administrateurs | **ACTIVE** | "Critical path (Phase 10F/10G temporal registry UX)" |
| Dirigeants | **ACTIVE** | "Critical path (Phase 10F/10G temporal registry UX)" |

Both ACTIVE + critical path. Proceed.

**Atom-3 entanglement check:** none found. `director_mandates` + `officer_appointments` are both `person_id UUID NOT NULL REFERENCES company_people(id)` — single-person, no entity / no joint-holder model. The atom-3 polymorphic holder pattern lives only on `shareholding_holders`. Phase 1 is fully atom-3-independent. ✅

---

## ⚠️ MEMORY CORRECTION — `officer_appointments.end_reason` ALREADY EXISTS

**Brief hypothesis:** "Confirm `officer_appointments` has NO `end_reason` column today (audit A.6)."

**Ground truth: HYPOTHESIS WRONG. Column exists.**

- **Migration:** `supabase/migrations/20260511001738_phase10a_low_risk_additive.sql` lines 14-19 (LOCK-3, shipped May 11, 2026 via `09dcf11`):
  ```sql
  ALTER TABLE officer_appointments
    ADD COLUMN IF NOT EXISTS end_reason TEXT NULL
    CHECK (end_reason IN ('resignation','revocation','term_expired','death','disqualification'));
  ```
- **Comment in the migration itself:** *"Mirror of `director_mandates.end_reason` enum (5 values), per 2026-04-23 audit §6.1 S10-TR-4."*
- **5-value enum, IDENTICAL to director enum** (`director_mandates` schema confirmed at `supabase/migrations/20260405000000_sprint6_people_ownership.sql:42`).

**What audit A.6 + scoping doc + Queue v3.55 #19a actually got right:** the *pipeline-side gap*. The column exists in the DB but:
1. `lib/supabase/people-types.ts:60-71` `OfficerAppointment` interface OMITS `end_reason` from its TS type.
2. `RemoveOfficerModal.tsx:58-63` updates only `is_active=false` + `end_date` — does NOT write `end_reason`.
3. No UI surfaces the column on cards or registers.
4. `/api/registers/officers/route.ts:36-44` entries shape returns `end_date` + `is_active` only — does NOT pass through `end_reason`.

So Phase 1's officer end_reason work is **NOT** an `ADD COLUMN` migration. It is:
- **No migration needed** if the existing 5-value enum stands.
- **If the trimmed officer-appropriate enum is preferred (Q3 locked decision):** the work is a **CHECK CONSTRAINT replacement migration** (DROP / ADD constraint pattern, precedent at `20260511140949_phase10a_shareholdings_temporal.sql:13-22`), plus TS-types extension, plus pipeline plumbing.

**Implication for Q3 locked decision (Dom 2026-05-22):** The locked-in proposal was *"trimmed officer-appropriate enum (resignation / removal / term_ended / death; possibly + position_eliminated), not a mirror of the director 5-value set."* But the production schema **already enforces** the 5-value mirror. Pursuing the trimmed enum means:
- Renaming `revocation` → `removal` (semantic preference but value swap)
- Renaming `term_expired` → `term_ended` (semantic preference but value swap)
- Dropping `disqualification` (officers typically aren't disqualified the way directors are under LSAQ 108 / CBCA s.105)
- Adding `position_eliminated` (positional vs mandated reasoning — useful)
- **Plus a data-migration step** if any officer rows already carry `end_reason` values that would no longer satisfy the new CHECK. (Unlikely — RemoveOfficerModal has never written the column, so backfill scope is probably zero, but must be verified at build time with `SELECT DISTINCT end_reason FROM officer_appointments`).

**Recommendation to Dom (Phase 1B brief decision point):** confirm one of three paths:
- **Path A — keep the 5-value director-mirror.** Zero migration; just wire TS types + RemoveOfficerModal + register API + cards/disclosure. Simplest.
- **Path B — swap to the trimmed officer-appropriate enum.** One CHECK-constraint replacement migration (version 18). Cleaner semantics, more lines of work.
- **Path C — hybrid:** keep `revocation` + `term_expired` for backward-compat, ADD `position_eliminated`, document `removal`/`term_ended` as UI display labels for the existing DB values. Avoids migration; resolves semantic concern via translation layer.

This is a Dom decision; surface before Phase 1B starts.

---

## A. Officer end_reason — schema + pattern (REVISED)

| Brief question | Ground truth |
|---|---|
| A1. Officer `end_reason` column today? | **EXISTS** — added 2026-05-11 via LOCK-3 in `20260511001738_phase10a_low_risk_additive.sql`. 5-value enum identical to director. See ⚠️ section above. |
| A2. Director `end_reason` modeling | **TEXT column + CHECK constraint** (not Postgres enum type). Values: `resignation`, `revocation`, `death`, `disqualification`, `term_expired`. Source: `20260405000000_sprint6_people_ownership.sql:42`. Memory accurate. |
| A3. Current migration chain version | **17** (latest file `20260515065959_phase10a5_atom2_drop_person_id_add_rpc.sql`). Next migration is version 18. Memory accurate. |
| A4. Proposed officer migration shape | Depends on Path A/B/C above. **Path A: no migration.** Path B: CHECK constraint DROP + ADD via `DO $$` block (precedent `20260511140949_phase10a_shareholdings_temporal.sql:13-22`). Path C: ADD value to existing CHECK via DROP + ADD with new value list. |

---

## B. Active-only fetch filters

| Brief question | Ground truth |
|---|---|
| B5. Directors fetch filter | `DirectorsClient.tsx:64-69` — supabase query `from('director_mandates').select('*, person:company_people(*)').eq('company_id', cid).eq('is_active', true).order('appointment_date', { ascending: true })`. **Filters at DB query level.** Memory line ~68 accurate. |
| B6. Officers fetch filter | `OfficersClient.tsx:53-55` — `from('officer_appointments').select('*, person:company_people(*)').eq('company_id', cid).eq('is_active', true).order('appointment_date', { ascending: true })`. **Filters at DB query level.** Memory line ~55 accurate. |
| B7. Row shape includes end_date / is_active? | Yes — `select('*')` brings every column. The fetch FILTER discards ended rows; the SHAPE preserves the columns when fetched. `end_reason` is brought via `select('*')` for directors (column exists) and for officers (column exists per A1). The TS type `OfficerAppointment` doesn't declare `end_reason` (see ⚠️ section) — TS-only gap, runtime row carries it. |

**Recommended fetch strategy** (active-only default, history revealed behind toggle):

Two viable patterns:
- **Pattern 1 — Drop filter, partition client-side.** Drop `.eq('is_active', true)`, fetch ALL mandates/appointments. Partition into `activeDirectors` + `endedDirectors` in the client. Cards render active list; toggle reveals ended subset filtered by `person_id`. Pro: one query. Con: payload size grows linearly with history (negligible at v1 scale).
- **Pattern 2 — Keep active filter, second on-demand fetch for history.** Keep current default-state code path unchanged. When user clicks "Voir l'historique" on a specific card, fire a per-person history fetch (e.g. `WHERE person_id = ? AND is_active = false`). Pro: zero impact on default load. Con: per-card N+1; toggle has loading state.

**Recommendation: Pattern 1.** v1 scale: per-company director/officer churn is low (handful to dozens of rows). The simpler one-query model + client-side partition wins on UX (toggle is instant). Pattern 2 only becomes worth its complexity at thousands of rows.

---

## C. Capture modals

| Brief question | Ground truth |
|---|---|
| C8. Add Director modal | `components/directors/AddDirectorModal.tsx` (~210 LOC). Fields: PersonSelector + `appointmentDate` (defaults to `incorporationDate || today`, per audit A.3). **No end handling today.** Insert at lines 92-99 hardcodes `is_active: true` (no `end_date`/`end_reason`/`is_active=false` path). |
| C9. Appoint Officer modal | `components/officers/AddOfficerModal.tsx` (~349 LOC). Fields: PersonSelector + title (`select` with TITLE_OPTIONS) + customTitle (conditional) + isSigningAuthority toggle + `appointmentDate` (same default). Insert at lines 141-152 hardcodes `is_active: true`, no end handling. Has title-conflict prompt for non-custom roles (lines 82-101). |
| C10. Director Remove modal | `components/directors/RemoveDirectorModal.tsx`. Captures `endDate` (default today, line 45) + `endReason` (default `resignation`, line 46). `END_REASONS` table at lines 24-30: 5 values with FR/EN labels. Update at lines 55-62 writes `is_active=false, end_date, end_reason`. **This IS the reference pattern for officer parity.** |
| C11. RemoveOfficerModal end_reason gap | `components/officers/RemoveOfficerModal.tsx` confirmed. Update at lines 58-63 writes only `is_active=false, end_date`. **No `end_reason` writer, no END_REASONS table, no select UI.** Parity gap matches audit A.6. |

### C12. Capture-Enhancement scope ("Toujours en poste?" toggle)

**AddDirectorModal changes** (~+30 LOC):
- New state: `inOffice: boolean` (default `true`).
- New state (conditional): `endDate: string` (default today) + `endReason: DirectorEndReason` (default `resignation`).
- New JSX: toggle "Toujours en poste ?" (matches the `isSigningAuthority` toggle pattern at AddOfficerModal:253-268 for visual consistency); when OFF, reveal end-date input + end-reason select (mirror RemoveDirectorModal's END_REASONS table + select).
- Insert at line 92 extended: when `!inOffice`, set `is_active: false, end_date: endDate, end_reason: endReason`.
- Activity log: same `director_added` event + extra metadata `{ ended: true, end_reason }` for one-step former-person entry visibility.

**AddOfficerModal changes** (~+35 LOC):
- Same state + toggle + conditional fields pattern.
- New OFFICER_END_REASONS table (depends on Path A/B/C decision above).
- Insert at line 141 extended same way.
- **Title-conflict logic interaction (lines 82-101):** if `!inOffice` AND user is adding a former officer, the conflict check should be SKIPPED (a non-active appointment doesn't conflict with the current active title-holder). Add an early-return condition: `if (replaceConflict || !inOffice) skipConflictCheck`. This is a subtle but important interaction to verify at build.

**RemoveOfficerModal changes** (~+25 LOC):
- Reuse the `END_REASONS` shape from RemoveDirectorModal but with officer-appropriate values (Path A/B/C).
- Add `endReason` state + select UI (mirror RemoveDirectorModal lines 122-138).
- Extend update at lines 58-63 to write `end_reason`.

**TS types changes** (`lib/supabase/people-types.ts`, ~+10 LOC):
- Add `OfficerEndReason` type union mirroring `DirectorEndReason`.
- Add `end_reason: OfficerEndReason | null` to `OfficerAppointment` interface (line 60-71).

---

## D. View / cards / register

### D13. Card structure + disclosure pattern

| Card | File | Current actions row | Where history disclosure belongs |
|---|---|---|---|
| DirectorCard | `components/directors/DirectorCard.tsx` (~178 LOC) | Lines 150-174: Edit (hidden by `{false &&}` Q-EDIT-DIR-1 guard, lines 156-165) + Remove (lines 166-173). Single `<div>` with `border-t pt-3`. | New disclosure section between "Other roles" (~lines 138-147) and "Actions" border-t (line 151). New state `historyExpanded`. Conditional render of ended-mandate list for `person_id === director.person_id`. |
| OfficerCard | `components/officers/OfficerCard.tsx` (~178 LOC) | Lines 141-174: Edit (hidden via `{false &&}` parity guard, lines 148-157; shipped `34227a3`) + Replace + Remove. | Same architecture: between "Other roles" (lines 129-137) and "Actions" border-t (line 141). |

**Existing collapse/disclosure pattern (REUSE):** `components/minute-book/RequirementSection.tsx:43-72` is the canonical pattern in this codebase. Uses:
- `useState(() => …)` lazy initializer for default-state policy.
- `<button type="button" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>` for accessible toggle.
- `ChevronDown` (open) / `ChevronRight` (closed) from `lucide-react`.
- Conditional render `{expanded && (…)}` for the disclosed content.

**Recommendation:** Build a small inline `<HistoryDisclosure>` block per card using this exact pattern; do NOT extract a shared component for Phase 1B (premature abstraction — only 2 surfaces in Phase 1, Shareholder card joins in Phase 3). Cross-surface consistency is delivered by **mirroring the pattern** (same chevron icons, same `aria-expanded` discipline, same default-collapsed state), not by sharing a component. Extract to `<PersonHistoryDisclosure>` in Phase 3 if Shareholder card's flavor matches; otherwise leave inline.

### D14. BinderView columns

| Register | API entry shape | BinderView columns (FR-only labels per audit A.5) |
|---|---|---|
| Directors | `/api/registers/directors/route.ts:28-36`: `full_name, address, is_canadian_resident, appointment_date, end_date, end_reason, is_active` | `BinderView.tsx:65-71` columns: Nom, Résidence, Début, **Fin**, **Actif**. `end_reason` reaches the entries object but is NOT rendered. ✅ Reference pattern for officers, with the `end_reason` rendering gap to fix too. |
| Officers | `/api/registers/officers/route.ts:36-44`: `full_name, title, appointment_date, end_date, is_active`. **`end_reason` NOT included in entries shape** despite existing in schema. | `BinderView.tsx:89-93` columns: Nom, Titre, Début, Actif. **No Fin column** despite API exposing `end_date`. Memory accurate on the BinderView gap; memory missed the API-side `end_reason` gap. |

**Phase 1B fix scope for BinderView/officers register:**
1. `/api/registers/officers/route.ts:36-44` — add `end_reason: m.end_reason || null` to the entries object (1 line).
2. `BinderView.tsx:89-93` — add Fin column + (optional) end_reason column. Patch ~3 lines plus row-mapping at lines 94-101.
3. **Bonus parity (deferred or folded):** directors register also surfaces `end_reason` in the API but BinderView doesn't render it. Could add a Motif column for both registers in one consistent pass.

### D14-bis. i18n leak in BinderView (folds into A.5, NOT Phase 1B blocker)

BinderView column labels (`'Nom'`, `'Résidence'`, `'Début'`, `'Fin'`, `'Actif'`, etc.) are hardcoded FR. The component never reads locale. Phase 1B should **add columns using the same FR-only pattern** to avoid scope-creeping into the A.5 bilingual sweep — but flag it as Phase 1B-adjacent debt.

---

## E. i18n

### E15. Keys

**Files:** `messages/fr.json` + `messages/en.json` (only two locale files; mirror schema).

**Existing namespaces:**
- `"directors"` at `fr.json:291-307` — has `appointmentDate`, `endReason`, `endDate`, `removeDirector`, `confirmRemove`, `edit`, `remove` etc.
- `"officers"` at `fr.json:308-330` — has `appointOfficer`, `endDate`, `replaceOfficer`, `removeOfficer` etc. **Lacks `endReason`** (parity gap mirrors C11).
- Both namespaces carry a `_locale` key (the ternary-locale workaround called out in audit A.5).

**Keys to ADD for Phase 1B** (under `directors` AND `officers`):
- `viewHistory` — "Voir l'historique" / "View history"
- `hideHistory` — "Masquer l'historique" / "Hide history" (toggle inverse label)
- `stillInOffice` — "Toujours en poste ?" / "Still in office?" (directors might prefer `stillSeated` / "Toujours en fonction ?" — Dom-callout)
- `formerDirector` / `formerOfficer` — "Ancien administrateur" / "Former director" + "Ancien dirigeant" / "Former officer" (badge text)
- `endedOn` — "Terminé le {date}" / "Ended on {date}" (history row sub-text)
- `noHistory` — "Aucun historique" / "No history" (empty-state text inside expanded disclosure)

**End-reason labels** (`directors` namespace already has the structure via RemoveDirectorModal's END_REASONS table at lines 24-30 — but it's hardcoded FR/EN in the component, NOT in messages JSON). Phase 1B should ADD `endReasons.{value}` keys to JSON and refactor END_REASONS to read from `t()`. Same for the new officer END_REASONS table. Keys:
- `endReasons.resignation` — "Démission" / "Resignation"
- `endReasons.revocation` — "Révocation" / "Revocation" (or "removal" / "Retrait" if Path B)
- `endReasons.term_expired` — "Fin de mandat" / "Term expired" (or "term_ended" / "Mandat terminé" if Path B)
- `endReasons.death` — "Décès" / "Death"
- `endReasons.disqualification` — "Disqualification" / "Disqualification" (directors only if Path B trims officers)
- `endReasons.position_eliminated` — "Poste aboli" / "Position eliminated" (officers only if Path B/C adds it)

**BinderView column headers** — flag as A.5 sweep, NOT Phase 1B (see D14-bis).

**Pattern:** keep existing `useTranslations(...)` + `t(key)` model. Do NOT introduce new locale-detection paths. Do NOT use `locale === 'fr' ? … : …` ternaries in new code (CLAUDE.md §1). The audit A.5 ternary backlog stays separately tracked.

---

## F. Phase 1B build plan (file-by-file)

### F1. Decision needed BEFORE 1B starts (Dom)
- **Path A / B / C** for officer end_reason enum (see ⚠️ section). Affects: presence/absence of a migration, TS types content, END_REASONS table content, i18n key set.

### F2. Build plan — assuming Path A (5-value director-mirror, no migration)

| # | File | Change | LOC est. |
|---|---|---|---|
| 1 | `lib/supabase/people-types.ts:30-46` | Add `OfficerEndReason` type union + `end_reason: OfficerEndReason \| null` field on `OfficerAppointment` | +8 |
| 2 | `messages/fr.json` + `messages/en.json` | Add 6 disclosure keys + 5-6 end-reason keys under both `directors` + `officers` namespaces | +30 each file |
| 3 | `components/directors/RemoveDirectorModal.tsx:24-30` | Refactor END_REASONS table from hardcoded FR/EN to `t('endReasons.…')`-driven | ~10 (net) |
| 4 | `components/officers/RemoveOfficerModal.tsx` | Add `endReason` state + END_REASONS table (t-driven) + select UI; extend update at lines 58-63 to write `end_reason` | +35 |
| 5 | `components/directors/AddDirectorModal.tsx` | Add `inOffice` toggle + conditional `endDate` + `endReason` fields; extend insert at lines 92-99 to set `is_active=false` + end fields when toggled | +30 |
| 6 | `components/officers/AddOfficerModal.tsx` | Same toggle + conditional fields; **plus** title-conflict skip when `!inOffice` (lines 82-101 guard) | +40 |
| 7 | `app/[locale]/dashboard/directors/DirectorsClient.tsx:64-69` | Drop `.eq('is_active', true)`; partition client-side into `activeDirectors` + `endedDirectors` | +10 |
| 8 | `app/[locale]/dashboard/officers/OfficersClient.tsx:53-55` | Same | +10 |
| 9 | `components/directors/DirectorCard.tsx` | Add `endedMandates` prop + `<HistoryDisclosure>` inline block (RequirementSection chevron pattern); render ended mandates with date + end_reason label | +50 |
| 10 | `components/officers/OfficerCard.tsx` | Same | +50 |
| 11 | `app/api/registers/officers/route.ts:36-44` | Add `end_reason: m.end_reason \|\| null` to entries shape | +1 |
| 12 | `components/minute-book/BinderView.tsx:89-93` | Add Fin column (+ optional Motif column for parity with directors) | +5 |

**Total est:** ~280 LOC across 12 files, no migration (under Path A).

### F3. Build plan — additional under Path B (trimmed enum)

| # | File | Change |
|---|---|---|
| 0a | `supabase/migrations/20260522HHMMSS_phase1_officer_end_reason_retrim.sql` | Pre-flight `SELECT DISTINCT end_reason FROM officer_appointments` — confirms empty. Then DROP CHECK + ADD CHECK with new value list, per `20260511140949` `DO $$` precedent. |
| 0b | `npx supabase db push` | Apply migration via the locked CLI-direct deploy capability. |

Plus all 12 items from F2 with value-name swaps in END_REASONS tables + i18n keys.

### F4. Build plan — additional under Path C (additive `position_eliminated` only)

Same as F2 + a 1-line migration adding `position_eliminated` to existing CHECK via DROP + ADD pattern. END_REASONS tables: keep 5 director values, add 6th value for officer.

---

## F-recommendation. ONE bundle vs SPLIT?

**Recommendation: SPLIT into Phase 1B-capture + Phase 1B-view.**

**Reasoning:**
- **Surface area:** 280 LOC across 12 files. WA #11 per-edit discipline + WA #18 STOP gates make a single 12-file bundle painful and easy to derail.
- **Natural seam:** Capture (TS types + 4 modals + END_REASONS i18n) ships independently of View (Clients + Cards + BinderView). A user can add a former director via the "Toujours en poste?" toggle even without the history disclosure UI to view it later — but they CAN immediately confirm via the existing director "Aussi" line going away (deactivated = not in the active list).
- **Visual gate:** Capture work is mostly modal flows (dev-only visual gate; doesn't change the default load surface). View work is the default surface change (the disclosure toggle changes every card render). Bundling them risks one bundle's visual regressions masking the other's.
- **Risk isolation:** Capture has one subtle interaction risk (officer title-conflict skip when `!inOffice`). View has the partition-and-render correctness risk + BinderView column-add. Splitting isolates failure modes.

**Proposed sequence:**
- **Phase 1B-capture** (items 1-6 + 11 from F2): TS types, JSON i18n, both Add modals, RemoveOfficerModal, RemoveDirectorModal refactor, officers register API end_reason passthrough. One bundle; commit + deploy.
- **Phase 1B-view** (items 7-10 + 12): DirectorsClient/OfficersClient filter drop, both Cards' inline disclosure, BinderView Fin column. One bundle; commit + deploy.

If Dom prefers one bundle for cohesion: it's feasible but I'd push back on per-edit-approval grounds.

---

## F-surprises. Risks + flags

1. **The officer end_reason "missing column" memory was wrong.** Confirmed above. Dom must pick Path A/B/C before 1B starts.
2. **Title-conflict logic in AddOfficerModal needs a `!inOffice` skip** (subtle but mandatory). Adding a former officer should not trigger the "this role is already taken" prompt because a non-active appointment is irrelevant to current-state conflict.
3. **`incorporationDate` default for appointmentDate** (audit A.3 — FOLLOW-UP, Dom override) still applies in both Add modals; do NOT fix incidentally in Phase 1B (separate Tier 1 follow-up).
4. **Activity-log events for ended-at-capture entries** — should the `director_added` / `officer_added` event also emit a `…_removed` event for the same row, since the row is both born and ended in the same action? Recommendation: NO — keep one event with `{ ended: true, end_reason, end_date }` metadata. Cleaner; doesn't pollute the activity timeline.
5. **`OfficersClient.tsx` Officer Edit `onEdit` opens AddOfficerModal** (audit A.2; interim hide shipped `34227a3`). Phase 1B-view should NOT re-enable the Edit affordance; that's a separate convergence ticket (NEXT-BUNDLE per audit).
6. **Q-EDIT-DIR-1 hidden Edit guard** (DirectorCard.tsx:156-165) stays hidden; Phase 1B doesn't touch it.
7. **`useState` lazy initializer pattern in RequirementSection** has a subtle gotcha — runs once on mount, doesn't re-evaluate when props change. For Phase 1B disclosure, default-collapsed is fine; if Dom wants "auto-expand when ended count > 0", use a regular initial value instead of lazy.
8. **Atom-3 entanglement: NONE found.** Director + Officer surfaces are wholly atom-3-independent. ✅
9. **BinderView i18n debt** — adding Fin column in hardcoded FR matches the file's existing pattern; do NOT scope-creep into the A.5 bilingual sweep. Flag and move on.
10. **No reusable Modal primitive** (Queue Tier 3 #73) — the AddDirectorModal + AddOfficerModal toggle additions re-implement the same toggle JSX twice. Tolerable for Phase 1B; flagged.

---

## Summary

- **Preflight PASS.** Both surfaces ACTIVE + critical path. Atom-3 independent. ✅
- **One major memory correction:** `officer_appointments.end_reason` column already exists (5-value enum, mirror of director). Phase 1's officer end_reason work is pipeline plumbing, not schema work — UNLESS Dom picks Path B (trimmed enum) which requires a CHECK-constraint migration.
- **Decision needed before Phase 1B starts:** Path A / B / C for officer end_reason enum shape.
- **Build size:** ~280 LOC, 12 files (Path A) — recommend SPLIT into Phase 1B-capture + Phase 1B-view.
- **Two subtle build risks:** title-conflict skip when `!inOffice`; client-side partition correctness for active/ended.
- **i18n debt + Edit-modal convergence** stay tracked separately — do NOT scope-creep Phase 1B.

**STOP. Phase 1B build brief follows separately after Dom Path A/B/C decision + bundle-split greenlight.**
