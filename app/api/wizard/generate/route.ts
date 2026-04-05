import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocSelection {
  year: number
  type: 'board' | 'shareholder'
  endDate: string // ISO YYYY-MM-DD
}

interface CompanyInfo {
  companyName: string
  directorName: string
  officerName: string
  officerRole: string
  resolutionDate: string // YYYY-MM-DD
}

interface GeneratedFile {
  id: string
  title: string
  year: number
  type: string
  fileUrl: string
  storagePath: string
}

// ─── Variable substitution ────────────────────────────────────────────────────

function substituteVariables(
  template: string,
  info: CompanyInfo,
  fiscalYearEndDate: string
): string {
  return template
    .replace(/\{\{company_name\}\}/g, info.companyName)
    .replace(/\{\{director_name\}\}/g, info.directorName)
    .replace(/\{\{officer_name\}\}/g, info.officerName)
    .replace(/\{\{officer_role\}\}/g, info.officerRole)
    .replace(/\{\{fiscal_year_end_date\}\}/g, fiscalYearEndDate)
    .replace(/\{\{resolution_date\}\}/g, formatDate(info.resolutionDate))
}

function formatDate(isoDate: string, locale = 'fr'): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Template key mapping ─────────────────────────────────────────────────────

function getTemplateKey(incorporationType: string, docType: 'board' | 'shareholder'): string {
  const framework =
    incorporationType === 'CBCA' ? 'cbca' : 'lsaq'
  const docSuffix = docType === 'board' ? 'board_resolution' : 'shareholder_resolution'
  return `annual_${docSuffix}_${framework}`
}

// ─── Fallback templates ───────────────────────────────────────────────────────

