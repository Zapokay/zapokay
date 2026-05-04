// One-off investigation probe — PDF-FY-CURRENTYEAR-1.
// Downloads bytes from a Supabase storage URL and extracts text via pdf-parse,
// then reports occurrences of "Exercice fiscal <YYYY>" / "Fiscal Year <YYYY>"
// to determine what year string is *actually rendered into the PDF body*
// (not metadata, not raw byte search).
//
// Run: node scripts/probe-pdf-text.mjs <storagePath>
//   storagePath = path inside the 'documents' bucket, e.g.
//     aceaceac-0000-4000-8000-000000000002/lsaq_annual_board_resolution_Acme_Test_inc_2026-05-04.pdf
//
// Read-only: GET on storage REST. No writes.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }

const storagePath = process.argv[2];
if (!storagePath) { console.error('Usage: node scripts/probe-pdf-text.mjs <storagePath>'); process.exit(1); }

// Download via service-role REST.
const dlUrl = `${url}/storage/v1/object/documents/${storagePath}`;
const res = await fetch(dlUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) { console.error('Download failed:', res.status, await res.text()); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
console.log('Downloaded bytes:', buf.length);

// Parse and dump full text.
const parser = new PDFParse({ data: buf });
const result = await parser.getText();
await parser.destroy();

const fullText = result.text || '';
console.log('--- BEGIN EXTRACTED TEXT ---');
console.log(fullText);
console.log('--- END EXTRACTED TEXT ---');

// Pattern hits.
const patterns = [
  /Exercice fiscal\s+(\d{4})/g,
  /Fiscal Year\s+(\d{4})/g,
  /\b20\d{2}\b/g,
];
for (const p of patterns) {
  const hits = [...fullText.matchAll(p)].map(m => m[0]);
  console.log(`Pattern ${p}:`, hits);
}
