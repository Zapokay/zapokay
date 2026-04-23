export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { generatePdfDocument } from '@/lib/pdf/generatePdfDocument';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

export async function POST(request: NextRequest) {
  try {
    const { companyId, requirementKey, signatories, year, resolutionDate } =
      (await request.json()) as {
        companyId: string;
        requirementKey: string;
        signatories?: Signatory[];
        /** Optional — fiscal year for annual requirements. Omitted for foundational. */
        year?: number;
        /** Optional — ISO date (YYYY-MM-DD) to stamp on the document. */
        resolutionDate?: string;
      };

    if (!companyId || !requirementKey) {
      return NextResponse.json(
        { success: false, error: 'companyId et requirementKey sont requis.' },
        { status: 400 },
      );
    }

    /* ---------- Auth (Sprint 9H Phase 4d Stream 1 — newly enforced) ---------- */

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    /* ---------- Service-role admin client for storage + DB writes ---------- */

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Configuration Supabase manquante.' },
        { status: 500 },
      );
    }
    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Delegate to the unified generation pipeline ---------- */

    const result = await generatePdfDocument({
      supabaseAdmin,
      userId: user.id,
      companyId,
      requirementKey,
      year,
      resolutionDate,
      signatories,
    });

    if (!result.ok) {
      if (result.canGenerate === false) {
        return NextResponse.json(
          { success: false, canGenerate: false, error: result.error },
          { status: 400 },
        );
      }
      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
    });
  } catch (error) {
    console.error('[generate-item] Full error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
