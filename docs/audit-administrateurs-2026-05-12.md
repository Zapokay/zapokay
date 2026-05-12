# Administrateurs Surface Audit

**Date:** 2026-05-12
**Author:** CC (per Phase A.1 brief)
**Phase:** Pre-launch screen audit — 7th of 9 surfaces (Queue.md §19 sequence)
**Scope:** Catalogue every code path on the Administrateurs surface (route, listing client, modals, register API, document generators that consume director data). Validate data surface, root-cause Q-EDIT-DIR-1, check Aria v2.5/v2.5.1 + bilingual + legal-capacity conformance, and bucket findings.
**Mode:** Investigation-only. Zero code changes. Zero migrations. Zero commits.

---

## §0 — Pre-flight (per CLAUDE.md Critical-Path Justification convention)

- **`docs/feature-lifecycle.md` consulted:** YES.
- **Administrateurs status in tracker:** `_TBD_` (column not yet filled in by Dom).
- **Decision to proceed:** The TBD value is not on the explicit STOP list (DEPRECATED / VESTIGIAL / UNCERTAIN). The tracker's "Current north star" section explicitly names Administrateurs as critical-path for Phase 10F/10G temporal-registry UX, and the Phase A.1 brief names it as the NEXT TARGET in the 9-surface pre-launch sequence. Proceeding on that combined evidence, with the TBD flagged for §7.
- **Audit-doc convention reference:** `docs/audit-rg1-shareholdings-consumers-2026-05-11.md` — heading depth, finding-annotation style, methodology-bank cross-references mirrored here.

---

## §1 — Inventory

### Routes

| Path | Role |
|---|---|
| `app/[locale]/dashboard/directors/page.tsx:6` | Server component. Auth gate, profile load, company load (single active company), renders `DashboardShell` + `DirectorsClient`. |
| `app/api/registers/directors/route.ts:4` | GET. Returns statutory Director Register payload (full-history, no `is_active` filter at handler level). |

### Client components

| Path | Role |
|---|---|
| `app/[locale]/dashboard/directors/DirectorsClient.tsx:27` | Listing client. Holds `directors`, `officerAppointments`, `shareholdings`, `editingDirector`, `removingDirector`, `showAddModal` state. Renders card grid + summary bar + add/remove modals. |
| `components/directors/DirectorCard.tsx:58` | Single director card. Avatar, name, appointment date, location, Canadian-resident badge, "Aussi :" line (officer titles + shareholding summary), Edit + Remove buttons. |
| `components/directors/AddDirectorModal.tsx:29` | Add-director modal. PersonSelector + appointment date. Writes a single `director_mandates` INSERT, optionally preceded by a `company_people` INSERT when PersonSelector is in "new" mode. **Implements INSERT only; has no `editingDirector` or `director` prop and no UPDATE path.** |
| `components/directors/RemoveDirectorModal.tsx:36` | Remove-director modal. Captures `end_date` + `end_reason`, UPDATEs `director_mandates` to `is_active = false` with the captured values. |
| `components/people/PersonSelector.tsx:1` | Shared PersonSelector primitive (consumed by Add Director, Add Officer, Issue Shares, Replace Officer modals). The "new" mode (line 26) **does not include a `citizenship` field** (residency only). |

### API routes

| Path | Role |
|---|---|
| `app/api/registers/directors/route.ts:4` | GET — auth, fetch company, nested-embed `company_people` → `director_mandates`, flatten + sort (active first, then most recent), return register payload. |

No `/api/directors/*` create/update/delete routes — all writes happen client-side via the Supabase client inside the modals.

### Type definitions

| Path | Symbol | Notes |
|---|---|---|
| `lib/supabase/people-types.ts:8` | `CompanyPerson` | **Missing `citizenship` field** added in commit `09dcf11` (Phase 10A atom 1, LOCK-5). TypeScript drift. See §2 + §7. |
| `lib/supabase/people-types.ts:37` | `DirectorMandate` | Includes `end_date`, `end_reason`, `is_active`. Schema aligns. |
| `lib/supabase/people-types.ts:128` | `DirectorWithPerson extends DirectorMandate` | Used as the canonical director shape in the surface. |

