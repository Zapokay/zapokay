/**
 * #19d Brief 2a — End-to-end verification for `generateLifecycleDocument`.
 *
 * Exercises the REAL orchestrator (single source of truth — no inline
 * duplication of registry, engine, or pipeline). Run via:
 *
 *   npx tsx scripts/test-lifecycle-generate.ts
 *
 * What it does, in order:
 *   1. Load env from .env.local (no dotenv dep).
 *   2. Build a service-role supabase-js client (bypasses RLS, matches the
 *      route's runtime context).
 *   3. Pick an Acme Test inc. ended director mandate with end_reason present
 *      — director_departure requires both end_date AND end_reason.
 *   4. Compute baseline completeness via the real #19c engine and snapshot
 *      the act's MISSING state.
 *   5. Call `generateLifecycleDocument({ docKey: 'director_departure', ... })`.
 *   6. Assert:
 *        - documents row exists with the expected shape (document_type,
 *          source, requirement_key NULL, signature_status default, language)
 *        - event_documents tuple exists with the expected
 *          (event_type, event_id, event_phase) matching the mandate
 *        - completeness flips MISSING → SATISFIED for that act
 *   7. Cleanup: DELETE event_documents row, DELETE documents row, best-effort
 *      remove the storage object. Re-compute completeness and assert the
 *      baseline numbers are exactly restored.
 *
 * Bilingual coverage: runs the full cycle once in FR and once in EN.
 *
 * userId: a fixed sentinel UUID is passed for activity_log. `logActivity`
 * swallows errors so missing FK does not affect the test. The activity_log
 * row, if it lands, is a harmless artifact and is NOT in the cleanup
 * surface (per WA#8 — append-only by default for audit data).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';

import { generateLifecycleDocument } from '@/lib/pdf/generate-lifecycle-document';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';
import { fiscalYearForDate } from '@/lib/active-years';
import { LIFECYCLE_TEMPLATES } from '@/lib/pdf/lifecycle-templates';

// ─── Env loader ────────────────────────────────────────────────────────────

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    out[k] = v;
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

// Acme Test inc. — canonical fixture company.
const ACME_COMPANY_ID = 'aceaceac-0000-4000-8000-000000000002';
// Sentinel user UUID for activity_log; orchestrator does not validate it
// and logActivity swallows errors if FK rejects.
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
// Stamp the resolution with today (or any valid YYYY-MM-DD).
const RESOLUTION_DATE = new Date().toISOString().slice(0, 10);

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getCompanyIncorpDate(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('incorporation_date')
    .eq('id', ACME_COMPANY_ID)
    .single();
  if (error || !data) throw new Error(`Acme company not found: ${error?.message}`);
  return (data as { incorporation_date: string | null }).incorporation_date;
}

async function getCompanyFiscalCalendar(): Promise<{ month: number; day: number }> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('fiscal_year_end_month, fiscal_year_end_day')
    .eq('id', ACME_COMPANY_ID)
    .single();
  if (error || !data) throw new Error(`Acme fiscal calendar lookup failed: ${error?.message}`);
  const row = data as { fiscal_year_end_month: number | null; fiscal_year_end_day: number | null };
  if (row.fiscal_year_end_month == null || row.fiscal_year_end_day == null) {
    throw new Error('Acme fiscal_year_end_month/day not configured; cannot assert document_year');
  }
  return { month: row.fiscal_year_end_month, day: row.fiscal_year_end_day };
}

async function pickEndedOfficerAppointmentWithReason(): Promise<{
  id: string;
  end_reason: string;
  end_date: string;
}> {
  // Picks an officer appointment that is ended (end_date present), has
  // end_reason (officer_departure requires it), and is not soft-deleted.
  // For the fiscal-year assertion to make sense, the end_date must fall
  // within an ACTIVE company_fiscal_years year on Acme — Ben Harpez's
  // former Secretary appointment (ended 2024-02-02 with term_expired) is
  // the seeded fixture matching this.
  const { data, error } = await supabaseAdmin
    .from('officer_appointments')
    .select('id, end_date, end_reason, deleted_at')
    .eq('company_id', ACME_COMPANY_ID)
    .is('deleted_at', null)
    .not('end_date', 'is', null)
    .not('end_reason', 'is', null)
    .limit(1);
  if (error) throw new Error(`pick officer appointment failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      'No ended officer appointment with end_reason present on Acme. ' +
        'Seed or end one before running this test.',
    );
  }
  const row = data[0] as { id: string; end_date: string; end_reason: string };
  return { id: row.id, end_date: row.end_date, end_reason: row.end_reason };
}

async function getActiveFiscalYearsSet(): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', ACME_COMPANY_ID)
    .eq('status', 'active');
  if (error) throw new Error(`load active fiscal years failed: ${error.message}`);
  return new Set((data ?? []).map((r) => (r as { year: number }).year));
}

async function pickEndedDirectorMandateWithReason(): Promise<{
  id: string;
  end_reason: string;
  end_date: string;
}> {
  const { data, error } = await supabaseAdmin
    .from('director_mandates')
    .select('id, end_date, end_reason, deleted_at')
    .eq('company_id', ACME_COMPANY_ID)
    .is('deleted_at', null)
    .not('end_date', 'is', null)
    .not('end_reason', 'is', null)
    .limit(1);
  if (error) throw new Error(`pick director mandate failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      'No ended director mandate with end_reason present on Acme. ' +
        'Seed or end one before running this test.',
    );
  }
  const row = data[0] as { id: string; end_date: string; end_reason: string };
  return { id: row.id, end_date: row.end_date, end_reason: row.end_reason };
}

async function snapshotCompleteness() {
  const incDate = await getCompanyIncorpDate();
  return computeEventCompleteness(supabaseAdmin, ACME_COMPANY_ID, incDate);
}

interface RunOutcome {
  documentId: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  eventDocId: string;
}

async function runOneCycle(language: 'fr' | 'en'): Promise<void> {
  console.log(`\n=== Cycle: language=${language} ===`);

  const mandate = await pickEndedDirectorMandateWithReason();
  console.log(
    `  Target mandate: id=${mandate.id} end_date=${mandate.end_date} end_reason=${mandate.end_reason}`,
  );

  // Snapshot baseline.
  const baseline = await snapshotCompleteness();
  console.log(
    `  Baseline: totalActs=${baseline.totalActs} satisfied=${baseline.totalSatisfied} missing=${baseline.totalMissing}`,
  );

  const baselineAct = baseline.acts.find(
    (a) =>
      a.event_type === 'director_mandate' &&
      a.event_id === mandate.id &&
      a.event_phase === 'departure',
  );
  assert.ok(baselineAct, 'baseline departure act not found for chosen mandate');
  assert.equal(baselineAct.satisfied, false, 'baseline departure act should be MISSING');

  // Call orchestrator.
  let result;
  try {
    result = await generateLifecycleDocument({
      supabaseAdmin,
      userId: TEST_USER_ID,
      companyId: ACME_COMPANY_ID,
      docKey: 'director_departure',
      eventId: mandate.id,
      resolutionDate: RESOLUTION_DATE,
      language,
    });
  } catch (e) {
    console.error('  ORCHESTRATOR THREW:', e);
    throw e;
  }
  console.log(
    `  Generated: documentId=${result.documentId} fileName=${result.fileName} title="${result.title}"`,
  );

  const storagePath = `${ACME_COMPANY_ID}/${result.fileName}`;
  let outcome: RunOutcome = {
    documentId: result.documentId,
    fileName: result.fileName,
    fileUrl: result.fileUrl,
    storagePath,
    eventDocId: '',
  };

  try {
    // Assert documents row.
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select(
        'id, company_id, document_type, source, requirement_key, signature_status, language, minute_book_section, status, file_url, document_year',
      )
      .eq('id', result.documentId)
      .single();
    assert.ok(!docErr && doc, `documents row missing: ${docErr?.message}`);
    const d = doc as Record<string, unknown>;
    assert.equal(d.document_type, 'resolution', 'document_type mismatch');
    assert.equal(d.source, 'generated', 'source mismatch');
    assert.equal(d.requirement_key, null, 'requirement_key should be NULL');
    assert.equal(d.signature_status, 'draft', 'signature_status should default to draft');
    assert.equal(d.language, language, 'language mismatch');
    assert.equal(d.minute_book_section, 'resolutions', 'minute_book_section mismatch');
    assert.equal(d.status, 'active', 'status mismatch');
    assert.equal(d.company_id, ACME_COMPANY_ID, 'company_id mismatch');
    // document_year: must be the event's fiscal year (per fiscalYearForDate),
    // not null. The mandate's end_date is the event's effective date for
    // departure cycles.
    const fy = await getCompanyFiscalCalendar();
    const expectedYear = fiscalYearForDate(mandate.end_date, fy.month, fy.day);
    assert.equal(
      d.document_year,
      expectedYear,
      `document_year should be ${expectedYear} (end_date=${mandate.end_date}, fyEnd=${fy.month}/${fy.day}), got ${d.document_year}`,
    );
    console.log(`  ✓ documents row shape verified (document_year=${d.document_year})`);

    // Assert event_documents tuple.
    const { data: link, error: linkErr } = await supabaseAdmin
      .from('event_documents')
      .select('id, document_id, event_type, event_id, event_phase, company_id')
      .eq('document_id', result.documentId)
      .single();
    assert.ok(!linkErr && link, `event_documents row missing: ${linkErr?.message}`);
    const l = link as Record<string, unknown>;
    assert.equal(l.event_type, 'director_mandate', 'event_type mismatch');
    assert.equal(l.event_id, mandate.id, 'event_id mismatch');
    assert.equal(l.event_phase, 'departure', 'event_phase mismatch');
    assert.equal(l.company_id, ACME_COMPANY_ID, 'event_documents company_id mismatch');
    outcome.eventDocId = l.id as string;
    console.log('  ✓ event_documents tuple verified');

    // Assert completeness flip.
    const afterGen = await snapshotCompleteness();
    const afterAct = afterGen.acts.find(
      (a) =>
        a.event_type === 'director_mandate' &&
        a.event_id === mandate.id &&
        a.event_phase === 'departure',
    );
    assert.ok(afterAct, 'post-gen departure act not found');
    assert.equal(afterAct.satisfied, true, 'departure act should now be SATISFIED');
    assert.equal(afterAct.documentId, result.documentId, 'departure act documentId mismatch');
    assert.equal(
      afterGen.totalSatisfied,
      baseline.totalSatisfied + 1,
      'totalSatisfied should have incremented by 1',
    );
    assert.equal(
      afterGen.totalMissing,
      baseline.totalMissing - 1,
      'totalMissing should have decremented by 1',
    );
    console.log(
      `  ✓ Completeness flipped: satisfied ${baseline.totalSatisfied}→${afterGen.totalSatisfied}, missing ${baseline.totalMissing}→${afterGen.totalMissing}`,
    );
  } finally {
    // Cleanup — restore baseline 4/0/0 (or whatever the baseline was).
    console.log('  Cleanup...');
    if (outcome.eventDocId) {
      const { error: e1 } = await supabaseAdmin
        .from('event_documents')
        .delete()
        .eq('id', outcome.eventDocId);
      if (e1) console.error('    event_documents delete error:', e1.message);
    }
    const { error: e2 } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', outcome.documentId);
    if (e2) console.error('    documents delete error:', e2.message);
    const { error: e3 } = await supabaseAdmin.storage
      .from('documents')
      .remove([outcome.storagePath]);
    if (e3) console.error('    storage remove error (non-fatal):', e3.message);
  }

  // Re-check baseline.
  const restored = await snapshotCompleteness();
  assert.equal(
    restored.totalActs,
    baseline.totalActs,
    `totalActs drift after cleanup: ${baseline.totalActs}→${restored.totalActs}`,
  );
  assert.equal(
    restored.totalSatisfied,
    baseline.totalSatisfied,
    `satisfied drift after cleanup: ${baseline.totalSatisfied}→${restored.totalSatisfied}`,
  );
  assert.equal(
    restored.totalMissing,
    baseline.totalMissing,
    `missing drift after cleanup: ${baseline.totalMissing}→${restored.totalMissing}`,
  );
  console.log(
    `  ✓ Baseline restored: totalActs=${restored.totalActs} satisfied=${restored.totalSatisfied} missing=${restored.totalMissing}`,
  );
}

// ─── director_removal cycle ────────────────────────────────────────────────
// Exercises the SHAREHOLDER-instrument branch: temporarily flips a chosen
// ended mandate's end_reason to 'revocation' (the trigger condition for the
// removal docKey), runs the orchestrator, asserts the shape, then restores
// the original end_reason in the finally block so subsequent runs are
// idempotent.

async function runRemovalCycle(): Promise<void> {
  console.log(`\n=== Cycle: director_removal (shareholder instrument) ===`);

  // Verify registry routing — proves we're exercising the shareholder branch.
  const entry = LIFECYCLE_TEMPLATES['director_removal'];
  assert.ok(entry, 'LIFECYCLE_TEMPLATES.director_removal missing');
  assert.equal(
    entry.instrument,
    'shareholder',
    'director_removal registry entry should route via shareholder instrument',
  );

  const mandate = await pickEndedDirectorMandateWithReason();
  const originalEndReason = mandate.end_reason;
  console.log(
    `  Target mandate: id=${mandate.id} end_date=${mandate.end_date} original end_reason=${originalEndReason}`,
  );

  // Temporarily mutate to 'revocation' so director_removal preconditions hold.
  const { error: setErr } = await supabaseAdmin
    .from('director_mandates')
    .update({ end_reason: 'revocation' })
    .eq('id', mandate.id);
  if (setErr) throw new Error(`pre-mutate end_reason failed: ${setErr.message}`);
  console.log('  Set end_reason → revocation');

  const baseline = await snapshotCompleteness();
  console.log(
    `  Baseline (post-mutate): satisfied=${baseline.totalSatisfied} missing=${baseline.totalMissing}`,
  );
  const baselineAct = baseline.acts.find(
    (a) =>
      a.event_type === 'director_mandate' &&
      a.event_id === mandate.id &&
      a.event_phase === 'departure',
  );
  assert.ok(baselineAct, 'baseline removal act not found');
  assert.equal(baselineAct.satisfied, false, 'baseline removal act should be MISSING');

  let outcome: RunOutcome = {
    documentId: '',
    fileName: '',
    fileUrl: '',
    storagePath: '',
    eventDocId: '',
  };

  try {
    // Run orchestrator.
    const result = await generateLifecycleDocument({
      supabaseAdmin,
      userId: TEST_USER_ID,
      companyId: ACME_COMPANY_ID,
      docKey: 'director_removal',
      eventId: mandate.id,
      resolutionDate: RESOLUTION_DATE,
      language: 'fr',
    });
    outcome.documentId = result.documentId;
    outcome.fileName = result.fileName;
    outcome.fileUrl = result.fileUrl;
    outcome.storagePath = `${ACME_COMPANY_ID}/${result.fileName}`;
    console.log(
      `  Generated: documentId=${result.documentId} title="${result.title}"`,
    );

    // Assert documents row shape (resolution/generated/draft + document_year stamped).
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select(
        'id, company_id, document_type, source, requirement_key, signature_status, language, minute_book_section, status, document_year',
      )
      .eq('id', result.documentId)
      .single();
    assert.ok(!docErr && doc, `documents row missing: ${docErr?.message}`);
    const d = doc as Record<string, unknown>;
    assert.equal(d.document_type, 'resolution', 'document_type mismatch');
    assert.equal(d.source, 'generated', 'source mismatch');
    assert.equal(d.requirement_key, null, 'requirement_key should be NULL');
    assert.equal(d.signature_status, 'draft', 'signature_status should default to draft');
    assert.equal(d.minute_book_section, 'resolutions', 'minute_book_section mismatch');
    assert.equal(d.status, 'active', 'status mismatch');
    assert.equal(d.company_id, ACME_COMPANY_ID, 'company_id mismatch');
    const fy = await getCompanyFiscalCalendar();
    const expectedYear = fiscalYearForDate(mandate.end_date, fy.month, fy.day);
    assert.equal(
      d.document_year,
      expectedYear,
      `document_year should be ${expectedYear} (end_date=${mandate.end_date}, fyEnd=${fy.month}/${fy.day}), got ${d.document_year}`,
    );
    console.log(`  ✓ documents row shape verified (document_year=${d.document_year})`);

    // Assert event_documents tuple — same key as a departure (director_mandate | id | departure).
    const { data: link, error: linkErr } = await supabaseAdmin
      .from('event_documents')
      .select('id, document_id, event_type, event_id, event_phase, company_id')
      .eq('document_id', result.documentId)
      .single();
    assert.ok(!linkErr && link, `event_documents row missing: ${linkErr?.message}`);
    const l = link as Record<string, unknown>;
    assert.equal(l.event_type, 'director_mandate', 'event_type mismatch');
    assert.equal(l.event_id, mandate.id, 'event_id mismatch');
    assert.equal(l.event_phase, 'departure', 'event_phase mismatch');
    assert.equal(l.company_id, ACME_COMPANY_ID, 'event_documents company_id mismatch');
    outcome.eventDocId = l.id as string;
    console.log('  ✓ event_documents tuple verified (director_mandate|id|departure)');

    // Assert completeness flip.
    const after = await snapshotCompleteness();
    const afterAct = after.acts.find(
      (a) =>
        a.event_type === 'director_mandate' &&
        a.event_id === mandate.id &&
        a.event_phase === 'departure',
    );
    assert.ok(afterAct, 'post-gen removal act not found');
    assert.equal(afterAct.satisfied, true, 'removal act should now be SATISFIED');
    assert.equal(afterAct.documentId, result.documentId, 'removal act documentId mismatch');
    assert.equal(
      after.totalSatisfied,
      baseline.totalSatisfied + 1,
      'totalSatisfied should have incremented by 1',
    );
    assert.equal(
      after.totalMissing,
      baseline.totalMissing - 1,
      'totalMissing should have decremented by 1',
    );
    console.log(
      `  ✓ Completeness flipped: satisfied ${baseline.totalSatisfied}→${after.totalSatisfied}, missing ${baseline.totalMissing}→${after.totalMissing}`,
    );

    // Implicit shareholder-branch verification: the orchestrator throws if the
    // shareholders load fails. Combined with the registry-instrument assertion
    // at the top of this cycle, completing this far proves the shareholder
    // signature block was loaded (not the directors block).
    console.log('  ✓ Generation completed through SHAREHOLDER instrument branch');
  } finally {
    // Cleanup — drop the generated artifacts.
    console.log('  Cleanup...');
    if (outcome.eventDocId) {
      const { error: e1 } = await supabaseAdmin
        .from('event_documents')
        .delete()
        .eq('id', outcome.eventDocId);
      if (e1) console.error('    event_documents delete error:', e1.message);
    }
    if (outcome.documentId) {
      const { error: e2 } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', outcome.documentId);
      if (e2) console.error('    documents delete error:', e2.message);
    }
    if (outcome.storagePath) {
      const { error: e3 } = await supabaseAdmin.storage
        .from('documents')
        .remove([outcome.storagePath]);
      if (e3) console.error('    storage remove error (non-fatal):', e3.message);
    }
    // Restore the original end_reason so subsequent runs see the same fixture.
    const { error: restoreErr } = await supabaseAdmin
      .from('director_mandates')
      .update({ end_reason: originalEndReason })
      .eq('id', mandate.id);
    if (restoreErr) {
      console.error('    end_reason restore error:', restoreErr.message);
    } else {
      console.log(`    Restored end_reason → ${originalEndReason}`);
    }
  }

  // Re-snapshot completeness — baseline (pre-mutate) had `originalEndReason`,
  // baseline (post-mutate) had `revocation`. After cleanup + restore the
  // mandate is back to `originalEndReason`. Both states yield the same act
  // count (departure is flaggable iff end_date is present, regardless of
  // end_reason value), so totals should match `baseline`.
  const restored = await snapshotCompleteness();
  assert.equal(
    restored.totalActs,
    baseline.totalActs,
    `totalActs drift after cleanup: ${baseline.totalActs}→${restored.totalActs}`,
  );
  assert.equal(
    restored.totalSatisfied,
    baseline.totalSatisfied,
    `satisfied drift after cleanup: ${baseline.totalSatisfied}→${restored.totalSatisfied}`,
  );
  assert.equal(
    restored.totalMissing,
    baseline.totalMissing,
    `missing drift after cleanup: ${baseline.totalMissing}→${restored.totalMissing}`,
  );
  console.log(
    `  ✓ Baseline restored: totalActs=${restored.totalActs} satisfied=${restored.totalSatisfied} missing=${restored.totalMissing}`,
  );
}

// ─── officer_departure cycle ──────────────────────────────────────────────
// Exercises the orchestrator on the officer_appointment event table — same
// board-instrument PDF path as director_departure but a different event-
// table and a different end-reason label scope. document_year stamping is
// asserted by mirroring the orchestrator's active-vs-fallback logic:
// expected = activeYears.has(computed) ? computed : null.

async function runOfficerDepartureCycle(): Promise<void> {
  console.log(`\n=== Cycle: officer_departure (board instrument) ===`);

  const entry = LIFECYCLE_TEMPLATES['officer_departure'];
  assert.ok(entry, 'LIFECYCLE_TEMPLATES.officer_departure missing');
  assert.equal(
    entry.instrument,
    'board',
    'officer_departure registry entry should route via board instrument',
  );

  const appt = await pickEndedOfficerAppointmentWithReason();
  console.log(
    `  Target appointment: id=${appt.id} end_date=${appt.end_date} end_reason=${appt.end_reason}`,
  );

  const baseline = await snapshotCompleteness();
  console.log(
    `  Baseline: totalActs=${baseline.totalActs} satisfied=${baseline.totalSatisfied} missing=${baseline.totalMissing}`,
  );
  const baselineAct = baseline.acts.find(
    (a) =>
      a.event_type === 'officer_appointment' &&
      a.event_id === appt.id &&
      a.event_phase === 'departure',
  );
  assert.ok(baselineAct, 'baseline officer-departure act not found');
  assert.equal(baselineAct.satisfied, false, 'baseline officer-departure act should be MISSING');

  let outcome: RunOutcome = {
    documentId: '',
    fileName: '',
    fileUrl: '',
    storagePath: '',
    eventDocId: '',
  };

  try {
    const result = await generateLifecycleDocument({
      supabaseAdmin,
      userId: TEST_USER_ID,
      companyId: ACME_COMPANY_ID,
      docKey: 'officer_departure',
      eventId: appt.id,
      resolutionDate: RESOLUTION_DATE,
      language: 'fr',
    });
    outcome.documentId = result.documentId;
    outcome.fileName = result.fileName;
    outcome.fileUrl = result.fileUrl;
    outcome.storagePath = `${ACME_COMPANY_ID}/${result.fileName}`;
    console.log(
      `  Generated: documentId=${result.documentId} title="${result.title}"`,
    );

    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select(
        'id, company_id, document_type, source, requirement_key, signature_status, language, minute_book_section, status, document_year',
      )
      .eq('id', result.documentId)
      .single();
    assert.ok(!docErr && doc, `documents row missing: ${docErr?.message}`);
    const d = doc as Record<string, unknown>;
    assert.equal(d.document_type, 'resolution', 'document_type mismatch');
    assert.equal(d.source, 'generated', 'source mismatch');
    assert.equal(d.requirement_key, null, 'requirement_key should be NULL');
    assert.equal(d.signature_status, 'draft', 'signature_status should default to draft');
    assert.equal(d.minute_book_section, 'resolutions', 'minute_book_section mismatch');
    assert.equal(d.status, 'active', 'status mismatch');
    assert.equal(d.company_id, ACME_COMPANY_ID, 'company_id mismatch');
    // document_year: mirror the orchestrator's active-vs-fallback logic so the
    // assertion is robust to a fixture where Ben Harpez's end_date year is or
    // isn't in active fiscal years.
    const fy = await getCompanyFiscalCalendar();
    const computed = fiscalYearForDate(appt.end_date, fy.month, fy.day);
    const activeYears = await getActiveFiscalYearsSet();
    const expectedYear = activeYears.has(computed) ? computed : null;
    assert.equal(
      d.document_year,
      expectedYear,
      `document_year should be ${expectedYear} (computed=${computed}, in-active=${activeYears.has(computed)}, end_date=${appt.end_date}, fyEnd=${fy.month}/${fy.day}), got ${d.document_year}`,
    );
    console.log(`  ✓ documents row shape verified (document_year=${d.document_year})`);

    const { data: link, error: linkErr } = await supabaseAdmin
      .from('event_documents')
      .select('id, document_id, event_type, event_id, event_phase, company_id')
      .eq('document_id', result.documentId)
      .single();
    assert.ok(!linkErr && link, `event_documents row missing: ${linkErr?.message}`);
    const l = link as Record<string, unknown>;
    assert.equal(l.event_type, 'officer_appointment', 'event_type mismatch');
    assert.equal(l.event_id, appt.id, 'event_id mismatch');
    assert.equal(l.event_phase, 'departure', 'event_phase mismatch');
    assert.equal(l.company_id, ACME_COMPANY_ID, 'event_documents company_id mismatch');
    outcome.eventDocId = l.id as string;
    console.log('  ✓ event_documents tuple verified (officer_appointment|id|departure)');

    const after = await snapshotCompleteness();
    const afterAct = after.acts.find(
      (a) =>
        a.event_type === 'officer_appointment' &&
        a.event_id === appt.id &&
        a.event_phase === 'departure',
    );
    assert.ok(afterAct, 'post-gen officer-departure act not found');
    assert.equal(afterAct.satisfied, true, 'officer-departure act should now be SATISFIED');
    assert.equal(afterAct.documentId, result.documentId, 'officer-departure act documentId mismatch');
    assert.equal(
      after.totalSatisfied,
      baseline.totalSatisfied + 1,
      'totalSatisfied should have incremented by 1',
    );
    assert.equal(
      after.totalMissing,
      baseline.totalMissing - 1,
      'totalMissing should have decremented by 1',
    );
    console.log(
      `  ✓ Completeness flipped: satisfied ${baseline.totalSatisfied}→${after.totalSatisfied}, missing ${baseline.totalMissing}→${after.totalMissing}`,
    );
  } finally {
    console.log('  Cleanup...');
    if (outcome.eventDocId) {
      const { error: e1 } = await supabaseAdmin
        .from('event_documents')
        .delete()
        .eq('id', outcome.eventDocId);
      if (e1) console.error('    event_documents delete error:', e1.message);
    }
    if (outcome.documentId) {
      const { error: e2 } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', outcome.documentId);
      if (e2) console.error('    documents delete error:', e2.message);
    }
    if (outcome.storagePath) {
      const { error: e3 } = await supabaseAdmin.storage
        .from('documents')
        .remove([outcome.storagePath]);
      if (e3) console.error('    storage remove error (non-fatal):', e3.message);
    }
  }

  const restored = await snapshotCompleteness();
  assert.equal(
    restored.totalActs,
    baseline.totalActs,
    `totalActs drift after cleanup: ${baseline.totalActs}→${restored.totalActs}`,
  );
  assert.equal(
    restored.totalSatisfied,
    baseline.totalSatisfied,
    `satisfied drift after cleanup: ${baseline.totalSatisfied}→${restored.totalSatisfied}`,
  );
  assert.equal(
    restored.totalMissing,
    baseline.totalMissing,
    `missing drift after cleanup: ${baseline.totalMissing}→${restored.totalMissing}`,
  );
  console.log(
    `  ✓ Baseline restored: totalActs=${restored.totalActs} satisfied=${restored.totalSatisfied} missing=${restored.totalMissing}`,
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('#19d Brief 2a — generateLifecycleDocument end-to-end test');
  console.log(`  company: ${ACME_COMPANY_ID}`);
  console.log(`  resolutionDate: ${RESOLUTION_DATE}`);

  try {
    await runOneCycle('fr');
    await runOneCycle('en');
    await runRemovalCycle();
    await runOfficerDepartureCycle();
    console.log('\nALL ASSERTIONS PASSED');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
  }
})();
