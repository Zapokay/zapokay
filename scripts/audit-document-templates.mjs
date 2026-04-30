// One-off read-only audit — Path C Phase 1, brief 2026-04-29.
// Dumps document_templates rows and computes column-population + distribution
// aggregates in-script (Supabase REST has no generic GROUP BY without a stored fn,
// and we are investigation-only — no schema changes).
//
// Run: node scripts/audit-document-templates.mjs
// Output: structured JSON to stdout, intended to be pasted verbatim into
//         docs/audit-template-architecture-phase1-2026-04-29.md Section 2.
//
// Read-only: makes a single GET to /rest/v1/document_templates. No writes,
// no RPC, no schema touches.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }

// A.1 — full row dump (NULLS LAST on created_at).
const res = await fetch(
  `${url}/rest/v1/document_templates?select=*&order=created_at.asc.nullslast`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1); }
const rows = await res.json();

// --- A.1 raw dump ---
console.log('=== A.1 — Full row dump ===');
console.log(`row_count=${rows.length}`);
console.log(JSON.stringify(rows, null, 2));

// --- A.2 per-column population summary ---
// Mirrors brief A.2: COUNT(col) semantics = non-null count.
const cols = [
  'template_key', 'title_fr', 'title_en',
  'template_body_fr', 'template_body_en',
  'variables', 'validated_at', 'deprecated_at', 'effective_date',
];
const distinctCols = ['framework', 'jurisdiction', 'document_type', 'status'];
const summary = { total_rows: rows.length };
for (const c of cols) {
  summary[`has_${c}`] = rows.filter(r => r[c] !== null && r[c] !== undefined).length;
}
for (const c of distinctCols) {
  const vals = new Set(rows.map(r => r[c]).filter(v => v !== null && v !== undefined));
  summary[`distinct_${c}s`] = vals.size;
  summary[`distinct_${c}_values`] = [...vals];
}
console.log('\n=== A.2 — Per-column population summary ===');
console.log(JSON.stringify(summary, null, 2));

// --- A.3 distribution by (status, framework, jurisdiction, document_type) ---
const groups = new Map();
for (const r of rows) {
  const k = JSON.stringify({
    status: r.status ?? null,
    framework: r.framework ?? null,
    jurisdiction: r.jurisdiction ?? null,
    document_type: r.document_type ?? null,
  });
  groups.set(k, (groups.get(k) ?? 0) + 1);
}
const dist = [...groups.entries()]
  .map(([k, count]) => ({ ...JSON.parse(k), count }))
  .sort((a, b) => b.count - a.count);
console.log('\n=== A.3 — Distribution by status/framework/jurisdiction/document_type ===');
console.log(JSON.stringify(dist, null, 2));

// --- A.4 reminder ---
// A.4 is a code grep, not SQL. Run separately:
//   grep -rn 'document_templates' --include='*.ts' --include='*.tsx' .
console.log('\n=== A.4 — see Grep step (run outside this script) ===');