### Hooks / utilities imported

- `@/lib/supabase/client` — Supabase browser client.
- `@/lib/supabase/server` — server client used by page + register route.
- `next-intl` `useTranslations` — used by Client + Card + Add modal + Remove modal.
- `@/lib/activity-log` `logActivity` — called from Add modal (`director_added`) and Remove modal (`director_removed`).
- `@/components/people/PersonSelector` — Add modal only.
- `@/components/ui/LegalTerm` — used in DirectorsClient for `administrateur` + `resident_canadien` terms.
- `@/components/dashboard/DashboardShell` — server-side shell wrapping the client.

### Document generators that consume director data

Dual-pass grep against `lib/pdf/`:

| Path | Line | Read |
|---|---|---|
| `lib/pdf/generatePdfDocument.ts:173` | direct | `from('director_mandates').select('*, person:company_people(*)').eq('company_id', cid)` — confirmed via grep result. |

`lib/pdf-templates/` contains zero direct reads against `director_mandates` (grep clean). Same hub-and-spoke pattern as the rg1 audit: a single generator-side fetch in `generatePdfDocument.ts` feeds the document-type templates downstream.

### Dual-pass grep methodology (per §8.X from rg1 audit)

- **Pass 1 — direct `from('director_mandates')`:** 11 hits in app/lib/components (excluding `sprint6.sh` historical bundle):
  - `lib/pdf/generatePdfDocument.ts:173`
  - `scripts/seed-canonical-fixture.mjs:304`
  - `components/onboarding/OnboardingFlow.tsx:134`
  - `app/[locale]/dashboard/officers/OfficersClient.tsx:58` (cross-surface reader)
  - `components/directors/RemoveDirectorModal.tsx:56`
  - `components/directors/AddDirectorModal.tsx:93`
  - `app/[locale]/dashboard/directors/DirectorsClient.tsx:65`
  - `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:65` (cross-surface reader)
  - `app/api/documents/signatories/route.ts:49`
- **Pass 2 — nested embed `director_mandates(`:** 1 additional hit only:
  - `app/api/registers/directors/route.ts:22` — `from('company_people').select('*, director_mandates(*)')` (the Director Register payload).

Pass 2 caught the register-route nested embed, matching the §8.X hidden-consumer pattern from the rg1 audit. Recommend continued use of dual-pass when director_mandates eventually gets the LOCK-2 `end_date`/`is_active` treatment.

---

## §2 — Data surface

### Tables read on this surface

| Table | Site | Columns / shape | Context |
|---|---|---|---|
| `users` | `app/[locale]/dashboard/directors/page.tsx:11` | `*` | Onboarding-complete gate. |
| `companies` | `page.tsx:14` | `*` (filtered by `user_id` + `status='active'`) | Hydrate company for shell. |
| `companies` | `DirectorsClient.tsx:50-55` | `id, incorporation_date, incorporation_type` | Drive UI (jurisdiction = CBCA gate, default appointment date). |
| `director_mandates` | `DirectorsClient.tsx:64-69` | `*, person:company_people(*)` filtered `is_active=true`, ordered `appointment_date asc` | Card grid source. |
| `officer_appointments` | `DirectorsClient.tsx:73-74` | `*` filtered `is_active=true` | "Aussi :" officer-title roles in DirectorCard. |
| `shareholdings` | `DirectorsClient.tsx:77-78` | `*, share_class:share_classes(*)` filtered `end_date IS NULL` | "Aussi :" shareholding summary in DirectorCard. **Post-Phase-10A-Atom-4: `.is('end_date', null)` already applied (commit `18578f8`).** ✓ |
| `company_people` (nested) | `app/api/registers/directors/route.ts:21-22` | `*, director_mandates(*)` | Register-payload nested embed. No filter; returns full history. |

