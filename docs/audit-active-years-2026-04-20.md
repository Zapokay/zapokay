# Audit — Active / Tracked Fiscal Years

**Date:** 2026-04-20
**Scope:** Current state of "active fiscal years" / "tracked fiscal years" / year-toggling in Paramètres.
**Mode:** Read-only investigation. No source files were modified.

---

## TL;DR

There are **two parallel, unreconciled systems** in the repo for tracking fiscal years:

| System | Table | Introduced by | Used by |
|---|---|---|---|
| **Legacy / UI-facing** | `company_fiscal_years` | Onboarding step 8 + Paramètres toggle | Paramètres UI, onboarding, dashboard history, compliance YearPicker, wizard, minute-book completeness, docs page, gap analysis |
| **Sprint 9H Phase 1–2** | `company_active_years` | `lib/active-years.ts` | `lib/priority.ts` (oldest gap), dashboard `getActiveYears` call, compliance page `getActiveYears` call (for `activeSet` filter only) |

**The "Exercices financiers suivis" toggle in Paramètres writes to `company_fiscal_years`, NOT to `company_active_years`.** The Sprint 9H Phase 1–2 infrastructure (`lib/active-years.ts` + `company_active_years`) is seeded once during onboarding and is never re-synchronised when the user toggles years in Paramètres.

---

## 1. Component(s) rendering "Exercices financiers suivis"

### Page wrapper
`app/[locale]/dashboard/settings/page.tsx`

- Lines **52–55** — reads `company_fiscal_years` (`year, status`) for this company.
- Lines **57–64** — reads `documents` for the company and collects their `document_year` values into `documentYears`.
- Lines **6–18, 66–70** — `computeAllYears()` builds the visible year list: `currentYear` back to `max(incorpYear, currentYear − 7)`.
- Lines **100–118** — renders `<SettingsClient>` passing `savedFiscalYears`, `documentYears`, `allYears`.

### Client component (the section itself)
`components/dashboard/SettingsClient.tsx`

- Lines **18–21** — `FiscalYearEntry { year, status }` type.
- Lines **97–103** — fiscal-years state: `initialActive` built from `savedFiscalYears.filter(fy => fy.status === 'active')`; `activeYears: Set<number>`; `togglingYear`; `toggleError`.
- Lines **219–277** — `toggleYear(year)` handler (see §2).
- Lines **642–720** — the `"Exercices financiers suivis"` / `"Tracked fiscal years"` card:
  - Line **644** — section heading.
  - Lines **646–649** — toggle-error banner.
  - Lines **650–654** — helper copy.
  - Lines **656–719** — empty-state fallback + year-row loop.
  - Lines **682–696** — the "Protégé / Protected" badge (see §3).
  - Lines **699–714** — the toggle switch button wired to `toggleYear(year)`.

---

## 2. `onChange` handler for year toggles — what table it writes to

Handler: `toggleYear(year: number)` at `components/dashboard/SettingsClient.tsx:220–277`.

Flow:

1. If the user is **deactivating** a year, first runs a document-count probe (lines 226–242):
   ```
   supabase.from('documents')
     .select('id', { count: 'exact', head: true })
     .eq('company_id', companyId)
     .eq('document_year', year)
     .eq('status', 'active')
   ```
   If `count > 0`, aborts with the error "Des documents existent pour l'exercice … Supprimez-les d'abord."
2. Optimistically mutates local `activeYears` Set.
3. Writes to Supabase — **always `company_fiscal_years`** (lines 252–264):
   - Deactivating (already active):
     ```
     supabase.from('company_fiscal_years')
       .update({ status: 'archived' })
       .eq('company_id', companyId)
       .eq('year', year)
     ```
   - Activating:
     ```
     supabase.from('company_fiscal_years')
       .upsert({ company_id: companyId, year, status: 'active' },
               { onConflict: 'company_id,year' })
     ```
4. On error, rolls back local state + alerts.
5. On success: `router.refresh()`.

**Answer: writes to `company_fiscal_years`.** `company_active_years` is never touched by this handler. `lib/active-years.ts` is not imported in `SettingsClient.tsx`.

---

## 3. "PROTÉGÉ" badge — location & trigger condition

Location: `components/dashboard/SettingsClient.tsx:682–696`.

Source text is `"Protégé"` / `"Protected"`; the ALL-CAPS appearance ("PROTÉGÉ") comes from inline CSS `textTransform: 'uppercase'` at line 687.

Trigger condition (line **665** + line **682**):
```
const hasDoc = documentYears.includes(year)
...
{hasDoc && ( <span ...>Protégé</span> )}
```

`documentYears` is computed server-side in `app/[locale]/dashboard/settings/page.tsx:62–64` by selecting `document_year` from the `documents` table for the company and filtering out nulls. **So: the badge renders whenever at least one row in `documents` for this company has `document_year = <that year>`** — regardless of the document's `status` (the page-level query does not filter on `status`, unlike the toggle-abort probe in `toggleYear` which only counts `status = 'active'`). That is an asymmetry worth noting.

No separate "PROTÉGÉ" string elsewhere in the repo (grep for `PROTÉGÉ` / `Protégé` returns only `SettingsClient.tsx`).

---

## 4. Every file referencing `company_active_years`

Grep: `company_active_years` → **1 file, 2 references.**

