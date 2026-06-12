export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { generatePdfDocument } from '@/lib/pdf/generatePdfDocument';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';

export async function POST(request: NextRequest) {
  try {
    const { companyId, requirementKey, signatories, year, resolutionDate, language } =
      (await request.json()) as {
        companyId: string;
        requirementKey: string;
        signatories?: SignatoryBlock[];
        /** Optional — fiscal year for annual requirements. Omitted for foundational. */
        year?: number;
        /** Optional — ISO date (YYYY-MM-DD) to stamp on the document. */
        resolutionDate?: string;
        /** Optional — document language (Two-Layer model). Defaults to 'fr'. */
        language?: 'fr' | 'en';
      };

    if (!companyId || !requirementKey) {
      return NextResponse.json(
        { success: false, error: 'MISSING_PARAMS' },
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
        { success: false, error: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    /* ---------- Service-role admin client for storage + DB writes ---------- */

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'SERVER_MISCONFIGURED' },
        { status: 500 },
      );
    }
    const supabaseAdmin = createServiceClient();

    /* ---------- Delegate to the unified generation pipeline ---------- */

    const result = await generatePdfDocument({
      supabaseAdmin,
      userId: user.id,
      companyId,
      requirementKey,
      year,
      resolutionDate,
      signatories,
      language,
    });

    if (!result.ok) {
      if (result.canGenerate === false) {
        return NextResponse.json(
          { success: false, canGenerate: false, error: 'CANNOT_GENERATE' },
          { status: 400 },
        );
      }
      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: 'COMPANY_NOT_FOUND' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'GENERATION_FAILED' },
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
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
