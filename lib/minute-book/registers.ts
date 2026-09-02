/**
 * LES QUATRE REGISTRES DU LIVRE — la logique, sortie des routes.
 *
 * ⚠️ CE MODULE NE CHANGE AUCUN COMPORTEMENT. Les transformations sont recopiées
 * telles quelles depuis app/api/registers/*\/route.ts au b552dff : mêmes filtres,
 * mêmes tris, mêmes titres — y compris les deux paires de titres du compte
 * capital selon le régime. Seuls les TYPES des lignes lues ont été déclarés, là
 * où les routes écrivaient `any`. Le résultat exécuté est identique, et c'est
 * prouvé par banc plutôt qu'affirmé.
 *
 * ★ POURQUOI L'EXTRACTION. L'export tourne côté serveur avec la clé de service ;
 * il ne peut pas `fetch` ses propres routes. Sans ces lecteurs, l'archive
 * relirait la base à sa façon et finirait par diverger de l'écran — le défaut
 * que tout ce lot a passé son temps à refermer.
 *
 * ⛔ LA RÉSOLUTION DE LA SOCIÉTÉ RESTE DANS LA ROUTE. Ces lecteurs prennent un
 * `companyId` qu'on leur donne. Le `.single()` des routes crée une asymétrie
 * avec l'export, qui reçoit son identifiant en paramètre — la corriger
 * changerait le comportement, et ce commit n'en change aucun.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** La forme que les quatre routes rendent, et que BinderView consomme. */
export interface RegisterPayload<E> {
  register_title_fr: string;
  register_title_en: string;
  entries: E[];
}

/* ------------------------------------------------------------------ */
/*  Administrateurs                                                    */
/* ------------------------------------------------------------------ */

export interface DirectorRegisterEntry {
  full_name: string;
  address: string;
  is_canadian_resident: boolean;
  appointment_date: string;
  end_date: string | null;
  end_reason: string | null;
  is_active: boolean;
}

interface PersonneAvecMandats {
  full_name: string;
  address_line1: string | null;
  address_city: string | null;
  is_canadian_resident: boolean | null;
  director_mandates?: {
    deleted_at: string | null;
    appointment_date: string;
    end_date: string | null;
    end_reason: string | null;
    is_active: boolean;
  }[];
}

export async function readDirectorRegister(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RegisterPayload<DirectorRegisterEntry>> {
  const { data, error } = await supabase
    .from('company_people')
    .select('*, director_mandates(*)')
    .eq('company_id', companyId);

  // Une seule assertion, à la frontière de la base — pas un `any` par fonction.
  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UN REGISTRE VIDE. Sans cette ligne,
  // `data` vaut null et le registre se rendait vide — le mensonge que 503ff11
  // a corrigé à l'écran, et qui rendait impossible de faire échouer un export.
  if (error) throw new Error(`readDirectorRegister: read failed: ${error.message}`);
  const people = (data ?? []) as unknown as PersonneAvecMandats[];

  // Phase 1B-CAPTURE Bundle 2: exclude soft-deleted mandates from the register
  // (audit §8d row 3 — protects register PDF + BinderView via the registers API).
  const entries = people
    .filter((p) => p.director_mandates && p.director_mandates.length > 0)
    .flatMap((p) =>
      (p.director_mandates ?? [])
        .filter((m) => !m.deleted_at)
        .map((m) => ({
          full_name: p.full_name,
          address: p.address_line1 ? `${p.address_line1}, ${p.address_city || ''}`.trim().replace(/,$/, '') : '',
          is_canadian_resident: p.is_canadian_resident ?? true,
          appointment_date: m.appointment_date,
          end_date: m.end_date || null,
          end_reason: m.end_reason || null,
          is_active: m.is_active,
        }))
    )
    .sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime();
    });

  return {
    register_title_fr: 'Registre des administrateurs',
    register_title_en: 'Director Register',
    entries,
  };
}

/* ------------------------------------------------------------------ */
/*  Dirigeants                                                         */
/* ------------------------------------------------------------------ */

const TITLE_FR_MAP: Record<string, string> = {
  president: 'Président·e',
  vice_president: 'Vice-président·e',
  secretary: 'Secrétaire',
  treasurer: 'Trésorier·ère',
  director_general: 'Directeur·rice général·e',
};

export interface OfficerRegisterEntry {
  full_name: string;
  title: string;
  appointment_date: string;
  end_date: string | null;
  end_reason: string | null;
  is_active: boolean;
}

