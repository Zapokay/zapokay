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

/**
 * A complete per-locale body pair for one regime override. Both locales are
 * required (see the `regimeBodies` doc on LifecycleTemplateEntry).
 */
export interface LifecycleRegimeBody {
  fr: string;
  en: string;
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
  /** Shared / default body. Renders for ANY framework UNLESS a per-framework
   *  override below is present. REQUIRED — this is also the fallback. */
  bodyFr: string;
  bodyEn: string;
  /**
   * OPTIONAL per-framework body overrides. `bodyFr`/`bodyEn` above stay the
   * shared DEFAULT and the FALLBACK. A regime override here is used ONLY when
   * present for the company's framework; absent → the shared body renders,
   * byte-identical to a framework-blind entry. This is how a regime-divergent
   * docKey carries per-framework wording — statutory citation AND regime-specific
   * defined terms (e.g. « émetteur assujetti » LSA vs « société ayant fait appel
   * au public » CBCA) — mirroring the auditor-waiver's whole-body branch.
   * Each regime key, when given, MUST supply BOTH fr + en (no locale-asymmetric
   * override: a regime that diverges in FR diverges in EN too).
   */
  regimeBodies?: {
    cbca?: LifecycleRegimeBody;
    lsa?: LifecycleRegimeBody;
  };
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
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}}.`,
    bodyEn: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS the shareholders consider it appropriate to appoint an additional person as a director of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby elected as a director of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
    // ⚠️ YELLOW — PENDING LAWYER GREEN. Harvey-verdicted 2026-06-24 (voie 1, shareholder
    // election: LSAQ art. 110 / CBCA s. 106; term-of-office corrected to by-reference per
    // Harvey Q3). OPEN [PRIORITÉ AVOCAT]: director arrival has a SECOND path — board fills
    // a vacancy (art. 145 LSAQ / s. 111 CBCA) — the common SME mid-year-replacement case,
    // NOT covered by this shareholder-election doc. Voie 2 is a separate docKey (board
    // instrument), pending build + lawyer confirmation it's required.
    regimeBodies: {
      lsa: {
        fr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 110 de la Loi sur les sociétés par actions (RLRQ, c. S-31.1), les administrateurs de la Société sont élus par les actionnaires;

ATTENDU QUE les actionnaires jugent opportun d'élire une personne supplémentaire à titre d'administrateur;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes élu(e) administrateur de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les actionnaires de la Société.`,
        en: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 110 of the Business Corporations Act (CQLR, c. S-31.1), the directors of the Corporation are elected by the shareholders;

WHEREAS the shareholders consider it advisable to elect an additional person as a director;

RESOLVED THAT:

1. {{personName}} is hereby elected as a director of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the shareholders of the Corporation.`,
      },
      cbca: {
        fr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 106 de la Loi canadienne sur les sociétés par actions (L.R.C. (1985), ch. C-44), les actionnaires élisent les administrateurs de la Société par résolution ordinaire;

ATTENDU QUE les actionnaires jugent opportun d'élire une personne supplémentaire à titre d'administrateur;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes élu(e) administrateur de la Société, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les actionnaires de la Société.`,
        en: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 106 of the Canada Business Corporations Act (R.S.C. 1985, c. C-44), the shareholders elect the directors of the Corporation by ordinary resolution;

WHEREAS the shareholders consider it advisable to elect an additional person as a director;

RESOLVED THAT:

1. {{personName}} is hereby elected as a director of the Corporation, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the shareholders of the Corporation.`,
      },
    },
  },

  director_appointment_vacancy: {
    docKey: 'director_appointment_vacancy',
    instrument: 'board',
    satisfies: { event_type: 'director_mandate', event_phase: 'appointment' },
    requiredVars: ['companyName', 'personName', 'effectiveDate', 'resolutionDate'],
    titleFr: "Nomination d'un administrateur (vacance)",
    titleEn: 'Appointment of a Director (Vacancy)',
    // ⚠️ YELLOW — PENDING LAWYER GREEN. Harvey-verdicted 2026-06-24 (voie 2, board fills a
    // vacancy: art. 145 LSAQ / s. 111 CBCA). Board instrument (directors sign). The common
    // SME mid-year-replacement case. Threshold: quorum of directors. Term-of-office uses the
    // by-reference phrasing (Harvey Q3). OPEN [PRIORITÉ AVOCAT]: lawyer to confirm voie 2 is
    // required as a distinct document (vs. shareholder election covering all arrivals).
    bodyFr: `RÉSOLUTION ÉCRITE DES ADMINISTRATEURS DE {{companyName}}{{neqClause}}

ATTENDU QU'une vacance est survenue au sein du conseil d'administration de la Société;

ATTENDU QUE les administrateurs, agissant avec quorum, jugent opportun de combler cette vacance;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes nommé(e) administrateur de la Société pour combler la vacance, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les administrateurs de la Société.`,
    bodyEn: `WRITTEN RESOLUTION OF THE DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS a vacancy has arisen on the board of directors of the Corporation;

WHEREAS the directors, acting with a quorum, consider it advisable to fill that vacancy;

RESOLVED THAT:

1. {{personName}} is hereby appointed as a director of the Corporation to fill the vacancy, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the directors of the Corporation.`,
    regimeBodies: {
      lsa: {
        fr: `RÉSOLUTION ÉCRITE DES ADMINISTRATEURS DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 145 de la Loi sur les sociétés par actions (RLRQ, c. S-31.1), les administrateurs peuvent, s'il y a quorum, combler toute vacance survenue au sein du conseil;

ATTENDU QU'une vacance est survenue au sein du conseil d'administration de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes nommé(e) administrateur de la Société pour combler la vacance, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les administrateurs de la Société.`,
        en: `WRITTEN RESOLUTION OF THE DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 145 of the Business Corporations Act (CQLR, c. S-31.1), the directors may, if there is a quorum, fill any vacancy occurring on the board;

WHEREAS a vacancy has arisen on the board of directors of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby appointed as a director of the Corporation to fill the vacancy, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the directors of the Corporation.`,
      },
      cbca: {
        fr: `RÉSOLUTION ÉCRITE DES ADMINISTRATEURS DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 111 de la Loi canadienne sur les sociétés par actions (L.R.C. (1985), ch. C-44), un quorum d'administrateurs peut combler une vacance survenue au sein du conseil;

ATTENDU QU'une vacance est survenue au sein du conseil d'administration de la Société;

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes nommé(e) administrateur de la Société pour combler la vacance, à compter du {{effectiveDate}};
2. QUE {{personName}} demeure en fonction pour la durée prévue au règlement intérieur de la Société, conformément à la loi applicable;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte et à signer tout document nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les administrateurs de la Société.`,
        en: `WRITTEN RESOLUTION OF THE DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 111 of the Canada Business Corporations Act (R.S.C. 1985, c. C-44), a quorum of directors may fill a vacancy occurring on the board;

WHEREAS a vacancy has arisen on the board of directors of the Corporation;

RESOLVED THAT:

1. {{personName}} is hereby appointed as a director of the Corporation to fill the vacancy, effective {{effectiveDate}};
2. {{personName}} shall hold office for the term provided in the by-laws of the Corporation, in accordance with applicable law;
3. Any director or officer of the Corporation is authorized to do all things and sign all documents necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the directors of the Corporation.`,
      },
    },
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
    // YELLOW - PENDING LAWYER GREEN. Harvey-verdicted 2026-06-24 (LSAQ art. 142,
    // + context art. 108/143; CBCA s. 108). Generic board constatation covers all four
    // non-revocation modes (resignation/term-end/death/disqualification) - NO mode branch.
    // Citation in CLAUSE 1 (qualifies the board's act of acknowledgment), NOT the recital -
    // deliberate: citing the CAUSE would over-assert for death, which art. 142 LSAQ does not
    // name (Harvey Q5). effectiveDate MAY precede resolutionDate (no constraint).
    // OPEN [PRIORITE AVOCAT, RED]: clause 2 REQ/registry filing basis + deadline (LPLE / P-44.1)
    // unverified - clause 2 kept NEUTRAL pending Harvey LPLE round. Not final pre-lawyer;
    // death-citation asymmetry (QC) also for lawyer confirmation.
    regimeBodies: {
      lsa: {
        fr: `RÉSOLUTION ÉCRITE DES ADMINISTRATEURS DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste d'administrateur de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la fin du mandat de {{personName}} à titre d'administrateur de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée, conformément à l'article 142 de la Loi sur les sociétés par actions (RLRQ, c. S-31.1);
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les administrateurs de la Société.`,
        en: `WRITTEN RESOLUTION OF THE DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as a director of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as a director of the Corporation, effective {{effectiveDate}}, is hereby acknowledged, in accordance with section 142 of the Business Corporations Act (CQLR, c. S-31.1);
2. The records of the Corporation be updated accordingly;
3. Any director or officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the directors of the Corporation.`,
      },
      cbca: {
        fr: `RÉSOLUTION ÉCRITE DES ADMINISTRATEURS DE {{companyName}}{{neqClause}}

ATTENDU QUE {{personName}} a cessé d'occuper le poste d'administrateur de la Société, pour le motif suivant : {{endReason}}, prenant effet le {{effectiveDate}};

IL EST RÉSOLU :

1. QUE la fin du mandat de {{personName}} à titre d'administrateur de la Société, prenant effet le {{effectiveDate}}, soit et est par les présentes constatée, conformément à l'article 108 de la Loi canadienne sur les sociétés par actions (L.R.C. (1985), ch. C-44);
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout administrateur ou dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les administrateurs de la Société.`,
        en: `WRITTEN RESOLUTION OF THE DIRECTORS OF {{companyName}}{{neqClause}}

WHEREAS {{personName}} has ceased to hold office as a director of the Corporation, for the following reason: {{endReason}}, effective {{effectiveDate}};

RESOLVED THAT:

1. The cessation of {{personName}} as a director of the Corporation, effective {{effectiveDate}}, is hereby acknowledged, in accordance with section 108 of the Canada Business Corporations Act (R.S.C. 1985, c. C-44);
2. The records of the Corporation be updated accordingly;
3. Any director or officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the directors of the Corporation.`,
      },
    },
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
    // ⚠️ YELLOW — PENDING LAWYER GREEN. Harvey-verdicted 2026-06-21 (LSAQ art. 144/150,
    // CBCA s. 109/110; threshold = ordinary resolution; right-to-be-heard acknowledged).
    // OPEN [PRIORITÉ AVOCAT]: written-resolution validity for shareholder removal given
    // the meeting + right-to-be-heard architecture (art. 150 LSAQ / s. 110 CBCA) — the
    // FORM may need to change to meeting-mode; do NOT treat wording as final pre-lawyer.
    regimeBodies: {
      lsa: {
        fr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 144 de la Loi sur les sociétés par actions (RLRQ, c. S-31.1), les actionnaires d'une société peuvent destituer un administrateur par résolution ordinaire;

ATTENDU QUE l'administrateur visé a, conformément à l'article 150 de cette loi, le droit d'être informé de la destitution proposée et d'y faire valoir ses observations;

ATTENDU QUE les actionnaires souhaitent exercer ce pouvoir à l'égard de {{personName}};

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes destitué(e) de ses fonctions d'administrateur de la Société, à compter du {{effectiveDate}};
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution, y compris toute formalité de mise à jour auprès du registre des entreprises.

Adoptée le {{resolutionDate}} par les actionnaires de la Société.`,
        en: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 144 of the Business Corporations Act (CQLR, c. S-31.1), the shareholders of a corporation may remove a director by ordinary resolution;

WHEREAS the director concerned has, pursuant to section 150 of that Act, the right to be informed of the proposed removal and to make representations;

