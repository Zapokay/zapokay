# Share Transfer — Investigation findings for Phase 3 close slice

**Date:** 2026-05-27
**Author:** Claude (READ-ONLY investigation, per Phase 3 close-slice brief)
**Scope:** Map current state of share-transfer plumbing to size the v1 ind-to-ind
transfer capture + generation slice. v1 product locks (per brief):

- ind-to-ind only (no entity, no joint)
- full transfers only (no partial-quantity splits)
- price optional (mirrors issuance pricePhrase pattern)
- founding-cohort allowed (no `> incorporation_date` predicate)
- no sub-reason enum on transfer (single phase = `transfer`)
- target picker = existing person OR inline-new (mirrors people pickers)

**Constraint:** No code edits, no migrations, no `npm install`, no commit beyond
this doc. Findings only. Parent verified: HEAD = `96f32ec` (ShareholderCard
single-holding overflow hotfix).

**Predecessor audit:** `docs/audit-share-lifecycle-readiness-2026-05-26.md`
already mapped issuance + cessation + transfer at a Phase-3-wide grain.
**This doc is narrower:** it focuses on what changed since 2026-05-26 (only
`ce3b3e9` cessation-gen + `64f9646` issuance-gen + `96f32ec` hotfix landed —
no schema or transfer-surface drift), and on the concrete delta for a v1
transfer slice with the locks above.

---

## 1. `share_transfers` schema — current state

**Migration chronology** (chronological; transfer-touching only):

| Migration file | Date | Touches transfer? |
|---|---|---|
| `20260511131314_create_share_transfers.sql` | 2026-05-11 | Creates table (Phase 10A Atom 3) |
| `20260511012146_phase10a_fk_restrict.sql` | 2026-05-11 | Comment-only: prep work upstream of atom 3 (no DDL on share_transfers) |
| `20260524215506_create_event_documents.sql` | 2026-05-24 | Backfill INSERT from `share_transfers.resolution_document_id` → `event_documents` (0-row no-op per migration comment) |
| `20260524221747_event_documents_event_phase.sql` | 2026-05-24 | CHECK constraint admits `(share_transfer, transfer)` tuple |

**No follow-up migrations modify `share_transfers` shape** between 2026-05-11
and 2026-05-27 HEAD. The table is as-shipped from Phase 10A Atom 3.

**Columns** (from `20260511131314_create_share_transfers.sql:5-16`):

```sql
CREATE TABLE share_transfers (
  id                       UUID PK DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_shareholding_id     UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  to_shareholding_id       UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  transfer_date            DATE NOT NULL,
  quantity_transferred     INTEGER NOT NULL,
  consideration            TEXT,
  notes                    TEXT,
  resolution_document_id   UUID REFERENCES documents(id),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);
```

