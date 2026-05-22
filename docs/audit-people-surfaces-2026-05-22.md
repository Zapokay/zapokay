# Audit — People surfaces (Administrateurs / Dirigeants / Actionnaires)

**Date:** 2026-05-22
**Scope:** Re-audit of `app/[locale]/dashboard/directors/`, `app/[locale]/dashboard/officers/`, and first full audit of `app/[locale]/dashboard/shareholders/`. AUDIT/INVESTIGATION ONLY — no fixes in this pass.
**Predecessors:** `docs/audit-administrateurs-2026-05-12.md`, `docs/audit-dirigeants-2026-05-12.md`.
**Lifecycle preflight:** Actionnaires row in `docs/feature-lifecycle.md` is `_TBD_` and needs flip to ACTIVE (this audit pins the surface to current production code).

---

## Classification legend

- **SHIP-NOW** — Pre-launch blocker; fix in the next bundle.
- **NEXT-BUNDLE** — Should ship before launch; not a blocker if slipped one bundle.
- **FOLLOW-UP** — Post-launch acceptable; log to Queue tier appropriate.
- **ACCEPT** — Working-as-designed; close.
- **ATOM-3-OVERLAP** — Resolution waits on Phase 10A.5 atom 3 (entity-shareholder UI rebuild). Hold.

---

## Task A — Cross-surface themes

### A.1 No history — current-state-only queries

**Finding:** All three surfaces query only the active/current slice; no history pane exists.

**Evidence:**
- `app/[locale]/dashboard/directors/DirectorsClient.tsx:69` — `.eq('is_active', true)` on `director_mandates`.
- `app/[locale]/dashboard/directors/DirectorsClient.tsx:84` — `.is('end_date', null)` on `shareholdings`.
- `app/[locale]/dashboard/officers/OfficersClient.tsx:55` — `.eq('is_active', true)` on `officer_appointments`.
- `app/[locale]/dashboard/officers/OfficersClient.tsx:68` — `.is('end_date', null)` on `shareholdings`.
- `app/[locale]/dashboard/shareholders/ShareholdersClient.tsx:66` — fetches all shareholdings (no filter), but display filters: `ShareholdersClient.tsx:92-95` `s.end_date === null`.

**Note:** Shareholders surface DOES retrieve historical rows (no fetch-time filter) but discards them at display time. Directors + Officers filter at fetch.

**Classification:** **FOLLOW-UP** — Tier 1 feature work, not a blocker. See Task D for the proposed Queue item that wraps this (history → completeness → generate).

---

### A.2 "Edit" wires three different ways

**Finding:** Each surface has a different Edit semantic for its primary card type.

**Evidence:**
| Surface | `onEdit` handler | Resulting UI |
|---|---|---|
| Administrateurs | `setEditingDirector(d); setShowAddModal(true)` (`DirectorsClient.tsx:196`) — but Edit button is **hidden** by `{false && (...)}` guard at `components/directors/DirectorCard.tsx:156-165` (Q-EDIT-DIR-1 hotfix) | Effectively no Edit (button never rendered) |
| Dirigeants | `setShowAddModal(true)` (`OfficersClient.tsx:170`, ignores arg) — Edit button **visible** | Opens **Appoint** modal — confusing |
| Actionnaires | `setEditingShareholding(sh)` (`ShareholdersClient.tsx:227`) — Edit **visible** | Opens **EditShareholdingModal** (real edit) |

**Status check vs `docs/audit-dirigeants-2026-05-12.md`:** Dirigeants Edit-opens-Appoint still ships in production — not fixed yet.
**Status check vs `docs/audit-administrateurs-2026-05-12.md`:** Q-EDIT-DIR-1 hotfix guard still present at lines 156-165 with comment "Edit button hidden pending scaffold". Real Edit modal still not scaffolded.

**Classification:** **NEXT-BUNDLE** (all three should converge on a real Edit modal; Dirigeants visible-but-misleading button is the worst offender — could ship a `{false &&}` guard parity hotfix as **SHIP-NOW** if Edit modal not yet scaffolded for next bundle).

