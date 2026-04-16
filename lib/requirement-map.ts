export type SignatoryType = 'board' | 'shareholder';

const REQUIREMENT_SIGNATORY_MAP: Record<string, SignatoryType> = {
  // Board resolutions → active directors
  lsaq_premiere_resolution_ca:          'board',
  lsaq_annual_board_resolution:         'board',
  cbca_first_board_resolution:          'board',
  cbca_annual_board_resolution:         'board',

  // Shareholder resolutions → shareholders
  lsaq_premiere_resolution_actionnaires: 'shareholder',
  lsaq_annual_shareholder_resolution:    'shareholder',
  lsaq_souscription_actions:             'shareholder',
  lsaq_auditor_waiver:                   'shareholder',
  cbca_first_shareholder_resolution:     'shareholder',
  cbca_annual_shareholder_resolution:    'shareholder',
  cbca_share_subscription:              'shareholder',
  cbca_auditor_waiver:                  'shareholder',
};

const ALL_REQUIRED_KEYS = new Set([
  'lsaq_auditor_waiver',
  'cbca_auditor_waiver',
]);

export function getSignatoryType(requirementKey: string): SignatoryType | null {
  return REQUIREMENT_SIGNATORY_MAP[requirementKey] ?? null;
}

export function isAllSignatoriesRequired(requirementKey: string): boolean {
  return ALL_REQUIRED_KEYS.has(requirementKey);
}
