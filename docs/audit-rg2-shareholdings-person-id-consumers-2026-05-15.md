# R-G2 Audit — `shareholdings.person_id` Consumers

**Date:** 2026-05-15
**Author:** CC (per CC BRIEF — Phase 10A.5 Atom 2 Precondition R-G2)
**Phase:** 10A.5 Atom 2 (TS types + API hydration + destructive close-out of atom 1's transitional state) — read-only precondition audit
**Parent commit:** `6ff3206` (Phase 10A.5 atom 1 — entity-typed shareholders + joint holders schema)
**Scope:** Catalogue every consumer of `shareholdings.person_id` across `app/`, `lib/`, `scripts/`, `components/`. Two consumer classes (R = reads, W = writes). Per-site verdict + migration sketch. Verdict-level go/no-go for whether atom 2 can drop the column.
**Mode:** Read-only. No code changes. No migration changes. No SQL mutations.

---

## §1 — Summary

**Total sites: 10** — identical perimeter to R-G1, as expected (R-G2 is the same physical set filtered to `person_id` consumers; both reads and writes are in scope here whereas R-G1 was reads-only).

| Class | Count | Breakdown |
|---|---|---|
| **R — read consumers** | 6 | All 6 R-G1 read sites also surface as R-G2 Class R |
| **W — write paths** | 4 | 3 INSERT sites with `person_id` payload (MIGRATE) + 1 UPDATE site that does not touch `person_id` (RETAIN) |

**Verdict tally:**

| Verdict | Class R | Class W | Total |
|---|---|---|---|
| MIGRATE | 6 | 3 | 9 |
| RETAIN | 0 | 1 | 1 |
| BLOCKER | 0 | 0 | 0 |

**Per §7 transitional-trigger audit:** zero application-code dependency on `transitional_sync_shareholding_holders`. Trigger drop in atom 2 is safe **provided** all 3 Class W MIGRATE sites land in the same atom 2 commit as the column + trigger drop (otherwise writes during a deploy gap would lack a `shareholding_holders` row).

**§10 Verdict: `GO`** — atom 2 ship brief can be authored. One sequencing caveat (atom 2 must bundle migration + 3 Class W code migrations + 6 Class R hydration updates in a single commit/deploy) is design guidance for the brief, not an audit-level blocker.

---

## §2 — Methodology

Per State §8.14 (Grep tool, not raw `grep -r` — path-existence robustness) and §8.18 (pivot to canonical tooling early, banked 2026-05-14). Five passes:

### Pass 1 — Direct queries

Pattern: `from\(['"]shareholdings['"]`

Surfaced 10 distinct call sites in live code. Out-of-perimeter hits excluded with rationale: `sprint6.sh` (git-tracked per `git ls-files`; 224 KB shell-script wrapper around heredoc'd TSX/SQL that scaffolded the original Sprint 6 surface; not invoked from any deploy or test pipeline (verified via grep: zero `sprint6` references in package.json, next.config.mjs; `.github/` and vercel.json absent from repo); atom 2 column drop does not affect any code path it would run; the 5 in-file grep hits — `from('shareholdings')` at lines 121/445/710/1161/4653 — duplicate live-code sites that have since been extracted to `app/` and `components/`); `docs/**` (audit references and proposal docs are not consumers); `supabase/migrations/**` (migrations are schema source, not schema consumers).

All 10 R-G1 sites resurface (verified against R-G1 §2 inventory). No new sites.

### Pass 2 — Nested PostgREST embeds

Patterns: `shareholdings\(` AND `:shareholdings\(`.

- `shareholdings\(` re-confirms the hidden consumer at `app/api/registers/shareholders/route.ts:22` (nested embed from `company_people`). This is R-G1 Site 6.
- `:shareholdings\(` (aliased form, e.g. `recent_holdings:shareholdings(...)`) returned **zero matches**. No aliased embeds anywhere in the codebase.

### Pass 3 — TypeScript transitive consumers

Grepped `\.person_id` across all `.ts` / `.tsx` files. 22 hits in live code. Applied §8.13 disambiguation discipline — `person_id` appears on four types: `Shareholding`, `CompanyPerson`, `OfficerAppointment`, `DirectorMandate`. Each `.person_id` read was traced to its declared variable type before classification.

Shareholding-typed `.person_id` reads (kept in R-G2 perimeter):
- `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:86, 93` (`sh.person_id` from `currentShareholdings: ShareholdingWithDetails[]`)
- `app/[locale]/dashboard/directors/DirectorsClient.tsx:94` (`sh.person_id` from `shareholdings: (Shareholding & {share_class})[]`)
- `app/[locale]/dashboard/officers/OfficersClient.tsx:74` (`sh.person_id` from `shareholdings: (Shareholding & {share_class})[]`)
- `components/shareholders/CapTableChart.tsx:82, 86` (`sh.person_id` from `shareholdings: ShareholdingWithDetails[]` prop — downstream of ShareholdersClient.tsx Site R3)
- `app/api/documents/signatories/route.ts:102` (`r.person_id` from `shareholdings` PostgREST result — Class R Site R2)

Non-Shareholding-typed `.person_id` reads disambiguated out of R-G2 scope (kept here for audit transparency; no atom 2 impact):
- `components/officers/AddOfficerModal.tsx:97` — `existing[0].person_id` is `officer_appointments` query
- `components/officers/ReplaceOfficerModal.tsx:193` — `officer.person_id` is `OfficerWithPerson`
- `components/officers/RemoveOfficerModal.tsx:87` — `officer.person_id` is `OfficerWithPerson`
- `components/directors/RemoveDirectorModal.tsx:75` — `director.person_id` is `DirectorWithPerson`
- `app/api/documents/signatories/route.ts:59` — `r.person_id` is `director_mandates` query
- `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:105, 106` — `dm.person_id` (DirectorMandate) and `oa.person_id` (OfficerAppointment)
- `app/[locale]/dashboard/directors/DirectorsClient.tsx:91, 93, 177` — director person_id
- `app/[locale]/dashboard/officers/OfficersClient.tsx:71, 73, 151` — officer person_id

### Pass 4 — Caller-evidence resolution

Two sites needed caller-evidence work:

- **Site R6 (`app/api/registers/shareholders/route.ts:22`)** — same site as R-G1 Site 6. R-G1's caller-evidence work (`components/minute-book/BinderView.tsx:28`, the single consumer) is still valid; not re-derived here. For R-G2 the question shifts from "current vs full-history" to "how does the FK-based embed survive when the FK column is dropped?" — addressed under §3 Site R6.

- **Site W4 (`EditShareholdingModal.tsx:53-62`)** — confirmed the `.update({...})` payload whitelists 5 fields (`share_class_id`, `quantity`, `issue_date`, `issue_price_per_share`, `certificate_number`). It does NOT include `person_id`. Caller-evidence (the file is its own caller — modal invoked from `ShareholdersClient.tsx:268-275` with a `ShareholdingWithDetails` object whose `person_id` is read-only in the modal context) confirms no person_id mutation path. Verdict: RETAIN unchanged.

### Pass 5 — Live DB confirmation

Not needed. Static analysis + caller evidence is sufficient at every site. No live SQL queries run.

---

## §3 — Class R consumers (6 sites)

### Site R1 — `lib/pdf/generatePdfDocument.ts:185`

```ts
const { data: shareholdings } = await supabaseAdmin
  .from('shareholdings')
  .select('id, quantity, company_people(id, full_name), share_classes(name)')
  .eq('company_id', companyId)
  .is('end_date', null);
```

**Verdict: MIGRATE.**

**Why it depends on `person_id`:** the `.select('..., company_people(...)')` embed is resolved by PostgREST via the `shareholdings_person_id_fkey` FK constraint. The FK lookup column is `shareholdings.person_id`. Once atom 2 drops that column, the FK is gone and the embed silently returns null (or fails, depending on PostgREST version semantics).

**Migration sketch:** replace the single-step embed with a two-step join through `shareholding_holders`:

```ts
.select(`
  id, quantity,
  shareholding_holders(person_id, entity_id, holder_type,
    person:company_people(id, full_name),
    entity:shareholder_entities(id, legal_name, entity_type)
  ),
  share_classes(name)
`)
```

Downstream `activeShareholders.map` (lines 190-194 of the same file) consumes `s.company_people.full_name`. Post-migration it needs to handle holders array (could be 1 individual, joint individuals, or 1 entity). The Holder discriminated union from the decomposition proposal §2 covers this. The PDF render branching is **Phase 10A.5 atom 4 scope**, not atom 2 — but atom 2's hydration shape needs to support the branching atom 4 will consume.

**Risk if missed:** PDF generation breaks the moment atom 2's migration applies (FK gone → embed nulls out → `activeShareholders` is empty → all current shareholders disappear from generated documents).

---

### Site R2 — `app/api/documents/signatories/route.ts:89-102`

```ts
const { data: shareholdings, error: shareholdingsError } = await supabase
  .from('shareholdings')
  .select('person_id')
  .eq('company_id', companyId)
  .is('end_date', null);
// ...
const personIds = Array.from(new Set(
  (shareholdings ?? []).map((r) => r.person_id as string).filter(Boolean)
));
```

**Verdict: MIGRATE.**

**Why it depends on `person_id`:** explicit `.select('person_id')` + `r.person_id` access. Both break post-drop.

**Migration sketch:** the route's purpose is "give me current shareholder person_ids so I can populate signatory candidates." Post-atom-2 this becomes "give me current holder person_ids" — but the route also needs to expand to handle entity holders (a trust's signatories are its trustees, not the trust itself; a corporation's signatory is its authorized signing officer). That entity-signatory expansion is **Phase 10A.5 atom 3/4 product scope** — for atom 2 the minimum-correct migration is:

```ts
.from('shareholding_holders')
.select('person_id, holder_type, shareholding:shareholdings!inner(company_id, end_date)')
.eq('shareholding.company_id', companyId)
.is('shareholding.end_date', null)
.eq('holder_type', 'individual');
```

Or, equivalently, query `shareholding_holders` filtered by `shareholding_id IN (current shareholdings)` with `holder_type = 'individual'`. The atom 2 brief picks the cleaner shape.

Entity-shareholder signatory expansion can either land in atom 2 or be deferred to atom 3 (the brief decides). **Audit recommendation: defer entity expansion to atom 3 to keep atom 2 focused on schema/types/hydration; atom 2 minimum is "individual-only holders, matching today's behavior."**

**Risk if missed:** runtime error on shareholder-signatory document generation (`/api/documents/signatories?requirementKey=...`).

---

### Site R3 — `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:57-58`

```ts
const { data: shRaw } = await supabase
  .from('shareholdings').select('*, person:company_people(*), share_class:share_classes(*)')
  .eq('company_id', cid).order('issue_date', { ascending: true });
```

Downstream reads (same file):
- Line 86: `currentShareholdings.forEach((sh) => { const list = map.get(sh.person_id) || []; ... });`
- Line 93: `currentShareholdings.forEach((sh) => { if (!seen.has(sh.person_id)) { seen.add(sh.person_id); ids.push(sh.person_id); } });`
- Propagated to `CapTableChart.tsx:82, 86` via the `shareholdings` prop.

**Verdict: MIGRATE.**

**Why it depends on `person_id`:** Three ways:
1. `.select('*')` pulls all columns including `person_id`. Post-drop the column simply isn't there — not a runtime break, but the field disappears from the row shape, breaking downstream `sh.person_id` reads.
2. The `person:company_people(*)` embed is FK-resolved via `shareholdings.person_id`. Same break mode as R1.
3. Two `sh.person_id` reads inside `shareholdingsByPerson` and `shareholderPersonIds` memos plus the chart legend grouping.

**Migration sketch:** Two-step:

a. SELECT shape: replace `person:company_people(*)` with the nested holder shape (mirroring R1):
```ts
.select('*, holders:shareholding_holders(holder_type, display_order,
  person:company_people(*),
  entity:shareholder_entities(*)
), share_class:share_classes(*)')
```

b. Downstream consumers: the cap-table grouping logic (lines 84-95) currently groups by `sh.person_id` to produce one card per person. Post-atom-2 this becomes "group by holder identity" — for individual holdings, by person_id; for entity holdings, by entity_id; for joint holdings, by the holder-tuple key. The UI atom (atom 3) owns the per-card rendering. **Atom 2 minimum: hydrate the `holders` array on each row; leave the grouping rewrite for atom 3.** Atom 2 must still update the file because today's code reads `sh.person_id` directly and that field is going away — the simplest atom-2-bounded patch is `sh.holders?.[0]?.person_id ?? null` as a transitional getter, or rename `shareholdingsByPerson` to a derived `Map<holderKey, ...>` produced by a new helper.

The exact transitional shape is an atom 2 brief decision. **Audit constraint: this file must compile + not error at runtime after atom 2 lands, even if full UI behavior for entity/joint holders is deferred to atom 3.**

**Risk if missed:** `/[locale]/dashboard/shareholders` page breaks (TypeScript compile error on `.person_id` if types are updated; silent empty grouping if not).

---

### Site R4 — `app/[locale]/dashboard/directors/DirectorsClient.tsx:78, 94`

```ts
const { data: sharesRaw } = await supabase
  .from('shareholdings').select('*, share_class:share_classes(*)')
  .eq('company_id', cid).is('end_date', null);
// ...
function getShareholdingsForPerson(personId: string) {
  return shareholdings.filter((sh) => sh.person_id === personId);
}
```

**Verdict: MIGRATE.**

**Why it depends on `person_id`:**
1. `.select('*')` pulls `person_id` for the row shape (no FK embed here).
2. `getShareholdingsForPerson` filters by `sh.person_id === personId` to display "shares held" beside each director card.

**Migration sketch:** SELECT side needs the holders embed similar to R3 (without the full `person:` nested object — directors page only needs share class + holder identity for the filter). Downstream `getShareholdingsForPerson` becomes "return shareholdings where any holder has this person_id" — i.e., `sh.holders.some((h) => h.holder_type === 'individual' && h.person_id === personId)`. For atom 2 this is a mechanical translation, no UX decision required.

**Note:** the existing filter is correctness-correct **only for individual-holder shareholdings** (a director who is a trustee of a shareholder trust would have their "shares held" suppressed under this filter — but that's a Phase 10A.5 atom 3 product question, not R-G2 scope).

**Risk if missed:** director-card "shares held" badge becomes empty.

---

### Site R5 — `app/[locale]/dashboard/officers/OfficersClient.tsx:62, 74`

Identical pattern to R4 for the officers dashboard.

**Verdict: MIGRATE.** Same migration sketch as R4.

**Risk if missed:** officer-card "shares held" badge becomes empty.

---

### Site R6 — `app/api/registers/shareholders/route.ts:22` (nested embed) — **critical site**

```ts
const { data: people } = await supabase
  .from('company_people')
  .select('*, shareholdings(*, share_classes(*))')
  .eq('company_id', company.id)
```

**Verdict: MIGRATE.**

**Why it depends on `person_id`:** the entire nested embed is FK-resolved via `shareholdings.person_id → company_people.id`. Without that FK, PostgREST can no longer auto-resolve the relationship. This is the highest-impact site in the audit: the route returns empty/nulls on atom 2 deploy unless rewritten.

**Migration sketch:** the route shape is "from people, find their shareholdings." Post atom 2 the equivalent shape goes through `shareholding_holders`:

```ts
.from('company_people')
.select('*, holdings:shareholding_holders!person_id(
  shareholding:shareholdings(*, share_classes(*))
)')
.eq('company_id', company.id)
```

Alternatively (and likely cleaner given the binder UI's full-history contract per R-G1 §5 caller-evidence resolution), invert the join direction:

```ts
.from('shareholdings')
.select('*, share_classes(*), shareholding_holders(person:company_people(*), entity:shareholder_entities(*), holder_type)')
.eq('company_id', company.id)
// downstream JS flattens to one register entry per (shareholding × holder) tuple
```

The inverted shape also naturally supports entity-shareholders and joint-holder rendering (one register row per holder, all referencing the same shareholding's quantity/certificate). The atom 2 brief picks; **audit recommendation: inverted shape, because it's the shape Phase 10B's as-of-date resolver will want anyway, and it correctly surfaces entity/joint holders in the QCBSA statutory register per R-G1's full-history conclusion.**

**Risk if missed:** Living Minute Book "Registre des actionnaires" tab shows empty register (BinderView.tsx:105-120). This is a register-card on a user-visible binder surface; breakage is immediately visible.

---

## §4 — Class W consumers (4 sites)

### Site W1 — `components/shareholders/IssueSharesModal.tsx:122`

```ts
const { error: shErr } = await supabase.from('shareholdings').insert({
  company_id: companyId,
  person_id: personId,
  share_class_id: shareClassId,
  quantity: qty,
  issue_date: issueDate,
  issue_price_per_share: price,
  certificate_number: certificateNumber.trim() || null,
});
```

**Verdict: MIGRATE.**

**Why it writes `person_id`:** explicit `person_id: personId` in the insert payload. The atom 1 `transitional_sync_shareholding_holders` trigger currently auto-creates the matching `shareholding_holders` row. Atom 2 drops both — so post-atom-2 the insert must (a) omit `person_id`, and (b) explicitly insert the holder row.

**Pattern α (dual-write at call site):**

```ts
const { data: sh, error: shErr } = await supabase.from('shareholdings').insert({
  company_id: companyId,
  share_class_id: shareClassId,
  quantity: qty,
  issue_date: issueDate,
  issue_price_per_share: price,
  certificate_number: certificateNumber.trim() || null,
}).select('id').single();
if (shErr || !sh) throw new Error(shErr?.message || 'insert failed');
await supabase.from('shareholding_holders').insert({
  shareholding_id: sh.id,
  holder_type: 'individual',
  person_id: personId,
  display_order: 0,
});
```

**Pattern β (helper):**

```ts
// new lib/shareholdings/create.ts
export async function createShareholdingWithHolders(
  supabase: SupabaseClient,
  shareholding: ShareholdingInsert,
  holders: { type: 'individual'; personId: string }[] | { type: 'entity'; entityId: string }[]
): Promise<{ id: string }> { /* runs both inserts; consider PG transaction via RPC for atomicity */ }
```

**Audit note:** Pattern β has correctness advantages (atomicity, single place to update for joint-holder support in atom 3) but adds new surface area for atom 2 to ship. Pattern α is mechanical at each W site but leaves the joint-holder INSERT shape to atom 3's UI work. **Audit does NOT pick. The atom 2 ship brief decides; see §9 open question Q-R-G2-A.**

---

### Site W2 — `components/onboarding/OnboardingFlow.tsx:197-204`

```ts
await supabase.from('shareholdings').insert({
  company_id: companyId,
  person_id: personId,
  share_class_id: shareClassId,
  quantity: sh.numberOfShares,
  issue_date: sh.issueDate,
  certificate_number: String(certNum).padStart(3, '0'),
});
```

**Verdict: MIGRATE.** Pattern α/β sketches identical to W1.

**Note:** the onboarding loop iterates `shs` (the onboarding step 5 shareholders array). Each iteration is a single individual-holder shareholding (joint holders in onboarding are out of v1.0 onboarding scope per the decomposition proposal §3). Pattern α applies cleanly; if the brief picks pattern β, the helper handles each iteration.

---

### Site W3 — `scripts/seed-canonical-fixture.mjs:328-340`

```js
const shareholdingRows = [
  { person_id: UUID.p1Sophie, quantity: 60, certificate_number: '001' },
  { person_id: UUID.p2Marc,   quantity: 40, certificate_number: '002' },
].map((sh) => ({
  company_id:            UUID.company,
  person_id:             sh.person_id,
  share_class_id:        UUID.shareClass,
  // ...
}));
const { error: shErr } = await supabase.from('shareholdings').insert(shareholdingRows);
```

**Verdict: MIGRATE.**

**Migration sketch:** bulk INSERT of shareholdings (without `person_id`), capture the returned ids, then bulk INSERT into `shareholding_holders` with the (shareholding_id, person_id) pairs. Pattern α applies; pattern β's helper could accept an array of (shareholdingInsert, holders) tuples.

**Note:** this is a Node `.mjs` script, not React. It runs against the live Supabase project to seed canonical fixture data. It must continue to work post-atom-2 because other scripts/probes depend on the fixture state.

---

### Site W4 — `components/shareholders/EditShareholdingModal.tsx:53-62`

```ts
const { error: err } = await supabase
  .from('shareholdings')
  .update({
    share_class_id: shareClassId,
    quantity: qty,
    issue_date: issueDate,
    issue_price_per_share: pricePerShare.trim() ? parseFloat(pricePerShare) : null,
    certificate_number: certificateNumber.trim() || null,
  })
  .eq('id', shareholding.id);
```

**Verdict: RETAIN unchanged.**

**Why:** the update payload whitelists 5 fields. `person_id` is not among them — the modal cannot reassign a shareholding to a different person via this path. Post-atom-2 the update is unchanged and continues to work because none of the 5 whitelisted columns are touched by atom 2.

**Caveat:** if Phase 10A.5 atom 3 adds an "edit holders" surface (e.g., add joint holder to an existing single-holder shareholding), that will be a NEW write site, not a modification of W4. R-G2 records W4 as RETAIN for the column-drop concern; atom 3's UI will own its own holders-mutation surface.

---

## §5 — Caller-evidence resolutions

Two sites required Pass 4 caller-evidence reasoning. Both already resolved inline in §3/§4:

| Site | Pass 4 question | Resolution |
|---|---|---|
| R6 — `registers/shareholders/route.ts:22` | How does the FK-resolved embed survive when the FK column is dropped? | Cannot survive as-is. Must re-route through `shareholding_holders`. Caller `BinderView.tsx:28` (single consumer) is the same as R-G1 Site 6; binder semantics drive the inverted-join migration recommendation. |
| W4 — `EditShareholdingModal.tsx:53-62` | Does the update payload mutate `person_id` anywhere in the modal's logic? | No. Payload whitelists 5 fields excluding `person_id`. RETAIN unchanged. |

No site required escalation to §9 "needs Max review."

---

## §6 — Type impact (`lib/supabase/people-types.ts`)

Atom 2 needs to update the `Shareholding` interface and its derived types. Sketch only — drafting the actual type changes is **out of scope for R-G2** (atom 2 ship brief owns).

**`Shareholding` (line 102):**
- Drop `person_id: string` (line 105).
- Other fields unchanged.

**`ShareholdingInsert` (line 119):**
- Derived as `Omit<Shareholding, ...>`. Drop cascades automatically. No explicit change needed in the type declaration, but every caller constructing a `ShareholdingInsert` must stop populating `person_id` (this is the W1/W2/W3 migration above).

**`ShareholdingWithDetails` (line 138):**
- Currently `extends Shareholding & { person: CompanyPerson; share_class: ShareClass }`. The `person` field is a 1:1 view that's correct today (every shareholding has one person_id and one company_people row).
- Post atom 2 this becomes a 1:N relationship via `shareholding_holders`. Two options the atom 2 brief picks between:
  - **(a)** Add `holders: Holder[]` (per the decomposition proposal §2 Holder discriminated union) and **deprecate** the `person` convenience field with a transitional default (`person: holders.find(h => h.kind === 'individual')?.person ?? null`).
  - **(b)** Drop `person` and require all consumers to read through `holders`. Cleaner break; more churn at consumer sites in this atom.
- The audit does not pick; this is a brief decision.

**`PersonRoleSummary.shareholdings` (line 150):**
- Currently `(Shareholding & { share_class: ShareClass })[]`. Used by per-person role aggregations (callers grep `PersonRoleSummary` — only `lib/supabase/people-types.ts` defines it; no current consumers grep up, so this type may be vestigial; atom 2 brief should confirm via "find references" and decide whether to update or remove).

**New types atom 2 introduces** (per decomposition proposal §2 Atom 2 sketch — referenced for completeness, not authored by R-G2):
- `ShareholderEntity`
- `ShareholderEntitySignatory`
- `ShareholdingHolder`
- `Holder` (discriminated union)
- `ShareholdingWithHolders`

---

## §7 — Transitional trigger consumer audit

The atom 1 migration created `transitional_sync_shareholding_holders` and its trigger (migration §5, lines 268-309). Atom 2 drops both alongside `shareholdings.person_id`.

**Audit question:** does any application code rely on the trigger's existence or behavior?

Methodology: grep for `transitional_sync_shareholding_holders` across the entire repo.

```
Grep pattern: transitional_sync_shareholding_holders
Result: matches only in supabase/migrations/20260514101627_phase10a5_atom1_entity_typed_shareholders.sql
```

No app code, no scripts, no tests reference the trigger. The trigger is a **DB-only correctness shim** that papers over the gap between (a) Class W sites still writing `shareholdings.person_id` and (b) downstream code (the atom 1 backfill verification + any future as-of-date logic) needing `shareholding_holders` to be populated.

**Verdict:** trigger drop in atom 2 is safe **provided** the 3 Class W MIGRATE sites (W1, W2, W3) land their dual-write code in the same atom 2 commit + deploy as the column/trigger drop. If atom 2 drops the trigger first and a Class W site inserts before the dual-write rewrite deploys, that shareholding row exists in the DB without a holder row (a structurally broken state that violates the new model's "every shareholding has 1+ holders" invariant — though the DB does NOT enforce that invariant via a constraint today; defense-in-depth would add a deferred CHECK or NOT NULL on a `holders_count` column, out of R-G2 scope).

**Explicit statement (per brief §7):** "Trigger drop in atom 2 is safe — no Class W site relies on the trigger for its correctness, conditional on atomic deploy of W1/W2/W3 migrations alongside the schema drop."

---

## §8 — Cross-reference with R-G1

| R-G1 # | Path | R-G1 verdict (read temporality) | R-G2 class | R-G2 verdict |
|---|---|---|---|---|
| 1 | `lib/pdf/generatePdfDocument.ts:185` | needs-current-only | R (FK embed) | MIGRATE |
| 2 | `app/api/documents/signatories/route.ts:90` | needs-current-only | R (explicit select) | MIGRATE |
| 3 | `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:58` | MIXED (display vs cert-sequencer) | R (FK embed + sh.person_id grouping) | MIGRATE |
| 4 | `app/[locale]/dashboard/directors/DirectorsClient.tsx:78` | needs-current-only | R (sh.person_id filter) | MIGRATE |
| 5 | `app/[locale]/dashboard/officers/OfficersClient.tsx:62` | needs-current-only | R (sh.person_id filter) | MIGRATE |
| 6 | `app/api/registers/shareholders/route.ts:22` | needs-full-history (nested embed) | R (nested FK embed — critical) | MIGRATE |
| 7 | `scripts/seed-canonical-fixture.mjs:340` | mutation, OOS for R-G1 | W (INSERT with person_id) | MIGRATE |
| 8 | `components/onboarding/OnboardingFlow.tsx:197` | mutation, OOS for R-G1 | W (INSERT with person_id) | MIGRATE |
| 9 | `components/shareholders/IssueSharesModal.tsx:122` | mutation, OOS for R-G1 | W (INSERT with person_id) | MIGRATE |
| 10 | `components/shareholders/EditShareholdingModal.tsx:54` | mutation, OOS for R-G1 | W (UPDATE, does NOT touch person_id) | RETAIN |

**Observations:**
- R-G2 perimeter is identical to R-G1's (no new sites; no R-G1 sites drop out — every site that talks to `shareholdings` also touches `person_id` in some way except W4, which is the one RETAIN).
- R-G1's MIXED classification at Site 3 doesn't propagate to R-G2 — R-G2's concern is the column's existence, not temporal-filter semantics. Site 3 still needs MIGRATE at the R-G2 level regardless of how R-G1's MIXED guidance is resolved.
- The 6 read sites in R-G2 line up exactly with R-G1's 6 read sites; the 4 mutation sites that were "out of scope" for R-G1 are all in scope for R-G2.

---

## §9 — Open questions surfaced

### Q-R-G2-A — Pattern α (dual-write at call site) vs Pattern β (helper) for Class W migrations

W1, W2, W3 each construct a `shareholdings.insert({...})` payload. Atom 2 must move them to a two-step insert (shareholdings row, then shareholding_holders row). Two shapes:

- **α (dual-write at call site):** each Class W site does both inserts inline. Mechanical, no new lib surface, but loses atomicity (a shareholdings insert that succeeds followed by a holders insert that fails leaves a structurally broken row).
- **β (helper, e.g. `lib/shareholdings/createShareholdingWithHolders`):** one function, called from 3 sites. Atomicity via a PG RPC if the brief invests in one. Cleaner update path for atom 3 (joint holders).

R-G2 does NOT recommend; the atom 2 brief picks.

### Q-R-G2-B — Atom 2 scope: entity-shareholder signatory expansion or defer to atom 3?

Site R2 (`/api/documents/signatories`) currently flattens shareholdings to person_ids. Post atom 2 this could either:
- **(b1)** Stay individual-only at the atom 2 boundary — i.e., entity holders return empty signatory lists from this route until atom 3's UI surfaces add entity-signatory selection.
- **(b2)** Expand atom 2 to also return entity-signatory candidates via `shareholder_entity_signatories`.

R-G2 audit recommendation is **(b1)** to keep atom 2 focused. Atom 2 brief confirms.

### Q-R-G2-C — `ShareholdingWithDetails.person` convenience field — drop or transitional default?

§6 type-impact (a) vs (b). Atom 2 brief decides.

### Q-R-G2-D — Atom 2 deploy atomicity

Per §7, atom 2's column drop, trigger drop, and 3 Class W migrations must land in one deploy to avoid a broken intermediate state. WA #13 (single Supabase project, dev = prod) makes this enforceable. Brief confirms.

---

## §10 — Verdict

### **GO — atom 2 ship brief can be authored.**

**Reasoning:**
- All 6 Class R sites have clear migration sketches (4 SELECT-rewrites, 2 with downstream JS-side adjustments).
- 3 of 4 Class W sites have clear migration sketches; the 4th (W4) needs no change.
- §7 confirms zero application-code dependency on the transitional trigger.
- §8 confirms full perimeter overlap with R-G1; no surprises in the consumer set.
- The one sequencing constraint surfaced (§7 + §9 Q-R-G2-D — atomic deploy) is a brief-level design constraint, not an audit-level blocker. Single Supabase project (WA #13) makes the atomic deploy achievable in one commit.

**No BLOCKER-pending-X conditions.** No site needed escalation to Max during the audit (Pass 4 caller-evidence resolved both ambiguous sites in-repo). The four open questions in §9 are atom 2 brief decisions, not pre-atom-2 dependencies.

**Atom 2 brief author's checklist (extracted from this audit, for convenience):**
1. Migration: drop column `shareholdings.person_id` + drop trigger `transitional_sync_shareholding_holders_trigger` + drop function `transitional_sync_shareholding_holders()` + drop FK index `idx_shareholdings_person_id`.
2. Type updates per §6.
3. Class R hydration updates at 6 sites (R1–R6) per §3.
4. Class W migrations at 3 sites (W1, W2, W3) per §4. Pattern α vs β per Q-R-G2-A.
5. Confirm W4 unchanged (regression-test only).
6. Resolve Q-R-G2-A through Q-R-G2-D in the brief.
7. WA #15 dual-locale gate for any UI affected (R3 surface mainly).
8. Verify register surface (R6) renders correctly post-deploy — single-caller `BinderView.tsx`.

---

## Methodology contributions

This audit reinforces R-G1's §8.X (dual-pass consumer grep) and §8.Y (caller-evidence ambiguity resolution) patterns. No new methodology contributions surfaced.

One observation worth noting for the §8.x bank: **PostgREST FK-embedded selects depend on the FK column's existence transitively**. Site R1 has no literal `.person_id` in its `.select()` string but is still a `person_id` consumer because the `company_people(...)` embed is resolved via the FK. Pure text-grep for `.person_id` would miss R1; the dual-pass approach (Pass 1 direct + Pass 2 nested embed) catches it, but the audit must remember to inspect the **column being relied on by each FK embed**, not just the embedded table name. Recommend folding into the §8 bank as "FK-resolved embeds are transitive column consumers."

---

**End of R-G2 audit.** Awaiting Max review at the approval gate before commit.
