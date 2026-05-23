# Phase 1B-CAPTURE — Readiness Audit (Investigation Only)

**Date:** 2026-05-23
**Author:** Claude Code (investigation pass — no production edits)
**BASE commit:** `e16a34f` — *feat(people): Phase 1 view — director/officer history + former-people sections*
**HEAD verified:** `git log -1 --oneline HEAD` → `e16a34f`
**Memory line-up:** v3.56 (post-banking)
**Critical path:** Administrateurs (Phase 10F) + Dirigeants (Phase 10G) both ACTIVE per `docs/feature-lifecycle.md` lines 59–60.
**Mode:** READ-ONLY. No code edits. No commits. No migrations.

---

## 0. Scope recap (from brief)

Build (NOT covered here, but informs investigation) will add:

1. **"Toujours en poste?" toggle** in `AddDirectorModal` + `AddOfficerModal` — retroactive entries set `is_active=false, end_date, end_reason` at insert time.
2. **Officer `end_reason` capture** in `RemoveOfficerModal` (column already exists per LOCK-3; just plumbing).
3. **Former-entry EDIT modal** (per person → grouped mandates/appointments) — new component(s) with SOFT-DELETE checkbox.
4. **Start-date display + officer titles** in former sections.
5. **Director-remove i18n tidy** — replace hardcoded `END_REASONS` array with `t('endReasons.*')`.
6. **Title-conflict skip safeguard** in `AddOfficerModal` — uniqueness check must be skipped when the retroactive toggle is OFF (so retro-adding a former CEO doesn't block the sitting CEO).
7. **Retroactive activity-log policy** — should retroactive adds log? If yes, what shape?

This document closes 9 investigation tasks to confirm the above is implementable without surprises.

---

## 1. Former-section render mechanics (Task 1)

### Director former section — `app/[locale]/dashboard/directors/DirectorsClient.tsx`

- **Lines 73–82:** Single query fetches ALL mandates (no `is_active` filter), then partitions client-side.
- **Lines 113–129:** `formerDirectors` derivation — reduce-to-Record grouped by `person_id`, filtered against `activePersonIdSet` (so people with any active mandate are excluded from the former section entirely).
- **Lines 256–290:** Render loop — for each former person, renders `person.full_name` + per-mandate `t('formerDirector')` label + `t('endedOn', { date: formatDate(m.end_date) })` + `t(\`endReasons.${m.end_reason}\`)` chip.
- **Missing field for 1B-CAPTURE:** `m.appointment_date` is NOT rendered. The mandate object is in scope at line 271 — adding `t('startedOn', { date: formatDate(m.appointment_date, locale) })` is a one-line addition.

### Officer former section — `app/[locale]/dashboard/officers/OfficersClient.tsx`

- **Lines 62–69:** Same partition pattern.
- **Lines 96–112:** `formerOfficers` derivation — same reduce-to-Record pattern.
- **Lines 235–273:** Same render pattern. Comment at 235–238 acknowledges the `end_reason` gap explicitly.
- **Missing fields for 1B-CAPTURE:** Both `appointment_date` AND officer `title` (with `custom_title` fallback) are NOT rendered. The appointment object `a` is in scope. Title derivation must mirror `OfficerCard.tsx` lines 73–76 logic: enum → `TITLE_LABELS[a.title][locale]`, custom → `a.custom_title || fallback`.

### Disclosure components — `DirectorCard.tsx` + `OfficerCard.tsx`

- Both contain inline `<HistoryDisclosure>` (DirectorCard lines 156–205, OfficerCard lines 146–194). Identical pattern: `useState` lazy init, button `aria-expanded`, chevron rotation, list of ended mandates with `t('endedOn')` + `t('endReasons.*')`.
- These are read-only history displays for ACTIVE-section cards. 1B-CAPTURE does NOT need to touch them (former section is a separate render path).

---

## 2. Start-date field source of truth (Task 2)

| Table | Field | Type | Source |
|---|---|---|---|
| `director_mandates.appointment_date` | DATE NOT NULL | `migrations/20260405000000_sprint6_people_ownership.sql:40` |
| `officer_appointments.appointment_date` | DATE NOT NULL | `migrations/20260405000000_sprint6_people_ownership.sql:67` |

Both already in scope (rendered via `formatDate(*, locale)` from `lib/utils.ts`). No type changes needed.

**FR/EN labels:** New i18n keys required (none of `startedOn` / `appointedOn` exist in either namespace per Grep of `messages/fr.json`). Recommended ICU keys:

```jsonc
// directors namespace
"startedOn": "Mandat débuté le {date}"          // FR
"startedOn": "Mandate started {date}"          // EN

// officers namespace
"appointedOn": "Nommé·e le {date}"             // FR
"appointedOn": "Appointed {date}"              // EN
```

(Wording lock pending Dom's preference — these are placeholders.)

---

## 3. Officer title rendering in former section (Task 3)

### Canonical derivation pattern (`components/officers/OfficerCard.tsx:36-41, 73-76`)

```tsx
const TITLE_LABELS: Record<OfficerTitle, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  vice_president: { fr: 'Vice-président·e', en: 'Vice President' },
  secretary: { fr: 'Secrétaire', en: 'Secretary' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};
// derive:
const titleLabel = officer.title === 'custom'
  ? (officer.custom_title || t('customTitle'))
  : TITLE_LABELS[officer.title][locale];
```

### Reuse strategy

The `OFFICER_TITLE_LABELS` map at `DirectorCard.tsx:35-40` is the SAME map (used for the "Aussi…" line on directors who also hold an officer title). Three copies now exist (`OfficerCard`, `DirectorCard`, plus `api/registers/officers/route.ts:4-10` which adds a vestigial `director_general` key).

**Recommendation (Tier-3, not 1B-CAPTURE-blocking):** extract to `lib/officer-title-labels.ts` to avoid a 4th copy when former-section officer titles are added. If deferred, copy the OfficerCard map into `OfficersClient.tsx` and accept the duplication.

### Custom-title fallback note

`AddOfficerModal.tsx` lets `custom_title` be empty if `title !== 'custom'` (it gets set to `null`). Render code must defend against both `custom_title === null` AND `custom_title === ''` when `title === 'custom'`.

---

## 4. Add modal flows (Task 4)

### `components/directors/AddDirectorModal.tsx` (210 lines)

- `PersonSelector` + `appointmentDate` input (defaults to `company.incorporation_date` or today — lines 38–46).
- **Lines 92–99:** Direct client-side insert to `director_mandates` with `is_active: true`. No API route.
- **Lines 105–117:** `logActivity('director_added', 'Administrateur ajouté : {name}', ...)`.

### `components/officers/AddOfficerModal.tsx` (349 lines)

- `PersonSelector` + `title` (enum) + `customTitle` + `isSigningAuthority` + `appointmentDate`.
- **🚧 SAFEGUARD 1 location — lines 82–101:** Active-title-uniqueness check:
  ```ts
  const { data: existing } = await supabase
    .from('officer_appointments')
    .select('id')
    .eq('company_id', companyId)
    .eq('title', title)
    .eq('is_active', true)
    .limit(1);
  if (existing && existing.length > 0) { /* surface Replace conflict */ }
  ```
  **For 1B-CAPTURE:** When the "Toujours en poste?" toggle is OFF (retroactive entry), this check MUST be skipped. Otherwise retro-adding a former CEO will be blocked by the sitting CEO. Skip is locale-safe (no UI string change, just an `if (toggleIsOn) { ...check... }` guard).
- **Lines 141–152:** Insert to `officer_appointments` with `is_active: true`.
- **Lines 167–177:** `logActivity('officer_added', 'Dirigeant nommé : {name} — {title}', ...)`.
- `titleFrMap` at 157–163 includes a vestigial `director_general` key (not in the enum CHECK constraint, only used for register output).

### What the toggle changes

When "Toujours en poste?" is OFF:
- Render `endDate` (default today) + `endReason` select (using `t('endReasons.*')` shared keys).
- Insert with `is_active: false, end_date, end_reason`.
- Skip officer title-uniqueness check.
- Activity-log shape decision deferred to Task 7 below.

---

## 5. Remove modal flows + i18n keys (Task 5)

### `components/directors/RemoveDirectorModal.tsx` (185 lines)

- **🚧 LINES 24–30: hardcoded END_REASONS array** with FR/EN labels — NOT using `t('endReasons.*')` despite identical keys existing at `messages/fr.json:303-313`. **Planned tidy for 1B-CAPTURE.**
- **Lines 55–64:** Update `director_mandates` SET `is_active: false, end_date, end_reason` WHERE `id`.
- **Lines 68–76:** `logActivity('director_removed', ...)`.

### `components/officers/RemoveOfficerModal.tsx` (175 lines)

- **🚧 LINES 58–63: does NOT capture end_reason** — only sets `is_active: false, end_date`. Column exists per LOCK-3 (`migrations/20260511001738_phase10a_low_risk_additive.sql:17-19`) — pure plumbing add.
- **Lines 80–89:** `logActivity('officer_removed', ...)` with `{ person_id, title }` details.

### i18n keys (Grep of `messages/fr.json`)

| Namespace | Key | Exists? |
|---|---|---|
| `directors` | `endReasons.{resignation,revocation,death,disqualification,term_expired}` | ✅ lines 305–311 |
| `directors` | `endReason` (label) | ✅ line 297 |
| `directors` | `endDate` | ✅ line 298 |
| `officers` | `endReasons.{...}` | ✅ lines 340–346 (mirror) |
| `officers` | `endDate` | ✅ line 333 |
| `officers` | **`endReason` (top-level label)** | ❌ **MISSING** — must be added for RemoveOfficerModal |
| both | `startedOn` / `appointedOn` | ❌ MISSING — see Task 2 |
| both | `keepInPosition` / `stillInPosition` (toggle label) | ❌ MISSING — new |
| both | `softDelete` / `softDeleteHelp` (edit modal checkbox) | ❌ MISSING — new |

**EN parity required for all new keys** (CLAUDE.md §1 — bilingual at launch).
**FR plurals (`=0` clause):** none of the new strings need plurals as drafted.

### `components/officers/ReplaceOfficerModal.tsx` — second consumer

Lines 109–117 also do `update({ is_active: false, end_date })` WITHOUT `end_reason`. Once Phase 1B-CAPTURE adds end_reason to RemoveOfficerModal, ReplaceOfficerModal becomes the next gap. Recommend addressing in the same bundle (set `end_reason: 'term_expired'` as default for replace, or surface select).

---

## 6. Edit machinery audit (Task 6)

### Confirmed absent

`Glob` of `components/{directors,officers}/Edit*.tsx` → **No files found.**

Full list of components in scope:
```
components/directors/AddDirectorModal.tsx
components/directors/DirectorCard.tsx
components/directors/RemoveDirectorModal.tsx
components/officers/AddOfficerModal.tsx
components/officers/OfficerCard.tsx
components/officers/RemoveOfficerModal.tsx
components/officers/ReplaceOfficerModal.tsx
```

No edit modal exists for either mandate or appointment rows. Both `DirectorCard:147` and `OfficerCard:148` have edit buttons hidden via `{false && (...)}` (Q-EDIT-DIR-1 hotfix per memory v3.55 §8.34).

### Closest reusable pattern

The Remove modal's UPDATE call (`RemoveDirectorModal:55-64`, `RemoveOfficerModal:58-63`) is the closest precedent for client-side row mutation by `id`. The new EditFormerEntryModal would:

- Accept a `mandates[]` (or `appointments[]`) array for one person_id.
- Render an editable form per row (`appointment_date`, `end_date`, `end_reason`, plus for officers: `title`, `custom_title`).
- SOFT-DELETE checkbox per row → triggers `deleted_at` set (see Task 8).
- Save: batched `update()` calls per row by `id`, or `upsert()` if simpler.
- Activity-log: one event per modified row? Or aggregated? Open question — defer to Dom.

**Build cost estimate (informational):** ~250–350 LOC per modal mirroring AddOfficerModal complexity, plus the EditFormerPersonModal wrapper that takes a person + dispatches to director/officer sub-forms. Two surfaces (DirectorsClient + OfficersClient) need new mount points.

---

## 7. Activity-log firing (Task 7)

### Helper shape — `lib/activity-log.ts` (26 lines, full file)

```ts
logActivity(
  supabase,        // SupabaseClient
  companyId,       // string
  userId,          // string
  eventType,       // string (free-form key)
  titleFr,         // string
  titleEn,         // string
  details?         // Record<string, any> — defaults to {}
)
// → inserts to activity_log:
//   { company_id, user_id, event_type, title_fr, title_en, details }
// Try/catch: never blocks main action on log failure.
```

### Event types currently emitted by these flows

- `director_added` (AddDirectorModal:105) — `'Administrateur ajouté : {name}'`
- `director_removed` (RemoveDirectorModal:68) — `'Administrateur retiré : {name}'`
- `officer_added` (AddOfficerModal:167) — `'Dirigeant nommé : {name} — {title}'`
- `officer_removed` (RemoveOfficerModal:80) — `'Dirigeant retiré : {name} — {title}'`

### Retroactive entry — recommended policy (for Dom's confirmation)

Two options, both schema-safe:

**Option A — Reuse `_added` event with `details.ended=true`:**
```ts
logActivity(s, cid, uid, 'director_added',
  `Administrateur ajouté (rétroactif) : ${name}`,
  `Director added (retroactive): ${name}`,
  { ended: true, end_date, end_reason, retroactive: true });
```
Pros: no new event type, downstream consumers see one row in the binder narrative.
Cons: a single audit row asserts both "appointed" and "ended" — readers must inspect `details`.

**Option B — Emit TWO events: `_added` then `_removed`:**
Mirrors the live lifecycle and lets the Livre tab narrate "Jean was appointed on YYYY-MM-DD; ended on YYYY-MM-DD" cleanly.
Cons: misrepresents the user's actual action timeline (two events fired at one keystroke).

**Recommendation: Option A** — preserves user-action fidelity, no schema change, downstream Livre tab queries `details.ended` to decide narrative shape. Confirm with Dom before build.

### Edit-from-former-modal events

New event types likely needed: `director_edited`, `officer_edited`, plus `director_soft_deleted`, `officer_soft_deleted`. Generic logger supports them with no code change.

---

## 8. Schema decision — SOFT-DELETE column (Task 8)

### 8a. Current column lists (verified from migrations)

**`director_mandates`** — `20260405000000_sprint6_people_ownership.sql:36-45`:
```sql
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE
appointment_date DATE NOT NULL
end_date DATE
end_reason TEXT CHECK (end_reason IN ('resignation','revocation','death','disqualification','term_expired'))
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ DEFAULT NOW()
```
Indexes: `(company_id)`, `(person_id)`, `(company_id, is_active)`. RLS via `companies.user_id`.

**`officer_appointments`** — `20260405000000_sprint6_people_ownership.sql:60-71` + LOCK-3 additive `20260511001738_phase10a_low_risk_additive.sql:17-19`:
```sql
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE
title TEXT NOT NULL CHECK (title IN ('president','secretary','treasurer','vice_president','custom'))
custom_title TEXT
is_primary_signing_authority BOOLEAN DEFAULT FALSE
appointment_date DATE NOT NULL
end_date DATE
end_reason TEXT CHECK (end_reason IN ('resignation','revocation','term_expired','death','disqualification'))  -- LOCK-3
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ DEFAULT NOW()
```
Indexes: `(company_id)`, `(person_id)`. RLS via `companies.user_id`. **No `(company_id, is_active)` composite index** (sibling director table has one — minor inconsistency, out of 1B-CAPTURE scope).

### 8b. Existing soft-delete convention

**Grep result:** NO existing soft-delete column on either table. The 5 `soft.?delete` hits are:
- `scripts/seed-canonical-fixture.mjs` — test fixture only.
- `docs/audit-phase10a-temporal-registry-schema-2026-05-10.md`, `schema-drift-audit`, `livre-de-minutes-investigation` — docs only (proposing the concept).
- `supabase/migrations/20260508210425_create_company_fiscal_years.sql` — different table (`company_fiscal_years.deleted_at`).

**Conclusion:** the new column would be the **FIRST soft-delete on either people table**. The fiscal-years migration establishes the convention: `deleted_at TIMESTAMPTZ NULL`.

### 8c. Recommended column

```sql
-- Both tables, additive nullable, mirrors company_fiscal_years convention
ALTER TABLE director_mandates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE officer_appointments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
```

**Why `TIMESTAMPTZ` not `BOOLEAN`:**
- Audit trail — `deleted_at` answers "when?" not just "is it gone?"
- Idempotent (`IS NULL` filters are unambiguous; double-soft-delete just overwrites).
- Matches fiscal-years precedent.

**App-layer convention (REQUIRED to prevent leaks — see 8d):**
```
When soft-deleting:
  UPDATE ... SET deleted_at = NOW(), is_active = false WHERE id = ?
```
Setting `is_active = false` simultaneously means existing `.eq('is_active', true)` filters across the codebase automatically exclude soft-deleted rows from active-state consumers. Only the former-section partitioning + registers API need new `.is('deleted_at', null)` filters.

**Optional index (defer to actual perf data):**
```sql
CREATE INDEX IF NOT EXISTS idx_director_mandates_deleted_at
  ON director_mandates(company_id, deleted_at);
```

### 8d. Leak enumeration — every consumer

| # | File | Query | Filter today | Leak class (no app-layer changes) | Required change |
|---|---|---|---|---|---|
| 1 | `DirectorsClient.tsx:79` | `from('director_mandates')` | none | **LEAKS to former section** (active partition is safe via `is_active=true` filter on output) | Add `.is('deleted_at', null)` OR filter formerDirectors derivation |
| 2 | `OfficersClient.tsx:62-69` | `from('officer_appointments')` | none | **LEAKS to former section** | Same |
| 3 | `api/registers/directors/route.ts:21-22` | `from('company_people').select('*, director_mandates(*)')` | none | **LEAKS to register PDF + BinderView** | Filter at flatMap (`.filter(m => !m.deleted_at)`) or in nested select |
| 4 | `api/registers/officers/route.ts:29-30` | Same shape | none | **LEAKS to register PDF + BinderView** | Same |
| 5 | `api/documents/signatories/route.ts:48-52` | `from('director_mandates').select('person_id')` | `is_active=true` | Safe IF app-layer sets `is_active=false` on soft-delete | None (if app-layer convention followed) |
| 6 | `lib/pdf/generatePdfDocument.ts:172-176` | `from('director_mandates')` | `is_active=true` | Safe IF app-layer convention followed | None |
| 7 | `ShareholdersClient.tsx:79-85` | both tables | `is_active=true` | Safe IF app-layer convention followed | None |
| 8 | `OnboardingFlow.tsx:134, 248` | INSERT both tables | n/a | Safe (writes only) | None |
| 9 | `AddOfficerModal.tsx:82-101` (SAFEGUARD 1) | `from('officer_appointments').select('id')` | `title=?, is_active=true` | Safe IF app-layer convention followed | None |
| 10 | `AddDirectorModal.tsx:92-99` | INSERT | n/a | Safe | None |
| 11 | `AddOfficerModal.tsx:141-152` | INSERT | n/a | Safe | None |
| 12 | `RemoveDirectorModal.tsx:55-64` | UPDATE by id | n/a | UI shouldn't surface soft-deleted rows to remove | None (gated by render filter) |
| 13 | `RemoveOfficerModal.tsx:58-63` | UPDATE by id | n/a | Same | None |
| 14 | `ReplaceOfficerModal.tsx:109-130` | UPDATE outgoing + INSERT new | n/a | Operates on already-loaded officer prop | None |
| 15 | `BinderView.tsx:29-30` | fetches `/api/registers/{directors,officers}` | inherits #3, #4 | LEAKS via API | Fix in registers API (#3, #4) |

**Net required app-layer changes for soft-delete launch:** 4 sites (rows 1, 2, 3, 4 above). Three are former-section render paths; one is the binder register API. All others are protected by the existing `is_active=true` filter IF the app-layer convention "soft-delete sets BOTH `deleted_at` AND `is_active=false`" is followed.

### 8e. RLS posture

No new RLS policies required — `deleted_at` is just a regular column under existing per-company RLS. The "soft" semantic is purely app-layer.

---

## 9. Surprises / risks / footguns (Task 9)

### 9.1. `ReplaceOfficerModal` ALSO drops `end_reason` (lines 109–117)

Not just `RemoveOfficerModal`. Recommend the 1B-CAPTURE bundle plumb `end_reason` here too (default to `'term_expired'` for a replace gesture, or surface a select). Otherwise we ship Phase 1B-CAPTURE and immediately have a known second consumer producing `NULL end_reason` rows — same data-integrity class as the current officer issue.

### 9.2. `OfficersClient` Add modal misuses `onEdit` (line 203)

`OfficerCard`'s `onEdit` callback is wired to `setShowAddModal(true)` — clicking edit (if it weren't hidden) would open the Add modal, not an edit form. The Q-EDIT-DIR-1 `{false && ...}` guard hides this for now. When the EDIT modal lands, this wiring needs `setShowEditModal(officer)` semantics. Minor refactor, not a blocker.

### 9.3. `OFFICER_TITLE_LABELS` duplicated in 3 files (becoming 4)

`DirectorCard.tsx:35-40`, `OfficerCard.tsx:36-41`, `api/registers/officers/route.ts:4-10` (with vestigial `director_general` key). Adding officer-title display to former section creates a 4th copy unless extracted to `lib/officer-title-labels.ts`. Tier-3 — defer is acceptable.

### 9.4. Title-uniqueness CHECK in AddOfficerModal does NOT match DB enum

The modal allows `custom` title. SAFEGUARD 1 (lines 82–101) queries `.eq('title', title)` for uniqueness. If a user retro-adds two "custom / Comptroller" officers, the uniqueness check passes for them (title=`custom`) but two active customs with the same `custom_title` would be a logical collision the DB does not enforce. Out of 1B-CAPTURE scope but worth flagging — could be a future Tier-4 follow-up.

### 9.5. `companies.incorporation_date` defaulting in AddDirectorModal

`AddDirectorModal.tsx:38-46` defaults appointment_date to incorporation_date. For retroactive entries this is probably the WRONG default (user is recording a past mandate that started AFTER incorp). Recommend the toggle UI either leaves date empty when retro-mode activates, or sets default to today. Decision lock with Dom.

### 9.6. `BinderView` is FR-only in register dates rendering (Queue §15 #116)

Already on Tier-4 backlog. 1B-CAPTURE will surface `start_date` + `end_reason` chips in the FR-only binder — bilingual debt grows by one surface. Flag for awareness only.

### 9.7. Reduce-to-Record former grouping has a subtle behavior

Both `DirectorsClient:113-129` and `OfficersClient:96-112` group by `person_id`. If a person has both an active AND a former mandate, they appear ONLY in the active section (the `activePersonIdSet` filter excludes them from former). Phase 1 view shipped this intentionally. For the EDIT modal, this means an "edit former entries" gesture per person will sometimes need to surface mandates for a person who ALSO has an active mandate — the modal's data-fetch must NOT inherit the activePersonIdSet exclusion. Build-time concern.

### 9.8. `is_canadian_resident` defaults TRUE (not NULL)

Migration line 20: `DEFAULT TRUE`. For retroactive entries of historical directors who may not have been Canadian residents, this default risks LSAQ-110 / CBCA-105 compliance noise. Not a 1B-CAPTURE blocker — PersonSelector already exposes the toggle — but reviewers should double-check the default-true cascade for new retroactive entries.

### 9.9. `AddOfficerModal` SAFEGUARD 1 query path

Lines 82–101 only check `title=?` for active uniqueness. For `title='custom'`, this means at most ONE active custom officer can exist company-wide — which conflicts with the model that custom titles are free-form (e.g., "Treasurer Assistant" vs "Comptroller"). Out of scope but the SAFEGUARD 1 skip-when-retroactive change might be a good moment to also exclude `'custom'` from the uniqueness check entirely.

### 9.10. No EditDirectorMandate / EditOfficerAppointment API route exists

All current mutations are client-side direct Supabase calls. The EditFormerEntry build will follow this pattern (consistent), but it means RLS is the only defense — there is no server-side validation layer to enforce "soft-deleted rows cannot be revived". App-layer convention only.

---

## Open questions for Dom (must lock before build)

1. **Retroactive activity-log shape:** Option A (single `_added` event with `details.ended=true`) or Option B (two events)? Recommendation: A.
2. **EditFormerEntryModal scope:** per-person wrapper that dispatches to director/officer sub-forms, OR two separate modals? Affects mount points in DirectorsClient + OfficersClient.
3. **Soft-delete UX language:** "Supprimer définitivement" vs "Effacer de l'historique" vs "Masquer" — what's the user-facing mental model? Affects EN parity.
4. **Should `ReplaceOfficerModal` also gain `end_reason` plumbing in the same bundle?** (#9.1 above)
5. **Retroactive AddDirectorModal default appointment_date:** today, empty, or keep incorporation_date? (#9.5 above)
6. **EditFormerEntryModal — does title change for officers count as a new appointment or an amendment of existing?** Schema treats title as an attribute of the row; allowing title edit is a one-line UPDATE. Legal/audit perspective may demand "end old, insert new" semantics instead.
7. **Should `endReasons.term_expired` default be applied to legacy NULL officer rows on a one-time backfill?** Not a 1B-CAPTURE deliverable, but the data-integrity class will persist for existing rows.

---

## Sign-off readiness

**Build is unblocked once:**
- Open questions 1–5 are answered (questions 6–7 can be deferred).
- Dom greenlights the soft-delete column name `deleted_at TIMESTAMPTZ NULL` + app-layer convention.
- i18n key wording locked for the new keys listed in Task 5.

**No further investigation recommended before build.** All schema, column, leak, and i18n surfaces have been traced.

---

*End of audit.*