**INTERIM SHIPPED 2026-05-22** via `34227a3` (deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn` READY at zapokay.vercel.app): Officer Edit button now hidden on `components/officers/OfficerCard.tsx` via `{false && (...)}` guard with parity comment block matching DirectorCard's Q-EDIT-DIR-1 pattern; comment references this audit doc as re-enable pointer and notes `OfficersClient.tsx:170` onEdit currently opens AddOfficerModal (misleading affordance). Real Edit-modal convergence across all three surfaces stays NEXT-BUNDLE — this is the interim parity hide, not the convergence fix.

---

### A.3 Incorporation date as default for dated actions

**Finding:** All three Add/Appoint/Issue modals default the principal date field to `incorporation_date` if set, else today.

**Evidence:**
- `components/directors/AddDirectorModal.tsx:41-43` — `appointmentDate = incorporationDate || today`.
- `components/officers/AddOfficerModal.tsx:55-57` — same pattern (`appointmentDate`).
- `components/shareholders/IssueSharesModal.tsx:48-50` — same pattern (`issueDate`).

**Classification:** **FOLLOW-UP** (Dom override 2026-05-22; was ACCEPT in initial draft).

**Rationale (Dom):** Fine for founding-era backfill, silent footgun for an established company appointing today. A user incorporating in 2018 and appointing a new director in 2026 will see the date default to 2018-XX-XX silently; if they don't notice, the new director's appointment gets dated to incorporation.

**Suggested fix (cross-surface):** default to `incorporation_date` only when the surface has no existing active people for that role; otherwise default to today. Each of the three Add/Appoint/Issue modals takes a small conditional. Could ship as a single small atom across all three surfaces.

---

### A.4 Dead affordances — dead-state triangulation (§8.17)

#### A.4a Transfer button on ShareholderCard

**Triangulation:**
- **UI:** `components/shareholders/ShareholderCard.tsx:174-182` — Transfer button is `disabled`, tooltip `"Bientôt disponible (Sprint 7)"` / `"Coming soon (Sprint 7)"`.
- **Schema:** `share_transfers` table exists (`supabase/migrations/20260511131314_create_share_transfers.sql`).
- **UI consumers of `share_transfers`:** grep across `app/`, `components/`, `lib/` — **ZERO**. Only `docs/` + the migration file.
- **Verdict:** Designed-disabled with self-acknowledged Sprint 7 deferral; not a stale-feature ghost. Real-by-design dead state.

**Classification:** **ACCEPT** — explicit pre-launch "coming soon" affordance with consistent backing schema waiting for Sprint 7.

**SHIPPED (tooltip-strip) 2026-05-22** via `34227a3` (deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn`): "(Sprint 7)" internal sprint reference stripped from both locale branches of the Transfer button tooltip (`ShareholderCard.tsx`). Tooltip now reads "Bientôt disponible" / "Coming soon". Button remains `disabled` by design (Sprint 7 still owns the activation work).

#### A.4b "Signataire autorisé" badge on OfficerCard

**Triangulation:**
- **UI write:** `components/officers/AddOfficerModal.tsx:148` — `is_primary_signing_authority: isSigningAuthority` persisted. Toggle defaults OFF (`AddOfficerModal.tsx:54`).
- **UI write (replace):** `components/officers/ReplaceOfficerModal.tsx:127` — preserves outgoing officer's value (`ReplaceOfficerModal.tsx:62-64`).
- **UI read:** `components/officers/OfficerCard.tsx:118-126` — renders "Signataire autorisé" / "Authorized signatory" star-badge when true.
- **Pipeline consumers** (`lib/pdf/`, `lib/pdf-templates/`): grep for `signing_authority|signingAuthority|primarySigner|primary_signer` — **ZERO matches**.
- **Other consumers:** seed scripts, OnboardingFlow writer, type declaration only.
- **Verdict:** Field is captured, displayed as a badge, but **does not influence resolution signers, signature blocks, or any generated PDF**. Pure cosmetic dead-state.

**Status:** This re-confirms Q-OFFICER-SIG-1 Concern 3 (dirigeants audit 2026-05-12).

**Classification:** **FOLLOW-UP** — either wire badge into signature pipeline OR remove toggle. Decision needed; not a launch blocker (correct documents still generate without it).

---

### A.5 i18n leaks — hardcoded FR/EN ternaries in JSX

**Finding:** All three client + card + modal components rely heavily on `locale === 'fr' ? 'fr-string' : 'en-string'` ternaries instead of `t()`. This violates CLAUDE.md §1.

**Worst offenders (counts approximate from this audit pass):**
- `DirectorsClient.tsx` — multiple (lines 135, 144, 146, 169, 208-213, …).
- `OfficersClient.tsx` — lines 110, 121-124, 131-133, 156-158, 182-189.
- `ShareholdersClient.tsx` — lines 148, 159-161, 168-171, 194, 217, 244-246, 261-262.
- `DirectorCard.tsx`, `OfficerCard.tsx`, `ShareholderCard.tsx` — all rely on ternaries for role line, dates label, badges.
- `AddOfficerModal.tsx` (`TITLE_OPTIONS` table + conflict dialog).
- `ReplaceOfficerModal.tsx` (lines 168-170, 194, 201, 212).
- `RemoveOfficerModal.tsx` (lines 121-128).
- `RemoveDirectorModal.tsx` (lines 112-120, `END_REASONS` table).
- `EditShareholdingModal.tsx` (line 90 "Modifier les actions / Edit shareholding").
- `IssueSharesModal.tsx` (lines 221-223, 247, 275, 305).

