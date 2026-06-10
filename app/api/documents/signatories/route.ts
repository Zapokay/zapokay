export const dynamic = 'force-dynamic';
// 2026-06-10 incident (C2 gate): supabase-js PostgREST reads flow through Next's
// patched fetch and were served from a STALE on-disk Data Cache — a newly-created
// entity shareholder vanished from this route's output until `.next` was cleared,
// and it survived a server restart. `force-dynamic` alone did NOT prevent it.
// Force every fetch in this segment to no-store so signatory rosters are always
// read live; stale legal-signatory data is unacceptable.
export const fetchCache = 'force-no-store';

// TODO (Sprint 10+): accept a `year` query param and filter director_mandates /
// shareholdings to those active in that fiscal year. Today the data model only
// tracks current-state (`director_mandates.is_active`, no effective dates on
// `shareholdings`), so annual generations for older years receive the
// currently-active signatories rather than the historically-correct ones.
// Unblocking this requires adding `active_from` / `active_until` (or a
// per-fiscal-year join) to the mandates + shareholdings tables.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignatoryType, isAllSignatoriesRequired } from '@/lib/requirement-map';
import { getDirectorRoleLabel, getSignatoryRoleLabel } from '@/lib/i18n/lifecycle-labels';
import type { SignatoryBlock } from '@/lib/pdf-templates/signature-blocks';
import type { ShareholderEntitySignatoryRole } from '@/lib/supabase/people-types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const companyId = searchParams.get('companyId');
  const requirementKey = searchParams.get('requirementKey');
  // Atom 3 Slice 4 — document language drives signature-block role labels.
  // Independent of UI locale (Two-Layer Language Model, CLAUDE.md §3). Defaults
  // to 'fr'; EN strings ship dormant until generation language is wired (#2).
  const language: 'fr' | 'en' = searchParams.get('language') === 'en' ? 'en' : 'fr';

  if (!companyId || !requirementKey) {
    return NextResponse.json(
      { error: 'companyId et requirementKey sont requis.' },
      { status: 400 }
    );
  }

  const signatoryType = getSignatoryType(requirementKey);
  if (!signatoryType) {
    return NextResponse.json(
      { error: 'requirement_key inconnu.' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Configuration Supabase manquante.' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (signatoryType === 'board') {
      const { data: mandates, error: mandatesError } = await supabase
        .from('director_mandates')
        .select('person_id')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (mandatesError) {
        console.error('[signatories] director_mandates error:', mandatesError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des administrateurs.' }, { status: 500 });
      }

      const personIds = (mandates ?? []).map((r) => r.person_id as string).filter(Boolean);

      if (personIds.length === 0) {
        return NextResponse.json({ signatories: [], all_required: isAllSignatoriesRequired(requirementKey), signatory_type: signatoryType });
      }

      const { data: people, error: peopleError } = await supabase
        .from('company_people')
        .select('id, full_name')
        .in('id', personIds);

      if (peopleError) {
        console.error('[signatories] company_people error:', peopleError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des administrateurs.' }, { status: 500 });
      }

      const directorRole = getDirectorRoleLabel(language);
      const signatories: SignatoryBlock[] = (people ?? []).map((p) => ({
        type: 'individual',
        id: p.id as string,
        name: p.full_name as string,
        role: directorRole,
      }));

      return NextResponse.json({
        signatories,
        all_required: isAllSignatoriesRequired(requirementKey),
        signatory_type: signatoryType,
      });
    }

    // signatoryType === 'shareholder'
    // Atom 3 Slice 4 — holders are polymorphic (shareholding_holders). Both
    // individual and entity holders surface now: individuals → individual
    // blocks (dedup WITHIN individuals only — D4 keeps dual-capacity people),
    // entities → grouped entity blocks with one Par:/Per: line per active
    // signatory (display_order), zero active signatories → signers: [].
    const { data: holders, error: holdersError } = await supabase
      .from('shareholding_holders')
      .select('holder_type, person_id, entity_id, shareholding:shareholdings!inner(company_id, end_date)')
      .eq('shareholding.company_id', companyId)
      .is('shareholding.end_date', null);

    if (holdersError) {
      console.error('[signatories] shareholding_holders error:', holdersError);
      return NextResponse.json({ error: 'Erreur lors de la récupération des actionnaires.' }, { status: 500 });
    }

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
      const { data: people, error: peopleError } = await supabase
        .from('company_people')
        .select('id, full_name')
        .in('id', individualPersonIds);

      if (peopleError) {
        console.error('[signatories] company_people error:', peopleError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des actionnaires.' }, { status: 500 });
      }

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
      const { data: entities, error: entitiesError } = await supabase
        .from('shareholder_entities')
        .select('id, legal_name, entity_type')
        .in('id', entityIds);

      if (entitiesError) {
        console.error('[signatories] shareholder_entities error:', entitiesError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des actionnaires.' }, { status: 500 });
      }

      // Active signatories across all entities, ordered by display_order. The
      // global ascending sort preserves per-entity relative order on bucketing.
      const { data: sigs, error: sigsError } = await supabase
        .from('shareholder_entity_signatories')
        .select('id, entity_id, role, custom_role, display_order, person:company_people(id, full_name)')
        .in('entity_id', entityIds)
        .is('end_date', null)
        .order('display_order', { ascending: true });

      if (sigsError) {
        console.error('[signatories] shareholder_entity_signatories error:', sigsError);
        return NextResponse.json({ error: 'Erreur lors de la récupération des signataires.' }, { status: 500 });
      }

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

    return NextResponse.json({
      signatories,
      all_required: isAllSignatoriesRequired(requirementKey),
      signatory_type: signatoryType,
    });
  } catch (err) {
    console.error('[signatories] Unexpected error:', err);
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
