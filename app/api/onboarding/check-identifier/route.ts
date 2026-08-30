export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// ⚠️⚠️ LITERAL WHITELIST — THE COLUMN NAME NEVER COMES FROM THE CLIENT.
// This endpoint answers "is this identifier held by ANOTHER tenant?" using the service
// role, so RLS is bypassed by design. Interpolating a client-supplied string into the
// filter would turn it into an oracle over EVERY column of `companies` — strictly
// wider than the unauthenticated leak this endpoint was rebuilt to close (cfabf76).
// Any other value is REJECTED, never silently defaulted to a column.
const FIELDS = {
  neq: 'neq',
  corporationNumber: 'corporation_number',
} as const;
type FieldKey = keyof typeof FIELDS;

export async function POST(request: NextRequest) {
  // A SESSION IS REQUIRED. Measured 2026-08-29: one caller, always behind a session,
  // no public path — so this costs the product nothing. Inherited from check-neq at
  // cfabf76 together with the self-exclusion below; both live HERE, once, rather than
  // being duplicated into a twin route where one copy would drift from the other.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ exists: false }, { status: 401 });

  const { field, value } = (await request.json()) as { field?: string; value?: string };

  if (!field || !Object.prototype.hasOwnProperty.call(FIELDS, field)) {
    return NextResponse.json({ exists: false, error: 'unknown field' }, { status: 400 });
  }
  const column = FIELDS[field as FieldKey];

  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return NextResponse.json({ exists: false });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ exists: false }, { status: 500 });
  }

  // ⚠️ `.neq('user_id', …)` is what lets a returning user retype their OWN identifier
  // without being told it belongs to someone else. `exists` therefore means "held by
  // SOMEONE ELSE" — a plain boolean, unchanged from check-neq.
  const serviceClient = createServiceClient();

  const { data, error } = await serviceClient
    .from('companies')
    .select('id')
    .eq(column, trimmed)
    .neq('user_id', user.id)
    .limit(1);

  // A failed lookup is not "no duplicate", but it must not block the form either: the
  // caller treats a failure as non-fatal by design, and the unique index is the real
  // enforcement. Same shape as the missing-env branch above.
  if (error) {
    return NextResponse.json({ exists: false }, { status: 500 });
  }

  return NextResponse.json({ exists: Array.isArray(data) && data.length > 0 });
}
