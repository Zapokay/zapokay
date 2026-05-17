// =============================================================================
// scripts/seed-canonical-fixture.mjs
//
// Canonical Test Fixture — "Acme Test inc."
// -----------------------------------------------------------------------------
// What this script does:
//   Seeds a clean, deterministic test fixture into the Supabase dev database.
//   Replaces ad-hoc testing on `droussy inc.` (which has accumulated mixed-
//   vintage data and is no longer reliable for audits).
//
//   This is a NAKED fixture — company structure complete, ZERO documents.
//   Documents are generated manually through the production UI as audits
//   demand, ensuring every PDF reflects current generation code (Path C,
//   Bundle E, capital-Y conventions).
//
// Locked spec date: May 4, 2026
//   See docs/canonical-fixture-spec-2026-05-04.md (once Max writes it).
//
// Idempotency:
//   - If a company exists with NEQ = '1234567890' AND legal_name_fr =
//     'Acme Test inc.', the script wipes it (and its FK-children) and
//     re-creates from scratch.
//   - If a row exists with NEQ = '1234567890' but a DIFFERENT legal_name_fr,
//     the script ABORTS with a clear error — does not proceed with any
//     deletes. Belt-and-suspenders against deterministic-UUID reuse.
//   - If no fixture row exists, fresh insert path runs.
//   - Auth user `acme-test@zapokay.com` is matched by email (not UUID) and
//     re-created with the same locked UUID + password if it exists.
//   - droussy inc. (NEQ 1111111111) is never touched. Every wipe is scoped
//     by `company_id = <fixture id>` filters.
//
// How to run:
//   node scripts/seed-canonical-fixture.mjs
//
// Warning:
//   This script WILL wipe the existing `Acme Test inc.` fixture if present
//   and recreate it. It will NOT touch any other company.
//
// Fixture credentials (deliberately committed — dev-only fixture, no real data):
//   Email:    acme-test@zapokay.com
//   Password: AcmeTest2026!
//
// Security note:
//   These credentials are committed because the fixture is dev-only and the
//   credential grants access only to a test company with no real data.
//   Rotate to env-var-based loading (ACME_TEST_PASSWORD in .env.local) at
//   first non-Dom contributor with repo access.
//
// Required env (read from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// -----------------------------------------------------------------------------
// Locked deterministic UUIDs
// -----------------------------------------------------------------------------
const UUID = {
  authUser:   'aceaceac-0000-4000-8000-000000000001',
  company:    'aceaceac-0000-4000-8000-000000000002',
  shareClass: 'aceaceac-0000-4000-8000-000000000003',
  p1Sophie:   'aceaceac-0000-4000-8000-000000000101',
  p2Marc:     'aceaceac-0000-4000-8000-000000000102',
  p3Elise:    'aceaceac-0000-4000-8000-000000000103',
};

// -----------------------------------------------------------------------------
// Locked spec values (May 4, 2026)
// -----------------------------------------------------------------------------
const COMPANY_NEQ          = '1234567890';
const COMPANY_LEGAL_NAME   = 'Acme Test inc.';
const COMPANY_INC_DATE     = '2018-04-17';
const COMPANY_PROVINCE     = 'QC';
const COMPANY_INC_TYPE     = 'LSA';     // UI label "LSAQ" → DB "LSA"
const COMPANY_FYE_MONTH    = 12;
const COMPANY_FYE_DAY      = 31;

const AUTH_EMAIL           = 'acme-test@zapokay.com';
const AUTH_PASSWORD        = 'AcmeTest2026!';
const AUTH_DISPLAY_NAME    = 'Acme Test User';
const PREFERRED_LANGUAGE   = 'fr';

const ACTIVE_FISCAL_YEARS  = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const SHARE_CLASS_NAME     = 'Catégorie A — Actions ordinaires';

// -----------------------------------------------------------------------------
// Env loader (.env.local)
// -----------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(projectRoot, '.env.local');
  const raw = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL in .env.local');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  return env;
}

