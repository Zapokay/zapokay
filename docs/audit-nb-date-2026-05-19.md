# NB-Date Audit — UTC-midnight parse causing dashboard card off-by-one

Date: 2026-05-19
Origin: Tier 1 #16 (Queue.md v3.47); surfaced during Phase 10A.5 atom 2 production verification 2026-05-19.
Status: Audit complete; fix planning in Phase B (separate brief to follow Phase A→B review gate).

---

## 1. Bug summary

Dashboard cards on Administrateurs, Dirigeants, and Actionnaires display dates one calendar day earlier than the canonical DB value. The bug is consistent across all three surfaces, all locales (FR + EN), and reproduces for any user in a UTC-negative time zone — the entire Canadian and US footprint, year-round.

**Canonical exhibit.** Acme Test inc. (id `aceaceac-0000-4000-8000-000000000002`) has `companies.incorporation_date = '2018-04-17'`, three `director_mandates.appointment_date = '2018-04-17'`, two `officer_appointments.appointment_date = '2018-04-17'`, and three `shareholdings.issue_date = '2018-04-17'`. All values are PostgreSQL `date` (no zone information). In Montréal (`America/Toronto`, UTC-4 in EDT), every Card surface renders the appointment / issue date as `"16 avr. 2018"` while Settings (which displays the same `companies.incorporation_date`) renders correctly as `"17 avril 2018"`.

**Root cause.** Bare `new Date(isoDateString)` parse of a DATE column. ECMAScript 2024 §21.4.3.2 (Date Time String Format) treats the date-only form `YYYY-MM-DD` as UTC midnight. `toLocaleDateString` with no `timeZone` option then formats the **local** date components of that UTC instant, shifting the displayed day by the local UTC offset.

The bug is pre-existing — not a Phase 10A.5 atom 2 regression. It was masked previously because production verification used dates where the local-zone interpretation happened to roll forward to the same calendar day; Acme's April 17 in EDT does not.

---

## 2. Scope

Wide audit of date rendering across `app/`, `components/`, and `lib/`. The following patterns were searched via Grep against `*.{ts,tsx,js,jsx}` (excluding `node_modules`, `.next`, `supabase/migrations`):

| Pattern | Hits | Notes |
|---|---|---|
| `toLocaleDateString` | 14 | All cataloged in §5/§6 |
| `toLocaleString` | 10 | All number formatting (`.toLocaleString` on integers) — out of scope |
| `new Date(` | ~50 | Display-relevant occurrences all funnel through `toLocaleDateString`; arithmetic / sorting / defaults catalogued separately in §7b DOWNSTREAM where they bare-parse DATE columns |
| `formatDate` | 7 (6 inline + 1 exported) | Cataloged in §8 |
| `date-fns` | 0 | No matches |
| `Intl.DateTimeFormat` | 0 | No matches |

**Schema column types** were resolved from `supabase/schema.sql` and migrations (Sprint 6, Phase 10A.5). DATE columns: `companies.incorporation_date`, `director_mandates.appointment_date`, `officer_appointments.appointment_date`, `shareholdings.issue_date`, `compliance_items.due_date`. TIMESTAMPTZ columns: `documents.uploaded_at`, `documents.created_at`, `activity_log.created_at`.

**Coverage closure.** Two files reached by the Step 1 grep that did not surface a display site were re-verified individually:
- `app/[locale]/onboarding/fiscal-years/page.tsx` — verified non-display (pure server data fetcher; passes `incorporation_date` string through to `FiscalYearsSetup` without parsing).
- `app/[locale]/dashboard/settings/page.tsx:13` — DOWNSTREAM hit found (`new Date(incorporationDate).getFullYear()` for year-selector floor); cataloged in §7b.

---

## 3. Reproduction in dev

### 3.1 DB confirmation of canonical exhibit

Run against the linked Supabase project (`npx supabase db query --linked`):

```sql
SELECT id, legal_name_fr, incorporation_date,
       pg_typeof(incorporation_date) AS column_type
FROM companies
WHERE legal_name_fr = 'Acme Test inc.';
```