const FALLBACK_TEMPLATES: Record<string, Record<string, string>> = {
  annual_board_resolution_lsaq: {
    fr: `RÉSOLUTION ÉCRITE DU CONSEIL D'ADMINISTRATION
======================================================

Société : {{company_name}}
Date de la résolution : {{resolution_date}}
Exercice financier se terminant le : {{fiscal_year_end_date}}

Les administrateurs soussignés, constituant la totalité du conseil d'administration de {{company_name}}, adoptent par voie de résolution écrite les résolutions suivantes, conformément à la Loi sur les sociétés par actions (LSAQ) :

RÉSOLUTION 1 — APPROBATION DES ÉTATS FINANCIERS
Il est résolu d'approuver les états financiers annuels de la société pour l'exercice se terminant le {{fiscal_year_end_date}}.

RÉSOLUTION 2 — RATIFICATION DES ACTES DES DIRIGEANTS
Il est résolu de ratifier tous les actes, contrats et engagements posés par les dirigeants de la société au cours de l'exercice.

RÉSOLUTION 3 — RÉMUNÉRATION DES DIRIGEANTS
Il est résolu d'approuver la rémunération versée aux dirigeants au cours de l'exercice.

------------------------------------------------------
ADMINISTRATEUR
Nom : {{director_name}}
Signature : _______________________
Date : {{resolution_date}}

DIRIGEANT
Nom : {{officer_name}}
Titre : {{officer_role}}
Signature : _______________________
Date : {{resolution_date}}
------------------------------------------------------

AVIS : Ce document est généré à titre indicatif et ne constitue pas un avis juridique. Consultez un professionnel pour valider sa conformité.`,

    en: `WRITTEN RESOLUTION OF THE BOARD OF DIRECTORS
======================================================

Company: {{company_name}}
Resolution date: {{resolution_date}}
Fiscal year ending: {{fiscal_year_end_date}}

The undersigned directors, constituting the entire board of directors of {{company_name}}, hereby adopt the following resolutions in writing, pursuant to the Business Corporations Act (LSAQ):

RESOLUTION 1 — APPROVAL OF FINANCIAL STATEMENTS
Be it resolved that the annual financial statements of the corporation for the fiscal year ending {{fiscal_year_end_date}} be and are hereby approved.

RESOLUTION 2 — RATIFICATION OF MANAGEMENT ACTS
Be it resolved that all acts, contracts and commitments made by the officers of the corporation during the fiscal year be and are hereby ratified.

RESOLUTION 3 — REMUNERATION OF OFFICERS
Be it resolved that the remuneration paid to officers during the fiscal year be and is hereby approved.

------------------------------------------------------
DIRECTOR
Name: {{director_name}}
Signature: _______________________
Date: {{resolution_date}}

OFFICER
Name: {{officer_name}}
Title: {{officer_role}}
Signature: _______________________
Date: {{resolution_date}}
------------------------------------------------------

NOTICE: This document is generated for reference purposes only and does not constitute legal advice. Consult a professional to validate its compliance.`,
  },

  annual_shareholder_resolution_lsaq: {
    fr: `PROCÈS-VERBAL DE L'ASSEMBLÉE ANNUELLE DES ACTIONNAIRES
(Résolution écrite)
======================================================

Société : {{company_name}}
Date : {{resolution_date}}
Exercice financier se terminant le : {{fiscal_year_end_date}}

L'actionnaire unique (ou les actionnaires) de {{company_name}} tient (tiennent) l'assemblée annuelle des actionnaires par voie de résolution écrite pour l'exercice se terminant le {{fiscal_year_end_date}}, conformément à la Loi sur les sociétés par actions (LSAQ).

RÉSOLUTION 1 — APPROBATION DES ÉTATS FINANCIERS
Il est résolu d'approuver les états financiers annuels de la société pour l'exercice se terminant le {{fiscal_year_end_date}}.

RÉSOLUTION 2 — ÉLECTION DES ADMINISTRATEURS
Il est résolu de confirmer en poste les administrateurs actuels jusqu'à la prochaine assemblée annuelle ou jusqu'à leur remplacement.

RÉSOLUTION 3 — RENONCIATION À LA NOMINATION D'UN AUDITEUR
Il est résolu de renoncer à la nomination d'un auditeur externe pour le prochain exercice, tous les actionnaires y ayant consenti.

RÉSOLUTION 4 — APPROBATION DES ACTES DE LA DIRECTION
Il est résolu d'approuver et de ratifier tous les actes de la direction au cours de l'exercice écoulé.

------------------------------------------------------
ACTIONNAIRE / PRÉSIDENT(E) DE L'ASSEMBLÉE
Nom : {{officer_name}}
Titre : {{officer_role}}
Signature : _______________________
Date : {{resolution_date}}
------------------------------------------------------

AVIS : Ce document est généré à titre indicatif et ne constitue pas un avis juridique. Consultez un professionnel pour valider sa conformité.`,

    en: `MINUTES OF THE ANNUAL GENERAL MEETING OF SHAREHOLDERS
(Written Resolution)
======================================================

Company: {{company_name}}
Date: {{resolution_date}}
Fiscal year ending: {{fiscal_year_end_date}}

The sole shareholder (or shareholders) of {{company_name}} hereby holds the annual general meeting of shareholders by written resolution for the fiscal year ending {{fiscal_year_end_date}}, pursuant to the Business Corporations Act (LSAQ).

RESOLUTION 1 — APPROVAL OF FINANCIAL STATEMENTS
Be it resolved that the annual financial statements of the corporation for the fiscal year ending {{fiscal_year_end_date}} be and are hereby approved.

RESOLUTION 2 — ELECTION OF DIRECTORS
Be it resolved that the current directors be confirmed in office until the next annual meeting or until their replacement.

RESOLUTION 3 — WAIVER OF AUDITOR APPOINTMENT
Be it resolved that the appointment of an external auditor for the next fiscal year be waived, all shareholders having consented thereto.

RESOLUTION 4 — RATIFICATION OF MANAGEMENT ACTS
Be it resolved that all management acts during the past fiscal year be and are hereby ratified and approved.

------------------------------------------------------
SHAREHOLDER / CHAIR OF MEETING
Name: {{officer_name}}
Title: {{officer_role}}
Signature: _______________________
Date: {{resolution_date}}
------------------------------------------------------

NOTICE: This document is generated for reference purposes only and does not constitute legal advice. Consult a professional to validate its compliance.`,
  },

  annual_board_resolution_cbca: {
    fr: `RÉSOLUTION ÉCRITE DU CONSEIL D'ADMINISTRATION
(Loi canadienne sur les sociétés par actions — LCSA/CBCA)
======================================================

Société : {{company_name}}
Date de la résolution : {{resolution_date}}
Exercice financier se terminant le : {{fiscal_year_end_date}}

Les administrateurs soussignés, constituant la totalité du conseil d'administration de {{company_name}}, adoptent par voie de résolution écrite les résolutions suivantes, conformément à la Loi canadienne sur les sociétés par actions (LCSA) :

RÉSOLUTION 1 — APPROBATION DES ÉTATS FINANCIERS
Il est résolu d'approuver les états financiers annuels de la société pour l'exercice se terminant le {{fiscal_year_end_date}}.

RÉSOLUTION 2 — RATIFICATION DES ACTES DES DIRIGEANTS
Il est résolu de ratifier tous les actes, contrats et engagements posés par les dirigeants de la société au cours de l'exercice.

RÉSOLUTION 3 — RÉMUNÉRATION DES DIRIGEANTS
Il est résolu d'approuver la rémunération versée aux dirigeants au cours de l'exercice.

------------------------------------------------------
ADMINISTRATEUR
Nom : {{director_name}}
Signature : _______________________
Date : {{resolution_date}}

DIRIGEANT
Nom : {{officer_name}}
Titre : {{officer_role}}
Signature : _______________________
Date : {{resolution_date}}
------------------------------------------------------

AVIS : Ce document est généré à titre indicatif et ne constitue pas un avis juridique. Consultez un professionnel pour valider sa conformité.`,

    en: `WRITTEN RESOLUTION OF THE BOARD OF DIRECTORS
(Canada Business Corporations Act — CBCA)
======================================================

Company: {{company_name}}
Resolution date: {{resolution_date}}
Fiscal year ending: {{fiscal_year_end_date}}

The undersigned directors, constituting the entire board of directors of {{company_name}}, hereby adopt the following resolutions in writing, pursuant to the Canada Business Corporations Act (CBCA):

RESOLUTION 1 — APPROVAL OF FINANCIAL STATEMENTS
Be it resolved that the annual financial statements of the corporation for the fiscal year ending {{fiscal_year_end_date}} be and are hereby approved.

RESOLUTION 2 — RATIFICATION OF MANAGEMENT ACTS
Be it resolved that all acts, contracts and commitments made by the officers of the corporation during the fiscal year be and are hereby ratified.

RESOLUTION 3 — REMUNERATION OF OFFICERS
Be it resolved that the remuneration paid to officers during the fiscal year be and is hereby approved.

------------------------------------------------------
DIRECTOR
Name: {{director_name}}
Signature: _______________________
Date: {{resolution_date}}

OFFICER
Name: {{officer_name}}
Title: {{officer_role}}
Signature: _______________________
Date: {{resolution_date}}
------------------------------------------------------

NOTICE: This document is generated for reference purposes only and does not constitute legal advice. Consult a professional to validate its compliance.`,
  },

  annual_shareholder_resolution_cbca: {
    fr: `PROCÈS-VERBAL DE L'ASSEMBLÉE ANNUELLE DES ACTIONNAIRES
(Loi canadienne sur les sociétés par actions — LCSA/CBCA)
(Résolution écrite)
======================================================

Société : {{company_name}}
Date : {{resolution_date}}
Exercice financier se terminant le : {{fiscal_year_end_date}}

L'actionnaire unique (ou les actionnaires) de {{company_name}} tient (tiennent) l'assemblée annuelle des actionnaires par voie de résolution écrite pour l'exercice se terminant le {{fiscal_year_end_date}}, conformément à la Loi canadienne sur les sociétés par actions (LCSA).

RÉSOLUTION 1 — APPROBATION DES ÉTATS FINANCIERS
Il est résolu d'approuver les états financiers annuels de la société pour l'exercice se terminant le {{fiscal_year_end_date}}.

RÉSOLUTION 2 — ÉLECTION DES ADMINISTRATEURS
Il est résolu de confirmer en poste les administrateurs actuels jusqu'à la prochaine assemblée annuelle.

RÉSOLUTION 3 — NOMINATION DE L'AUDITEUR / RENONCIATION
Il est résolu de renoncer à la nomination d'un auditeur externe, tous les actionnaires y ayant consenti.

RÉSOLUTION 4 — APPROBATION DES ACTES DE LA DIRECTION
Il est résolu d'approuver et de ratifier tous les actes de la direction au cours de l'exercice écoulé.

------------------------------------------------------
ACTIONNAIRE / PRÉSIDENT(E) DE L'ASSEMBLÉE
Nom : {{officer_name}}
Titre : {{officer_role}}
Signature : _______________________
Date : {{resolution_date}}
------------------------------------------------------

AVIS : Ce document est généré à titre indicatif et ne constitue pas un avis juridique. Consultez un professionnel pour valider sa conformité.`,

    en: `MINUTES OF THE ANNUAL GENERAL MEETING OF SHAREHOLDERS
(Canada Business Corporations Act — CBCA)
(Written Resolution)
======================================================

Company: {{company_name}}
Date: {{resolution_date}}
Fiscal year ending: {{fiscal_year_end_date}}

The sole shareholder (or shareholders) of {{company_name}} hereby holds the annual general meeting of shareholders by written resolution for the fiscal year ending {{fiscal_year_end_date}}, pursuant to the Canada Business Corporations Act (CBCA).

RESOLUTION 1 — APPROVAL OF FINANCIAL STATEMENTS
Be it resolved that the annual financial statements of the corporation for the fiscal year ending {{fiscal_year_end_date}} be and are hereby approved.

RESOLUTION 2 — ELECTION OF DIRECTORS
Be it resolved that the current directors be confirmed in office until the next annual meeting.

RESOLUTION 3 — AUDITOR APPOINTMENT / WAIVER
Be it resolved that the appointment of an external auditor be waived, all shareholders having consented thereto.

RESOLUTION 4 — RATIFICATION OF MANAGEMENT ACTS
Be it resolved that all management acts during the past fiscal year be and are hereby ratified and approved.

------------------------------------------------------
SHAREHOLDER / CHAIR OF MEETING
Name: {{officer_name}}
Title: {{officer_role}}
Signature: _______________________
Date: {{resolution_date}}
------------------------------------------------------

NOTICE: This document is generated for reference purposes only and does not constitute legal advice. Consult a professional to validate its compliance.`,
  },
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Validate auth
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

    // Admin client for storage + DB writes (bypasses RLS)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const generatedFiles: GeneratedFile[] = []

    for (const selection of selections) {
      const templateKey = getTemplateKey(incorporationType, selection.type)

      // Try to fetch template from DB, fall back to built-in
      let templateBody: string
      try {
        const { data: tmpl } = await supabaseAdmin
          .from('document_templates')
          .select('template_body_fr, template_body_en')
          .eq('template_key', templateKey)
          .single()

        if (tmpl) {
          templateBody =
            locale === 'fr'
              ? (tmpl.template_body_fr as string)
              : (tmpl.template_body_en as string)
        } else {
          throw new Error('not found')
        }
      } catch {
        const fallback = FALLBACK_TEMPLATES[templateKey]
        templateBody = fallback?.[locale] ?? fallback?.['fr'] ?? ''
      }

      // Format fiscal year end date for this specific year
      const fiscalYearEndDate = formatDate(selection.endDate, locale)

      // Substitute variables
      const content = substituteVariables(templateBody, confirmedInfo, fiscalYearEndDate)

      // Encode to UTF-8 bytes
      const encoder = new TextEncoder()
      const bytes = encoder.encode(content)

      // Build filename
      const typeSlug = selection.type === 'board' ? 'resolution-conseil' : 'pv-actionnaires'
      const filename = `${typeSlug}-${selection.year}.txt`
      const storagePath = `${companyId}/generated/${selection.year}/${filename}`

      // Upload to storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('documents')
        .upload(storagePath, bytes, {
          contentType: 'text/plain;charset=utf-8',
          upsert: true,
        })

      if (uploadError) {
        console.error('[wizard/generate] Upload error:', uploadError)
        return NextResponse.json(
          { error: `Upload failed for year ${selection.year}: ${uploadError.message}` },
          { status: 500 }
        )
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('documents')
        .getPublicUrl(storagePath)
      const fileUrl = urlData?.publicUrl ?? ''

      // Build title
      const typeLabel =
        selection.type === 'board'
          ? locale === 'fr'
            ? "Résolution du conseil d'administration"
            : 'Board of directors resolution'
          : locale === 'fr'
          ? 'Procès-verbal des actionnaires'
          : "Shareholders' meeting minutes"

      const title = `${typeLabel} — ${selection.year}`

      // Insert document record
      const { data: docRecord, error: dbError } = await supabaseAdmin
        .from('documents')
        .insert({
          company_id: companyId,
          title,
          document_type: selection.type === 'board' ? 'resolution' : 'pv',
          document_year: selection.year,
          file_url: fileUrl,
          language: locale,
          framework: incorporationType === 'CBCA' ? 'CBCA' : 'LSA',
          uploaded_at: new Date().toISOString(),
          status: 'active',
          source: 'generated',
        })
        .select('id')
        .single()

      if (dbError) {
        console.error('[wizard/generate] DB insert error:', dbError)
        // Non-fatal: still return the file even if DB insert fails
      }

      generatedFiles.push({
        id: docRecord?.id ?? crypto.randomUUID(),
        title,
        year: selection.year,
        type: selection.type,
        fileUrl,
        storagePath,
      })
    }

    revalidatePath('/[locale]/dashboard/wizard', 'page')
    revalidatePath('/[locale]/dashboard', 'page')
    revalidatePath('/[locale]/dashboard/documents', 'page')

    return NextResponse.json({ files: generatedFiles })
  } catch (err) {
    console.error('[wizard/generate] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
