export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { uploadDocument, type UploadDocumentParams } from '@/lib/upload-document';
import { isPdfBytes } from '@/lib/pdf-magic';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import { computeDefaultActiveYears } from '@/lib/active-years';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_SIZE = 20971520; // 20 MB — mirrors the `documents` bucket file_size_limit

async function ensureHoldYearIfOutOfWindow(
  supabaseAdmin: SupabaseClient,
  company: {
    incorporation_date: string | null;
    fiscal_year_end_month: number | null;
    fiscal_year_end_day: number | null;
  },
  companyId: string,
  docYear: number,
): Promise<void> {
  try {
    const activeWindow = computeDefaultActiveYears(
      company.incorporation_date,
      company.fiscal_year_end_month ?? 12,
      company.fiscal_year_end_day ?? 31,
    );
    if (activeWindow.includes(docYear)) return;

    const { data: existing } = await supabaseAdmin
      .from('company_fiscal_years')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('year', docYear)
      .maybeSingle();

    if (!existing) {
      const holdRow: {
        company_id: string;
        year: number;
        status: string;
      } = {
        company_id: companyId,
        year: docYear,
        status: 'hold',
      };
      await supabaseAdmin.from('company_fiscal_years').insert(holdRow);
    } else if (existing.status === 'archived') {
      const promote: {
        status: string;
      } = {
        status: 'hold',
      };
      await supabaseAdmin
        .from('company_fiscal_years')
        .update(promote)
        .eq('id', existing.id);
    }
  } catch (e) {
    console.warn('[documents/upload] hold-year ensure failed (non-fatal):', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    /* ---------- Auth gate (mirror generate-item) ---------- */
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    /* ---------- Parse multipart body ---------- */
    const form = await request.formData();
    const file = form.get('file');
    const companyId = form.get('companyId');
    if (!(file instanceof File) || typeof companyId !== 'string' || !companyId) {
      return NextResponse.json({ ok: false, error: 'file and companyId are required' }, { status: 400 });
    }

    /* ---------- Server-side ownership check (closes the trusted-param hole) ----------
       userId is SESSION-derived (user.id), NEVER read from the body. companyId may
       arrive in the body but is validated against the session user's own companies
       here — RLS-scoped session select AND an explicit user_id match. */
    const { data: ownedCompany, error: ownErr } = await supabase
      .from('companies')
      .select('id, incorporation_date, fiscal_year_end_month, fiscal_year_end_day')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json({ ok: false, error: 'Ownership check failed' }, { status: 500 });
    }
    if (!ownedCompany) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    /* ---------- Server-side content validation (authoritative) ---------- */
    // Size — reject > 20 MB before reading bytes into the pipeline.
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ ok: false, error: 'FILE_TOO_LARGE' }, { status: 400 });
    }
    // %PDF magic-number — the AUTHORITATIVE server check (shared helper, same
    // bytes as the helper's defense-in-depth gate; lib/pdf-magic.ts).
    const head = await file.slice(0, 4).arrayBuffer();
    if (!isPdfBytes(head)) {
      return NextResponse.json({ ok: false, error: 'NON_PDF_REJECTED' }, { status: 400 });
    }
    // NOTE: the declared MIME header (file.type) is defense-in-depth only —
    // spoofable, so it is NOT used as a gate. The bytes above are authoritative.

    /* ---------- Remaining uploadDocument metadata (coerced from formData strings) ---------- */
    const str = (k: string): string => {
      const v = form.get(k);
      return typeof v === 'string' ? v : '';
    };
    const numOrNull = (k: string): number | null => {
      const raw = str(k);
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    let requirements: ChecklistItem[] = [];
    const reqRaw = str('requirements');
    if (reqRaw) {
      try { requirements = JSON.parse(reqRaw); } catch { requirements = []; }
    }

    let eventLink: UploadDocumentParams['eventLink'];
    const elRaw = str('eventLink');
    if (elRaw) {
      try {
        const p = JSON.parse(elRaw);
        if (p && p.event_type && p.event_id && p.event_phase) {
          eventLink = { event_type: p.event_type, event_id: p.event_id, event_phase: p.event_phase };
        }
      } catch { /* malformed eventLink ignored — treated as a plain upload */ }
    }

    // A2a — the requirements the vault form declared. Same wire idiom as
    // `requirements` and `eventLink` above: one key, one JSON array. Absent is the
    // NORM, not an edge: row mode never sends it, and the scalar still governs.
    //
    // ★ THE VALIDATION RULE, and it covers BOTH columns: a malformed body may
    // produce FEWER links, or none — never a link that says the wrong thing.
    // An empty key drops its entry; so does an unintelligible year, because NULL on
    // requirement_year is an ASSERTION ("the catalog row is foundational"), not
    // "unknown". Degrading a garbage year to NULL would silently reclassify an
    // annual link as a foundational one — the same plausible-and-false shape we
    // just guarded against on `origin`. Nothing downstream re-validates either field.
    let requirementLinks: UploadDocumentParams['requirementLinks'];
    const rlRaw = str('requirementLinks');
    if (rlRaw) {
      try {
        const parsed = JSON.parse(rlRaw);
        const cleaned: { requirement_key: string; requirement_year: number | null }[] = [];
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const key =
              entry && typeof entry === 'object'
                ? (entry as { requirement_key?: unknown }).requirement_key
                : null;
            if (typeof key !== 'string' || key === '') continue;
            const rawYear = (entry as { requirement_year?: unknown }).requirement_year;
            // Absent or explicitly null IS the legitimate foundational link — the
            // distinction is "absent" versus "present but unreadable".
            let year: number | null;
            if (rawYear === undefined || rawYear === null) {
              year = null;
            } else if (typeof rawYear === 'number' && Number.isFinite(rawYear)) {
              year = rawYear;
            } else {
              continue;
            }
            cleaned.push({ requirement_key: key, requirement_year: year });
          }
        }
        if (cleaned.length > 0) requirementLinks = cleaned;
      } catch { /* malformed requirementLinks ignored — same treatment as eventLink */ }
    }

    const framework = str('framework') === 'CBCA' ? 'CBCA' : 'LSA';
    const isFinalized = str('isFinalized') === 'true';
    const replaceDocumentId = str('replaceDocumentId') || undefined;

    /* ---------- Body-content validation (Brief #4 — server safety-nets) ----------
       Both guards close the raw-API / future-caller hole; the two UI callers
       (UploadDocumentModal, CompletenessPage) already send valid data, so these
       never fire on normal traffic. Structured codes only (no inline FR/EN) —
       mapped to copy client-side via lib/upload-error-message.ts. */
    const title = str('title');
    const docYear = numOrNull('docYear');
    const requirementYear = numOrNull('requirementYear');

    // Guard 1 — year-required-for-annual. requirementYear non-null is the only
    // false-positive-safe annual signal (the annual/foundational/lifecycle
    // category is NOT on the upload contract; foundational + hors-exercice docs
    // are legitimately yearless). Presence check only — NOT docYear === requirementYear
    // (the UI already sends them in agreement; equality could reject unvalidated edges).
    if (requirementYear !== null && docYear === null) {
      return NextResponse.json({ ok: false, error: 'YEAR_REQUIRED_FOR_ANNUAL' }, { status: 400 });
    }
    // Guard 2 — title must be non-empty after trim (uploadDocument writes title.trim()).
    if (!title.trim()) {
      return NextResponse.json({ ok: false, error: 'TITLE_REQUIRED' }, { status: 400 });
    }

    /* ---------- Service-role admin client (mirror generate-item) ---------- */
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
    }
    const supabaseAdmin = createServiceClient();

    /* ---------- Reuse the shared pipeline wholesale (no reimplementation) ---------- */
    const result = await uploadDocument({
      file,
      companyId,
      userId: user.id,            // SESSION-derived, never the body (Adjustment 2)
      supabaseClient: supabaseAdmin,
      title,
      docType: str('docType'),
      language: str('language'),
      docYear,
      requirementKey: str('requirementKey') || null,
      requirementYear,
      framework,
      requirements,
      // A2c — the user's explicit shelf. Validated against the nine in the
      // helper, so an unknown value derives instead of reaching the insert.
      minuteBookSection: str('minuteBookSection') || null,
      // A2b — the third year state. 'none' cannot ride on docYear, so it gets
      // its own field; same string-boolean idiom as isFinalized above.
      noFiscalYear: str('noFiscalYear') === 'true',
      isFinalized,
      ...(replaceDocumentId ? { replaceDocumentId } : {}),
      ...(eventLink ? { eventLink } : {}),
      ...(requirementLinks ? { requirementLinks } : {}),
    });

    if (!result.ok) {
      // We already validated bytes above, so NON_PDF_REJECTED shouldn't re-fire
      // from the helper's gate; map it to 400 anyway, everything else is internal.
      const status = result.error === 'NON_PDF_REJECTED' ? 400 : 500;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    // Hold-only vault import - out-of-window year gets a lazy hold row (non-fatal).
    if (docYear !== null) {
      await ensureHoldYearIfOutOfWindow(
        supabaseAdmin,
        {
          incorporation_date: ownedCompany.incorporation_date as string | null,
          fiscal_year_end_month: ownedCompany.fiscal_year_end_month as number | null,
          fiscal_year_end_day: ownedCompany.fiscal_year_end_day as number | null,
        },
        ownedCompany.id,
        docYear,
      );
    }

    return NextResponse.json({ ok: true, documentId: result.documentId });
  } catch (error) {
    console.error('[documents/upload] Full error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
