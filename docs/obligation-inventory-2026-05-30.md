# Enumerated obligation inventory (read-only) — catalog spec + lawyer agenda

**Date:** 2026-05-30
**HEAD at extraction:** `735ed98`
**Purpose:** Turn the readiness audit's *counts* (`audit-compliance-engine-readiness-2026-05-30.md`)
into the actual enumerated *list* of every document/obligation/event the compliance engine must
eventually track. This artifact doubles as (a) the catalog spec for the engine build and (b) the
lawyer-review agenda. **Read-only — no engine design, no catalog edits, no answering legal questions.**

**Sources reconciled (4):**
1. `minute_book_requirements` seed (`20260508204954_…`) — the live 25-key catalog (ground truth).
2. `docs/compliance-taxonomy-2026-04-28.md` — AFM/AC assignment for all 25 + the **16 event-based rules** (R1–R16, **spec only, unbuilt**).
3. `lib/compliance/calculateComplianceItems.ts` + `compliance_rules` seed (`20260330000000_…`) — the **deprecated** engine behind the live dashboard figure (+ `calculateDueDate`, `DOCUMENT_TYPE_TO_RULE`).
4. `lib/minute-book/event-completeness.ts` + `lib/pdf/lifecycle-templates.ts` — the **8 lifecycle docKeys** (built, scored via `event_documents`).

**Legend:** **AFM** = À faire maintenant (gov-enforced deadline) · **AC** = À corriger (structural/DD) ·
**Tracked:** ✅ shipped · ◐ partial · ○ roadmapped · ✗ not-modeled · **⚖️** = carries a legal question (Task 2).

---

## SECTION 1 — Foundational documents (16) · type = foundational doc · trigger = one-time / founding

Data source: `documents.requirement_key` (status='active', requirement_year IS NULL). All ✅ SHIPPED in catalog. Match = `requirement_key`.

| # | requirement_key | FR title | EN title | Cat | Fwk | Deadline (and where it lives) | ⚖️ |
|---|---|---|---|---|---|---|---|
| 1 | `lsaq_statuts_constitution` | Statuts de constitution | Articles of Incorporation | AC | LSA | none | |
| 2 | `cbca_certificate_incorporation` | Certificat de constitution | Certificate of Incorporation | AC | CBCA | none | |
| 3 | `cbca_articles_incorporation` | Statuts constitutifs (Formulaire 1) | Articles of Incorporation (Form 1) | AC | CBCA | none | |
| 4 | `lsaq_reglement_interieur` | Règlement intérieur (nº 1) | By-Law No. 1 | AC | LSA | none — *note `'autre'` VaultDocType gap* | |
| 5 | `cbca_bylaw_1` | Règlement intérieur (nº 1) | By-Law No. 1 | AC | CBCA | none | |
| 6 | `cbca_bylaw_2` | Règlement d'emprunt (nº 2) | Borrowing By-Law (No. 2) | AC | CBCA | none | |
| 7 | `lsaq_declaration_initiale` | Déclaration initiale (RE-200) | Initial Declaration (RE-200) | **AFM** | LSA | **≤ 60 days of incorporation** — *prose in description only, no column* | ⚖️ |
| 8 | `cbca_declaration_initiale_qc` | Déclaration initiale au Québec (RE-200) | Quebec Initial Declaration (RE-200) | **AFM** | CBCA | **≤ 60 days** — prose only | ⚖️ |
| 9 | `cbca_first_board_resolution` | Première résolution du conseil | First Board Resolution | AC | CBCA | none (generatable) | |
| 10 | `lsaq_premiere_resolution_ca` | Première résolution du conseil | First Board Resolution | AC | LSA | none (generatable) | |
| 11 | `cbca_first_shareholder_resolution` | Première résolution des actionnaires | First Shareholder Resolution | AC | CBCA | none (generatable) | |
| 12 | `lsaq_premiere_resolution_actionnaires` | Première résolution des actionnaires | First Shareholder Resolution | AC | LSA | none (generatable) | |
| 13 | `cbca_share_subscription` | Lettre de souscription d'actions | Share Subscription Letter | AC | CBCA | none — **genre fork open** (board-res vs subscriber letter, Tier 1 #18) | ⚖️ |
| 14 | `lsaq_souscription_actions` | Lettre de souscription d'actions | Share Subscription Letter | AC | LSA | none — **genre fork open** | ⚖️ |
| 15 | `cbca_director_acceptance` | Déclaration d'acceptation du mandat | Director Acceptance of Mandate | AC | CBCA | none — content asserts residency/eligibility | ⚖️ |
| 16 | `lsaq_acceptation_mandat` | Déclaration d'acceptation du mandat | Director Acceptance of Mandate | AC | LSA | none — content asserts residency/eligibility | ⚖️ |