### Tables written on this surface

| Table | Site | Op |
|---|---|---|
| `company_people` | `AddDirectorModal.tsx:67-81` | INSERT (only when PersonSelector mode='new') |
| `director_mandates` | `AddDirectorModal.tsx:92-99` | INSERT (`is_active=true`) |
| `director_mandates` | `RemoveDirectorModal.tsx:55-62` | UPDATE (set `is_active=false`, capture `end_date`, `end_reason`) |

No table is written via the listing client itself; all mutations route through modals.

### `company_people.citizenship` (added Phase 10A atom 1, commit `09dcf11`, LOCK-5)

- **Displayed on this surface:** NO. DirectorCard renders `is_canadian_resident` only (lines 132-143).
- **Editable on this surface:** NO. PersonSelector's "new" mode (`components/people/PersonSelector.tsx:25-36`) collects `isCanadianResident` but not `citizenship`. AddDirectorModal's INSERT at `company_people` (lines 67-81) omits `citizenship`.
- **Per Sprint 10 phasing** (`docs/sprint-10-phase-decomposition-2026-05-07.md:170`): UX for `citizenship` is owned by **Phase 10F** (S10-TR-9 — "Conditional citizenship field on Add Director modal"). Schema landed in atom 1; UX has not landed. Expected gap.
- **TypeScript drift:** `CompanyPerson` interface in `lib/supabase/people-types.ts:8-22` does not list `citizenship`. Anything that wants to read/write it from TS will require type extension. Flag in §7.

### `director_mandates` table — temporal posture

- The listing client filters `is_active=true` (`DirectorsClient.tsx:68`). This is the pre-Phase-10A-Atom-4 idiom (Atom 4 has shipped for `shareholdings` only per commit `18578f8`, not yet for `director_mandates`).
- The register route does **not** filter, returning the full history (matching the §5 caller-evidence resolution pattern from the rg1 audit for statutory registers).
- When `director_mandates` eventually gets the LOCK-2 `end_date IS NULL` SELECT-side treatment (analogous to Phase 10A Atom 4 for shareholdings), the listing-client read at line 68 will need re-audit. For today it is correct: `is_active=false` rows from removal already carry `end_date` per RemoveDirectorModal's update payload, and `is_active=true` is a faithful current-state filter.

### FK / RLS posture (post-Phase-10A)

- `director_mandates` was not touched by atoms 1–4 (`09dcf11`, `3e65770`, `3cb08c4`, `22aad9a`, `18578f8`). Atom 2 reset only `shareholdings` FKs from CASCADE to RESTRICT. No post-Phase-10A change affects this surface's FK posture.
- RLS confirmed by inspection of `supabase/migrations/20260405000000_sprint6_people_ownership.sql:36-55` (table create) and `20260508120000_complete_sprint6_people_ownership.sql:49-53` (indexes). Atom 4's RLS work was scoped to `share_transfers` (LOCK-9). `director_mandates` RLS is untouched in Phase 10A.

### LSAQ vocabulary confusion risk: `officer_appointments` vs `director_mandates`

`officer_appointments` was touched by atom 1 (`09dcf11`) — gained an `end_reason` column. The Administrateurs surface reads `officer_appointments` cross-surface (DirectorsClient.tsx:73-74) to compose the "Aussi :" line in DirectorCard. This read filters `is_active=true` and only consumes `title` + `custom_title` — no risk of confusing it with `director_mandates`. The "Dirigeants" surface lives in a separate route (`app/[locale]/dashboard/officers/`) and is out of scope here per the Out-of-Scope clause in the brief.

---

## §3 — Q-EDIT-DIR-1 root-cause investigation

### Trigger trace

