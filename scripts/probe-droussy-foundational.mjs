// Phase 1 investigation — droussy Bundle 3 migration.
// READ-ONLY. PostgREST GETs only. No PATCH, no UPDATE, no DELETE.
//
// Reports:
//   Q1 — canonical foundational requirement_keys
//   Q2 — droussy foundational rows with document_year NOT NULL (migration target)
//   Q2b — ALL droussy foundational rows (full picture, includes potential
//         requirement_year-only Part-B candidates)
//   Summary stats
//   Memory cross-check (Tier 1 #6 v3.34) vs canonical source
//
// Property access uses bracket notation throughout to defeat any chat-layer
// linkifier that mangles `word.word` patterns when displayed.
//
// Run: node scripts/probe-droussy-foundational.mjs

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
const headers = { apikey: key, Authorization: 'Bearer ' + key };

// ---------------------------------------------------------------------------
// Q1 — canonical foundational requirement_keys
// ---------------------------------------------------------------------------
const q1Url =
  url +
  '/rest/v1/minute_book_requirements' +
  '?select=requirement_key' +
  '&category=eq.foundational' +
  '&order=requirement_key.asc';

const q1Res = await fetch(q1Url, { headers });
if (!q1Res['ok']) {
  console['error']('Q1 failed:', q1Res['status'], await q1Res['text']());
  process['exit'](1);
}
const q1 = await q1Res['json']();
console['log']('=== Q1: Canonical foundational requirement_keys (' + q1['length'] + ' total) ===');
for (const row of q1) console['log']('  - ' + row['requirement_key']);

const keys = q1['map']((r) => r['requirement_key']);
const inList = keys['map']((k) => '"' + k + '"')['join'](',');

// ---------------------------------------------------------------------------
// Q2 — droussy foundational rows with document_year NOT NULL
//      (the rows the migration UPDATE will target)
// ---------------------------------------------------------------------------
const q2Url =
  url +
  '/rest/v1/documents' +
  '?select=id,requirement_key,document_year,requirement_year,title,file_url' +
  '&company_id=eq.' + droussy +
  '&document_year=not.is.null' +
  '&requirement_key=in.(' + inList + ')' +
  '&order=requirement_key.asc';

const q2Res = await fetch(q2Url, { headers });
if (!q2Res['ok']) {
  console['error']('Q2 failed:', q2Res['status'], await q2Res['text']());
  process['exit'](1);
}
const q2 = await q2Res['json']();
console['log']('\n=== Q2: droussy foundational rows with document_year NOT NULL ===');
console['log']('Affected row count: ' + q2['length']);
console['table'](q2);

// ---------------------------------------------------------------------------
// Q2b — ALL droussy foundational rows (full picture)
// ---------------------------------------------------------------------------
const q2bUrl =
  url +
  '/rest/v1/documents' +
  '?select=id,requirement_key,document_year,requirement_year,title' +
  '&company_id=eq.' + droussy +
  '&requirement_key=in.(' + inList + ')' +
  '&order=requirement_key.asc';

const q2bRes = await fetch(q2bUrl, { headers });
if (!q2bRes['ok']) {
  console['error']('Q2b failed:', q2bRes['status'], await q2bRes['text']());
  process['exit'](1);
}
const q2b = await q2bRes['json']();
console['log']('\n=== Q2b: ALL droussy foundational rows (full picture) ===');
console['log']('Total foundational rows for droussy: ' + q2b['length']);
console['table'](q2b);

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------
const docYearNonNull = q2b['filter']((r) => r['document_year'] !== null)['length'];
const reqYearNonNull = q2b['filter']((r) => r['requirement_year'] !== null)['length'];
const bothNonNull = q2b['filter']((r) => r['document_year'] !== null && r['requirement_year'] !== null)['length'];
const reqYearOnly = q2b['filter']((r) => r['document_year'] === null && r['requirement_year'] !== null)['length'];

console['log']('\n=== Summary ===');
console['log']('Total foundational rows: ' + q2b['length']);
console['log']('  with document_year NOT NULL:           ' + docYearNonNull + '  (Part A target)');
console['log']('  with requirement_year NOT NULL:        ' + reqYearNonNull + '  (Part B target if > 0)');
console['log']('  with BOTH NOT NULL:                    ' + bothNonNull);
console['log']('  with requirement_year-only NOT NULL:   ' + reqYearOnly + '  (Part B but not Part A)');

// ---------------------------------------------------------------------------
// Memory cross-check (Tier 1 #6 v3.34) vs canonical source
// ---------------------------------------------------------------------------
const memoryKeys = [
  'lsaq_souscription_actions',
  'lsaq_statuts_constitution',
  'lsaq_declaration_initiale',
  'lsaq_acceptation_mandat',
  'lsaq_reglement_interieur',
  'lsaq_premiere_resolution_actionnaires',
];
const memoryHits = memoryKeys['filter']((k) => keys['includes'](k));
const memoryMisses = memoryKeys['filter']((k) => !keys['includes'](k));
const canonExtras = keys['filter']((k) => !memoryKeys['includes'](k));

console['log']('\n=== Memory cross-check (Tier 1 #6 v3.34) ===');
console['log']('Memory keys present in canonical-foundational:    ' + JSON['stringify'](memoryHits));
console['log']('Memory keys NOT in canonical-foundational:        ' + JSON['stringify'](memoryMisses));
console['log']('Canonical-foundational keys NOT in memory list:   ' + JSON['stringify'](canonExtras));
