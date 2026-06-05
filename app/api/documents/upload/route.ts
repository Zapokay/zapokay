export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { uploadDocument, type UploadDocumentParams } from '@/lib/upload-document';
import { isPdfBytes } from '@/lib/pdf-magic';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';

const MAX_SIZE = 20971520; // 20 MB — mirrors the `documents` bucket file_size_limit

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
      .select('id')
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

    const framework = str('framework') === 'CBCA' ? 'CBCA' : 'LSA';
    const isFinalized = str('isFinalized') === 'true';
    const replaceDocumentId = str('replaceDocumentId') || undefined;

    /* ---------- Service-role admin client (mirror generate-item) ---------- */
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
    }
    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Reuse the shared pipeline wholesale (no reimplementation) ---------- */
    const result = await uploadDocument({
      file,
      companyId,
      userId: user.id,            // SESSION-derived, never the body (Adjustment 2)
      supabaseClient: supabaseAdmin,
      title: str('title'),
      docType: str('docType'),
      language: str('language'),
      docYear: numOrNull('docYear'),
      requirementKey: str('requirementKey') || null,
      requirementYear: numOrNull('requirementYear'),
      framework,
      requirements,
      isFinalized,
      ...(replaceDocumentId ? { replaceDocumentId } : {}),
      ...(eventLink ? { eventLink } : {}),
    });

    if (!result.ok) {
      // We already validated bytes above, so NON_PDF_REJECTED shouldn't re-fire
      // from the helper's gate; map it to 400 anyway, everything else is internal.
      const status = result.error === 'NON_PDF_REJECTED' ? 400 : 500;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({ ok: true, documentId: result.documentId });
  } catch (error) {
    console.error('[documents/upload] Full error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
