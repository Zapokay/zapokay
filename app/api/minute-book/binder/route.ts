import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MINUTE_BOOK_SECTIONS, groupDocumentsBySection } from '@/lib/minute-book-section'
import { applyBinderDocumentOrder } from '@/lib/minute-book/document-order'

// ⚠️ CETTE ROUTE NE DÉCLARE PLUS RIEN. Elle portait un duplicata des neuf clés
// (avec un `title_fr` que personne n'affichait) et une copie mot pour mot de la
// table de repli. Les deux viennent maintenant de lib/minute-book-section.ts.
// Le `title_fr` ne quitte plus cette route non plus : l'écran lit le catalogue
// i18n depuis toujours, et cette copie avait déjà divergé de lui.

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

  const { data: documents, error: docError } = await applyBinderDocumentOrder(query)

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 })
  }

  // ⚠️ PLUS DE `if (grouped[section])`. Il n'a pas été retiré parce qu'il
  // devenait inutile : il ne peut plus s'écrire. groupDocumentsBySection rend
  // un Record indexé par les neuf clés, et sectionOfDocument ne peut rendre
  // qu'une de ces neuf — aucune valeur ne peut plus manquer son étagère.
  const grouped = groupDocumentsBySection(documents ?? [])

  const sections = MINUTE_BOOK_SECTIONS.map((key) => ({
    key,
    documents: grouped[key],
    count: grouped[key].length,
  }))

  const totalDocuments = (documents || []).length

  return NextResponse.json({ sections, totalDocuments })
}
