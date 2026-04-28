# ZapOkay — Bilingual i18n Audit

**Date:** April 28, 2026
**Authors:** Dom (Product Owner) + Max (CTO/AI advisor) + CC (investigation)
**Status:** Locked — drives Phase 1+2 launch-blocker work in Sprint 10 launch infrastructure parallel track

This audit was triggered by the strategic decision that ZapOkay is bilingual at launch (FR + EN both required, EN is not aspirational), and identifies all the work needed to make that decision real before launch.

---

## 1. Audit methodology

Investigation pass across `app/[locale]/dashboard/**`, `components/**`, `app/api/**`, and `lib/**` (locale-aware files only). Six classification queries were run:

1. Capitalized FR words in single-quoted string literals across `**/*.tsx`
2. JSX text content with capitalized FR words across `**/*.tsx`
3. `title_fr` / `title_en` / `name_fr` / `name_en` / `description_fr` / `description_en` / `register_title_*` field references across `**/*.{ts,tsx}`
4. Hardcoded locale literals (`'fr-CA'`, `'en-CA'`, `'fr-FR'`, `'en-US'`) and all `toLocaleDateString` / `toLocaleString` calls
5. Files importing `useTranslations` / `getTranslations` / `useLocale` (cross-referenced against findings 1–2 to separate Signal A from Signal B)
6. `_fr` / `_en` suffixed field references across `app/`, `components/`, `lib/`

Targeted follow-ups confirmed import counts and ternary counts in critical-path files (`OnboardingFlow.tsx`, `DashboardShell.tsx`, `SettingsClient.tsx`, all 13 onboarding step components).

**Architectural finding:** the app uses three different i18n patterns mixed together:

1. `useTranslations()` + JSON keys — the canonical pattern, used in ~33 files (mostly modals, forms, secondary chrome)
2. `fr ? 'FR' : 'EN'` inline ternary — used pervasively in onboarding, dashboard shell, settings, and core dashboard pages. Functionally bilingual, but violates separation of content from code
3. FR-only hardcoding — pure French strings with no EN counterpart (Signal A — actively breaks bilingual launch)

**Pattern (3) is the launch blocker.** Pattern (2) "works" but is disastrous for translator workflow, copy review, and any future locale beyond fr/en.

**Severity legend:** **HIGH** = critical user path, every session encounters it · **MED** = visible but conditional · **LOW** = edge/internal
**Effort legend:** **S** ≤30min · **M** 30–90min · **L** >90min · **XL** >4h

---

## 2. Type A — FR-only hardcoded (LAUNCH BLOCKERS)

Components with NO i18n hook + user-facing FR strings.

| Path | Severity | Sample strings | Effort |
|------|----------|----------------|--------|
| `components/minute-book/BinderView.tsx` | HIGH | `'Nom'`, `'Résidence'`, `'Début'`, `'Fin'`, `'Actif'`, `'Oui'/'Non'`, `'Titre'`, `'Catégorie'`, `'Qté'`, `'Cert.'`, `'Émission'` (column labels in 3 register tables) | M |
| `components/minute-book/BinderSection.tsx` | HIGH | `TYPE_LABELS` dict (Statuts/Résolution/PV/Registre/Rapport), `'3 registres'`, `Aucun document...`, plural at L58, `'fr-CA'` literal at L21 | M |
| `components/minute-book/RegisterCard.tsx` | MED | `'Aucune donnée enregistrée'` (default empty message) | S |
| `components/activity/ActivityPage.tsx` | HIGH | `Historique des activités`, `Aujourd'hui`, `Hier`, plural L113, tooltip body, empty state, `Chargement…`, `Charger plus ↓`, `'fr-CA'` literal | M |
| `components/activity/ActivityGroup.tsx` | HIGH | Time formatter hardcodes `'fr-CA'` (L18); needs review of any text labels | S |
| `components/activity/ActivityRow.tsx` | HIGH | Renders `event.title_fr` only (FR-only by data path); needs locale-aware title selection | S |
| `components/due-diligence/DueDiligenceModal.tsx` | MED | `Vérification avant export` (h2), `Analyse en cours…`, `Export en cours…`, `Aller à ${title_fr}` aria-label | M |

**Subtotal: 7 files, ~40+ strings, effort ≈ M×5 + S×3 = ~5h**

---

## 3. Type B — Inline ternary pattern

Components using `fr ? 'X' : 'Y'` ternary pattern (locale-aware but not via i18n keys). These work bilingually today but bloat code, fragment copy across files, and resist translator workflows.

