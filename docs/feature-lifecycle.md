# Feature Lifecycle Tracker

**Last updated:** 2026-05-10
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
| Dashboard | _TBD_ | Composite surface with multiple widgets: LSAQ Compliance (reads compliance_rules), History, Foundational Document, Records analysis, Recent documents, Required actions, Livre de minutes progress |
| Documents (Coffre-fort) | _TBD_ | Vault standalone |
| Minute Book — Documents | ACTIVE | Core minute-book document-generation surface; hosts the inline generate-item route; carries open Tier 1 blocker NB-PDF-Title #17. Flipped 2026-05-20, preflight. |
| Minute Book — Complétude | ACTIVE | Per v2.5: primary edit surface. Core minute-book surface; flipped 2026-05-20, NB-PDF-Title preflight. |
| Minute Book — Livre (Binder) | ACTIVE | Per v2.5: finalized record view. Core minute-book surface; flipped 2026-05-20, NB-PDF-Title preflight. |
| Administrateurs | ACTIVE | Critical path (Phase 10F/10G temporal registry UX) |
| Dirigeants | ACTIVE | Critical path (Phase 10F/10G temporal registry UX) |
| Actionnaires | ACTIVE | Critical path (Phase 10F/10G temporal registry UX). Flipped 2026-05-22 following `docs/audit-people-surfaces-2026-05-22.md` first full audit closure. |
| Historique | _TBD_ | |
| Paramètres | _TBD_ | |

### Authenticated app — non-sidebar surfaces

| Surface | Status | Notes |
|---|---|---|
| `/dashboard/compliance` (standalone page) | **DEPRECATED** | Confirmed 2026-05-10. No sidebar link in v2.5 design system; reachable only by URL. Powered by `lib/compliance/calculateComplianceItems.ts`. One remaining live consumer of the lib: Dashboard's compliance widget. Cleanup queued for after temporal registry ships. |

---

## Pruning queue

Surfaces tagged DEPRECATED or VESTIGIAL with cleanup sequencing:

- **`/dashboard/compliance` + `calculateComplianceItems` lib + `compliance_rules` / `compliance_items` tables** — DEPRECATED. Cleanup steps: (1) replace Dashboard's compliance widget with a `minute_book_requirements`-backed equivalent (or remove entirely), (2) delete `app/[locale]/dashboard/compliance/page.tsx` route, (3) delete `lib/compliance/calculateComplianceItems.ts` and supporting components in `components/compliance/`, (4) DROP TABLE `compliance_items`, then `compliance_rules`. Timing: after temporal registry ships (post-Phase-10G). Pre-existing related bug: `calculateComplianceItems` writes a 3-value enum that violates prod's 4-value CHECK so writes silently fail — cleanup itself moots the bug.

---

## Banked methodology

**Schema drift codification is feature-relative, not absolute.** Drift on actively-used tables on the critical path = real hygiene. Drift on DEPRECATED/VESTIGIAL/off-critical-path tables = housekeeping that competes with feature work. Before scoping any drift-backfill batch, confirm via this tracker that affected surfaces are ACTIVE. Origin: Batch 4 compliance_* abandonment, 2026-05-10.

---

## Update protocol

- Updated as part of Max session-close memory regen.
- Status changes for any surface trigger an immediate tracker update.
- New surfaces added when introduced (new routes, new dashboard widgets, etc.).
- Pruning queue items updated when scheduled or completed.
