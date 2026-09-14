// =============================================================================
// Le socle du registre des particuliers ayant un contrôle important (LCSA art. 21.1)
// =============================================================================
//
// ⛔ INERTE. Aucun fichier de l'application n'importe ce module ni ne lit les deux
// tables qu'il décrit : check:significant-control le vérifie, et échoue le jour où
// une surface les branche.
//
// ★ LES DEUX UNIONS SONT LE PENDANT DES DEUX CHECK de la migration
// 20260914160000_significant_control_socle.sql : une valeur de plus ne compile pas.
// ★ check:significant-control LES COMPARE, dans les deux sens : modifier l'un sans l'autre
// compile, et la garde tombe.

/** La manière de détenir — CHECK significant_control_individuals_holding_manner_check. */
export type SignificantControlHoldingManner = 'direct' | 'indirect';

/** Seul, conjointement ou de concert — CHECK significant_control_individuals_concert_manner_check. */
export type SignificantControlConcertManner = 'individually' | 'jointly' | 'in_concert';

/**
 * Partie A — une ligne de significant_control_individuals.
 *
 * ⛔ TROIS CHAMPS ABSENTS, PAR DÉCISION : citoyennetés, résidences fiscales, nature de
 * l'intérêt ou du contrôle. Leur forme attend la réponse de l'avocat — colonnes au
 * PLURIEL dans le registre du cabinet. Voir le commentaire de la table.
 */
export interface SignificantControlIndividual {
  id: string;
  company_id: string;
  full_legal_name: string;
  date_of_birth: string | null;
  /** Adresse résidentielle, sous les noms de company_people. */
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  /** Adresse de signification, si elle diffère. */
  service_address_line1: string | null;
  service_address_line2: string | null;
  service_address_city: string | null;
  service_address_province: string | null;
  service_address_postal_code: string | null;
  service_address_country: string | null;
  start_date_of_control: string;
  /** NULL = contrôle en cours ; jamais antérieure au début (CHECK significant_control_individuals_control_dates_check). */
  end_date_of_control: string | null;
  holding_manner: SignificantControlHoldingManner;
  concert_manner: SignificantControlConcertManner;
  /** Saisi tel que déclaré, jamais calculé : le produit ne détermine pas qui a un contrôle important. */
  percentage_interest: number | null;
  created_at: string;
  updated_at: string;
}

/** Partie B — une ligne de significant_control_diligence_steps. */
export interface SignificantControlDiligenceStep {
  id: string;
  company_id: string;
  step_date: string;
  steps_taken: string;
  /**
   * Le COMPTE qui a consigné la mesure — jamais une personne du dossier : le produit ne
   * lie aucun compte à company_people. Nullable et sans défaut ; ON DELETE SET NULL — le fait de
   * la diligence survit à la suppression du compte qui l'a consignée.
   */
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}
