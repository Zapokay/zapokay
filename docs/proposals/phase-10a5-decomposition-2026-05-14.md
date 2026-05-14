# Phase 10A.5 Decomposition Proposal — Entity-Typed Shareholders + Joint Holders

**Status:** PROPOSAL v0.1 — May 14, 2026
**Author:** Max (CTO)
**Purpose:** Architectural sketch + atom decomposition for the data-model + UI + PDF work that closes the Q1 + Q4 gap surfaced in `docs/investigations/trust-and-joint-shareholder-data-model-2026-05-14.md` and consumes the convention in `docs/specs/signature-block-convention-2026-05-14.md`.
**Sequencing:** Ships **before** Phase 10B. Phase 10B's as-of-date resolver branches on entity type, which requires this work.
**Pattern reference:** Phase 10A precedent — atom-based shipping with R-G audits between atoms. This proposal mirrors that pattern.

---

## 1. Why this exists

The CC gap analysis confirmed that none of the four layers (schema / TS types / UI / PDF render) currently support:
- Trust shareholders (Q1, LOCKED Yes for v1.0)
- Corporate shareholders (Decision B, LOCKED — generalize now)
- Joint shareholders (Q4, LOCKED Yes for v1.0)

CC's effort estimate was ~5–6 CC-days for trust + joint. Adding corporate shareholders on top adds ~0.25–0.5 day given the discriminator architecture is already designed. **Total Phase 10A.5 budget: ~5–7 CC-days across 4 atoms** plus 1 R-G audit cycle.

This phase blocks v1.0 launch on the Q-OFFICER-SIG-1 / due-diligence quality track. It does not block other parallel pre-launch work (Actionnaires audit, NB1 Edit Director scaffold, etc.).

---

## 2. Architectural overview

### 2.1 The shape

Decision A locked = **A.2 separate `shareholder_entities` table.** Three concepts:

1. **Individual** — natural person, modeled in existing `company_people` table (no change to that table's row shape).
2. **Entity** — trust or corporation, modeled in new `shareholder_entities` table.
3. **Holder** — the abstraction over "who owns this shareholding." A shareholding can have 1+ holders. Each holder is either an individual OR an entity.

The shareholding-to-holder relationship moves from a direct `person_id` FK on `shareholdings` to a join table `shareholding_holders` that supports:
- Multiple holders per shareholding (joint holders case)
- Polymorphic holder type (individual via `person_id` OR entity via `entity_id`)

### 2.2 Why a join table even when 1 holder is the default

CC's report estimated joint-holder support as comparable effort to trust support precisely because the data model needs an array-of-holders structure. Building that structure once via `shareholding_holders` is cleaner than retrofitting later. The 1-holder case is `shareholding_holders` with one row.

### 2.3 Temporal pattern consistency

Phase 10A locked temporal patterns for shareholdings (`shareholdings.end_date`, `share_transfers` greenfield). Entity signatories (trustees, corporate officers) need parallel temporal columns:
- `shareholder_entity_signatories.start_date`, `end_date`, `end_reason`

This way as-of-date resolution works uniformly: "who were the trustees of Fiducie Roussy on 2024-12-31?" answers the same way "who were the directors on 2024-12-31?" does.

---

## 3. Atom decomposition

Mirrors Phase 10A's atom shipping discipline. Each atom is independently shippable (with proper feature flagging or no-write codepath protection where needed).

### Atom 1 — Schema (FOUNDATIONAL)

**Tables to create:**

1. **`shareholder_entities`** — entity-shareholder table
   - `id UUID PK`
   - `company_id UUID FK` (the corporation whose shareholder this is — i.e., which minute book this entity-shareholder appears in)
   - `entity_type ENUM('trust', 'corporation') NOT NULL`
   - `legal_name TEXT NOT NULL`
   - `jurisdiction TEXT` (e.g., 'QC', 'CA-Federal', 'ON', 'US-Delaware')
   - `entity_number TEXT` (NEQ for QC corps, corporation number for federal corps; nullable for trusts)
   - `date_constituted DATE` (for trusts — date the trust was settled)
   - `date_incorporated DATE` (for corporations)
   - `address_*` fields (mirror `company_people` address shape)
   - `created_at`, `updated_at`

2. **`shareholder_entity_signatories`** — trustees (for trusts) / authorized officers (for corporations)
   - `id UUID PK`
   - `entity_id UUID FK → shareholder_entities(id) ON DELETE RESTRICT`
   - `person_id UUID FK → company_people(id) ON DELETE RESTRICT` (the human who signs on the entity's behalf)
   - `role TEXT NOT NULL` (e.g., `fiduciaire`, `président`, `secrétaire`, `administrateur autorisé`)
   - `start_date DATE NOT NULL`
   - `end_date DATE` (nullable; null means still active)
   - `end_reason TEXT` (nullable)
   - `display_order INT` (controls order on signature block)
   - `created_at`, `updated_at`
   - CHECK: `end_date IS NULL OR end_date >= start_date`

3. **`shareholding_holders`** — join table; one shareholding has 1+ holder rows
   - `id UUID PK`
   - `shareholding_id UUID FK → shareholdings(id) ON DELETE CASCADE`
   - `holder_type ENUM('individual', 'entity') NOT NULL`
   - `person_id UUID FK → company_people(id) ON DELETE RESTRICT` (set iff `holder_type='individual'`)
   - `entity_id UUID FK → shareholder_entities(id) ON DELETE RESTRICT` (set iff `holder_type='entity'`)
   - `display_order INT` (controls order on signature block when joint)
   - `created_at`
   - CHECK: exactly one of `person_id` / `entity_id` is non-null per row, consistent with `holder_type`
   - UNIQUE: `(shareholding_id, person_id)` and `(shareholding_id, entity_id)` to prevent duplicate holders on same shareholding

4. **Modify `shareholdings`:**
   - Existing `person_id` column: **deprecate** (do NOT drop yet; back-compat during transition).
   - Backfill: for every existing `shareholdings` row, insert one `shareholding_holders` row with `holder_type='individual'` and `person_id` copied from `shareholdings.person_id`, `display_order=0`.
   - After backfill verification, `shareholdings.person_id` becomes a derived / convenience column, kept in sync via trigger OR removed in atom-1.5 follow-up after all code paths migrate.

**Migration safety:** all changes are additive. `shareholding_holders` backfill is idempotent. Existing reads via `shareholdings.person_id` continue working during transition. No production data loss path.

**Atom 1 done when:**
- Migration applies cleanly on dev/prod (single Supabase project).
- Backfill query verifies: count of `shareholding_holders` rows = count of `shareholdings` rows (pre-migration baseline).
- R-G audit confirms no orphan rows, no FK-violation rows.

**Atom 1 effort estimate:** 0.5–1 CC-day.

---

### Atom 2 — TypeScript types + API hydration

**New types:**

```ts
type ShareholderEntity = {
  id: string;
  company_id: string;
  entity_type: 'trust' | 'corporation';
  legal_name: string;
  jurisdiction: string | null;
  entity_number: string | null;
  date_constituted: string | null;
  date_incorporated: string | null;
  // ... address fields
};

type ShareholderEntitySignatory = {
  id: string;
  entity_id: string;
  person_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
  end_reason: string | null;
  display_order: number;
};

type ShareholdingHolder = {
  id: string;
  shareholding_id: string;
  holder_type: 'individual' | 'entity';
  person_id: string | null;
  entity_id: string | null;
  display_order: number;
};

// Discriminated union for hydrated holder
type Holder =
  | { kind: 'individual'; person: CompanyPerson }
  | { kind: 'trust'; entity: ShareholderEntity; trustees: { person: CompanyPerson; role: string }[] }
  | { kind: 'corporation'; entity: ShareholderEntity; signing_officer: { person: CompanyPerson; role: string } };

// Updated Shareholding shape
type ShareholdingWithHolders = Shareholding & {
  holders: Holder[];
  share_class: ShareClass;
};
```

**API hydration updates:**
- `app/api/shareholdings/*` route handlers
- `lib/pdf/generatePdfDocument.ts` shareholder loader (currently joins `shareholdings` → `company_people` directly; update to join through `shareholding_holders`)
- Any other consumers — atom 2 brief enumerates the full list via codebase grep

**Atom 2 done when:**
- All TS compilation passes.
- API responses include `holders` array correctly hydrated for both individual-only and entity-bearing shareholdings.
- Smoke test: existing pre-migration shareholdings render their single individual holder correctly through the new hydration path.

**Atom 2 effort estimate:** 0.25–0.5 CC-day.

---

### Atom 3 — UI: shareholder management surfaces

**Largest atom.** Touches the most surface area.

**Sub-atoms:**

**3.A — Split `IssueSharesModal` into two flows:**
- New `AddShareholderModal` — creates a shareholder identity (individual / trust / corporation) without issuing shares
- Existing `IssueSharesModal` — pick existing shareholder + issue shares (subsumes current "or create new" inline path)

**3.B — `AddShareholderModal` design:**
- Step 1: Entity-type selector (Individual / Trust / Corporation) — three radio options or tabbed UI
- Step 2 (per type):
  - **Individual:** existing `PersonSelector` UX (create or pick)
  - **Trust:** trust legal name, jurisdiction, date constituted, address fields + trustee picker (1+ trustees with `PersonSelector` per trustee + role default `fiduciaire` + add/remove trustees)
  - **Corporation:** corp legal name, jurisdiction, NEQ/corp number, date incorporated, address fields + authorized signing officer picker (`PersonSelector` + role text field defaulting to `administrateur autorisé`)

**3.C — `IssueSharesModal` joint-holder support:**
- "Add another joint holder" button after the primary holder picker
- Joint holders constrained to individual-only (per spec §8.4) — joint holder picker offers only Individual mode
- Cap at e.g. 4 joint holders for v1.0 sanity (configurable in code)

**3.D — `EditShareholdingModal` parity:**
- Edit joint holders (add/remove)
- Edit entity shareholder swap (rare, but possible if data was entered incorrectly)
- Trustee / signing-officer changes happen on the *entity*, not on the shareholding — so those go through a separate `EditShareholderEntityModal` or an entity-detail surface

**3.E — Shareholder display surfaces:**
- `ShareholderCard` — render individual / trust / corp + holders list coherently
- `CapTableChart` — display entity shareholders + joint holders correctly (single line per shareholding, with appropriate label)
- Actionnaires page list view — entity shareholders show entity legal name; joint holders show concatenated names per §4.2.1

**3.F — Entity-detail surface (new):**
- `app/(dashboard)/actionnaires/entities/[id]/page.tsx` — entity profile
- Trustee / signing-officer roster with start/end dates (mirrors Dirigeants surface pattern)
- Add/remove/edit trustees + officers (with temporal preservation per the Dirigeants §3.6 two-step pattern)

**Atom 3 done when:**
- WA #15 dual-locale visual gate passes for all new/modified modals + display surfaces (FR + EN).
- Manual fixture-data test: create each of (1 individual, 1 trust with 2 trustees, 1 corporation with 1 signing officer, 1 joint individual+individual) and verify they appear correctly on Actionnaires page + cap table.
- No regression on existing single-individual shareholdings.

**Atom 3 effort estimate:** 1.5–2.5 CC-days. **Largest atom.** Consider splitting across two CC sessions if needed.

---

### Atom 4 — PDF render branching

**Files to modify:**
- `lib/pdf/generatePdfDocument.ts` — replace direct `full_name` mapping with branching on `Holder` discriminated union
- `lib/pdf-templates/signature-blocks.ts` — `Signatory` type extends to support entity-with-signatories + joint composition; HTML rendering branches per pattern in spec §4.2.1
- `document_templates` table rows (12 existing) — closing sentence + signature-block sections updated to use placeholder tokens that resolve at render time per spec §4

**Signature block HTML/PDF rendering rules per spec §4.2.1:**

```
INDIVIDUAL:
<line>__________________________________</line>
<name>DOMINIQUE ROUSSY</name>

TRUST (1 trustee):
<entity-header>FIDUCIE FAMILIALE ROUSSY</entity-header>
<sub-line><label>Par :</label> ____________________</sub-line>
<sub-name>Dominique Roussy, fiduciaire</sub-name>

TRUST (3 trustees):
<entity-header>FIDUCIE FAMILIALE ROUSSY</entity-header>
<sub-line><label>Par :</label> ____________________</sub-line>
<sub-name>Dominique Roussy, fiduciaire</sub-name>
<sub-line><label>Par :</label> ____________________</sub-line>
<sub-name>Stéphanie Marchand, fiduciaire</sub-name>
<sub-line><label>Par :</label> ____________________</sub-line>
<sub-name>Jean-Alexis Doyon, fiduciaire</sub-name>

CORPORATION:
<entity-header>9876-5432 QUÉBEC INC.</entity-header>
<sub-line><label>Par :</label> ____________________</sub-line>
<sub-name>Dominique Roussy, président</sub-name>

JOINT (2 individuals):
<line>__________________________________</line>
<name>JEAN TREMBLAY et MARIE LAVOIE</name>
```

**Locale switching:** `Par :` ↔ `Per:`, `fiduciaire` ↔ `Trustee`, role labels per §5 mapping table.

**Atom 4 done when:**
- Test fixture exercising all four patterns (individual / trust / corp / joint) renders correct PDFs for both FR and EN.
- WA #15 visual gate passes.
- Aria signs off on typographic detail vs. real Quebec law-firm samples.

**Atom 4 effort estimate:** 0.5–1 CC-day.

---

## 4. R-G Audit (between atoms 1-2 and atom 3)

Following Phase 10A precedent (R-G1 audit at `22aad9a`): after atoms 1 + 2 land, run a read-graph audit confirming:
- All shareholder-loading code paths now route through `shareholding_holders`
- No vestigial direct reads of `shareholdings.person_id` remain
- The polymorphic FK pattern is consistently applied

This protects atom 3 from building UI on a partially-migrated data layer.

**Audit effort:** ~0.25 CC-day. Output: `docs/audit-shareholder-holders-2026-05-XX.md`.

---

## 5. Sequencing & total budget

| Atom | Effort | Cumulative | Notes |
|---|---|---|---|
| Atom 1 — Schema | 0.5–1 day | 0.5–1 | Migration + backfill + R-G1 verification |
| Atom 2 — Types + API | 0.25–0.5 day | 0.75–1.5 | TS + hydration updates |
| R-G2 audit | 0.25 day | 1.0–1.75 | Confirm read-path uniformity |
| Atom 3 — UI | 1.5–2.5 days | 2.5–4.25 | Largest atom; consider splitting across CC sessions |
| Atom 4 — PDF render | 0.5–1 day | 3.0–5.25 | Final atom; Aria visual review required |

**Total Phase 10A.5 budget:** ~3–5.25 CC-days. CC's original estimate was 5–6; this proposal is tighter because it lays out the architecture up front, removing exploration time during execution.

**Each atom = 1 CC brief = 1 commit + 1 Vercel deploy per WA #11/13.** ~5 deploy events total for Phase 10A.5.

---

## 6. Open architectural questions (resolve before Atom 1 brief authoring)

Walking these together before I write the Atom 1 brief avoids mid-execution surprise.

### Q-10A5-1 — Ownership-fraction tracking for joint holders

When two individuals hold one shareholding jointly, do we track ownership fractions (e.g., 50/50, or 70/30) or treat them as collectively owning the whole shareholding with no internal split?

- **Option a:** No fraction column. Joint holders collectively own the shareholding. Spec §4.2.1 joint convention works without fractional data. Simpler.
- **Option b:** Add `shareholding_holders.ownership_fraction DECIMAL(5,4)` (sums to 1.0 per shareholding). Useful for tax / estate purposes; not needed for signature blocks.

**Max recommendation:** Option (a) for v1.0. Joint ownership is legally joint-and-several in QC; internal fractions are typically a private side agreement, not surfaced on corporate resolutions. Add the column later if customer demand surfaces. Lower data-entry burden for users.

### Q-10A5-2 — `shareholdings.person_id` deprecation timing

Atom 1 inserts `shareholding_holders` rows but keeps `shareholdings.person_id` in place during transition. When do we drop it?

- **Option a:** Drop in Atom 2 once all code paths migrate. Clean break.
- **Option b:** Keep as derived column with trigger sync. Forever back-compat.

**Max recommendation:** Option (a). Phase 10A's discipline was clean breaks once read-graph audits confirmed migration. We follow the same pattern. The column is dead state after atom 2; dead state is technical debt.

### Q-10A5-3 — `shareholder_entity_signatories.role` free-text vs enum

Trustees always have role `fiduciaire`. Corporate signing officers have varying roles: `président`, `secrétaire`, `vice-président`, `administrateur autorisé`, or custom.

- **Option a:** Free-text. Maximum flexibility; risk of typos / inconsistency.
- **Option b:** Enum of common roles + `'custom'` with free-text fallback. Like `officer_appointments.title` (which already uses this pattern per current codebase).

**Max recommendation:** Option (b), mirroring existing `officer_appointments.title` pattern for consistency. Locked enum: `fiduciaire`, `président`, `vice-président`, `secrétaire`, `trésorier`, `administrateur autorisé`, `custom`. Trustees default to `fiduciaire`; corporate signing officers default to `administrateur autorisé`.

### Q-10A5-4 — Address fields on `shareholder_entities`

Trusts and corporations have addresses. Do we model these inline on `shareholder_entities` (mirror `company_people` shape) or via a separate address model?

- **Option a:** Inline columns. Simpler. Inconsistent if we later normalize addresses.
- **Option b:** Separate `addresses` table referenced by various entity types. Cleaner long-term; more code surface now.

**Max recommendation:** Option (a) for v1.0 — mirror `company_people` exactly. Normalize addresses (if needed) as its own atom later when there's a real reason. Avoiding premature abstraction.

### Q-10A5-5 — Entity scope: company-scoped or global

A trust or corporation may hold shares in multiple Sociétés. Is `shareholder_entities` company-scoped (one row per appearance per Société) or globally scoped (one row, referenced by many Sociétés)?

- **Option a:** Company-scoped. Each `shareholder_entities` row belongs to one `company_id`. If Fiducie Roussy holds shares in three Sociétés, three rows exist. Simpler RLS. Matches existing `company_people` pattern.
- **Option b:** Global. One Fiducie Roussy row, referenced from any company. Tighter normalization. RLS becomes complex.

**Max recommendation:** Option (a). Consistent with how `company_people` is already scoped. ZapOkay's product surface is per-Société; cross-Société entity reuse is not a v1.0 need. Add a global-entities feature later if customer demand surfaces.

### Q-10A5-6 — Mixed-type joint holders v1.0 enforcement layer

Spec §4.2.1 / §8.4 says joint holders are individuals-only. Where do we enforce?

- **Option a:** Schema-level CHECK constraint on `shareholding_holders` forbidding entity rows on multi-row shareholdings.
- **Option b:** Application-level enforcement in UI + API; schema permissive.

**Max recommendation:** Both. CHECK constraint as the floor (defense-in-depth) + UI gating as the UX-friendly enforcement. Belt and suspenders.

### Q-10A5-7 — Backfill commit timing

Atom 1 migration creates `shareholding_holders` and runs the backfill. Is the backfill in the same migration commit or a separate post-migration job?

- **Option a:** Same migration commit. Atomic.
- **Option b:** Migration creates table; separate script populates. Allows for staged rollout.

**Max recommendation:** Option (a). Single Supabase project (dev = prod per WA #13); no staged-rollout option. Atomic migration is safer. Migration commit body documents the backfill SQL clearly.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Atom 1 migration breaks existing single-individual shareholding code paths during the transition window | Keep `shareholdings.person_id` in place during atoms 1-2; R-G2 audit verifies all reads migrated before atom 2's deprecation |
| Atom 3 UI scope creeps and ships late | Sub-atom decomposition (3.A–3.F) lets us ship per-modal incrementally; non-critical surfaces (CapTableChart, Actionnaires display) can defer to a small follow-on atom if Atom 3 main path hits time pressure |
| Spec §4.2.1 conventions miss a real-world edge case discovered during atom 3 or 4 implementation | Treat as a spec amendment, not an implementation hack. Update spec → re-bake atom brief. WA #11 per-edit discipline catches accidental drift |
| Trustee/officer changes mid-period affect resolution rendering in Phase 10B | Already handled by temporal columns on `shareholder_entity_signatories` (atom 1 design). Phase 10B atom consumes these the same way it consumes director_mandates temporal columns |
| Aria visual review pushes back on signature block typography after atom 4 lands | Aria review queued in atom 4's WA #15 gate; happens before merge, not after. Spec §6 already flags the Helvetica vs. Times-family question |

---

## 8. Walk-through plan

Recommend a 30-minute Max + Dom session to walk Sections 3 (atom decomposition) + 6 (open questions) together. Outcome: Q-10A5-1 through Q-10A5-7 locked, atom 1 brief authoring unblocked.

If you'd rather not synchronously walk it, you can reply to this proposal with numbered answers per §6 (e.g. "1=a, 2=a, 3=b, 4=a, 5=a, 6=both, 7=a") and I author atom 1 brief from your decisions directly. Most of my recommendations are conservative defaults; deviating from any of them is fine as long as we lock before atom 1 starts.

---

**End of Phase 10A.5 decomposition proposal.** Ready for Dom review and Q-10A5 architectural lock.