Result:

| id | legal_name_fr | incorporation_date | column_type |
|---|---|---|---|
| `aceaceac-0000-4000-8000-000000000002` | Acme Test inc. | `2018-04-17` | `date` |

Companion queries confirmed the same `2018-04-17` literal across `director_mandates.appointment_date` (3 rows), `officer_appointments.appointment_date` (2 rows), and `shareholdings.issue_date` (3 rows). All four columns are `pg_typeof = date`. The bug therefore reproduces independently on each Card surface against its own DATE column — not via cross-pollination from `incorporation_date`.

### 3.2 Parse chain trace — `components/directors/DirectorCard.tsx` (BUGGY exemplar)

1. **API layer.** `app/api/registers/directors/route.ts` selects `appointment_date` from `director_mandates` and returns it via PostgREST's default DATE serialization — JSON string `"2018-04-17"`, no timezone designator.
2. **Render boundary.** `components/directors/DirectorCard.tsx:115` calls `formatDate(director.appointment_date, locale)`.
3. **Inline helper.** `components/directors/DirectorCard.tsx:46-52`:
   ```ts
   function formatDate(iso: string, locale: string): string {
     return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
       day: 'numeric',
       month: 'short',
       year: 'numeric',
     });
   }
   ```
4. **Parse.** `new Date("2018-04-17")` → per ECMAScript 2024 §21.4.3.2 the date-only form is treated as UTC midnight. Resulting `Date` value: absolute instant `2018-04-17T00:00:00.000Z`.
5. **Format.** `toLocaleDateString('fr-CA', …)` with no `timeZone` option formats in the system local zone. In Montréal (`America/Toronto`, UTC-4 in EDT — DST was in effect on 2018-04-17 between Mar 10 and Nov 4), the local representation of `2018-04-17T00:00:00.000Z` is `2018-04-16T20:00:00-04:00`. `toLocaleDateString` renders the **local** date components → April 16, 2018 → `"16 avr. 2018"`.

The same chain applies to `components/officers/OfficerCard.tsx:48` (against `officer_appointments.appointment_date`), `components/shareholders/ShareholderCard.tsx:48` (primary holding row, against `shareholdings.issue_date`), and `components/shareholders/ShareholderCard.tsx:153` (additional holdings list, same column). The exported but currently dead `lib/utils.ts:10` would behave identically if revived against any DATE column.

---

## 4. Why Settings + Binder are correct — three-mechanism taxonomy

The repo currently dodges the UTC-midnight bug through **three distinct mechanisms** at non-buggy sites. They are not interchangeable; understanding which mechanism applies at each correct site is the precondition for a Phase B fix that doesn't regress them. This taxonomy is reusable as a reference for future date-rendering code.

1. **Safe-parse pattern** — append `'T00:00:00'` to the ISO date string before constructing the `Date`. Per ECMAScript 2024 §21.4.3.2, this flips the spec branch from "date-only → UTC" to "date+time without offset → local time"; `new Date("2018-04-17T00:00:00")` yields a `Date` whose local components are April 17, regardless of UTC offset. Canonical example: `components/dashboard/SettingsClient.tsx:529` — `new Date(editIncorpDate + 'T00:00:00').toLocaleDateString(…)`.

2. **Consume a TIMESTAMPTZ column** — when the source column is `timestamptz`, PostgREST serializes with explicit offset (e.g. `"2026-04-22T14:32:11.123+00:00"`); `new Date(...)` honors the offset and constructs the correct absolute instant. Bare parse is only buggy when the input string lacks zone information — i.e. only on DATE columns. Canonical example: `components/minute-book/BinderSection.tsx:24` — `new Date(doc.created_at).toLocaleDateString(…)` against `documents.created_at` (TIMESTAMPTZ).

