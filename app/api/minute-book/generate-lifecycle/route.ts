/**
 * #19d Brief 2a — POST /api/minute-book/generate-lifecycle
 *
 * Thin auth wrapper around `generateLifecycleDocument`. Mirrors the pattern
 * established by `generate-item/route.ts`:
 *   1. Validate request body (loud 400 on missing/invalid).
 *   2. Authenticate via SSR client → 401 if no user.
 *   3. Build service-role admin client → 500 if env vars missing.
 *   4. Delegate to the orchestrator.
 *
 * Language is REQUIRED and explicit on the wire (no silent default — §8.44
 * forbids it). Brief 2b's UI is expected to resolve `language` from
 * `users.preferred_language` and pass it explicitly.
 *
 * All client-facing error strings are FR (matches the rest of the
 * minute-book API surface today; the EN UI displays errors via separate
 * client-side i18n).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { generateLifecycleDocument } from '@/lib/pdf/generate-lifecycle-document';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      docKey?: string;
      eventId?: string;
      resolutionDate?: string;
      language?: string;
    };

    const { companyId, docKey, eventId, resolutionDate, language } = body;

    if (!companyId || !docKey || !eventId || !resolutionDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'companyId, docKey, eventId et resolutionDate sont requis.',
        },
        { status: 400 },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)) {
      return NextResponse.json(
        { success: false, error: 'resolutionDate doit être au format AAAA-MM-JJ.' },
        { status: 400 },
      );
    }

    if (language !== 'fr' && language !== 'en') {
      return NextResponse.json(
        { success: false, error: 'Paramètre de langue invalide.' },
        { status: 400 },
      );
    }

    /* ---------- Auth ---------- */

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

    /* ---------- Service-role admin client ---------- */

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Configuration Supabase manquante.' },
        { status: 500 },
      );
    }
    const supabaseAdmin = createServiceClient();

    /* ---------- Delegate ---------- */

    const result = await generateLifecycleDocument({
      supabaseAdmin,
      userId: user.id,
      companyId,
      docKey,
      eventId,
      resolutionDate,
      language,
    });

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[generate-lifecycle] Full error:', error);
    // Surface validation-shape errors as 400; everything else 500. The
    // orchestrator's validation throws all start with the function name
    // prefix, so this discriminator is reliable.
    const isValidation =
      message.startsWith('generateLifecycleDocument:') &&
      /required|invalid|must be|unknown docKey|not found|soft-deleted|missing/.test(
        message,
      );
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la génération du document.' },
      { status: isValidation ? 400 : 500 },
    );
  }
}