**Brief-checklist mapping (what exists vs what doesn't):**

| Brief-named column / concept | Present in `share_transfers`? | Notes |
|---|---|---|
| `transferor_*` / `transferee_*` (person FKs) | **NO** | Transfer party identity is indirect — via FK to `shareholdings` rows whose `holders` (`shareholding_holders`) embed the polymorphic holder. |
| `share_class_id` | **NO** | Indirect via `from_shareholding_id → shareholdings.share_class_id`. Implies same-class invariant (from + to share class must match). |
| `quantity` | YES — column name is `quantity_transferred` (INTEGER NOT NULL) | No `> 0` CHECK at DB level (unlike `shareholdings.quantity`) — risk-tier 4 gap. |
| `transfer_date` | YES (DATE NOT NULL) | |
| `price` / `price_per_share` | **NO discrete column** | Single TEXT column `consideration`. v1 brief lock says "price optional" — current schema is more permissive (free-text). Mismatch worth noting; see §6. |
| `status` | **NO** | Single-state table (existence = transfer). No soft-state machine. |
| `resolution_document_id` | YES (UUID nullable FK → documents) | LEGACY per-table FK, superseded by `event_documents`. Backfilled 2026-05-24 (0 rows). See §5. |
| `end_date` | **NO** | Transfer is an instant, not a temporal range. |
| `deleted_at` | **NO** | No soft-delete (matches shareholdings; differs from director/officer). |
| `is_active` | **NO** | (Same.) |

**Indexes** (`20260511131314_create_share_transfers.sql:19-26`): 4 indexes —
`company_id`, `transfer_date`, `from_shareholding_id`, `to_shareholding_id`.
Sufficient for completeness engine's `.eq('company_id', companyId)` fetch and
for the to-be-built transfer list query.

**RLS** (`20260511131314_create_share_transfers.sql:34-45`): enabled; single
ALL policy mirroring the `shareholdings` per-tenant scoping
(`company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())`).
Mirror is verbatim per LOCK-9 of the migration's source decomposition doc.

**Verdict (§1):** Schema is **ready for v1 capture writes.** Two gaps to
flag (Tier 4): (a) no `quantity_transferred > 0` CHECK; (b) no
`from_share_class_id = to_share_class_id` CHECK (the invariant is implicit
via the two shareholding FKs and the v1 product lock). Neither blocks the
slice — both can be added in a follow-up hardening migration after the UI
ships.

---

## 2. ShareholderCard Transfer button audit

The current `Transfer` affordance is a single disabled placeholder.
`components/shareholders/ShareholderCard.tsx:262-270`:

```tsx
<button
  type="button"
  disabled
  className="group/btn flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] opacity-60"
  title={locale === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
>
  <ArrowRightLeft className="h-3.5 w-3.5" />
  {t('transfer')}
</button>
```

**Surface inventory:**

| # | Location | Line | Conditional predicate | onClick | State | Tooltip |
|---|---|---|---|---|---|---|
| 1 | Bottom action bar (single instance per card) | `ShareholderCard.tsx:262-270` | NONE — always rendered when card renders | (none — `disabled`) | `disabled`, `cursor-not-allowed`, `opacity-60`, muted text | `'Bientôt disponible'` / `'Coming soon'` (inline ternary — NOT i18n via key, by deliberate exception for the placeholder string) |

**Props affected (`ShareholderCardProps`, `:16-41`):** none today — no
`onTransfer` callback prop exists on the interface. Adding the v1 slice will
add a sibling to `onEndShareholding` + `onGenerateIssuance`.

**Granularity question (v1 lock):** the existing patterns for end
(`Terminer`) and issuance (`Générer émission`) are PER-HOLDING (one
affordance per shareholding row in the multi-holding case;
`ShareholderCard.tsx:190-218`). The disabled Transfer button is CARD-LEVEL
(single, in the bottom bar; not duplicated per row).

Per v1 lock "full transfers only" with same-class implied, transfer is
fundamentally a PER-HOLDING op (it transfers ALL of one specific holding
row, including its certificate number). **Recommendation: PER-HOLDING
granularity, matching the cessation+issuance pattern.** This means:
- Multi-holding case: enable + wire the affordance per row in the inner block
  (`ShareholderCard.tsx:195-216`).
- Single-holding case: enable + wire the bottom-bar button at `:262-270`
  (the placeholder already lives there).

Either choice fits the existing layout (`flex-wrap` post-`96f32ec` hotfix
absorbs the extra control without overflow). The per-row choice is the
unanimous lock decision for cessation+issuance; transfer should follow.

**i18n keys already in place:**
- `t('transfer')` — defined at `messages/fr.json:394` ("Transférer") and
  `messages/en.json:394` ("Transfer"). Already wired; no new key needed for
  the button label.
- `messages/fr.json:412-417` `endReasons.transfer` ("Transfert" / "Transfer")
  — historic key from when transfer was a `shareholding.end_reason` value.
  Now orphaned-by-design (Picker excludes it per `EndShareholdingModal.tsx:10-12`).
  Keep — the engine type still admits the value; removal is a separate decision.

**Verdict (§2):** Single disabled placeholder site to wire. Granularity
should match cessation+issuance (per-holding). No additional surfaces lurking
elsewhere — confirmed by `grep` (see §3).

---

## 3. Existing transfer-related code grep

**`grep -r "share_transfer"` (excluding supabase/, docs/, node_modules):**

| File | Line | Use |
|---|---|---|
| `lib/minute-book/event-completeness.ts` | 17, 22, 31, 108, 117, 200, 332 | Engine LABEL entry, `.from('share_transfers')` fetch, `pushAct('share_transfer', t.id, 'transfer', …)` emission |
| `lib/supabase/people-types.ts` | 224, 231 | `EventDocumentType` union member; `EventPhase` `'transfer'` |
| `components/lifecycle/GenerateLifecycleResolutionDialog.tsx` | 33 | Comment: "share_transfer will be appended by the transfer slice" |
| `components/minute-book/EventActRow.tsx` | 109 | Comment: "share_transfer acts have no registry entry in this slice (next slice)" — `deriveDocKey()` returns `null` for transfer |
| `components/minute-book/CompletenessPage.tsx` | 183-185 | Comment: "share_transfer acts remain excluded — its own slice will widen this filter" |
| `components/shareholders/EndShareholdingModal.tsx` | 10-11 | Comment + `Exclude<ShareholdingEndReason, 'transfer'>` type alias |
| `components/shareholders/EditFormerShareholdingModal.tsx` | 15-16, 37 | Same exclusion + type alias |

**`grep -r "transferor|transferee|TransferModal"` (app code, exc. docs):**
**ZERO matches.** No partial implementation, no half-built modal, no orphan
backend handlers.

**`grep -r "share_transfers"` in migrations** (already listed §1): 3 files
— create table, backfill INSERT in event_documents creation, header-comment
references.

**`grep "share_transfers" supabase/schema.sql`:** ZERO matches.
`supabase/schema.sql` (355 lines) appears to predate the share_transfers
migration and was never regenerated. Not a blocker (migrations are
authoritative; schema.sql is documentation) but worth noting for any consumer
who reads `schema.sql` for table inventory.

**Verdict (§3):** Code surface for transfer is entirely **read-side, in the
completeness engine + types module + dialog/registry stubs.** No write path,
no mutation handlers, no client UI. Greenfield slice — no rip-and-replace.

---

## 4. `activity_log.event_type` CHECK enum — current state + proposal

**Verbatim current enum** (24 values, per
`supabase/migrations/20260526120000_phase19d_cessation_activity_log_event_types.sql:37-65`):

```
-- Original 18 (from 20260508210035_create_activity_log.sql)
document_uploaded, document_generated, document_deleted,
director_added, director_removed,
officer_added, officer_removed, officer_replaced,
shareholder_added, shares_issued, share_class_created,
company_created, company_updated,
fiscal_year_activated, fiscal_year_archived,
compliance_item_completed, wizard_completed, settings_updated,

-- Phase 1B-CAPTURE Bundle 2 additions (4)
director_edited, officer_edited,
director_soft_deleted, officer_soft_deleted,

-- #19d Phase 3 cessation additions (2)
shareholding_ended, shareholding_edited
```

**Total = 24.** Constraint name preserved verbatim across all migrations:
`activity_log_event_type_check`.

**Proposed Phase 3-close additions** (working hypothesis for v1 transfer):

| Value | Written by | Justification |
|---|---|---|
| `share_transfer_created` | new TransferModal (mutator) | Mirrors `shareholding_ended` pattern — write at insert time. |
| `share_transfer_edited` | (future) EditTransferModal | Mirrors `shareholding_edited`. Could ship in the same slice or be deferred to a follow-up "edit former transfer" affordance. |

**No `_soft_deleted` variant** — `share_transfers` has no `deleted_at` column
(per §1 + audit-share-lifecycle-readiness-2026-05-26.md §6), so soft-delete
is not an emit-able transition. Matches the precedent set for shareholdings
in the cessation slice (no `shareholding_soft_deleted` despite the symmetric
director/officer pair). If a v1 slice ships create-only and defers edit, the
migration adds just `share_transfer_created` (25 total); if edit ships in the
same slice, add both (26 total).

**Migration shape:** identical pattern to the two precedent migrations
(`20260524190548_*` and `20260526120000_*`) — DROP CONSTRAINT IF EXISTS +
ADD CONSTRAINT with the new full ARRAY. Forward-only and additive.

**Verdict (§4):** One new migration, 1-2 new enum values. Trivial mirror of
the cessation slice's enum migration.

---

## 5. `share_transfers` ↔ `event_documents` linkage — architecture decision

**Two candidate write paths exist at the schema layer:**

**Path A — legacy per-table FK** (column `share_transfers.resolution_document_id`):
- Origin: Phase 10A Atom 3 (`20260511131314_create_share_transfers.sql:14`).
- Designed pre-`event_documents` (Atom 3 landed 2026-05-11; `event_documents`
  landed 2026-05-24, 13 days later).
- Already flagged for deprecation in
  `20260524215506_create_event_documents.sql:26-29`:
  > "Existing partial precedent: share_transfers.resolution_document_id (1:1
  > nullable FK to documents). LEFT IN PLACE — flagged for later deprecation
  > once event_documents is the single read path."