**Note:** `AddDirectorModal.tsx` is the cleanest — pure `t()` calls, no inline ternaries. Use as reference pattern.

**Pattern smell:** `const locale = t('_locale') === 'fr' ? 'fr' : 'en'` appears in every component as a workaround. Cleaner: `useLocale()` from next-intl.

#### A.5a Sidebar footer "Propriétaire · Plan Pro" — app-wide leak

**Evidence:** `components/dashboard/DashboardShell.tsx:219` hardcoded `Propriétaire · Plan Pro`, also `Utilisateur` fallback at line 216. Not people-surface specific, but visible in all three.

**Classification (A.5 collectively):** **NEXT-BUNDLE** — fits the Phase 1+2 bilingual audit work that's already in scope (`docs/bilingual-i18n-audit-2026-04-28.md`). Not a launch-blocker if EN strings are correct enough to ship; is a launch-blocker if any reach production untranslated. Per CLAUDE.md, all three people pages should be Phase 1 sweep targets.

**SHIPPED (A.5a footer) 2026-05-22** via `34227a3` (deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn`): Footer "Utilisateur" fallback and "Propriétaire · Plan Pro" now locale-aware via the file's existing `fr ?` ternary convention (matches DashboardShell's documented sidebar-i18n exception at lines 43-44 — file-level migration to `useTranslations()` stays tracked separately). EN locale now renders "User" / "Owner · Pro plan". The broader A.5 sweep (DirectorsClient, OfficersClient, ShareholdersClient, three Card components, six modals) stays NEXT-BUNDLE per the Phase 1+2 bilingual audit plan.

#### A.5b Share-class name forced lowercase

**Evidence:** `components/shareholders/ShareholderCard.tsx:112` — `<span className="lowercase">{classLabel}</span>` lowercases user-entered class names (e.g., "Class A Preferred" → "class a preferred"). Single occurrence; ShareClassCard does not lowercase.

**Classification:** **NEXT-BUNDLE** — UX defect (user-entered casing is the canonical legal name). Easy revert.

**SHIPPED 2026-05-22** via `34227a3` (deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn`): `className="lowercase"` removed from the class-name span on ShareholderCard. User-entered casing now preserved as canonical.

---

### A.6 End-of-tenure capture asymmetry

**Finding:** Director Remove captures structured `end_reason`; Officer Remove does not.

**Evidence:**
- `components/directors/RemoveDirectorModal.tsx:24-30` defines 5 `DirectorEndReason` options (resignation, revocation, term_expired, death, disqualification), default `resignation`. Persisted at line 60 via `end_reason: endReason`.
- `components/officers/RemoveOfficerModal.tsx:58-63` updates only `is_active=false` + `end_date`. No `end_reason` column captured.
- Shareholders: no "remove" — only end-date implicit via Edit changing `end_date`. No structured reason.

**Classification:** **FOLLOW-UP** — schema/parity question. Officer offboarding reason is useful for minute-book completeness but Director version may be over-modeled too. Defer to consolidated lifecycle redesign (see Task D).

---

## Task B — Per-surface specifics

### B.1 Administrateurs — duplicate count rendering

**Evidence:** `DirectorsClient.tsx:144` (in subtitle paragraph under H1) and `DirectorsClient.tsx:169` (in summary bar above the grid) both render `${totalDirectors} administrateur${...} actif${...}`. Identical phrasing twice on the same page.

**Classification:** **SHIP-NOW** — single-line removal, visible UX duplication on every load.