1. **Click site:** `components/directors/DirectorCard.tsx:159-166` — the "Edit" (Pencil icon) button calls `onEdit(director)`.
2. **Parent handler:** `app/[locale]/dashboard/directors/DirectorsClient.tsx:179` — the `onEdit` callback sets `editingDirector` to the clicked director AND opens the Add modal: `onEdit={(d) => { setEditingDirector(d); setShowAddModal(true); }}`.
3. **State declaration:** `DirectorsClient.tsx:41` — `const [editingDirector, setEditingDirector] = useState<DirectorWithPerson | null>(null);`. The state exists.
4. **Modal render:** `DirectorsClient.tsx:211-219`:
   ```tsx
   {showAddModal && companyId && (
     <AddDirectorModal
       companyId={companyId}
       incorporationDate={incorporationDate}
       existingDirectorPersonIds={existingDirectorPersonIds}
       onClose={() => { setShowAddModal(false); setEditingDirector(null); }}
       onSuccess={() => { setShowAddModal(false); fetchData(); }}
     />
   )}
   ```
   **`editingDirector` is NOT passed as a prop.**
5. **Modal contract:** `components/directors/AddDirectorModal.tsx:16-23` — `AddDirectorModalProps` does not declare any `director` or `editingDirector` field. The modal has no edit-mode codepath: `handleSave` (lines 48-125) performs a `company_people` INSERT (mode='new') followed by an unconditional `director_mandates` INSERT.

### Root cause

**Q-EDIT-DIR-1 is structural, not a wiring oversight.** Three coupled deficiencies:

- (a) **No `EditDirectorModal` component exists.** Grep `EditDirector` across the repo returns hits only in `sprint6.sh` (historical install bundle) — no live React component.
- (b) **`AddDirectorModal` implements INSERT only.** It accepts no editing-target prop and has no UPDATE branch in `handleSave`.
- (c) **The `editingDirector` state in `DirectorsClient` is dead.** It is `set` at the Add button (line 138, set to null) and at the Card's onEdit (line 179, set to the clicked director), and `reset` at modal close (line 216), but **never `read`** anywhere — no child component consumes it, no JSX branch on it, no effect derives from it.

### Observed failure mode

Clicking the Edit (Pencil) button on a director card opens the Add Director modal in **create-new mode** with empty form state. If the user (a) re-selects the same existing person via PersonSelector and (b) submits, the modal will:

1. Skip the `company_people` INSERT (PersonSelector mode='existing'),
2. Run a `director_mandates` INSERT with the same `person_id` and a fresh `appointment_date`,
3. Create a **second active mandate** for the same person. The schema does not appear to constrain against duplicate active mandates (no unique index on `(company_id, person_id) WHERE is_active`, per `supabase/migrations/20260508120000_complete_sprint6_people_ownership.sql:49-53`). The next render will display two cards for the same person.

If the user does NOT change anything and clicks Save, the modal short-circuits with `errorSelectPerson` (line 50) because `personValue` was never hydrated — silent UX failure (looks like "the Edit button doesn't work").

### Classification

**NEXT BUNDLE.** This is not a 1-2-line wiring fix. It requires:

- A product decision: (i) one shared modal with mode='add'|'edit' branching, or (ii) a separate `EditDirectorModal` paralleling `RemoveDirectorModal`'s shape, or (iii) reusing `RemoveDirectorModal`'s scaffold and authoring an Edit-twin.
- A field decision: which fields are editable? `director_mandates.appointment_date` (clearly), `company_people.*` person details (open question — affects shareholder/officer surfaces too), or both?
- Scaffold work: form state hydration from `editingDirector`, UPDATE call to `director_mandates`, optional UPDATE call to `company_people`, activity-log entry for `director_edited` (new event type — not in the existing logged events).

Recommend a follow-up brief that locks the product decision before scaffold.

### Ranked candidate causes — N/A

Single-pass conclusive: the missing edit codepath is the unambiguous root cause. No competing hypotheses survive once `editingDirector` is shown to be unread.

---

## §4 — Aria v2.5 / v2.5.1 conformance

### Token usage

