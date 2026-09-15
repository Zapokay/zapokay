// =============================================================================
// Le socle du registre des particuliers ayant un contrôle important (LCSA art. 21.1)
// =============================================================================
//
// ⛔ INERTE. Aucun fichier de l'application n'importe ce module ni ne lit les cinq
// tables qu'il décrit : check:significant-control le vérifie, et échoue le jour où
// une surface les branche.
//
// ★ LES QUATRE UNIONS SONT LE PENDANT DES QUATRE CHECK d'ensemble fermé de la migration
// 20260914204500_significant_control_forme_officielle.sql : une valeur de plus ne compile pas.
// ★ check:significant-control LES COMPARE, dans les deux sens : modifier l'un sans l'autre
// compile, et la garde tombe. Elle exige aussi que chaque CHECK nomme sa source.
//
// ⛔ AUCUN LIBELLÉ ICI : ces unions sont des CLÉS. Le libellé officiel se rendra depuis le
// catalogue i18n, avec la première surface.

import type { CountryCode } from '@/lib/countries';

/** Directement, indirectement, ou les deux — CHECK significant_control_individuals_holding_manner_check. */
export type SignificantControlHoldingManner = 'direct' | 'indirect' | 'both';

/** Seul, conjointement ou de concert — CHECK significant_control_individuals_concert_manner_check. */
export type SignificantControlConcertManner = 'individually' | 'jointly' | 'in_concert';

/** Le type d'intérêt ou de contrôle — CHECK significant_control_individuals_interest_type_check. */
export type SignificantControlInterestType = 'shares' | 'control_in_fact' | 'combination';

/** La déclaration de l'art. 34.1 DORS/2001-512 — CHECK significant_control_statements_kind_check. */
export type SignificantControlStatementKind = 'unable_to_identify' | 'none_exist';

/**
 * Une ligne de significant_control_individuals — art. 21.1(1)a) à d) LCSA.
 * Citoyennetés et résidences fiscales : SignificantControlCitizenship et
 * SignificantControlTaxResidence, une ligne par pays.
 */
export interface SignificantControlIndividual {
  id: string;
  company_id: string;
  /**
   * Le nom est en trois champs, comme au gabarit. ⛔ Aucune composition du nom complet
   * n'est écrite tant qu'aucune surface ne la lit.
   */
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  /** Adresse résidentielle, sous les noms de company_people. */
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  /** Adresse aux fins de signification, si elle a été fournie. */
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
  type_of_interest_or_control: SignificantControlInterestType;
  /** Le champ libre du gabarit ; il porte aussi la précision que la transmission perd. */
  type_additional_info: string | null;
  /**
   * Deux tests indépendants (art. 2.1(3) LCSA), saisis tels que déclarés, jamais calculés.
   * Aucune CHECK ne les lie au type d'intérêt.
   */
  percentage_votes: number | null;
  percentage_fair_market_value: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Une ligne de significant_control_individual_citizenships — art. 21.1(1)a.1).
 * ⚠️ `country_code` est typé CountryCode, mais la base ne l'impose pas : aucune CHECK n'énumère
 * les pays, pour ne pas déclarer la liste une seconde fois.
 */
export interface SignificantControlCitizenship {
  id: string;
  individual_id: string;
  country_code: CountryCode;
  created_at: string;
}

/** Une ligne de significant_control_individual_tax_residences — art. 21.1(1)b). Même réserve sur `country_code`. */
export interface SignificantControlTaxResidence {
  id: string;
  individual_id: string;
  country_code: CountryCode;
  created_at: string;
}

/** Une ligne de significant_control_diligence_steps — art. 21.1(1)f) et 21.1(2). */
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

/** Une ligne de significant_control_statements — art. 21.2 LCSA, art. 34.1 DORS/2001-512. */
export interface SignificantControlStatement {
  id: string;
  company_id: string;
  statement_date: string;
  statement_kind: SignificantControlStatementKind;
  /** Le résumé des mesures prises, exigé par l'art. 34.1b). */
  steps_summary: string;
  /** Le COMPTE qui a consigné la déclaration ; ON DELETE SET NULL, comme pour les mesures de diligence. */
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}
