export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('neq', trimmedNeq)
    .limit(1);

  return NextResponse.json({ exists: Array.isArray(data) && data.length > 0 });
}