- **`--card-bg` usage:** Properly applied on the listing client (`DirectorsClient.tsx:116, 148`), DirectorCard (`line 97`), AddDirectorModal (`modal-surface` utility class), RemoveDirectorModal (`modal-surface` utility class). ✓
- **`--tooltip-bg` usage:** Grep returns zero hits anywhere in the repo (`messages/`, components, app). The `Info` tooltip in DirectorsClient at line 116 uses `bg-[var(--card-bg)]` rather than a tooltip-specific token. **C2 separation candidate** — if Aria v2.5.1 defines `--tooltip-bg` as separate from `--card-bg`, this surface is one of the consumers that should switch. Flag for §7 Tier 4.
- **Sidebar grouping:** Verified via `messages/fr.json:357` / `messages/en.json:357` — "directors" key is `Administrateurs` / `Directors`. Position under the correct sidebar group is owned by `components/dashboard/Sidebar.tsx` (not re-read here; out of scope for this surface-internal audit). No surface-internal anomaly.

### Modal primitive

Both Administrateurs modals roll their own scaffolds — they share a partial `modal-surface` / `modal-header` / `modal-footer` utility-class convention but each duplicates ~50 lines of identical layout:

- `AddDirectorModal.tsx:128-208` — fixed overlay + backdrop + panel + header (with X button) + body + footer.
- `RemoveDirectorModal.tsx:87-184` — same structure with different colors.

Reinforces **Tier 3 #73 / C3 opportunistic modal-primitive extraction** with two more instances on the case sheet. Recommend folding into the C3 candidate set rather than acting in this phase.

### Hardcoded tailwind color literals (Aria drift)

- `RemoveDirectorModal` is the worst offender:
  - `text-zinc-900 dark:text-zinc-100` (line 96), `text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300` (line 103), `text-zinc-600 dark:text-zinc-400` (line 111), `text-zinc-400 dark:text-zinc-500` (line 116), `text-zinc-700 dark:text-zinc-300` (lines 124, 142), `border-zinc-200 bg-white ... dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100` (lines 130, 149), `bg-red-50 ... text-red-700 dark:bg-red-900/20 dark:text-red-400` (line 155), `bg-red-500 ... hover:bg-red-600` (line 175), `text-red-500` (line 97), `bg-amber-400 hover:bg-spark-400` not used; instead `bg-red-500`.
  - This component **predates v2.5 tokens** and was not retrofitted. Tier 4.
- `AddDirectorModal` is partially retrofitted but the primary save button still uses `bg-amber-500 hover:bg-amber-600 text-white` (line 200) instead of the `bg-[var(--amber-400)] hover:bg-[var(--spark-400)] text-[var(--navy-900)]` token pattern used by the page-level Add button at `DirectorsClient.tsx:139`. Inconsistent. Tier 4.

### Coming-Soon affordances (P1, amber-200 + amber-600 dotted ring)

Grep for `amber-200`, `border-dashed`, `border-amber-600`, `dotted`: none present in this surface. **Expected absence ✓**. No "Coming Soon" features wired here.

### Numeric / diff treatments (P3)

No numeric-diff visual is used on the Administrateurs surface (no version-compare, no before/after numbers). Expected absence ✓. The CBCA 25%-residency indicator (`DirectorsClient.tsx:155-166`) uses `bg-emerald-100 text-emerald-700` (also a hardcoded tailwind color literal — see below) and `var(--error-*)` tokens for the failure state. Mixed pattern.

### Minor drift cluster

- `DirectorsClient.tsx:157` — success state uses hardcoded `bg-emerald-100 text-emerald-700` instead of `var(--success-bg)` / `var(--success-text)` tokens that exist elsewhere in the surface (DirectorCard `var(--success-text)` at line 135).
- Save button in AddDirectorModal hardcodes amber (see above).
- Tooltip uses card-bg instead of tooltip-bg (see above).

All grouped as a single Aria drift Tier 4 in §7.

---