3. **No parse at all** — render the DB string directly in JSX. The DATE value arrives as the literal `"2018-04-17"` and is emitted to the DOM unchanged; the `Date` constructor is never invoked, so the UTC-midnight code path is never entered. Canonical example: `components/minute-book/BinderView.tsx:68,91,113` → `components/minute-book/RegisterCard.tsx:45` (`{row[col.key]}`). Caveat: this mechanism is locale-illiterate by construction — FR users see `2018-04-17` instead of `17 avr. 2018`. Banked as §10 follow-up.

A Phase B fix must preserve all three mechanisms at their existing sites or migrate them deliberately. Touching a TIMESTAMPTZ site with `+ 'T00:00:00'` (mechanism 1 logic applied to mechanism 2 input) would itself introduce an off-by-offset bug.

---

## 5. Site inventory — BUGGY (display)

Bare `new Date(isoDateString)` parse of a DATE column followed by `toLocaleDateString`. Off-by-one in every UTC-negative time zone.

| # | File:line | Field | Column type | Source line (parse) |
|---|---|---|---|---|
| 1 | `components/directors/DirectorCard.tsx:47` | `director.appointment_date` | `date` | `new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' })` |
| 2 | `components/officers/OfficerCard.tsx:48` | `officer.appointment_date` | `date` | `new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' })` |
| 3 | `components/shareholders/ShareholderCard.tsx:48` | `primary.issue_date` (primary holding line, ll. 133-134 in the JSX) | `date` | `new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' })` |
| 4 | `components/shareholders/ShareholderCard.tsx:153` | `sh.issue_date` (additional holdings list — same `formatDate` helper, second call site at line 153 JSX) | `date` | (calls same line-47 `formatDate`) |
| 5 | `lib/utils.ts:10` (exported `formatDate(dateString, locale)`) | any DATE string passed by caller | n/a — generic | `new Date(dateString).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric" })` — **dead today (0 callers; verified via `import.*formatDate.*from` grep); latent if revived. Will be touched in Phase B regardless of fix-approach choice (see §9).** |

---

## 6. Site inventory — CORRECT

Sites that render dates correctly via one of the three mechanisms in §4.

| # | File:line | Field | Column type | Mechanism (§4) | Note |
|---|---|---|---|---|---|
| 1 | `components/compliance/ComplianceItemCard.tsx:48-49` | `item.due_date` | `date` | (1) safe-parse | `new Date(dateStr + 'T00:00:00')` |
| 2 | `components/dashboard/SettingsClient.tsx:529` | `editIncorpDate` (← `companies.incorporation_date`) | `date` | (1) safe-parse | `new Date(editIncorpDate + 'T00:00:00')` |
| 3 | `app/[locale]/dashboard/page.tsx:108` (`formatDueDate`) | compliance gap `dueDate` | `date` | (1) safe-parse | `new Date(dateStr + 'T00:00:00')` |
| 4 | `app/[locale]/dashboard/page.tsx:375` (annual tile) | `nextGap.dueDate` | `date` | (1) safe-parse | `new Date(nextGap.dueDate + 'T00:00:00')` |
| 5 | `components/minute-book/BinderSection.tsx:24` | `doc.created_at` | `timestamptz` | (2) TIMESTAMPTZ | bare parse, zone info present |
| 6 | `app/[locale]/dashboard/page.tsx:509` | `doc.created_at` (recent documents tile) | `timestamptz` | (2) TIMESTAMPTZ | bare parse, zone info present |
| 7 | `components/documents/DocumentRow.tsx:41` | `doc.uploaded_at ?? doc.created_at` | `timestamptz` | (2) TIMESTAMPTZ | bare parse, zone info present |
| 8 | `components/activity/ActivityPage.tsx:28,39` (`getDateLabel`) | `event.created_at` | `timestamptz` | (2) TIMESTAMPTZ | bare parse, zone info present |
| 9 | `lib/pdf/generatePDF.ts:99` | `new Date()` (current instant) | n/a | (1) safe-parse (vacuously) | no string parse — `new Date()` returns current instant |
| 10 | `app/api/due-diligence/export/route.ts:202` | `new Date()` (export prepared timestamp) | n/a | (1) safe-parse (vacuously) | same — current instant |
| 11 | `components/minute-book/BinderView.tsx:68,91,113` → `components/minute-book/RegisterCard.tsx:45` | `appointment_date`, `issue_date`, `end_date` | `date` | (3) no parse | raw `{row[col.key]}` echo. Renders ISO `2018-04-17` literal. CORRECT for NB-Date; §10 follow-up for UX. |

