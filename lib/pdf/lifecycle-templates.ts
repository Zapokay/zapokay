/**
 * #19d — Lifecycle-act resolution template registry.
 *
 * 5 docKeys, each FR + EN, covering the four #19c-scored lifecycle act
 * phases that have a resolution-class evidence document:
 *
 *   docKey              instrument    satisfies (event_type, event_phase)
 *   ──────────────────  ────────────  ─────────────────────────────────────
 *   director_appointment  shareholder (director_mandate,    appointment)
 *   director_departure    board       (director_mandate,    departure)
 *   director_removal      shareholder (director_mandate,    departure)
 *   officer_appointment   board       (officer_appointment, appointment)
 *   officer_departure     board       (officer_appointment, departure)
 *
 * Token convention is `{{token}}`. Tokens used across the registry:
 *   companyName, neqClause, personName, officerTitle (officer entries only),
 *   effectiveDate, endReason (departure entries only), resolutionDate.
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

export type LifecycleEventType = 'director_mandate' | 'officer_appointment';

export type LifecycleEventPhase = 'appointment' | 'departure';

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
};