**SHIPPED 2026-05-22** via `34227a3` (deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn`): duplicate active-count removed from the summary bar; bar's outer conditional tightened from `{totalDirectors > 0 && (...)}` to `{totalDirectors > 0 && isCBCA && (...)}` so the bar collapses entirely for LSAQ tenants (it was solely the CBCA 25%-resident readout once the count line was dropped — preserves the regulatory badge for CBCA, removes the empty bar for LSAQ). Unused `Users` lucide-react import dropped (was the deleted count line's only consumer).

### B.2 Dirigeants — Replace modal preserves outgoing signing authority

**Evidence:** `components/officers/ReplaceOfficerModal.tsx:62-64` — `useState(officer.is_primary_signing_authority)`. Incoming officer inherits outgoing officer's signatory flag by default.

**Consideration:** Is this correct UX? In practice the *position* (e.g., Secretary) is what carries signing weight by board resolution; transferring it with the person may be exactly what we want, OR it may silently grant authority to a new person who shouldn't yet hold it. Either way, the badge is dead-state (A.4b), so the question is academic in production.

**Classification:** **ACCEPT** — pending A.4b resolution. If A.4b becomes load-bearing, revisit this default.

### B.3 Actionnaires — Edit modal "empty price" UX

**Evidence:** `components/shareholders/EditShareholdingModal.tsx:28-30`:
```
const [pricePerShare, setPricePerShare] = useState(
  shareholding.issue_price_per_share ? String(shareholding.issue_price_per_share) : ''
);
```
And input renders with `placeholder="1.00"` (line 153). When a shareholding was originally issued with no price (price is null), the field is empty with "1.00" as hint.

**UX read:** User who issued shares for $X may open Edit and see EMPTY price + "1.00" placeholder, leading to the assumption that the original price was lost. In fact: it's preserved if entered (`issue_price_per_share` is set), and it's correctly empty if not entered at issuance.

**Classification:** **ACCEPT** — by-design. Could be improved with an explicit "no price recorded" hint when the original was null, but not a correctness bug.

### B.4 Actionnaires — multi-holding card edits primary only

**Evidence:** `components/shareholders/ShareholderCard.tsx:168` — Edit button calls `onEdit(primary)` where `primary = shareholdings[0]`. If a person has multiple shareholdings (multiple classes / multiple cert numbers), only the first one is editable from the card.

**Classification:** **FOLLOW-UP** — known shortcoming when one person holds shares across multiple classes; visible in `shareholdings.length > 1` block at lines 138-150 (lists all but only first is editable). ATOM-3-OVERLAP candidate — entity-shareholder UI rebuild in Phase 10A.5 atom 3 likely scopes this.

---

## Task C — Share price persistence reconciliation (refines Queue Tier 1 #18)

**Question being resolved:** Is the per-share issue price actually captured + stored + reloaded? Tier 1 #18 (legacy framing) was ambiguous.

**Evidence (end-to-end):**

1. **Capture (issuance):** `components/shareholders/IssueSharesModal.tsx:47` declares `pricePerShare` state, defaults `''`. Lines 117-119: `const price = pricePerShare.trim() ? parseFloat(pricePerShare) : null`. Line 131: passed to RPC `create_shareholding_with_holders` as `issue_price_per_share: price`. UI: `$` prefix + placeholder `1.00` + helper text "Optionnel — utile pour les dossiers fiscaux" / "Optional — useful for tax records" (lines 261-276). Field is optional.

2. **Storage:** RPC param `issue_price_per_share` lands in the `shareholdings` table column of the same name (column exists per schema; passed through atom-2 RPC).

3. **Reload (edit):** `components/shareholders/EditShareholdingModal.tsx:28-30` reads `shareholding.issue_price_per_share` and prefills field. Line 59 saves: `issue_price_per_share: pricePerShare.trim() ? parseFloat(pricePerShare) : null`.

4. **Display (card):** `components/shareholders/ShareholderCard.tsx` — price is NOT displayed on the card surface. (Shows quantity, class, %, issue date, certificate number, "Aussi" roles. No price line.)

**Verdict:** Price IS captured AND IS persisted AND IS reloadable. The legacy Tier 1 #18 "price not stored" concern is **OUTDATED** and should be reframed:
- ✅ Persistence loop works.
- ⚠️ Price is not surfaced on ShareholderCard (display gap).
- ⚠️ Empty placeholder confusion when original was null (B.3, accepted).

**Classification:** Update Queue Tier 1 #18 — drop "not stored" assertion, narrow to "price not displayed on shareholder card and not surfaced in cap table or generated documents". **FOLLOW-UP** for display, no SHIP-NOW correctness fix needed.

---

## Task D — New Queue item (LOG ONLY, for next session triage)

### Proposed: "Lifecycle history → completeness scoring → document generation"

**Premise:** Today the people surfaces are current-state-only (A.1). To support a credible minute-book product, the same surfaces must:

1. **Capture history** — render past mandates/appointments/holdings as a timeline (Tier 1 feature).
2. **Score completeness** — flag gaps (e.g., "Director X has end_date but no end_reason"; "Officer Y was replaced without an active resolution document"; "Share issuance Z has no certificate number").
3. **Generate consequent documents** — completeness-driven trigger to render the corresponding board/shareholder resolutions OR upload-only requirement docs that close the gap.

**Dependency note (important):** Per `lib/pdf/generatePdfDocument.ts` REQUIREMENT_MAP (12 keys), today only 12 doctypes generate PDFs. Many lifecycle events (officer replacement, director resignation acceptance, share transfer) have NO matching template — they would generate as **`.txt`-only** placeholders or require new templates. **This is not just a UI feature, it's a content-design feature**.

**Tier suggestion:** Tier 1 (substantive feature work, post-launch). Should not block launch but is the load-bearing item for product credibility post-launch.

**Note:** ATOM-3-OVERLAP — the history-capable schema for entity-typed shareholders (joint holders, corporate trustees) is what Phase 10A.5 atom 3 enables. Atom 3 is a prerequisite for #3 (document generation) for shareholder events.

---

## Atom-3-overlap summary

The following findings will see partial or full resolution when Phase 10A.5 atom 3 (entity-shareholder UI rebuild) ships. Hold-or-defer rather than fix in isolation:

- **B.4** Multi-holding card edits primary only — atom 3 rebuilds ShareholderCard for joint/entity holders.
- **Task D #3** Document generation for shareholder lifecycle events — atom 3 supplies the data model.
- **A.1 (shareholders branch)** History pane for shareholders — natural fit alongside atom 3 UI rebuild.

Administrateurs + Dirigeants findings are **NOT** atom-3-blocked; they can move independently.

---

## Classification summary (theme → tier)

| ID | Finding | Classification | Notes |
|---|---|---|---|
| A.1 | No history (all 3 surfaces) | FOLLOW-UP | Tier 1 — see Task D |
| A.2 | Edit wires three different ways | NEXT-BUNDLE (interim SHIPPED) | Officer Edit hidden 2026-05-22 via `34227a3` (parity guard); convergence on real Edit modal stays NEXT-BUNDLE |
| A.3 | Incorporation-date default | FOLLOW-UP | Dom override — silent footgun for established companies; small cross-surface conditional fix |
| A.4a | Transfer button disabled | ACCEPT (tooltip-strip SHIPPED) | "(Sprint 7)" stripped from tooltip 2026-05-22 via `34227a3`; button remains disabled by design |
| A.4b | Signataire autorisé badge — pipeline dead | FOLLOW-UP | Q-OFFICER-SIG-1 #3 reconfirmed |
| A.5 | i18n leaks (all 3 surfaces + DashboardShell) | NEXT-BUNDLE | Fits Phase 1+2 bilingual audit |
| A.5a | "Propriétaire · Plan Pro" sidebar | SHIPPED 2026-05-22 via `34227a3` | Footer locale-aware via DashboardShell's ternary convention; broader A.5 sweep stays NEXT-BUNDLE |
| A.5b | Share-class lowercase forcing | SHIPPED 2026-05-22 via `34227a3` | `lowercase` class removed; user casing preserved |
| A.6 | Officer Remove lacks end_reason | FOLLOW-UP | Schema/parity decision |
| B.1 | Administrateurs duplicate count | SHIPPED 2026-05-22 via `34227a3` | Dedupe + bar conditional tightened to CBCA-only (preserves residency readout, drops empty bar for LSAQ) |
| B.2 | Replace inherits signing authority | ACCEPT | Pending A.4b resolution |
| B.3 | Edit empty-price hint | ACCEPT | By-design |
| B.4 | Multi-holding card edits primary only | FOLLOW-UP / ATOM-3-OVERLAP | Hold for atom 3 |
| C | Share price persistence | UPDATE #18 | Storage works; narrow finding to display gap |
| D | Lifecycle history → completeness → generate | NEW QUEUE ITEM | Tier 1, LOG only |

---

## Cursor advance (for Queue §19)

After this audit:
- Administrateurs — **re-audited** (no new fixes since 2026-05-12 audit; Q-EDIT-DIR-1 guard still in place; B.1 dedupe SHIPPED 2026-05-22 via `34227a3`)
- Dirigeants — **re-audited** (Edit-opens-Appoint still present; A.4b reconfirmed; A.2 interim Officer-Edit hide SHIPPED 2026-05-22 via `34227a3`)
- Actionnaires — **first full audit complete**; lifecycle row flipped `_TBD_` → `ACTIVE` 2026-05-22; A.4a tooltip-strip + A.5b casing-preserve SHIPPED via `34227a3`
- Cross-surface: A.5a DashboardShell footer locale-aware SHIPPED via `34227a3`
- People-surfaces sweep — **complete** (5 SHIP-NOW findings shipped in one bundle commit `34227a3`, deploy `dpl_4zqDsJGHyhpjWibqKgsMTDo72qMn`)
- Remaining audit cursor: Dashboard integration view (cross-surface read-out) as final integration check
