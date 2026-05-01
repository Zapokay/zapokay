# Livre de minutes — investigation report (2026-05-01)

**Type:** read-only investigation, no code changes.
**Scope:** three concerns observed on the Livre de minutes surface.
**Status:** findings + hypotheses; fixes deferred to a follow-up bundle.

---

## Concern 1 — Livre tab: sections 1-7 always show "0 documents"

**Symptom:** In Livre de minutes → **Livre** tab, sections 1-7 ("Statuts et actes constitutifs", "Avis et déclarations", "Règlements", "Résolutions", "Administrateurs", "Dirigeants", "Actionnaires et certificats") all render the empty state "Aucun document dans cette section" even when the user has uploaded multiple documents via the **Complétude** tab. Only section 8 ("Registres corporatifs") appears populated.

### Investigation findings

**Component & API map**

- `components/minute-book/MinuteBookPage.tsx:307` — `{activeTab === 'livre' && <BinderView />}`. `BinderView` is rendered with **zero props** (no `companyId`, no `framework`).
- `components/minute-book/BinderView.tsx:24-29` — fetches **four** endpoints in parallel:
  - `/api/minute-book/binder` (sections + documents)
  - `/api/registers/directors`
  - `/api/registers/officers`
  - `/api/registers/shareholders`
- `components/minute-book/BinderView.tsx:54-130` — render loop:
  - **Section 8 (`registres`)** is special-cased at `BinderView.tsx:55-121`. It is rendered with `documents={[]}` (hardcoded, line 60) and the directors/officers/shareholders register cards are passed as `children`. **Section 8 never displays binder API documents — it only renders register data from `/api/registers/*`.**
  - **Sections 1-7** (`BinderView.tsx:123-128`) render `<BinderSection ... documents={section.documents} />` — they receive whatever the binder API returned for each section key.
- `components/minute-book/BinderSection.tsx:64-67` — empty state condition: `!hasContent` where `hasContent = documents.length > 0 || !!children`. Sections 1-7 never have `children`, so any empty `documents` array triggers "Aucun document dans cette section".

**Crucial implication of this layout:** Section 8 looking "populated" is a *false positive* about the binder API. Section 8 ignores the binder response entirely and pulls from `/api/registers/*`. Sections 1-7 are the only ones whose state actually reflects what `/api/minute-book/binder` returned. So the symptom "sections 1-7 empty, section 8 has data" does **not** mean the binder API is half-working — most likely **the binder API is returning empty arrays for *all* document sections**, and section 8 is masking that because it bypasses them.

**Binder API logic**
`app/api/minute-book/binder/route.ts:30-73`:

```ts
const { data: documents } = await supabase
  .from('documents')
  .select('*, minute_book_requirements!requirement_key(section)')
  .eq('company_id', company.id)
  .eq('status', 'active')                            // ← filter
  .order('created_at', { ascending: false })
```

Then `resolveSection(doc)` (lines 24-28) classifies each document:

```ts
function resolveSection(doc: any): string {
  if (doc.minute_book_section) return doc.minute_book_section
  if (doc.minute_book_requirements?.section) return doc.minute_book_requirements.section
  return DOC_TYPE_SECTION_MAP[doc.document_type] || 'statuts'
}
```

`DOC_TYPE_SECTION_MAP` (lines 15-22): `{statuts→statuts, resolution→resolutions, pv→resolutions, registre→registres, rapport→avis, autre→statuts}`.

Documents whose `resolveSection` value is not one of the eight `SECTIONS` keys are **silently dropped** (`route.ts:58` — `if (grouped[section]) grouped[section].push(doc)`).

**Completeness API logic (Complétude tab)**
`app/api/minute-book/completeness/route.ts:87-92`:

```ts
const { data: documents } = await supabase
  .from('documents')
  .select('requirement_key, requirement_year, source')
  .eq('company_id', company.id)
  .eq('status', 'active')                            // ← same filter
  .not('requirement_key', 'is', null)                // ← additional filter
```

**Both routes use `.eq('status', 'active')`.** So if Complétude shows "28 / 39 complets" (i.e., it can see 28 documents), those documents necessarily have `status='active'` and `requirement_key NOT NULL`. They ought to be visible to the binder query too.

**Upload pipeline (writes from Complétude `Téléverser`)**
`lib/upload-document.ts:103-123`:

```ts
.insert({
  company_id, title, document_type, document_year,
  file_url, file_name, language, framework, uploaded_at,
  source: 'uploaded',
  ...(requirementKey ? { requirement_key: requirementKey } : {}),
  ...(requirementYear !== null ? { requirement_year: requirementYear } : {}),
  ...(minuteBookSection ? { minute_book_section: minuteBookSection } : {}),
})
```

**The insert never sets `status` explicitly.** That field gets whatever the column default is.

`resolveMinuteBookSection` (`lib/upload-document.ts:47-65`) reads the requirement's `.section` field from the in-memory checklist (sourced from `/api/minute-book/completeness`), or falls back to `DOC_TYPE_SECTION_MAP`. So freshly uploaded rows from this path *should* have `minute_book_section` populated.

**Schema state — significant audit finding**

`supabase/schema.sql:145-156` defines `documents` with only these columns: `id, company_id, title, document_type, file_url, language, jurisdiction, framework, uploaded_at, created_at`.

The columns referenced throughout the API code — `status`, `requirement_key`, `requirement_year`, `minute_book_section`, `source`, `document_year`, `file_name` — **are not created in any committed migration** under `supabase/migrations/` or `migrations/`. Grep confirms: no committed `.sql` file mentions `minute_book_section`, `requirement_key`, or `requirement_year`. The `minute_book_requirements` table itself is also never created or seeded in any committed SQL.

So the schema the application expects (and the seed data containing the LSAQ-specific tooltip text) lives only in the live Supabase project, applied out-of-band. This is a separate audit concern in its own right.

**Implication for this concern:** because `status` was added later via an out-of-band migration, **rows inserted before that migration likely have `status = NULL`** (depending on the column default at the time it was added). `.eq('status', 'active')` excludes NULL rows. If the test company has a mix of legacy rows (NULL status) and new rows (active), the binder might return some, none, or all depending on row history.

**Prior audit corroboration**

`docs/audit-phase-4d-stream-1-2026-04-22.md:64,77,78,149` confirms that the **generated**-document path (`source='generated'`, e.g., annual board resolutions) explicitly writes `status: 'active'`, `minute_book_section: 'resolutions'`, and a valid `requirement_key`. So generated docs should classify cleanly. The 2026-04-23 service-role spot check cited in that doc found generated rows had every field correctly populated and "every branch (A/B/C) of `resolveSection()` would correctly classify these rows into `'resolutions'`" — yet the binder UI still reported zero. That puzzle was logged but never resolved.

**Candidate root causes (ranked)**

1. **Foreign-key embed silently failing → no impact.** The select syntax `'*, minute_book_requirements!requirement_key(section)'` (line 48) presumes a Postgres FK between `documents.requirement_key` and `minute_book_requirements.requirement_key`. If that FK is missing, Supabase typically returns the row with `minute_book_requirements: null` rather than dropping it. Branch (a) of `resolveSection` reading `doc.minute_book_section` would still work. **Probably not the cause** — but worth confirming.
2. **`status` column NULL on legacy rows.** Plausible for any document inserted before the `status` column was added. Excluded by `.eq('status', 'active')` on line 50.
3. **The user is looking at a fresh test company** whose documents are all generated (so they should have `minute_book_section='resolutions'` and route to section 4 correctly), and yet section 4 still appears empty — matching the puzzle from the prior audit. If reproducible with a fresh company, this rules out (2) and points at something subtler.
4. **`BinderView` doesn't refresh after upload.** It fetches once on mount (`BinderView.tsx:21-42`, no dependency array beyond `[]`). If the user uploads via Complétude then switches to Livre tab without remounting, the tab might be stale. But because `MinuteBookPage` keeps both tabs in the same component tree and conditionally renders, switching tabs **does** unmount/remount BinderView, so this should work. Unless React's reconciliation preserves it — confirmable by checking render tree, but unlikely cause.

### Root cause hypothesis — **MEDIUM confidence**

Most likely a combination:
- **Section 8 looking "fine" is misleading** — it draws data from a different endpoint and bypasses the binder API entirely. It tells us nothing about whether the binder endpoint works.
- **Sections 1-7 emptiness** is most likely a **data-state problem** (legacy rows with `status=NULL` or missing `minute_book_section`/`requirement_key` getting filtered or misclassified), compounded by an **off-repo schema** that makes the live state hard to reason about.

