export type ComplianceStatus = 'compliant' | 'pending' | 'required'

export type ComplianceFramework = 'LSA' | 'CBCA'

export interface ComplianceRule {
  id: string
  jurisdiction: string
  framework: ComplianceFramework
  rule_key: string
  title_fr: string
  title_en: string
  frequency: string
  legal_reference: string | null
  last_reviewed_at: string | null
  reviewed_by: string | null
}

export interface ComplianceItem {
  id: string
  company_id: string
  rule_id: string
  status: ComplianceStatus
  due_date: string | null
  rule?: ComplianceRule
}

export interface ComplianceResult {
  items: EnrichedComplianceItem[]
  percentage: number
  urgentCount: number
  pendingCount: number
  compliantCount: number
  needsFiscalYear?: boolean
}

export interface EnrichedComplianceItem extends ComplianceItem {
  rule: ComplianceRule
  daysUntilDue: number | null
  lastDocumentDate: string | null
}

// Correspondance document_type → rule_key
export const DOCUMENT_TYPE_TO_RULE: Record<string, string> = {
  'resolution': 'annual_board_resolution',
  'pv':         'annual_shareholder_resolution',
  'rapport':    'annual_financial_statements',
  'statuts':    'req_annual_update',
}
