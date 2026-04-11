export interface LegalDefinition {
  key: string;
  term_fr: string;
  term_en: string;
  definition_fr: string;
  definition_en: string;
}

export const LEGAL_DEFINITIONS: LegalDefinition[] = [
  {
    key: 'neq',
    term_fr: 'NEQ',
    term_en: 'NEQ',
    definition_fr:
      "Numéro d'entreprise du Québec — identifiant unique à 10 chiffres attribué par le Registraire des entreprises à chaque entreprise immatriculée au Québec.",
    definition_en:
      'Quebec Enterprise Number — a unique 10-digit identifier assigned by the Registraire des entreprises to every business registered in Quebec.',
  },
  {
    key: 'lsaq',
    term_fr: 'LSAQ',
    term_en: 'LSAQ',
    definition_fr:
      'Loi sur les sociétés par actions du Québec — loi provinciale qui régit les sociétés constituées au Québec.',
    definition_en:
      'Quebec Business Corporations Act — the provincial law governing corporations incorporated in Quebec.',
  },
  {
    key: 'cbca',
    term_fr: 'LCSA / CBCA',
    term_en: 'CBCA',
    definition_fr:
      'Loi canadienne sur les sociétés par actions — loi fédérale qui régit les sociétés constituées au Canada.',
    definition_en:
      'Canada Business Corporations Act — the federal law governing corporations incorporated in Canada.',
  },
  {
    key: 'resolution',
    term_fr: 'Résolution',
    term_en: 'Resolution',
    definition_fr:
      "Décision formelle adoptée par le conseil d'administration ou les actionnaires, adoptée à la majorité simple (plus de 50% des votes).",
    definition_en:
      'A formal decision adopted by the board of directors or shareholders, passed by simple majority (more than 50% of votes).',
  },
  {
    key: 'resolution_speciale',
    term_fr: 'Résolution spéciale',
    term_en: 'Special resolution',
    definition_fr:
      'Décision nécessitant au moins les deux tiers (2/3) des votes. Requise pour les modifications importantes comme les statuts ou la dissolution.',
    definition_en:
      'A decision requiring at least two-thirds (2/3) of votes. Required for major changes like amending articles or dissolving the corporation.',
  },
  {
    key: 'quorum',
    term_fr: 'Quorum',
    term_en: 'Quorum',
    definition_fr:
      "Nombre minimum de participants requis pour qu'une assemblée soit valide. Pour les actionnaires : détenteurs de plus de 50% des votes. Pour les administrateurs : majorité des administrateurs en poste.",
    definition_en:
      'The minimum number of participants required for a meeting to be valid. For shareholders: holders of more than 50% of votes. For directors: a majority of directors in office.',
  },
  {
    key: 'administrateur',
    term_fr: 'Administrateur',
    term_en: 'Director',
    definition_fr:
      "Membre du conseil d'administration élu par les actionnaires pour superviser la gestion de la société. Doit avoir 18 ans, ne pas être en faillite et être mentalement capable.",
    definition_en:
      'A member of the board of directors elected by shareholders to oversee the management of the corporation. Must be 18+, not bankrupt, and mentally capable.',
  },
  {
    key: 'dirigeant',
    term_fr: 'Dirigeant',
    term_en: 'Officer',
    definition_fr:
      "Personne nommée par le conseil pour assumer des fonctions exécutives (Président, Secrétaire, Trésorier). Différent d'un administrateur.",
    definition_en:
      'A person appointed by the board to assume executive functions (President, Secretary, Treasurer). Different from a director.',
  },
  {
    key: 'actionnaire',
    term_fr: 'Actionnaire',
    term_en: 'Shareholder',
    definition_fr:
      "Personne ou entité qui détient des actions de la société et participe aux bénéfices et à la gouvernance selon le type d'actions détenues.",
    definition_en:
      'A person or entity that holds shares in the corporation and participates in profits and governance according to the type of shares held.',
  },
  {
    key: 'exercice_financier',
    term_fr: 'Exercice financier',
    term_en: 'Fiscal year',
    definition_fr:
      "Période de 12 mois utilisée par la société pour ses états financiers et ses obligations fiscales. Ne coïncide pas nécessairement avec l'année civile.",
    definition_en:
      'A 12-month period used by the corporation for its financial statements and tax obligations. Does not necessarily coincide with the calendar year.',
  },
  {
    key: 'livre_minutes',
    term_fr: 'Livre de minutes',
    term_en: 'Minute book',
    definition_fr:
      "Registre officiel complet de l'historique juridique d'une société — statuts, règlements, toutes les résolutions, registres des actionnaires et administrateurs, et certificats d'actions.",
    definition_en:
      "The complete official record of a corporation's legal history — including its articles, by-laws, all resolutions, shareholder and director registers, and share certificates.",
  },
  {
    key: 'statuts',
    term_fr: 'Statuts de constitution',
    term_en: 'Articles of incorporation',
    definition_fr:
      "Document fondateur déposé auprès du gouvernement lors de la constitution. Établit le nom, les classes d'actions, les limites du conseil et les restrictions d'activité.",
    definition_en:
      'The foundational document filed with the government at incorporation. Sets out the corporate name, share classes, director limits, and business restrictions.',
  },
  {
    key: 'reglement',
    term_fr: 'Règlement intérieur',
    term_en: 'By-law',
    definition_fr:
      'Règle de gouvernance interne adoptée par le conseil et ratifiée par les actionnaires. Régit les assemblées, les rôles des dirigeants et les procédures quotidiennes.',
    definition_en:
      'An internal governance rule adopted by the board and ratified by shareholders. Governs meetings, officer roles, and day-to-day procedures.',
  },
  {
    key: 'usa',
    term_fr: 'Convention unanime des actionnaires',
    term_en: 'Unanimous Shareholder Agreement (USA)',
    definition_fr:
      "Accord signé par TOUS les actionnaires qui peut restreindre les pouvoirs du conseil d'administration. Prévaut sur les règlements intérieurs.",
    definition_en:
      'An agreement signed by ALL shareholders that can restrict the powers of the board of directors. Takes priority over by-laws.',
  },
  {
    key: 'dividende',
    term_fr: 'Dividende',
    term_en: 'Dividend',
    definition_fr:
      "Distribution de bénéfices aux actionnaires décidée par le conseil d'administration. Le conseil a pleine discrétion — aucune obligation de déclarer un dividende.",
    definition_en:
      'A distribution of profits to shareholders decided by the board of directors. The board has full discretion — no obligation to declare a dividend.',
  },
  {
    key: 'verificateur',
    term_fr: 'Vérificateur',
    term_en: 'Auditor',
    definition_fr:
      "Comptable professionnel agréé (CPA) indépendant nommé pour examiner les états financiers. Les sociétés privées CBCA peuvent dispenser la nomination d'un vérificateur annuellement.",
    definition_en:
      'An independent chartered professional accountant (CPA) appointed to examine financial statements. Private CBCA corporations may waive the auditor appointment annually.',
  },
  {
    key: 'radiation',
    term_fr: 'Radiation',
    term_en: 'Striking off',
    definition_fr:
      "Retrait de l'immatriculation d'une société du registre provincial des entreprises du Québec. Distincte de la dissolution fédérale.",
    definition_en:
      "The removal of a corporation's registration from the Quebec provincial enterprise register. Distinct from federal dissolution.",
  },
  {
    key: 'capital_actions',
    term_fr: 'Capital-actions',
    term_en: 'Share capital',
    definition_fr:
      "Ensemble des classes d'actions autorisées par les statuts, avec leurs droits de vote, dividendes et conditions de rachat.",
    definition_en:
      'The total authorized share classes defined in the articles, with their voting rights, dividend entitlements, and redemption conditions.',
  },
  {
    key: 'resident_canadien',
    term_fr: 'Résident canadien',
    term_en: 'Canadian resident',
    definition_fr:
      "Pour les sociétés CBCA : citoyen canadien ou résident permanent résidant habituellement au Canada. Au moins 25% du conseil doit être composé de résidents canadiens.",
    definition_en:
      'For CBCA corporations: a Canadian citizen or permanent resident ordinarily residing in Canada. At least 25% of the board must be Canadian residents.',
  },
  {
    key: 'dispense_verificateur',
    term_fr: 'Dispense de vérificateur',
    term_en: 'Auditor waiver',
    definition_fr:
      "Résolution annuelle par laquelle tous les actionnaires consentent à ne pas nommer de vérificateur pour l'exercice en cours. Permis par l'article 163 de la LCSA pour les sociétés privées.",
    definition_en:
      'An annual resolution where all shareholders consent not to appoint an auditor for the current fiscal year. Permitted under CBCA s.163 for private corporations.',
  },
];

export function getLegalDefinition(key: string): LegalDefinition | undefined {
  return LEGAL_DEFINITIONS.find((d) => d.key === key);
}
