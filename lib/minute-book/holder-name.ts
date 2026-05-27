/**
 * #19d Phase 3 (cessation slice) — Shared holder-name helper.
 *
 * Extracted verbatim from `lib/minute-book/event-completeness.ts` so the
 * lifecycle-document generator can resolve a shareholding's display name
 * through the same polymorphic logic the completeness engine uses. No
 * behavior change: joint holders are joined with ", " in display order
 * (callers are responsible for ordering the embed if order matters).
 *
 * The Raw* shapes match what PostgREST returns from the embed
 *   holders:shareholding_holders(
 *     holder_type,
 *     person:company_people(full_name),
 *     entity:shareholder_entities(legal_name)
 *   )
 * — both call sites SELECT exactly this shape today.
 */

export interface RawPerson { full_name: string | null }
export interface RawEntity { legal_name: string | null }
export interface RawHolder {
  holder_type: 'individual' | 'entity';
  person: RawPerson | null;
  entity: RawEntity | null;
}

export function holderName(holders: RawHolder[] | null | undefined): string | null {
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
