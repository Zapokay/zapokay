# #19d Share-Issuance — service-role probe (WA #15 script path, multi-holding)

- company: aceaceac-0000-4000-8000-000000000002
- resolutionDate: 2026-05-27
- RUN TIMESTAMP: 2026-05-27T20:44:01.337Z

## Fixture enumeration
  Acme incorporation_date: 2018-04-17
- total eligible: 2
  - 03c1ee06-fd04-4df6-8f00-bb0fc38f76c5 — qty=100, issue_date=2024-03-15, price=0.15, class=Catégorie A — Actions ordinaires, holder=Bobby Brown
  - 6e840e63-423d-4b39-9f94-10ebb5e66050 — qty=50, issue_date=2024-06-22, price=0, class=Catégorie A — Actions ordinaires, holder=Tobee Town

────────────────────────────────────────────────────────────────
# Processing holding 03c1ee06-fd04-4df6-8f00-bb0fc38f76c5
  qty=100 issue_date=2024-03-15 price=0.15

  --- Generation 1 — language=fr ---
    documentId=78768022-d402-4b06-92e5-266485d87189
    fileName=78768022-d402-4b06-92e5-266485d87189.pdf
    ✓ FR body fragment 1 — found "est par les présentes constatée et ratifiée"
    ✓ FR body fragment 2 (effective) — found "prenant effet le"
    ✓ FR body fragment 3 (adopted) — found "Adoptée le"
    ✓ effectiveDate rendered via formatDate (locale=fr) — found "15 mars 2024"
    ✓ resolutionDate rendered via formatDate (locale=fr) — found "27 mai 2026"
    ✓ price phrase present (issue_price_per_share=0.15) — found "au prix de"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Bobby Brown"
    ✓ quantity rendered — found "100"
    ✓ no residual {{token}} placeholders in body — clean

  --- Generation 2 — language=en ---
    documentId=d869b7cc-f7c8-49b9-a53a-1042238908ba
    fileName=d869b7cc-f7c8-49b9-a53a-1042238908ba.pdf
    ✓ EN body fragment 1 — found "is hereby acknowledged and ratified"
    ✓ EN body fragment 2 (effective) — found "effective"
    ✓ EN body fragment 3 (adopted) — found "Adopted on"
    ✓ effectiveDate rendered via formatDate (locale=en) — found "March 15, 2024"
    ✓ resolutionDate rendered via formatDate (locale=en) — found "May 27, 2026"
    ✓ price phrase present (issue_price_per_share=0.15) — found "at a price of"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Bobby Brown"
    ✓ quantity rendered — found "100"
    ✓ no residual {{token}} placeholders in body — clean

  --- Generation 3 — language=fr ---
    documentId=84b92bd1-019d-4983-8d7c-a9bc97942b68
    fileName=84b92bd1-019d-4983-8d7c-a9bc97942b68.pdf
    ✓ FR body fragment 1 — found "est par les présentes constatée et ratifiée"
    ✓ FR body fragment 2 (effective) — found "prenant effet le"
    ✓ FR body fragment 3 (adopted) — found "Adoptée le"
    ✓ effectiveDate rendered via formatDate (locale=fr) — found "15 mars 2024"
    ✓ resolutionDate rendered via formatDate (locale=fr) — found "27 mai 2026"
    ✓ price phrase present (issue_price_per_share=0.15) — found "au prix de"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Bobby Brown"
    ✓ quantity rendered — found "100"
    ✓ no residual {{token}} placeholders in body — clean

  Newest-wins (§8.55) — event_documents DESC by created_at:
    2026-05-27T20:44:32.593638+00:00  document_id=84b92bd1-019d-4983-8d7c-a9bc97942b68
    2026-05-27T20:44:20.118164+00:00  document_id=d869b7cc-f7c8-49b9-a53a-1042238908ba
    2026-05-27T20:44:12.576112+00:00  document_id=78768022-d402-4b06-92e5-266485d87189
    2026-05-27T20:23:02.957721+00:00  document_id=0a21f0cb-8d52-45b7-af10-55c6e8ef4866
    2026-05-27T20:23:00.454545+00:00  document_id=9ec497d6-a972-46eb-939f-a3e74f87c20e
    2026-05-27T20:22:57.137539+00:00  document_id=32d5b07a-09ee-4759-9732-e76a20a15331
    2026-05-27T20:14:26.054135+00:00  document_id=53cdc617-a9a7-48f7-80f6-e53730c32612
    ✓ newest row → Generation 3 (documentId=84b92bd1-019d-4983-8d7c-a9bc97942b68)

