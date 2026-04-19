// One-off read-only audit — Phase 4b.3 addendum.
// Dumps all minute_book_requirements rows so we can cross-check the classifier.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }

const res = await fetch(`${url}/rest/v1/minute_book_requirements?select=requirement_key,category,jurisdiction,framework,section,title_fr,sort_order&order=sort_order.asc`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1); }
const rows = await res.json();
console.log(`count=${rows.length}`);
console.log(JSON.stringify(rows, null, 2));