---

## 7. Site inventory — UNKNOWN

None. All column types resolved from `supabase/schema.sql` + migration history. No ambiguous parse patterns surfaced.

---

## 7b. Site inventory — DOWNSTREAM (added during Step 2 — non-display)

Bare-parse of a DATE column followed by reads of local-component getters (`getFullYear`, `getMonth`, `getDate`) for arithmetic or selector-list construction. Not rendering sites, but drift propagates downstream to UI when the DATE falls on a year/month boundary that local-zone interpretation flips (typically Jan 1 and start-of-month dates in UTC-negative zones).

| # | File:line | Field | Column type | Pattern |
|---|---|---|---|---|
| 1 | `lib/compliance/calculateComplianceItems.ts:66-68` | `incorporationDate` (← `companies.incorporation_date`) | `date` | `new Date(incorporationDate)` then `.getMonth()` / `.getDate()` to compute Corporations-Canada annual-return anniversary. One-line catalogue per investigation-scope directive; not extending into compliance logic. |
| 2 | `app/[locale]/dashboard/settings/page.tsx:13` | `incorporationDate` (← `companies.incorporation_date`) | `date` | `new Date(incorporationDate).getFullYear()` for year-selector floor (`computeAllYears`). |
| 3 | `app/[locale]/dashboard/page.tsx:33` | `incorporationDate` (← `companies.incorporation_date`) | `date` | `new Date(incorporationDate).getFullYear()` in `computeFiscalYearHistory`. |

---

## 8. Canonical helper situation

### 8.1 The exported helper

`lib/utils.ts:8-15`:

```ts
export function formatDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    year: "numeric", month: "long", day: "numeric",
  });
}
```

- **Signature:** `(dateString: string, locale: string) → string`.
- **Parse:** bare `new Date(dateString)` — NOT timezone-safe for ISO DATE strings.
- **Locale handling:** locale-aware (`fr-CA` / `en-CA`). The bilingual i18n audit (`docs/audit-bilingual-i18n-2026-04-28.md` §7) graded this line "architecturally OK — accepts locale param" — that grade was about locale handling and did not cover timezone safety. Re-verified for this audit.
- **Callers:** **zero**. Grep `import.*formatDate.*from` returned no matches; the only consumed export of `lib/utils.ts` is `cn` (clsx wrapper), used by `components/ui/Input.tsx`, `components/ui/Button.tsx`, `components/dashboard/DashboardShell.tsx`, `components/ui/ZapLogo.tsx` — none of which touch dates.
- **Status:** dead but exported. The bug-shaped parse exists in the codebase as a stub. Phase B will need to touch it regardless of which fix-approach is chosen.

### 8.2 The six inline shadows + two inline parses

No shared timezone-safe helper exists today. Six components define their own inline `formatDate`; two additional files inline the safe parse directly:

| File:line | Format options | Parse safety |
|---|---|---|
| `components/directors/DirectorCard.tsx:46-52` | day-numeric / month-short / year-numeric | BARE |
| `components/officers/OfficerCard.tsx:47-52` | day-numeric / month-short / year-numeric (identical to DirectorCard) | BARE |
| `components/shareholders/ShareholderCard.tsx:46-52` | day-numeric / month-short / year-numeric (identical) | BARE |
| `components/minute-book/BinderSection.tsx:23-29` | numeric / 2-digit / 2-digit | BARE, but consumes TIMESTAMPTZ → coincidentally CORRECT |
| `components/compliance/ComplianceItemCard.tsx:46-54` | year-numeric / month-long / day-numeric | SAFE (`+ 'T00:00:00'`) |
| `components/activity/ActivityPage.tsx:22-44` (`getDateLabel`) | day-numeric / month-long / year-numeric | BARE, but consumes TIMESTAMPTZ → CORRECT |
| `components/dashboard/SettingsClient.tsx:529` (inline) | year-numeric / month-long / day-numeric | SAFE |
| `app/[locale]/dashboard/page.tsx:106-114` (`formatDueDate`, inline) | year-numeric / month-long / day-numeric | SAFE |
| `app/[locale]/dashboard/page.tsx:375` (inline) | month-short / day-numeric / year-numeric | SAFE |

