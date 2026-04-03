export type Language = "fr" | "en";
export type IncorporationType = "LSAQ" | "LSA" | "CBCA";
export type Province = "QC" | "ON" | "BC" | "AB" | "MB" | "SK" | "NS" | "NB" | "NL" | "PE" | "YT" | "NT" | "NU";
export type OfficerRole = "director" | "officer" | "shareholder";
export type DocumentType = "resolution" | "bylaw" | "register" | "certificate" | "other";
export type ComplianceStatus = "pending" | "complete" | "overdue" | "not_applicable";
export type ComplianceFrequency = "annual" | "one_time" | "triggered";
export type CompanyStatus = "active" | "inactive";

export interface UserProfile {
  id: string;
  full_name: string | null;
  preferred_language: Language;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  user_id: string;
  legal_name_fr: string;
  legal_name_en: string | null;
  incorporation_type: IncorporationType;
  incorporation_number: string | null;
  incorporation_date: string | null;
  province: Province;
  status: CompanyStatus;
  neq: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyOfficer {
  id: string;
  company_id: string;
  full_name: string;
  role: OfficerRole;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface OnboardingData {
  language: Language;
  company: {
    legalName: string;
    incorporationType: IncorporationType;
    incorporationNumber: string;
    incorporationDate: string;
    province: Province;
  };
  officer: {
    fullName: string;
    role: OfficerRole;
    startDate: string;
  };
}
