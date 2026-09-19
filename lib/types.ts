import type { AdresseSaisie } from '@/lib/address';

export type Language = "fr" | "en";
export type IncorporationType = "LSAQ" | "LSA" | "CBCA";
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
  // Nullable depuis 50b9d62 : une société peut n'avoir qu'un nom anglais.
  legal_name_fr: string | null;
  legal_name_en: string | null;
  incorporation_type: IncorporationType;
  incorporation_number: string | null;
  incorporation_date: string;
  // ⚠️ LE SIÈGE SOCIAL, depuis 20260913120000 — six colonnes nullables, aux noms des
  // personnes et des entités. `province` n'existe plus : l'adresse l'a absorbée.
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  status: CompanyStatus;
  neq: string | null;
  // Le second identifiant, déclaré ici pour que CompanySwitcher le lise TYPÉ. Il
  // arrivait déjà par `.select('*')` mais n'existait pour personne : settings/page.tsx
  // le lisait par un cast d'échappement. Ce cast devient superflu — il n'est PAS retiré
  // ici, c'est un autre lot.
  corporation_number: string | null;
  /**
   * ⚠️ AJOUTÉES LE 2026-09-19, PARCE QUE LE COMPILATEUR LES A RÉCLAMÉES. En
   * extrayant la lecture de `companies` dans `getActiveCompany()` — typée
   * `Company` au lieu de laisser `supabase-js` rendre un objet non typé — la
   * page Complétude a cessé de compiler : elle lit ces deux colonnes depuis
   * toujours, et le type ne les déclarait pas. Le type MENTAIT par omission, et
   * personne ne pouvait le voir tant que la lecture n'était pas typée.
   * ⚪ `NOT NULL` en base (migration 20260913150000), donc `number` et non
   * `number | null` — c'est ce que `SocieteExercices` déclare déjà.
   * ⛔ LES APPELANTS GARDENT LEUR `?? 12` / `?? 31`, ET ON N'Y TOUCHE PAS ICI :
   * ces replis protègent le signal que deux générateurs de PDF refusent de
   * défauter. Les retirer est un lot à part.
   *
   * ⚠️⚠️ ET HUIT COLONNES MANQUENT ENCORE À CE TYPE — mesuré le 2026-09-19 : la
   * table en porte 28, cette interface en déclare 20. Absentes : `archived_at`,
   * `archived_reason`, `active_fiscal_year`, `onboarding_branch`,
   * `onboarding_step`, `onboarding_completed_at`, `history_phases_status`,
   * `corporation_number_digits`. Aucune n'est lue par un chemin typé
   * aujourd'hui ; les ajouter est une dette RECONNUE, pas faite ici — ce lot
   * n'ajoute que ce que le compilateur a exigé.
   */
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
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
    legalNameEn: string;
    incorporationType: IncorporationType;
    incorporationNumber: string;
    corporationNumber: string;
    incorporationDate: string;
    /** L'adresse du siège, sous les noms de colonne (lib/address.ts). Facultative ici. */
    siege: AdresseSaisie;
    fiscalYearEndMonth: number;
    fiscalYearEndDay: number;
  };
  officer: {
    fullName: string;
    role: OfficerRole;
    startDate: string;
  };
}