**State of convergence.** `lib/utils.ts:formatDate` has been exported and dead from at least the bilingual i18n audit period (2026-04-28) and likely earlier. During that same window, four sites independently reinvented the safe `+ 'T00:00:00'` pattern while six sites kept the bare parse. The exported helper exists as a stub but discipline did not hold: the codebase did not converge on it. This is the load-bearing fact for §9's centralize-vs-per-site argument.

### 8.3 Phase B canonical helper shape (proposal — for §9 discussion, not implemented here)

If centralization is chosen at the Phase A→B review gate, a viable shape is:

```ts
// lib/utils.ts (Phase B proposal — NOT implemented in this audit)
export function parseLocalDate(dateStr: string): Date {
  // Detect ISO DATE shape and append local-midnight; otherwise parse as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

export function formatDate(
  dateString: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return parseLocalDate(dateString).toLocaleDateString(
    locale === 'fr' ? 'fr-CA' : 'en-CA',
    options ?? { year: 'numeric', month: 'long', day: 'numeric' },
  );
}
```

Display sites call `formatDate(value, locale, opts)`; downstream-arithmetic sites call `parseLocalDate(value)` and then read local components. The shared `parseLocalDate` primitive is what unifies §5 BUGGY + §7b DOWNSTREAM under one chokepoint.

---

## 9. Phase B fix-approach options (CC recommendation)

Three viable shapes. Final choice deferred to Dom + Max at the Phase A→B review gate.

### 9.1 The DOWNSTREAM constraint

A display-side helper fix **does not reach** §7b. `lib/compliance/calculateComplianceItems.ts:66`, `app/[locale]/dashboard/settings/page.tsx:13`, and `app/[locale]/dashboard/page.tsx:33` bare-parse a DATE for `getFullYear` / `getMonth` / `getDate` arithmetic — there is no `toLocaleDateString` boundary to intercept. Concrete example: a company incorporated `2020-01-01` stored as DATE is parsed as UTC midnight, which in any Canadian time zone (all UTC-negative) yields local components for `2019-12-31` — so `app/[locale]/dashboard/settings/page.tsx:13`'s `computeAllYears` floors the year-selector at 2019 instead of 2020, drifting the selectable-years list by one. The Phase B fix must handle both display sites and downstream-arithmetic sites, or NB-Date is not actually closed.

### 9.2 Option (a) — centralize via `lib/utils.ts`

**Shape.** Add `parseLocalDate(dateStr): Date` primitive (~5 LOC) and extend `formatDate(dateString, locale, options?)` to use it and accept `Intl.DateTimeFormatOptions` (~5 LOC delta). All §5 BUGGY display sites import `formatDate`; all §7b DOWNSTREAM sites call `parseLocalDate` directly for arithmetic.

**LOC.** Net **≈ −20 LOC** after migration: helper +10, removal of 5 inline `formatDate` shadows ≈ −25, 3 DOWNSTREAM call swaps ≈ +0 net. If the 4 SAFE inline parses (§6 rows 1-4) are also migrated, net ≈ −30 LOC.

**Regression risk to CORRECT sites.** Higher: §6 rows 5-8 (TIMESTAMPTZ) and rows 9-10 (`new Date()` current instant) must not be migrated — the helper's ISO-DATE-shape detector `/^\d{4}-\d{2}-\d{2}$/` would let TIMESTAMPTZ strings through unchanged, so the helper is safe in principle, but a Phase B reviewer must verify no TIMESTAMPTZ site is accidentally pointed at it. §6 row 11 (raw echo) must not be migrated either (would change UX). Migrating the 4 SAFE inline parses is **optional** but recommended for convergence.