---

## SECTION 2 — Annual obligations (9) · trigger = annual, once per active fiscal year

Data source: `documents.requirement_key` + `requirement_year`. Fires once per `company_fiscal_years.status='active'` year. All ✅ in catalog (scoring); **deadlines NOT computed by the completeness engine** (no due-date column). Rows 21–22 are **conditional**.

| # | requirement_key | FR title | EN title | Type | Cat | Fwk | Deadline (and where it lives) | ⚖️ |
|---|---|---|---|---|---|---|---|---|
| 17 | `lsaq_annual_board_resolution` | Résolution annuelle du conseil | Annual Board Resolution | annual | AC | LSA | 15-mo AGM (LSAQ art. 137) — *not modeled* | ⚖️ |
| 18 | `cbca_annual_board_resolution` | Résolution annuelle du conseil | Annual Board Resolution | annual | AC | CBCA | 15-mo (CBCA s.133) — not modeled | ⚖️ |
| 19 | `lsaq_annual_shareholder_resolution` | Résolution annuelle des actionnaires | Annual Shareholder Resolution | annual | AC | LSA | 15-mo (LSAQ art. 137) — not modeled | ⚖️ |
| 20 | `cbca_annual_shareholder_resolution` | Résolution annuelle des actionnaires | Annual Shareholder Resolution | annual | AC | CBCA | 15-mo (CBCA s.133) — not modeled | ⚖️ |
| 21 | `lsaq_auditor_waiver` | Dispense de vérificateur | Auditor Waiver Resolution | **conditional** | AC | LSA | **conditional: only if no auditor appointed** — condition not modeled | ⚖️ |
| 22 | `cbca_auditor_waiver` | Dispense de vérificateur (art. 163 LCSA) | Auditor Waiver Resolution (CBCA s.163) | **conditional** | AC | CBCA | conditional; cites **art. 163** (cf. art. 223/239 drift below) | ⚖️ |
| 23 | `cbca_annual_return` | Rapport annuel — Corporations Canada | Annual Return — Corporations Canada | annual gov filing | **AFM** | CBCA | **anniversary month of incorporation** — prose in description; `calculateDueDate` computes it for the *deprecated* key | ⚖️ |
| 24 | `lsaq_req_annual_update` | Mise à jour annuelle au REQ | REQ Annual Update | annual gov filing | **AFM** | LSA | annual REQ deadline — prose only | ⚖️ |
| 25 | `cbca_req_annual_update_qc` | Mise à jour annuelle au REQ (féd. au QC) | REQ Annual Update (Federal corp in QC) | annual gov filing | **AFM** | CBCA | annual REQ deadline — prose only; **no deprecated-engine counterpart** | ⚖️ |

**Catalog totals: 25 rows = 16 foundational + 9 annual; 11 LSA + 14 CBCA; 5 AFM + 20 AC** (AFM = rows 7, 8, 23, 24, 25).

---

## SECTION 3 — Lifecycle events (8 docKeys) · type = lifecycle event · trigger = on-event, post-founding

Built: capture + score (`event-completeness.ts`) + generate (`lifecycle-templates.ts`). Data source: `event_documents` link on `(event_type, event_id, event_phase)`. **No requirement_key catalog rows** — scored by the event engine, not the requirement engine. Satisfaction = *a document is linked* (not instrument-/deadline-correct).

| # | docKey | FR title | EN title | Event (type · phase) | Instrument | Trigger | Tracked | ⚖️ |
|---|---|---|---|---|---|---|---|---|
| 26 | `director_appointment` | Nomination d'un administrateur | Director appointment | director_mandate · appointment | board | `appointment_date > incorporation` | ◐ (gen = Brief 2c, deferred) | ⚖️ |
| 27 | `director_departure` | Départ d'un administrateur | Director departure | director_mandate · departure | board | `end_date` present | ✅ | ⚖️ |
| 28 | `director_removal` | Révocation d'un administrateur | Director removal | director_mandate · departure | **shareholder** | `end_reason='revocation'` | ✅ | ⚖️ |
| 29 | `officer_appointment` | Nomination d'un dirigeant | Officer appointment | officer_appointment · appointment | board | `appointment_date > incorporation` | ◐ (gen = Brief 2c) | ⚖️ |
| 30 | `officer_departure` | Départ d'un dirigeant | Officer departure | officer_appointment · departure | board | `end_date` present | ✅ | ⚖️ |
| 31 | `share_issuance` | Émission d'actions | Share issuance | shareholding · issuance | board | `issue_date > incorporation` | ✅ | ⚖️ |
| 32 | `share_cessation` | Cessation d'actions | Share cessation | shareholding · cessation | board | `end_date` & `end_reason≠transfer` | ✅ | ⚖️ |
| 33 | `share_transfer` | Transfert d'actions | Share transfer | share_transfer · transfer | board | `share_transfers` row | ✅ (ind-to-ind); entity/joint ○ (Atom 3-gated) | ⚖️ |

