/**
 * Map a `minute_book_requirements.requirement_key` to the vault-side
 * `document_type` used in the `documents` table.
 *
 * Why this exists:
 *   The `minute_book_requirements` table does not carry a `document_type` column,
 *   but the vault form + upload pipeline need one. Sprint 9H Phase 4b.1 extracts
 *   this classifier so the completeness API and the shared upload helper both
 *   use a single source of truth.
 *
 * Phase 4b.3 addendum — the prior substring-cascade misclassified 8 of 25
 * seeded keys (shareholder resolutions as 'pv', share-subscriptions and
 * auditor waivers as 'autre'). Replaced with an explicit key → type map
 * covering all 25 seeded rows. Section-based fallback is preserved for
 * defensive coverage of free-form uploads (no requirement_key) and any
 * future DB keys added before the map is updated.
 *
 * Known gap — Sprint 10: the three bylaws keys (lsaq_reglement_interieur,
 * cbca_bylaw_1, cbca_bylaw_2) are classified as 'autre' pending a 'bylaws'
 * value in VaultDocType. Adding that value requires coordinated changes to
 * UI pills, filters, and the DB CHECK constraint, so it's deferred.
 */

export type VaultDocType =
  | 'statuts'
  | 'resolution'
  | 'pv'
  | 'registre'
  | 'rapport'
  | 'autre';

/**
 * Explicit map — all 25 seeded `minute_book_requirements.requirement_key`
 * values. Source of truth for vault document_type classification.
 */
const REQUIREMENT_DOC_TYPE: Record<string, VaultDocType> = {
  // Articles / certificates of incorporation
  lsaq_statuts_constitution:             'statuts',
  cbca_certificate_incorporation:        'statuts',
  cbca_articles_incorporation:           'statuts',

  // Bylaws — 'autre' until a 'bylaws' value lands in VaultDocType (Sprint 10).
  lsaq_reglement_interieur:              'autre',
  cbca_bylaw_1:                          'autre',
  cbca_bylaw_2:                          'autre',

  // Government filings / declarations / annual returns
  lsaq_declaration_initiale:             'rapport',
  cbca_declaration_initiale_qc:          'rapport',
  cbca_annual_return:                    'rapport',
  lsaq_req_annual_update:                'rapport',
  cbca_req_annual_update_qc:             'rapport',

  // Director acceptance / consent forms
  lsaq_acceptation_mandat:               'autre',
  cbca_director_acceptance:              'autre',

  // Foundational resolutions (board + shareholder)
  lsaq_premiere_resolution_ca:           'resolution',
  cbca_first_board_resolution:           'resolution',
  lsaq_premiere_resolution_actionnaires: 'resolution',
  cbca_first_shareholder_resolution:     'resolution',

  // Share subscription — resolution-equivalent per Phase 4b.3 audit.
  lsaq_souscription_actions:             'resolution',
  cbca_share_subscription:               'resolution',

  // Annual resolutions (board + shareholder)
  lsaq_annual_board_resolution:          'resolution',
  cbca_annual_board_resolution:          'resolution',
  lsaq_annual_shareholder_resolution:    'resolution',
  cbca_annual_shareholder_resolution:    'resolution',

  // Auditor waivers — resolutions per statute (art. 163 LCSA et al.)
  lsaq_auditor_waiver:                   'resolution',
  cbca_auditor_waiver:                   'resolution',
};

export function requirementToDocType(
  requirementKey: string,
  section: string | null | undefined
): VaultDocType {
  // 1. Exact-match map — authoritative for all 25 seeded keys.
  const mapped = REQUIREMENT_DOC_TYPE[requirementKey];
  if (mapped) return mapped;

  // 2. Section fallback — defensive coverage for free-form uploads
  //    (empty requirementKey) and any future DB keys not yet in the map.
  switch (section) {
    case 'statuts':
      return 'statuts';
    case 'resolutions':
      return 'resolution';
    case 'registres':
      return 'registre';
    case 'avis':
      return 'rapport';
    default:
      return 'autre';
  }
}