## §5 — Bilingual / Two-Layer Language Model conformance

### Hardcoded `locale === 'fr' ? '...' : '...'` ternaries (CLAUDE.md §1 NEVER rule)

This surface has the heaviest ternary load of any surface audited in this cycle so far:

| File | Lines | Strings |
|---|---|---|
| `DirectorsClient.tsx` | 106-107 | "Conseil d'administration" / "Board of Directors" |
| `DirectorsClient.tsx` | 117-120 | Info-tooltip body (FR/EN) |
| `DirectorsClient.tsx` | 127-129 | "{n} administrateur(s) actif(s)" / "{n} active director(s)" (also a manual plural — should be ICU `plural` per CLAUDE.md §1) |
| `DirectorsClient.tsx` | 152-153 | Summary bar count line — duplicate of the heading sub-line (FR/EN, manual plurals) |
| `DirectorsClient.tsx` | 161-164 | "résident_canadien : N%" + "✔" / "— minimum 25% requis" / "— 25% minimum required" |
| `DirectorsClient.tsx` | 190-198 | Empty-state heading + paragraph (FR/EN) |
| `DirectorCard.tsx` | 85-87 | "Actionnaire (N actions)" / "Shareholder (N shares)" (manual plural also a violation) |
| `DirectorCard.tsx` | 114-116 | "Administrateur depuis le {date}" / "Director since {date}" |
| `DirectorCard.tsx` | 135-141 | "Résident canadien" / "Canadian resident" / "Non-résident" / "Non-resident" |
| `DirectorCard.tsx` | 148-151 | "Aussi" / "Also" |
| `DirectorCard.tsx` | 30-35 | `OFFICER_TITLE_LABELS` const — `{fr, en}` lookup map for officer titles. (Locally-keyed lookup pattern, not a literal ternary, but functionally identical violation.) |
| `RemoveDirectorModal.tsx` | 24-30 | `END_REASONS` const — `{fr, en}` lookup map (same pattern as above). |
| `RemoveDirectorModal.tsx` | 112-119 | Confirm body + secondary explanation (FR/EN) |

**`useTranslations('directors')` is used for some strings** (e.g. `t('addDirector')`, `t('person')`, `t('save')`, `t('remove')`, `t('endReason')`, `t('endDate')`, `t('confirmRemove')`), so the i18n infrastructure is wired — but a large fraction of user-facing copy bypasses it. Likely artifact of pre-CLAUDE.md-§1 authoring (Apr 28 lock).

**`t('_locale')` trick:** `DirectorsClient.tsx:29`, `DirectorCard.tsx:66`, `RemoveDirectorModal.tsx:42` all read locale via `t('_locale') === 'fr' ? 'fr' : 'en'` rather than `useLocale()`. The `_locale` key is presumably populated in `messages/{lang}.json` as a sentinel. Not strictly wrong — the value is locale-derived — but `useLocale()` is the idiomatic next-intl call and would survive a JSON refactor that drops the `_locale` sentinel.

### Manual plurals (CLAUDE.md §1 — FR `=0` rule)

Three sites use manual plural concatenation (`s` if `n > 1`) without ICU `=0`/`=1`/`other` clauses:

- `DirectorsClient.tsx:127-129` and `:152-153` — "${n} administrateur${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}". CLAUDE.md §1 explicitly cites the FR-singular-for-zero issue. The current code would render "0 administrateurs actifs" — wrong per FR grammar.
- `DirectorCard.tsx:85-87` — "Actionnaire (N actions)". Manual plural, no `=0` (irrelevant for the >0 path that's gated by the `totalShares > 0` check, but pattern-wise it's still a violation).

### `preferred_language` writes / `router.push` locale switches

Grep `preferred_language` in `app/[locale]/dashboard/directors/` + `components/directors/`: **zero hits**. Two-Layer separation respected on this surface. ✓

Grep `router.push` / `setLocale` / `window.location` in the same paths: zero hits. ✓

