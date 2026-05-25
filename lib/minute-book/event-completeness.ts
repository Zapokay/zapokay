/**
 * #19c — Event-aware completeness scoring (post-founding lifecycle acts).
 *
 * Pure function: takes a SupabaseClient + company identity, returns the
 * per-act flag list + score. Separate from `/api/minute-book/completeness`
 * which scores founding + annual document requirements; this engine scores
 * lifecycle ACTS (director/officer appointment & departure, share issuance &
 * cessation, share transfer) against `event_documents`.
 *
 * Flag rules (LOCKED with Dom 2026-05-24):
 *   - director_mandate appointment    — flag iff appointment_date > incorporation_date
 *   - director_mandate departure      — flag iff end_date present
 *   - officer_appointment appointment — flag iff appointment_date > incorporation_date
 *   - officer_appointment departure   — flag iff end_date present
 *   - shareholding issuance           — flag iff issue_date > incorporation_date
 *   - shareholding cessation          — flag iff end_date present
 *   - share_transfer transfer         — always flag
 *
 * Exclusions:
 *   - Soft-deleted rows (deleted_at IS NOT NULL) on director_mandates +
 *     officer_appointments. shareholdings has no deleted_at column (Bundle 2
 *     soft-delete only touched directors + officers); share_transfers has none.
 *   - Founding cohort: appointment/issuance acts dated AT OR BEFORE
 *     incorporation_date belong to the existing engine — skip.
 *   - No incorporation_date: cannot classify start-acts; skip all
 *     appointment/issuance acts and set incorporationDateMissing: true.
 *     Departures, cessations, transfers are still scored.
 *
 * Satisfied: an act is satisfied iff `event_documents` has >= 1 row matching
 * (company_id, event_type, event_id, event_phase). The transfer legacy
 * `share_transfers.resolution_document_id` was already backfilled into
 * event_documents (migration 20260524215506), so event_documents is the
 * single read path.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EventDocumentType,
  EventPhase,
} from '@/lib/supabase/people-types';

export interface EventActStatus {
  event_type: EventDocumentType;
  event_id: string;
  event_phase: EventPhase;
  /** Descriptive UI label — NOT a legal claim. Consumer formats with personName. */
  label_fr: string;
  label_en: string;
  /** Person or holder display name; null when unhydratable. */
  personName: string | null;
  /** Relevant date for the act (appointment / end / issue / transfer), ISO YYYY-MM-DD. */
  date: string;
  satisfied: boolean;
  documentId: string | null;
}

export interface EventCompletenessResponse {
  /** 100 when zero flaggable acts; else Math.round(satisfied / total * 100). */
  score: number;
  totalActs: number;
  totalSatisfied: number;
  totalMissing: number;
  /**
   * True when the company has no incorporation_date on file. In that state,
   * appointment + issuance acts cannot be classified (founding-cohort filter
   * is impossible) and are excluded from `acts`. UI should surface this to
   * direct the user to set the incorporation date.
   */
  incorporationDateMissing: boolean;
  acts: EventActStatus[];
}

const LABELS: Record<
  | 'director_appointment'
  | 'director_departure'
  | 'officer_appointment'
  | 'officer_departure'
  | 'share_issuance'
  | 'share_cessation'
  | 'share_transfer',
  { fr: string; en: string }
> = {
  director_appointment: { fr: "Nomination d'un administrateur", en: 'Director appointment' },
  director_departure:   { fr: "Départ d'un administrateur",     en: 'Director departure' },
  officer_appointment:  { fr: "Nomination d'un dirigeant",      en: 'Officer appointment' },
  officer_departure:    { fr: "Départ d'un dirigeant",          en: 'Officer departure' },
  share_issuance:       { fr: "Émission d'actions",             en: 'Share issuance' },
  share_cessation:      { fr: "Cessation d'actions",            en: 'Share cessation' },
  share_transfer:       { fr: "Transfert d'actions",            en: 'Share transfer' },
};

// Raw shapes from supabase-js with PostgREST embeds. Loose typing because the
// embedded children are dictated by the .select() strings below; we narrow on
// use.
interface RawPerson { full_name: string | null }
interface RawEntity { legal_name: string | null }
interface RawHolder {
  holder_type: 'individual' | 'entity';
  person: RawPerson | null;
  entity: RawEntity | null;
}
interface RawDirector {
  id: string;
  appointment_date: string;
  end_date: string | null;
  person: RawPerson | null;
}
interface RawOfficer {
  id: string;
  appointment_date: string;
  end_date: string | null;
  person: RawPerson | null;
}
interface RawShareholding {
  id: string;
  issue_date: string;
  end_date: string | null;
  holders: RawHolder[] | null;
}
interface RawTransfer {
  id: string;
  transfer_date: string;
  from_sh: { holders: RawHolder[] | null } | null;
}
interface RawEventDoc {
  document_id: string;
  event_type: EventDocumentType;
  event_id: string;
  event_phase: EventPhase;
}

function holderName(holders: RawHolder[] | null | undefined): string | null {
  if (!holders || holders.length === 0) return null;
  const names = holders
    .map((h) => {
      if (h.holder_type === 'individual') return h.person?.full_name ?? null;
      if (h.holder_type === 'entity') return h.entity?.legal_name ?? null;
      return null;
    })
    .filter((n): n is string => !!n);
  return names.length > 0 ? names.join(', ') : null;
}

