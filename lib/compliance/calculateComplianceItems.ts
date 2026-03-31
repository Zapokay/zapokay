import { SupabaseClient } from '@supabase/supabase-js'
import {
  ComplianceResult,
  ComplianceRule,
  ComplianceStatus,
  EnrichedComplianceItem,
  DOCUMENT_TYPE_TO_RULE,
} from './complianceRules'

// ─── Helpers date ─────────────────────────────────────────────────────────────

function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function currentFiscalYearStart(
  month: number, // 1–12
  day: number,
  today: Date
): Date {
  // Fiscal year starts on (month/day) of some year.
  // Find the most recent past occurrence.
  const thisYear = new Date(today.getFullYear(), month - 1, day)
  if (thisYear <= today) return thisYear
  return new Date(today.getFullYear() - 1, month - 1, day)
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// ─── Due date calculators per rule_key ────────────────────────────────────────

function calculateDueDate(
  ruleKey: string,
  fyEndMonth: number,
  fyEndDay: number,
  incorporationDate: string | null,
  today: Date
): Date | null {
  const fyStart = currentFiscalYearStart(fyEndMonth, fyEndDay, today)
  // Fiscal year end = fyStart + 12 months
  const fyEnd = addMonths(fyStart, 12)

  switch (ruleKey) {
    case 'annual_board_resolution':
    case 'annual_shareholder_resolution':
    case 'annual_financial_statements':
    case 'auditor_waiver':
      // FY end + 6 months
      return addMonths(fyEnd, 6)

    case 'req_annual_update': {
      // FY end + 4 months, day 15
      const d = addMonths(fyEnd, 4)
      d.setDate(15)
      return d
    }

    case 'corporations_canada_annual_return': {
      if (!incorporationDate) return null
      const incDate = new Date(incorporationDate)
      // Anniversary month of current year
      const anniv = new Date(today.getFullYear(), incDate.getMonth(), incDate.getDate())
      // If already passed this year, next year
      if (anniv < today) anniv.setFullYear(today.getFullYear() + 1)
      return anniv
    }

    default:
      return addMonths(fyEnd, 6)
  }
}

// ─── Main function ─────────────────────────────────────────────────────────────

export async function calculateComplianceItems(
  companyId: string,
  supabaseClient: SupabaseClient
): Promise<ComplianceResult & { needsFiscalYear?: boolean }> {

  const emptyResult: ComplianceResult & { needsFiscalYear?: boolean } = {
    items: [],
    percentage: 0,
    urgentCount: 0,
    pendingCount: 0,
    compliantCount: 0,
    needsFiscalYear: false,
  }

  // ── 1. Charger le profil de l'entreprise ──────────────────────────────────
  const { data: company, error: companyError } = await supabaseClient
    .from('companies')
    .select(
      'id, incorporation_type, province, fiscal_year_end_month, fiscal_year_end_day, corporation_number, incorporation_date'
    )
    .eq('id', companyId)
    .single()

  if (companyError || !company) return emptyResult

  // Fiscal year end manquant → retourner résultat vide avec flag
  if (!company.fiscal_year_end_month) {
    return { ...emptyResult, needsFiscalYear: true }
  }

  const fyEndMonth: number = company.fiscal_year_end_month
  const fyEndDay: number   = company.fiscal_year_end_day ?? 31
  const incType: string    = company.incorporation_type ?? 'LSA'
  const province: string   = company.province ?? 'QC'

  // ── 2. Charger les documents actifs ──────────────────────────────────────
  const { data: documents } = await supabaseClient
    .from('documents')
    .select('id, document_type, uploaded_at, created_at')
    .eq('company_id', companyId)
    .neq('status', 'archived')

  const docs = documents ?? []

  // ── 3. Déterminer les règles applicables ─────────────────────────────────
  let rulesQuery = supabaseClient.from('compliance_rules').select('*')

  if (incType === 'LSA') {
    rulesQuery = rulesQuery
      .eq('framework', 'LSA')
      .eq('jurisdiction', 'QC')
  } else if (incType === 'CBCA') {
    if (province === 'QC') {
      // Double piste : toutes les règles CBCA + req_annual_update LSA/QC
      rulesQuery = rulesQuery.or(
        `framework.eq.CBCA,and(framework.eq.LSA,jurisdiction.eq.QC,rule_key.eq.req_annual_update)`
      )
    } else {
      rulesQuery = rulesQuery.eq('framework', 'CBCA')
    }
  }

  const { data: rules } = await rulesQuery
  if (!rules || rules.length === 0) return emptyResult

  // ── 4. Calculer les dates et statuts ─────────────────────────────────────
  const today = new Date()

  // Début de l'exercice fiscal courant (pour filtrer les documents)
  const fyStart = currentFiscalYearStart(fyEndMonth, fyEndDay, today)
  const fyStartStr = toISODateString(fyStart)

  // Indexer les documents par document_type → date la plus récente (après fyStart)
  const docByType: Record<string, string> = {} // document_type → uploaded_at
  for (const doc of docs) {
    const uploadedAt = doc.uploaded_at ?? doc.created_at
    if (!uploadedAt) continue
    if (uploadedAt < fyStartStr) continue // avant le début de l'exercice courant
    const existing = docByType[doc.document_type]
    if (!existing || uploadedAt > existing) {
      docByType[doc.document_type] = uploadedAt
    }
  }

  const enrichedItems: EnrichedComplianceItem[] = []
  const upsertPayload: Array<{
    company_id: string
    rule_id: string
    status: ComplianceStatus
    due_date: string | null
  }> = []

  for (const rule of rules as ComplianceRule[]) {
    const dueDate = calculateDueDate(
      rule.rule_key,
      fyEndMonth,
      fyEndDay,
      company.incorporation_date ?? null,
      today
    )
    const dueDateStr = dueDate ? toISODateString(dueDate) : null

    // Chercher un document correspondant dans l'exercice courant
    const matchingDocType = Object.entries(DOCUMENT_TYPE_TO_RULE).find(
      ([, rk]) => rk === rule.rule_key
    )?.[0]

    const foundDocDate = matchingDocType ? docByType[matchingDocType] ?? null : null

    // Déterminer le statut
    let status: ComplianceStatus
    if (foundDocDate) {
      status = 'compliant'
    } else if (dueDate && dueDate > today) {
      status = 'pending'
    } else {
      status = 'required'
    }

    const daysUntilDue = dueDate ? daysBetween(today, dueDate) : null

    // Créer un id stable pour cet item (company + rule)
    const stableId = `${companyId}_${rule.id}`

    const enriched: EnrichedComplianceItem = {
      id: stableId,
      company_id: companyId,
      rule_id: rule.id,
      status,
      due_date: dueDateStr,
      rule,
      daysUntilDue,
      lastDocumentDate: foundDocDate
        ? foundDocDate.split('T')[0]
        : null,
    }

    enrichedItems.push(enriched)
    upsertPayload.push({
      company_id: companyId,
      rule_id: rule.id,
      status,
      due_date: dueDateStr,
    })
  }

  // ── 5. Upsert dans compliance_items ──────────────────────────────────────
  await supabaseClient
    .from('compliance_items')
    .upsert(upsertPayload, {
      onConflict: 'company_id,rule_id',
      ignoreDuplicates: false,
    })

  // ── 6. Calculer les statistiques ─────────────────────────────────────────
  const compliantCount = enrichedItems.filter(i => i.status === 'compliant').length
  const pendingCount   = enrichedItems.filter(i => i.status === 'pending').length
  const urgentCount    = enrichedItems.filter(i => i.status === 'required').length
  const total          = enrichedItems.length
  const percentage     = total > 0 ? Math.round((compliantCount / total) * 100) : 0

  // Trier : required en premier, pending, compliant en dernier
  enrichedItems.sort((a, b) => {
    const order = { required: 0, pending: 1, compliant: 2 }
    return order[a.status] - order[b.status]
  })

  return {
    items: enrichedItems,
    percentage,
    urgentCount,
    pendingCount,
    compliantCount,
    needsFiscalYear: false,
  }
}
