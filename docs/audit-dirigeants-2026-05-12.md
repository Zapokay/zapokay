# Dirigeants Surface Audit

**Date:** 2026-05-12
**Author:** CC (per Phase A.1 brief — Dirigeants)
**Phase:** Pre-launch screen audit — 8th of 9 surfaces (Queue.md §19 sequence)
**Scope:** Catalogue every code path on the Dirigeants surface (route, listing client, OfficerCard, Add/Remove/Replace modals, register API, document-pipeline coupling). Validate data surface, deep-dive Replace Officer mechanics to bank precedent for the Q-EDIT-DIR-1 scaffold brief, check Aria v2.5/v2.5.1 + bilingual + legal-capacity conformance, and bucket findings.
**Mode:** Investigation-only. Zero code changes. Zero migrations. Zero commits.

---

## §0 — Pre-flight

- **`docs/feature-lifecycle.md` consulted:** YES. Administrateurs row was flipped to ACTIVE in `a0ebff8` this session; Dirigeants row still reads `_TBD_` despite being named critical-path in the same doc's "Current north star" section.
- **Decision to proceed:** TBD is not on the explicit STOP list. The same condition as Administrateurs pre-flip — proceeding on north-star evidence and flagging for §7 tracker hygiene.
- **Template:** `docs/audit-administrateurs-2026-05-12.md` is the locked template; this audit mirrors its shape (Q-EDIT-DIR-1 §3 → Replace-mechanics §3; §7 buckets unchanged; §8 methodology cross-reference).

---

## §1 — Inventory

### Routes

| Path | Role |
|---|---|
| `app/[locale]/dashboard/officers/page.tsx:6` | Server component. Auth gate, profile load, single active company load, renders `DashboardShell` + `OfficersClient`. Mirror of directors `page.tsx`. |
| `app/api/registers/officers/route.ts:12` | GET. Statutory Officer Register payload (full-history via nested embed, no `is_active` filter). FR title `Registre des dirigeants` / EN `Officer Register`. |

### Client components

| Path | Role |
|---|---|
| `app/[locale]/dashboard/officers/OfficersClient.tsx:22` | Listing client. Holds `officers`, `directorMandates`, `shareholdings`, `replacingOfficer`, `removingOfficer`, `showAddModal` state. Renders sorted card grid (ROLE_ORDER constant line 20), summary text, three modal hosts. |
| `components/officers/OfficerCard.tsx:59` | Single officer card. Role-label header (uppercase), avatar, name, appointment date, optional signing-authority badge, "Aussi :" line (director + shareholdings cross-role badges), three actions (Edit / Replace / Remove). |
| `components/officers/AddOfficerModal.tsx:40` | Add-officer modal. PersonSelector + title selector + custom-title field + signing-authority toggle + appointment date. Includes **title-conflict resolution** subflow: when a non-custom title is already held by an active officer, surfaces an inline "Replace?" dialog and on confirm runs an UPDATE + INSERT pair (lines 82-110). |
| `components/officers/RemoveOfficerModal.tsx:35` | Remove-officer modal. Captures end_date only; **does NOT capture `end_reason`**. UPDATE `is_active=false`. |
| `components/officers/ReplaceOfficerModal.tsx:45` | Replace-officer modal. Outgoing-vs-incoming visual (red→arrow→green chips), PersonSelector for incoming, dual date pickers (outgoing end_date, incoming start_date), signing-authority toggle. **Two-step UPDATE+INSERT transaction (see §3).** |
| `components/people/PersonSelector.tsx:1` | Shared selector consumed by Add + Replace modals. Same `citizenship`-omitted "new" mode as documented in Administrateurs §2. |

### API routes

| Path | Role |
|---|---|
| `app/api/registers/officers/route.ts:12` | GET — statutory Officer Register. Title-string localization via inline `TITLE_FR_MAP` constant (line 4-10) — also includes `director_general` which is not in the `OfficerTitle` type union. |

No `/api/officers/*` CRUD routes — writes happen client-side via the Supabase client inside the modals.

### Type definitions

| Path | Symbol | Notes |
|---|---|---|
| `lib/supabase/people-types.ts:60` | `OfficerAppointment` | **Missing `end_reason` field** added in commit `09dcf11` (atom 1, LOCK-3). Mirrors the `CompanyPerson.citizenship` drift documented in Administrateurs §2. |
| `lib/supabase/people-types.ts:53` | `OfficerTitle` union | `'president' \| 'secretary' \| 'treasurer' \| 'vice_president' \| 'custom'`. Does **not** include `director_general` even though the register API + several modal helpers reference it (`AddOfficerModal.tsx:162`, `RemoveOfficerModal.tsx:73`, `registers/officers/route.ts:9`). Likely vestigial from a pre-Sprint-6 spec; minor type-vs-data inconsistency. |
| `lib/supabase/people-types.ts:133` | `OfficerWithPerson extends OfficerAppointment` | Used as the canonical officer shape on this surface. |

