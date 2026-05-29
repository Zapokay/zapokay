/**
 * #19d — Lifecycle-act resolution template registry.
 *
 * 8 docKeys, each FR + EN, covering the #19c-scored lifecycle act phases
 * that have a resolution-class evidence document:
 *
 *   docKey              instrument    satisfies (event_type, event_phase)
 *   ──────────────────  ────────────  ─────────────────────────────────────
 *   director_appointment  shareholder (director_mandate,    appointment)
 *   director_departure    board       (director_mandate,    departure)
 *   director_removal      shareholder (director_mandate,    departure)
 *   officer_appointment   board       (officer_appointment, appointment)
 *   officer_departure     board       (officer_appointment, departure)
 *   share_issuance        board       (shareholding,        issuance)
 *   share_cessation       board       (shareholding,        cessation)
 *   share_transfer        board       (share_transfer,      transfer)
 *
 * Token convention is `{{token}}`. Tokens used across the registry:
 *   companyName, neqClause, personName, officerTitle (officer entries only),
 *   holderName / shares / shareClass (share entries only),
 *   transferorName / transfereeName / quantity / shareClassName / transferDate /
 *   considerationClause (transfer entry only — considerationClause is pre-composed
 *   by the orchestrator with the locale-correct preposition + formatted value
 *   inlined, resolving to empty string when no consideration is recorded;
 *   mirrors the pricePhraseFr/En pattern from share_issuance),
 *   effectiveDate, endReason (departure / cessation entries only),
 *   pricePhraseFr / pricePhraseEn (issuance entry only — pre-composed by the
 *   orchestrator with the formatted price already inlined; resolves to empty
 *   string when the holding has no recorded price), resolutionDate.
 *
 * NEQ handling: bodies use a single `{{neqClause}}` token immediately after
 * `{{companyName}}`. The engine composes neqClause from `ctx.neq` —
 *   neq present : " (NEQ : <neq>)"   (leading space included)
 *   neq absent  : ""
 * — so a missing NEQ never leaves a dangling "(NEQ : )".
 *
 * Two docKeys satisfy the SAME (director_mandate, departure) phase:
 *   - director_departure   — board-acknowledged cessation (resignation, term-end, etc.)
 *   - director_removal     — shareholder-driven dismissal
 * Caller picks the appropriate instrument based on the real-world act; both
 * write to event_documents with the same (event_type, event_phase) tuple.
 *
 * Design note: this module is a static content registry today. The
 * engine in `lifecycle-template-engine.ts` reads it only through the
 * exported shape below — a future content-as-data source (e.g.,
 * `document_templates` rows or a per-tenant override layer) can implement
 * the same shape and swap in without touching the engine or its callers.
 */

export type LifecycleInstrument = 'board' | 'shareholder';

export type LifecycleEventType =
  | 'director_mandate'
  | 'officer_appointment'
  | 'shareholding'
  | 'share_transfer';

export type LifecycleEventPhase =
  | 'appointment'
  | 'departure'
  | 'cessation'
  | 'issuance'
  | 'transfer';

export interface LifecycleSatisfies {
  event_type: LifecycleEventType;
  event_phase: LifecycleEventPhase;
}

export interface LifecycleTemplateEntry {
  docKey: string;
  instrument: LifecycleInstrument;
  satisfies: LifecycleSatisfies;
  /** Tokens that MUST be present and non-empty in the fill context.
   *  Excludes `neq` (optional) and `neqClause` (composed by the engine). */
  requiredVars: readonly string[];
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
}

