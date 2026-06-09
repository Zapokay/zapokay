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
  deleted_at: string | null;
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

// Mirror of DirectorEndReason (5 values). Schema enforced by CHECK constraint
// in migration 20260511001738_phase10a_low_risk_additive.sql (LOCK-3).
export type OfficerEndReason =
  | 'resignation'
  | 'revocation'
  | 'death'
  | 'disqualification'
  | 'term_expired';

export interface OfficerAppointment {
  id: string;
  company_id: string;
  person_id: string;
  title: OfficerTitle;
  custom_title: string | null;
  is_primary_signing_authority: boolean;
  appointment_date: string;
  end_date: string | null;
  end_reason: OfficerEndReason | null;
  is_active: boolean;
  deleted_at: string | null;
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
export type ShareholdingEndReason =
  | 'transfer'
  | 'redemption'
  | 'cancellation'
  | 'conversion';

export interface Shareholding {
  id: string;
  company_id: string;
  // person_id dropped in Phase 10A.5 atom 2 (2026-05-15, migration
  // 20260515065959). Holders moved to shareholding_holders join table;
  // see ShareholdingHolder below (raw join shape). Full Holder discriminated
  // union with entity-signatory hydration deferred to atom 3.
  share_class_id: string;
  quantity: number;
  issue_date: string;
  issue_price_per_share: number | null;
  certificate_number: string | null;
  end_date: string | null;
  end_reason: ShareholdingEndReason | null;
  source: string;
  certificate_old: string | null;
  certificate_new: string | null;
  created_at: string;
}

export type ShareholdingInsert =
  Omit<Shareholding, 'id' | 'created_at' | 'end_date' | 'end_reason' | 'source' | 'certificate_old' | 'certificate_new'>
  & Partial<Pick<Shareholding, 'end_date' | 'end_reason' | 'source' | 'certificate_old' | 'certificate_new'>>;

// ---------------------------------------------------------------------------
// Phase 10A.5 atom 1 — shareholder_entities (trust + corporation holders)
// ---------------------------------------------------------------------------
export type ShareholderEntityType = 'trust' | 'corporation';

export type EntityDescriptor = 'corporation' | 'holding' | 'nonprofit';

export interface ShareholderEntity {
  id: string;
  company_id: string;
  entity_type: ShareholderEntityType;
  entity_descriptor: EntityDescriptor | null;
  legal_name: string;
  jurisdiction: string | null;
  entity_number: string | null;
  date_constituted: string | null;
  date_incorporated: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10A.5 atom 1 — shareholder_entity_signatories
// ---------------------------------------------------------------------------
export type ShareholderEntitySignatoryRole =
  | 'trustee'
  | 'president'
  | 'vice_president'
  | 'secretary'
  | 'treasurer'
  | 'custom';

export interface ShareholderEntitySignatory {
  id: string;
  company_id: string;
  entity_id: string;
  person_id: string;
  role: ShareholderEntitySignatoryRole;
  custom_role: string | null;
  start_date: string;
  end_date: string | null;
  end_reason: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10A.5 atom 1 — shareholding_holders (polymorphic join)
// ---------------------------------------------------------------------------
export type HolderType = 'individual' | 'entity';

export interface ShareholdingHolder {
  id: string;
  company_id: string;
  shareholding_id: string;
  holder_type: HolderType;
  person_id: string | null;
  entity_id: string | null;
  display_order: number;
  created_at: string;
}

/**
 * Hydrated holder row as returned by PostgREST embed
 *   `holders:shareholding_holders(*, person:company_people(*), entity:shareholder_entities(*))`.
 * Exactly one of `person` / `entity` is non-null, matching `holder_type`.
 * Full hydration with trustees / signing officers (the audit's `Holder`
 * discriminated union per decomposition proposal §2.2) is deferred to atom 3+.
 */
export interface ShareholdingHolderWithDetails extends ShareholdingHolder {
  person: CompanyPerson | null;
  entity: ShareholderEntity | null;
}

// ---------------------------------------------------------------------------
// #19 foundation — event_documents (M:N link, documents ↔ lifecycle events)
// ---------------------------------------------------------------------------
// Polymorphic via (event_type, event_id). No cross-table FK on event_id;
// see migration 20260524215506_create_event_documents.sql for rationale.
export type EventDocumentType =
  | 'director_mandate'
  | 'officer_appointment'
  | 'shareholding'
  | 'share_transfer';

// Act-granular phase pinned per event_type via DB CHECK constraint in
// migration 20260524221747_event_documents_event_phase.sql:
//   director_mandate    → 'appointment' | 'departure'
//   officer_appointment → 'appointment' | 'departure'
//   shareholding        → 'issuance'    | 'cessation'
//   share_transfer      → 'transfer'
export type EventPhase =
  | 'appointment'
  | 'departure'
  | 'issuance'
  | 'cessation'
  | 'transfer';

export interface EventDocument {
  id: string;
  document_id: string;
  event_type: EventDocumentType;
  event_id: string;
  event_phase: EventPhase;
  company_id: string;
  created_at: string;
}

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

/**
 * A shareholding row joined with holders + share_classes (atom 2 shape).
 * Post atom 2 the canonical "who owns this" surface is `holders`.
 */
export interface ShareholdingWithDetails extends Shareholding {
  holders: ShareholdingHolderWithDetails[];
  share_class: ShareClass;
  /**
   * @deprecated Transitional convenience field. Hydrated at the data-loader
   * boundary from `holders[0]?.person` for individual single-holder
   * shareholdings; null for entity holders and joint holdings. Read
   * `holders` directly. Slated for removal in Phase 10A.5 atom 3.
   */
  person: CompanyPerson | null;
}

// ---------------------------------------------------------------------------
// "Roles summary" — all roles a given person holds
// ---------------------------------------------------------------------------
export interface PersonRoleSummary {
  person: CompanyPerson;
  directorMandates: DirectorMandate[];
  officerAppointments: OfficerAppointment[];
  /**
   * @deprecated Vestigial — R-G2 audit (2026-05-15) §6 found zero consumers.
   * Post atom 2 the shape compiles but no longer reflects "shareholdings
   * this person holds" (that query now goes through shareholding_holders).
   * Atom 3 to decide: rebuild as `ShareholdingWithDetails[]` filtered by
   * holder identity, or remove the field entirely.
   */
  shareholdings: (Shareholding & { share_class: ShareClass })[];
}

