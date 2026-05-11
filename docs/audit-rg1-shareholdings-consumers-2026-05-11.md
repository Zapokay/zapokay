# R-G1 Audit — `shareholdings` Consumers

**Date:** 2026-05-11
**Author:** CC (per CC BRIEF — Phase 10A Atom 4 Precondition P-COUP-1)
**Phase:** 10A Atom 4 (SHAREHOLDER_TEMPORAL_COUPLED) — read-only precondition audit
**Scope:** Catalogue every consumer of the `shareholdings` table across `app/`, `lib/`, `scripts/`; classify each read site by temporal-filter need to inform Atom 4 ship brief.
**Mode:** Read-only. No code changes. No migration changes.

---

## §1 — Mandate

Per LOCK-2 (Phase B canonical decision, captured in
`docs/sprint-10-phase-decomposition-2026-05-07.md`), Atom 4 introduces
temporal columns on `shareholdings` (`end_date`, plus FK from
`share_transfers.from_shareholding_id` / `to_shareholding_id` already
landed in Atom 3). Every existing read site must be classified before
Atom 4 ships so the ship brief can:

1. Identify sites that need an `end_date IS NULL` filter added (current-state semantics).
2. Identify sites that must remain end-date-agnostic (full-history semantics).
3. Identify ambiguous sites that need a product decision before code change.
4. Confirm mutation sites are out of R-G1 scope (no SELECT-side temporal logic).

Per LOCK-7, this audit must include a dedicated R-G1 generator coverage
section. See §4.

---

## §2 — Inventory

**Total consumers: 10 sites** (9 direct `from('shareholdings')` invocations + 1 PostgREST nested embed).

### Discovery methodology

Two grep passes against the repo:

- **Pass 1 (direct):** `from\(['\"]shareholdings` across `app/`, `lib/`, `scripts/`, `components/`. Yielded 9 hits.
- **Pass 2 (nested embed):** `shareholdings\(` to catch PostgREST nested
  selects of the form `from('X').select('..., shareholdings(...)')`.
  Yielded 1 hit not surfaced by pass 1 (the hidden consumer at
  `app/api/registers/shareholders/route.ts:22`).

This dual-pass methodology is itself a banked finding — single-pass
direct grep would have missed the nested embed. Recommend folding into
the §8 methodology bank as the "hidden-consumer dual-pass" pattern.

### Read sites (6)

| # | Path | Line | Pattern | Preliminary classification |
|---|------|------|---------|----------------------------|
| 1 | `lib/pdf/generatePdfDocument.ts` | 185 (LOCK-7 brief named line 184; current line is 185 — captured here for atom 4 brief targeting) | `from('shareholdings').select('*, share_class:share_classes(*), person:company_people(*)')` with `eq('company_id', companyId)` | needs-current-only |
| 2 | `app/api/documents/signatories/route.ts` | 90 | `from('shareholdings').select('person_id')` with `eq('company_id', companyId)` | needs-current-only |
| 3 | `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx` | 58 | `from('shareholdings').select('*, person:..., share_class:...')` with `eq('company_id', cid).order('issue_date', { ascending: true })` | **MIXED** — see §5 |
| 4 | `app/[locale]/dashboard/directors/DirectorsClient.tsx` | 78 | `from('shareholdings').select('*, share_class:share_classes(*)').eq('company_id', cid)` | needs-current-only |
| 5 | `app/[locale]/dashboard/officers/OfficersClient.tsx` | 62 | `from('shareholdings').select('*, share_class:share_classes(*)').eq('company_id', cid)` | needs-current-only |
| 6 | `app/api/registers/shareholders/route.ts` | 22 (nested) | `from('company_people').select('*, shareholdings(*, share_classes(*))').eq('company_id', company.id)` | **needs-full-history** — see §5 (caller-evidence resolution) |

### Mutation sites (4) — out of R-G1 scope

R-G1 governs SELECT-side temporal-filter behaviour. Mutation sites do
not require end_date filtering at the call site; they are listed here
solely for completeness so the atom 4 ship brief can confirm none of
them require a parallel temporal-handling change.

| # | Path | Line | Op |
|---|------|------|----|
| 7 | `scripts/seed-canonical-fixture.mjs` | 340 | INSERT (canonical fixture seed — Sub-task 5/probe support) |
| 8 | `components/onboarding/OnboardingFlow.tsx` | 197 | INSERT (onboarding step 5 — initial issuance) |
| 9 | `components/shareholders/IssueSharesModal.tsx` | 122 | INSERT (issue-shares modal) |
| 10 | `components/shareholders/EditShareholdingModal.tsx` | 53-62 | UPDATE by id |

