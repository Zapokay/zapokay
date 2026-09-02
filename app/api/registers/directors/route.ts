import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readDirectorRegister } from '@/lib/minute-book/registers'

export async function GET() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'No company' }, { status: 404 })

  return NextResponse.json(await readDirectorRegister(supabase, company.id))
}
