# Investigation: Trust + Joint Shareholder Data Model Gap Analysis

**Date:** 2026-05-14
**Author:** CC
**Companion spec:** `docs/specs/signature-block-convention-2026-05-14.md` §10 Q1 (LOCKED Yes) + Q4 (OPEN)
**Scope:** Read-only. No schema, type, UI, or PDF code changes.

---

## TL;DR

- **Q1 — Trust shareholders:** **NOT currently supported.** Gap: zero of the four layers (schema / types / UI / PDF render) has any notion of an entity-type discriminator, a trust entity, or a trustee linkage. Closing the gap requires net-new work across all four layers.
- **Q4 — Joint shareholders:** **NOT currently supported.** Each `shareholdings` row is bound to exactly one `company_people` row via a single `NOT NULL` FK; no join table, no array column, no UI affordance, no joined-name composition in the PDF render path.

---

## Q1 — Trust shareholders (LOCKED Yes — gap analysis)

### Schema findings

`supabase/migrations/20260405000000_sprint6_people_ownership.sql`:

- `company_people` columns: `id`, `company_id`, `full_name`, plus individual-person fields (date_of_birth, address_*, is_canadian_resident, etc.). **No `entity_type`, no `is_trust`, no `legal_entity_type`, no `entity_kind`.**
- `shareholdings.person_id` is a `NOT NULL` FK to `company_people(id)`. There is no alternate FK to an entity-style table.
- No `trust_entities`, `shareholder_trusts`, `shareholder_entities`, `legal_entities`, or equivalent table exists anywhere in `supabase/migrations/`.
- No `trust_trustees` or any join table connecting one entity to multiple individuals.
- Phase 10A atoms 1-4 (commits `09dcf11`, `3e65770`, `3cb08c4`, `18578f8`) added temporal columns and a `share_transfers` greenfield table. None touched entity typing. `share_transfers.from_person_id` / `to_person_id` are themselves single FKs into `company_people` — they will inherit any entity-typing decision made here.
- Glob `supabase/migrations/*trust*` → empty result.

### Type findings

`lib/supabase/people-types.ts`:

- `CompanyPerson` interface: `full_name: string` only as an identity field; no discriminator field, no entity-type union.
- `Shareholding.person_id: string` — single FK.
- `ShareholdingWithDetails.person: CompanyPerson` (singular reference).
- No `ShareholderEntity`, `LegalEntity`, `TrustEntity`, or `'individual' | 'trust'` union type exists.

### UI findings

`components/shareholders/IssueSharesModal.tsx`:

- Single `PersonSelector` instance bound to a single `personValue`.
- No "Entity type" / "Shareholder type" / "Trust" toggle.
- No trustee-attachment surface.
- Insert payload carries one `person_id` derived from the single selector.

`components/people/PersonSelector.tsx` (lines 1-80):

- `PersonSelectorValue` discriminated union: `'existing'` (pick existing) | `'new'` (create new). Both modes operate on individual-person fields only. No `'trust'`, `'entity'`, or `'corporation'` mode.

`components/shareholders/**/*.tsx`: **no `AddShareholderModal` exists.** Shareholders are added exclusively via `IssueSharesModal`. There is no alternate code path that could already support trusts.

### PDF render findings

`lib/pdf/generatePdfDocument.ts` (around lines 184-194):

```typescript
const { data: shareholdings } = await supabaseAdmin
  .from('shareholdings')
  .select('id, quantity, company_people(id, full_name), share_classes(name)')
  .eq('company_id', companyId)
  .is('end_date', null);

const activeShareholders = (shareholdings ?? []).map((s) => ({
  name: (s.company_people as unknown as { full_name: string }).full_name,
  shares: s.quantity as number,
  shareClass: (s.share_classes as unknown as { name: string } | null)?.name ?? 'A',
}));
```

Single `full_name` string per shareholding. No branching on shareholder type. No trust/trustee composition logic.

`lib/pdf-templates/signature-blocks.ts`:

```typescript
export interface Signatory { id: string; name: string; role: string; }
```

`name` is a single string composed verbatim into the signature block (one signature line, one printed name, one role). No "Trust X, by trustee Y" composition; no multi-line trustee enumeration.