All four mutations write rows without an explicit `end_date` value
(table default applies). Post-Atom-4, the table default for `end_date`
must be `NULL` for inserts to be interpreted as "open" holdings — that
constraint is owned by the Atom 4 migration, not by these call sites.
None of these four sites require call-site changes for R-G1.

---

## §3 — Per-site classification (read sites)

### Site 1 — `lib/pdf/generatePdfDocument.ts:185`

**Classification:** needs-current-only.

**Evidence:** The file's header comment (line 16) states verbatim:

> *"Load company + current-state directors + current-state shareholders."*

The data loaded here feeds the annual-register PDF template, which by
QC corporate-document convention reflects the current state of the
company at the time of generation (with separate transfer-history
sections handled by `share_transfers` post-Atom-4).

**Atom 4 implication:** Add `.is('end_date', null)` to this query.

**Risk if missed:** Annual register PDFs would include transferred-away holdings, producing materially incorrect output.

---

### Site 2 — `app/api/documents/signatories/route.ts:90`

**Classification:** needs-current-only.

**Evidence:** The SELECT pulls `person_id` from shareholdings to
determine who is a shareholder at the moment a document requiring
shareholder signatures is being drafted. By definition this is a
"now" question — someone who divested last year is not a current
shareholder and cannot sign as one.

**Atom 4 implication:** Add `.is('end_date', null)` to this query.

**Risk if missed:** Documents would offer ex-shareholders as signatory candidates.

---

### Site 3 — `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:58`

**Classification: MIXED — see §5.**

This site is escalated to §5 because the same query feeds two
divergent downstream needs (cap-table display vs. certificate-number
sequencer).

---

### Site 4 — `app/[locale]/dashboard/directors/DirectorsClient.tsx:78`

**Classification:** needs-current-only.

**Evidence:** The component computes `getShareholdingsForPerson(personId)`
(line ~74-equivalent in OfficersClient; same pattern here) to display
"shares held" beside each director on the directors dashboard. The
dashboard reflects the company's present state; showing
transferred-away holdings against a director's name would be incorrect.

**Atom 4 implication:** Add `.is('end_date', null)` to the SELECT.

**Risk if missed:** Directors would appear to still hold shares they have transferred.

---

### Site 5 — `app/[locale]/dashboard/officers/OfficersClient.tsx:62`

**Classification:** needs-current-only.

**Evidence:** Identical pattern to Site 4 — `getShareholdingsForPerson`
helper displays current shares held per officer on the officers
dashboard.

**Atom 4 implication:** Add `.is('end_date', null)` to the SELECT.

**Risk if missed:** Same as Site 4, for officers.

---

### Site 6 — `app/api/registers/shareholders/route.ts:22` (nested embed)

**Classification: needs-full-history — see §5 for caller-evidence resolution.**

Hidden consumer caught only by the secondary nested-embed grep. Initial
read was ambiguous; caller inspection (`components/minute-book/BinderView.tsx:28`,
the single consumer) resolves it to needs-full-history.

---

## §4 — R-G1 generator coverage section

Per LOCK-7, R-G1 must produce explicit generator coverage. Findings below.

### §4.1 — LOCK-7 generator-count anomaly (Lock Reconciliation candidate per §8.9)

**LOCK-7 expects 6 generators in `lib/pdf/`.** Actual filesystem state:

- `lib/pdf/` contains **2 files**:
  - `generatePDF.ts` — thin adapter that delegates to `@/lib/pdf-templates`; **no direct `shareholdings` read**.
  - `generatePdfDocument.ts` — the sole direct `shareholdings` consumer in PDF generation (Site 1).

- `lib/pdf-templates/` contains **7 files**: `cover-page.ts`, `annual-register.ts`,
  `signature-blocks.ts`, `base-layout.ts`, `resolution-board.ts`,
  `resolution-shareholder.ts`, `index.ts`. Grep confirms **zero references to `shareholdings`** in any of these files — they are pure HTML builders consuming pre-fetched data passed in by `generatePdfDocument.ts`.

  Even if `lib/pdf-templates/` were counted as the "generator set",
  removing structural parts (`cover-page`, `signature-blocks`,
  `base-layout`, `index`) leaves **3 document types** (`annual-register`,
  `resolution-board`, `resolution-shareholder`) — still short of the 6
  named in LOCK-7.

**Resolution path (per §8.9 audit-drift Lock Reconciliation):**

This anomaly is flagged as a Lock Reconciliation candidate to be
resolved at Atom 4 brief authoring. Two interpretations on the table:

- **(a)** LOCK-7 is stale: the "6 generators" predates the
  `lib/pdf-templates/` extraction refactor and was never reconciled. In
  this case LOCK-7 should be updated to "1 generator-side consumer
  (`lib/pdf/generatePdfDocument.ts`), N document types
  (3 active in `lib/pdf-templates/`)".