- One-shot backfill at migration-creation time (0 rows; same migration L70-74).
- **NO forward sync** — no DB trigger, no app-layer mirror.

**Path B — generic M:N `event_documents`** (4-col UNIQUE
`(document_id, event_type, event_id, event_phase)`):
- The single read path. Completeness engine reads only this table for
  satisfaction (verified `event-completeness.ts:29-33` header comment + only
  `.from('event_documents')` query in engine).
- CHECK constraint already admits `(share_transfer, transfer)` tuple
  (`20260524221747_event_documents_event_phase.sql:41`).
- All three other event families (director_mandate, officer_appointment,
  shareholding) write exclusively to `event_documents` post-Phase 3.

**Writes to legacy column today:** `grep -rn "resolution_document_id"` in
app code (excluding migrations and docs) returns ONE hit:
`lib/minute-book/event-completeness.ts:31` — and that's a HEADER COMMENT, not
a write. **Zero code paths write `share_transfers.resolution_document_id`.**
The column is write-cold today.

**Risk if both paths persist in v1:**
- If the v1 transfer mutator writes BOTH (mirror to legacy AND insert into
  event_documents), the two diverge the moment one path errors and the other
  succeeds.
- If the v1 transfer mutator writes ONLY `event_documents` but the legacy
  column persists, any future legacy import / partially-extracted ETL could
  re-introduce divergence (engine under-reads transfer evidence).