Confirming this requires running a SQL query against the live database for the affected test company.

### SQL queries we'd want Dom to run (read-only)

```sql
-- 1. What status values exist on the documents table for this company?
SELECT status, COUNT(*) FROM documents
WHERE company_id = '<company_id>'
GROUP BY status;

-- 2. Distribution of minute_book_section for this company's active rows.
SELECT minute_book_section, document_type, source, COUNT(*)
FROM documents
WHERE company_id = '<company_id>'
GROUP BY minute_book_section, document_type, source
ORDER BY 1, 2, 3;

-- 3. Are any rows missing requirement_key or minute_book_section?
SELECT COUNT(*) FILTER (WHERE requirement_key IS NULL)         AS no_req_key,
       COUNT(*) FILTER (WHERE minute_book_section IS NULL)     AS no_section,
       COUNT(*) FILTER (WHERE status IS NULL)                  AS no_status,
       COUNT(*)                                                AS total
FROM documents
WHERE company_id = '<company_id>';

-- 4. Confirm the FK exists between documents.requirement_key and minute_book_requirements.requirement_key.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'documents'::regclass AND contype = 'f';
```

There is already an audit script at `scripts/audit-requirements.mjs` that dumps the full `minute_book_requirements` table (read-only, service role) — useful for confirming what tooltips/section keys are seeded.

### Recommended fix scope — **MEDIUM**

If hypothesis is right:
- **Tactical fix (small):** loosen the binder query — drop `.eq('status', 'active')` or change to `.neq('status', 'archived')` (matching what `calculateComplianceItems` does — see Concern 2). This unifies behavior across surfaces.
- **Investigation (small):** run the SQL queries above to confirm the live data state.
- **Strategic fix (medium):** commit a migration that adds the missing columns + creates `minute_book_requirements` + seeds it, so the schema stops being off-repo. This is a separate cleanup.

### Related concerns surfaced

- **Off-repo schema.** The live `documents` table and the `minute_book_requirements` table are not represented in committed migrations. This is the deeper bug. Tooltip text, section taxonomy, and required column shape all depend on data that isn't versioned with the code.
- **`status='active'` vs `.neq('status', 'archived')` divergence** between `/api/minute-book/binder`, `/api/minute-book/completeness`, `/api/due-diligence/status` (all use `.eq('status', 'active')`) and `lib/compliance/calculateComplianceItems.ts:123` (uses `.neq('status', 'archived')`). The lenient form treats NULL as visible; the strict form excludes NULL.
- **`BinderView` receives no props** — it discovers `companyId` server-side via the user's session inside the API route. That's fine for now but means every binder-related component is implicitly tied to "current user's active company". Worth documenting.

---

## Concern 2 — Three different document totals across surfaces

**Symptom:** Same company, three displays:
- Complétude tab header: **"28 / 39 complets · 11 documents manquants"**
- Vérification avant export modal: **"91% complet · 10/11 documents · DOCUMENTS MANQUANTS (1)"**
- Dashboard "Taux de conformité" card: **"100% obligations remplies"**

### Investigation findings

Each surface uses a different data source and a different counting rule. They are not three implementations of the same metric — they are three different metrics that happen to look like the same thing in the UI.

**Surface A — Complétude tab header**
- Display: `components/minute-book/MinuteBookPage.tsx:227-231` (`data.score% complet · data.totalMissing documents manquants`).
- Source: `GET /api/minute-book/completeness` → `app/api/minute-book/completeness/route.ts:33-172`.
- Counting rule (`route.ts:114-156`):
  - Loads `minute_book_requirements` rows filtered by `framework = LSA|CBCA OR ALL` (line 67).
  - Loads active fiscal years for this company (line 75-81).
  - Loads documents with `status='active' AND requirement_key NOT NULL` (line 87-92).
  - **Foundational requirements**: counted once each.
  - **Annual requirements**: counted **once per active fiscal year** (line 138-153). So `totalRequired = #foundational + #annual × #activeFY`.
  - "Satisfied" = a document row exists with the matching `requirement_key` (and matching `requirement_year` for annual items).
- Example shape that yields 39: e.g., 7 foundational + 4 annual × 8 active FY = 39.