export async function computeEventCompleteness(
  supabase: SupabaseClient,
  companyId: string,
  incorporationDate: string | null,
): Promise<EventCompletenessResponse> {
  const incDate = incorporationDate ? new Date(incorporationDate) : null;
  const incorporationDateMissing = !incDate;

  // Strictly-after test for founding-cohort exclusion (acts ON the incorp
  // date are founding-cohort and belong to the existing engine).
  const afterIncorp = (d: string | null): boolean => {
    if (!d || !incDate) return false;
    return new Date(d).getTime() > incDate.getTime();
  };

  const [dirRes, offRes, shRes, trRes, edRes] = await Promise.all([
    supabase
      .from('director_mandates')
      .select('id, appointment_date, end_date, person:company_people(full_name)')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('officer_appointments')
      .select('id, appointment_date, end_date, person:company_people(full_name)')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('shareholdings')
      .select(
        'id, issue_date, end_date, holders:shareholding_holders(holder_type, person:company_people(full_name), entity:shareholder_entities(legal_name))',
      )
      .eq('company_id', companyId),
    supabase
      .from('share_transfers')
      .select(
        'id, transfer_date, from_sh:shareholdings!from_shareholding_id(holders:shareholding_holders(holder_type, person:company_people(full_name), entity:shareholder_entities(legal_name)))',
      )
      .eq('company_id', companyId),
    supabase
      .from('event_documents')
      .select('document_id, event_type, event_id, event_phase')
      .eq('company_id', companyId),
  ]);

  if (dirRes.error) throw dirRes.error;
  if (offRes.error) throw offRes.error;
  if (shRes.error)  throw shRes.error;
  if (trRes.error)  throw trRes.error;
  if (edRes.error)  throw edRes.error;

  const directors     = (dirRes.data ?? []) as unknown as RawDirector[];
  const officers      = (offRes.data ?? []) as unknown as RawOfficer[];
  const shareholdings = (shRes.data  ?? []) as unknown as RawShareholding[];
  const transfers     = (trRes.data  ?? []) as unknown as RawTransfer[];
  const eventDocs     = (edRes.data  ?? []) as unknown as RawEventDoc[];

  // (event_type, event_id, event_phase) → documentId (first wins; UNIQUE
  // constraint in DB makes "first" deterministic per the 4-col uniqueness).
  const satisfiedKey = (t: string, id: string, p: string) => `${t}|${id}|${p}`;
  const satisfiedMap = new Map<string, string>();
  for (const ed of eventDocs) {
    const k = satisfiedKey(ed.event_type, ed.event_id, ed.event_phase);
    if (!satisfiedMap.has(k)) satisfiedMap.set(k, ed.document_id);
  }

  const acts: EventActStatus[] = [];

  const pushAct = (
    type: EventDocumentType,
    id: string,
    phase: EventPhase,
    label: { fr: string; en: string },
    personName: string | null,
    date: string,
  ) => {
    const docId = satisfiedMap.get(satisfiedKey(type, id, phase)) ?? null;
    acts.push({
      event_type: type,
      event_id: id,
      event_phase: phase,
      label_fr: label.fr,
      label_en: label.en,
      personName,
      date,
      satisfied: docId !== null,
      documentId: docId,
    });
  };

  for (const m of directors) {
    const name = m.person?.full_name ?? null;
    if (afterIncorp(m.appointment_date)) {
      pushAct('director_mandate', m.id, 'appointment', LABELS.director_appointment, name, m.appointment_date);
    }
    if (m.end_date) {
      pushAct('director_mandate', m.id, 'departure', LABELS.director_departure, name, m.end_date);
    }
  }

  for (const o of officers) {
    const name = o.person?.full_name ?? null;
    if (afterIncorp(o.appointment_date)) {
      pushAct('officer_appointment', o.id, 'appointment', LABELS.officer_appointment, name, o.appointment_date);
    }
    if (o.end_date) {
      pushAct('officer_appointment', o.id, 'departure', LABELS.officer_departure, name, o.end_date);
    }
  }

  for (const sh of shareholdings) {
    const name = holderName(sh.holders);
    if (afterIncorp(sh.issue_date)) {
      pushAct('shareholding', sh.id, 'issuance', LABELS.share_issuance, name, sh.issue_date);
    }
    if (sh.end_date) {
      pushAct('shareholding', sh.id, 'cessation', LABELS.share_cessation, name, sh.end_date);
    }
  }

  for (const t of transfers) {
    const name = holderName(t.from_sh?.holders ?? null);
    pushAct('share_transfer', t.id, 'transfer', LABELS.share_transfer, name, t.transfer_date);
  }

  const totalActs = acts.length;
  const totalSatisfied = acts.filter((a) => a.satisfied).length;
  const totalMissing = totalActs - totalSatisfied;
  const score = totalActs === 0 ? 100 : Math.round((totalSatisfied / totalActs) * 100);

  return {
    score,
    totalActs,
    totalSatisfied,
    totalMissing,
    incorporationDateMissing,
    acts,
  };
}
