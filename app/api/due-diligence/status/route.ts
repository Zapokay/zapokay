export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Keys pouvant être générés automatiquement (vraies clés DB)         */
/* ------------------------------------------------------------------ */

const GENERATABLE_KEYS = new Set([
  'lsaq_premiere_resolution_ca',
  'lsaq_premiere_resolution_actionnaires',
  'lsaq_souscription_actions',
  'lsaq_annual_board_resolution',
  'lsaq_annual_shareholder_resolution',
  'lsaq_auditor_waiver',
  'cbca_first_board_resolution',
  'cbca_first_shareholder_resolution',
  'cbca_share_subscription',
]);

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    console.log('[due-diligence/status] env check:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

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

    /* ---------- Récupérer le framework de l'entreprise ---------- */

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, incorporation_type')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Entreprise introuvable.' },
        { status: 404 }
      );
    }

    const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';

    /* ---------- Charger les exigences (filtrées par framework) ---------- */

    const { data: requirements, error: reqError } = await supabase
      .from('minute_book_requirements')
      .select('id, requirement_key, title_fr, section')
      .or(`framework.eq.${framework},framework.eq.ALL`)
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

    /* ---------- Charger les documents actifs de l'entreprise ---------- */

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

    const totalComplete = allRequirements.filter(
      (r) => completedKeys.has(r.requirement_key)
    ).length;

    const completionScore =
      totalRequired > 0 ? Math.round((totalComplete / totalRequired) * 100) : 0;

    /* ---------- Documents manquants ---------- */

    const missingDocuments = allRequirements
      .filter((r) => !completedKeys.has(r.requirement_key))
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
    console.error('[due-diligence/status] Full error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