────────────────────────────────────────────────────────────────
# Processing holding 6e840e63-423d-4b39-9f94-10ebb5e66050
  qty=50 issue_date=2024-06-22 price=0

  --- Generation 1 — language=fr ---
    documentId=14aa02bb-f61c-4c8e-8151-5c74ca449e72
    fileName=14aa02bb-f61c-4c8e-8151-5c74ca449e72.pdf
    ✓ FR body fragment 1 — found "est par les présentes constatée et ratifiée"
    ✓ FR body fragment 2 (effective) — found "prenant effet le"
    ✓ FR body fragment 3 (adopted) — found "Adoptée le"
    ✓ effectiveDate rendered via formatDate (locale=fr) — found "22 juin 2024"
    ✓ resolutionDate rendered via formatDate (locale=fr) — found "27 mai 2026"
    ✓ price phrase ABSENT (issue_price_per_share=0) — did not find "au prix de"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Tobee Town"
    ✓ quantity rendered — found "50"
    ✓ no residual {{token}} placeholders in body — clean

  --- Generation 2 — language=en ---
    documentId=19e64c8b-a820-4341-8ba5-6fd3f34fa0e6
    fileName=19e64c8b-a820-4341-8ba5-6fd3f34fa0e6.pdf
    ✓ EN body fragment 1 — found "is hereby acknowledged and ratified"
    ✓ EN body fragment 2 (effective) — found "effective"
    ✓ EN body fragment 3 (adopted) — found "Adopted on"
    ✓ effectiveDate rendered via formatDate (locale=en) — found "June 22, 2024"
    ✓ resolutionDate rendered via formatDate (locale=en) — found "May 27, 2026"
    ✓ price phrase ABSENT (issue_price_per_share=0) — did not find "at a price of"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Tobee Town"
    ✓ quantity rendered — found "50"
    ✓ no residual {{token}} placeholders in body — clean

  --- Generation 3 — language=fr ---
    documentId=f810e630-6c37-4706-b0f0-a08ab2eec1cd
    fileName=f810e630-6c37-4706-b0f0-a08ab2eec1cd.pdf
    ✓ FR body fragment 1 — found "est par les présentes constatée et ratifiée"
    ✓ FR body fragment 2 (effective) — found "prenant effet le"
    ✓ FR body fragment 3 (adopted) — found "Adoptée le"
    ✓ effectiveDate rendered via formatDate (locale=fr) — found "22 juin 2024"
    ✓ resolutionDate rendered via formatDate (locale=fr) — found "27 mai 2026"
    ✓ price phrase ABSENT (issue_price_per_share=0) — did not find "au prix de"
    ✓ share class token rendered — found "Catégorie A — Actions ordinaires"
    ✓ holder name rendered — found "Tobee Town"
    ✓ quantity rendered — found "50"
    ✓ no residual {{token}} placeholders in body — clean

  Newest-wins (§8.55) — event_documents DESC by created_at:
    2026-05-27T20:45:05.815506+00:00  document_id=f810e630-6c37-4706-b0f0-a08ab2eec1cd
    2026-05-27T20:44:54.686183+00:00  document_id=19e64c8b-a820-4341-8ba5-6fd3f34fa0e6
    2026-05-27T20:44:40.138893+00:00  document_id=14aa02bb-f61c-4c8e-8151-5c74ca449e72
    2026-05-27T20:23:10.372916+00:00  document_id=8b729101-5519-4ce8-bdee-a316c9f8baaf
    2026-05-27T20:23:07.734218+00:00  document_id=e51dfe9e-867c-422e-8b47-79561b30fca5
    2026-05-27T20:23:05.303564+00:00  document_id=3f44d331-b1c9-429e-8ea3-8a5c196b6b91
    ✓ newest row → Generation 3 (documentId=f810e630-6c37-4706-b0f0-a08ab2eec1cd)