- **(b)** LOCK-7 was using "generator" to mean "document type produced
  by the PDF pipeline" — but even under this reading the count is wrong (3 active, not 6).

Either resolution lands at the atom 4 brief; this audit proceeds with
the **actual** single generator-side consumer at Site 1.

### §4.2 — Actual generator-side coverage

| Generator-side consumer | Site # | Classification |
|--|--|--|
| `lib/pdf/generatePdfDocument.ts:185` | 1 | needs-current-only |

All PDF document types (`annual-register`, `resolution-board`,
`resolution-shareholder`) receive shareholdings data exclusively via
the single generator-side load at Site 1. Therefore adding
`.is('end_date', null)` at Site 1 covers all PDF outputs without any
template-level change required.

### §4.3 — Confirmation: `lib/pdf-templates/` is DB-clean

Grep `from\(['\"]shareholdings` and bare `shareholdings` against
`lib/pdf-templates/` — both return zero matches. No template-level R-G1
change is required.

---

## §5 — Mixed sites & caller-evidence resolutions

### Site 3 — `ShareholdersClient.tsx:58` — MIXED

**Wrinkle:** The same SELECT feeds two divergent downstream needs:

- **Display path** (cap-table chart, shareholder cards, `totalIssued` sum at line 77): wants **current-only**. Transferred-away holdings should not appear in the cap-table chart or be summed into "total issued (outstanding)".

- **Certificate-number sequencer** (`nextCertificateNumber`, lines 92-98): scans **all** shareholdings (including any future end_dated rows) to derive `max(certificate_number) + 1` for the next issuance. After Atom 4, if the SELECT filters out end_dated rows, the sequencer will reissue retired certificate numbers — a regulatory integrity bug.

**Recommended resolution (for atom 4 brief):**

Keep the SELECT end-date-agnostic (no `.is('end_date', null)` on the
query). Apply the `end_date IS NULL` filter in the derived state used
by display paths (`totalIssued`, `shareholdingsByPerson`,
`shareholderPersonIds`, `CapTableChart` input) while leaving
`nextCertificateNumber` to scan the unfiltered list. Concretely:

```ts
const currentShareholdings = useMemo(
  () => shareholdings.filter((sh) => sh.end_date === null),
  [shareholdings]
);
// Use `currentShareholdings` for totalIssued, by-person grouping, chart input
// Keep `shareholdings` (unfiltered) for nextCertificateNumber
```

This pattern is unique to Site 3 in this audit.

### Site 6 — `app/api/registers/shareholders/route.ts:22` — needs-full-history (caller-evidence resolution)

**Reading the handler** (full file, 48 lines, no branching, no params):

The route is a single GET that:
1. Fetches all `company_people` for the user's company,
2. Nested-embeds `shareholdings(*, share_classes(*))`,
3. Filters in JS to people with at least one shareholding,
4. Flattens to entries `{full_name, share_class, quantity, certificate_number, issue_date, issue_price_per_share}`,
5. Sorts by `issue_date` descending,
6. Returns `{register_title_fr: 'Registre des actionnaires', register_title_en: 'Shareholder Register', entries}`.

**Initial ambiguity:** Two product positions appeared tenable on the
handler alone — (A) QCBSA statutory register (needs-full-history) or
(B) current-only UI view that happens to be named "Registre".

**Resolution via single-caller inspection.** Grep
`grep -rn "registers/shareholders" app/ components/ lib/` returns
exactly one consumer: `components/minute-book/BinderView.tsx:28`.
Reading lines 14-120 of BinderView establishes that this surface is
positioned in the Living Minute Book binder UI **alongside** two
companion registers from `/api/registers/directors` and
`/api/registers/officers`, rendered as three sibling `RegisterCard`s
under the same "Registres" binder section.

The companion register cards definitively establish the binder's
register-card contract as **statutory / full-history**:

- **Directors RegisterCard** (BinderView lines 62-83) — columns include
  `appointment_date` ("Début"), `end_date_display` ("Fin"), and a
  `status` column rendering ✓ for `is_active = true` and ✗ otherwise.
  Inactive directors are rendered, not filtered. This is the
  full-history statutory form.
- **Officers RegisterCard** (BinderView lines 85-103) — same pattern,
  `appointment_date` and `is_active` status column with ✓/✗.
  Inactive officers rendered, not filtered. Full-history form.
- **Shareholders RegisterCard** (BinderView lines 105-120) — columns
  `full_name`, `share_class`, `quantity`, `certificate_number`,
  `issue_date`. **No "Fin" column. No status column.**

The shareholders card is materially asymmetric with its two sibling
registers in the same binder section. The only coherent reading is
that the shareholders register is the **statutory QCBSA Shareholder
Register**, intended to match its siblings' full-history form, but the
current implementation is **incomplete** — the cessation column has
not yet been added because pre-Atom-4 `shareholdings` has no `end_date`
to render.