**Surface B — "Vérification avant export" modal**
- Display: `components/due-diligence/DueDiligenceModal.tsx:276-280` (rendering `status.completionScore`, `status.totalComplete`, `status.totalRequired` from API).
- Source: `GET /api/due-diligence/status?companyId=...` → `app/api/due-diligence/status/route.ts:73-129`.
- Counting rule:
  - Loads `minute_book_requirements` rows filtered by framework (line 73-78).
  - `totalRequired = allRequirements.length` (line 89). **No fiscal-year multiplication.** Each requirement is counted once, regardless of category or active-FY count.
  - Builds `completedKeys = Set of requirement_key from documents where status='active' AND requirement_key IS NOT NULL` (line 99-103). **A single uploaded document satisfies that requirement_key for all years simultaneously**, because the dedup set ignores `requirement_year`.
  - `totalComplete = #(requirements whose key is in completedKeys)` (line 107-109).
- Example: 11 unique requirements (regardless of how many active years exist), 10 of which have ≥1 matching document → "10/11 documents · 91% complet". Compatible with Surface A returning 28/39 if there are ~7-8 active fiscal years.

**Surface C — Dashboard "Taux de conformité"**
- Display: `app/[locale]/dashboard/page.tsx:335-345` (StatCard "Taux de conformité"); secondary card lines 597-668. Renders `complianceResult.percentage`.
- Source: `lib/compliance/calculateComplianceItems.ts:81-269`, called from dashboard at line 179-181 with `activeYears`.
- **Different data source — `compliance_rules` table, not `minute_book_requirements`.** This is a parallel taxonomy (defined in `supabase/migrations/20260330000000_compliance_engine.sql:4-17`, seeded with 5 LSA + 5 CBCA rules at lines 45-62).
- Counting rule:
  - Loads `compliance_rules` filtered by `(framework, jurisdiction)` derived from company's incorporation type and province (line 128-143). For CBCA-in-QC, includes both CBCA rules and the LSAQ `req_annual_update` rule (line 137-138).
  - Loads documents with **`.neq('status', 'archived')`** (line 123) — *not* the `.eq('status', 'active')` used elsewhere. Treats NULL status as visible.
  - For each rule, looks up a document by `document_type` only (`DOCUMENT_TYPE_TO_RULE` map, line 187-189). **Does not match by `requirement_key`** — a single PDF of the right `document_type` satisfies the rule regardless of which annual cycle it's for, as long as `uploaded_at` is on or after the **current** fiscal year start (line 156-166).
  - Filters items by `activeYears` at line 242-246: every item produced is dated to the *current* FY end year (line 242), so if the user marked the current FY inactive, all items vanish.
  - `percentage = compliantCount / total` (line 252-253).
- Example: With ~5 CBCA rules and any matching `document_type` uploaded after the current FY start, all show "compliant" → 100%. Since old documents (from prior FYs) are excluded by the `fyStartStr` filter (line 161), this is even easier to reach if the user has uploaded recently.

### Side-by-side summary

| Aspect | A (Complétude) | B (Export modal) | C (Dashboard card) |
|---|---|---|---|
| Source table | `minute_book_requirements` | `minute_book_requirements` | `compliance_rules` |
| Match key | `requirement_key` + `requirement_year` | `requirement_key` only (set-membership) | `document_type` (mapped to `rule_key`) |
| FY multiplier | annual × #activeFY + foundational | none (each req counted once) | current FY only; doc must be after `fyStart` |
| Status filter | `.eq('status', 'active')` | `.eq('status', 'active')` | `.neq('status', 'archived')` |
| Numerator | docs found per (req, year) | distinct req keys with ≥1 doc | rules whose mapped doc_type has a recent doc |
| Typical count | high (39) | low (11) | very low (5) |
| Typical %      | low-mid (72%) | mid-high (91%) | easy to hit 100% |

### Root cause hypothesis — **HIGH confidence**

The three numbers are produced by three **legitimately different metrics** that have drifted in semantics over time. None of them is currently labeled in a way that makes the difference clear to the user:
- "documents manquants" (A) means "missing checkboxes across all active fiscal years"
- "documents" (B) means "distinct requirement types with no document at all"
- "obligations remplies" (C) means "compliance rules for the current fiscal year that have a document of the right type"

So this is **(d) two parallel systems** + drift between two apps of the same query (A vs B). Not a bug per se — but cumulatively confusing because all three look like "the % done with my minute book".

### Recommended fix scope — **MEDIUM**

Two questions need product input before code changes:

1. **What's the user mental model meant to be?** If the answer is "one number" (most defensible), then converge: pick A as the canonical denominator (it's the most accurate to actual obligations), make B + C derived views or remove them. If the answer is "three different views legitimately", then the labels need to make the difference legible (e.g., A: "Documents fournis cette année et antérieures", B: "Types de documents requis", C: "Obligations légales actives").
2. **Is the dashboard card meant to track Complétude or compliance rules?** Today it tracks compliance rules but the card label "Taux de conformité — obligations remplies" reads as if it's tracking the broader minute book. If users expect it to mirror Complétude, the dashboard should call `/api/minute-book/completeness` instead.

Code-wise, converging surfaces to one query is a small refactor; clarifying labels is trivial. The architectural decision (which to make canonical) is the bulk of the effort.

### Related concerns surfaced

- **`compliance_rules` and `minute_book_requirements` overlap.** Both encode "what does this company need to do annually". They were seeded separately at different times. Worth a separate audit on whether to unify them. Note that `docs/compliance-taxonomy-2026-04-28.md` already exists — Phase 1 of any fix should re-read it.
- **Status filter divergence** (`.eq('status', 'active')` vs `.neq('status', 'archived')`). Pick one. The lenient form is more forgiving of the off-repo schema state described in Concern 1.
- **Active years semantics**. Surface A iterates over `company_fiscal_years.status = 'active'`; surface C uses `activeYears` parameter from `getActiveYears()`. Worth confirming these resolve to the same set.

---

## Concern 3 — LSAQ-specific tooltip text shown to all companies

**Symptom:** Tooltip on "Statuts de constitution" row in Complétude tab reads:
> "Le document fondateur de votre société, délivré par le Registraire des entreprises du Québec. Contient le nom, le NEQ, la date de constitution et les annexes."

This is correct for LSAQ-incorporated companies (REQ is the Quebec registrar). It is **wrong for CBCA-incorporated companies**, whose statuts come from Corporations Canada (the federal corporate registry) and have a **corporation number**, not a NEQ.

### Investigation findings

**Where the tooltip text comes from**

- The Complétude row's info button is rendered by `components/minute-book/RequirementRow.tsx:69-83`.
- The text shown is `descriptionFr` (or `descriptionEn`), passed in as a prop.
- That prop originates from the checklist returned by `/api/minute-book/completeness` (`MinuteBookPage.tsx:48-58`), specifically each `ChecklistItem.description_fr` field.
- The `description_fr` field is **read directly from the `minute_book_requirements` row** (`app/api/minute-book/completeness/route.ts:64-72,107-110`).