────────────────────────────────────────────────────────────────
# Per-holding reports

## Holding 03c1ee06-fd04-4df6-8f00-bb0fc38f76c5 — 100 shares, issued 2024-03-15, price 0.15
- share_class: Catégorie A — Actions ordinaires
- holder: Bobby Brown
- branch exercised: PRICED

### Generation 1 — FR — documentId=78768022-d402-4b06-92e5-266485d87189
fileName: 78768022-d402-4b06-92e5-266485d87189.pdf
```
Acme Test inc.
NEQ 1234567890
Résolution du conseil — Émission d'actions
IL EST RÉSOLU QUE :
1. Résolution du conseil — Émission d'actions
RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE Acme Test inc. (NEQ : 1234567890)
RÉSOLU QUE l'émission de 100 action(s) de Catégorie A — Actions ordinaires à Bobby
Brown au prix de 0,15 $ par action, prenant effet le 15 mars 2024, est par les présentes
constatée et ratifiée par le conseil d'administration de la société. Adoptée le 27 mai 2026.
ADMINISTRATEUR
Sophie Tremblay
Administrateur
Date: _______________
Marc Lefebvre
Administrateur
Date: _______________
Résolution du conseil — Émission d'actions 	Acme Test inc. — Confidentiel — Usage interne 	Généré le 27 mai 2026

-- 1 of 1 --


```
Assertions:
- PASS — FR body fragment 1 (found "est par les présentes constatée et ratifiée")
- PASS — FR body fragment 2 (effective) (found "prenant effet le")
- PASS — FR body fragment 3 (adopted) (found "Adoptée le")
- PASS — effectiveDate rendered via formatDate (locale=fr) (found "15 mars 2024")
- PASS — resolutionDate rendered via formatDate (locale=fr) (found "27 mai 2026")
- PASS — price phrase present (issue_price_per_share=0.15) (found "au prix de")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Bobby Brown")
- PASS — quantity rendered (found "100")
- PASS — no residual {{token}} placeholders in body (clean)

### Generation 2 — EN — documentId=d869b7cc-f7c8-49b9-a53a-1042238908ba
fileName: d869b7cc-f7c8-49b9-a53a-1042238908ba.pdf
```
Acme Test inc.
NEQ 1234567890
Board resolution — Share issuance
IT IS RESOLVED THAT:
1. Board resolution — Share issuance
RESOLUTION OF THE BOARD OF DIRECTORS OF Acme Test inc. (NEQ : 1234567890)
RESOLVED THAT the issuance of 100 share(s) of Catégorie A — Actions ordinaires to
Bobby Brown at a price of $0.15 per share, effective March 15, 2024, is hereby
acknowledged and ratified by the board of directors of the corporation. Adopted on May
27, 2026.
DIRECTOR
Sophie Tremblay
Director
Date: _______________
Marc Lefebvre
Director
Date: _______________
Board resolution — Share issuance 	Acme Test inc. — Confidential — Internal Use 	Generated on May 27, 2026

-- 1 of 1 --


```
Assertions:
- PASS — EN body fragment 1 (found "is hereby acknowledged and ratified")
- PASS — EN body fragment 2 (effective) (found "effective")
- PASS — EN body fragment 3 (adopted) (found "Adopted on")
- PASS — effectiveDate rendered via formatDate (locale=en) (found "March 15, 2024")
- PASS — resolutionDate rendered via formatDate (locale=en) (found "May 27, 2026")
- PASS — price phrase present (issue_price_per_share=0.15) (found "at a price of")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Bobby Brown")
- PASS — quantity rendered (found "100")
- PASS — no residual {{token}} placeholders in body (clean)