**Resolution: Position (A) — needs-full-history.**

**Atom 4 implication:** Keep the nested-embed SELECT end-date-agnostic
(no `.is('end_date', null)` filter on the embed or on the JS-side
filter). The route should additionally emit `end_date` on each entry
so the UI can render a "Fin" column matching the directors and officers
register pattern.

**Out-of-scope-for-R-G1 follow-up (capture for atom 4 brief or post-atom backlog):**
- `app/api/registers/shareholders/route.ts` should emit `end_date` on
  each entry once the column exists.
- `components/minute-book/BinderView.tsx:105-120` should grow a "Fin"
  column and a "Statut" column to match the directors and officers
  register cards' visual contract.
- Beyond R-G1: the QCBSA statutory register also typically requires
  inclusion of share transfers, which lands in `share_transfers`
  post-Atom-3. The atom 4 brief or a follow-on atom should consider
  unioning `shareholdings` (with `end_date` rendered) and
  `share_transfers` (with transfer dates rendered) to produce the full
  statutory ledger. R-G1 itself only requires the read-side query to
  remain end-date-agnostic; the union work is downstream.

**Site 6 is therefore NOT a blocker for atom 4 ship-brief authoring.**

---

## §6 — Mutation sites (recorded for completeness; out of R-G1 scope)

See §2 Mutation sites table. Summary of post-Atom-4 expectations:

| # | Path | Op | Post-Atom-4 expectation |
|---|------|----|--------------------------|
| 7 | `scripts/seed-canonical-fixture.mjs:340` | INSERT | No call-site change. Seed rows are "open" holdings (end_date defaults to NULL). |
| 8 | `components/onboarding/OnboardingFlow.tsx:197` | INSERT | No call-site change. Same default. |
| 9 | `components/shareholders/IssueSharesModal.tsx:122` | INSERT | No call-site change. Same default. |
| 10 | `components/shareholders/EditShareholdingModal.tsx:53-62` | UPDATE | **Verify in atom 4 brief**: the modal's update payload must not accidentally clobber `end_date` once that column exists. If the modal does not surface end_date in its form, the UPDATE statement must explicitly omit `end_date` from its `.update({...})` object (which today it already does — it whitelists specific fields). Confirm no regression. |

None of these four sites require R-G1 SELECT-side temporal-filter changes. Atom 4 migration owns the column default.

---

## §7 — Atom 4 ship-brief implications (summary)

| Site # | Decision | Atom 4 change required |
|--|--|--|
| 1 | needs-current-only | Add `.is('end_date', null)` to SELECT at line 185 |
| 2 | needs-current-only | Add `.is('end_date', null)` to SELECT at line 90 |
| 3 | MIXED — see §5 | Keep SELECT unfiltered; derive `currentShareholdings` for display paths; keep `nextCertificateNumber` on unfiltered list |
| 4 | needs-current-only | Add `.is('end_date', null)` to SELECT at line 78 |
| 5 | needs-current-only | Add `.is('end_date', null)` to SELECT at line 62 |
| 6 | needs-full-history | Keep nested-embed SELECT end-date-agnostic. Out-of-R-G1 follow-up: route should emit `end_date` and BinderView should grow "Fin" + "Statut" columns to match sibling register cards (see §5). |
| 7-10 | mutations, out of scope | None at call sites; migration owns column default; Site 10 verify-only |

**LOCK-7 anomaly:** Lock Reconciliation candidate per §8.9 — resolve at atom 4 brief authoring (see §4.1).

**Generator coverage:** 1 actual generator-side consumer (Site 1). All PDF document types covered via single-site change.

---

## §8 — Methodology contributions (for §8.x bank)

- **§8.X dual-pass consumer grep:** when auditing a table whose rows
  are commonly nested via PostgREST embeds, a second grep on
  `<table>\(` is required to catch hidden consumers. Caught Site 6
  in this audit.

- **§8.Y caller-evidence ambiguity resolution:** when a handler's
  semantic intent is ambiguous on the handler's own evidence
  (Site 6 had no params, no branching, no end_date filter, but a
  statutory-sounding title), grep for callers of the route and inspect
  the rendering surface. Sibling renderings (the directors and officers
  RegisterCards in the same binder section) disambiguated Site 6
  decisively to needs-full-history. Faster than escalating; resolves on
  evidence in-repo. Recommend folding into §8 bank.

- **§8.9 reinforcement:** LOCK-7 mismatch (expected 6, actual 1
  generator-side / 3 document types) successfully surfaced as a Lock
  Reconciliation candidate rather than blocking the audit. Pattern
  works as documented.