// -----------------------------------------------------------------------------
// Logging helpers
// -----------------------------------------------------------------------------
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(2)}s`;
const log  = (msg) => console.log(`[${elapsed()}] ${msg}`);
const fail = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  log('Connected to Supabase (service role).');

  // ---------------------------------------------------------------------------
  // 1. Lookup existing fixture by NEQ — guard against UUID reuse
  // ---------------------------------------------------------------------------
  log(`Checking for existing company with NEQ=${COMPANY_NEQ}...`);
  const { data: existingByNeq, error: lookupErr } = await supabase
    .from('companies')
    .select('id, legal_name_fr, neq')
    .eq('neq', COMPANY_NEQ);
  if (lookupErr) fail(`Lookup failed: ${lookupErr.message}`);

  let existingFixtureId = null;
  if (existingByNeq && existingByNeq.length > 0) {
    if (existingByNeq.length > 1) {
      fail(`Multiple companies found with NEQ=${COMPANY_NEQ}. Manual investigation required.`);
    }
    const row = existingByNeq[0];
    if (row.legal_name_fr !== COMPANY_LEGAL_NAME) {
      fail(
        `Refusing to wipe: company ${row.id} has NEQ=${COMPANY_NEQ} ` +
        `but legal_name_fr="${row.legal_name_fr}" (expected "${COMPANY_LEGAL_NAME}"). ` +
        `Manual investigation required — will not delete unknown data.`
      );
    }
    existingFixtureId = row.id;
    log(`Found existing fixture: company_id=${existingFixtureId}`);
  } else {
    log('No existing fixture — fresh insert path.');
  }

  // ---------------------------------------------------------------------------
  // 2. Wipe phase (only when existingFixtureId is set)
  // ---------------------------------------------------------------------------
  if (existingFixtureId) {
    const cid = existingFixtureId;
    log(`Wiping fixture children (scoped to company_id=${cid})...`);

    const wipeSteps = [
      ['shareholdings',         (q) => q.eq('company_id', cid)],
      ['officer_appointments',  (q) => q.eq('company_id', cid)],
      ['director_mandates',     (q) => q.eq('company_id', cid)],
      ['share_classes',         (q) => q.eq('company_id', cid)],
      ['company_people',        (q) => q.eq('company_id', cid)],
      ['company_fiscal_years',  (q) => q.eq('company_id', cid)],
      ['compliance_items',      (q) => q.eq('company_id', cid)],
      ['documents',             (q) => q.eq('company_id', cid)],
    ];

    for (const [table, scope] of wipeSteps) {
      const { error, count } = await scope(
        supabase.from(table).delete({ count: 'exact' })
      );
      if (error) fail(`Wipe ${table} failed: ${error.message}`);
      log(`  ✓ ${table}: deleted ${count ?? 0}`);
    }

    const { error: companyDelErr } = await supabase
      .from('companies').delete().eq('id', cid);
    if (companyDelErr) fail(`Wipe companies failed: ${companyDelErr.message}`);
    log(`  ✓ companies: deleted 1 (id=${cid})`);
  }

  // ---------------------------------------------------------------------------
  // 3. Auth user — wipe-by-email then create with locked UUID
  // ---------------------------------------------------------------------------
  log(`Looking up existing auth user ${AUTH_EMAIL}...`);
  const { data: { users: allAuthUsers }, error: listErr } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) fail(`auth.admin.listUsers failed: ${listErr.message}`);

  const existingAuth = (allAuthUsers ?? []).find((u) => u.email === AUTH_EMAIL);
  if (existingAuth) {
    log(`Found existing auth user (id=${existingAuth.id}). Deleting...`);
    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(existingAuth.id);
    if (delAuthErr) fail(`auth.admin.deleteUser failed: ${delAuthErr.message}`);
    log('  ✓ auth user deleted (cascades to public.users via FK ON DELETE CASCADE)');
  } else {
    log('  No existing auth user.');
  }

  log(`Creating auth user (id=${UUID.authUser})...`);
  const { data: createdAuth, error: createAuthErr } = await supabase.auth.admin.createUser({
    id:            UUID.authUser,
    email:         AUTH_EMAIL,
    password:      AUTH_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name:          AUTH_DISPLAY_NAME,
      preferred_language: PREFERRED_LANGUAGE,
    },
  });
  if (createAuthErr) fail(`auth.admin.createUser failed: ${createAuthErr.message}`);
  if (createdAuth.user.id !== UUID.authUser) {
    fail(`Auth user created with unexpected id ${createdAuth.user.id}; expected ${UUID.authUser}`);
  }
  log('  ✓ auth user created (email_confirm=true, no verification gate)');

  // ---------------------------------------------------------------------------
  // 4. public.users — upsert (handle_new_user trigger already inserted; we
  //    overlay full_name + onboarding_completed=true)
  // ---------------------------------------------------------------------------
  log('Upserting public.users row (full_name + onboarding_completed=true)...');
  const { error: usersErr } = await supabase.from('users').upsert({
    id:                   UUID.authUser,
    full_name:            AUTH_DISPLAY_NAME,
    preferred_language:   PREFERRED_LANGUAGE,
    onboarding_completed: true,
  });
  if (usersErr) fail(`users upsert failed: ${usersErr.message}`);
  log('  ✓ users row upserted');

  // ---------------------------------------------------------------------------
  // 5. companies
  // ---------------------------------------------------------------------------
  log('Inserting company...');
  const { error: compErr } = await supabase.from('companies').insert({
    id:                    UUID.company,
    user_id:               UUID.authUser,
    legal_name_fr:         COMPANY_LEGAL_NAME,
    legal_name_en:         COMPANY_LEGAL_NAME,
    incorporation_type:    COMPANY_INC_TYPE,
    incorporation_number:  null,
    corporation_number:    null,
    neq:                   COMPANY_NEQ,
    incorporation_date:    COMPANY_INC_DATE,
    province:              COMPANY_PROVINCE,
    fiscal_year_end_month: COMPANY_FYE_MONTH,
    fiscal_year_end_day:   COMPANY_FYE_DAY,
    status:                'active',
    archived_at:           null,
    archived_reason:       null,
    active_fiscal_year:    null, // schema-drift column; left NULL per CTF-1 Q2
  });
  if (compErr) fail(`companies insert failed: ${compErr.message}`);
  log(`  ✓ companies: 1 row (id=${UUID.company})`);

  // ---------------------------------------------------------------------------
  // 6. company_people × 3
  // ---------------------------------------------------------------------------
  log('Inserting people (3)...');
  const peopleRows = [
    { id: UUID.p1Sophie, full_name: 'Sophie Tremblay'  },
    { id: UUID.p2Marc,   full_name: 'Marc Lefebvre'    },
    { id: UUID.p3Elise,  full_name: 'Élise Bouchard'   },
  ].map((p) => ({
    id:                   p.id,
    company_id:           UUID.company,
    full_name:            p.full_name,
    email:                null,
    phone:                null,
    address_line1:        null,
    address_city:         null,
    address_province:     null,
    address_postal_code:  null,
    address_country:      'CA',
    is_canadian_resident: true,
  }));
  const { error: peopleErr } = await supabase.from('company_people').insert(peopleRows);
  if (peopleErr) fail(`company_people insert failed: ${peopleErr.message}`);
  log('  ✓ company_people: 3 rows');

  // ---------------------------------------------------------------------------
  // 7. director_mandates × 3 (all 3 people, active since incorporation)
  // ---------------------------------------------------------------------------
  log('Inserting director mandates (3)...');
  const directorRows = [UUID.p1Sophie, UUID.p2Marc, UUID.p3Elise].map((pid) => ({
    company_id:       UUID.company,
    person_id:        pid,
    appointment_date: COMPANY_INC_DATE,
    end_date:         null,
    end_reason:       null,
    is_active:        true,
  }));
  const { error: dirErr } = await supabase.from('director_mandates').insert(directorRows);
  if (dirErr) fail(`director_mandates insert failed: ${dirErr.message}`);
  log('  ✓ director_mandates: 3 rows');

  // ---------------------------------------------------------------------------
  // 8. share_classes × 1
  // ---------------------------------------------------------------------------
  log('Inserting share class...');
  const { error: scErr } = await supabase.from('share_classes').insert({
    id:              UUID.shareClass,
    company_id:      UUID.company,
    name:            SHARE_CLASS_NAME,
    type:            'common',
    voting_rights:   true,
    votes_per_share: 1,
    max_quantity:    null, // unlimited authorized — matches onboarding default
  });
  if (scErr) fail(`share_classes insert failed: ${scErr.message}`);
  log(`  ✓ share_classes: 1 row (id=${UUID.shareClass})`);

  // ---------------------------------------------------------------------------
  // 9. shareholdings × 2 (P1=60, P2=40; P3 has no shares)
  // ---------------------------------------------------------------------------
  log('Inserting shareholdings (2)...');
  // Atom 2 (Q-R-G2-A): Pattern β2 RPC per row. Loop replaces the prior bulk
  // insert; cross-row atomicity is not load-bearing for a fixture seed
  // (fail() implements abort-on-error semantics). Individual-only holders.
  const shareholdingRows = [
    { person_id: UUID.p1Sophie, quantity: 60, certificate_number: '001' },
    { person_id: UUID.p2Marc,   quantity: 40, certificate_number: '002' },
  ];
  for (const sh of shareholdingRows) {
    const { error: shErr } = await supabase.rpc('create_shareholding_with_holders', {
      p_shareholding: {
        company_id:            UUID.company,
        share_class_id:        UUID.shareClass,
        quantity:              sh.quantity,
        issue_date:            COMPANY_INC_DATE,
        issue_price_per_share: null,
        certificate_number:    sh.certificate_number,
      },
      p_holders: [
        { holder_type: 'individual', person_id: sh.person_id },
      ],
    });
    if (shErr) fail(`shareholdings insert failed (cert ${sh.certificate_number}): ${shErr.message}`);
  }
  log('  ✓ shareholdings: 2 rows (60/40 split)');

  // ---------------------------------------------------------------------------
  // 10. officer_appointments × 2 (P1=President, P2=Treasurer; P3 no officer role)
  // ---------------------------------------------------------------------------
  log('Inserting officer appointments (2)...');
  const officerRows = [
    { person_id: UUID.p1Sophie, title: 'president', is_primary_signing_authority: true  },
    { person_id: UUID.p2Marc,   title: 'treasurer', is_primary_signing_authority: false },
  ].map((o) => ({
    company_id:                   UUID.company,
    person_id:                    o.person_id,
    title:                        o.title,
    custom_title:                 null,
    is_primary_signing_authority: o.is_primary_signing_authority,
    appointment_date:             COMPANY_INC_DATE,
    end_date:                     null,
    is_active:                    true,
  }));
  const { error: offErr } = await supabase.from('officer_appointments').insert(officerRows);
  if (offErr) fail(`officer_appointments insert failed: ${offErr.message}`);
  log('  ✓ officer_appointments: 2 rows');

  // ---------------------------------------------------------------------------
  // 11. company_fiscal_years × 8 (2019–2026; 2018 excluded by 8-year cap)
  // ---------------------------------------------------------------------------
  log(`Inserting active fiscal years (${ACTIVE_FISCAL_YEARS.length})...`);
  const fyRows = ACTIVE_FISCAL_YEARS.map((year) => ({
    company_id: UUID.company,
    year,
    status:     'active',
  }));
  const { error: fyErr } = await supabase.from('company_fiscal_years').insert(fyRows);
  if (fyErr) fail(`company_fiscal_years insert failed: ${fyErr.message}`);
  log(`  ✓ company_fiscal_years: ${ACTIVE_FISCAL_YEARS.length} rows`);

  // ---------------------------------------------------------------------------
  // 12. Final summary
  // ---------------------------------------------------------------------------
  console.log('');
  console.log('============================================================');
  console.log(' FIXTURE LOGIN CREDENTIALS');
  console.log(' URL:      https://zapokay.vercel.app');
  console.log(` Email:    ${AUTH_EMAIL}`);
  console.log(` Password: ${AUTH_PASSWORD}`);
  console.log('============================================================');
  console.log('');
  console.log(`Seeded: ${COMPANY_LEGAL_NAME}`);
  console.log(`  Company UUID:      ${UUID.company}`);
  console.log(`  Auth user UUID:    ${UUID.authUser}`);
  console.log(`  P1 Sophie:         ${UUID.p1Sophie}`);
  console.log(`  P2 Marc:           ${UUID.p2Marc}`);
  console.log(`  P3 Élise:          ${UUID.p3Elise}`);
  console.log(`  Share class UUID:  ${UUID.shareClass}`);
  console.log(`  Active FYs:        ${ACTIVE_FISCAL_YEARS.join(', ')}`);
  console.log(`  Documents:         0 (naked fixture by design)`);
  console.log(`  Storage objects:   0`);
  console.log(`  Total time:        ${elapsed()}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});