### Quebec language law sensitivity

No copy on this surface makes claims about language obligations. ✓

### Activity-log strings

`AddDirectorModal.tsx:113-114` and `RemoveDirectorModal.tsx:73-74` pass dual-language strings to `logActivity`:

```ts
'Administrateur ajouté : ${fullName}',
'Director added: ${fullName}',
```

These are stored in `activity_log` rows, not directly rendered to the UI. The activity-log convention (per `lib/activity-log.ts`, not re-read in this audit) presumably stores both and renders the locale-appropriate one at read time. This is the correct two-side pattern from CLAUDE.md §1 (API routes serving UI ship both `_fr` and `_en` fields). Not a violation. ✓

---

## §6 — Legal-capacity / signatory check

### Does this surface trigger document generation?

**NO.** The Administrateurs surface writes `director_mandates` rows and logs activity entries; it does not call into `lib/pdf/`, does not POST to `/api/documents/*`, and does not invoke a generator. The PDF pipeline at `lib/pdf/generatePdfDocument.ts:173` reads `director_mandates` as a downstream consumer, but its trigger originates from other surfaces (Documents/Coffre-fort/Minute Book), not this one.

### Signatory-role / legal-capacity verification

**N/A — no document is generated from this surface.** The data this surface writes (active director_mandates) is consumed downstream by the document pipeline; signatory-role validation lives there. Per the brief's §6 rule, marking N/A with rationale.

### Downstream coupling worth noting (for §7 ACCEPT)

When the eventual edit/replace flow is built (per Q-EDIT-DIR-1 resolution), if the edit allows changing `person_id` on an existing mandate (rather than only editing person details or appointment_date), any document generated between the old and new state would carry stale signatory imprints. The right pattern — per the existing `RemoveDirectorModal` precedent — is to require a remove+add transition for any change of person, not an in-place mutation of `person_id`. Out of scope for this audit; flag for the Q-EDIT-DIR-1 follow-up brief.

---

## §7 — Findings classification

### SHIP NOW (0 items)

None. Q-EDIT-DIR-1 is structural, not a one-liner. The Aria/i18n drift is broad enough to need its own bundle rather than ad-hoc one-shots.

### NEXT BUNDLE (3 items)

1. **Q-EDIT-DIR-1 — Edit Director modal scaffold.** Authoring blocked on product decision (shared modal w/ mode prop vs. separate EditDirectorModal vs. fold into a future replace-director flow). Authoring brief should lock: (i) which fields are editable (mandate-level only? person-level too? both?), (ii) whether person-change requires remove+add, (iii) the new activity-log event type (`director_edited`). Per CLAUDE.md §3 + 09-A.1 brief: must not couple `preferred_language` or call `router.push` from the save handler.
2. **Bilingual conformance pass — Administrateurs surface.** Convert all `locale === 'fr' ? ... : ...` ternaries in `DirectorsClient.tsx`, `DirectorCard.tsx`, and `RemoveDirectorModal.tsx` to `useTranslations` keys; add proper ICU `plural` blocks with `=0`/`=1`/`other` for FR singular-zero handling on the active-director count and the shareholding-actions count; replace `t('_locale')` with `useLocale()`. Per CLAUDE.md §1. Sized as one bundle.
3. **Citizenship field UX — Add Director modal (S10-TR-9).** Owned by Phase 10F per `docs/sprint-10-phase-decomposition-2026-05-07.md:170`. Flagged here because the audit confirmed PersonSelector "new" mode has no `citizenship` field and AddDirectorModal's `company_people` INSERT omits the column. When 10F brief is authored, this audit is the evidence anchor for the gap.

### TIER 4 (5 items)