interface PersonneAvecCharges {
  full_name: string;
  officer_appointments?: {
    deleted_at: string | null;
    title: string;
    custom_title: string | null;
    appointment_date: string;
    end_date: string | null;
    end_reason: string | null;
    is_active: boolean;
  }[];
}

export async function readOfficerRegister(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RegisterPayload<OfficerRegisterEntry>> {
  const { data, error } = await supabase
    .from('company_people')
    .select('*, officer_appointments(*)')
    .eq('company_id', companyId);

  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UN REGISTRE VIDE. Sans cette ligne,
  // `data` vaut null et le registre se rendait vide — le mensonge que 503ff11
  // a corrigé à l'écran, et qui rendait impossible de faire échouer un export.
  if (error) throw new Error(`readOfficerRegister: read failed: ${error.message}`);
  const people = (data ?? []) as unknown as PersonneAvecCharges[];

  // Phase 1B-CAPTURE Bundle 2: exclude soft-deleted appointments from the register
  // (audit §8d row 4 — protects register PDF + BinderView via the registers API).
  const entries = people
    .filter((p) => p.officer_appointments && p.officer_appointments.length > 0)
    .flatMap((p) =>
      (p.officer_appointments ?? [])
        .filter((m) => !m.deleted_at)
        .map((m) => ({
          full_name: p.full_name,
          title: m.title === 'custom'
            ? (m.custom_title || m.title)
            : (TITLE_FR_MAP[m.title] || m.title),
          appointment_date: m.appointment_date,
          end_date: m.end_date || null,
          end_reason: m.end_reason || null,
          is_active: m.is_active,
        }))
    )
    .sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      return new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime();
    });

  return {
    register_title_fr: 'Registre des dirigeants',
    register_title_en: 'Officer Register',
    entries,
  };
}

/* ------------------------------------------------------------------ */
/*  Actionnaires                                                       */
/* ------------------------------------------------------------------ */

export interface ShareholderRegisterEntry {
  full_name: string;
  share_class: string;
  quantity: number;
  certificate_number: string | null;
  issue_date: string;
  issue_price_per_share: number | null;
}

interface DetentionAvecDetenteurs {
  quantity: number;
  certificate_number: string | null;
  issue_date: string;
  issue_price_per_share: number | null;
  share_classes?: { name: string } | null;
  shareholding_holders?: {
    holder_type: 'individual' | 'entity';
    display_order: number;
    person: { full_name: string } | null;
    entity: { legal_name: string } | null;
  }[];
}