WHEREAS the shareholders wish to exercise that power with respect to {{personName}};

RESOLVED THAT:

1. {{personName}} is hereby removed from office as a director of the Corporation, effective {{effectiveDate}};
2. The records of the Corporation be updated accordingly;
3. Any officer of the Corporation is authorized to do all things necessary to give effect to this resolution, including any update filing with the enterprise registrar.

Adopted on {{resolutionDate}} by the shareholders of the Corporation.`,
      },
      cbca: {
        fr: `RÉSOLUTION ÉCRITE DES ACTIONNAIRES DE {{companyName}}{{neqClause}}

ATTENDU QUE, conformément à l'article 109 de la Loi canadienne sur les sociétés par actions (L.R.C. (1985), ch. C-44), les actionnaires d'une société peuvent, par résolution ordinaire, destituer un administrateur;

ATTENDU QUE l'administrateur visé a, conformément à l'article 110 de cette loi, le droit d'être informé de la destitution proposée et d'y faire valoir ses observations;

ATTENDU QUE les actionnaires souhaitent exercer ce pouvoir à l'égard de {{personName}};

IL EST RÉSOLU :

1. QUE {{personName}} soit et est par les présentes destitué(e) de ses fonctions d'administrateur de la Société, à compter du {{effectiveDate}};
2. QUE les registres de la Société soient mis à jour en conséquence;
3. QUE tout dirigeant de la Société soit autorisé à accomplir tout acte nécessaire pour donner effet à la présente résolution.

Adoptée le {{resolutionDate}} par les actionnaires de la Société.`,
        en: `WRITTEN RESOLUTION OF THE SHAREHOLDERS OF {{companyName}}{{neqClause}}

WHEREAS, pursuant to section 109 of the Canada Business Corporations Act (R.S.C. 1985, c. C-44), the shareholders of a corporation may, by ordinary resolution, remove a director;

WHEREAS the director concerned has, pursuant to section 110 of that Act, the right to be informed of the proposed removal and to make representations;

WHEREAS the shareholders wish to exercise that power with respect to {{personName}};

RESOLVED THAT:

1. {{personName}} is hereby removed from office as a director of the Corporation, effective {{effectiveDate}};
2. The records of the Corporation be updated accordingly;
3. Any officer of the Corporation is authorized to do all things necessary to give effect to this resolution.

Adopted on {{resolutionDate}} by the shareholders of the Corporation.`,
      },
    },
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

  // ⚠️ YELLOW — PENDING LAWYER GREEN — DO NOT SHIP UNVALIDATED.
  // The transfer-restrictions recital below (FR "a vérifié que ce transfert est conforme
  // aux restrictions" / EN "has verified that this transfer complies with the restrictions")
  // is Harvey-prepared content (Form A, 2026-06-12) awaiting external-lawyer validation.
  // Pre-launch only. A pre-launch grep for "PENDING LAWYER GREEN" must return ZERO before ship.
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

ATTENDU QUE le conseil d'administration a vérifié que ce transfert est conforme aux restrictions au transfert d'actions applicables à la société, le cas échéant (notamment toute clause d'agrément, droit de premier refus, convention entre actionnaires ou restriction prévue aux statuts);

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

WHEREAS the board of directors has verified that this transfer complies with the restrictions on the transfer of shares applicable to the corporation, if any (including any approval requirement, right of first refusal, shareholders' agreement, or restriction set out in the articles);

WHEREAS the board of directors wishes to acknowledge this transfer and update the company's registers accordingly;

IT IS RESOLVED:

1. THAT the transfer of {{quantity}} share(s) of class {{shareClassName}} from {{transferorName}} to {{transfereeName}}, on {{transferDate}}, be acknowledged;

2. THAT the company's shareholder register be updated to reflect this transfer;

3. THAT any officer of the company be authorized to sign any document necessary to give effect to this resolution.

Adopted on {{resolutionDate}}.`,
  },
};
