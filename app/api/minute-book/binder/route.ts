import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MINUTE_BOOK_SECTIONS, DOC_TYPE_FALLBACK } from '@/lib/minute-book-section'

// ⚠️ CETTE ROUTE NE DÉCLARE PLUS RIEN. Elle portait un duplicata des neuf clés
// (avec un `title_fr` que personne n'affichait) et une copie mot pour mot de la
// table de repli. Les deux viennent maintenant de lib/minute-book-section.ts.
// Le `title_fr` ne quitte plus cette route non plus : l'écran lit le catalogue
// i18n depuis toujours, et cette copie avait déjà divergé de lui.

function resolveSection(doc: any): string {
  if (doc.minute_book_section) return doc.minute_book_section
  if (doc.minute_book_requirements?.section) return doc.minute_book_requirements.section
  return DOC_TYPE_FALLBACK[doc.document_type] || 'autres'
}

export async function GET(request: NextRequest) {
  const scopeParam = request.nextUrl.searchParams.get('scope') ?? 'all'
  if (scopeParam !== 'all' && scopeParam !== 'finalized') {
    return NextResponse.json(
      { error: 'Invalid scope. Allowed values: all, finalized.' },
      { status: 400 }
    )
  }
  const scope = scopeParam as 'all' | 'finalized'

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

  let query = supabase
    .from('documents')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'active')

  if (scope === 'finalized') {
    query = query.eq('is_finalized', true)
  }

  const { data: documents, error: docError } = await query
    .order('document_year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 })
  }

  const grouped: Record<string, any[]> = {}
  for (const key of MINUTE_BOOK_SECTIONS) grouped[key] = []

  for (const doc of documents || []) {
    const section = resolveSection(doc)
    if (grouped[section]) {
      grouped[section].push(doc)
    }
  }

  const sections = MINUTE_BOOK_SECTIONS.map((key) => ({
    key,
    documents: grouped[key],
    count: grouped[key].length,
  }))

  const totalDocuments = (documents || []).length

  return NextResponse.json({ sections, totalDocuments })
}
