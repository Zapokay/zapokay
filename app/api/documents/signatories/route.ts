export const dynamic = 'force-dynamic';
// 2026-06-10 incident (C2 gate): supabase-js PostgREST reads flow through Next's
// patched fetch and were served from a STALE on-disk Data Cache — a newly-created
// entity shareholder vanished from this route's output until `.next` was cleared,
// and it survived a server restart. `force-dynamic` alone did NOT prevent it.
// Force every fetch in this segment to no-store so signatory rosters are always
// read live; stale legal-signatory data is unacceptable.
export const fetchCache = 'force-no-store';

// TODO (Sprint 10+): accept a `year` query param and filter director_mandates /
// shareholdings to those active in that fiscal year. Today the data model only
// tracks current-state (`director_mandates.is_active`, no effective dates on
// `shareholdings`), so annual generations for older years receive the
// currently-active signatories rather than the historically-correct ones.
// Unblocking this requires adding `active_from` / `active_until` (or a
// per-fiscal-year join) to the mandates + shareholdings tables.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getSignatoryType, isAllSignatoriesRequired } from '@/lib/requirement-map';
import {
  resolveSignatoryBlocks,
  SignatoryResolutionError,
} from '@/lib/documents/resolve-signatory-blocks';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyId = searchParams.get('companyId');
  const requirementKey = searchParams.get('requirementKey');
  // Atom 3 Slice 4 — document language drives signature-block role labels.
  // Independent of UI locale (Two-Layer Language Model, CLAUDE.md §3). Defaults
  // to 'fr'; EN strings ship dormant until generation language is wired (#2).
  const language: 'fr' | 'en' = searchParams.get('language') === 'en' ? 'en' : 'fr';

  if (!companyId || !requirementKey) {
    return NextResponse.json(
      { error: 'companyId et requirementKey sont requis.' },
      { status: 400 }
    );
  }

  const signatoryType = getSignatoryType(requirementKey);
  if (!signatoryType) {
    return NextResponse.json(
      { error: 'requirement_key inconnu.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Configuration Supabase manquante.' },
      { status: 500 }
    );
  }

  const supabase = createServiceClient();

  // Atom 3 Slice 5 — block-building moved VERBATIM into the shared resolver
  // (lib/documents/resolve-signatory-blocks.ts) so bulk-generate resolves the
  // same grouped roster. This route stays the thin wrapper: it owns param
  // validation, signatoryType derivation, language parsing, all_required, and
  // the JSON response shape. Stage-tagged errors map to the same 500 messages.
  try {
    const signatories = await resolveSignatoryBlocks(
      supabase,
      companyId,
      signatoryType,
      language,
    );
    return NextResponse.json({
      signatories,
      all_required: isAllSignatoriesRequired(requirementKey),
      signatory_type: signatoryType,
    });
  } catch (err) {
    if (err instanceof SignatoryResolutionError) {
      console.error(`[signatories] ${err.stage} error:`, err.dbError ?? err);
      const message =
        err.stage === 'director_mandates' || err.stage === 'directors_people'
          ? 'Erreur lors de la récupération des administrateurs.'
          : err.stage === 'entity_signatories'
            ? 'Erreur lors de la récupération des signataires.'
            : 'Erreur lors de la récupération des actionnaires.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
    console.error('[signatories] Unexpected error:', err);
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
