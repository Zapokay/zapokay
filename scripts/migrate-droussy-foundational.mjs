// Phase 2 migration — droussy foundational document_year → NULL.
// Bundle 3 follow-up. Single-step (Part A only — Phase 1 confirmed all
// affected rows already have requirement_year=NULL, so Part B is unneeded).
//
// Defensive patterns:
//   - Bracket notation throughout (no obj.method, no template literals)
//   - Canonical-source IN list — fetched fresh from minute_book_requirements,
//     NOT hand-typed
//   - Idempotency guard: document_year=not.is.null filter, safe to retry
//   - Pre-flight SELECT count BEFORE the PATCH; if it disagrees with the
//     PATCH response count we abort verification
//   - Prefer: return=representation so the PATCH echoes affected rows
//   - Exit non-zero on any non-2xx
//   - Scoped to droussy company_id only
//
// READ + WRITE on `documents` table. PATCH only — no INSERT, DELETE, or
// schema changes. Storage objects untouched.
//
// Run: node scripts/migrate-droussy-foundational.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';

const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => {
  const line = env['split']('\n')['find']((l) => l['startsWith'](k + '='));
  if (!line) return undefined;
  return line['split']('=')['slice'](1)['join']('=')['trim']();
};

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console['error']('Missing Supabase env');
  process['exit'](1);
}

const droussy = '963a9033-cace-4bd4-8ff6-f07873cbd7e4';
const headersJSON = {
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};
const headersGET = { apikey: key, Authorization: 'Bearer ' + key };

// ---------------------------------------------------------------------------
// Step 1 — Fetch canonical foundational requirement_keys (fresh, not memory)
// ---------------------------------------------------------------------------
const keysUrl =
  url +
  '/rest/v1/minute_book_requirements' +
  '?select=requirement_key' +
  '&category=eq.foundational' +
  '&order=requirement_key.asc';

const keysRes = await fetch(keysUrl, { headers: headersGET });
if (!keysRes['ok']) {
  console['error']('Canonical keys fetch failed:', keysRes['status'], await keysRes['text']());
  process['exit'](1);
}
const keysJson = await keysRes['json']();
const keys = keysJson['map']((r) => r['requirement_key']);
const inList = keys['map']((k) => '"' + k + '"')['join'](',');
console['log']('Canonical foundational keys fetched: ' + keys['length']);

// ---------------------------------------------------------------------------
// Step 2 — Pre-flight SELECT (count rows the PATCH will affect)
// ---------------------------------------------------------------------------
const preUrl =
  url +
  '/rest/v1/documents' +
  '?select=id,requirement_key,document_year' +
  '&company_id=eq.' + droussy +
  '&document_year=not.is.null' +
  '&requirement_key=in.(' + inList + ')' +
  '&order=requirement_key.asc';

const preRes = await fetch(preUrl, { headers: headersGET });
if (!preRes['ok']) {
  console['error']('Pre-flight SELECT failed:', preRes['status'], await preRes['text']());
  process['exit'](1);
}
const preRows = await preRes['json']();
console['log']('\n=== Pre-flight: rows that PATCH will affect ===');
console['log']('Pre-flight count: ' + preRows['length']);
console['table'](preRows);

if (preRows['length'] === 0) {
  console['log']('\nNothing to migrate. Exiting cleanly (idempotent no-op).');
  process['exit'](0);
}

// ---------------------------------------------------------------------------
// Step 3 — PATCH document_year=NULL with same WHERE filters as pre-flight
// ---------------------------------------------------------------------------
const patchUrl =
  url +
  '/rest/v1/documents' +
  '?company_id=eq.' + droussy +
  '&document_year=not.is.null' +
  '&requirement_key=in.(' + inList + ')';

const patchRes = await fetch(patchUrl, {
  method: 'PATCH',
  headers: headersJSON,
  body: JSON.stringify({ document_year: null }),
});

console['log']('\n=== PATCH response ===');
console['log']('HTTP status: ' + patchRes['status']);

if (!patchRes['ok']) {
  console['error']('PATCH failed:', patchRes['status'], await patchRes['text']());
  process['exit'](1);
}

const patchRows = await patchRes['json']();
console['log']('Updated row count: ' + patchRows['length']);
console['table'](
  patchRows['map']((r) => ({
    id: r['id'],
    requirement_key: r['requirement_key'],
    document_year: r['document_year'],
    requirement_year: r['requirement_year'],
  })),
);

// ---------------------------------------------------------------------------
// Step 4 — Sanity check pre-flight vs PATCH counts agree
// ---------------------------------------------------------------------------
console['log']('\n=== Count reconciliation ===');
console['log']('Pre-flight count: ' + preRows['length']);
console['log']('PATCH count:      ' + patchRows['length']);
if (preRows['length'] !== patchRows['length']) {
  console['error']('MISMATCH — pre-flight and PATCH counts differ. Investigate before re-running.');
  process['exit'](2);
}
console['log']('Counts agree. Migration step complete.');
console['log']('\nRun scripts/probe-droussy-foundational.mjs to independently verify post-state.');
