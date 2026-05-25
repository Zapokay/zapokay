/**
 * #19c — Event-completeness API route.
 *
 * Scores POST-FOUNDING lifecycle acts (director/officer appointment +
 * departure, share issuance + cessation, share transfer) against
 * `event_documents`. SEPARATE from /api/minute-book/completeness (which
 * scores founding + annual document requirements) — that route and its
 * consumers are intentionally untouched.
 *
 * Pure scoring lives in lib/minute-book/event-completeness.ts so it can be
 * unit-tested and reused by future aggregators (e.g. a Dashboard rollup).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeEventCompleteness } from '@/lib/minute-book/event-completeness';

export async function GET() {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, incorporation_date')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: 'Aucune société trouvée' }, { status: 404 });
    }

    const response = await computeEventCompleteness(
      supabase,
      company.id as string,
      (company.incorporation_date as string | null) ?? null,
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error calculating event-completeness:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
