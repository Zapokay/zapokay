// Sprint 9H — this endpoint is only for the multi-year catch-up wizard flow.
// Single-document generation from Livre de minutes rows goes through
// /api/minute-book/generate-item (which now accepts an optional `year` param
// for annual requirements).
//
// Phase 4d Stream 1 — Edit 3: refactored to a thin wrapper around
// generatePdfDocument. No .txt generation. confirmedInfo.directorName /
// officerName / officerRole are accepted for payload compatibility but
// IGNORED — generatePdfDocument resolves signatories from current-state DB
// (director_mandates, shareholdings). confirmedInfo.resolutionDate IS used.
// Stream 3 retires the wizard entirely and will remove the dead fields.

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/activity-log'
import { generatePdfDocument } from '@/lib/pdf/generatePdfDocument'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocSelection {
  year: number
  type: 'board' | 'shareholder'
  endDate: string // ISO YYYY-MM-DD (payload compatibility; unused downstream)
}

interface CompanyInfo {
  companyName: string    // unused — resolved from DB
  directorName: string   // unused — resolved from director_mandates
  officerName: string    // unused — resolved from shareholdings
  officerRole: string    // unused — resolved from DB
  resolutionDate: string // YYYY-MM-DD — USED
}

interface GeneratedFile {
  id: string
  title: string
  year: number
  type: string
  fileUrl: string
  storagePath: string
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      companyId,
      incorporationType,
      selections,
      confirmedInfo,
      locale,
    } = body as {
      companyId: string
      incorporationType: string
      selections: DocSelection[]
      confirmedInfo: CompanyInfo
      locale: 'fr' | 'en'
    }

    if (!companyId || !selections?.length || !confirmedInfo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      console.error('[wizard/generate] SUPABASE_SERVICE_ROLE_KEY is not configured')
      return NextResponse.json(
        { error: 'Server configuration error. Please contact support.' },
        { status: 500 }
      )
    }
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    const framework = incorporationType === 'CBCA' ? 'cbca' : 'lsaq'
    const generatedFiles: GeneratedFile[] = []

    for (const selection of selections) {
      const requirementKey =
        selection.type === 'board'
          ? `${framework}_annual_board_resolution`
          : `${framework}_annual_shareholder_resolution`

      const result = await generatePdfDocument({
        supabaseAdmin,
        userId: user.id,
        companyId,
        requirementKey,
        year: selection.year,
        resolutionDate: confirmedInfo.resolutionDate,
        language: locale,
        // signatories omitted — function resolves from current-state DB
      })

      if (!result.ok) {
        console.error('[wizard/generate] generatePdfDocument failed:', result.error)
        return NextResponse.json(
          { error: `Generation failed for year ${selection.year}: ${result.error}` },
          { status: 500 }
        )
      }

      // Convert storage key → public URL for the UI response.
      // NOTE: generatePdfDocument's return field `fileUrl` actually contains
      // a storage key, not a URL. Naming cleanup deferred to Sprint 9I.
      const { data: urlData } = supabaseAdmin.storage
        .from('documents')
        .getPublicUrl(result.fileUrl)

      generatedFiles.push({
        id: result.documentId,
        title: result.title,
        year: selection.year,
        type: selection.type,
        fileUrl: urlData?.publicUrl ?? '',
        storagePath: result.fileUrl,
      })
    }

    // wizard_completed — only per-request event emitted by this route.
    // Per-document `document_generated` events are emitted inside
    // generatePdfDocument (using supabaseAdmin). Emitting here would double-log.
    const fiscalYearCount = selections.length
    await logActivity(
      supabase,
      companyId,
      user.id,
      'wizard_completed',
      `Assistant de rattrapage complété : ${fiscalYearCount} exercice${fiscalYearCount > 1 ? 's' : ''}`,
      `Catch-up wizard completed: ${fiscalYearCount} fiscal year${fiscalYearCount > 1 ? 's' : ''}`,
      { fiscal_years_count: fiscalYearCount }
    )

    revalidatePath('/[locale]/dashboard/wizard', 'page')
    revalidatePath('/[locale]/dashboard', 'page')
    revalidatePath('/[locale]/dashboard/documents', 'page')

    return NextResponse.json({ files: generatedFiles })
  } catch (err) {
    console.error('[wizard/generate] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
