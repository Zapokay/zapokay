# ZapOkay — Temporal Registry Product Spec

**Version:** 1.0  
**Date:** April 27, 2026  
**Author:** Dom (Product Owner) + Max (CTO/AI advisor)  
**Status:** Locked — drives Sprint 10 implementation

---

## 0. Executive Summary

This document defines the temporal registry product surface for ZapOkay v1.0 launch. It is the source-of-truth for Sprint 10 implementation work and post-launch v1.1 planning.

**Core product principle:** ZapOkay is fundamentally a historical record reconstruction tool that happens to also manage going forward. The temporal registry is the product, not a supporting feature.

**Launch persona (locked):** Companies preparing for due diligence (persona c). They have history that needs accurate capture. They use ZapOkay specifically because they need their minute book to be defensible under buyer/lawyer scrutiny.

**Day 1 user behavior (locked):** Browse their existing minute book. Read the registry, validate accuracy, navigate cap table snapshots. Writing happens during onboarding/history capture, then becomes secondary.

**Three foundational principles:**
1. **Approach A — registry surfaces within existing pages.** No new sidebar entries. Administrateurs / Dirigeants / Actionnaires each gain a "current state + history" surface.
2. **Branched onboarding — Rush vs. Complete.** User self-identifies complexity. No mid-flow switching; Paramètres re-entry is the safety net.
3. **Skip-anywhere with capability scaling.** Onboarding is never a wall. ZapOkay always works with whatever data is provided. Document availability scales with data completeness.

---

## 1. The Temporal Model

### 1.1 Entities with temporal history

Three primary entities, each with different temporal-readiness state today:

| Entity | Schema today | Temporal-ready? |
|--------|--------------|-----------------|
| Directors | `director_mandates` with `appointment_date`, `end_date`, `end_reason`, `is_active` | ✅ Already temporal-ready |
| Officers | `officer_appointments` with `appointment_date`, `end_date`, `is_active` | ⚠️ Missing `end_reason` |
| Shareholdings | `shareholdings` with `quantity`, `issue_date`, `issue_price_per_share`, `certificate_number` | ❌ No `end_date`, no transfers — launch-blocker |

### 1.2 State-changing events

**For directors:**
- Appointment (creates new mandate)
- End of mandate (resignation, removal, term ended, deceased)

**For officers:**
- Appointment
- End of appointment (resignation, removal, role change, deceased)

**For shareholdings:**
- Issuance (already supported)
- Transfer (partial or full ownership change)
- Redemption / Repurchase (company buys back)
- Cancellation (shares destroyed)
- Conversion (class change)

### 1.3 Schema gaps to close (Sprint 10)

**S10-TR-2 — Shareholder temporal schema:**
```sql
ALTER TABLE shareholdings ADD COLUMN end_date DATE;
ALTER TABLE shareholdings ADD COLUMN end_reason TEXT;
ALTER TABLE shareholdings ADD COLUMN source TEXT NOT NULL DEFAULT 'direct_issuance';

CREATE TABLE share_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  to_shareholding_id UUID REFERENCES shareholdings(id) ON DELETE RESTRICT,
  transfer_date DATE NOT NULL,
  quantity_transferred INTEGER NOT NULL,
  consideration TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`end_reason` enum — TEXT field with reserved values:**
- v1.0 active: `'transfer'`, `'redemption'`, `'cancellation'`, `'conversion'`
- v1.1 reserved (documented, unused): `'exercise'`, `'forfeit'`, `'expire'`

**`shareholdings.source` enum — reserved for ESOP foundation:**
- v1.0 active: `'direct_issuance'`
- v1.1 reserved: `'option_exercise'`, `'rsu_vest'`, `'warrant_exercise'`

**S10-TR-4 — Officer end_reason:**
```sql
ALTER TABLE officer_appointments ADD COLUMN end_reason TEXT;
```

**S10-OB-1 — Onboarding state schema:**
```sql
ALTER TABLE companies ADD COLUMN onboarding_branch TEXT;
  -- 'rush' | 'complete' | NULL (not yet chosen)
ALTER TABLE companies ADD COLUMN onboarding_step TEXT;
  -- e.g., 'step_5_branch_choice', 'step_8_subb_movements'
