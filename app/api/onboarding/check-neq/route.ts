export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  // ⚠️ A SESSION IS REQUIRED, AND IT COSTS THE PRODUCT NOTHING. MEASURED 2026-08-29:
  // this route has exactly ONE caller — StepCompany, rendered only by OnboardingFlow,
  // rendered only by a page that redirects to /login without a user. There is no
  // public path, and onboarding runs AFTER the account and the session exist, so the
  // original premise ("it serves before an account exists") was false.
  // Until now it answered "is this NEQ on ZapOkay?" to anyone on the internet, with
  // the service role and no filter — an enumeration oracle over the customer base.
  // ⚠️ A session SHRINKS that oracle, it does not close it: any registered user can
  // still probe. That is a LAUNCH GATE, tracked, not something this route can fix.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ exists: false }, { status: 401 });

  const { neq } = (await request.json()) as { neq?: string };

  const trimmedNeq = neq?.trim() ?? '';
  if (!trimmedNeq) {
    return NextResponse.json({ exists: false });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ exists: false }, { status: 500 });
  }

  // The service client STAYS. Seeing other tenants' rows is the whole point of the
  // invariant "one NEQ, one company on the platform", which idx_companies_neq_unique
  // enforces in the database; under RLS this check would always pass and the INSERT
  // would fail later with a raw constraint error.
  // ⚠️ .neq('user_id', …) is what unblocks RESUMING. Without it, a returning user who
  // retyped their OWN company's NEQ was told it already belonged to someone on
  // ZapOkay and told to ask an administrator to invite them — to their own company.
  // The response stays a plain boolean: `exists` now means "held by SOMEONE ELSE",
  // so not one consumer changes.
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from('companies')
    .select('id')
    .eq('neq', trimmedNeq)
    .neq('user_id', user.id)
    .limit(1);

  // A failed lookup is not "no duplicate" — but it must not block the form either:
  // the caller treats a failure as non-fatal by design, and the unique index is the
  // real enforcement. Same shape as the missing-env branch above.
  if (error) {
    return NextResponse.json({ exists: false }, { status: 500 });
  }

  return NextResponse.json({ exists: Array.isArray(data) && data.length > 0 });
}
