// Classifier regression guard — asserts requirementToDocType() output for
// all 25 seeded minute_book_requirements keys. Run via `npm run audit:doctypes`.
//
// The expected map below IS the source of truth: if the classifier changes,
// this script must change too. That's the point.
//
// Requires Node 23.6+ for native TypeScript type-stripping.
import { requirementToDocType } from '../lib/requirement-doctype.ts';

// Per Sprint 9H Phase 4b.3 audit — all 25 seeded keys.
// [requirement_key, section, expected VaultDocType]
const CASES = [
  // Articles / certificates of incorporation
  ['lsaq_statuts_constitution',             'statuts',         'statuts'],
  ['cbca_certificate_incorporation',        'statuts',         'statuts'],
  ['cbca_articles_incorporation',           'statuts',         'statuts'],

  // Bylaws — 'autre' pending Sprint 10 enum work
  ['lsaq_reglement_interieur',              'reglements',      'autre'],
  ['cbca_bylaw_1',                          'reglements',      'autre'],
  ['cbca_bylaw_2',                          'reglements',      'autre'],

  // Government filings / declarations / annual returns
  ['lsaq_declaration_initiale',             'avis',            'rapport'],
  ['cbca_declaration_initiale_qc',          'avis',            'rapport'],
  ['cbca_annual_return',                    'avis',            'rapport'],
  ['lsaq_req_annual_update',                'avis',            'rapport'],
  ['cbca_req_annual_update_qc',             'avis',            'rapport'],

  // Director acceptance / consent forms
  ['lsaq_acceptation_mandat',               'administrateurs', 'autre'],
  ['cbca_director_acceptance',              'administrateurs', 'autre'],

  // Foundational resolutions (board + shareholder)
  ['lsaq_premiere_resolution_ca',           'resolutions',     'resolution'],
  ['cbca_first_board_resolution',           'resolutions',     'resolution'],
  ['lsaq_premiere_resolution_actionnaires', 'resolutions',     'resolution'],
  ['cbca_first_shareholder_resolution',     'resolutions',     'resolution'],

  // Share subscription
  ['lsaq_souscription_actions',             'actionnaires',    'resolution'],
  ['cbca_share_subscription',               'actionnaires',    'resolution'],

  // Annual resolutions (board + shareholder)
  ['lsaq_annual_board_resolution',          'resolutions',     'resolution'],
  ['cbca_annual_board_resolution',          'resolutions',     'resolution'],
  ['lsaq_annual_shareholder_resolution',    'resolutions',     'resolution'],
  ['cbca_annual_shareholder_resolution',    'resolutions',     'resolution'],

  // Auditor waivers
  ['lsaq_auditor_waiver',                   'resolutions',     'resolution'],
  ['cbca_auditor_waiver',                   'resolutions',     'resolution'],
];

let failures = 0;
for (const [key, section, expected] of CASES) {
  const actual = requirementToDocType(key, section);
  if (actual === expected) {
    console.log(`✅ ${key} → ${actual}`);
  } else {
    console.log(`❌ ${key} → expected '${expected}', got '${actual}'`);
    failures++;
  }
}

const passed = CASES.length - failures;
console.log(`\nSummary: ${passed}/${CASES.length} pass${failures ? ` (${failures} failure${failures === 1 ? '' : 's'})` : ''}`);
process.exit(failures ? 1 : 0);
