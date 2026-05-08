// Schema drift probe — investigation-only (Sprint 10 pre-work, brief 2026-05-07).
// READ-ONLY. PostgREST GET only. No PATCH/POST/DELETE/RPC mutations.
//
// Strategy: PostgREST cannot directly query information_schema, so we use
// Supabase's OpenAPI endpoint (`/rest/v1/`) which returns a full Swagger doc
// listing every table exposed in the public schema with its column definitions
// (name, type, format, nullable, default, description). Then we dump
// representative rows from key tables to characterize seed data and the actual
// column shape.
//
// Output: structured JSON to stdout, intended for direct inclusion in
// docs/schema-drift-audit-2026-05-07.md.
//
// Run: node scripts/probe-schema-drift-2026-05-07.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';

const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => env.split('\n').find((l) => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const headers = { apikey: key, Authorization: 'Bearer ' + key };

// ---------------------------------------------------------------------------
// Step 1 — OpenAPI introspection (PostgREST Swagger spec)
// ---------------------------------------------------------------------------
console.log('=== STEP 1 — OpenAPI schema introspection ===');
const openapiRes = await fetch(url + '/rest/v1/', { headers: { ...headers, Accept: 'application/openapi+json' } });
if (!openapiRes.ok) {
  console.error('OpenAPI fetch failed:', openapiRes.status, await openapiRes.text());
  process.exit(1);
}
const openapi = await openapiRes.json();

// Extract table names + columns from definitions
const definitions = openapi.definitions ?? {};
const tableNames = Object.keys(definitions).sort();
console.log('Tables exposed via PostgREST: ' + tableNames.length);
console.log(JSON.stringify(tableNames, null, 2));

// Per-table column inventory.
console.log('\n=== STEP 2 — Per-table column inventory ===');
const schemaSnapshot = {};
for (const tName of tableNames) {
  const def = definitions[tName];
  const props = def.properties ?? {};
  const required = new Set(def.required ?? []);
  const cols = {};
  for (const [colName, colDef] of Object.entries(props)) {
    cols[colName] = {
      type: colDef.type ?? null,
      format: colDef.format ?? null,
      default: colDef.default ?? null,
      description: colDef.description ?? null,
      nullable: !required.has(colName),
      enum: colDef.enum ?? null,
      maxLength: colDef.maxLength ?? null,
    };
  }
  schemaSnapshot[tName] = cols;
}
console.log(JSON.stringify(schemaSnapshot, null, 2));

// ---------------------------------------------------------------------------
// Step 3 — Seed-data inventory for minute_book_requirements
// ---------------------------------------------------------------------------
console.log('\n=== STEP 3 — minute_book_requirements full row dump ===');
const mbrRes = await fetch(
  url + '/rest/v1/minute_book_requirements?select=*&order=sort_order.asc.nullslast,requirement_key.asc',
  { headers },
);
if (!mbrRes.ok) {
  console.error('minute_book_requirements fetch failed:', mbrRes.status, await mbrRes.text());
} else {
  const mbr = await mbrRes.json();
  console.log('row_count=' + mbr.length);
  console.log(JSON.stringify(mbr, null, 2));

  // Distribution summaries (computed in JS — no aggregate SQL).
  const byCategory = {};
  const bySection = {};
  const byFramework = {};
  const byJurisdiction = {};
  for (const r of mbr) {
    byCategory[r.category ?? '<null>'] = (byCategory[r.category ?? '<null>'] ?? 0) + 1;
    bySection[r.section ?? '<null>'] = (bySection[r.section ?? '<null>'] ?? 0) + 1;
    byFramework[r.framework ?? '<null>'] = (byFramework[r.framework ?? '<null>'] ?? 0) + 1;
    byJurisdiction[r.jurisdiction ?? '<null>'] = (byJurisdiction[r.jurisdiction ?? '<null>'] ?? 0) + 1;
  }
  console.log('\n--- minute_book_requirements distributions ---');
  console.log(JSON.stringify({ byCategory, bySection, byFramework, byJurisdiction }, null, 2));
}

// ---------------------------------------------------------------------------
// Step 4 — Seed-data inventory for document_templates
// ---------------------------------------------------------------------------
console.log('\n=== STEP 4 — document_templates row dump ===');
const dtRes = await fetch(
  url + '/rest/v1/document_templates?select=template_key,framework,jurisdiction,document_type,status,title_fr,validated_at,deprecated_at&order=template_key.asc',
  { headers },
);
if (!dtRes.ok) {
  console.log('document_templates fetch failed (table may not exist):', dtRes.status);
} else {
  const dt = await dtRes.json();
  console.log('row_count=' + dt.length);
  console.log(JSON.stringify(dt, null, 2));
}

// ---------------------------------------------------------------------------
// Step 5 — documents table column probe via row sample
// ---------------------------------------------------------------------------
console.log('\n=== STEP 5 — documents column-shape probe (one row) ===');
const docRes = await fetch(url + '/rest/v1/documents?select=*&limit=1', { headers });
if (docRes.ok) {
  const docs = await docRes.json();
  if (docs.length > 0) {
    console.log('column_keys=' + JSON.stringify(Object.keys(docs[0]).sort()));
    console.log('sample_row=');
    // Redact actual content but keep keys + types.
    const types = {};
    for (const [k, v] of Object.entries(docs[0])) {
      types[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    }
    console.log(JSON.stringify(types, null, 2));
  } else {
    console.log('no rows in documents');
  }
} else {
  console.log('documents fetch failed:', docRes.status);
}

// ---------------------------------------------------------------------------
// Step 6 — companies column probe
// ---------------------------------------------------------------------------
console.log('\n=== STEP 6 — companies column-shape probe (one row) ===');
const compRes = await fetch(url + '/rest/v1/companies?select=*&limit=1', { headers });
if (compRes.ok) {
  const comps = await compRes.json();
  if (comps.length > 0) {
    console.log('column_keys=' + JSON.stringify(Object.keys(comps[0]).sort()));
    const types = {};
    for (const [k, v] of Object.entries(comps[0])) {
      types[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    }
    console.log(JSON.stringify(types, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Step 7 — users column probe
// ---------------------------------------------------------------------------
console.log('\n=== STEP 7 — users column-shape probe (one row) ===');
const uRes = await fetch(url + '/rest/v1/users?select=*&limit=1', { headers });
if (uRes.ok) {
  const us = await uRes.json();
  if (us.length > 0) {
    console.log('column_keys=' + JSON.stringify(Object.keys(us[0]).sort()));
    const types = {};
    for (const [k, v] of Object.entries(us[0])) {
      types[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    }
    console.log(JSON.stringify(types, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Step 8 — Probe candidate "extra" tables that are referenced in code but
//          not declared in any committed migration.
// ---------------------------------------------------------------------------
console.log('\n=== STEP 8 — Candidate-extra-table existence probes ===');
const candidates = [
  'minute_book_requirements',
  'company_fiscal_years',
  'feature_flags',
  'waitlist_emails',
  'activity_log',
  'document_templates',
  'company_officers_deprecated',
  'reminders',
];
for (const t of candidates) {
  const r = await fetch(url + '/rest/v1/' + t + '?select=*&limit=1', { headers });
  console.log(t + ': HTTP ' + r.status + (r.ok ? ' (exists, exposed via PostgREST)' : ''));
  if (r.ok) {
    const j = await r.json();
    if (j.length > 0) console.log('  cols=' + JSON.stringify(Object.keys(j[0]).sort()));
    else console.log('  (table exists but empty)');
  }
}

// ---------------------------------------------------------------------------
// Step 9 — activity_log row count + recent rows shape
// ---------------------------------------------------------------------------
console.log('\n=== STEP 9 — activity_log column shape (most recent 1 row) ===');
const alRes = await fetch(url + '/rest/v1/activity_log?select=*&order=created_at.desc&limit=1', { headers });
if (alRes.ok) {
  const al = await alRes.json();
  if (al.length > 0) {
    console.log('column_keys=' + JSON.stringify(Object.keys(al[0]).sort()));
    const types = {};
    for (const [k, v] of Object.entries(al[0])) {
      types[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    }
    console.log(JSON.stringify(types, null, 2));
  } else {
    console.log('activity_log empty');
  }
}

// ---------------------------------------------------------------------------
// Step 10 — company_fiscal_years column shape
// ---------------------------------------------------------------------------
console.log('\n=== STEP 10 — company_fiscal_years column shape (1 row) ===');
const cfyRes = await fetch(url + '/rest/v1/company_fiscal_years?select=*&limit=1', { headers });
if (cfyRes.ok) {
  const cfy = await cfyRes.json();
  if (cfy.length > 0) {
    console.log('column_keys=' + JSON.stringify(Object.keys(cfy[0]).sort()));
    const types = {};
    for (const [k, v] of Object.entries(cfy[0])) {
      types[k] = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    }
    console.log(JSON.stringify(types, null, 2));
  }
}

console.log('\n=== DONE ===');