| Path | Severity | Sample strings | Effort |
|------|----------|----------------|--------|
| `components/onboarding/OnboardingFlow.tsx` | HIGH | 8 ternary sites; entire flow chrome | M |
| `components/onboarding/StepCompany.tsx` | HIGH | ~35 capitalized FR strings (form labels, errors, helper text) | L |
| `components/onboarding/StepDirectors.tsx` | HIGH | Step heading L109/111, plus form text | M |
| `components/onboarding/StepOfficers.tsx` | HIGH | Step heading L150/152, plus form text | M |
| `components/onboarding/StepShareholders.tsx` | HIGH | Step heading L129/131, plus form text | M |
| `components/onboarding/StepLanguage.tsx` | HIGH | L34/36 heading + helper | S |
| `components/onboarding/StepProvince.tsx` | HIGH | step UI + likely heading | M |
| `components/onboarding/StepOfficer.tsx` | HIGH | step UI | M |
| `components/onboarding/StepCelebration.tsx` | HIGH | celebration copy | M |
| `components/onboarding/StepConfirmation.tsx` | HIGH | ~9 capitalized strings, summary view | M |
| `components/onboarding/OnboardingStepLayout.tsx` | HIGH | layout chrome (nav, prev/next) | S |
| `components/onboarding/FiscalYearsSetup.tsx` | HIGH | L257/258 heading + form | M |
| `components/dashboard/DashboardShell.tsx` | HIGH | `labelFr/labelEn` ternary on every nav item (27 sites); page titles in switch | L |
| `components/dashboard/SettingsClient.tsx` | HIGH | 27 `fr ?` ternary sites — entire settings page | L |
| `components/dashboard/CompanySwitcher.tsx` | HIGH | `'Mon entreprise'/'My company'`, `'Set up a new company...'` | M |
| `components/dashboard/WelcomeCard.tsx` | HIGH | `'Sprint 2 ' + (fr ? 'arrive bientôt' : 'coming soon')`, `'Votre entreprise'/'Your company'` | M |
| `components/documents/UploadZone.tsx` | HIGH | `fr ? title_fr : title_en` patterns; form labels | L |
| `components/documents/DocumentRow.tsx` | MED | `fr ? 'fr-CA' : 'en-CA'` for date | S |
| `components/documents/DocumentModal.tsx` | MED | needs verification | M |
| `components/documents/SignatoriesModal.tsx` | MED | needs verification | M |
| `components/documents/GenerateDocumentButton.tsx` | MED | needs verification | S |
| `components/minute-book/MinuteBookPage.tsx` | HIGH | `fr ? title_fr : title_en` patterns at L88, L162; partial useCallback | L |
| `components/minute-book/RequirementSection.tsx` | HIGH | passes `titleFr/descriptionFr` only — FR-only by data path | M |
| `components/minute-book/RequirementRow.tsx` | HIGH | receives `titleFr/descriptionFr` only | M |
| `components/minute-book/CompletenessBar.tsx` | HIGH | needs verification | M |
| `components/compliance/ComplianceClient.tsx` | HIGH | uses `useTranslations` AND has inline `<>Fiscal year {fyLabel}</>` ternary at L198 | M |
| `components/compliance/ComplianceItemCard.tsx` | MED | uses `locale` param dynamically (cleaner pattern); some strings via t() | S |
| `components/compliance/FiscalYearForm.tsx` | MED | needs verification | M |
| `components/compliance/ComplianceGauge.tsx` | LOW | numeric gauge, likely few strings | S |
| `components/ui/LegalTooltip.tsx` + `LegalTerm.tsx` | MED | `lang` prop pattern — works but every caller must pass lang | S |
| `components/ai/GapAnalysisPanel.tsx` | MED | needs verification | M |
| `components/shareholders/ShareClassCard.tsx` | MED | `Max ${...} actions` / `shares` ternary at L37–38 | S |
| `app/[locale]/dashboard/page.tsx` (root dashboard) | HIGH | Mixed: uses `t()` AND `fr ?` ternary AND inline `<>Fiscal year {fyLabel}</>` | L |
| `app/[locale]/dashboard/directors/DirectorsClient.tsx` | HIGH | uses `t()` + `<>Aucun <LegalTerm/> enregistré</> : <>No <LegalTerm/> registered</>` ternary | M |
| `app/[locale]/dashboard/officers/OfficersClient.tsx` | HIGH | same pattern | M |
| `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx` | HIGH | same pattern + `'fr-CA'/'en-CA'` ternary L136/137 | M |
| `app/[locale]/dashboard/documents/DocumentsClient.tsx` | HIGH | needs verification | M |
| `app/[locale]/login/page.tsx` | HIGH | `<>Zap la paperasse...</> : <>Zap the paperwork...</>` inline | S |
| `app/[locale]/signup/page.tsx` | HIGH | same hero ternary | S |
| `app/[locale]/forgot-password/page.tsx` | HIGH | same hero ternary | S |
| `app/[locale]/reset-password/page.tsx` | HIGH | same hero ternary | S |