export async function readShareholderRegister(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RegisterPayload<ShareholderRegisterEntry>> {
  // Atom 2: inverted-join shape per R-G2 audit §3 R6 recommendation. One
  // register entry per (shareholding × holder) tuple.
  const { data, error } = await supabase
    .from('shareholdings')
    .select(`
      *,
      share_classes(*),
      shareholding_holders(
        holder_type, display_order,
        person:company_people(*),
        entity:shareholder_entities(*)
      )
    `)
    .eq('company_id', companyId);

  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UN REGISTRE VIDE. Sans cette ligne,
  // `data` vaut null et le registre se rendait vide — le mensonge que 503ff11
  // a corrigé à l'écran, et qui rendait impossible de faire échouer un export.
  if (error) throw new Error(`readShareholderRegister: read failed: ${error.message}`);
  const shareholdings = (data ?? []) as unknown as DetentionAvecDetenteurs[];

  const entries = shareholdings
    .flatMap((sh) => {
      const holders = sh.shareholding_holders ?? [];
      // Sort holders by display_order so joint-holder entries surface in the
      // intended order (primary holder first per atom 1 §3 display_order).
      const sortedHolders = [...holders].sort(
        (a, b) => a.display_order - b.display_order
      );
      return sortedHolders.map((h) => ({
        full_name:
          h.person?.full_name ?? h.entity?.legal_name ?? '(unknown holder)',
        share_class: sh.share_classes?.name || 'Classe A',
        quantity: sh.quantity,
        certificate_number: sh.certificate_number || null,
        issue_date: sh.issue_date,
        issue_price_per_share: sh.issue_price_per_share ?? null,
      }));
    })
    .sort(
      (a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
    );

  return {
    register_title_fr: 'Registre des actionnaires',
    register_title_en: 'Shareholder Register',
    entries,
  };
}

/* ------------------------------------------------------------------ */
/*  Compte capital déclaré                                             */
/* ------------------------------------------------------------------ */

export interface StatedCapitalEntry {
  class_name: string;
  stated_capital: number;
  currency: string;
  issuances_missing_price: number;
}

export interface StatedCapitalPayload extends RegisterPayload<StatedCapitalEntry> {
  citation_fr: string;
  citation_en: string;
}

interface DetentionPourCapital {
  share_class_id: string;
  quantity: number | string | null;
  issue_price_per_share: number | string | null;
  source: string | null;
  end_reason: string | null;
  end_date: string | null;
  share_classes?: { name: string } | null;
}

export async function readStatedCapitalRegister(
  supabase: SupabaseClient,
  companyId: string,
  incorporationType: string | null,
): Promise<StatedCapitalPayload> {
  const { data, error } = await supabase
    .from('shareholdings')
    .select(`
      share_class_id,
      quantity,
      issue_price_per_share,
      source,
      end_reason,
      end_date,
      share_classes(name)
    `)
    .eq('company_id', companyId);

  // ⚠️ UN ÉCHEC DE LECTURE N'EST PAS UN REGISTRE VIDE. Sans cette ligne,
  // `data` vaut null et le registre se rendait vide — le mensonge que 503ff11
  // a corrigé à l'écran, et qui rendait impossible de faire échouer un export.
  if (error) throw new Error(`readStatedCapitalRegister: read failed: ${error.message}`);
  const shareholdings = (data ?? []) as unknown as DetentionPourCapital[];

  // Per-class accumulation. Capital model:
  //   capital_in  = Σ(quantity × price) over DIRECT ISSUANCES with a price
  //   capital_out = Σ(quantity × price) over REDEMPTIONS + CANCELLATIONS with a price
  //   stated_capital = capital_in − capital_out
  // Transfers (source='transfer') are capital-neutral. A direct issuance with a
  // NULL price is SKIPPED from the sum and COUNTED in issuances_missing_price so
  // the card can flag it — never silently 0.
  const byClass = new Map<string, {
    class_name: string;
    capital_in: number;
    capital_out: number;
    issuances_missing_price: number;
  }>();

  for (const sh of shareholdings) {
    const classId = sh.share_class_id;
    const className = sh.share_classes?.name || 'Classe A';
    const entry = byClass.get(classId) ?? {
      class_name: className,
      capital_in: 0,
      capital_out: 0,
      issuances_missing_price: 0,
    };

    const qty = Number(sh.quantity) || 0;
    const priceRaw = sh.issue_price_per_share;
    const hasPrice =
      priceRaw !== null && priceRaw !== undefined && priceRaw !== '';
    const price = hasPrice ? Number(priceRaw) : null;
    const priceValid = price !== null && Number.isFinite(price);

    if (sh.source === 'direct_issuance') {
      if (priceValid) {
        entry.capital_in += qty * (price as number);
      } else {
        entry.issuances_missing_price += 1;
      }
    }

    if (
      (sh.end_reason === 'redemption' || sh.end_reason === 'cancellation') &&
      priceValid
    ) {
      entry.capital_out += qty * (price as number);
    }

    byClass.set(classId, entry);
  }

  // No currency column in the schema; Canadian corporate context (LSAQ + CBCA).
  const CURRENCY = 'CAD';
  const entries = Array.from(byClass.values())
    .map((e) => ({
      class_name: e.class_name,
      stated_capital: e.capital_in - e.capital_out,
      currency: CURRENCY,
      issuances_missing_price: e.issuances_missing_price,
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name));

  const isCBCA = incorporationType === 'CBCA';
  // ✅ GREEN — Harvey-verified 2026-06-25 — stated-capital citation (art.68 LSAQ / s.26 CBCA).
  const citation_fr = isCBCA
    ? 'Compte capital déclaré tenu en vertu de l\'art. 26 LCSA.'
    : 'Compte de capital-actions émis et payé tenu en vertu de l\'art. 68 LSAQ.';
  const citation_en = isCBCA
    ? 'Stated capital account maintained under CBCA s. 26.'
    : 'Issued and paid-up share capital account maintained under LSAQ art. 68.';

  return {
    register_title_fr: isCBCA ? 'Compte capital déclaré' : 'Compte de capital-actions émis et payé',
    register_title_en: isCBCA ? 'Stated Capital Account' : 'Issued and Paid-Up Share Capital Account',
    citation_fr,
    citation_en,
    entries,
  };
}