ALTER TABLE companies ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN history_phases_status JSONB;
  -- { "directors": "complete" | "deferred" | "incomplete",
  --   "officers": "complete" | "deferred" | "incomplete",
  --   "shareholdings": "complete" | "deferred" | "incomplete" }
```

### 1.4 Architectural decision: hybrid (Option 3)

**Locked:** concrete `shareholdings` + `share_transfers` for v1.0, with two design choices that ease v1.1 ESOP migration:

1. `end_reason` is TEXT enum with reserved values
2. `shareholdings.source` is TEXT enum with reserved values

**Rejected:** polymorphic `equity_instruments` table (over-engineered for v1.0). Pure concrete schema (audit's exact spec) doesn't lay groundwork for ESOP.

**Cost of hybrid vs. pure concrete:** ~10-15% more schema work in Sprint 10. Saves ~50%+ of v1.1 ESOP migration work.

### 1.5 ESOP foundation (v1.0 deferral)

Sprint 10 ships without ESOP UI or schema, but the concrete schema includes the reserved enum values above so v1.1 migration is purely additive (new tables only, no schema rewrites).

### 1.6 Out of scope for v1.0 (ESOP Sprint scope)

Deferred to dedicated ESOP Sprint:
- Stock options (ISOs, NSOs)
- RSUs / Restricted Stock Awards
- Warrants
- Convertible notes
- SAFE agreements
- Stock Appreciation Rights (SARs)
- Phantom equity
- ESPPs
- Vesting schedules
- Option pool management
- Fully-diluted cap table

**Surfacing during v1.0:** No proactive prompt during onboarding. ESOP UI doesn't exist in v1.0; users won't encounter it.

**DD export caveat (footer):** "This export covers issued shares only. Stock options, RSUs, warrants, convertibles, SAFEs, and other equity instruments are not included. Coming Soon."

### 1.7 Edge cases the temporal model handles

- People with multiple non-contiguous mandates (Bob: director 2015-2018, then 2020-)
- People playing multiple roles over time (Alice: director→officer→director)
- Share transfers split across multiple events (Alice's 1000 shares → 600 + 400 → 300 + 300 + 400)
- Cap table queries for any date (end-of-day semantics)
- Share class conversions (paired close/open events in v1.0)

---

## 2. UI Surfaces

### 2.1 The "Current state + Past members" pattern

Each role page (Administrateurs, Dirigeants, Actionnaires) splits into two sections, top-to-bottom:

**Section 1 (top): Active / Current state** — CRUD UI as today, default focus.

**Section 2 (bottom): Past members / Anciens** — collapsible (default collapsed) with count badge, read-only list, "Restaurer" button on past entries where relevant.

**Why this pattern (not tabs):**
- Day 1 user (DD-prep) lands on current state — what the company is *now*
- History is one click away (expand collapsible)
- DD users often want both visible simultaneously
- Doesn't bloat primary management UI

### 2.2 Per-page instantiation

#### Administrateurs page

**Section 1 — Current directors:** CRUD as today.

**Section 2 — Anciens administrateurs (N):**
- List of past mandates with `appointment_date` / `end_date` / `end_reason`
- Action: "Voir le mandat" (modal with full details + associated documents)
- Re-appoint affordance: "Restaurer" button creates new active mandate for same person

**Modify Remove flow:**
- Currently: sets `is_active=false`
- New: capture `end_date` (default today, editable) + `end_reason` (dropdown: démission, révocation, fin de mandat, décès, autre)

#### Dirigeants page

Identical pattern to Administrateurs, applied to officer_appointments.

**Modify Remove flow:** capture `end_date` + `end_reason` (officer_appointments needs `end_reason` column added — S10-TR-4).

#### Actionnaires page

More complex than other role pages because:

1. **Section 1 — Current shareholders:** Cap table donut + shareholder list (CRUD as today).
2. **Cap table date scrubbing** — date picker above donut (see 2.3).
3. **Section 2 — Historique des mouvements (N):** Events-based view, not "past shareholders" (see 2.4).

### 2.3 Cap table date scrubbing

**UI:** Date picker above cap table donut with options:
- "Aujourd'hui" (default)
- "31 décembre 2025"
- "31 décembre 2024"
- (one per past fiscal year-end)
- Custom date picker

**Behavior:**
- Selecting non-today date re-renders donut + filters list
- Banner appears: "Vue au [date] — l'état actuel diffère"
- "Retour à aujourd'hui" link

**Query:** `WHERE issue_date <= [date] AND (end_date IS NULL OR end_date > [date])`

**Performance:** No caching needed (small data, indexed dates).

### 2.4 Historique des mouvements (Actionnaires Section 2)

**Why events-based, not person-based:** Lawyers think in transactions, not "past shareholders." A person can be both current AND have past holdings.

**UI:**
```
Historique des mouvements (12)
─────────────────────────────────────────
2024-03-15 │ Émission        │ Alice Dupont → 1,000 actions ordinaires
2024-08-20 │ Transfert       │ Alice Dupont → Bob Tremblay (400 actions ordinaires)
2025-01-10 │ Émission        │ Carol Martin → 500 actions privilégiées Classe A
2025-06-30 │ Rachat          │ Bob Tremblay → 200 actions ordinaires
2025-09-01 │ Annulation      │ Société → 200 actions ordinaires (post-rachat)
```

Each row clickable → detail modal with consideration, documents, certificate numbers.

**Filters:** event type (émission / transfert / rachat / annulation / conversion), person, date range.

### 2.5 DD export placement (Sprint 11 work, Sprint 10 placeholders)

**Locked: Option D — Combined.** Dashboard widget + per-page buttons.

**Sprint 10 ships:**
- Dashboard widget "Exporter le registre complet" (disabled, "Coming Soon" tooltip)
- Per-page button "Exporter le registre des [administrateurs/dirigeants/actionnaires]" (disabled, "Coming Soon" tooltip)

**Sprint 11 wires them up.** Building the placeholder UI in Sprint 10 prevents two rounds of UI changes to the same pages.

### 2.6 Sprint 10 page change summary

**Administrateurs:**
- Add "Anciens administrateurs (N)" collapsible section
- Add "Exporter" button (disabled, Coming Soon)
- Modify Remove flow: capture end_date + end_reason

**Dirigeants:**
- Add "Anciens dirigeants (N)" collapsible section
- Add "Exporter" button (disabled, Coming Soon)
- Modify Remove flow: capture end_date + end_reason
- Schema: officer_appointments adds end_reason column

**Actionnaires:**
- Add date scrubbing picker above cap table
- Add "Historique des mouvements (N)" collapsible section
- Add transfer flow ("Transférer des actions" button on each holding)
- Add redemption flow ("Racheter des actions" button — company-driven)
- Add "Annuler une émission" flow
- Modifier les actions field-level lockdown (Option A+ from audit)
- Add "Exporter" button (disabled, Coming Soon)
- Schema: shareholdings adds end_date / end_reason / source; new share_transfers table

**Dashboard:**
- Add "Exporter le registre complet" widget (disabled, Coming Soon)
- Optional: "État de votre minute book" capability widget (SHOULD-SHIP)

---

## 3. Onboarding for Varying Complexity

### 3.1 Branching question (Step 5)

After company-info steps (legal name, NEQ, incorporation date, etc.), user encounters:

**"Comment souhaitez-vous configurer votre minute book ?"**

#### 🚀 Configuration rapide — "In a Rush"
*"Pour les sociétés avec un historique simple"*
- Mêmes administrateurs, dirigeants, et actionnaires depuis le début (ou peu de changements)
- Vous pouvez compléter ZapOkay en moins de 15 minutes
- Vous pouvez toujours ajouter des changements historiques plus tard

#### 📚 Configuration complète — "Lets Take the Time"
*"Pour les sociétés avec un historique plus complexe"*
- Plusieurs changements d'administrateurs, dirigeants, ou transferts d'actions au fil du temps
- Préparation idéale pour la diligence raisonnable ou les audits
- Comptez au moins 30 minutes — peut-être davantage si vous n'avez pas toutes vos informations sous la main

**Below both cards:**
> "Pas certain ? Choisissez 'Configuration rapide' — vous pourrez toujours ajouter de l'historique plus tard. Vous pouvez aussi relancer l'onboarding à partir de **Paramètres** pour y ajouter les informations manquantes. Soyez avisé que certains documents ne pourront être générés si l'information nécessaire n'est pas complétée."

### 3.2 Branch A — Rush flow (~5-10 min)

**Step 6 — Administrateurs (rush):**
- List current directors as today
- **Bulk-date field:** "Tous ces administrateurs sont en poste depuis :" (default `incorporation_date`)
- Per-director date override hidden behind "Cet administrateur a une date différente" link

**Step 7 — Dirigeants (rush):** Same pattern.

**Step 8 — Actionnaires (rush):**
- Capture current holdings as today
- **Bulk-date field:** "Toutes ces actions ont été émises le :" (default `incorporation_date`)
- Per-holding date override hidden
- **No transfer / redemption / conversion UI** — Rush assumes simple history

**Step 9 — Confirmation:**
- Summary
- Big amber CTA: "Terminer l'inscription"
- Subtle secondary link: "Mon historique est plus complexe — quitter et utiliser configuration complète" (does NOT switch in place — see 3.5)

**Result:** Current state captured with reasonable historical anchoring. Past-state UI shows zero entries. Bulk Catch-Up uses these signatories for past resolutions.

### 3.3 Branch B — Complete flow

#### Step 6 — Administrateurs (complete)

**Sub-step 6a — Liste de tous les administrateurs (passés et présents):**
- User adds each person, marks "encore en poste" or "n'est plus en poste"

**Sub-step 6b — Mandats par administrateur:**
- Per current: appointment_date
- Per past: appointment_date + end_date + end_reason
- Returning director: "Ajouter un autre mandat" → multiple mandates per person
- Validation: no overlapping mandates per person

#### Step 7 — Dirigeants (complete)

Same pattern as Step 6, applied to officers.

#### Step 8 — Actions et actionnaires (complete)

**Sub-step 8a — Émissions initiales:**
- For each founder/initial holder: person, share class, quantity, issue_date (defaults to incorporation_date), price per share
- Defines share classes if not already set

**Sub-step 8b — Mouvements ultérieurs:**
- Chronological events table
- "Ajouter un mouvement" → modal: type (transfert / rachat / annulation / conversion / nouvelle émission), date, parties, quantity
- Running cap table preview at bottom (live update)
- Validation: outstanding shares per person never goes negative

**Sub-step 8c — Validation finale (reconciliation safety net):**
- Calculated cap table from events shown
- Compared to user-entered current state from Step 8a
- If mismatch: surface reconciliation step with three resolution paths

#### Step 9 — Confirmation

Same as Branch A but summary shows "X mandats historiques, Y mouvements d'actions enregistrés."

### 3.4 Save-and-resume mechanism

**DB-backed (not browser-localStorage):**
- Every form submission writes to relevant table immediately
- `companies.onboarding_step` tracks progress
- `companies.onboarding_branch` tracks which branch chosen
- User can close browser, log out, return days later — resume at exact step

**"Save and continue later" affordance:**
- Top-right button on every step
- Confirm dialog
- Routes to dashboard with persistent banner

**"Skip and save" within Branch B:**
- Each sub-step has "Passer cette section pour le moment"
- Warning: "Si vous ignorez cette section, certains documents (notamment les résolutions historiques) ne pourront pas être générés tant que les informations ne seront pas complétées."
- User confirms → moves to next sub-step, this section marked "deferred"

### 3.5 No mid-flow branch switching

**Locked decision:** Once user picks Rush or Complete, they finish that flow.

**If user realizes mid-flow they should have picked the other:**
- They finish what they started (or quit and save)
- They use **Paramètres → Relancer l'onboarding** to re-enter

**Why:** Eliminates entire class of state-management complexity. Paramètres re-entry is the safety net.

### 3.6 Skip-anywhere principle

**ZapOkay is never a hard wall. Always works with whatever data is provided.**

**Capability scales with data completeness:**
- Zero onboarding: no documents possible. Dashboard shows "Commencez par configurer votre société."
- Step 4 only: statuts can generate. No people-related docs.
- Branch A complete: current-year resolutions ✓. Past-year: soft-warning.
- Branch B complete: everything generates with full historical accuracy. DD export ready (when shipped).

**UI principle:**
- Available documents: generate normally
- Documents with imperfect data: generate with warning + footer note
- Documents truly impossible: hidden or disabled with clear "to unlock, add [data] in [surface]"

**"Quitter l'onboarding" affordance:** Available on every onboarding step.
- Confirmation dialog
- Routes to dashboard
- DB state captures partial progress

### 3.7 Re-entry surfaces

**Three complementary surfaces:**

1. **Dashboard banner** (transient, visual nudge)
   - State-aware: not started / in progress / partial / deferred / complete
   - Can be minimized to topbar icon
   - Cannot be permanently dismissed while history is incomplete

2. **Paramètres → "Configuration de votre minute book" card** (permanent, discoverable)
   - Shows current state ("Configuration rapide — historique partiel. 0/3 phases complètes")
   - Primary CTA: "Relancer l'onboarding"
   - Confirms with user before routing to Step 5
   - **Critical: this is the user's permanent path back, even if they minimized every banner**

3. **Per-role-page "Ajouter de l'historique" button**
   - Small button near top of each role page
   - Routes to relevant phase of historical-capture workflow
   - Gives contextual entry from where the user is working

### 3.8 Document availability behavior

**Documents that ALWAYS generate** (regardless of history completeness):
- Current-year resolutions
- Statuts and incorporation documents
- Current cap table reports
- Any document dated today or in the future

**Documents that generate with WARNING when history is incomplete:**
- Bulk Catch-Up resolutions for past years
- Past-year financial statement approvals
- Historical share certificate reissuances

**UI for documents with partial data:**
- Bulk Catch-Up modal: amber warning indicator + tooltip "Données historiques incomplètes — le document utilisera les administrateurs/dirigeants actuels à la place"
- User can still check the row and generate (soft-block, not hard-block)
- Generated PDF footer note: "Document généré sans capture historique complète — vérifiez l'exactitude des signataires"
- Banner on document detail: "Régénérer après capture historique pour exactitude finale"

**Documents truly blocked** (Sprint 11):
- DD audit export package — hard-block on incomplete data, because export's purpose is auditability

### 3.9 What's NOT in Sprint 10 onboarding scope

- **Bulk import (CSV/Excel)** — v1.1
- **OCR / document parsing** — v1.1+
- **REQ API integration** — v1.1+
- **AI-assisted history capture** — v1.2+
- **Third-party imports (Carta, Capshare)** — v1.1+
- **ESOP onboarding** — ESOP Sprint

### 3.10 Onboarding step structure (Sprint 10 final)

| Step | Purpose | Mode |
|------|---------|------|
| 1-3 | Account creation, email confirmation, etc. (existing) | Pre-onboarding |
| 4 | Incorporation info (name, NEQ, **incorporation_date REQUIRED**, etc.) | Both |
| 5 | **Branch choice — Rush vs. Complete** | Both |
| 6 | Administrateurs (Rush: list + bulk date / Complete: list + per-mandate dates) | Branched |
| 7 | Dirigeants (Rush: list + bulk date / Complete: list + per-appointment dates) | Branched |
| 8 | Actionnaires (Rush: holdings + bulk date / Complete: 8a issuances + 8b movements + 8c reconciliation) | Branched |
| 9 | Confirmation | Both |

---

## 4. Edge Cases

### 4.1 People playing multiple roles over time
- One `company_people` row, multiple role-specific rows
- "Anciens" sections show role-specific history

### 4.2 Same role, multiple non-contiguous mandates
- Multiple `director_mandates` rows for same person
- Validation: no overlapping mandates

### 4.3 Share transfers split over time
- Standard "each ownership event = new holding row" pattern
- Users think in events; system stores in holdings + transfers
- Translation layer in events modal

### 4.4 Cap table mid-event date queries
- End-of-day semantics (date X = state at end of day X)
- Same-day events ordered by event_id (insertion order)

### 4.5 Share class conversions
- v1.0: paired close/open events in events modal (tedious but functional)
- v1.1+: dedicated bulk-conversion wizard

### 4.6 Reconciliation safety net (Branch B Sub-step 8c)
- Calculated cap table from events vs. user-entered current state
- Three resolution paths: correct current to match history / revise history / restart phase

### 4.7 Bulk date conflicts with existing documents
- Validation: "Cette date est postérieure à des documents existants"
- User can confirm or change

### 4.8 Onboarding restart with existing data
- Routes to Step 5 with current data preserved
- Branch B sub-steps show current data as starting point
- After history added: banner "X documents existants peuvent contenir des informations à mettre à jour. Voulez-vous régénérer ?"
- User-initiated regeneration, not auto

### 4.9 Multiple share classes
- Already handled by existing `share_classes` + `shareholdings.share_class_id`

### 4.10 Stock splits / consolidations
- v1.0: out of scope. Manual paired conversion events.
- v1.1+: dedicated wizard

### 4.11 Document already generated when underlying data changes
- v1.0: no auto-regeneration. Banner on document detail page invites manual regeneration.
- v1.1: document version history, diff view, rollback

### 4.12 Person deletion with associated data
- Cannot delete `company_people` if any associated mandate/appointment/shareholding exists
- Edit-only-no-delete philosophy for historical data once used in document generation

### 4.13 NEQ already in use
- v1.0: error message "Cette entreprise est déjà enregistrée. Contactez-nous."
- v1.1: multi-user company access, invite flow

### 4.14 Unusual share quantities
- v1.0: no validation beyond positive integer
- v1.1+: optional "unusual values" soft warning

### 4.15 Citizenship / Canadian-resident ratio (Quebec compliance)
- v1.0: deferred per audit §6.3 (S10-TR-9, S10-TR-10)
- v1.1: citizenship field + ratio indicator

---

## 5. Launch Scope (Sprint 10 IN/OUT)

### 5.1 Classification methodology

- **MUST-SHIP** — launch-blocking, cannot defer
- **SHOULD-SHIP** — high value, defer only if timeline pressure
- **DEFER** — out of Sprint 10, captured for v1.1+

### 5.2 MUST-SHIP — Schema work

| Item | Description |
|------|-------------|
| S10-TR-2 | `shareholdings.end_date`, `end_reason`, `source`. Create `share_transfers` |
| S10-TR-4 | `officer_appointments.end_reason` |
| S10-OB-1 | `companies.onboarding_branch`, `onboarding_step`, `onboarding_completed_at`, `history_phases_status` |

### 5.3 MUST-SHIP — Onboarding flow

| Item | Description |
|------|-------------|
| S10-OB-2 | Step 5 branch choice screen (Rush vs. Complete) |
| S10-OB-3 | Branch A — 4-step Rush flow with bulk-date pattern per role |
| S10-OB-4 | Branch B — 4-step Complete flow with sub-steps |
| S10-OB-5 | Save-and-resume infrastructure (DB-backed, every step) |
| S10-OB-6 | "Quitter l'onboarding" affordance on every step |
| S10-OB-7 | Per-section "Passer cette section" with consequence warning |
| S10-OB-8 | Branch B Sub-step 8c — cap table reconciliation |
| S10-OB-9 | Step 4 makes incorporation_date required to advance |

### 5.4 MUST-SHIP — Re-entry surfaces

| Item | Description |
|------|-------------|
| S10-OB-10 | Dashboard banner with state-aware messaging |
| S10-OB-11 | Paramètres → "Configuration de votre minute book" card with "Relancer l'onboarding" button |
| S10-OB-12 | Per-role-page "Ajouter de l'historique" affordance |

### 5.5 MUST-SHIP — Role pages

| Item | Description |
|------|-------------|
| S10-RP-1 | Administrateurs — "Anciens administrateurs (N)" collapsible section |
| S10-RP-2 | Administrateurs — modify Remove flow (capture end_date + end_reason) |
| S10-RP-3 | Dirigeants — "Anciens dirigeants (N)" collapsible section |
| S10-RP-4 | Dirigeants — modify Remove flow (capture end_date + end_reason) |
| S10-RP-5 | Actionnaires — cap table date scrubbing |
| S10-RP-6 | Actionnaires — "Historique des mouvements (N)" collapsible section |
| S10-RP-7 | Actionnaires — wire Transférer button (S10-TR-3) |
| S10-RP-8 | Actionnaires — Modifier les actions field-level lockdown (S10-TR-7) |
| S10-RP-9 | Actionnaires — "Annuler une émission" flow (S10-TR-12) |

### 5.6 MUST-SHIP — Document availability + as-of-date generation

| Item | Description |
|------|-------------|
| S10-DA-1 | Per-document-type metadata defining "what data is needed" |
| S10-DA-2 | Real-time evaluation engine: classify documents as available / partial / blocked |
| S10-DA-3 | Bulk Catch-Up modal — warning indicator + tooltip on partial-data rows; soft-block |
| S10-DA-4 | PDF footer note for documents generated with partial data |
| S10-TR-1 | Refactor `generatePdfDocument` to accept `asOfDate`; resolve signatories at that date |
| S10-DA-5 | Bulk Catch-Up modal uses asOfDate per row |

### 5.7 MUST-SHIP — Coming-Soon placeholders + Acceptation du mandat

| Item | Description |
|------|-------------|
| S10-CS-1 | Dashboard "Exporter le registre complet" widget (disabled, Coming Soon) |
| S10-CS-2 | Per-page "Exporter" buttons (disabled, Coming Soon) |
| S10-TR-13 | Acceptation du mandat real implementation (currently scaffolded but unfulfillable) |

### 5.8 SHOULD-SHIP

| Item | Description |
|------|-------------|
| S10-OB-13 | Onboarding Step 6 appointment date — matches Step 4 pattern (S10-TR-8) |
| S10-DA-6 | Dashboard "État de votre minute book" capability widget |
| S10-RP-10 | Hide Transférer button if S10-TR-3 slips (defensive UX) (S10-TR-5) |

### 5.9 DEFER — v1.1 / Sprint 11 / ESOP Sprint

| Item | Description | Target |
|------|-------------|--------|
| S10-TR-9 | Citizenship field for non-residents | v1.1 |
| S10-TR-10 | Canadian-resident ratio indicator | v1.1 |
| S10-DD-1 | DD audit export package | Sprint 11 Phase 2 |
| S10-EV-1 | Event-based compliance rules engine | Sprint 11 Phase 1 |
| S10-IM-1 | Bulk import (CSV/Excel) | v1.1 |
| S10-IM-2 | OCR / document parsing | v1.1+ |
| S10-IM-3 | REQ API integration | v1.1+ |
| S10-IM-4 | Third-party imports (Carta) | v1.1+ |
| S10-DOC-1 | Document version history | v1.1 |
| S10-USR-1 | Multi-user company access | v1.1 |
| S10-VAL-1 | Unusual-value soft warnings | v1.1 |
| S10-SH-1 | Stock split / consolidation wizard | v1.1 |
| S10-SH-2 | Bulk share class conversion wizard | v1.1+ |
| S10-ESOP-1 | Full ESOP / vesting / option pool | ESOP Sprint |

### 5.10 Launch infrastructure parallel track

Separate from temporal registry but must ship before launch:

| Item | Description | Owner |
|------|-------------|-------|
| LI-1 | Stripe integration (subscriptions, payment) | Dom + CC |
| LI-2 | Landing page | Aria + Dom |
| LI-3 | Terms of Service | Dom + legal review |
| LI-4 | Privacy Policy | Dom + legal review |
| LI-5 | Cakemail (transactional + marketing email) | Dom + CC |
| LI-6 | Test data purge (clear droussy inc. dev data) | Dom + CC |
| LI-7 | Email confirmation enabled in production | Dom |
| LI-8 | Livre tab `minute_book_section` audit/repair | CC |

Estimate: 2-3 weeks total, doable in parallel with temporal registry work.

### 5.11 Sprint 10 timeline estimate

**Realistic estimate:**
- Schema work + migrations: 2-3 days
- Onboarding flow (Branch A + Branch B + state): 2-3 weeks
- Role page modifications: 1-2 weeks
- Document availability engine + as-of-date generation: 1 week
- Re-entry surfaces: 3-5 days
- Coming-Soon placeholders: 1 day
- Acceptation du mandat real implementation: 3-5 days
- Testing + integration + bug fixes: 1-2 weeks

**Total temporal registry work: 6-10 weeks**  
**Plus launch infrastructure parallel track: 2-3 weeks**  
**Realistic launch timeline: 8-12 weeks from Sprint 10 start.**

### 5.12 Sprint 10 internal phasing

For execution clarity:

**Sprint 10A (Weeks 1-3) — Foundation**
- Schema migrations
- As-of-date document generation refactor
- Document availability engine
- Onboarding state infrastructure (DB-backed save/resume, UI not yet branched)

**Sprint 10B (Weeks 4-6) — Onboarding flow**
- Step 5 branch choice
- Branch A (Rush)
- Branch B (Complete) with sub-steps
- Skip-anywhere infrastructure

**Sprint 10C (Weeks 7-9) — Role page surfacing**
- Administrateurs / Dirigeants / Actionnaires history sections
- Cap table date scrubbing
- Movement events flow on Actionnaires
- Per-page re-entry buttons

**Sprint 10D (Weeks 9-10) — Polish + launch infra integration**
- Dashboard banner + Paramètres re-entry
- Coming-Soon placeholders
- Integration testing
- Launch infra components (Stripe, landing, etc.) finalized in parallel

Each sub-sprint has visible end-of-period deliverable. Can ship to production incrementally (not big-bang).

---

## 6. Compliance Taxonomy Pre-work (Sprint 11 Prerequisite)

Before Sprint 11 (Plan Diligence) can be implemented, a compliance taxonomy + 15-25 event-based rules need to be drafted. This is a parallel-track activity:

- **Owner:** Max (draft) + Dom + Aria (review)
- **Effort:** 1-2 strategic sessions, low CC, high product-decision
- **Output:** Markdown doc capturing event-based rules (e.g., "When officer appointed → require acceptation du mandat within 30 days") and document templates each rule triggers
- **Timing:** Can run during Sprint 10 (parallel)

Locked: this work happens during Sprint 10, not after.

---

## 7. Decisions Log (for project memory)

The following decisions are locked and should NOT be re-debated without explicit re-opening:

1. **Approach A — registry surfaces within existing pages** (no new sidebar entries)
2. **Persona (c) — DD-prep — is the launch persona**
3. **Day 1 user behavior is "browse the minute book"** (read-first, write-secondary)
4. **Branched onboarding — Rush vs. Complete** (no mid-flow switching)
5. **DB-backed save-and-resume** (not browser-localStorage)
6. **Paramètres → "Relancer l'onboarding" is the safety net**
7. **Skip-anywhere principle** (onboarding is never a wall)
8. **Capability scaling** (document availability scales with data completeness)
9. **Soft warnings, not hard blocks, for partial-data document generation** (lean — revisit during implementation if Aria pushes back)
10. **Hybrid schema architecture (Option 3)** (concrete + reserved enum values for ESOP)
11. **ESOP and equivalent instruments deferred to ESOP Sprint** (foundation laid in v1.0)
12. **DD export — Option D — dashboard widget + per-page buttons, all disabled with "Coming Soon" in Sprint 10**
13. **Reconciliation safety net** (Branch B Sub-step 8c) is required for persona (c) data integrity
14. **incorporation_date required in Step 4** (no opt-out within onboarding flow)
15. **Time estimate language: "Comptez au moins 30 minutes — peut-être davantage si vous n'avez pas toutes vos informations sous la main"**
16. **8-12 week launch timeline accepted** (deliberate trade-off favoring product quality)

---

## 8. Open Questions (to address during Sprint 10 implementation)

These decisions can be deferred to implementation phase, not re-opened today:

1. **Soft warnings vs. hard blocks UX treatment** — final call when Aria provides design treatments for the warning UI in Bulk Catch-Up modal
2. **Capability widget on dashboard** (S10-DA-6) — confirm SHOULD-SHIP vs. drop based on Sprint 10A/B progress
3. **Citizenship / Canadian-resident ratio** (S10-TR-9, S10-TR-10) — recheck during compliance taxonomy work; Quebec compliance review may push to MUST-SHIP
4. **Document version history scope** — confirm v1.1 is right target, not Sprint 10
5. **Aria's visual treatment of past-state sections** — typography, color, accent; Aria territory

---

## 9. Reference: Source Documents

This spec consolidates and supersedes:
- `audit-phase-4d-stream-1-2026-04-22.md`
- `temporal-registry-audit-2026-04-23.md`

Where this spec differs from prior audits, this spec is authoritative.

---

**End of Spec v1.0**