### Generation 3 — FR — documentId=84b92bd1-019d-4983-8d7c-a9bc97942b68
fileName: 84b92bd1-019d-4983-8d7c-a9bc97942b68.pdf
```
Acme Test inc.
NEQ 1234567890
Résolution du conseil — Émission d'actions
IL EST RÉSOLU QUE :
1. Résolution du conseil — Émission d'actions
RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE Acme Test inc. (NEQ : 1234567890)
RÉSOLU QUE l'émission de 100 action(s) de Catégorie A — Actions ordinaires à Bobby
Brown au prix de 0,15 $ par action, prenant effet le 15 mars 2024, est par les présentes
constatée et ratifiée par le conseil d'administration de la société. Adoptée le 27 mai 2026.
ADMINISTRATEUR
Sophie Tremblay
Administrateur
Date: _______________
Marc Lefebvre
Administrateur
Date: _______________
Résolution du conseil — Émission d'actions 	Acme Test inc. — Confidentiel — Usage interne 	Généré le 27 mai 2026

-- 1 of 1 --


```
Assertions:
- PASS — FR body fragment 1 (found "est par les présentes constatée et ratifiée")
- PASS — FR body fragment 2 (effective) (found "prenant effet le")
- PASS — FR body fragment 3 (adopted) (found "Adoptée le")
- PASS — effectiveDate rendered via formatDate (locale=fr) (found "15 mars 2024")
- PASS — resolutionDate rendered via formatDate (locale=fr) (found "27 mai 2026")
- PASS — price phrase present (issue_price_per_share=0.15) (found "au prix de")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Bobby Brown")
- PASS — quantity rendered (found "100")
- PASS — no residual {{token}} placeholders in body (clean)

### Newest-wins for this holding
- PASS — rows=7

## Holding 6e840e63-423d-4b39-9f94-10ebb5e66050 — 50 shares, issued 2024-06-22, price 0
- share_class: Catégorie A — Actions ordinaires
- holder: Tobee Town
- branch exercised: UNPRICED

### Generation 1 — FR — documentId=14aa02bb-f61c-4c8e-8151-5c74ca449e72
fileName: 14aa02bb-f61c-4c8e-8151-5c74ca449e72.pdf
```
Acme Test inc.
NEQ 1234567890
Résolution du conseil — Émission d'actions
IL EST RÉSOLU QUE :
1. Résolution du conseil — Émission d'actions
RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE Acme Test inc. (NEQ : 1234567890)
RÉSOLU QUE l'émission de 50 action(s) de Catégorie A — Actions ordinaires à Tobee Town,
prenant effet le 22 juin 2024, est par les présentes constatée et ratifiée par le conseil
d'administration de la société. Adoptée le 27 mai 2026.
ADMINISTRATEUR
Sophie Tremblay
Administrateur
Date: _______________
Marc Lefebvre
Administrateur
Date: _______________
Résolution du conseil — Émission d'actions 	Acme Test inc. — Confidentiel — Usage interne 	Généré le 27 mai 2026

-- 1 of 1 --


```
Assertions:
- PASS — FR body fragment 1 (found "est par les présentes constatée et ratifiée")
- PASS — FR body fragment 2 (effective) (found "prenant effet le")
- PASS — FR body fragment 3 (adopted) (found "Adoptée le")
- PASS — effectiveDate rendered via formatDate (locale=fr) (found "22 juin 2024")
- PASS — resolutionDate rendered via formatDate (locale=fr) (found "27 mai 2026")
- PASS — price phrase ABSENT (issue_price_per_share=0) (did not find "au prix de")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Tobee Town")
- PASS — quantity rendered (found "50")
- PASS — no residual {{token}} placeholders in body (clean)

