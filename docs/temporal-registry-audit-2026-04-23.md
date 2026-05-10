# Temporal Registry Audit

**Date:** 2026-04-23
**Authors:** Max (analysis) + Dominique (screenshot capture & product testing)
**Status:** Scoping document — input to Sprint 10 planning. No code changes from this audit; translates findings into a decision-ready scope list.
**Test company:** droussy inc. (single-director, single-officer, single-shareholder — all same person, Drous Sy)
**Precedes:** Sprint 10 Launch Sprint
**Downstream consumers:** Sprint 10 scope document, Sprint 11 Plan Diligence scope, Phase 1 event-based rules (DD Audit Section 17.1)

---

## 1. Executive summary

ZapOkay's compliance promise — *documents compliant with reality* — is contradicted by the current temporal model. Three confirmed failures:

1. **Wizard-generated resolutions embed today's roster into historical documents.** Step 3 of the catch-up wizard resolves the administrator and officer names from the current-state registry, with the resolution date defaulting to today regardless of the target fiscal year. A 2021 resolution generated today for a 2021 governance gap receives 2026 signatories with a 2026 signing date. This ships legally wrong documents to users who trust the product's promise.

2. **Shareholder history is not representable in the data model.** The `shareholdings` table has no `end_date`, no transfer relationship, and no superseding mechanism. The Transférer button on the shareholder card is visually present but inactive. There is no way to record "Marie owned 50 shares 2020–2022, sold to Jean." Silent retroactive edits to existing shareholdings via the Modifier modal further destroy whatever historical trace existed.

3. **Director and officer history is captured in schema but never surfaced.** `director_mandates.end_date` and `officer_appointments.end_date` are written during Retirer flows, but no UI anywhere reads them — no past-members view, no as-of-date resolver, no indication that the data exists. The history accumulates but is product-invisible.

Gaps split cleanly by cost:

- **Schema gap (hard, non-patchable by UX):** shareholder temporal model.
- **UX gap (medium, schema-ready):** past-member views, as-of-date signatory resolution, retroactive-entry affordances.
- **Copy/consistency (cheap):** missing motif field on officer removal, missing citizenship field on non-resident directors, disabled-button deception on Transférer.

Launch cannot ship the wizard's current signatory behavior. Everything else is scoping judgment.

---

## 2. Inventory — what the product surfaces today

### 2.1 Administrateurs (Directors)

**Page:** `/administrateurs` — active-only list.
**Schema:** `director_mandates` with `appointment_date`, `end_date`, `end_reason`, `is_active`.

| Flow | Fields captured | Writes to | UX-historical? |
|---|---|---|---|
| Add | Person (new or existing) + nomination date (backfillable) | `director_mandates.appointment_date`, `is_active=true` | ✓ Appointment date backfillable |
| Modifier | [Not captured in screenshots — verify] | Presumed UPDATE on mandate row | Unknown |
| Retirer | Motif (5 options: Démission, Révocation, Fin de mandat, Décès, Disqualification) + Date de fin (defaults today, editable) | `end_date`, `end_reason`, `is_active=false` | ✓ End date + motif captured |

**What's missing:**
- No "Anciens administrateurs" / "Historique des mandats" section anywhere. The written `end_date` / `end_reason` data is never displayed.
- No way to add a fully-historical mandate in one step (e.g., "Marie was director 2019–2022"). Requires Add → edit → Retirer with past dates, across three UI actions.
- No citizenship field when the Résident canadien toggle is OFF. Spec §3.3 requires citizenship capture for non-residents; CBCA's 25% Canadian-resident rule depends on accurate non-resident flagging.
- No warning or enforcement when Canadian-resident ratio falls below 25%. Spec §3.3 requires auto-calculation and real-time compliance indicator.

### 2.2 Dirigeants (Officers)

**Page:** `/dirigeants` — active-only, card-per-role layout.
**Schema:** `officer_appointments` with `appointment_date`, `end_date`, `is_active`, `title`, `is_primary_signing_authority`.

