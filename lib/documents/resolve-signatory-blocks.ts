import type { SupabaseClient } from '@supabase/supabase-js';
import { getDirectorRoleLabel, getSignatoryRoleLabel } from '@/lib/i18n/lifecycle-labels';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import type { ShareholderEntitySignatoryRole } from '@/lib/supabase/people-types';

/**
 * Atom 3 Slice 5 — shared signatory resolver.
 *
 * Single source of truth for building the grouped `SignatoryBlock[]` roster of a
 * company, used by BOTH the interactive signatories route (`/api/documents/
 * signatories`) AND the bulk/catch-up path (`/api/minute-book/bulk-generate`) so
 * catch-up resolutions get the same grouped entity blocks as the interactive
 * path (closes the confirm-then-ignore gap). Lifted verbatim from the route's
 * board + shareholder branches at `e1aac22`.
 *
 * Scope (D5-4): NO auth, NO `getSignatoryType`, NO `all_required` — those are
 * route/wrapper concerns. The caller owns auth + ownership and derives
 * `signatoryType` from the requirementKey. Query failures THROW a staged
 * `SignatoryResolutionError`; callers map the stage to their own response.
 *
 * Current-state only (mirrors the route's Sprint-10 TODO): reads active mandates
 * / open shareholdings, not as-of-year rosters.
 */

export type SignatoryResolutionStage =
  | 'director_mandates'
  | 'directors_people'
  | 'shareholding_holders'
  | 'shareholders_people'
  | 'shareholder_entities'
  | 'entity_signatories';

export class SignatoryResolutionError extends Error {
  readonly stage: SignatoryResolutionStage;
  readonly dbError: unknown;
  constructor(stage: SignatoryResolutionStage, dbError?: unknown) {
    super(`signatory resolution failed at stage "${stage}"`);
    this.name = 'SignatoryResolutionError';
    this.stage = stage;
    this.dbError = dbError;
  }
}

export async function resolveSignatoryBlocks(
  client: SupabaseClient,
  companyId: string,
  signatoryType: 'board' | 'shareholder',
  language: 'fr' | 'en',
): Promise<SignatoryBlock[]> {
  if (signatoryType === 'board') {
    const { data: mandates, error: mandatesError } = await client
      .from('director_mandates')
      .select('person_id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    if (mandatesError) throw new SignatoryResolutionError('director_mandates', mandatesError);

    const personIds = (mandates ?? []).map((r) => r.person_id as string).filter(Boolean);
    if (personIds.length === 0) return [];

    const { data: people, error: peopleError } = await client
      .from('company_people')
      .select('id, full_name')
      .in('id', personIds);
    if (peopleError) throw new SignatoryResolutionError('directors_people', peopleError);

    const directorRole = getDirectorRoleLabel(language);
    const blocks: SignatoryBlock[] = (people ?? []).map((p) => ({
      type: 'individual',
      id: p.id as string,
      name: p.full_name as string,
      role: directorRole,
    }));
    return blocks;
  }

  // signatoryType === 'shareholder'
  // Holders are polymorphic (shareholding_holders): individuals → individual
  // blocks (dedup WITHIN individuals only — D4 keeps dual-capacity people),
  // entities → grouped entity blocks with one Par:/Per: line per active
  // signatory (display_order), zero active signatories → signers: [].
  const { data: holders, error: holdersError } = await client
    .from('shareholding_holders')
    .select('holder_type, person_id, entity_id, shareholding:shareholdings!inner(company_id, end_date)')
    .eq('shareholding.company_id', companyId)
    .is('shareholding.end_date', null);
  if (holdersError) throw new SignatoryResolutionError('shareholding_holders', holdersError);

  const individualPersonIds = Array.from(new Set(
    (holders ?? [])
      .filter((r) => r.holder_type === 'individual')
      .map((r) => r.person_id as string)
      .filter(Boolean)
  ));
  const entityIds = Array.from(new Set(
    (holders ?? [])
      .filter((r) => r.holder_type === 'entity')
      .map((r) => r.entity_id as string)
      .filter(Boolean)
  ));

  const signatories: SignatoryBlock[] = [];

  // --- Individual shareholders ---
  if (individualPersonIds.length > 0) {
    const { data: people, error: peopleError } = await client
      .from('company_people')
      .select('id, full_name')
      .in('id', individualPersonIds);
    if (peopleError) throw new SignatoryResolutionError('shareholders_people', peopleError);

    const shareholderRole = language === 'en' ? 'Shareholder' : 'Actionnaire';
    for (const p of people ?? []) {
      signatories.push({
        type: 'individual',
        id: p.id as string,
        name: p.full_name as string,
        role: shareholderRole,
      });
    }
  }

  // --- Entity shareholders (trust / corporation) ---
  if (entityIds.length > 0) {
    const { data: entities, error: entitiesError } = await client
      .from('shareholder_entities')
      .select('id, legal_name, entity_type')
      .in('id', entityIds);
    if (entitiesError) throw new SignatoryResolutionError('shareholder_entities', entitiesError);

    // Active signatories across all entities, ordered by display_order. The
    // global ascending sort preserves per-entity relative order on bucketing.
    const { data: sigs, error: sigsError } = await client
      .from('shareholder_entity_signatories')
      .select('id, entity_id, role, custom_role, display_order, person:company_people(id, full_name)')
      .in('entity_id', entityIds)
      .is('end_date', null)
      .order('display_order', { ascending: true });
    if (sigsError) throw new SignatoryResolutionError('entity_signatories', sigsError);

    const buckets = new Map<string, { id: string; name: string; roleLabel: string }[]>();
    for (const s of sigs ?? []) {
      const entityId = s.entity_id as string;
      const person = s.person as unknown as { full_name: string } | null;
      const role = s.role as ShareholderEntitySignatoryRole;
      // custom_role passes through VERBATIM (user content, never translated — D1).
      const roleLabel =
        role === 'custom'
          ? (s.custom_role as string | null) ?? ''
          : getSignatoryRoleLabel(role, language);
      const arr = buckets.get(entityId) ?? [];
      arr.push({ id: s.id as string, name: person?.full_name ?? '', roleLabel });
      buckets.set(entityId, arr);
    }

    for (const e of entities ?? []) {
      signatories.push({
        type: 'entity',
        entityId: e.id as string,
        legalName: e.legal_name as string,
        entityType: e.entity_type as 'corporation' | 'trust',
        signers: buckets.get(e.id as string) ?? [],
      });
    }
  }

  return signatories;
}
