export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignatoryType, isAllSignatoriesRequired } from '@/lib/requirement-map';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyId = searchParams.get('companyId');
  const requirementKey = searchParams.get('requirementKey');

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (signatoryType === 'board') {
      const { data: mandates, error: mandatesError } = await supabase
        .from('director_mandates')
        .select('person_id')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (mandatesError) {
        console.error('[signatories] director_mandates error:', mandatesError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des administrateurs.' }, { status: 500 });
      }

      const personIds = (mandates ?? []).map((r) => r.person_id as string).filter(Boolean);

      if (personIds.length === 0) {
        return NextResponse.json({ signatories: [], all_required: isAllSignatoriesRequired(requirementKey), signatory_type: signatoryType });
      }

      const { data: people, error: peopleError } = await supabase
        .from('company_people')
        .select('id, full_name')
        .in('id', personIds);

      if (peopleError) {
        console.error('[signatories] company_people error:', peopleError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des administrateurs.' }, { status: 500 });
      }

      const signatories = (people ?? []).map((p) => ({
        id: p.id as string,
        name: p.full_name as string,
        role: 'Administrateur',
      }));

      return NextResponse.json({
        signatories,
        all_required: isAllSignatoriesRequired(requirementKey),
        signatory_type: signatoryType,
      });
    }

    // signatoryType === 'shareholder'
    const { data: shareholdings, error: shareholdingsError } = await supabase
      .from('shareholdings')
      .select('person_id')
      .eq('company_id', companyId);

    if (shareholdingsError) {
      console.error('[signatories] shareholdings error:', shareholdingsError);
      return NextResponse.json({ error: 'Erreur lors de la récupération des actionnaires.' }, { status: 500 });
    }

    // Deduplicate person_ids
    const personIds = Array.from(new Set(
      (shareholdings ?? []).map((r) => r.person_id as string).filter(Boolean)
    ));

    if (personIds.length === 0) {
      return NextResponse.json({ signatories: [], all_required: isAllSignatoriesRequired(requirementKey), signatory_type: signatoryType });
    }

    const { data: people, error: peopleError } = await supabase
      .from('company_people')
      .select('id, full_name')
      .in('id', personIds);

    if (peopleError) {
      console.error('[signatories] company_people error:', peopleError);
      return NextResponse.json({ error: 'Erreur lors de la récupération des actionnaires.' }, { status: 500 });
    }

    const signatories = (people ?? []).map((p) => ({
      id: p.id as string,
      name: p.full_name as string,
      role: 'Actionnaire',
    }));

    return NextResponse.json({
      signatories,
      all_required: isAllSignatoriesRequired(requirementKey),
      signatory_type: signatoryType,
    });
  } catch (err) {
    console.error('[signatories] Unexpected error:', err);
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