**`minute_book_requirements` lives only in the live database** — confirmed by grep: no committed SQL file creates or seeds it (see Concern 1's "off-repo schema" note). The seed text containing "Registraire des entreprises du Québec" is in the database, not in the repo. We cannot inspect it directly without a query; the audit script at `scripts/audit-requirements.mjs` exists for exactly this purpose and is read-only — Dom can run it to dump the table.

**Is the description framework-aware at the row level?**
- The `minute_book_requirements` rows have a `framework` column (used for filtering at `completeness/route.ts:67`: `framework=CBCA OR framework=ALL`). Each row is for *one* framework.
- So in principle, two distinct rows could exist for the same conceptual requirement — one with `framework='LSA'` (mentions REQ + NEQ) and another with `framework='CBCA'` (mentions Corporations Canada + corporation number). Then framework filtering would automatically select the right one.
- For the tooltip to show REQ-specific text on a CBCA company, **either** (i) the framework filter isn't being applied correctly (unlikely — code reads clearly at line 67), **or** (ii) there's a single row with `framework='ALL'` whose `description_fr` was written as if for LSAQ, **or** (iii) the test company is actually LSAQ and the user inferred the bug from inspecting product code.

**The user's symptom note specifically says "in a LSAQ test company" — so the tooltip is correct for the company under test.** But the question raised is: what happens for CBCA companies?

**Framework prop usage in the UI (separate from text content)**
- `MinuteBookPage` receives a `framework: 'LSA' | 'CBCA'` prop (`MinuteBookPage.tsx:32`).
- It uses `framework` for **uploads** (passes it to `uploadDocument` at line 109).
- It does **not** pass `framework` to `BinderView` (line 307 — no props), nor to `RequirementSection` (lines 282, 292), nor to `RequirementRow`.
- `RequirementRow` has no `framework` prop and no framework-conditional rendering.
- **Conclusion:** the React tree has no framework-aware *rendering* logic. All framework awareness in this surface comes from API-level filtering of which rows are returned.

**Static UI strings (in `messages/fr.json`) — framework-specific content?**
Grep across `messages/fr.json` for LSAQ-anchored terms:
- `messages/fr.json:115` — `"legalNamePlaceholder": "9999999 Québec Inc."` (StepCompany, onboarding — LSAQ-flavored placeholder; visible regardless of framework selection until the framework is chosen)
- `messages/fr.json:117` — `"lsa": "Québec provincial (LSAQQ)"` (the framework selection label itself — correct context)
- `messages/fr.json:232` — `"QC": "Québec"` (province dictionary — neutral)

The `minuteBook` block (`messages/fr.json:341-437`) contains:
- Tab labels, section titles ("Statuts et actes constitutifs", "Avis et déclarations", "Règlements", "Résolutions", "Administrateurs", "Dirigeants", "Actionnaires et certificats", "Registres corporatifs"), register column headers, bulk catch-up modal copy.
- **None of these strings mention REQ, NEQ, Corporations Canada, federal, Quebec, or any other framework-specific concept.** The Complétude tooltips are not in this file — they come from the database, as noted above.

**Static LSAQ references in code (outside `messages/`)**
- `lib/legal-definitions.ts:15-17` — defines NEQ; the FR/EN strings are LSAQ-correct (as they should be — NEQ is intrinsically a Quebec concept).
- `components/onboarding/StepCompany.tsx:250` — NEQ help tooltip. Used in the Quebec/LSAQ branch of onboarding only. Conditional on framework selection (likely fine — needs verification by reading the surrounding render logic).
- `supabase/schema.sql:317-318` — compliance_rules seed for LSA/QC `req_annual_update`: descriptions reference "Registraire des entreprises du Québec" / "Quebec Enterprise Registrar". Correct because those rows are LSA-jurisdictional.

**Row presence: `Mise à jour annuelle au REQ` for CBCA companies**

The completeness API filters requirements with `framework.eq.${framework} OR framework.eq.ALL` (`completeness/route.ts:67`). The LSAQ-specific REQ row is presumably stored with `framework='LSA'`, so a CBCA company should never see it on the Complétude tab.

**However**, the `compliance_rules` table (which feeds the dashboard "Taux de conformité" card, not Complétude) has different filtering: `lib/compliance/calculateComplianceItems.ts:135-138` says CBCA companies in Quebec get **both** their CBCA rules **and** the LSAQ `req_annual_update` rule. That's the only "double-piste" handling in the codebase. The legal reasoning:
- CBCA + QC operations → CBCA company must file extra-provincial registration with REQ (handled by `req_annual_update`)
- CBCA + non-QC → only the federal annual return applies

Search for analogous double-piste logic in the Complétude path: **none exists**. So if a CBCA-Quebec company genuinely needs to file the REQ extra-provincial update, it wouldn't show up on the Complétude tab today — even though it shows up on the dashboard card.

This is an inconsistency: dashboard knows about CBCA-QC dual-track; Complétude does not.

### Root cause hypothesis — **HIGH confidence (for the static-text part), MEDIUM confidence (for CBCA/REQ rows)**

- **Tooltips are static at the database level.** Each `minute_book_requirements` row carries one `description_fr` and one `description_en`. The text content for a given row is whatever was seeded. If that text contains framework-specific language, it will be shown to whichever framework the row is filtered to. As long as the seed maintains discipline ("LSA-framework rows mention REQ; CBCA-framework rows mention Corporations Canada; ALL-framework rows mention neither"), this works. Without inspecting the seed data, we can't verify discipline is held.
- **Rendering layer is framework-blind.** Even if the seed is wrong, `RequirementRow` cannot fix it — there's no framework-conditional logic anywhere in the render path. Any framework-awareness must be done by curating row content.
- **Complétude is missing CBCA-QC dual-track logic** that `calculateComplianceItems` already implements for the dashboard. Likely (b) "scaffolded never extended": CBCA-QC was added to compliance rules but not propagated to the minute_book_requirements taxonomy.

### Verification step needed

Run `node scripts/audit-requirements.mjs` (read-only, service-role) to dump all `minute_book_requirements` rows. Check:
1. Are there separate rows for `lsaq_statuts_constitution` and `cbca_statuts_constitution` (or one row with `framework='ALL'`)?
2. Do `framework='ALL'` rows contain any LSAQ-specific or CBCA-specific text in `description_fr`?
3. For each conceptual requirement, is there a CBCA twin?
4. Is there a CBCA-Quebec extra-provincial REQ requirement, or is that gap real?

### Recommended fix scope — **MEDIUM**

If the audit reveals (likely):
- **Some `framework='ALL'` rows have LSAQ-flavored descriptions** → seed cleanup (small): split them into LSA and CBCA twins.
- **CBCA-Quebec extra-provincial REQ row missing** → add one CBCA-jurisdictional row (small).
- **Some descriptions are missing CBCA twins entirely** → write them (medium copywriting effort).

Code-wise: zero changes if the seed is the only issue. If we want belt-and-suspenders framework awareness in the UI (so a misfiltered row can't bleed through), thread `framework` from `MinuteBookPage` to `RequirementRow` and have the row optionally select between `description_fr_lsa` / `description_fr_cbca` columns — but this is a much larger schema + UI change and probably not worth it before the seed is cleaned.

### Related concerns surfaced

- **Off-repo seed.** Same as Concern 1 — the actual tooltip content lives in a Supabase database with no version-controlled seed. Anyone editing the descriptions has to do it via SQL Editor, leaving no PR history. Worth committing a `minute_book_requirements_seed.sql` migration as part of the fix.
- **CBCA-Quebec dual-track is half-implemented**: dashboard knows; Complétude/binder don't. Decide whether to mirror, then propagate.
- **Onboarding placeholder bias**: `legalNamePlaceholder` defaults to "9999999 Québec Inc." even for users who haven't yet chosen LSA or who will choose CBCA. Minor, but worth flagging.

---

## Overall summary

**Are these concerns independent or related?** Mostly independent in their *symptoms*, but they share a single underlying cause: **the schema and seed data for `documents` and `minute_book_requirements` live only in the live Supabase project, with no committed migrations.** Concern 1 is most likely a state mismatch on the off-repo `documents` columns; Concern 3 is a curation problem on the off-repo seed; Concern 2 is the only one that's purely an application-code drift (three legitimate metrics labeled identically). Fixing the off-repo schema would not directly fix Concerns 2 or 3, but it would make them much easier to diagnose and fix in future.

**Highest priority to fix:** Concern 1 is the most user-visible and most immediately broken — the Livre tab is the primary discovery surface for a feature called Livre de minutes; if it shows zeros, users will assume the product lost their data. Recommend: confirm the data state with the SQL queries above, then ship the smallest possible fix (likely loosening the `status` filter to `.neq('status', 'archived')` to match the dashboard's behavior). Concern 3 is second-priority because LSAQ-specific copy on a CBCA company is misleading and erodes trust in framework awareness. Concern 2 is third, because the three numbers are individually defensible — the product question of which one to show is more important than rushing a code change.

**Effort estimate (rough, all three):** 1-2 days of focused work plus product/legal review on Concerns 2 and 3. Concern 1 fix is a few hours after the SQL queries land. Concern 3 is mostly seed copywriting (Max + Dom call). Concern 2 is a product alignment decision (a couple of hours of discussion + a small refactor).

**Concerns surfaced that need their own investigation:**
1. **Off-repo schema audit.** Inventory every column referenced in code (`status`, `requirement_key`, `requirement_year`, `minute_book_section`, `source`, `document_year`, `file_name`, plus the entire `minute_book_requirements` table) and produce a single committed migration that backfills them. Until this is done, every future bug in this area will require reading the live database.
2. **`status` filter convention.** Decide once: `.eq('status','active')` or `.neq('status','archived')`. Apply consistently. Document in CLAUDE.md.
3. **`minute_book_requirements` vs `compliance_rules` consolidation.** Two parallel taxonomies; decide whether to merge or formally separate. Cross-reference with `docs/compliance-taxonomy-2026-04-28.md`.
4. **CBCA-Quebec dual-track propagation.** Currently in `calculateComplianceItems` only. If correct, replicate to the minute_book_requirements taxonomy.
5. **`BinderView` tab refresh after upload.** Confirm by manual test that uploading via Complétude then switching to Livre tab shows the new document. If not, add explicit refresh.