### Generation 2 — EN — documentId=19e64c8b-a820-4341-8ba5-6fd3f34fa0e6
fileName: 19e64c8b-a820-4341-8ba5-6fd3f34fa0e6.pdf
```
Acme Test inc.
NEQ 1234567890
Board resolution — Share issuance
IT IS RESOLVED THAT:
1. Board resolution — Share issuance
RESOLUTION OF THE BOARD OF DIRECTORS OF Acme Test inc. (NEQ : 1234567890)
RESOLVED THAT the issuance of 50 share(s) of Catégorie A — Actions ordinaires to Tobee
Town, effective June 22, 2024, is hereby acknowledged and ratified by the board of
directors of the corporation. Adopted on May 27, 2026.
DIRECTOR
Sophie Tremblay
Director
Date: _______________
Marc Lefebvre
Director
Date: _______________
Board resolution — Share issuance 	Acme Test inc. — Confidential — Internal Use 	Generated on May 27, 2026

-- 1 of 1 --


```
Assertions:
- PASS — EN body fragment 1 (found "is hereby acknowledged and ratified")
- PASS — EN body fragment 2 (effective) (found "effective")
- PASS — EN body fragment 3 (adopted) (found "Adopted on")
- PASS — effectiveDate rendered via formatDate (locale=en) (found "June 22, 2024")
- PASS — resolutionDate rendered via formatDate (locale=en) (found "May 27, 2026")
- PASS — price phrase ABSENT (issue_price_per_share=0) (did not find "at a price of")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Tobee Town")
- PASS — quantity rendered (found "50")
- PASS — no residual {{token}} placeholders in body (clean)

### Generation 3 — FR — documentId=f810e630-6c37-4706-b0f0-a08ab2eec1cd
fileName: f810e630-6c37-4706-b0f0-a08ab2eec1cd.pdf
```
Acme Test inc.
NEQ 1234567890
Résolution du conseil — Émission d'actions
IL EST RÉSOLU QUE :
1. Résolution du conseil — Émission d'actions
RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE Acme Test inc. (NEQ : 1234567890)
RÉSOLU QUE l'émission de 50 action(s) de Catégorie A — Actions ordinaires à Tobee Town,
prenant effet le 22 juin 2024, est par les présentes constatée et ratifiée par le conseil
d'administration de la société. Adoptée le 27 mai 2026.
ADMINISTRATEUR
Sophie Tremblay
Administrateur
Date: _______________
Marc Lefebvre
Administrateur
Date: _______________
Résolution du conseil — Émission d'actions 	Acme Test inc. — Confidentiel — Usage interne 	Généré le 27 mai 2026

-- 1 of 1 --


```
Assertions:
- PASS — FR body fragment 1 (found "est par les présentes constatée et ratifiée")
- PASS — FR body fragment 2 (effective) (found "prenant effet le")
- PASS — FR body fragment 3 (adopted) (found "Adoptée le")
- PASS — effectiveDate rendered via formatDate (locale=fr) (found "22 juin 2024")
- PASS — resolutionDate rendered via formatDate (locale=fr) (found "27 mai 2026")
- PASS — price phrase ABSENT (issue_price_per_share=0) (did not find "au prix de")
- PASS — share class token rendered (found "Catégorie A — Actions ordinaires")
- PASS — holder name rendered (found "Tobee Town")
- PASS — quantity rendered (found "50")
- PASS — no residual {{token}} placeholders in body (clean)

### Newest-wins for this holding
- PASS — rows=6

────────────────────────────────────────────────────────────────
# Global summary
- holdings processed: 2
- assertions: 60/60 passed
- newest-wins: 2/2 passed
- priced-phrase branch exercised: YES
- unpriced-phrase branch exercised: YES

ALL CHECKS PASSED