⚖️ all 8: template wording + statutory citations + board-vs-shareholder instrument choice flow through the **Q1 batched lawyer review** (engineering builds against placeholders).

---

## SECTION 4 — Event-based compliance rules R1–R16 (`compliance-taxonomy-2026-04-28.md`, **SPEC ONLY — UNBUILT**)

These are "missing-authorizing-document" detections, **not** in any code. The built `event-completeness.ts` is a *different* mechanism (link existence over 8 docKeys), and approximates only R2/R4/R9/R11 (departure/cessation/transfer "has a linked doc"), never the temporal-proximity / corporate-change / count / NEQ rules. Distribution per spec: **4 AFM / 12 AC.**

| # | Rule ID | What it detects | Cat | Trigger source | Implied document | Tracked | ⚖️ |
|---|---|---|---|---|---|---|---|
| R1 | `director_appointment_no_acceptance` | director active, no acceptance form | AC | `director_mandates` + `documents` | `*_acceptation_mandat` (#15/16) | ✗ (needs S10-TR-13) | ⚖️ |
| R2 | `director_removal_no_resolution` | director ended, no authorizing res | AC | `director_mandates.end_date` + temporal-proximity | board/shareholder res | ◐ (link-only via #27/28) | ⚖️ |
| R3 | `officer_appointment_no_resolution` | officer active, not covered by a board res | AC | `officer_appointments` + temporal-proximity | board res | ✗ | ⚖️ |
| R4 | `officer_termination_no_resolution` | officer ended, no authorizing res | AC | `officer_appointments.end_date` | board res | ◐ (link-only via #30) | ⚖️ |
| R5 | `director_count_out_of_range` | active director count < min or > max | AC | **`companies.director_min`/`director_max` (do not exist)** | appt/removal res or amended articles | ✗ not-modeled | ⚖️ |
| R6 | `shareholding_no_subscription` | issuance, no subscription letter | AC | `shareholdings` (source≠transfer) | `*_souscription` (#13/14) | ✗ | ⚖️ |
| R7 | `shareholding_no_certificate` | issuance, no share certificate | AC | `shareholdings` | share certificate (**no catalog key**) | ✗ | ⚖️ |
| R8 | `shareholding_no_board_resolution` | issuance, not covered by board res | AC | `shareholdings` + temporal-proximity | board res | ◐ (link-only via #31) | ⚖️ |
| R9 | `share_transfer_no_resolution` | transfer, no authorizing res | AC | `share_transfers` + temporal-proximity | board res | ◐ (link-only via #33) | ⚖️ |
| R10 | `share_transfer_no_new_certificate` | transfer, no reissued certificate | AC | `share_transfers` | new share certificate | ✗ | ⚖️ |
| R11 | `shareholding_cancellation_no_resolution` | cancellation, no authorizing res | AC | `shareholdings.end_reason='cancelled'` | board res | ◐ (link-only via #32) | ⚖️ |
| R12 | `legal_name_change_no_compliance` | name change, no special res + gov filing | **AFM** | **`activity_log` `company_legal_name_changed` (unemitted)** | special shareholder res + amended articles + REQ Avis / CBCA Form 4 | ✗ not-modeled | ⚖️ |
| R13 | `address_change_no_filing` | office address change, no gov filing | **AFM** | **`activity_log` `company_address_changed` (unemitted)** | REQ Avis + CBCA Form 3 | ✗ not-modeled | ⚖️ |
| R14 | `fiscal_year_change_no_resolution` | FY-end change, no board res | AC | **`activity_log` `fiscal_year_end_changed` (unemitted)** | board res | ✗ not-modeled | ⚖️ |
| R15 | `share_class_added_no_amendment` | post-incorp class added, no amendment | **AFM** | `share_classes.created_at` vs incorporation+30d | special shareholder res + amended articles + filing | ✗ not-modeled | ⚖️ |
| R16 | `neq_missing_post_onboarding` | onboarding done, `companies.neq` null | **AFM** | `companies.neq` (data exists) | REQ registration confirmation | ✗ (computable, no rule) | ⚖️ |

---

## SECTION 5 — Deprecated `compliance_rules` (the LIVE dashboard figure today)

10 seed rows (5 LSA + 5 CBCA), all `frequency='annual'`, each with `legal_reference`. Due-dates by `calculateDueDate`; satisfied-match by `DOCUMENT_TYPE_TO_RULE` (document_type → rule_key, **not** requirement_key). This is the engine the figure-audit flagged for teardown.

| rule_key | Fwk | legal_reference (as seeded) | `calculateDueDate` formula | Doc match (`DOCUMENT_TYPE_TO_RULE`) | ⚖️ |
|---|---|---|---|---|---|
| `annual_board_resolution` | LSA / CBCA | art. 93 / 114 | FY-end + 6 mo | `resolution` ✓ | ⚖️ |
| `annual_shareholder_resolution` | LSA / CBCA | art. 104 / 133 | FY-end + 6 mo | `pv` ✓ | ⚖️ |
| `annual_financial_statements` | LSA / CBCA | art. 214 / 155 | FY-end + 6 mo | `rapport` ✓ | ⚖️ |
| `req_annual_update` | LSA only | Loi sur la publicité légale | FY-end + 4 mo, day 15 | `statuts` ✓ | ⚖️ |
| `corporations_canada_annual_return` | CBCA only | art. 263 | incorporation anniversary | — **(unmappable → never compliant)** | ⚖️ |
| `auditor_waiver` | LSA / CBCA | **art. 223** / 163 | FY-end + 6 mo (default) | — **(unmappable → never compliant)** | ⚖️ |

---

## TASK 2 — Lawyer-gate agenda (the legal questions this doc surfaces)

Every ⚖️ row above flags a point where **completeness or correctness is a legal question**. Consolidated agenda (do **not** answer here):

**Deadlines (are the due-date rules legally correct?)**
1. Initial declaration RE-200 **60-day** window (rows 7, 8).
2. Corporations Canada annual return **anniversary-month** (row 23).
3. REQ annual update deadline, LSA + CBCA-in-QC (rows 24, 25).
4. Annual resolutions **15-month AGM** deadline + whether that makes them AFM not AC (rows 17–20).
5. The deprecated `calculateDueDate` formulas (FY-end+6mo / FY-end+4mo-day15 / anniversary) — correct per obligation? (Section 5).

**Conditional / classification**
6. Auditor-waiver **scope & condition** — all corps or only non-public-offering; conditional on not appointing an auditor (rows 21, 22).
7. **Citation drift** — auditor waiver: `compliance_rules` says **art. 223**, catalog says **art. 239**, CBCA row says **s.163**. Which is authoritative? (rows 22, Section 5).
8. AFM-vs-AC **principle soundness** — "active government enforcement only" → AFM; confirm per obligation (whole taxonomy §2.3).

**Instrument / document correctness**
9. Director removal: board vs **shareholder** resolution (LSAQ art. 144 / CBCA s.109) — row 28, R2.
10. Share-event instruments: issuance / cessation / transfer — board-only, shareholder-only, or dual (rows 31–33, R8/R9/R11).
11. Subscription **genre fork**: subscriber-signed letter vs board authorizing resolution (rows 13, 14, R6).
12. Lifecycle template **wording + statutory citations** for all 8 docKeys (rows 26–33; Q1 batch).
13. Corporate-change required filings — exactly what each triggers (REQ Avis de modification; CBCA Form 3/4; special shareholder resolution + amended articles) — R12, R13, R15.

**Completeness of the set**
14. Is the **25-key catalog the complete obligation set** for a QC LSA / CBCA small corp? Anything missing?
15. Are the **16 event rules** the complete event-obligation set? (spec §0 says "non-exhaustive by design").
16. **`annual_financial_statements`** — required obligation? (in `compliance_rules`, **absent from the catalog** — see GAP-A).
17. Director-acceptance content (residency/eligibility declaration) legally sufficient (rows 15, 16).
18. Temporal-proximity (±90d) for "a covering resolution" — legally meaningful or arbitrary? (R2/R3/R4/R8/R9/R11).

**Lawyer-gate tally:** **47 of the 49 enumerated rows carry a ⚖️** (the only non-flagged rows are the plain articles/by-laws/first-resolutions whose existence is settled — though the *set's* completeness, Q14, still touches them). Consolidated into **18 distinct legal questions** above.

---

## TASK 3 — Coverage gaps (where sources disagree → silent under/over-count)

Plainly, the obligations that appear in one source but not another:

- **GAP-A — `annual_financial_statements` is in `compliance_rules` (both frameworks) but has NO catalog `requirement_key`.** The completeness engine (and the unified Complétude score) **never scores financial statements**; the deprecated dashboard figure does. → The two figures count a different obligation set. **Under-count in the catalog.**
- **GAP-B — `declaration_initiale` (RE-200, the 60-day AFM filing, rows 7/8) is in the catalog but NOT in `compliance_rules`.** The deprecated dashboard figure **never scores the initial declaration**, even though it's the single hardest AFM deadline. **Under-count in the deprecated engine.**
- **GAP-C — `cbca_req_annual_update_qc` (row 25) is in the catalog but absent from `compliance_rules`** (which only carries LSA `req_annual_update`). CBCA-in-QC corps' REQ obligation is invisible to the deprecated figure.
- **GAP-D — key-vocabulary mismatch.** Catalog uses framework-prefixed keys (`lsaq_annual_board_resolution`); `compliance_rules` uses bare keys (`annual_board_resolution`) matched by **document_type** (`resolution`/`pv`/`rapport`/`statuts`), not `requirement_key`. **No clean 1:1 crosswalk** — the same obligation is identified two incompatible ways.
- **GAP-E — the 16-rule spec (R1–R16) is entirely unbuilt.** The built `event-completeness.ts` covers only 8 lifecycle docKeys by *link existence*, approximating R2/R4/R9/R11 at best. The **corporate-change (R12–R15), count-range (R5), NEQ (R16), acceptance (R1), certificate (R7/R10), and subscription/board-res (R6/R8) rules are not modeled at all.** An engine claiming "obligation coverage" while omitting these reads as coverage without being it.
- **GAP-F — deadlines live as prose, not data.** Catalog deadlines (60-day declaration, anniversary return) are in `description_fr/en` text with **no due-date column**; `calculateDueDate` computes deadlines only for its own 6 deprecated keys, with formulas that don't map onto the catalog's prose. AFM "deadline" obligations therefore have **no computable deadline in the live catalog**.
- **GAP-G — lifecycle docKeys (8) have no catalog rows.** Director/officer/share events are scored via `event_documents` only; the taxonomy's R1/R3/R6/R8 name catalog keys (acceptance, subscription) as their "implied document," but the engines don't connect requirement_key satisfaction to event satisfaction.
- **GAP-H — missing data sources block 5 rules outright.** `companies.director_min/max` (R5), three `activity_log` event_types `company_legal_name_changed`/`company_address_changed`/`fiscal_year_end_changed` (R12/R13/R14), and post-incorp `share_classes.created_at` detection (R15) **do not exist** — these obligations cannot fire until schema/hooks land.
- **GAP-I — unmappable deprecated rules.** `auditor_waiver` and `corporations_canada_annual_return` have no `DOCUMENT_TYPE_TO_RULE` entry → structurally **never compliant** in the live figure (carried from `audit-dashboard-figures-2026-05-30.md` D1b).

---

## REPORT-BACK SUMMARY

- **Total enumerated: 49 distinct obligations/events/rules** = **25 catalog** (16 foundational + 9 annual) + **8 lifecycle docKeys** + **16 event-based spec rules (R1–R16)**. *(Plus the deprecated `compliance_rules` set of 6 distinct keys × frameworks, which overlaps the catalog and is the live-figure source, not new obligations.)*
- **Breakdown by type:** foundational doc **16** · annual obligation **7** (rows 17–20, 23–25) · conditional obligation **2** (auditor waivers) · lifecycle event **8** · event-based / corporate-change rule **16**.
- **By category (catalog):** 5 AFM / 20 AC. **By category (event rules):** 4 AFM / 12 AC.
- **Tracked today:** catalog 25 ✅ scored (deadlines ✗) · lifecycle 6/8 ✅ + 2 ◐ (appointment-gen deferred) · event rules R1–R16 ✗ unbuilt (4 ◐ link-only approximations).
- **Lawyer-gate count: 47 of 49 rows flagged ⚖️, consolidated into 18 distinct legal questions** (deadlines, conditional/classification, instrument/document correctness, set-completeness).
- **Coverage gaps: 9 (GAP-A … GAP-I)** — headline: `annual_financial_statements` in the deprecated engine but **not the catalog** (A); the 60-day initial declaration in the catalog but **not the deprecated figure** (B); the entire **16-rule spec unbuilt** (E); deadlines exist only as **prose, not data** (F); 5 rules **blocked on missing data sources** (H).

*Read-only enumeration + gap-flagging. No engine design, no catalog edits, no legal answers.*
