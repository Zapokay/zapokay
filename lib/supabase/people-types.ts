// =============================================================================
// Sprint 6 — People & Ownership types
// =============================================================================

// ---------------------------------------------------------------------------
// company_people — Central person registry
// ---------------------------------------------------------------------------
export interface CompanyPerson {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string;
  is_canadian_resident: boolean;
  created_at: string;
  updated_at: string;
}

export type CompanyPersonInsert = Omit<CompanyPerson, 'id' | 'created_at' | 'updated_at'>;
export type CompanyPersonUpdate = Partial<CompanyPersonInsert>;

// ---------------------------------------------------------------------------
// director_mandates
// ---------------------------------------------------------------------------
export type DirectorEndReason =
  | 'resignation'
  | 'revocation'
  | 'death'
  | 'disqualification'
  | 'term_expired';

export interface DirectorMandate {
  id: string;
  company_id: string;
  person_id: string;
  appointment_date: string; // DATE as ISO string
  end_date: string | null;
  end_reason: DirectorEndReason | null;
  is_active: boolean;
  created_at: string;
}

export type DirectorMandateInsert = Omit<DirectorMandate, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// officer_appointments
// ---------------------------------------------------------------------------
export type OfficerTitle =
  | 'president'
  | 'secretary'
  | 'treasurer'
  | 'vice_president'
  | 'custom';

export interface OfficerAppointment {
  id: string;
  company_id: string;
  person_id: string;
  title: OfficerTitle;
  custom_title: string | null;
  is_primary_signing_authority: boolean;
  appointment_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export type OfficerAppointmentInsert = Omit<OfficerAppointment, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// share_classes
// ---------------------------------------------------------------------------
export type ShareClassType = 'common' | 'preferred';

export interface ShareClass {
  id: string;
  company_id: string;
  name: string;
  type: ShareClassType;
  voting_rights: boolean;
  votes_per_share: number;
  max_quantity: number | null;
  created_at: string;
}

export type ShareClassInsert = Omit<ShareClass, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// shareholdings
// ---------------------------------------------------------------------------
export interface Shareholding {
  id: string;
  company_id: string;
  person_id: string;
  share_class_id: string;
  quantity: number;
  issue_date: string;
  issue_price_per_share: number | null;
  certificate_number: string | null;
  created_at: string;
}

export type ShareholdingInsert = Omit<Shareholding, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// Joined / enriched types used by the UI
// ---------------------------------------------------------------------------

/** A director row joined with company_people */
export interface DirectorWithPerson extends DirectorMandate {
  person: CompanyPerson;
}

/** An officer row joined with company_people */
export interface OfficerWithPerson extends OfficerAppointment {
  person: CompanyPerson;
}

/** A shareholding row joined with company_people + share_classes */
export interface ShareholdingWithDetails extends Shareholding {
  person: CompanyPerson;
  share_class: ShareClass;
}

// ---------------------------------------------------------------------------
// "Roles summary" — all roles a given person holds
// ---------------------------------------------------------------------------
export interface PersonRoleSummary {
  person: CompanyPerson;
  directorMandates: DirectorMandate[];
  officerAppointments: OfficerAppointment[];
  shareholdings: (Shareholding & { share_class: ShareClass })[];
}