**Subtotal: ~40 files, est. 200–300 strings to migrate, effort ≈ L×6 + M×22 + S×12 = ~6–8 days**

---

## 4. Type C-API — Locale-blind API routes

API routes with locale-suffixed output (or missing locales).

| Path | Severity | Issue | Effort |
|------|----------|-------|--------|
| `app/api/minute-book/binder/route.ts` | HIGH | Hardcoded `title_fr` only at L5–12 + L65 — no EN equivalent | M |
| `app/api/registers/directors/route.ts` | MED | Ships both `register_title_fr/_en` ✓ but consumer drops EN | S |
| `app/api/registers/officers/route.ts` | MED | same | S |
| `app/api/registers/shareholders/route.ts` | MED | same | S |
| `app/api/due-diligence/status/route.ts` | HIGH | Ships only `title_fr` at L120 from `r.title_fr` | M |
| `app/api/minute-book/completeness/route.ts` | OK | Ships both `_fr`/`_en` ✓; consumers must use both | — |
| `app/api/activity-log/route.ts` | UNK | Needs verification — DB stores both `title_fr/title_en` (per `lib/activity-log.ts:17–18`) | S |
| `app/api/due-diligence/export/route.ts` | MED | Hardcodes `'fr-CA'` for export date L171; export PDF may legitimately be FR-only for QC docs — confirm with product | S |

**Subtotal: 8 routes, ~3 actually broken (binder, due-diligence/status, possibly activity-log), effort ≈ M×2 + S×4 = ~4h**

---

## 5. Type C-LIT — Hardcoded locale literals

Date/number formatting with hardcoded locale strings.

| Path | Line | Pattern | Effort |
|------|------|---------|--------|
| `lib/pdf/generatePDF.ts` | 99 | `toLocaleDateString('fr-CA')` for PDF prep date | S — confirm scope (PDFs may be QC-FR-only by design) |
| `lib/pdf-templates/annual-register.ts` | 106 | `s.sharesCount.toLocaleString()` (no locale) | S |
| `components/minute-book/BinderSection.tsx` | 21 | `toLocaleDateString('fr-CA')` | S (subsumed by row above) |
| `components/activity/ActivityGroup.tsx` | 18 | `toLocaleTimeString('fr-CA')` | S (subsumed) |
| `components/activity/ActivityPage.tsx` | 33 | `toLocaleDateString('fr-CA')` | S (subsumed) |
| `app/api/due-diligence/export/route.ts` | 171 | `toLocaleDateString('fr-CA')` | S (see C-API row) |

**Subtotal: 6 sites, mostly subsumed by parent component fixes, ≈ 1h standalone**

---

## 6. Type C-FMT — Formatting non-locale-aware