### Hooks / utilities imported

- `@/lib/supabase/client` and `@/lib/supabase/server`.
- `next-intl` `useTranslations` — used by Client + Card + all 3 modals.
- `@/lib/activity-log` `logActivity` — called by Add modal (`officer_added`) and Remove modal (`officer_removed`). **NOT called by Replace modal** — see §3.
- `@/components/people/PersonSelector` — Add + Replace modals.
- `@/components/ui/LegalTerm` — Client for `dirigeant` term.
- `@/components/dashboard/DashboardShell` — server-side shell.

### Document generators that consume officer data

Dual-pass grep against `lib/pdf/` for `officer_appointments`:

- Pass 1 direct (`from('officer_appointments')`): **zero hits in `lib/pdf/`**.
- Pass 2 nested (`officer_appointments(`): **zero hits in `lib/pdf/`**.

Dual-pass grep against `app/api/documents/signatories/route.ts`: **zero hits** for `officer_appointments` or `is_primary_signing_authority`. This route reads `director_mandates` only (see Administrateurs audit §1, site 2).

**Finding (§6 cross-link):** The document pipeline does not currently consume officer data. The `is_primary_signing_authority` boolean — set by the Add modal toggle (line 148) and the Replace modal toggle (line 127), displayed by `OfficerCard.tsx:125` — is **dead state on the document side**. Set + displayed in UI; never read by any downstream signatory consumer. Mirror of the Q-EDIT-DIR-1 `editingDirector` dead-state pattern.

### Dual-pass grep methodology

