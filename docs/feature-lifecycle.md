# Feature Lifecycle Tracker

**Last updated:** 2026-07-27
**Purpose:** Single source of truth for the lifecycle status of every major surface in the ZapOkay product. Consulted by Max before scoping any infrastructure-hygiene or feature work — applied via the Critical-Path Justification preflight on every CC brief.

---

## Status definitions

- **ACTIVE** — Live in production, reachable from main navigation, currently maintained.
- **DEPRECATED** — Replaced by another surface or design decision; still in code but slated for removal.
- **VESTIGIAL** — Code exists but isn't reachable from main navigation; indeterminate whether to revive or delete.
- **UNCERTAIN** — Status not confirmed; needs Dom triage before any work touches it.

---

## Current north star

Sprint 10A → Phase 10A-G **temporal registry**: ship past history of all directors, shareholders, and officers. Critical-path surfaces are those touched by Phase 10A schema (shareholdings, share_transfers, officer_appointments, companies.onboarding_*) and Phase 10F/10G UX (Administrateurs, Dirigeants, Actionnaires).

---

## Surfaces

Status column to be filled in by Dom.

### Pre-authenticated

| Surface | Status | Notes |
|---|---|---|
| Landing | _TBD_ | |
| Login | _TBD_ | |
| Signup | _TBD_ | |
| Forgot password | _TBD_ | |
| Reset password | _TBD_ | |

### Onboarding flow

| Surface | Status | Notes |
|---|---|---|
| Step 1 — Langue | _TBD_ | |
| Step 2 — Entreprise | _TBD_ | |
| Step 3 — Province | _TBD_ | |
| Step 4 — Administrateur | _TBD_ | |
| Step 5 — Shareholder | _TBD_ | Sprint 10 spec: branch choice (Rush vs. Lets Take The Time) |
| Step 6 — Dirigeants | _TBD_ | |
| Step 7 — Summary | _TBD_ | |
| Step 8 — Fiscal | _TBD_ | |

### Authenticated app — sidebar surfaces (per v2.5 design system)

| Surface | Status | Notes |
|---|---|---|
| Dashboard | ACTIVE | Composite surface. LIVE: StatusVerdict (compliance verdict), InventoryLine (Total / Final / A signer / A generer / Classe aux archives), A3Board (the ranked obligation board, heading 'Que faire maintenant'), GapAnalysisPanel (AI gap analysis). The five legacy blocks (Historique, Document fondateur, Livre-de-minutes card, Documents recents, Actions requises) were gated off 2026-07-10 behind a hardcoded SHOW_LEGACY_DASHBOARD_BLOCKS = false and DELETED 2026-07-27, together with their dead reads (5 queries / ~110 rows per load fetched to render nothing), the orphaned MinuteBookCard + CompletenessBar components, and the uncalled computeFiscalYearHistory helper - page.tsx 640 to 213 lines. Triaged ACTIVE by Dom 2026-07-27; the prior entry described the pre-A3 dashboard and claimed a compliance_rules read, which no code has performed since 44902ba. |
| Documents (Coffre-fort) | ACTIVE | Vault standalone. Third surface of the fiscal-year upload gate: its "corresponds to" selector attaches a requirement_key + year, so it could file an annual resolution on an OPEN fiscal year exactly as the Complétude row and the A3 card could — measured 2026-08-15, the gate closes all three. Flipped 2026-08-15 by Dom: "un écran que mes clients utiliseront, définitivement". |
| Minute Book — Documents | ACTIVE | Core minute-book document-generation surface; hosts the inline generate-item route; carries open Tier 1 blocker NB-PDF-Title #17. Flipped 2026-05-20, preflight. |
| Minute Book — Complétude | ACTIVE | Per v2.5: primary edit surface. Core minute-book surface; flipped 2026-05-20, NB-PDF-Title preflight. |
| Minute Book — Livre (Binder) | ACTIVE | Per v2.5: finalized record view. Core minute-book surface; flipped 2026-05-20, NB-PDF-Title preflight. |
| Administrateurs | ACTIVE | Critical path (Phase 10F/10G temporal registry UX) |
| Dirigeants | ACTIVE | Critical path (Phase 10F/10G temporal registry UX) |
| Actionnaires | ACTIVE | Critical path (Phase 10F/10G temporal registry UX). Flipped 2026-05-22 following `docs/audit-people-surfaces-2026-05-22.md` first full audit closure. |
| Historique | _TBD_ | |
| Paramètres | ACTIVE | Settings surface; sole mutator of users.preferred_language (saveProfile). Flipped 2026-06-08 following #156 A3 (preferred_language warning box + UI-toggle decouple). |

### Authenticated app — non-sidebar surfaces

| Surface | Status | Notes |
|---|---|---|
| `/dashboard/compliance` (standalone page) | **REMOVED** | App-code deleted 2026-07-24 — route `app/[locale]/dashboard/compliance/`, `lib/compliance/*`, `components/compliance/*` (5 files), the sidebar `nav.group.compliance` group + `ShieldCheck` import, and the dead `compliance` i18n namespace + `nav.compliance` keys in both locales. DEPRECATED since 2026-05-10 but stayed live and served WRONG statutory deadlines (superseded REQ `addMonths(fyEnd,4)+day-15` rule instead of the Harvey-verified FY-end+6mo art. 45; plus `addMonths` month-end overflow), contradicting the A3 board / Complétude. Correcting two stale claims in the prior note: (a) it DID have a sidebar link (`Sidebar.tsx:65`, removed in this deletion) — not "URL-only"; (b) the standalone route was the SOLE consumer of the lib — the "Dashboard compliance widget" was already gone. Follow-up: `DROP TABLE compliance_items` then `compliance_rules` remains a separate migration (not yet run). |

---

## Pruning queue

Surfaces tagged DEPRECATED or VESTIGIAL with cleanup sequencing:

- **`compliance_rules` / `compliance_items` tables** — code-orphaned; DROP still pending. App-code deletion **DONE 2026-07-24** (original plan steps 1–3: the Dashboard compliance widget was already gone; the route, `lib/compliance/*`, and `components/compliance/*` are deleted; the sidebar entry + i18n keys removed). **REMAINING:** step (4) `DROP TABLE compliance_items`, then `compliance_rules` — a separate migration, not yet run. Note: the `compliance_items` upsert already silently failed in prod (3-value enum vs a 4-value CHECK). CORRECTED 2026-07-27: "the table holds no live data" is true for compliance_items (0 rows) but FALSE for compliance_rules (9 rows, verified). No application code reads either table; scripts/seed-canonical-fixture.mjs:175 references compliance_items in its fixture-teardown delete list. No DROP is proposed here - code deletion is git-reversible, a DROP is not, and it remains a separate migration and a separate decision.

---

## Banked methodology

**Schema drift codification is feature-relative, not absolute.** Drift on actively-used tables on the critical path = real hygiene. Drift on DEPRECATED/VESTIGIAL/off-critical-path tables = housekeeping that competes with feature work. Before scoping any drift-backfill batch, confirm via this tracker that affected surfaces are ACTIVE. Origin: Batch 4 compliance_* abandonment, 2026-05-10.

---

## Update protocol

- Updated as part of Max session-close memory regen.
- The `Last updated` header moves with ANY entry edit, in the same commit. It was stale by three edits (2026-05-22, 2026-06-08, 2026-07-24) when the 2026-07-27 feeder brief consulted it, so it could not be used as a freshness signal.
- Status changes for any surface trigger an immediate tracker update.
- New surfaces added when introduced (new routes, new dashboard widgets, etc.).
- Pruning queue items updated when scheduled or completed.