export const LIFECYCLE_TEMPLATES: Readonly<Record<string, LifecycleTemplateEntry>> = {
  director_appointment: {
    docKey: 'director_appointment',
    instrument: 'shareholder',
    satisfies: { event_type: 'director_mandate', event_phase: 'appointment' },
    requiredVars: ['companyName', 'personName', 'effectiveDate', 'resolutionDate'],
    titleFr: "Élection d'un administrateur",
    titleEn: 'Election of a Director',
    bodyFr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE les actionnaires jugent opportun de nommer une personne supplémentaire à titre d'administrateur de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes élu(e) administrateur de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction jusqu'à la clôture de la prochaine assemblée annuelle des actionnaires ou jusqu'à ce que son mandat prenne fin conformément à la loi et aux règlements de la Société;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS the shareholders consider it appropriate to appoint an additional person as a director of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby elected as a director of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall hold office until the close of the next annual meeting of shareholders or until they cease to hold office in accordance with the law and the by-laws of the Corporation;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },

  director_departure: {
    docKey: 'director_departure',
    instrument: 'board',
    satisfies: { event_type: 'director_mandate', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'endReason', 'effectiveDate', 'resolutionDate'],
    titleFr: "Constatation de la fin du mandat d'un administrateur",
    titleEn: 'Cessation of a Director',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste d'administrateur de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la fin du mandat de {{personName}} à titre d'administrateur de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée;
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as a director of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as a director of the Corporation, effective {{effectiveDate}}, is hereby acknowledged;
2. The records of the Corporation be updated accordingly;
3. Any director or officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },

  director_removal: {
    docKey: 'director_removal',
    instrument: 'shareholder',
    satisfies: { event_type: 'director_mandate', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'effectiveDate', 'resolutionDate'],
    titleFr: "Destitution d'un administrateur",
    titleEn: 'Removal of a Director',
    bodyFr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE les actionnaires souhaitent destituer un administrateur de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes destitué(e) de ses fonctions d'administrateur de la Société, à compter du {{effectiveDate}};
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution, y compris toute formalité de mise à jour auprès du registre des entreprises.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS the shareholders wish to remove a director of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby removed from office as a director of the Corporation, effective {{effectiveDate}};
2. The records of the Corporation be updated accordingly;
3. Any officer of the Corporation is authorized to do all things necessary to give effect to this resolution, including any update filing with the enterprise registrar.

Adopted on {{resolutionDate}}.`,
  },

  officer_appointment: {
    docKey: 'officer_appointment',
    instrument: 'board',
    satisfies: { event_type: 'officer_appointment', event_phase: 'appointment' },
    requiredVars: ['companyName', 'personName', 'officerTitle', 'effectiveDate', 'resolutionDate'],
    titleFr: "Nomination d'un dirigeant",
    titleEn: 'Appointment of an Officer',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE le conseil d'administration juge opportun de pourvoir au poste de {{officerTitle}};

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes nommé(e) au poste de {{officerTitle}} de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} exerce les fonctions et pouvoirs rattachés à ce poste conformément aux règlements de la Société et aux directives du conseil d'administration;
3. QUE tout administrateur de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée par le conseil d'administration le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS the board of directors considers it appropriate to fill the office of {{officerTitle}};

RESOLVED THAT:

1. {{personName}} is hereby appointed as {{officerTitle}} of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall carry out the duties and powers of that office in accordance with the by-laws of the Corporation and the directions of the board of directors;
3. Any director of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted by the board of directors on {{resolutionDate}}.`,
  },

  officer_departure: {
    docKey: 'officer_departure',
    instrument: 'board',
    satisfies: { event_type: 'officer_appointment', event_phase: 'departure' },
    requiredVars: ['companyName', 'personName', 'officerTitle', 'endReason', 'effectiveDate', 'resolutionDate'],
    titleFr: "Cessation des fonctions d'un dirigeant",
    titleEn: 'Cessation of an Officer',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste de {{officerTitle}} de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la cessation des fonctions de {{personName}} à titre de {{officerTitle}} de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée;
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée par le conseil d'administration le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as {{officerTitle}} of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as {{officerTitle}} of the Corporation, effective {{effectiveDate}}, is hereby acknowledged;
2. The records of the Corporation be updated accordingly;
3. Any director of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted by the board of directors on {{resolutionDate}}.`,
  },

  share_issuance: {
    docKey: 'share_issuance',
    instrument: 'board',
    satisfies: { event_type: 'shareholding', event_phase: 'issuance' },
    // pricePhraseFr / pricePhraseEn are required (must be present in ctx so
    // the engine's residual-{{ guard passes), but each may legitimately be an
    // empty string when the holding has no recorded issue_price_per_share.
    // The engine treats empty-string as missing for required-var validation,
    // so they are NOT in requiredVars — the orchestrator unconditionally
    // populates both keys.
    requiredVars: ['companyName', 'holderName', 'shares', 'shareClass', 'effectiveDate', 'resolutionDate'],
    titleFr: "Résolution du conseil — Émission d'actions",
    titleEn: 'Board resolution — Share issuance',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

RÉSOLU QUE l'émission de {{shares}} action(s) de {{shareClass}} à {{holderName}}{{pricePhraseFr}}, prenant effet le {{effectiveDate}}, est par les présentes constatée et ratifiée par le conseil d'administration de la société.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

RESOLVED THAT the issuance of {{shares}} share(s) of {{shareClass}} to {{holderName}}{{pricePhraseEn}}, effective {{effectiveDate}}, is hereby acknowledged and ratified by the board of directors of the corporation.

Adopted on {{resolutionDate}}.`,
  },

  share_cessation: {
    docKey: 'share_cessation',
    instrument: 'board',
    satisfies: { event_type: 'shareholding', event_phase: 'cessation' },
    requiredVars: ['companyName', 'holderName', 'shares', 'shareClass', 'endReason', 'effectiveDate', 'resolutionDate'],
    titleFr: "Cessation d'actions",
    titleEn: 'Cessation of Shares',
    bodyFr: `RÉSOLUTION DU CONSEIL D'ADMINISTRATION DE {{companyName}}{{neqClause}}

ATTENDU QUE {{shares}} action(s) de catégorie {{shareClass}} détenue(s) par {{holderName}} ont cessé d'être en circulation, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la cessation de {{shares}} action(s) de catégorie {{shareClass}} détenue(s) par {{holderName}}, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée;
2. QUE les registres des valeurs mobilières de la Société soient mis à jour en conséquence;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `RESOLUTION OF THE BOARD OF DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{shares}} {{shareClass}} share(s) held by {{holderName}} have ceased to be outstanding, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{shares}} {{shareClass}} share(s) held by {{holderName}}, effective {{effectiveDate}}, is hereby acknowledged;
2. The securities records of the Corporation be updated accordingly;
3. Any director or officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },

  share_transfer: {
    docKey: 'share_transfer',
    instrument: 'board',
    satisfies: { event_type: 'share_transfer', event_phase: 'transfer' },
    // considerationClause is required (must be present in ctx so the engine's
    // residual-{{ guard passes), but may legitimately be an empty string when
    // no consideration is recorded. The engine treats empty-string as missing
    // for required-var validation, so it is NOT in requiredVars — the
    // orchestrator unconditionally populates the key. Mirrors the
    // pricePhraseFr/En pattern from share_issuance.
    requiredVars: ['companyName', 'transferorName', 'transfereeName', 'quantity', 'shareClassName', 'transferDate', 'resolutionDate'],
    titleFr: "Transfert d'actions",
    titleEn: 'Share Transfer',
    bodyFr: `{{companyName}}{{neqClause}}

RÉSOLUTION DU CONSEIL D'ADMINISTRATION
RECONNAISSANT UN TRANSFERT D'ACTIONS

ATTENDU QUE {{transferorName}} a transféré {{quantity}} action(s) de catégorie {{shareClassName}} à {{transfereeName}} en date du {{transferDate}}{{considerationClause}};

ATTENDU QUE le conseil d'administration souhaite reconnaître ce transfert et mettre à jour les registres de la société en conséquence;

IL EST RÉSOLU :

1. QUE le transfert de {{quantity}} action(s) de catégorie {{shareClassName}} de {{transferorName}} à {{transfereeName}}, en date du {{transferDate}}, soit reconnu;

2. QUE le registre des actionnaires de la société soit mis à jour pour refléter ce transfert;

3. QUE tout dirigeant de la société soit autorisé à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `{{companyName}}{{neqClause}}

BOARD RESOLUTION
ACKNOWLEDGING A SHARE TRANSFER

WHEREAS {{transferorName}} transferred {{quantity}} share(s) of class {{shareClassName}} to {{transfereeName}} on {{transferDate}}{{considerationClause}};

WHEREAS the board of directors wishes to acknowledge this transfer and update the company's registers accordingly;

IT IS RESOLVED:

1. THAT the transfer of {{quantity}} share(s) of class {{shareClassName}} from {{transferorName}} to {{transfereeName}}, on {{transferDate}}, be acknowledged;

2. THAT the company's shareholder register be updated to reflect this transfer;

3. THAT any officer of the company be authorized to sign any document necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },
};
