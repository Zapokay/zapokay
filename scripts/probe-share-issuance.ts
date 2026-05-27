/**
 * #19d Share-Issuance slice — WA #15 dual-locale visual gate (script path).
 *
 * Enumerates ALL Acme active post-incorporation shareholdings and runs the
 * 3-generation cycle (FR, EN, FR-control) through the REAL
 * `generateLifecycleDocument` orchestrator against each one. For each PDF
 * the body text is extracted via pdf-parse and the locale-specific body
 * fragments + price phrase + formatDate-rendered dates are verified.
 * Closes each holding's cycle with a §8.55 newest-wins smoke check on
 * `event_documents`. Final report includes priced/unpriced branch coverage.
 *
 * No mutations beyond inserts. Generated rows are intentionally left in
 * place so Tier 4 #135 orphan accumulation can be reviewed.
 *
 * Run via:
 *   npx tsx scripts/probe-share-issuance.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';

import { generateLifecycleDocument } from '@/lib/pdf/generate-lifecycle-document';
import { formatDate } from '@/lib/utils';

// ─── Env loader ────────────────────────────────────────────────────────────

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

const ACME_COMPANY_ID = 'aceaceac-0000-4000-8000-000000000002';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const RESOLUTION_DATE = new Date().toISOString().slice(0, 10);

// ─── Holding enumerator ────────────────────────────────────────────────────

interface PickedHolding {
  id: string;
  quantity: number;
  issue_date: string;
  issue_price_per_share: number | null;
  share_class_name: string;
  holder_name: string;
}

async function getIncorporationDate(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('incorporation_date')
    .eq('id', ACME_COMPANY_ID)
    .single();
  if (error || !data) throw new Error(`Acme company load failed: ${error?.message}`);
  const incDate = (data as { incorporation_date: string | null }).incorporation_date;
  if (!incDate) throw new Error('Acme has no incorporation_date');
  return incDate;
}

async function enumerateActivePostIncorpHoldings(): Promise<PickedHolding[]> {
  const incDate = await getIncorporationDate();
  console.log(`  Acme incorporation_date: ${incDate}`);

  const { data, error } = await supabaseAdmin
    .from('shareholdings')
    .select(`
      id, quantity, issue_date, issue_price_per_share, end_date,
      share_classes(name),
      shareholding_holders(holder_type, display_order,
        person:company_people(full_name),
        entity:shareholder_entities(legal_name)
      )
    `)
    .eq('company_id', ACME_COMPANY_ID)
    .is('end_date', null)
    .gt('issue_date', incDate)
    .order('issue_date', { ascending: true });

  if (error) throw new Error(`shareholdings query failed: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    quantity: number;
    issue_date: string;
    issue_price_per_share: number | null;
    share_classes: { name: string } | null;
    shareholding_holders: Array<{
      holder_type: 'individual' | 'entity';
      display_order: number | null;
      person: { full_name: string | null } | null;
      entity: { legal_name: string | null } | null;
    }> | null;
  }>;

  return rows.map((row) => {
    const className = row.share_classes?.name;
    if (!className) throw new Error(`share class missing on holding ${row.id}`);
    const ordered = (row.shareholding_holders ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const first = ordered[0];
    const holderName =
      first?.person?.full_name ?? first?.entity?.legal_name ?? '(unknown holder)';
    return {
      id: row.id,
      quantity: row.quantity,
      issue_date: row.issue_date,
      issue_price_per_share: row.issue_price_per_share,
      share_class_name: className,
      holder_name: holderName,
    };
  });
}

// ─── PDF download + extract ────────────────────────────────────────────────

async function downloadPdfText(fileName: string): Promise<string> {
  const storagePath = `${ACME_COMPANY_ID}/${fileName}`;
  const dlUrl = `${SUPABASE_URL}/storage/v1/object/documents/${storagePath}`;
  const res = await fetch(dlUrl, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`PDF download failed: ${res.status} ${await res.text()}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const parsed = await parser.getText();
  await parser.destroy();
  return parsed.text ?? '';
}

// ─── Fragment-check helpers ────────────────────────────────────────────────

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

function checkContains(label: string, hay: string, needle: string): Check {
  const ok = hay.includes(needle);
  return {
    label,
    ok,
    detail: ok ? `found "${needle}"` : `MISSING "${needle}"`,
  };
}

function reportChecks(checks: Check[]): boolean {
  let allOk = true;
  for (const c of checks) {
    const tag = c.ok ? '    ✓' : '    ✗';
    console.log(`${tag} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
    if (!c.ok) allOk = false;
  }
  return allOk;
}

// ─── One generation ────────────────────────────────────────────────────────

interface GenOutcome {
  cycle: number;
  language: 'fr' | 'en';
  documentId: string;
  fileName: string;
  bodyText: string;
  checks: Check[];
  allChecksPassed: boolean;
}

async function runGeneration(
  cycle: number,
  language: 'fr' | 'en',
  holding: PickedHolding,
): Promise<GenOutcome> {
  console.log(`\n  --- Generation ${cycle} — language=${language} ---`);

  const result = await generateLifecycleDocument({
    supabaseAdmin,
    userId: TEST_USER_ID,
    companyId: ACME_COMPANY_ID,
    docKey: 'share_issuance',
    eventId: holding.id,
    resolutionDate: RESOLUTION_DATE,
    language,
  });
  console.log(`    documentId=${result.documentId}`);
  console.log(`    fileName=${result.fileName}`);

  const text = await downloadPdfText(result.fileName);
  // pdf-parse injects \n based on visual line wrap; collapse whitespace so
  // substring assertions don't false-fail on needles split across lines.
  // bodyText returned below stays raw so audit-doc fenced sections show
  // exactly what pdf-parse produced.
  const normalized = text.replace(/\s+/g, ' ').trim();

  const expectedEffectiveDate = formatDate(holding.issue_date, language);
  const expectedResolutionDate = formatDate(RESOLUTION_DATE, language);
  const hasPrice =
    holding.issue_price_per_share !== null && Number(holding.issue_price_per_share) > 0;

  const checks: Check[] = [];

  if (language === 'fr') {
    checks.push(checkContains('FR body fragment 1', normalized, 'est par les présentes constatée et ratifiée'));
    checks.push(checkContains('FR body fragment 2 (effective)', normalized, 'prenant effet le'));
    checks.push(checkContains('FR body fragment 3 (adopted)', normalized, 'Adoptée le'));
  } else {
    checks.push(checkContains('EN body fragment 1', normalized, 'is hereby acknowledged and ratified'));
    checks.push(checkContains('EN body fragment 2 (effective)', normalized, 'effective'));
    checks.push(checkContains('EN body fragment 3 (adopted)', normalized, 'Adopted on'));
  }

  checks.push(
    checkContains(
      `effectiveDate rendered via formatDate (locale=${language})`,
      normalized,
      expectedEffectiveDate,
    ),
  );
  checks.push(
    checkContains(
      `resolutionDate rendered via formatDate (locale=${language})`,
      normalized,
      expectedResolutionDate,
    ),
  );

  if (hasPrice) {
    const expectedFragment = language === 'fr' ? 'au prix de' : 'at a price of';
    checks.push(
      checkContains(
        `price phrase present (issue_price_per_share=${holding.issue_price_per_share})`,
        normalized,
        expectedFragment,
      ),
    );
  } else {
    const forbidden = language === 'fr' ? 'au prix de' : 'at a price of';
    const ok = !normalized.includes(forbidden);
    checks.push({
      label: `price phrase ABSENT (issue_price_per_share=${holding.issue_price_per_share ?? 'null'})`,
      ok,
      detail: ok ? `did not find "${forbidden}"` : `unexpectedly contains "${forbidden}"`,
    });
  }

  checks.push(checkContains('share class token rendered', normalized, holding.share_class_name));
  checks.push(checkContains('holder name rendered', normalized, holding.holder_name));
  checks.push(checkContains('quantity rendered', normalized, String(holding.quantity)));

  // Residual {{token}} check stays on raw text — fence-pattern search, not
  // a phrase needle, so whitespace collapse is irrelevant.
  const hasResidual = /\{\{[^}]*\}\}/.test(text);
  checks.push({
    label: 'no residual {{token}} placeholders in body',
    ok: !hasResidual,
    detail: hasResidual ? `residual matches: ${text.match(/\{\{[^}]*\}\}/g)?.join(', ')}` : 'clean',
  });

  const allOk = reportChecks(checks);

  return {
    cycle,
    language,
    documentId: result.documentId,
    fileName: result.fileName,
    bodyText: text,
    checks,
    allChecksPassed: allOk,
  };
}

// ─── Newest-wins smoke check ───────────────────────────────────────────────

async function newestWinsCheck(
  holdingId: string,
  outcomes: GenOutcome[],
): Promise<{ ok: boolean; rowCount: number; rows: Array<{ document_id: string; created_at: string }> }> {
  const { data, error } = await supabaseAdmin
    .from('event_documents')
    .select('id, document_id, event_type, event_id, event_phase, created_at')
    .eq('event_type', 'shareholding')
    .eq('event_id', holdingId)
    .eq('event_phase', 'issuance')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`  ✗ event_documents query failed: ${error.message}`);
    return { ok: false, rowCount: 0, rows: [] };
  }

  const rows = (data ?? []) as Array<{ document_id: string; created_at: string }>;
  console.log(`\n  Newest-wins (§8.55) — event_documents DESC by created_at:`);
  for (const r of rows) console.log(`    ${r.created_at}  document_id=${r.document_id}`);

  const gen3 = outcomes.find((o) => o.cycle === 3);
  if (!gen3) return { ok: false, rowCount: rows.length, rows };
  if (rows.length < 3) {
    console.error(`    ✗ expected ≥3 rows, got ${rows.length}`);
    return { ok: false, rowCount: rows.length, rows };
  }
  const ok = rows[0].document_id === gen3.documentId;
  if (ok) {
    console.log(`    ✓ newest row → Generation 3 (documentId=${gen3.documentId})`);
  } else {
    console.error(
      `    ✗ newest row document_id=${rows[0].document_id} ≠ Generation 3 documentId=${gen3.documentId}`,
    );
  }
  return { ok, rowCount: rows.length, rows };
}

// ─── Per-holding section emitter ───────────────────────────────────────────

interface HoldingReport {
  holding: PickedHolding;
  outcomes: GenOutcome[];
  newestOk: boolean;
  newestRowCount: number;
  exercisedPricedBranch: boolean;
  exercisedUnpricedBranch: boolean;
}

function emitHoldingSection(rep: HoldingReport): void {
  const h = rep.holding;
  console.log(
    `\n## Holding ${h.id} — ${h.quantity} shares, issued ${h.issue_date}, price ${h.issue_price_per_share ?? 'null'}`,
  );
  console.log(`- share_class: ${h.share_class_name}`);
  console.log(`- holder: ${h.holder_name}`);
  console.log(`- branch exercised: ${rep.exercisedPricedBranch ? 'PRICED' : 'UNPRICED'}`);

  for (const o of rep.outcomes) {
    console.log(`\n### Generation ${o.cycle} — ${o.language.toUpperCase()} — documentId=${o.documentId}`);
    console.log(`fileName: ${o.fileName}`);
    console.log('```');
    console.log(o.bodyText);
    console.log('```');
    console.log('Assertions:');
    for (const c of o.checks) {
      console.log(`- ${c.ok ? 'PASS' : 'FAIL'} — ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
    }
  }
  console.log(`\n### Newest-wins for this holding`);
  console.log(`- ${rep.newestOk ? 'PASS' : 'FAIL'} — rows=${rep.newestRowCount}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('# #19d Share-Issuance — service-role probe (WA #15 script path, multi-holding)');
  console.log('');
  console.log(`- company: ${ACME_COMPANY_ID}`);
  console.log(`- resolutionDate: ${RESOLUTION_DATE}`);
  console.log(`- RUN TIMESTAMP: ${new Date().toISOString()}`);

  console.log('\n## Fixture enumeration');
  const holdings = await enumerateActivePostIncorpHoldings();
  console.log(`- total eligible: ${holdings.length}`);
  for (const h of holdings) {
    console.log(
      `  - ${h.id} — qty=${h.quantity}, issue_date=${h.issue_date}, price=${h.issue_price_per_share ?? 'null'}, class=${h.share_class_name}, holder=${h.holder_name}`,
    );
  }

  if (holdings.length === 0) {
    console.error(
      '\nNo active post-incorporation shareholdings on Acme. Add at least one (ideally one priced + one unpriced) via the UI Issue Shares modal before re-running.',
    );
    process.exit(2);
  }

  const reports: HoldingReport[] = [];

  for (const holding of holdings) {
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(`# Processing holding ${holding.id}`);
    console.log(`  qty=${holding.quantity} issue_date=${holding.issue_date} price=${holding.issue_price_per_share ?? 'null'}`);

    const outcomes: GenOutcome[] = [];
    try {
      outcomes.push(await runGeneration(1, 'fr', holding));
      outcomes.push(await runGeneration(2, 'en', holding));
      outcomes.push(await runGeneration(3, 'fr', holding));
    } catch (e) {
      console.error(`  PROBE THREW for holding ${holding.id}:`, e);
      reports.push({
        holding,
        outcomes,
        newestOk: false,
        newestRowCount: 0,
        exercisedPricedBranch: false,
        exercisedUnpricedBranch: false,
      });
      continue;
    }

    const newest = await newestWinsCheck(holding.id, outcomes);

    const hasPrice =
      holding.issue_price_per_share !== null &&
      Number(holding.issue_price_per_share) > 0;

    reports.push({
      holding,
      outcomes,
      newestOk: newest.ok,
      newestRowCount: newest.rowCount,
      exercisedPricedBranch: hasPrice,
      exercisedUnpricedBranch: !hasPrice,
    });
  }

  // Per-holding markdown sections.
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('# Per-holding reports');
  for (const r of reports) emitHoldingSection(r);

  // Global summary.
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('# Global summary');
  let totalChecks = 0;
  let passedChecks = 0;
  for (const r of reports) {
    for (const o of r.outcomes) {
      totalChecks += o.checks.length;
      passedChecks += o.checks.filter((c) => c.ok).length;
    }
  }
  const newestPassed = reports.filter((r) => r.newestOk).length;
  const pricedExercised = reports.some((r) => r.exercisedPricedBranch);
  const unpricedExercised = reports.some((r) => r.exercisedUnpricedBranch);

  console.log(`- holdings processed: ${reports.length}`);
  console.log(`- assertions: ${passedChecks}/${totalChecks} passed`);
  console.log(`- newest-wins: ${newestPassed}/${reports.length} passed`);
  console.log(`- priced-phrase branch exercised: ${pricedExercised ? 'YES' : 'NO (no priced fixture)'}`);
  console.log(`- unpriced-phrase branch exercised: ${unpricedExercised ? 'YES' : 'NO (no unpriced fixture)'}`);

  const branchGap: string[] = [];
  if (!pricedExercised) branchGap.push('priced (issue_price_per_share > 0)');
  if (!unpricedExercised) branchGap.push('unpriced (issue_price_per_share IS NULL or 0)');
  if (branchGap.length) {
    console.log(`- BRANCH-COVERAGE GAP: ${branchGap.join(', ')} — add a fixture to close`);
  }

  const allPass =
    passedChecks === totalChecks && newestPassed === reports.length;
  console.log(`\n${allPass ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'}`);
  process.exit(allPass ? 0 : 1);
})().catch((err) => {
  console.error('\nPROBE THREW:', err);
  process.exit(1);
});
