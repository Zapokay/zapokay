/**
 * share_transfer render-gate harness (WA #15 dual-locale visual gate).
 *
 * Generates a REAL share_transfer resolution PDF against the Acme Test inc.
 * fixture, once in FR and once in EN, so Dom can eyeball the YELLOW
 * transfer-restrictions recital (Harvey Form A, 2026-06-12) in both locales
 * before the lifecycle-templates.ts edit is committed.
 *
 *   npx tsx scripts/render-share-transfer-gate.ts
 *
 * GENERATE + KEEP (Dom's call): this script does NOT clean up. Each render
 * persists a `documents` row + `event_documents` link + a storage object on
 * the Acme fixture; the script LOGS the document id + storage path + title for
 * each so nothing is orphaned silently. No cleanup, no deletes.
 *
 * Mirrors scripts/test-lifecycle-generate.ts's env/client setup (service-role
 * client, .env.local loader). Makes NO production-code change.
 *
 * eventId is a `share_transfers.id` (§8.59 — the orchestrator's share_transfer
 * arm looks the event up in share_transfers, NOT shareholdings).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  generateLifecycleDocument,
  type LifecycleLanguage,
} from '@/lib/pdf/generate-lifecycle-document';

// ─── Env loader (no dotenv dep — mirrors test-lifecycle-generate.ts) ─────────

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Render target ───────────────────────────────────────────────────────────

const ACME_COMPANY_ID = 'aceaceac-0000-4000-8000-000000000002';
// Sentinel user UUID for activity_log; orchestrator does not validate it and
// logActivity swallows errors if the FK rejects (matches test-lifecycle-generate.ts).
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const RESOLUTION_DATE = new Date().toISOString().slice(0, 10);

// Unpriced Acme transfer (consideration NULL → considerationClause renders
// empty) — confirmed read-only in Step 0. share_transfers.id, NOT a shareholding id.
const SHARE_TRANSFER_EVENT_ID = '6f516be8-a86e-4153-8b87-4b46a52f69fd';

async function renderOne(language: LifecycleLanguage): Promise<void> {
  console.log(`\n──────── Generating share_transfer (${language.toUpperCase()}) ────────`);
  const result = await generateLifecycleDocument({
    supabaseAdmin,
    userId: TEST_USER_ID,
    companyId: ACME_COMPANY_ID,
    docKey: 'share_transfer',
    eventId: SHARE_TRANSFER_EVENT_ID,
    resolutionDate: RESOLUTION_DATE,
    language,
  });
  console.log(`  ✓ documentId : ${result.documentId}`);
  console.log(`    title      : ${result.title}`);
  console.log(`    fileName   : ${result.fileName}`);
  console.log(`    fileUrl    : ${result.fileUrl}`);
  console.log(`    storagePath: ${ACME_COMPANY_ID}/${result.fileName}`);
}

async function main(): Promise<void> {
  console.log('share_transfer render-gate harness (generate + KEEP, no cleanup)');
  console.log(`  company       : ${ACME_COMPANY_ID} (Acme Test inc.)`);
  console.log(`  eventId       : ${SHARE_TRANSFER_EVENT_ID} (share_transfers.id, unpriced)`);
  console.log(`  resolutionDate: ${RESOLUTION_DATE}`);

  await renderOne('fr');
  await renderOne('en');

  console.log('\n✓ Done — 2 documents created (1 FR, 1 EN). No cleanup performed (generate + keep).');
}

main().catch((err) => {
  console.error('\n✗ Render failed:', err);
  process.exit(1);
});
