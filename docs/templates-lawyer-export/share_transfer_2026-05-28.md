# Share Transfer — Lawyer Review Package

**Date:** 2026-05-28
**Status:** Draft — pending legal review
**Source:** `lib/pdf/lifecycle-templates.ts` (`LIFECYCLE_TEMPLATES.share_transfer`) + `lib/pdf/generate-lifecycle-document.ts` (orchestrator arm `event_type === 'share_transfer'`)
**Framework:** LSA + CBCA (single body, framework-neutral)
**Instrument:** Board resolution

---

## Purpose

Board resolution acknowledging a completed individual-to-individual full share transfer between two persons. The resolution is generated AFTER the transfer event has been captured: the RPC `transfer_shares` runs a 5-statement atomic mutation (end source shareholding with `end_reason='transfer'`, create destination shareholding preserving original `issue_date`, wire destination holder, insert `share_transfers` row, log activity). The board's role here is to formally acknowledge the past event and direct the corporation's registers to be updated accordingly.

v1 scope locks (enforced by `transfer_shares` RPC + mirrored client-side for clear errors):

- Individual-to-individual only (no joint, no entity holders)
- Full quantity transfer only (destination inherits source's `quantity`)
- Same share class implied (destination inherits source's `share_class_id`)
- Optional free-form TEXT consideration
- Founding-cohort allowed (no `> incorporation_date` predicate)
- Transfer date in `[source.issue_date, CURRENT_DATE]`

---

## Required variables

| Token                 | Source                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `companyName`         | `companies.legal_name_fr`                                              |
| `neqClause`           | engine-composed from `companies.neq` (`" (NEQ : <neq>)"` or `""`)      |
| `transferorName`      | `holderName(from_shareholding.shareholding_holders)`                   |
| `transfereeName`      | `holderName(to_shareholding.shareholding_holders)`                     |
| `quantity`            | `share_transfers.quantity_transferred`                                 |
| `shareClassName`      | `from_shareholding.share_classes.name`                                 |
| `transferDate`        | `share_transfers.transfer_date` (caller-side formatted, locale-aware)  |
| `considerationClause` | caller-composed: FR `" en contrepartie de <x>"` / EN `" for consideration of <x>"` / `""` when null |
| `resolutionDate`      | TODAY at PDF generation time (§8.45 present-day-acknowledgment)        |

---

## French body

```
{{companyName}}{{neqClause}}

RÉSOLUTION DU CONSEIL D'ADMINISTRATION
RECONNAISSANT UN TRANSFERT D'ACTIONS

ATTENDU QUE {{transferorName}} a transféré {{quantity}} action(s) de catégorie {{shareClassName}} à {{transfereeName}} en date du {{transferDate}}{{considerationClause}};

ATTENDU QUE le conseil d'administration souhaite reconnaître ce transfert et mettre à jour les registres de la société en conséquence;

IL EST RÉSOLU :

1. QUE le transfert de {{quantity}} action(s) de catégorie {{shareClassName}} de {{transferorName}} à {{transfereeName}}, en date du {{transferDate}}, soit reconnu;

2. QUE le registre des actionnaires de la société soit mis à jour pour refléter ce transfert;

3. QUE tout dirigeant de la société soit autorisé à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.
```

---

## English body

```
{{companyName}}{{neqClause}}

BOARD RESOLUTION
ACKNOWLEDGING A SHARE TRANSFER

WHEREAS {{transferorName}} transferred {{quantity}} share(s) of class {{shareClassName}} to {{transfereeName}} on {{transferDate}}{{considerationClause}};

WHEREAS the board of directors wishes to acknowledge this transfer and update the company's registers accordingly;

IT IS RESOLVED:

1. THAT the transfer of {{quantity}} share(s) of class {{shareClassName}} from {{transferorName}} to {{transfereeName}}, on {{transferDate}}, be acknowledged;

2. THAT the company's shareholder register be updated to reflect this transfer;

3. THAT any officer of the company be authorized to sign any document necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.
```

---

## Notes for review

1. **Present-day acknowledgment (§8.45).** `resolutionDate` is "today" at the moment of PDF generation, NOT the same as `transferDate`. Two distinct dates render in the same document. The board is acknowledging a past event in a present-day resolution. This is intentional — the alternative (backdating the resolution to the transfer date) would misrepresent when the board actually met. Please confirm the FR `Adoptée le` / EN `Adopted on` phrasing reads correctly with a present-day date acknowledging a past event date.

2. **`considerationClause` renders empty for nominal / no-consideration transfers.** When the user enters no consideration in the modal, the clause becomes empty string and the sentence reads `"...en date du {{transferDate}};"` with no trailing phrase. The line-end semicolon handles closure cleanly without any whitespace stripping. Legal acceptable shape for unrecorded consideration, or should the absence be made explicit (e.g., `à titre gratuit` / `for no consideration`)?

3. **Source preservation in destination.** The destination `shareholdings` row PRESERVES the source's `issue_date` (the transfer is recorded as a separate event in `share_transfers`; the original issuance is unchanged). The destination row carries `source = 'transfer'` for provenance. The original `share_transfers` row + the ended source `shareholdings` row + the new destination `shareholdings` row together form an immutable audit trail of the transfer.

4. **Same-class implied.** v1 lock: destination inherits source's `share_class_id`. The resolution body uses `{{shareClassName}}` (singular) consistently. v2 multi-class partial transfers would require a different template shape.

5. **No statutory cite.** The body does not cite specific LSA/CBCA sections governing share transfer (LSA s.66 / CBCA s.49). If a cite is wanted, please indicate which sub-section is most appropriate for a board's acknowledgment role (vs. the transfer mechanics themselves, which the act and the by-laws govern independently).

6. **End-reason on source = `transfer`.** The source `shareholdings` row's `end_reason` is set to `'transfer'` by the RPC (admitted by `shareholdings_end_reason_check`). This is mechanically distinct from cessation reasons (`redemption`, `cancellation`, `conversion`) and is what the engine uses to suppress double-counting in the completeness view (so a transferred shareholding does not show up as both a cessation act AND a transfer act in the same fiscal year). Confirm `transfer` is the correct vocabulary for the end-reason audit semantics?
