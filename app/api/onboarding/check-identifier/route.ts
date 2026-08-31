export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { corporationNumberComparisonKey } from '@/lib/identifiers';

// ⚠️⚠️ LITERAL WHITELIST — THE COLUMN NAME NEVER COMES FROM THE CLIENT.
// This endpoint answers "is this identifier held by ANOTHER tenant?" using the service
// role, so RLS is bypassed by design. Interpolating a client-supplied string into the
// filter would turn it into an oracle over EVERY column of `companies` — strictly
// wider than the unauthenticated leak this endpoint was rebuilt to close (cfabf76).
// Any other value is REJECTED, never silently defaulted to a column.
const FIELDS = {
  neq: 'neq',
  corporationNumber: 'corporation_number_digits',
} as const;
type FieldKey = keyof typeof FIELDS;

// ⚠️⚠️ ONE COMPARISON KEY PER FIELD — AND THE TYPE IS WHAT FORCES IT.
// This used to be a single `value.trim()` shared by both fields, and that shape is a
// TRAP. `corporationNumber` now points at `corporation_number_digits`, a generated
// column holding digits only: comparing a raw `1709431-1` against it matches NOTHING,
// so the route would answer "free" to every federal number — while compiling clean and
// passing tsc. `Record<FieldKey, …>` makes the compiler REFUSE a field added to FIELDS
// without its key here, so the two cannot drift apart in silence.
//
// ⚠️ AND THE NORMALISATION LIVES HERE, ON THE SERVER, NOT IN THE CALLER. The client
// still sends `1709431-1` verbatim — its own `normalizeCorporationNumber` only trims,
// deliberately, because the stored value keeps the hyphen. This endpoint is the guard
// rail; it must never depend on what the caller chose to normalise.
//
// ⚠️ TWIN OF A DATABASE EXPRESSION. `corporationNumberComparisonKey` mirrors
// `regexp_replace(corporation_number, '[^0-9]', '', 'g')`, the expression of the
// generated column that carries the unique index. Change one, change the other.
// Register: supabase/migrations/20260830203843_companies_corporation_number_digits.sql
const COMPARISON_KEY: Record<FieldKey, (value: string) => string> = {
  neq: v => v.trim(),
  corporationNumber: corporationNumberComparisonKey,
};

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

  // ⚠️ THE EMPTINESS TEST COMES AFTER THE FIELD'S OWN KEY, NEVER BEFORE. A federal
  // number typed as `-` is not empty, but it carries no digit: its key is the empty
  // string, and asking the database for `''` would be asking about nothing at all.
  const key = COMPARISON_KEY[field as FieldKey](value ?? '');
  if (!key) {
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
    .eq(column, key)
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