1. **`CompanyPerson` TypeScript type drift.** `lib/supabase/people-types.ts:8-22` does not include `citizenship` (added by atom 1 / commit `09dcf11`). Will cause type-cast headaches the moment S10-TR-9 starts. Add the optional field declaration as part of the next type-touch on this file.
2. **Aria drift in `RemoveDirectorModal`.** Hardcoded `text-zinc-*`, `bg-red-*`, `border-zinc-*` literals throughout (lines 96, 103, 111, 116, 124, 130, 142, 149, 155, 175). Pre-v2.5-token authoring. Retrofit to var-tokens.
3. **Aria drift in `AddDirectorModal` save button** (line 200) — uses hardcoded `bg-amber-500 hover:bg-amber-600 text-white` instead of the page-level token pattern at `DirectorsClient.tsx:139`. Single-line retrofit.
4. **`DirectorsClient` CBCA-OK badge hardcodes `bg-emerald-100 text-emerald-700`** (line 157) where the surface already uses `var(--success-text)` elsewhere (DirectorCard line 135). Should use `var(--success-bg)` / `var(--success-text)` for consistency.
5. **`--tooltip-bg` candidate.** DirectorsClient Info tooltip at line 116 uses `bg-[var(--card-bg)]` because no `--tooltip-bg` token exists yet repo-wide (grep clean). If Aria v2.5.1 introduces it, this is one of the consumers. Park here until the token lands.

### ACCEPT (3 items)

1. **`director_mandates` listing read uses `is_active=true` filter, not `end_date IS NULL`.** Pre-Phase-10A-Atom-4-for-mandates idiom. Atom 4 has only shipped for `shareholdings` (commit `18578f8`); director_mandates LOCK-2 treatment is downstream. RemoveDirectorModal already captures `end_date` + `end_reason`, so when Atom-4-for-mandates eventually ships, the existing `is_active=false` rows will already carry `end_date` and the SELECT can switch over without a backfill. Re-audit at that time.
2. **Register route uses nested embed without `is_active` filter (`app/api/registers/directors/route.ts:21-22`).** Matches the §5 caller-evidence resolution from the rg1 audit for statutory registers — full-history is the correct posture. No change needed.
3. **No document generation triggered from this surface.** §6 N/A confirmed. Signatory-capacity validation lives downstream in `lib/pdf/`.

### Tracker hygiene note

`docs/feature-lifecycle.md:59` — Administrateurs row shows `_TBD_` in the Status column despite being named in the tracker's "Current north star" section as critical-path. Mention to Dom: this row should be flipped to **ACTIVE** as part of the next memory regen.

### Estimated session count for SHIP NOW + NEXT BUNDLE

- SHIP NOW: 0 sessions.
- NEXT BUNDLE: 2 sessions.
  - 1 session — Q-EDIT-DIR-1 authoring brief + edit-modal scaffold (after Dom locks product decision).
  - 1 session — bilingual conformance pass on Administrateurs surface (DirectorsClient + DirectorCard + RemoveDirectorModal), JSON key additions, ICU plurals.
  - Item 3 (citizenship UX) belongs to the Phase 10F bundle, not the Administrateurs-audit bundle — does not count toward this surface's session estimate.

**Total: 2 sessions** to close all surface-owned SHIP NOW + NEXT BUNDLE items.

---

## §8 — Audit methodology notes (cross-reference to rg1 audit §8 bank)

- **Dual-pass grep** (rg1 §8.X): re-applied here. Pass 2 caught `app/api/registers/directors/route.ts:22` nested embed — one hidden consumer, mirroring the rg1 shareholders-register pattern. Methodology continues to earn its keep.
- **State-but-never-read detector for dead UI state.** Q-EDIT-DIR-1's root cause surfaced via the observation that `editingDirector` is `set` in two places and `reset` at modal close but **never read**. Pattern worth banking: when a UI bug looks like "the button doesn't do anything," grep for the relevant state variable and check `set` vs. `read` call counts. State that is only ever set is dead — and dead state is a strong signal of an incomplete codepath. Recommend folding into State.md §8.x.
- **Caller-evidence ambiguity resolution** (rg1 §8.Y): not needed in this audit; all consumers were unambiguous on direct inspection.
