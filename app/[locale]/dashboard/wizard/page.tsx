export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CatchUpWizard } from '@/components/wizard/CatchUpWizard'
import type { FiscalYearInfo, CompanyInfo } from '@/components/wizard/CatchUpWizard'
import type { Company } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullCompany extends Company {
  fiscal_year_end_month: number | null
  fiscal_year_end_day: number | null
}

interface Officer {
  full_name: string
  role: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoFiscalYearEnd(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, '0')
  const paddedDay = String(day).padStart(2, '0')
  return `${year}-${paddedMonth}-${paddedDay}`
}

function formatEndDate(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function computeGapYears(
  company: FullCompany,
  existingDocs: { document_type: string; document_year: number | null }[]
): FiscalYearInfo[] {
  if (!company.incorporation_date) return []

  const fyMonth = company.fiscal_year_end_month ?? 12
  const fyDay = company.fiscal_year_end_day ?? 31

  const incYear = new Date(company.incorporation_date).getFullYear()
  const today = new Date()

  // Last completed fiscal year
  const lastFyEnd = new Date(today.getFullYear(), fyMonth - 1, fyDay)
  const lastCompletedYear = lastFyEnd <= today ? today.getFullYear() : today.getFullYear() - 1

  if (lastCompletedYear < incYear) return []

  // Build set of existing docs per year
  const docsByYear: Record<number, Set<string>> = {}
  for (const doc of existingDocs) {
    if (doc.document_year) {
      if (!docsByYear[doc.document_year]) docsByYear[doc.document_year] = new Set()
      docsByYear[doc.document_year].add(doc.document_type)
    }
  }

  // Never show more than 7 years back (max to currentYear - 7)
  const currentYear = new Date().getFullYear()
  const sevenYearsAgo = currentYear - 7
  const startYear = Math.max(incYear, sevenYearsAgo)

  const years: FiscalYearInfo[] = []

  for (let yr = startYear; yr <= lastCompletedYear; yr++) {
    const present = docsByYear[yr] ?? new Set<string>()
    const hasBoard = present.has('resolution')
    const hasShareholder = present.has('pv')

    let status: FiscalYearInfo['status']
    if (hasBoard && hasShareholder) status = 'complete'
    else if (hasBoard || hasShareholder) status = 'partial'
    else status = 'missing'

    // Only include years with gaps
    if (status === 'complete') continue

    years.push({
      year: yr,
      label: `${yr}–${yr + 1}`,
      endDate: formatEndDate(yr, fyMonth, fyDay),
      endDateIso: isoFiscalYearEnd(yr, fyMonth, fyDay),
      hasBoard,
      hasShareholder,
      status,
    })
  }

  return years
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WizardPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { year?: string }
}) {
  const supabase = createClient()
  const fr = locale === 'fr'

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/login`)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`)

  const { data: companyRaw } = await supabase
    .from('companies')
    .select(
      'id, legal_name_fr, legal_name_en, incorporation_type, incorporation_date, fiscal_year_end_month, fiscal_year_end_day'
    )
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!companyRaw) redirect(`/${locale}/onboarding`)
  const company = companyRaw as FullCompany

  // Fetch active directors
  const { data: directorMandates } = await supabase
    .from('director_mandates')
    .select('company_people(full_name)')
    .eq('company_id', company.id)
    .eq('is_active', true)

  // Fetch active officers
  const { data: officerAppointments } = await supabase
    .from('officer_appointments')
    .select('title, custom_title, company_people(full_name)')
    .eq('company_id', company.id)
    .eq('is_active', true)

  // Determine director
  const rawDirectorPeople = (directorMandates ?? [])[0]?.company_people
  const directorPerson = Array.isArray(rawDirectorPeople)
    ? (rawDirectorPeople[0] as { full_name: string } | undefined) ?? null
    : (rawDirectorPeople as { full_name: string } | null) ?? null
  const director: Officer | null = directorPerson
    ? { full_name: directorPerson.full_name, role: 'director' }
    : null

  // Determine officer (first active officer appointment, fallback to director)
  const firstOfficer = (officerAppointments ?? [])[0]
  const rawOfficerPeople = firstOfficer?.company_people
  const officerPerson = Array.isArray(rawOfficerPeople)
    ? (rawOfficerPeople[0] as { full_name: string } | undefined) ?? null
    : (rawOfficerPeople as { full_name: string } | null) ?? null
  const nonDirectorOfficer: Officer | null = officerPerson
    ? {
        full_name: officerPerson.full_name,
        role: firstOfficer.custom_title ?? firstOfficer.title,
      }
    : director

  // Fetch existing documents for gap analysis
  const { data: existingDocs } = await supabase
    .from('documents')
    .select('document_type, document_year')
    .eq('company_id', company.id)
    .eq('status', 'active')

  const allGapYears = computeGapYears(company, existingDocs ?? [])

  // Fetch configured fiscal years — only show gaps for tracked years
  const { data: fiscalYearsData } = await supabase
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', company.id)
    .eq('status', 'active')

  const configuredYearSet = new Set((fiscalYearsData ?? []).map((fy: { year: number }) => fy.year))
  const noFiscalYearsConfigured = configuredYearSet.size === 0

  // Intersect gap years with configured fiscal years
  const gapYears = noFiscalYearsConfigured
    ? allGapYears
    : allGapYears.filter(y => configuredYearSet.has(y.year))

  // Pre-selected year from URL param
  const initialSelectedYear = searchParams.year ? parseInt(searchParams.year, 10) : undefined

  // Build initial company info
  const companyName = fr
    ? company.legal_name_fr
    : (company.legal_name_en ?? company.legal_name_fr)

  const today = new Date().toISOString().slice(0, 10)

  const initialCompanyInfo: CompanyInfo = {
    companyName,
    directorName: director?.full_name ?? '',
    officerName: nonDirectorOfficer?.full_name ?? director?.full_name ?? '',
    officerRole: nonDirectorOfficer?.role ?? director?.role ?? '',
    resolutionDate: today,
  }

  return (
    <DashboardShell
      locale={locale}
      profile={profile}
      company={company}
      urgentCount={0}
    >
      <CatchUpWizard
        locale={fr ? 'fr' : 'en'}
        companyId={company.id}
        incorporationType={company.incorporation_type}
        gapYears={gapYears}
        initialCompanyInfo={initialCompanyInfo}
        initialSelectedYear={initialSelectedYear}
        noFiscalYearsConfigured={noFiscalYearsConfigured}
        settingsUrl={`/${locale}/dashboard/settings`}
      />
    </DashboardShell>
  )
}