| Pass | Pattern | Hits (active code, excluding `sprint6.sh`) |
|---|---|---|
| 1 — direct | `from\(['\"]officer_appointments` | 11 active sites: OfficersClient.tsx:53, DirectorsClient.tsx:74 (cross-surface), ShareholdersClient.tsx:69 (cross-surface), OnboardingFlow.tsx:242, AddOfficerModal.tsx:84+106+142, RemoveOfficerModal.tsx:59, ReplaceOfficerModal.tsx:110+121, seed-canonical-fixture.mjs:361 |
| 2 — nested embed | `officer_appointments\(` | 1 additional hit: `app/api/registers/officers/route.ts:30` (`from('company_people').select('*, officer_appointments(*)')` — the statutory register's full-history nested embed) |

Pass 2 caught the register-route hidden consumer, mirroring the same dual-pass pattern that worked on rg1 + Administrateurs.

---

## §2 — Data surface

### Tables read on this surface

| Table | Site | Columns / shape | Context |
|---|---|---|---|
| `users` | `page.tsx:11` | `*` | Onboarding-complete gate. |
| `companies` | `page.tsx:14` | `*` filtered `user_id` + `status='active'` | Hydrate shell. |
| `companies` | `OfficersClient.tsx:44-45` | `id, incorporation_date` | Default appointment-date wiring. |
| `officer_appointments` | `OfficersClient.tsx:52-54` | `*, person:company_people(*)` filtered `is_active=true`, `order appointment_date asc` | Card grid source. |
| `director_mandates` | `OfficersClient.tsx:57-58` | `*` filtered `is_active=true` | "Aussi : Administrateur" cross-role badge in OfficerCard. |
| `shareholdings` | `OfficersClient.tsx:61-62` | `*, share_class:share_classes(*)` filtered `end_date IS NULL` | "Aussi : Actionnaire" badge. **Post-Phase-10A-Atom-4 `.is('end_date', null)` already applied (commit `18578f8`).** ✓ |
| `officer_appointments` | `AddOfficerModal.tsx:83-89` | `id, person_id, company_people(full_name)` filtered `company_id`+`title`+`is_active=true` | Title-conflict detection (only for non-custom titles). |
| `company_people` (nested) | `app/api/registers/officers/route.ts:29-30` | `*, officer_appointments(*)` | Register-payload full-history nested embed. |

### Tables written on this surface

| Table | Site | Op | Captures `end_reason`? |
|---|---|---|---|
| `company_people` | `AddOfficerModal.tsx:115-130` | INSERT (PersonSelector mode='new') | N/A |
| `company_people` | `ReplaceOfficerModal.tsx:83-98` | INSERT (PersonSelector mode='new') | N/A |
| `officer_appointments` | `AddOfficerModal.tsx:141-151` | INSERT (`is_active=true`) | N/A — creating new |
| `officer_appointments` | `AddOfficerModal.tsx:105-108` | UPDATE on title-conflict — `is_active=false` only | **NO** — neither `end_date` nor `end_reason` set |
| `officer_appointments` | `RemoveOfficerModal.tsx:58-64` | UPDATE — `is_active=false`, `end_date` | **NO — `end_reason` omitted** |
| `officer_appointments` | `ReplaceOfficerModal.tsx:109-115` | UPDATE outgoing — `is_active=false`, `end_date` | **NO — `end_reason` omitted** |
| `officer_appointments` | `ReplaceOfficerModal.tsx:120-130` | INSERT incoming (`is_active=true`) | N/A — creating new |

### `officer_appointments.end_reason` (atom 1, commit `09dcf11`, LOCK-3, 5-value CHECK)

**Schema landed**, per `supabase/migrations/20260511001738_phase10a_low_risk_additive.sql:17-19`:

```sql
ALTER TABLE officer_appointments
  ADD COLUMN IF NOT EXISTS end_reason TEXT NULL
  CHECK (end_reason IN ('resignation','revocation','term_expired','death','disqualification'));
```

- **Captured by UI on this surface:** NO. Three update sites all set `is_active=false` and optionally `end_date`, but none populate `end_reason`. The column's migration comment explicitly notes "Zero existing callers read any of these columns" — atom 1 set up schema for downstream UX to consume; consumption has not landed.
- **Asymmetry with `director_mandates.end_reason`:** `RemoveDirectorModal.tsx:24-30` defines an `END_REASONS` constant and `RemoveDirectorModal.tsx:55-62` writes both `end_date` AND `end_reason` to `director_mandates`. The matching capture has never been built for officers — this is the surface's load-bearing data-layer gap.
- **TypeScript drift:** `OfficerAppointment` interface in `lib/supabase/people-types.ts:60-71` does not include `end_reason`. Anything that wants to read/write it needs a type extension.

### `officer_appointments.end_date` — does it exist?

**YES.** Confirmed via three independent signals:

- `lib/supabase/people-types.ts:68` — interface declares `end_date: string | null`.
- `supabase/migrations/20260405000000_sprint6_people_ownership.sql:60-66` — original Sprint 6 table CREATE includes `end_date DATE NULL` (column landed at Sprint 6, not at Phase 10A).
- `RemoveOfficerModal.tsx:62` and `ReplaceOfficerModal.tsx:113` both successfully write to `end_date` against production data; if the column didn't exist the writes would error.

The brief's hypothesis that Atom 4 might have skipped `officer_appointments` was correct in direction (Atom 4 was scoped to `shareholdings` only) but the column itself predates Phase 10A — it shipped with the original Sprint 6 people-ownership migration. **No gap on this column.**

### FK / RLS posture (post-Phase-10A)

- `officer_appointments` was touched by atom 1 only (added `end_reason`). Atoms 2-4 did not affect this table's FKs or RLS. No regression risk from Phase 10A on this surface.
- The atom 1 migration is purely additive nullable column work (`docs/phase10a-decomposition-proposal-2026-05-10.md` LOCK-3, idempotent, no pipeline coupling).

### Vocabulary confusion risk

Same LSAQ overlap noted in Administrateurs §2 — `officer_appointments` vs `director_mandates`. On this surface the listing client reads `director_mandates` cross-surface (line 57-58) for the "Aussi : Administrateur" badge only, never confusing the two. The Add/Replace modals do not touch `director_mandates`. No surface-internal confusion risk.

---

## §3 — Replace Officer mechanics deep-dive — LOAD-BEARING

### Trigger trace

1. **Card row action:** `OfficerCard.tsx:157-164` — Replace button (RefreshCw icon, info-token coloured), calls `onReplace(officer)`.
2. **Parent handler:** `OfficersClient.tsx:154` — `onReplace={(o) => setReplacingOfficer(o)}`. State at line 35 of the client.
3. **Modal mount:** `OfficersClient.tsx:193-200` — when `replacingOfficer && companyId`, mounts `<ReplaceOfficerModal officer={replacingOfficer} companyId={companyId} ... />`. **The officer is passed to the modal** (contrast with Q-EDIT-DIR-1 where `editingDirector` was unread).
4. **Form state hydration:** `ReplaceOfficerModal.tsx:55-66` — pre-fills `endDate` and `startDate` to today, signing-authority toggle to the outgoing officer's current value.
5. **Save handler:** `ReplaceOfficerModal.tsx:69-140`.

### DB-level write sequence (`handleSave`, lines 78-132)

The save handler executes a **three-step sequence** against Supabase:

1. **(Lines 80-106) Resolve incoming person.** If PersonSelector mode='new', INSERT `company_people` and capture the new ID. Otherwise reuse `personValue.personId`.
2. **(Lines 109-117) End the outgoing appointment.** UPDATE `officer_appointments` SET `is_active=false`, `end_date=endDate` WHERE `id=officer.id`. **`end_reason` is NOT set** — same gap as RemoveOfficerModal.
3. **(Lines 120-130) Create the new appointment.** INSERT into `officer_appointments` with `person_id=incomingPersonId`, `title=officer.title` (preserved verbatim), `custom_title=officer.custom_title` (preserved), `is_primary_signing_authority=isSigningAuthority` (form value), `appointment_date=startDate`, `is_active=true`.

### Hypothesis-space disposition

**Outcome: (a) Two-step.** Matches the Q-EDIT-DIR-1 locked semantic (preserve historical record; person-change forces remove+add).

Specifically: the **outgoing row is preserved** with `is_active=false` and `end_date` populated; a **separate incoming row** is inserted. The historical chain is intact and queryable via the statutory Officer Register's full-history nested embed.

(b) is disproven — no `UPDATE ... SET person_id=...` codepath exists in this modal.
(c) is partially relevant — the title/custom_title are preserved verbatim across the transition (lines 125-126), which is closer to a "role-continuity" semantic than a clean cut. Phase 10F may want to consider whether this is the right invariant when the incoming officer's title differs (today the modal locks title to the outgoing role; no UI affordance to change title during replacement).

### Atomicity, idempotency, rollback

The three steps are **independent Supabase calls with no transaction wrapping**. Failure modes:

- **Step 1 fails (new person INSERT).** Catch on line 100; throws. No DB writes performed. Clean abort.
- **Step 2 fails (outgoing UPDATE).** Catch on line 117; throws. The new person row from step 1 has already been INSERTed and is orphaned (no role attached to it). Not data-corrupting but creates a stray `company_people` row.
- **Step 3 fails (incoming INSERT).** Catch on line 132; throws. The outgoing row has been UPDATEd to `is_active=false` — **the role is now vacant**. The position has no active occupant; the database is in an inconsistent state from the user's mental model. No compensating action.

This is a real but probably rare failure mode (Supabase calls don't usually fail mid-sequence unless RLS or constraint issues kick in). Flagged for §7 NEXT BUNDLE because the mitigation requires either (i) a server-side route that wraps the writes in a Postgres transaction or (ii) a client-side compensating action on step-3 failure that re-UPDATEs the outgoing row back to `is_active=true`. The locked Q-EDIT-DIR-1 semantic explicitly calls for two-step preservation, so the transaction concern is inherited by that scaffold too.

### Activity-log emission

`ReplaceOfficerModal` **does not call `logActivity` at all.** `AddOfficerModal.tsx:168-177` emits `'officer_added'` and `RemoveOfficerModal.tsx:80-89` emits `'officer_removed'`, but Replace emits nothing.

The activity-log schema defines `'officer_replaced'` as a valid event type:

- `supabase/migrations/20260508210035_create_activity_log.sql:57` — CHECK constraint includes `'officer_replaced'`.
- `docs/audit-batch2-foundation-backfill-2026-05-08.md:184` — references it in the canonical event-key list.

**The 'officer_replaced' event type is dead schema** — declared in the constraint, banked in docs, never emitted by any caller. Mirror of the `is_primary_signing_authority` dead-state finding and the Q-EDIT-DIR-1 `editingDirector` finding. **Pattern recurrence count: 3 across two audits.** Worth banking into §8 methodology.

### Concurrency / idempotency

- No optimistic-concurrency check (no `updated_at` compare-and-swap). If two browsers replace the same officer simultaneously, the second wins the UPDATE and the INSERT then creates a second active mandate for the same role. Pre-launch this is unlikely; post-launch with collaborative editing it's a real concern.
- No idempotency token. Re-firing the same save (e.g., user clicks Save twice while spinner is up) would race; the `disabled={saving || !personValue}` gate at line 261 makes this very hard to trigger but not impossible.

Neither is a launch-blocker; flag for Tier 4.

### §3.6 — Distilled transaction-semantics paragraph (Q-EDIT-DIR-1 scaffold reference)

> **Replace Officer transaction semantics (precedent for Q-EDIT-DIR-1):** When the active occupant of an officer role is replaced, the surface preserves the outgoing row by setting `is_active=false` + `end_date` (no `end_reason` capture today — gap), and inserts a fresh row for the incoming occupant with `is_active=true`, the same `title` and `custom_title`, a new `appointment_date`, and a form-supplied `is_primary_signing_authority`. The outgoing and incoming rows are connected only by `(company_id, title)` + chronological `appointment_date` / `end_date` adjacency — there is **no explicit FK link** between them. The three writes (optional new-person INSERT, outgoing UPDATE, incoming INSERT) are issued sequentially against Supabase with **no transaction wrapping and no compensating action on partial failure.** The Q-EDIT-DIR-1 scaffold should adopt the same two-row preservation semantic for any director-mandate replacement, with an additional explicit decision on whether to wrap the writes in a server-side transaction (recommended) and whether to capture `end_reason` on the outgoing row (recommended; matches existing director_mandates Remove flow). The 'officer_replaced' activity event type exists in the schema but is currently un-emitted; the equivalent 'director_replaced' event would need adding to the activity-log CHECK constraint if the scaffold names the operation 'Replace' rather than reusing 'director_added' + 'director_removed' as a pair.

---

## §4 — Aria v2.5 / v2.5.1 conformance

### Token usage by component

| File | Token posture |
|---|---|
| `OfficerCard.tsx` | **Best on the surface.** Uses `var(--warning-text)` / `var(--warning-bg)` for title header + signing-authority badge, `var(--info-text)` / `var(--info-bg)` for Replace button, `var(--error-text)` / `var(--error-bg)` for Remove button, `var(--text-heading)` / `var(--text-body)` / `var(--text-muted)` / `var(--card-bg)` / `var(--card-border)` throughout. No tailwind color literals. ✓ |
| `OfficersClient.tsx` | Mostly tokenized; spinner at line 84 hardcodes `text-amber-500`. Custom info-SVG at lines 135-138 uses `var(--color-nt-400)` (unusual token, possibly stale). Tooltip at line 103 uses `bg-[var(--card-bg)]` — same `--tooltip-bg` candidate as Administrateurs. |
| `ReplaceOfficerModal.tsx` | **MIXED.** Header + close button + footer Cancel button correctly use `var(--text-heading)` / `var(--text-muted)` / `var(--hover)`. Save button uses `bg-[var(--amber-400)] text-[var(--cta-text)]` (the cleanest token usage of any save button across both audited surfaces). But the inner context box (lines 166-186) is heavy on `bg-zinc-50 dark:bg-zinc-800/50` + outgoing/incoming chips `bg-red-50 text-red-700 dark:bg-red-900/20` + `bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20`. Date inputs (203-207, 214-218) hardcode `border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800`. |
| `AddOfficerModal.tsx` | **Worst on the surface, worse than RemoveDirectorModal.** Hardcoded `text-zinc-900 dark:text-zinc-100` header (195), `text-amber-500` Zap icon (196), zinc close button (202), `text-red-500` required-asterisk (222, 241, 273), full zinc-on-white-dark-zinc input scheme (227, 248, 279), zinc-700 label scheme (221, 240, 272), `bg-red-50 ... text-red-700` error block (285), `border-amber-200 bg-amber-50 ... dark:border-amber-800 dark:bg-amber-900/20` conflict dialog (292), `bg-amber-500 hover:bg-amber-600 text-white` save button (308, 339). Almost no var-token usage. |
| `RemoveOfficerModal.tsx` | Effectively identical to `RemoveDirectorModal` in style — heavy zinc + red literals, no var-tokens. Predates v2.5 token retrofit. |

### Modal primitive

All 3 Dirigeants modals roll their own `modal-surface` / `modal-header` / `modal-footer` scaffolds. Combined with the 2 Administrateurs modals, the **C3 / Tier 3 #73 modal-primitive extraction case sheet now carries 5 instances across these two surfaces** — strong reinforcement of the extraction opportunity.

### Sidebar grouping

`messages/fr.json` and `messages/en.json` carry the `officers` namespace and the sidebar key. Sidebar grouping post-C1 not re-checked here (out of surface-internal scope).

### Coming-Soon affordances (P1)

Grep clean. Expected absence ✓.

### Numeric / diff treatments (P3)

The outgoing-vs-incoming chip pair in ReplaceOfficerModal (lines 173-185) is a *visual diff* affordance but does not use P3 token semantics — it's a one-shot red→arrow→green styling. Not a numeric diff per the P3 specification; not flagged.

### Drift cluster

Single Tier-4 entry will roll up: spinner literal in OfficersClient, AddOfficerModal full-file hardcoded tailwind, RemoveOfficerModal full-file hardcoded tailwind, ReplaceOfficerModal inner-box + chip + date-input drift. Counts as one bundle when authored alongside the Administrateurs drift bundle.

---

## §5 — Bilingual / Two-Layer Language Model conformance

### Hardcoded `locale === 'fr' ? ... : ...` ternaries (CLAUDE.md §1 NEVER)

Heaviest load of any surface audited this cycle — meaningfully worse than Administrateurs:

| File | Lines | Strings |
|---|---|---|
| `OfficersClient.tsx` | 93 | "Équipe de direction" / "Management Team" |
| `OfficersClient.tsx` | 104-106 | Tooltip body (FR/EN) |
| `OfficersClient.tsx` | 113-117 | "{n} dirigeant(s) nommé(s)" — manual plural, FR `=0` violation per CLAUDE.md §1 |
| `OfficersClient.tsx` | 116 | "Aucun dirigeant nommé" / "No officers appointed" |
| `OfficersClient.tsx` | 139-141 | "Une même personne peut occuper plusieurs postes..." (FR/EN) |
| `OfficersClient.tsx` | 165-172 | Empty-state heading + body (FR/EN) |
| `OfficerCard.tsx` | 31-36 | `TITLE_LABELS` `{fr, en}` lookup map |
| `OfficerCard.tsx` | 83 | "Administrateur" / "Director" otherRoles entry |
| `OfficerCard.tsx` | 87-91 | "Actionnaire (N actions)" / "Shareholder (N shares)" — manual plural |
| `OfficerCard.tsx` | 115-117 | "En poste depuis le {date}" / "In office since {date}" |
| `OfficerCard.tsx` | 131 | "Signataire autorisé" / "Authorized signatory" |
| `OfficerCard.tsx` | 139 | "Aussi" / "Also" |
| `AddOfficerModal.tsx` | 28-34 | `TITLE_OPTIONS` `{fr, en}` lookup |
| `AddOfficerModal.tsx` | 157-163 | `titleFrMap` — FR-only fallback for activity log |
| `AddOfficerModal.tsx` | 247 | Placeholder "Ex. : Directeur des opérations" / "E.g.: Chief Operating Officer" |
| `AddOfficerModal.tsx` | 294-318 | Title-conflict dialog (multiple lines, FR/EN ternaries) |
| `AddOfficerModal.tsx` | 311, 318 | "Remplacer" / "Replace", "Annuler" / "Cancel" |
| `RemoveOfficerModal.tsx` | 14-19 | `TITLE_LABELS` `{fr, en}` lookup |
| `RemoveOfficerModal.tsx` | 68-74 | `titleFrMap` FR-only fallback |
| `RemoveOfficerModal.tsx` | 121-128 | Confirm body + secondary (FR/EN) |
| `ReplaceOfficerModal.tsx` | 16-21 | `TITLE_LABELS` `{fr, en}` lookup |
| `ReplaceOfficerModal.tsx` | 168-170 | Replace context line |
| `ReplaceOfficerModal.tsx` | 194 | PersonSelector label "Nouveau titulaire" / "New appointee" |
| `ReplaceOfficerModal.tsx` | 200-201, 211-212 | Date labels (FR/EN) |

### Manual plurals

- `OfficersClient.tsx:113-117` — "${n} dirigeant${n > 1 ? 's' : ''} nommé${n > 1 ? 's' : ''}". FR `=0` violation: renders "0 dirigeants nommés" — CLAUDE.md §1 explicitly bans this pattern.
- `OfficerCard.tsx:87-91` — "Actionnaire (N actions)". Manual plural, gated by `totalShares > 0` so the `=0` case is unreachable, but the pattern is still a violation.

### `t('_locale')` trick

Used in 5 files: `OfficersClient.tsx:24`, `OfficerCard.tsx:68`, `AddOfficerModal.tsx:47`, `RemoveOfficerModal.tsx:41`, `ReplaceOfficerModal.tsx:52`. Same `useLocale()`-idiomatic gap as Administrateurs.

### `preferred_language` writes

Grep `preferred_language` across `app/[locale]/dashboard/officers/` + `components/officers/`: **zero hits**. Two-Layer separation respected ✓.

### `router.push` / locale switches

Grep across the same paths: zero hits ✓.

### Quebec language law sensitivity

No claims about language obligations on this surface ✓.

### Activity-log strings

`AddOfficerModal.tsx:173-174` and `RemoveOfficerModal.tsx:85-86` pass dual FR/EN strings to `logActivity`, matching the convention. ReplaceOfficerModal omits the call entirely (see §3).

### Title-string trio

Three separate `{fr, en}` lookup constants (`TITLE_LABELS` in OfficerCard + RemoveOfficerModal + ReplaceOfficerModal; `TITLE_OPTIONS` in AddOfficerModal; `TITLE_FR_MAP` in the register route) carry duplicate translations of the same title strings — `Président·e / President`, `Secrétaire / Secretary`, etc. This is i18n debt: a single canonical `messages.json` key namespace (`officers.titles.*`) would dedupe four copies. Bank into the bilingual conformance pass bundle.

---

## §6 — Legal-capacity / signatory check

### Does this surface trigger document generation?

**NO.** OfficersClient and the three modals call only `logActivity` and the Supabase client; no `/api/documents/*` POST, no `lib/pdf/` import.

### Document-pipeline coupling — gap analysis

Officers DO sign statutory documents per LSAQ Art. 262 and CBCA equivalents (President + Secretary at minimum). But the pipeline coupling is **absent**:

- `lib/pdf/generatePdfDocument.ts` — grep `officer_appointments`: zero hits. The generator reads `director_mandates` (line 173 per Administrateurs audit) but not officers.
- `app/api/documents/signatories/route.ts` — grep `officer_appointments` and `is_primary_signing_authority`: zero hits. Reads `director_mandates` only.

**Effective state of `is_primary_signing_authority`:** Captured by AddOfficerModal (line 148) and ReplaceOfficerModal (line 127). Stored on `officer_appointments`. Displayed by `OfficerCard.tsx:125` as the "Signataire autorisé" / "Authorized signatory" badge. **Read by zero document-pipeline consumers.** Dead state on the writing-side; live state only on the rendering-side of this same surface.

### Classification of the gap

Two readings:

- **(a) Sprint 6 design intent: directors-only signatory pool.** The signatory route fetches directors as the canonical pool; officer titles are decorative. Under this reading the `is_primary_signing_authority` toggle is overcollection — UI captures data that the pipeline doesn't use. Cheapest fix: hide or remove the toggle.
- **(b) Pre-launch unfinished work.** Officers were always intended to participate in the signatory pool; the wiring was deferred. Under this reading the `is_primary_signing_authority` toggle is a placeholder waiting for the pipeline to consume it. Cheapest fix: extend `app/api/documents/signatories/route.ts` to union directors and signing-authority officers.

Per `docs/temporal-registry-audit-2026-04-23.md:54-58` and the existing Schema CHECK on `is_primary_signing_authority`, **(b) is more consistent with the documented intent**. The signing-authority toggle was specced from Sprint 6; pipeline consumption is the missing piece. Phase 10F is the likely owner; Phase 10B's as-of-date resolver would extend it to "who was the signing-authority officer on the document's effective date."

This is a load-bearing finding for pre-launch readiness if any v1.0 document type expects an officer (vs. director) signature. Worth surfacing to Dom: **does the v1.0 document set require any officer-signed templates?** If yes, this is a NEXT BUNDLE pre-launch blocker. If no (directors-only sufficient for v1.0), this is parked for Phase 10F. Audit doc cannot resolve this from in-repo evidence alone.

### Temporal-resolution concern

If a President is replaced mid-fiscal-year and a document needs the President's signature for an as-of-date *before* the replacement, the existing data (preserved outgoing row with `end_date`, fresh incoming row with `appointment_date`) is **sufficient to resolve the right person** — the Replace flow's two-step semantic (§3) gives Phase 10B's as-of-date resolver the substrate it needs. Good architectural alignment between Replace mechanics and the temporal-registry spec. No surface-internal change required for this concern.

---

## §7 — Findings classification

### SHIP NOW (0 items)

None. Q-EDIT-DIR-1 hotfix precedent doesn't apply here (no equivalent immediate-data-corruption path — Replace flow is structurally correct). The drift is broad enough to need bundling.

### NEXT BUNDLE (4 items)

1. **`officer_appointments.end_reason` UI capture.** Three update sites need an `end_reason` picker matching the `RemoveDirectorModal.tsx:24-30` precedent (5-value enum, FR + EN labels): `AddOfficerModal` title-conflict-replace UPDATE (line 105), `RemoveOfficerModal` (line 58), `ReplaceOfficerModal` outgoing UPDATE (line 109). Includes ICU plural-free labels (these are single values, no plurals). Bundle with i18n migration for the labels.
2. **ReplaceOfficer activity-log emission.** Add `logActivity` call to `ReplaceOfficerModal.tsx:handleSave` after step 3 success. Use existing `'officer_replaced'` event type; provide dual FR/EN messages matching the Add + Remove conventions. Includes outgoing-name + incoming-name + role-label context in the body.
3. **ReplaceOfficer transactional integrity.** Wrap the three-step DB sequence to handle the step-3-fails scenario where the role is left vacant. Two viable mitigations: (a) move the writes to a server-side route that uses a Postgres transaction (`BEGIN ... COMMIT`); (b) on step-3 catch, issue a compensating UPDATE that re-activates the outgoing row. (a) is cleaner; (b) is faster. Bundle with #2 since both touch the same handler.
4. **Bilingual conformance pass — Dirigeants surface.** Convert all `locale === 'fr' ? ... : ...` ternaries across OfficersClient + OfficerCard + all 3 modals to `useTranslations` keys; dedupe the four `TITLE_LABELS` / `TITLE_OPTIONS` / `TITLE_FR_MAP` constants into a single `messages.json` `officers.titles.*` namespace; add ICU plurals with `=0` for the active-officer count and the shareholding-actions count; replace `t('_locale')` with `useLocale()`. Sized as one large bundle (heavier than the Administrateurs bilingual bundle by ~30%).

### TIER 4 (5 items)

1. **`OfficerAppointment` TypeScript drift.** `lib/supabase/people-types.ts:60-71` missing `end_reason` field. Add as optional field of the 5-value enum union when next type-touching the file (would ideally land as part of NEXT BUNDLE #1 to keep TS strict).
2. **`OfficerTitle` union missing `director_general`.** Referenced by `registers/officers/route.ts:9`, `AddOfficerModal.tsx:162`, `RemoveOfficerModal.tsx:73` but absent from the type union at `people-types.ts:53-58`. Either (a) add to the union, or (b) remove from the dead constants. Minor inconsistency; not blocking.
3. **Aria drift across all 3 Dirigeants modals.** Same pattern as RemoveDirectorModal — hardcoded `text-zinc-*`, `bg-red-*`, `bg-amber-500/600 text-white` literals throughout. AddOfficerModal is the heaviest offender. Bundle with the Administrateurs Aria drift Tier 4 when authored. Includes the `OfficersClient.tsx:84` spinner literal.
4. **`is_primary_signing_authority` overcollection candidate** (see §6 reading (a)). If Phase 10F decides directors-only signatory is the v1.0 posture, hide the toggle. Otherwise rolls into a separate NEXT BUNDLE for the document-pipeline officer-coupling work. Parked here until §6 product question is answered.
5. **Modal-primitive extraction** (Tier 3 #73 / C3). 3 more instances. Combined case sheet across Administrateurs + Dirigeants now stands at 5 modals. Reinforces extraction opportunity without acting on it in this phase.

### ACCEPT (3 items)

1. **`officer_appointments` listing read uses `is_active=true` filter.** Same pre-Phase-10A-Atom-4-for-mandates idiom as Administrateurs §7 ACCEPT #1. When Atom-4-for-officer_appointments eventually ships, the existing `is_active=false` rows will already carry `end_date` (RemoveOfficerModal + ReplaceOfficerModal already write it), so the SELECT can switch over without backfill. Re-audit at that point. Note: an Atom-4-for-officers may be deemed unnecessary given `is_active=false` already implies `end_date IS NOT NULL` at the data layer; product decision.
2. **Register route uses nested full-history embed.** Same caller-evidence pattern as rg1 audit + Administrateurs §7 ACCEPT #2. Appropriate statutory posture.
3. **`app/api/documents/signatories/route.ts` reading directors-only.** Parked under §6 product question, but as a *current-state* posture it's coherent (directors-only signatory pool is a defensible v1.0 reading). Move out of ACCEPT into NEXT BUNDLE only if §6 product question resolves to "officers must sign too".

### Tracker hygiene note

`docs/feature-lifecycle.md` Dirigeants row currently reads `_TBD_`. Surface verified ACTIVE during this audit (same condition that Administrateurs cleared before being flipped in `a0ebff8`). **Recommend flipping Dirigeants row → ACTIVE after this audit closes**, mirroring the Administrateurs flip; should be its own micro-commit per the Phase A.1 hygiene precedent.

### Estimated session count for SHIP NOW + NEXT BUNDLE

- SHIP NOW: 0 sessions.
- NEXT BUNDLE: 3 sessions.
  - 1 session — combined: `end_reason` capture wiring across 3 modals + `OfficerAppointment` type extension (NEXT BUNDLE #1 + Tier 4 #1) + i18n keys for the 5 reason labels. Coupled change.
  - 1 session — combined: ReplaceOfficer activity-log emission + transactional integrity (NEXT BUNDLE #2 + #3). Same handler edit.
  - 1 session — bilingual conformance pass on Dirigeants surface (NEXT BUNDLE #4). Largest of the three. Could be sized down to ~75% of one session if the 4 title-constant duplicates are deferred to the Aria bundle.

**Total: 3 sessions** to close all surface-owned SHIP NOW + NEXT BUNDLE items.

### Q-EDIT-DIR-1 scaffold reference paragraph (lift from §3.6)

> Replace Officer transaction semantics: preserve outgoing row with `is_active=false` + `end_date` (and `end_reason` once the gap is closed), insert fresh row for incoming person with same `title` + `custom_title` + new `appointment_date` + form-supplied `is_primary_signing_authority` + `is_active=true`. Three writes issued sequentially with no transaction wrapping today (NEXT BUNDLE #3 mitigates). 'officer_replaced' activity event type exists in schema but is unemitted by the UI (NEXT BUNDLE #2 mitigates). The Q-EDIT-DIR-1 director-replacement scaffold should adopt the same two-row preservation semantic, add `end_reason` capture on outgoing, wrap in a server-side transaction, and either reuse the 'director_added' + 'director_removed' event pair or introduce a 'director_replaced' event after extending the activity_log CHECK constraint to include it.

---

## §8 — Methodology notes

- **Dead-state pattern recurrence (3rd instance).** Q-EDIT-DIR-1 (`editingDirector` set + reset, never read), Dirigeants §1 (`is_primary_signing_authority` set + displayed, never read by pipeline consumers), Dirigeants §3 (`'officer_replaced'` event type declared + documented, never emitted by callers). All three were the load-bearing finding of their respective tasks. Pattern is general enough to bank as §8.X State.md methodology: **"dead-state triangulation — when a state variable, schema constraint enum value, or feature flag is set or declared but a grep for *readers* / *emitters* returns zero, the artifact is unfinished work or vestigial; treat as a primary audit signal, not noise."** Three independent surfacings in one session is a strong methodology vote.
- **Two-row preservation precedent.** The Replace Officer modal is the canonical in-repo example of the locked Q-EDIT-DIR-1 semantic (preserve outgoing, insert incoming, no in-place `person_id` mutation). The Q-EDIT-DIR-1 scaffold can quote §3.6 verbatim.
- **Dual-pass grep:** applied without modification. Caught the nested register-route embed as expected. No new variant needed.
- **Caller-evidence ambiguity resolution** (rg1 §8.Y): not needed in this audit; all consumers were unambiguous on direct inspection.