No `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, or `date-fns/locale` usage anywhere. The codebase relies entirely on `Date.prototype.toLocaleDateString/toLocaleString` with locale strings. Pattern is consistent — fix is via locale param threading, not API migration.

---

## 7. Architecturally OK

These already do the right thing — using `useLocale()` to get locale and threading it into formatters. Listed for completeness, no fix needed:

- `lib/utils.ts:10` — accepts locale param
- `components/shareholders/CapTableChart.tsx`, `ShareholderCard.tsx` — uses `locale === 'fr' ? 'fr-CA' : 'en-CA'` correctly
- `components/officers/OfficerCard.tsx`, `directors/DirectorCard.tsx` — same
- `components/compliance/ComplianceItemCard.tsx` — same
- `lib/legal-definitions.ts` + `LegalTooltip.tsx` — clean term_fr/term_en architecture, just needs caller-side locale threading

---

## 8. Critical-path components blocking bilingual launch

### Tier 1 — every authenticated user encounters every session

1. `DashboardShell.tsx` (nav chrome, page titles)
2. All onboarding step components (12 files) — every new user
3. `MinuteBookPage.tsx` + `RequirementSection.tsx` + `RequirementRow.tsx` — primary product page
4. `BinderView.tsx` + `BinderSection.tsx` + `RegisterCard.tsx` — core minute book view
5. `ActivityPage.tsx` + `ActivityGroup.tsx` + `ActivityRow.tsx` — activity log
6. All four `[area]Client.tsx` dashboard pages (directors/officers/shareholders/documents)
7. Auth pages (login/signup/forgot/reset) — first impression
8. `app/api/minute-book/binder/route.ts` (no EN at source) and `app/api/due-diligence/status/route.ts`

### Tier 2 — visible but secondary

9. `SettingsClient.tsx`
10. `WelcomeCard.tsx`, `CompanySwitcher.tsx`, `MinuteBookCard.tsx`
11. `DueDiligenceModal.tsx`
12. Compliance components (`ComplianceClient.tsx`, `FiscalYearForm.tsx`)
13. Document components (`UploadZone.tsx`, `DocumentRow.tsx`, `DocumentModal.tsx`, `SignatoriesModal.tsx`)

---

## 9. Recommended phasing

### Phase 1 — pre-launch (must-fix, ~5–6 days)

- All Tier 1 components above
- All Signal A (Activity, Binder, Register pure-FR files)
- Signal C-API broken routes (binder, due-diligence/status)
- Decision: standardize on `useTranslations()` + JSON keys (kill the `fr ?` ternary pattern)

### Phase 2 — pre-launch (~1–2 days)

- Migrate auth pages + onboarding step headings to JSON keys (relatively shallow Signal B)
- Settings page (large but self-contained)

### Phase 3 — defer to v1.1 (acceptable launch debt)

- Tier 2 modals and conditional flows
- `LegalTooltip`/`LegalTerm` `lang` prop pattern → consume `useLocale` internally (DX cleanup, not user-visible)
- PDF generation locale (likely intentional FR-only for QC docs — needs product call)
- Minor C-LIT cleanup subsumed by component refactors

---

## 10. Strategic recommendation: lock convention first

Before starting Phase 1, lock the i18n convention as a separate small commit:

- Add CLAUDE.md guidance: "All user-facing strings via `useTranslations()` + JSON. No `fr ? 'FR' : 'EN'` ternaries in JSX. No `'fr-CA'` literals — use `useLocale()` and `lib/utils.ts` formatters."
- This prevents the existing pattern from spreading during Phase 1 work.

### Total counts

- **Signal A** (no i18n, FR-only): 7 files, ~40 strings, ~5h
- **Signal B** (locale ternary, no JSON keys): ~40 files, est. 200–300 strings, ~6–8 days
- **Signal C-API** (broken/missing API locale shape): 3 routes actually broken + 3 with consumer issues, ~4h
- **Signal C-LIT** (hardcoded `fr-CA`): 6 standalone sites + many subsumed, ~1h
- **Signal C-FMT**: nothing extraneous; fixed via parent component work

### Total effort estimate

~7–9 person-days for full migration, assuming a single engineer doing focused work and existing JSON namespaces extend cleanly. Add 1–2 days buffer for translator review of ~250+ new EN strings.

---

## 11. Items not audited

Out of session budget; classified as Signal B (likely) based on directory pattern + import absence. Sample strings would need verification before Phase 1 estimates are firm:

- `StepCompany.tsx`, `StepConfirmation.tsx`
- `DocumentsClient.tsx`, `DocumentModal.tsx`, `SignatoriesModal.tsx`, `GenerateDocumentButton.tsx`
- `FiscalYearForm.tsx`, `ComplianceGauge.tsx`
- `GapAnalysisPanel.tsx`
- `CompletenessBar.tsx`
- `app/api/activity-log/route.ts` output shape not checked directly
- `lib/legal-definitions.ts` content quality (definitions in both languages exist but not reviewed for translation parity)

---

## 12. Decision log

The following decisions are locked and should NOT be re-debated without explicit re-opening:

1. ZapOkay is bilingual at launch — EN is launch requirement, not aspirational
2. Standardize on useTranslations() + JSON keys — kill the fr ? ternary pattern systematically
3. Tier 1 + Type A + broken C-API routes are launch-blocking (Phase 1 + Phase 2 work)
4. Tier 2 modals + LegalTooltip + PDF locale defer to v1.1 (Phase 3)
5. Bilingual completeness work runs parallel to Sprint 10 temporal registry — added to launch infrastructure parallel track
6. CLAUDE.md i18n convention guidance ships before Phase 1 work begins
