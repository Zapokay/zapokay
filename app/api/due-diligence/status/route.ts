export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Keys pouvant être générés automatiquement                          */
/* ------------------------------------------------------------------ */

const GENERATABLE_KEYS = new Set([
  'founding_board_resolution',
  'founding_shareholder_resolution',
  'share_subscription_letter',
]);

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId est requis.' },
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    /* ---------- Charger les exigences du livre de minutes ---------- */

    const { data: requirements, error: reqError } = await supabase
      .from('minute_book_requirements')
      .select('id, requirement_key, title_fr, section, status, document_id')
      .eq('company_id', companyId)
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true });

    if (reqError) {
      console.error('Requirements fetch error:', reqError);
      return NextResponse.json(
        { error: 'Impossible de charger les exigences.' },
        { status: 500 }
      );
    }

    const allRequirements = requirements ?? [];
    const totalRequired = allRequirements.length;

    /* ---------- Charger les documents actifs ---------- */

    const { data: activeDocuments } = await supabase
      .from('documents')
      .select('id, requirement_key')
      .eq('company_id', companyId)
      .eq('status', 'active');

    const completedKeys = new Set(
      (activeDocuments ?? [])
        .map((d) => d.requirement_key)
        .filter(Boolean)
    );

    /* ---------- Calculer le score ---------- */

    const completedRequirements = allRequirements.filter(
      (r) => r.status === 'completed' || completedKeys.has(r.requirement_key)
    );

    const totalComplete = completedRequirements.length;
    const completionScore =
      totalRequired > 0 ? Math.round((totalComplete / totalRequired) * 100) : 0;

    /* ---------- Documents manquants ---------- */

    const missingDocuments = allRequirements
      .filter(
        (r) => r.status !== 'completed' && !completedKeys.has(r.requirement_key)
      )
      .map((r) => ({
        key: r.requirement_key,
        title_fr: r.title_fr,
        section: r.section,
        canGenerate: GENERATABLE_KEYS.has(r.requirement_key),
      }));

    return NextResponse.json({
      completionScore,
      totalRequired,
      totalComplete,
      missingDocuments,
    });
  } catch (error) {
    console.error('due-diligence/status error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