**Convergence argument.** Structural: gives the codebase **one chokepoint** to enforce parse safety. The intent is that `import { formatDate, parseLocalDate } from '@/lib/utils'` becomes the only legal way to render or parse a date going forward. State directly: discipline did NOT hold historically — `lib/utils.ts:formatDate` was exported and dead while four sites independently reinvented `+ 'T00:00:00'` and six kept the bare parse. Option (a) is the only proposal that addresses the convergence failure directly; it accepts the cost of touching one shared file to gain one enforceable chokepoint.

### 9.3 Option (b) — per-site minimal touch

**Shape.** Append `+ 'T00:00:00'` at each of the 5 §5 BUGGY and 3 §7b DOWNSTREAM sites. No new helper; `lib/utils.ts:formatDate` left dead. Bare-parse `new Date(x)` becomes `new Date(x + 'T00:00:00')`; bare-parse `new Date(x).getFullYear()` becomes `new Date(x + 'T00:00:00').getFullYear()`.

**LOC.** Net ≈ **+0 LOC**: 8 lines modified in place, no additions.

**Regression risk to CORRECT sites.** Lowest of the three: touches only §5 BUGGY and §7b DOWNSTREAM by definition; §6 CORRECT sites are untouched.

**Convergence argument.** **None**. The repo continues to carry N parallel parses across N files. Discipline failed once already on the same codebase shape; option (b) accepts that as the steady state. The minimal-diff argument is real, but the historical evidence (§8.2) is that minimal-diff has been the de facto regime here and has produced a 6-vs-4 split between bare and safe inline parses. Option (b) ships NB-Date but does not move the codebase toward a position where the next analogous bug is structurally prevented.

### 9.4 Option (c) — hybrid

**Shape.** Fix `lib/utils.ts:formatDate` in place (detect ISO-DATE shape, append `T00:00:00`, accept optional `Intl.DateTimeFormatOptions`). Migrate the 5 §5 BUGGY display sites to import it (removes the 4 inline `formatDate` shadows at DirectorCard/OfficerCard/ShareholderCard which are pixel-identical 5-line copies of each other, plus the dead row 5 disappears). Per-site `+ 'T00:00:00'` minimal touch on the 3 §7b DOWNSTREAM sites — no shared `parseLocalDate` primitive.

**LOC.** Net ≈ **−15 LOC**: helper +5, 4 inline `formatDate` shadows removed ≈ −20, 3 DOWNSTREAM modified in place +0.

**Regression risk to CORRECT sites.** Low. CORRECT display sites are not required to migrate (the helper has the same format-options API, so they can adopt opportunistically); DOWNSTREAM is touched site-by-site. The dead-export risk on `lib/utils.ts:formatDate` (someone else importing it during Phase B) is the same as option (a) and is mitigated by re-grepping immediately before merge.

**Convergence argument.** **Partial chokepoint**: display sites converge on `lib/utils.ts:formatDate`; arithmetic sites stay scattered. Honest tradeoff — option (c) is option (a) minus the `parseLocalDate` primitive. The reasoning for accepting the partial chokepoint is that the three §7b DOWNSTREAM sites read **different** local components (`getFullYear` vs `getMonth` / `getDate`) for different arithmetic purposes; a `parseLocalDate` primitive would add a shared dependency for three callers with modest LOC savings, and the per-site `+ 'T00:00:00'` pattern is closer in spirit to the existing four safe inline parses at SettingsClient / dashboard.

### 9.5 Format-variance tradeoff (applies to options (a) and (c))

Existing renderers use at least four different `Intl.DateTimeFormatOptions` shapes:

- day-numeric / month-short / year-numeric — DirectorCard, OfficerCard, ShareholderCard
- year-numeric / month-long / day-numeric — ComplianceItemCard, SettingsClient, `app/[locale]/dashboard/page.tsx:108`
- month-short / day-numeric / year-numeric — `app/[locale]/dashboard/page.tsx:375`
- numeric / 2-digit / 2-digit — BinderSection
- day-numeric / month-long / year-numeric — ActivityPage

If centralization is chosen, two sub-options exist:

- **(i)** Helper accepts `Intl.DateTimeFormatOptions` arg → API broader, **cross-surface UX preserved as-is**.
- **(ii)** Helper forces one canonical format → **cross-surface UX change** that is out-of-NB-Date-scope and needs product sign-off from Dom before Phase B can ship.

**CC recommendation (i)** for NB-Date — preserves existing UX, scopes Phase B tightly. The (ii) standardization decision is banked in §10 as out-of-scope follow-up.

### 9.6 CC recommendation

**Option (c) — hybrid**, with format-variance sub-option (i).

Reasoning:
- The 5 §5 BUGGY display sites include three pixel-identical inline `formatDate` definitions (DirectorCard, OfficerCard, ShareholderCard) plus two callers of one of them. Centralizing them gives one chokepoint **where the duplication-cost is highest** and removes ≈ 20 LOC of identical-shape duplication.
- The 3 §7b DOWNSTREAM sites read different local components for different arithmetic purposes; a shared `parseLocalDate` primitive would centralize three callers with modest LOC savings. The per-site `+ 'T00:00:00'` pattern at those three sites mirrors the existing four safe inline parses at SettingsClient / dashboard and is the lowest-friction path that still closes NB-Date.
- Option (c) gives chokepoint discipline on the part of the codebase where (a) discipline already failed and (b) the duplication-cost is highest; it accepts per-site minimal touch where arithmetic semantics differ per site.
- Caveat to surface: option (c) DOES require touching `lib/utils.ts` (a shared file historically left dead). Phase B should re-grep `import.*formatDate.*from` immediately before merge to verify no concurrent feature work began importing it during the Phase A→B gap.

Final choice deferred to Dom + Max at the Phase A→B review gate. Option (a) is the more disciplined choice; option (b) is the lowest-risk choice; option (c) is the recommended balance.

---

## 10. Out-of-scope follow-ups surfaced during audit

Banked for memory regen and future grooming; no fix proposed and not investigated further this session.

- **Binder register raw ISO display.** `components/minute-book/BinderView.tsx:68,91,113` → `RegisterCard.tsx:45` renders DATE column values as raw ISO strings (`2018-04-17`) rather than locale-formatted dates — UX inconsistency vs Cards / Settings; not off-by-one. Defer to bilingual i18n sweep or pre-launch Actionnaires audit.
- **Format variance across surfaces.** At least four different `Intl.DateTimeFormatOptions` shapes coexist across the existing renderers (see §9.5). Cross-surface UX standardization (single canonical format) is out-of-NB-Date-scope and needs product sign-off from Dom before any standardization PR. Bank for product-grooming, not engineering.
- **Compliance arithmetic drift on DATE columns.** Beyond the rendering scope, `lib/compliance/calculateComplianceItems.ts:66-68` reads `.getMonth()` / `.getDate()` of a UTC-midnight Date for Corporations-Canada annual-return anniversary calculation. Cataloged in §7b. The downstream effect on rendered due dates is fully closed by Phase B options (a) or (c); option (b) closes it at the per-site touch. Banking here for completeness because the compliance taxonomy spec lives separately and may want to reference this finding.
- **Bilingual i18n audit §7 line on `lib/utils.ts:10`.** `docs/audit-bilingual-i18n-2026-04-28.md` §7 graded this line "architecturally OK — accepts locale param." That grade is correct on locale axis and silent on timezone axis; the present audit corrects the silence. The i18n audit doc itself does not need amendment — its grade scope was bilingual handling, not timezone safety — but a cross-reference comment could be added when Phase B touches `lib/utils.ts:formatDate`.
