# FR PDF inspection findings — droussy inc. annual shareholder resolution FY 2026

**Date:** April 29, 2026 (evening session, Dom + Max)
**Source:** PDF inspection of generated annual shareholder resolution, droussy inc. fiscal year 2026.
**Status:** Captured for reference. F1-F8 classification + Phase mapping live in `docs/audit-template-architecture-phase1-2026-04-29.md` Section 6.
**Purpose:** Standalone source-of-truth for the F1-F8 findings so future sessions don't hit the same source gap (the list was previously embedded in v3.27 memory + session transcript only).

---

## Findings

### F1 — High — Footer generation date is wrong
"Généré le 2026-12-31" footer date is wrong. Label/variable mismatch — likely shows fiscal year end, mislabeled as generation timestamp.

### F2 — Medium — Singular FR header with multiple signatories
"ACTIONNAIRE" header is singular but two shareholders are listed. FR plural agreement broken.

### F3 — Medium / Architectural — Bilingual share class name in FR PDF
Share class name shows both languages inline ("Actions ordinaires / Common Shares") in FR-only PDF.

### F4 — Medium — Sparse body text on shareholder annual resolution
Body text sparse for shareholder annual resolution. Missing director election/re-election, officer confirmation, "in lieu of meeting" Art. 354 statement, statutory authority reference.

### F5 — Low — Confidentiality footer mismatch for signed documents
"Confidentiel — Usage interne" footer fits poorly for a doc shareholders sign.

### F6 — Low — No statutory reference in body
No statutory reference (LSAQ article) in body.

### F7 — Low — No artifact-level audit trail
No document ID, version, or generation timestamp on PDF (no audit trail in artifact itself).

### F8 — Open question — Auditor waiver placement
Auditor waiver section embedded in annual shareholder resolution — but `lsaq_auditor_waiver` exists as separate seeded requirement key. Is the waiver embedded, separate, or both? Dom decision needed before Phase 2.

---

End of findings record.