- `lib/active-years.ts:8` — `getActiveYears()` SELECT.
- `lib/active-years.ts:93` — `seedDefaultActiveYears()` UPSERT.

**Indirect usage via the helpers:**

- `getActiveYears` is imported by:
  - `lib/priority.ts:2, 32`
  - `app/[locale]/dashboard/page.tsx:11, 178`
  - `app/[locale]/dashboard/compliance/page.tsx:7, 69`
- `seedDefaultActiveYears` is imported by:
  - `components/onboarding/OnboardingFlow.tsx:5, 102` — seeded once after company creation; failure is swallowed.
- `computeDefaultActiveYears` is internal (only used by `seedDefaultActiveYears`).

No migration in `supabase/migrations/` or `migrations/` or `supabase/schema.sql` creates `company_active_years`. It appears to be an assumed table (presumably created out-of-band or in a migration not tracked in this repo).

---

## 5. Every file referencing `active_fiscal_years` and `trackedFiscalYears`

- `active_fiscal_years` (exact literal) → **0 files**.
  - However a local variable named `activeFiscalYears` appears in `app/[locale]/dashboard/compliance/page.tsx:71` (= fiscal years returned from `company_fiscal_years` intersected with the `company_active_years` set).
- `trackedFiscalYears` → **1 file, 2 references**:
  - `app/[locale]/dashboard/page.tsx:193` — destructured `data: trackedFiscalYears`.
  - `app/[locale]/dashboard/page.tsx:212` — iterated to build `fiscalYearHistory`.
  - Data source: `company_fiscal_years` (not `company_active_years`).

---

## 6. Comparison — is "Exercices financiers suivis" wired to the Sprint 9H Phase 1–2 infra?

**No.** The section in Paramètres is wired to `company_fiscal_years`, not to `company_active_years` / `lib/active-years.ts`.

Evidence:

- `SettingsClient.tsx` never imports `@/lib/active-years`.
- `settings/page.tsx` never imports `@/lib/active-years`; it reads `company_fiscal_years` directly.
- `toggleYear()` writes only to `company_fiscal_years`.

The two systems currently overlap as follows:

| Location | Source of truth used |
|---|---|
| Onboarding step 8 (`components/onboarding/FiscalYearsSetup.tsx`) | `company_fiscal_years` |
| Onboarding company creation (`OnboardingFlow.tsx`) | **Also** seeds `company_active_years` via `seedDefaultActiveYears` |
| Paramètres "Exercices financiers suivis" toggle | `company_fiscal_years` |
| Dashboard page (`app/[locale]/dashboard/page.tsx`) | Reads **both** — `getActiveYears` (for compliance calc) AND `company_fiscal_years` (for history list) |
| Compliance page (`app/[locale]/dashboard/compliance/page.tsx`) | Reads **both** — intersects `company_fiscal_years` with `company_active_years` via `activeSet` |
| `lib/priority.ts` (oldest-gap picker) | `company_active_years` only |
| Compliance API `/api/minute-book/completeness` | `company_fiscal_years` only |
| Wizard page, Documents page, Gap Analysis, `FiscalYearsSetup` | `company_fiscal_years` only |

### Observable consequence

When a user toggles a year off in Paramètres:
- `company_fiscal_years.status` → `archived` (UI updates, onboarding/dashboard history hides it, completeness API ignores it).
- `company_active_years` row is **not** deleted.
- `lib/priority.ts::getOldestGap()` and any `calculateComplianceItems(…, activeYears)` call that uses `getActiveYears` will still treat that year as active.

Symmetric issue when toggling a year on in Paramètres: the row lands in `company_fiscal_years` only; `company_active_years` is never upserted.

### Migration / schema note

No migration creating `company_active_years` or `company_fiscal_years` is tracked in `supabase/migrations/` (`20260329…documents_vault.sql`, `20260330…compliance_engine.sql`, `20260405_sprint6_people_ownership.sql`, `20260409_preferred_theme_nullable.sql`), `migrations/sprint4_ai_columns.sql`, or `supabase/schema.sql`. Both tables are referenced by code but their DDL is not in this repo.

---

## Appendix — full grep index

### Files touching `company_fiscal_years`
- `app/api/minute-book/completeness/route.ts:74`
- `app/api/ai/gap-analysis/route.ts:57`
- `app/[locale]/dashboard/page.tsx:192,195`
- `app/[locale]/dashboard/compliance/page.tsx:62`
- `app/[locale]/dashboard/documents/page.tsx:41`
- `app/[locale]/dashboard/settings/page.tsx:53`
- `app/[locale]/dashboard/wizard/page.tsx:218`
- `app/[locale]/onboarding/fiscal-years/page.tsx:27`
- `components/ai/GapAnalysisPanel.tsx:77`
- `components/dashboard/SettingsClient.tsx:254,261`
- `components/onboarding/FiscalYearsSetup.tsx:59,65,81,90`

### Files touching `company_active_years`
- `lib/active-years.ts:8,93`

### Files consuming `getActiveYears` / `seedDefaultActiveYears` / `computeDefaultActiveYears`
- `lib/priority.ts:2,32`
- `app/[locale]/dashboard/page.tsx:11,178`
- `app/[locale]/dashboard/compliance/page.tsx:7,69`
- `components/onboarding/OnboardingFlow.tsx:5,102`