### Gap summary

- **Schema gap (NEW WORK REQUIRED):**
  - Add entity-type discriminator. Two viable shapes: (a) extend `company_people` with `entity_type ENUM('individual','trust',...)` + nullable trust-specific fields; or (b) introduce a separate `shareholder_entities` table and migrate `shareholdings.person_id` to a polymorphic / typed FK. Option (a) is cheaper but conflates two row shapes; option (b) is cleaner but touches more code.
  - Add trustee linkage. If trusts have multiple trustees, this is a `trust_trustees(trust_id, person_id, ...)` join table OR a single `primary_trustee_person_id` FK on the entity row, depending on spec needs.
  - Decide whether `share_transfers.from_person_id` / `to_person_id` should also be typed (consistency cost — but not blocking for first ship if transfers are individual-only at v1.0).

- **Type gap (NEW WORK REQUIRED):**
  - New `ShareholderEntity` / `TrustEntity` interface OR extend `CompanyPerson` with `entity_type` + trust fields.
  - Discriminated union for `Shareholding.holder` (or rename `person` → `holder`) covering both individual and trust shapes.
  - Update `ShareholdingWithDetails` to reflect new shape, plus any types in API routes that hydrate shareholders.

- **UI gap (NEW WORK REQUIRED):**
  - `IssueSharesModal`: add an entity-type toggle (Individual / Trust). When Trust selected, surface trust-entity fields (trust name, jurisdiction, date constituted, etc. — TBD per spec) and a trustee picker (likely a `PersonSelector` plus "add another trustee").
  - Likely introduce a dedicated `AddShareholderModal` or split the existing modal — `IssueSharesModal` currently conflates "create shareholder identity" and "issue shares" into one form. Trust shareholders complicate that single form.
  - `EditShareholdingModal`: parallel updates so a trust shareholder can be edited.
  - Shareholder display surfaces (e.g. `ShareholderCard`, `CapTableChart`) must render trust names + trustees coherently.

- **PDF render gap (NEW WORK REQUIRED):**
  - `generatePdfDocument.ts` shareholder query must include entity-type + trustee data (join through new entity / trustee tables).
  - `signature-blocks.ts` `Signatory` must accept either a single name or a structured trust-with-trustees shape. Render branching: individuals render `"Name"`; trusts render something like `"Trust X, par son fiduciaire Y"` / `"Trust X, by its trustee Y"` (final wording in spec).
  - All call sites that build `Signatory[]` need to be updated to emit the new shape.

### Conclusion

**Not currently supported; gaps exist across all four layers.** Rough effort estimate (CC time, sequential):

| Layer | Estimate | Notes |
|---|---|---|
| Schema | ~0.5–1 day | Greenfield additive migration if approach (a); larger if (b) with FK shape change. |
| Types | ~0.25 day | Mechanical once schema lands. |
| UI | ~1–2 days | Largest area; trust + trustees + Edit modal parity + display surfaces. |
| PDF render | ~0.5 day | Once types are in place, branching is small but every signature-block call site must be touched. |

Total rough estimate: **~2.5–4 CC-days**, dominated by UI work. This is a sprint-scope effort, not a same-brief addition to the spec-lock work.

---

## Q4 — Joint shareholders (decision pending)

### Schema findings

`supabase/migrations/20260405000000_sprint6_people_ownership.sql`:

```sql
CREATE TABLE IF NOT EXISTS shareholdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id UUID NOT NULL REFERENCES company_people(id) ON DELETE CASCADE,
  share_class_id UUID NOT NULL REFERENCES share_classes(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  issue_date DATE NOT NULL,
  issue_price_per_share DECIMAL(12,4),
  certificate_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- Single `NOT NULL` `person_id` FK. No `joint_holder_ids UUID[]`, no `joint_with_person_id` column.
- No `shareholding_holders` or equivalent join table anywhere in `supabase/migrations/`.
- Phase 10A `share_transfers` table (commit `3cb08c4`) similarly assumes single-holder semantics on both `from_person_id` and `to_person_id`.

### UI findings

`components/shareholders/IssueSharesModal.tsx`: one `PersonSelector` instance; no "Add another holder" button; no array UI; insert payload assembles a single `person_id`.

`components/shareholders/EditShareholdingModal.tsx`: present (Glob-confirmed); sibling-component shape implies single-shareholding edit semantics — no joint-holder editor surface.

### PDF render findings

`generatePdfDocument.ts` maps each shareholding to `{ name, shares, shareClass }` with `name` populated from a single `full_name`. No `holders.join(' & ')`, no co-holder enumeration logic.

`signature-blocks.ts` `Signatory.name: string` — single string, no composition for joined holders.

### Conclusion

**Not currently supported at any layer.** Closing this gap would require:

- Schema: new `shareholding_holders` join table (composite PK on `shareholding_id` + `person_id`, plus ordering / ownership-fraction column) or array column on `shareholdings`.
- Types: replace `Shareholding.person_id: string` with `holders: { person_id: string; order: number }[]` or equivalent.
- UI: `IssueSharesModal` needs an "Add joint holder" affordance and array form state; `EditShareholdingModal` needs parallel changes; cap-table chart needs to display joined holders.
- PDF render: signature-block composition logic (`"X et Y"` / `"X and Y"`) plus query-side aggregation.

Comparable effort to Q1 but with a smaller UI footprint (no separate entity concept, just an array of individual holders).

---

## Files inspected

| File | Purpose |
|---|---|
| `supabase/migrations/20260405000000_sprint6_people_ownership.sql` | Schema source of truth for `company_people` + `shareholdings` |
| `supabase/migrations/` (Glob `*trust*`, empty) | Confirm no trust-aware migration ever shipped |
| `lib/supabase/people-types.ts` | TS types for `CompanyPerson`, `Shareholding`, `ShareholdingWithDetails` |
| `components/shareholders/IssueSharesModal.tsx` | Sole UI path that creates shareholdings |
| `components/people/PersonSelector.tsx` (lines 1-80) | Selection-mode discriminated union |
| `components/shareholders/**/*.tsx` (Glob) | Confirm no `AddShareholderModal` alternate path; confirm `EditShareholdingModal` present |
| `lib/pdf/generatePdfDocument.ts` (around lines 184-194) | Shareholder load + map for PDF render |
| `lib/pdf-templates/signature-blocks.ts` | Signature-block HTML composition |

---

## Recommendations to Max + Dom

1. **Q1 is a multi-day sprint, not a same-brief addition.** With ~2.5–4 CC-days of work spanning all four layers, trust-shareholder support should be scoped as its own brief (or its own atom-sequence) that lands **before** the Q-OFFICER-SIG-1 spec-lock + PDF template work can ship with trust correctness. The signature-block-convention spec should be authored against the future data shape (i.e. the spec doc commits to trust composition wording up front) so that the implementation brief downstream has an unambiguous target.

2. **Q1 schema shape is the load-bearing decision.** Recommend Dom + Max pick between (a) extend `company_people` with `entity_type` (cheaper, conflates row shapes) and (b) separate `shareholder_entities` table with typed/polymorphic FK (cleaner, more code surface). The signature-block spec doc cannot lock final composition wording until this is decided, because the rendering data shape depends on it. Suggest a 30-min product call before any implementation brief is authored.

3. **Q4 default product position based on findings: defer from v1.0.** Joint shareholders touch the same four layers as Q1, and shipping both at v1.0 doubles the surface area. The Q-OFFICER-SIG-1 spec can ship with explicit "joint holders out of scope for v1.0" language and a clean v1.1 follow-up. If Q4 turns out to be more common than expected in the v1.0 customer set, revisit before v1.1 planning.

4. **Adjacent risk to flag** (not investigated further per brief constraints): the spec implicitly assumes only individual-vs-trust as entity types. **Corporate shareholders** (a numbered company holding shares in another) are likely common in the QC SMB segment and share the same gap shape as trusts. Worth a 5-min product call to decide whether Q1's schema work should generalize from "trust" to "entity (trust | corporation)" up front — the marginal cost is small once the discriminator-table architecture is decided, but retrofitting later is expensive.

---

**Investigation status:** Complete. Read-only. No commits, no migrations, no code changes.