| Flow | Fields captured | Writes to | UX-historical? |
|---|---|---|---|
| Add (Nommer) | Person + Poste + Signataire autorisé toggle + Nomination date (backfillable) | `officer_appointments.appointment_date`, `title`, `is_primary_signing_authority`, `is_active=true` | ✓ Appointment date backfillable |
| Modifier | [Not captured — verify] | Presumed UPDATE | Unknown |
| Remplacer | New person + Fin de mandat sortant (default today) + Entrée en poste entrant (default today) + Signataire toggle | Atomic: closes outgoing appointment, opens incoming appointment | ✓ Dates editable, atomic transition |
| Retirer | Date de fin only (defaults today, editable) — **no motif field** | `end_date`, `is_active=false` | ✗ No reason captured |

**What's missing:**
- **Inconsistency vs. directors:** officer Retirer has no motif field. Directors have 5 motifs; officers have none. This is a schema omission (no `end_reason` column on `officer_appointments`) *and* a UX omission.
- No past-officers view. Same pattern as directors — data accumulates, never shown.
- Remplacer flow defaults both dates to today, with no visual anchoring that they *can* be set to the past. For historical corrections this works, but the default implies "this transition happens now" which will be right for 90% of real usage and wrong for catch-up corrections.

### 2.3 Actionnaires (Shareholders)

**Page:** `/actionnaires` — "Structure du capital" current-state view (donut chart + cap table).
**Schema:** `shareholdings` with `quantity`, `issue_date`, `issue_price_per_share`, `certificate_number` — **no end_date, no superseding mechanism, no transfer relationship.**

| Flow | Fields captured | Writes to | UX-historical? |
|---|---|---|---|
| Émettre des actions | Person + Class + Quantity + Price + Issue date (backfillable) + Certificate number (auto-generated, editable) | `shareholdings` INSERT | ✓ Issue date backfillable |
| Modifier les actions | Class + Quantity + Price + Issue date + Certificate number — **all silently mutable on the existing row** | `shareholdings` UPDATE | ✗ Destroys history, no audit trail |
| Transférer | **Button visible but inactive (not wired).** No modal opens. | N/A | N/A |
| Ajouter une classe | Nom + Type + Droit de vote + Votes par action + Quantité maximale | `share_classes` INSERT | N/A (class structure, not shareholder temporal) |

**What's missing — and this is the core of the launch blocker:**

