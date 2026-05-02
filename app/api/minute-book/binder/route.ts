import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SECTIONS = [
  { key: 'statuts', title_fr: 'Statuts et actes constitutifs' },
  { key: 'avis', title_fr: 'Avis et déclarations' },
  { key: 'reglements', title_fr: 'Règlements' },
  { key: 'resolutions', title_fr: 'Résolutions' },
  { key: 'administrateurs', title_fr: 'Administrateurs' },
  { key: 'dirigeants', title_fr: 'Dirigeants' },
  { key: 'actionnaires', title_fr: 'Actionnaires et certificats' },
  { key: 'registres', title_fr: 'Registres corporatifs' },
] as const

const DOC_TYPE_SECTION_MAP: Record<string, string> = {
  statuts: 'statuts',
  resolution: 'resolutions',
  pv: 'resolutions',
  registre: 'registres',
  rapport: 'avis',
  autre: 'statuts',
}

function resolveSection(doc: any): string {
  if (doc.minute_book_section) return doc.minute_book_section
  if (doc.minute_book_requirements?.section) return doc.minute_book_requirements.section
  return DOC_TYPE_SECTION_MAP[doc.document_type] || 'statuts'
}

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

  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', company.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 })
  }

  const grouped: Record<string, any[]> = {}
  for (const s of SECTIONS) grouped[s.key] = []

  for (const doc of documents || []) {
    const section = resolveSection(doc)
    if (grouped[section]) {
      grouped[section].push(doc)
    }
  }

  const sections = SECTIONS.map((s) => ({
    key: s.key,
    title_fr: s.title_fr,
    documents: grouped[s.key],
    count: grouped[s.key].length,
  }))

  const totalDocuments = (documents || []).length

  return NextResponse.json({ sections, totalDocuments })
}
