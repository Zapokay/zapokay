// Post Sprint 9H Phase 4d Stream 1: wizard now produces PDFs exclusively via
// generatePdfDocument. Content-Type is PDF. Stream 3 retires this route entirely.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { filePathFromFileUrl } from '@/lib/storage-path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { documentId, storagePath: directPath } = body as {
      documentId?: string
      storagePath?: string
    }

    let storagePath: string = ''

    if (directPath) {
      // Use storage path directly — validate it belongs to the authenticated user
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!company || !directPath.startsWith(company.id + '/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      storagePath = directPath
    } else if (documentId) {
      // Look up document in DB, verify it belongs to the user
      const { data: doc } = await supabase
        .from('documents')
        .select('id, file_url, company_id')
        .eq('id', documentId)
        .single()

      if (!doc?.file_url) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }

      // Verify ownership via company
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('id', doc.company_id)
        .eq('user_id', user.id)
        .single()

      if (!company) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Extract storage path from file_url (tolerates full URL or relative key).
      const resolved = filePathFromFileUrl(doc.file_url)
      if (!resolved) {
        return NextResponse.json({ error: 'Invalid file URL format' }, { status: 400 })
      }
      storagePath = resolved
    } else {
      return NextResponse.json({ error: 'documentId or storagePath required' }, { status: 400 })
    }

    if (!storagePath) {
      return NextResponse.json({ error: 'Could not resolve storage path' }, { status: 400 })
    }

    // Generate signed URL using service role key (bypasses bucket RLS)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(storagePath, 300) // 5 minutes

    if (signedError || !signedData?.signedUrl) {
      console.error('[wizard/download] createSignedUrl error:', signedError)
      return NextResponse.json(
        { error: 'Could not generate signed URL', details: signedError?.message },
        { status: 500 }
      )
    }

    // If the request wants a direct download (no `stream` param), return signedUrl JSON
    // If the request wants a binary stream, fetch + proxy with Content-Disposition
    const { searchParams: qs } = new URL(req.url)
    if (qs.get('stream') === '1') {
      const fileResponse = await fetch(signedData.signedUrl)
      const fileBuffer = await fileResponse.arrayBuffer()
      const fileName = storagePath.split('/').pop() ?? 'document.pdf'
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    return NextResponse.json({ signedUrl: signedData.signedUrl })
  } catch (err) {
    console.error('[wizard/download] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