- **No share transfer concept.** No `share_transfers` table, no transfer UI, no certificate-old/certificate-new linkage. A shareholder who sold their shares leaves no record of having ever owned them beyond the current-state table (and only if their row was deleted — which current UI doesn't support cleanly).
- **No redemption / repurchase.** Spec §3.2 requires this; not present.
- **No convertibles (SAFE / notes / warrants).** Spec §3.2 requires; not present. Out of launch scope per memory (Sprint 12+).
- **No cap-table-as-of-date view.** "Who owned what on 2022-06-15" cannot be answered by the product today, even if the data existed.
- **No securities register.** Spec §3.2 requires auto-maintained chronological register with full historical states. Not present.
- **Modifier les actions is a data-integrity hazard.** Allows silent retroactive mutation of quantity, price, date, certificate number on an existing holding. A user correcting a typo looks identical to a user falsifying their cap table. No activity_log trace (to verify — see §5 open questions).

### 2.4 Wizard — historical document generation (the smoking gun)

**Route:** `/wizard` Step 3 (Informations).
**Behavior observed:** For a catch-up resolution targeting fiscal years 2020–2023, Step 3 presents:
- NOM DE L'ADMINISTRATEUR dropdown: lists today's active directors only (shows "Drous Sy")
- NOM DU DIRIGEANT dropdown: lists today's active officers only (shows "Drous Sy")
- TITRE DU DIRIGEANT: free-text (defaulted from selected officer's current title — "Président·e")
- DATE DE LA RÉSOLUTION: date picker defaulting to today (2026-04-23), with no anchoring to the target fiscal year

There is no visible mechanism for the wizard to know:
- Whether Drous Sy was actually a director in the target fiscal year
- Whether the signing date belongs in 2026 or in the target year
- Whether to suppress or warn on temporal mismatch

**Impact:** every retroactive resolution generated through this flow is, with probability near 1, signed by someone whose legal capacity in the target year is unverified and dated in the wrong year. The product is generating legally inaccurate documents for users who trust the product's compliance promise. Phase 4d Stream 1 (shipped April 23) fixed the *format* (PDF not .txt) but left the temporal behavior untouched — Phase 4d Stream 2's mandatory historical-signatory disclaimer is the committed stopgap.

### 2.5 Onboarding — registry seeding

**Route:** `/onboarding` steps 4–6.

| Step | Entity | Dates captured | Capacity for history |
|---|---|---|---|
| 4 — Administrateurs | Directors | ✓ Date de nomination (backfillable) | ✓ Can seed historical appointment dates. No end-date capability at this step. |
| 5 — Actionnaires | Shareholders | ✓ Date d'émission (backfillable) | Partial. Can seed historical issuance. Cannot represent "issued to Marie in 2018, transferred to Jean in 2020" — schema doesn't support it. |
| 6 — Dirigeants | Officers | ✗ **No date field — today assumed** | ✗ Cannot seed historical officer appointments from onboarding. |

**What this means:** a founder onboarding a 6-year-old company can correctly seed directors and shareholders' initial state (with backfilled dates), but the officer roster shown at step 6 is a simple role-assignment dropdown that writes today's date as the appointment. If the company had a previous president who resigned, there's no way to capture that in onboarding. The standalone Dirigeants page's Nommer flow does accept a backfilled nomination date — but the onboarding step skips that field entirely.

### 2.6 Historique (sidebar item)

Confirmed by Dominique: does not show registry changes. (Presumed: document activity log only. Verify in §5 open questions — actual contents not audited.)

---

## 3. Gap classification

Gaps ranked by cost-to-fix and by launch-blocking severity.

### Tier A — Schema gaps (hard, cannot patch with UX alone)

| # | Gap | Blocks |
|---|---|---|
| A1 | `shareholdings` has no `end_date` / temporal mechanism | Any truthful representation of a shareholder who sold or transferred |
| A2 | No `share_transfers` table or equivalent | Transfer history, certificate linkage, transfer-approval resolution references |
| A3 | `officer_appointments` has no `end_reason` column | Motif capture on officer removal; consistency with directors |
| A4 | No schema support for redemption / repurchase events | Deferred to Sprint 11+ per memory |
| A5 | No schema support for convertibles (SAFE / notes / warrants) | Deferred to Sprint 12+ per memory |

### Tier B — UX gaps (schema ready, UX incomplete)

| # | Gap | Blocks |
|---|---|---|
| B1 | Wizard Step 3 uses current-state signatory dropdowns for historical resolutions | **Truthfulness failure #1 — launch blocker.** Phase 4d Stream 2 disclaimer is stopgap. Real fix requires B2. |
| B2 | No as-of-date signatory resolver. When `generatePdfDocument` runs with a historical `document_year`, it cannot query "who was a director on Dec 31, 2022" | B1 fix; Phase 1 event-based rules; DD audit temporal accuracy |
| B3 | No past-members view on Administrateurs / Dirigeants pages despite `end_date` being written | User cannot verify or correct historical mandates; user cannot see what the product knows |
| B4 | No explicit "enter a historical mandate" flow — requires Add-then-Retirer workaround | Usability for onboarding a 5-year-old company |
| B5 | Modifier les actions allows silent retroactive mutation with no warning, no log, no transfer-vs-correction distinction | Data integrity; DD trustworthiness of the cap table |
| B6 | Transférer button visible but inactive | Deceptive UI. Either implement (requires A1+A2) or hide. |
| B7 | Onboarding step 6 (Dirigeants) has no appointment date field | Historical officer seeding during onboarding |

### Tier C — Copy / consistency (cheap)

| # | Gap | Blocks |
|---|---|---|
| C1 | Officer Retirer modal missing motif dropdown | Consistency with directors; compliance trail quality |
| C2 | No citizenship field when Résident canadien toggle is OFF | CBCA non-resident accuracy; 25% Canadian-resident rule auditing |
| C3 | No Canadian-resident ratio indicator / warning on Administrateurs page | Spec §3.3 auto-calculation requirement; real-time compliance |
| C4 | Remplacer (officer) defaults both dates to today with no historical-anchoring cue | Soft — right for 90% of usage, confusing for the catch-up 10% |
| C5 | Wizard Step 3 DATE DE LA RÉSOLUTION defaults to today without target-year context | Reinforces B1 truthfulness failure; confusing UX |

---

## 4. Impact mapping

Which downstream features depend on each gap closing.

| Downstream feature | Depends on | Ship without? |
|---|---|---|
| Phase 4d Stream 2 bulk modal (committed) | B1 mitigation via mandatory disclaimer (already in scope) | ✓ Disclaimer is the stopgap. Real fix via B2 lands Sprint 10. |
| Launch (soft) | B1 + B2 at minimum. Plus A3 + C1 for consistency. | ✗ Cannot launch with wizard's current signatory behavior. |
| Phase 1 event-based rules (DD Section 17.1) | B2 (as-of-date resolver) + A1/A2 (shareholder temporal) | ✗ Rules that reference past state cannot fire correctly. |
| DD Full Audit export (Sprint 11) | Everything above + B3 (past-members views) | ✗ DD report with "as of now" cap table is not a DD report. |
| Cap-table-as-of-date view (Sprint 11+) | A1 + A2 fully implemented | ✗ Future feature, blocked on schema work. |

---

## 5. Open questions before scope lock

Five things to verify before Sprint 10 planning. Each is a ~10-minute investigation, not a work item.

1. **Modifier (edit) flows for directors and officers** — not screenshotted. Confirm: what fields are mutable, is appointment_date editable post-creation? If yes, is there any audit trail?
2. **Modifier les actions audit trail** — does the shareholding UPDATE emit an `activity_log` event, or is the mutation truly silent? (Check `app/api/shareholdings/[id]/route.ts` or equivalent.)
3. **Historique page contents** — exactly what does it show? Document-level activity only, or does it include any registry events? Screenshot + brief categorization.
4. **Résident canadien = OFF flow** — toggle off in the Add Administrateur modal. Does a citizenship field appear conditionally, or is the toggle the only non-resident indicator?
5. **Directors and officers: does `minute_book_section` track acceptance forms separately from resolutions?** **VERIFIED 2026-04-24** — FULL GAP. CC investigation confirmed:
   - Neither `AddDirectorModal.tsx` nor `OnboardingFlow.tsx` triggers any document generation on director insert
   - No template exists in `lib/pdf-templates/` for acceptance forms
   - No dedicated `VaultDocType` entry; classifier buckets as `'autre'`
   - Requirement keys `cbca_director_acceptance` and `lsaq_acceptation_mandat` are declared in `lib/requirement-doctype.ts:54-56` but are NOT in the `REQUIREMENT_MAP` in `lib/pdf/generatePdfDocument.ts` — declared-but-unfulfillable scaffolding
   - CBCA s.105 pre-signed resignation clause language is absent from the codebase entirely
   - **Absorbed into Sprint 10 as S10-TR-13** (see §6.1). Scope: new template + REQUIREMENT_MAP wiring + dedicated VaultDocType + minute_book_section category + generation triggers on director insert (2 call sites).
   - **Unrelated flag from CC investigation:** the "declared-but-unfulfillable requirement key" pattern may exist for other requirement keys in `lib/requirement-doctype.ts`. Sprint 10 investigation phase should audit this file against `REQUIREMENT_MAP` to surface any other silent gaps. Added to Sprint 10 open questions.

---

## 6. Recommended Sprint 10 scope

Cut proposed by **risk-reduction value per unit of engineering effort**. Work ordered by dependency.

### 6.1 — Must ship (launch blockers)

**S10-TR-1. As-of-date signatory resolver** (B1 + B2)
Refactor `generatePdfDocument` (shipped Stream 1) to accept an optional `asOfDate` parameter. When provided, the director/officer/shareholder queries filter by `appointment_date <= asOfDate AND (end_date IS NULL OR end_date > asOfDate)`. Wizard and Minute Book both pass `asOfDate` derived from the target fiscal year or user-specified resolution date. Default behavior when `asOfDate` is omitted: current state (preserves existing single-item behavior for current-year resolutions).

Effort: medium. Single function, two call sites, schema already supports it for directors and officers. Shareholders are partially blocked by A1 (no end_date) — for Sprint 10, shareholder signatory resolution uses current-state with disclaimer until A1 ships.

**S10-TR-2. Shareholder temporal schema** (A1 + A2)
Add `shareholdings.end_date`, `end_reason`. Create `share_transfers` table: `id, company_id, from_person_id, to_person_id, share_class_id, quantity, transfer_date, certificate_old, certificate_new, resolution_document_id (nullable), created_at`. Migration only — no UI yet. This unblocks the rest.

Effort: small. Pure schema work. Minutes in Supabase.

**S10-TR-3. Share transfer UI** (completes A1/A2 + resolves B6)
Wire the Transférer button. Modal: from-shareholder (implicit, the clicked row), to-person (selector or new), class, quantity, transfer date, optional certificate numbers, optional resolution reference. Writes: `share_transfers` INSERT + `shareholdings` UPDATE (decrement source) + `shareholdings` INSERT (create destination).

Effort: medium. New modal, new endpoint, no complex validation beyond "quantity <= source.quantity."

**S10-TR-4. Officer Retirer motif field** (A3 + C1)
Schema: `ALTER TABLE officer_appointments ADD COLUMN end_reason TEXT`. UX: same 5-option dropdown as directors (Démission / Révocation / Fin de mandat / Décès / Disqualification). Write path: Retirer modal captures and persists.

Effort: trivial. <2 hours.

**S10-TR-5. Hide or flag the Transférer button pre-S10-TR-3** (interim B6)
If S10-TR-3 slips within Sprint 10, hide the button entirely. Never ship a disabled button that looks like it should work.

Effort: 5 minutes. Contingency, not planned work.

**S10-TR-13. Acceptation du mandat d'administrateur auto-generation** (compliance, absorbed into Sprint 10 per Decision 3 2026-04-23, verified full gap 2026-04-24)

Verified as a full gap by CC investigation 2026-04-24 (see audit §5 Q5). The feature is declared in the classifier (`cbca_director_acceptance`, `lsaq_acceptation_mandat` requirement keys in `lib/requirement-doctype.ts:54-56`) but unfulfillable — missing from `REQUIREMENT_MAP` in `lib/pdf/generatePdfDocument.ts`, no template, no trigger, no CBCA s.105 clause.

Scope:
1. Create `lib/pdf-templates/acceptation-mandat.ts` — 4 paragraphs per spec §3.3:
   - Para 1: acceptance of mandate
   - Para 2: consent to telephone/electronic meeting participation
   - Para 3: Canadian residency declaration with commitment to notify of status changes
   - Para 4: eligibility declaration (18+ years, not mentally incapacitated, not bankrupt) **plus CBCA s.105 pre-signed resignation clause** (director declares they will immediately resign, and by signing actually do resign, the moment they cease to meet eligibility requirements)
2. Wire `cbca_director_acceptance` and `lsaq_acceptation_mandat` into `REQUIREMENT_MAP` in `lib/pdf/generatePdfDocument.ts`
3. Add dedicated `VaultDocType` entry (e.g., `acceptation_mandat`) to `lib/requirement-doctype.ts` — do not bucket under `'autre'`
4. Add `minute_book_section` category for acceptance forms distinct from resolutions (update classifier in `app/api/minute-book/binder/route.ts` and related)
5. Trigger generation after director insert in both call sites:
   - `components/directors/AddDirectorModal.tsx` (post-insert step after line 99)
   - `components/onboarding/OnboardingFlow.tsx` (post-mandate insert in the director loop, around line 143)
6. Each trigger writes a `documents` row + `document_generated` activity_log entry of type `acceptation_mandat`
7. Signature routing decision: physical/manual signing for MVP (consistent with current "Signature manuelle" pattern). E-signature integration deferred to post-launch.

Effort: medium. One new template, four small wiring changes, two trigger call sites. Comparable in scope to S10-TR-3 (share transfer UI). Should ship alongside S10-TR-1 / S10-TR-2 early in Sprint 10.

**Related: audit file `lib/requirement-doctype.ts` against `REQUIREMENT_MAP` in `lib/pdf/generatePdfDocument.ts`** for any other declared-but-unfulfillable requirement keys. Flagged by CC during S10-TR-13 investigation. 15-minute task, added to Sprint 10 investigation phase.

Effort: 15 min audit + variable remediation depending on what's found.

### 6.2 — Should ship (trust & consistency)

**S10-TR-6. Past-members sections** (B3)
Administrateurs page: collapsible "Anciens administrateurs" section below active. Each row shows period (appointment_date → end_date), motif, resident-status-at-end. Same pattern for Dirigeants. Read-only initially (edit comes Sprint 11).

Effort: small-medium. One query addition per page, one component each.

**S10-TR-7. Modifier les actions — field-level lockdown** (B5) — *Option A+ per Decision 2*

Disable `Nombre d'actions` and `Date d'émission` fields in the Modifier les actions modal. Keep `Numéro de certificat` and `Prix par action` editable (administrative corrections only). Add inline helper text beneath each disabled field:

- Under Nombre d'actions: *"Pour modifier la quantité d'actions détenues, utilisez **Transférer** (réduire) ou **Émettre des actions** (augmenter)."* Verbs render as buttons that close the modal and open the target flow.
- Under Date d'émission: *"La date d'émission fait partie du registre historique et ne peut être modifiée. Si cette émission a été mal saisie, utilisez **Annuler l'émission** et ré-émettez avec la bonne date."* Link opens S10-TR-12.

Plus: emit an `activity_log` event on every Modifier save (currently silent per §5 Q2 — confirm during implementation).

Plus: once-dismissable info callout at the top of Actionnaires page — *"La structure du capital est un registre juridique. Utilisez Émettre pour de nouvelles actions, Transférer pour changer de propriétaire, et Annuler pour corriger une saisie erronée."*

Effort: small for the modal changes + callout; S10-TR-12 below covers the cancellation flow.

**S10-TR-12. Annuler une émission flow** (new — pairs with S10-TR-7)

The typo-correction escape hatch. Without this, S10-TR-7's field lockdown becomes a trap for users who entered bad data.

Modal on a shareholding row: "Annuler cette émission d'actions?" Captures:
- Motif dropdown: Saisie erronée / Correction administrative / Autre
- Optional free-text note

Writes:
- `shareholdings` UPDATE: `status='cancelled'` (new column or reuse existing status enum — verify during implementation)
- `activity_log` entry with motif + note
- On successful cancellation, offers a one-click handoff to Émettre des actions pre-filled with the cancelled issuance's person + class (user corrects the quantity/date, submits).

Effort: small-medium. New modal, new endpoint, small schema change. Similar shape to Transférer.

**Why not Option B (route everything through Transfer/Issuance):** Option B forces an awkward mental model for genuine typo correction — a user who typed 500 instead of 50 shouldn't have to "transfer 450 to nobody" to fix it. S10-TR-7 + S10-TR-12 together deliver 80% of Option B's DD defensibility with a cleaner user mental model (three verbs: Émettre / Transférer / Annuler — each matching a real-world event).

**S10-TR-8. Onboarding step 6 appointment date** (B7)
Add "Date de nomination" field to each officer-role selector, backfillable, defaulting to incorporation date.

Effort: trivial. Matches pattern already present in step 4.

### 6.3 — Nice to have (defer if bandwidth tight)

**S10-TR-9. Citizenship field for non-residents** (C2)
Conditionally show citizenship text field when Résident canadien toggle is off. Schema: `ALTER TABLE company_people ADD COLUMN citizenship TEXT` (or rename existing field if one exists).

Effort: small. Not launch-blocking — the 25% rule audit surfaces the gap, but Sprint 10 is already heavy.

**S10-TR-10. Canadian-resident ratio indicator** (C3)
Sidebar or Administrateurs page banner: "Résidents canadiens: X/Y (N%)." Warn if below 25%. Flag hard if sole director is non-resident.

Effort: small. Depends on C2 being accurate.

**S10-TR-11. Wizard Step 3 DATE DE LA RÉSOLUTION anchoring** (C5)
If the target is a past fiscal year, default to the last day of that fiscal year, not today. Label the field to make the date semantics explicit.

Effort: trivial.

### 6.4 — Explicitly deferred (post-launch)

- Cap-table-as-of-date view (Sprint 11 minimum; requires S10-TR-2 + S10-TR-3 to ship)
- Redemption / repurchase flow (Sprint 11+)
- Convertibles / SAFE / notes / warrants (Sprint 12+)
- ESOP management (Sprint 12+)
- Family trust support (Sprint 12+)
- Securities register auto-generation (Sprint 11)
- Acceptation du mandat auto-generation per appointment (if not already present — verify per §5 Q5)

---

## 7. Decisions locked (2026-04-23 session)

Resolved in working session between Dominique and Max on the day this audit was produced. No further deliberation needed — Sprint 10 scope planning proceeds from these decisions.

**1. Sprint 10 heaviness — one sprint, not a split.**
Rationale from Dominique: *"Can't launch without this done properly. It's at the foundation. Sooner we do this the better."*
Sprint 10 ships §6.1 (must-ship) + §6.2 (should-ship). §6.3 (citizenship field, resident-ratio indicator, wizard date anchoring) is deferrable with the following tiered fallback order if the sprint runs hot:
1. §6.3 items first (all cosmetic or soft-compliance)
2. §6.2 B3 past-members views (trust polish, not correctness)
3. §6.2 B7 onboarding officer date (30-min fix, keep in unless catastrophic)
4. §6.1 non-negotiable — cannot be cut under any circumstances

**2. Modifier les actions — Option A+ (field-level lockdown with escape hatch).**
Disable quantity and issue-date in Modifier modal; keep cert number and price editable; add S10-TR-7 helper text + S10-TR-12 Annuler une émission flow + page-level info callout. Details now reflected in §6.2.
Rationale: Option A alone is weak (writes an audit log nobody reads). Option B alone is user-hostile (typo corrections require fake transfers). A+ with a dedicated cancellation flow gives DD defensibility without trapping users who entered bad data.

**3. Acceptation du mandat verification runs before Sprint 10 locks.**
~15-minute CC investigation. Does the product auto-generate Acceptation du mandat d'administrateur per director appointment (per spec §3.3 and CBCA s.105 pre-signed resignation clause requirement)? Two possible outcomes:
- Already exists → confirm, no change to Sprint 10 scope.
- Does not exist → absorb into Sprint 10 as a launch-adjacent compliance gap. Small scope (one document template + auto-trigger on director add).
Timing: run this in the next Max + CC session, before any Sprint 10 work begins.

**RESOLVED 2026-04-24:** CC investigation confirmed **full gap**. Feature is declared-but-unfulfillable: requirement keys exist (`cbca_director_acceptance`, `lsaq_acceptation_mandat`) but no template, no REQUIREMENT_MAP entry, no trigger, no CBCA s.105 clause. Absorbed into Sprint 10 as S10-TR-13 (see §6.1). CC also flagged potential related silent gaps in other requirement keys — added as Sprint 10 investigation-phase audit task.

**4. Phase 1 event-based rules — strict discipline. Sprint 11, nothing in Sprint 10.**
All 15–25 rules ship together in Sprint 11 alongside Phase 2 (DD Full Audit export), consistent with the Plan Diligence positioning in memory §9. Sprint 10 focuses exclusively on temporal infrastructure + launch blockers. No "tightly-coupled subset" folded in — even rules that depend on as-of-date resolver (which ships Sprint 10) wait for Sprint 11 to ship alongside the rest of the audit engine.
Parallel prep during Sprint 10 execution (low cognitive load, Max + Dominique + Aria, not CC):
- Taxonomy scoping session (lock two-category labels from memory §16)
- Full rule inventory with triggers, severities, remediation paths
- Deliverable: `docs/compliance-taxonomy-YYYY-MM-DD.md` ready to hand to CC at Sprint 11 start

**Rationale for strict discipline:**
Sprint 10 bandwidth is already consumed by temporal work + Stripe + landing page + ToS + Cakemail activation + test data purge + email confirmation + Livre tab fix + mobile pass + QA cycle. Adding any rule implementation — even "easy" ones — introduces scope creep risk at the exact moment when launch date matters most. Sprint 11 as the audit engine sprint is the clean architectural answer; "a few rules now, the rest later" produces a partial audit engine that misrepresents the product's capability at launch.

---

## 8. Process notes

**What went well in this audit:**
- Screenshot-driven investigation of a product whose codebase Max doesn't have direct access to. Two batches (entry/edit flows, then generation + onboarding) covered the surface area without over-capturing.
- Wizard Step 3 screenshot was a single-image proof of the central truthfulness failure. No debate required.
- Dominique's 1-word answers (no, today) on confirmatory questions kept pace without wasting effort.

**What to carry forward to future audit sessions:**
- Ask for the deceptive-button case early. Transférer being visible-but-inactive was an instant signal of scaffolded-but-unbuilt scope. Every audit should ask "what buttons are visible but don't work?"
- Onboarding flows are their own audit subject — they seed state that every downstream feature depends on. Not an afterthought.
- "Is there a history view anywhere?" one question, one answer, saves hours of searching.

**What this audit did NOT cover (out of scope, flag for future work):**
- Reminders and Cakemail-triggered workflows (schema-wise these touch `director_mandates.end_date` for term-limit alerts)
- Signature capture / e-signing (Section 3 of spec, deferred to Sprint 11+)
- Multi-user access control (deferred; current model is single-user-per-company)
- Mobile responsiveness of the temporal views (Sprint 10 supporting item)
