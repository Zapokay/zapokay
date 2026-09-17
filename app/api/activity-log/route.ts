import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

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

  const { data, count } = await supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const rows = data || []

  // #156 — enrich each document-naming row with the linked document's NAME
  // (documents.title, stored in the doc's generation language) + YEAR so the
  // client can recompose "verb (UI) + name (doc language) + year suffix (UI)".
  // Rows without a details.document_id (entity/settings events) or whose
  // document was deleted get no doc_title and fall back to the baked title on
  // the UI locale.
  const docIds = Array.from(
    new Set(
      rows
        .map((r) => (r.details as { document_id?: string } | null)?.document_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  )
  const docById = new Map<string, { title: string | null; document_year: number | null }>()
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, document_year')
      .in('id', docIds)
    for (const d of docs || []) {
      docById.set(d.id as string, {
        title: (d.title as string | null) ?? null,
        document_year: (d.document_year as number | null) ?? null,
      })
    }
  }
  // ★ L'AUTEUR — même forme que l'enrichissement ci-dessus : un `in()`, une
  // Map, un repli sur null. Un registre PARTAGÉ doit dire QUI a agi, sinon il
  // ne sert qu'à celui qui a déjà vu le geste.
  // ⛔ L'ORDRE COMPTE : le nom COURANT d'abord, le nom GELÉ ensuite.
  //    · le courant suit les renommages — quelqu'un qui corrige son nom le voit
  //      corrigé partout, ce qu'un registre doit permettre ;
  //    · le gelé ne sert QUE lorsque le lien a disparu. Mesuré le 2026-09-17 :
  //      supprimer un compte met `activity_log.user_id` à NULL (SET NULL sur une
  //      ligne `users` elle-même cascadée depuis `auth.users`). Le fait survit,
  //      le lien non — et c'est le gel qui rend l'auteur.
  // ⚠️ AUCUN COURRIEL N'EST LU ICI, ET C'EST DÉLIBÉRÉ. `users` n'en porte pas ;
  //    aller le chercher dans `auth.users` exposerait l'adresse de quelqu'un
  //    dans un registre que ses associés consultent. Décision de Dom.
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => typeof id === 'string')),
  )
  const nomCourantParUser = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: auteurs } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds)
    for (const u of auteurs || []) {
      const nom = (u.full_name as string | null)?.trim()
      if (nom) nomCourantParUser.set(u.id as string, nom)
    }
  }

  const enriched = rows.map((r) => {
    const details = r.details as { document_id?: string; author_full_name?: string } | null
    const docId = details?.document_id
    const doc = docId ? docById.get(docId) : undefined
    const nomCourant = typeof r.user_id === 'string' ? nomCourantParUser.get(r.user_id) : undefined
    const nomGele = details?.author_full_name?.trim() || undefined
    return {
      ...r,
      doc_title: doc?.title ?? null,
      doc_year: doc?.document_year ?? null,
      author_name: nomCourant ?? nomGele ?? null,
    }
  })

  return NextResponse.json({ events: enriched, total: count || 0 })
}