**Recommended architecture (mirrors cessation slice's choice):**

1. **v1 transfer mutator writes ONLY `event_documents`** with
   `(event_type='share_transfer', event_id=<new transfer id>, event_phase='transfer', document_id=<resolution doc id>)`.
2. **Do NOT write `share_transfers.resolution_document_id`** in v1 app code.
3. **Drop `share_transfers.resolution_document_id`** in the same migration
   bundle as the activity_log enum expansion (§4), OR as a separate Tier 4
   follow-up. Backfill is already done (0 rows then; spot-check at deploy
   time). The audit-share-lifecycle-readiness-2026-05-26.md §5 (lines
   374-379) flagged exactly this: drop BEFORE shipping the transfer capture
   UI, or risk re-introducing the divergence.

**Optional v1.5 trigger-based mirror:** if dropping the column is judged
risky for any external consumer (none known), an alternative is a deferred
DB trigger mirroring `event_documents` inserts back into the legacy column.
Mirror, not gate. Adds maintenance for zero benefit — only do this if a known
consumer exists.

**Verdict (§5):** Drop the legacy column in the transfer slice's schema
atom (alongside the activity_log enum expansion). Mutator writes
`event_documents` only. Engine read path is unchanged.

---

## 6. Other transfer-adjacent surfaces worth flagging

**a. `docs/audit-share-lifecycle-readiness-2026-05-26.md`** —
predecessor audit. §§3-7 are still valid for transfer; §6 ("Capture state")
is the canonical "what's missing" map. This new doc narrows that to v1
locks.

**b. `messages/fr.json` + `messages/en.json` i18n keys**:
- `shareholders.transfer` ("Transférer" / "Transfer") — already wired.
- `shareholders.endReasons.transfer` ("Transfert" / "Transfer") —
  orphaned-by-design picker exclusion. Decision: KEEP (no harm; engine type
  union still admits the value).
- **No transfer-specific keys exist for**: transfer modal title, "transfer
  to" picker label, "transferred from / to" rendering on a future former-
  transfers list, "Générer transfert" CTA, "Transfert généré" satisfied
  badge. These need adding in the v1 slice (mirror `generateIssuance` /
  `issuanceGenerated` from `:420-421`).

**c. `lib/pdf/lifecycle-templates.ts` (`LIFECYCLE_TEMPLATES`)** — currently
7 docKeys (director × 3, officer × 2, shareholding × 2). Adding transfer
requires:
- Extending `LifecycleEventType` (`:46-49`) to add `'share_transfer'`.
- Extending `LifecycleEventPhase` (`:51-55`) to add `'transfer'`.
- Adding one or more `share_transfer*` entries to the registry.
- Lawyer-authored FR + EN body content (the long pole — same gating noted in
  the 2026-05-26 audit §3 "lawyer-gated").

**d. `components/lifecycle/GenerateLifecycleResolutionDialog.tsx`** —
`docKey` union (`:36-46`) explicitly excludes share_transfer. Extending this
union is a 1-line change. Comment at `:33-34` already pre-promises the
extension.

**e. `components/minute-book/EventActRow.tsx`** — `deriveDocKey()`
(`:82-111`) returns `null` for `share_transfer` today. Wire the new docKey
mapping there to enable the generate CTA in Complétude per-year cards.

**f. `components/minute-book/CompletenessPage.tsx`** — admission filter
(`:179-209`) excludes share_transfer today. Widening is the same `||
isShareTransfer` shape added to the existing OR chain. Single-line change.

**g. `lib/pdf/generate-lifecycle-document.ts`** — orchestrator currently
hardcodes director_mandate + officer_appointment + shareholding event-table
dispatch (per 2026-05-26 audit §4). Adding transfer requires a 4th branch
that reads from `share_transfers` with appropriate JOINs to resolve `from`
and `to` holder names via `shareholding_holders`. Significant per the
audit but mechanically additive; the issuance slice (`64f9646`) already
established the holderName polymorphism pattern.

**h. `app/api/minute-book/generate-lifecycle/route.ts`** —
wire-format-agnostic auth/validation wrapper (`:1-80` reviewed). No transfer
work needed here; the new docKey flows through transparently once the
orchestrator dispatches it.

**i. `lib/minute-book/event-completeness.ts`** — `share_transfer` acts are
already emitted (`:330-333`). NO admission gating (always flagged, per
header `:17`). For v1 with "founding-cohort allowed" lock, this matches —
NO `afterIncorp(t.transfer_date)` predicate to add.

**j. Holder resolution for "to" side** — the inline-new lock means the
TransferModal must either (a) accept an existing-shareholding target OR
(b) create a new `shareholdings` row (with `quantity=0` until the transfer
INSERT? or `quantity=<transferred>` and skip share_transfers? — open
question for §7). Today, `IssueSharesModal.tsx` is the only mutator that
creates `shareholdings` rows; reusing its person-picker + create-person
inline flow is straightforward.

**k. ShareholderCard footer redundancy** — the post-`96f32ec` bottom action
bar already shows Edit + Terminer + Issuance + Transfer for single-holding
cards. If transfer goes per-holding (per §2 recommendation), the bottom-bar
Transfer button will mirror the bottom-bar Terminer pattern — only render
when `shareholdings.length === 1`. For multi-holding, transfer appears in
the inner per-row block (`:193-218`). No layout debt introduced.

---

## Open questions for Max

1. **Transfer-source vs transfer-destination shareholdings — single mutator
   atom?** The v1 lock "full transfer" means: zero the source row's
   quantity (or end_date it?) AND create/credit the destination row AND
   insert into `share_transfers`. Three writes that must succeed
   atomically. **Question:** preferred orchestration —
   (a) RPC/postgres function (atomic by definition);
   (b) sequential supabase-js with reverse-on-error in app code;
   (c) batch via a single Edge function?
   Cessation+issuance both used (b); transfer's three-write pattern argues
   for (a). Recommend a small RPC `transfer_shares(from_sh_id, to_person,
   transfer_date, consideration)`.

2. **Source-side shareholding lifecycle on transfer** — when a holding is
   fully transferred, does the source row:
   (i) get `end_date = transfer_date` + `end_reason = 'transfer'` set on it
   (re-enabling the picker entry the 2026-05-26 lock excluded), OR
   (ii) get deleted (impossible — FK is RESTRICT), OR
   (iii) stay as-is with `quantity_transferred` summing to the original?
   Recommend (i) — symmetric with cessation, makes "former holdings" view
   uniform, and the existing `EditFormerShareholdingModal` will need to
   re-admit `'transfer'` in its picker if so. (Compare
   `EditFormerShareholdingModal.tsx:37`.)

3. **`consideration` TEXT vs structured price** — the v1 lock says "price
   optional" (mirror issuance's `pricePhraseFr/En` pattern). Issuance uses a
   NUMERIC `issue_price_per_share` and composes the phrase in the
   orchestrator. The `share_transfers.consideration` column is TEXT. Two
   options:
   (i) Leave TEXT — the modal sends `"$1.00 per share"` (free-form), the
       orchestrator inlines it verbatim into the template;
   (ii) Add NUMERIC `price_per_share` column (parallel to issuance), keep
        TEXT `consideration` for free-form addenda ("plus assumption of
        debt", "for nominal consideration", etc.).
   Recommend (ii) for parity + numeric-aggregation later, but (i) ships
   faster.

4. **`activity_log` enum — create only, or create + edit in v1?** §4
   proposes both `share_transfer_created` and `share_transfer_edited`. The
   "edit transfer" UX may or may not be in v1 scope. **Question:** does v1
   include an edit affordance, or is create-only the cut?

5. **Drop legacy `share_transfers.resolution_document_id` in v1 schema
   atom?** Recommended in §5. Confirm — this is the "drop BEFORE shipping
   transfer UI" moment the 2026-05-26 audit (§5, lines 374-379) flagged.

6. **Template wording (lawyer gate)** — the long pole per 2026-05-26 audit
   §3 / §7. **Question:** does Max already have transfer-resolution FR + EN
   bodies ready, or does v1 ship CAPTURE-ONLY (write to share_transfers,
   surface in Complétude as missing, upload-to-satisfy via existing
   event_documents path) and defer generation to v1.5?

7. **Inline-new target person — share-class assignment** — v1 lock says
   "ind-to-ind only", same class implied. **Question:** does the
   destination shareholding inherit `share_class_id` from the source
   automatically (no UI), or does the picker show class + force a confirm?
   Recommend automatic inherit (no UI control; same-class is a lock).

8. **Founding-cohort transfer act (`transfer_date <= incorporation_date`)
   — display label?** Issuance and appointment acts have a
   "founding-cohort" exclusion in the engine; transfer doesn't. For v1
   "founding allowed", a transfer dated on or before incorporation IS
   emitted by the engine. **Question:** is that the desired UX (transfer
   shows in Complétude as a missing act starting day 0) or should it be
   silently excluded the way founding director appointments are?

---

**STOP.** Investigation ends here. No code or schema written. No commit
beyond this doc. No deploy.
