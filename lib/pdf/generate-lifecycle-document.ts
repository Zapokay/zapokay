/**
 * #19d Brief 2a — Lifecycle-document generation orchestrator (PATH A).
 *
 * End-to-end pipeline for the 8 lifecycle resolution docKeys defined in
 * `lifecycle-templates.ts`:
 *
 *   1. Look up the registry entry by docKey (via the Brief 1 engine on call).
 *   2. Load the company.
 *   3. Load the referenced event row (director_mandate or officer_appointment)
 *      by eventId. Reject soft-deleted rows.
 *   4. Build the fill context (companyName, neq, personName, optional
 *      officerTitle and endReason, formatted effectiveDate / resolutionDate)
 *      and call `fillLifecycleResolution(docKey, ctx, locale)`.
 *   5. Load the current-state roster appropriate to the registry entry's
 *      instrument ('board' → active directors; 'shareholder' → active
 *      shareholders) for the resolution shell.
 *   6. Render the PDF through the existing `generatePDF` adapter — same shell
 *      used by founding/annual resolutions, called with type 'board-resolution'
 *      or 'shareholder-resolution' per `entry.instrument`.
 *   7. Upload to the `documents` storage bucket.
 *   8. Insert the `documents` row (document_type='resolution',
 *      source='generated', minute_book_section='resolutions',
 *      requirement_key=NULL, signature_status default 'draft').
 *   9. Insert the `event_documents` link tuple — if it fails, compensating
 *      cleanup deletes the documents row + storage object so nothing
 *      orphans (UNIQUE constraint enforces 1 doc per (doc,type,event,phase)).
 *  10. logActivity('document_generated', ...) ONLY after both writes succeed.
 *
 * Language safety (§8.44): `language` is a REQUIRED explicit param. Silent
 * default to 'fr' would produce a French resolution for an EN user with no
 * error — exactly the wrong-language failure mode this brief was written to
 * prevent. Throws on missing/invalid.
 *
 * Does NOT touch `generate-item/route.ts` or `generatePdfDocument.ts` — this
 * orchestrator is the lifecycle parallel, deliberately separate while the
 * #19d shape stabilizes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { logActivity } from '@/lib/activity-log';
import { fiscalYearForDate } from '@/lib/active-years';
import { generatePDF } from '@/lib/pdf/generatePDF';
import { fillLifecycleResolution } from '@/lib/pdf/lifecycle-template-engine';
import { LIFECYCLE_TEMPLATES } from '@/lib/pdf/lifecycle-templates';
import { formatDate } from '@/lib/utils';
import {
  getDirectorRoleLabel,
  getEndReasonLabel,
  getOfficerTitleLabel,
} from '@/lib/i18n/lifecycle-labels';
import { holderName, type RawHolder } from '@/lib/minute-book/holder-name';

export type LifecycleLanguage = 'fr' | 'en';

/**
 * Compose the consideration clause for share_transfer resolutions.
 *
 * Per §8.44, locale-dependent connectives stay caller-side — the engine is
 * locale-agnostic about values. This helper returns a complete substring with
 * the leading space included, so the template renders cleanly with or without
 * the clause and no whitespace cleanup is needed downstream.
 *
 * Returns:
 *   - FR + non-empty: " en contrepartie de <consideration>"
 *   - EN + non-empty: " for consideration of <consideration>"
 *   - null / undefined / empty / whitespace-only: "" (the template's line-end
 *     semicolon handles closure regardless)
 *
 * Mirrors `composeNeqClause` in lifecycle-template-engine.ts in shape, but
 * lives orchestrator-side because the FR/EN connective is locale-dependent
 * (the engine intentionally stays locale-agnostic about values).
 */
function composeConsiderationClause(
  consideration: string | null | undefined,
  locale: LifecycleLanguage,
): string {
  const trimmed = consideration?.trim();
  if (!trimmed) return '';
  return locale === 'fr'
    ? ` en contrepartie de ${trimmed}`
    : ` for consideration of ${trimmed}`;
}

export interface GenerateLifecycleDocumentParams {
  /** Service-role admin client. Required for storage + DB writes that bypass RLS. */
  supabaseAdmin: SupabaseClient;
  /** Authenticated user ID (for activity_log). Required. */
  userId: string;
  companyId: string;
  /** One of LIFECYCLE_TEMPLATES keys. */
  docKey: string;
  /** Identifier of the underlying event row (director_mandates.id or
   *  officer_appointments.id, per the registry entry's event_type). */
  eventId: string;
  /** ISO date (YYYY-MM-DD) stamped on the resolution. */
  resolutionDate: string;
  /** Document language. REQUIRED — see §8.44 rationale in module doc. */
  language: LifecycleLanguage;
}

export interface GenerateLifecycleDocumentResult {
  documentId: string;
  fileName: string;
  fileUrl: string;
  title: string;
}

/**
 * Throws with a clear message on invalid inputs (caller / route maps to 400),
 * and on any DB / storage failure (caller maps to 500). Compensating cleanup
 * runs on event_documents-insert failure to avoid orphaned doc rows.
 */
export async function generateLifecycleDocument(
  params: GenerateLifecycleDocumentParams,
): Promise<GenerateLifecycleDocumentResult> {
  const {
    supabaseAdmin,
    userId,
    companyId,
    docKey,
    eventId,
    resolutionDate,
    language,
  } = params;

  /* -------- Param validation (loud, no silent defaults) ------------------- */

  if (!supabaseAdmin) throw new Error('generateLifecycleDocument: supabaseAdmin is required');
  if (!userId) throw new Error('generateLifecycleDocument: userId is required');
  if (!companyId) throw new Error('generateLifecycleDocument: companyId is required');
  if (!docKey) throw new Error('generateLifecycleDocument: docKey is required');
  if (!eventId) throw new Error('generateLifecycleDocument: eventId is required');
  if (!resolutionDate || !/^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)) {
    throw new Error(
      `generateLifecycleDocument: resolutionDate must be YYYY-MM-DD, got "${resolutionDate}"`,
    );
  }
  if (language !== 'fr' && language !== 'en') {
    throw new Error(
      `generateLifecycleDocument: language must be 'fr' or 'en', got "${language as unknown as string}"`,
    );
  }

  const entry = LIFECYCLE_TEMPLATES[docKey];
  if (!entry) {
    throw new Error(`generateLifecycleDocument: unknown docKey "${docKey}"`);
  }

  /* -------- Load company -------------------------------------------------- */

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, legal_name_fr, neq, incorporation_type, fiscal_year_end_month, fiscal_year_end_day')
    .eq('id', companyId)
    .single();
  if (companyError || !company) {
    throw new Error(`generateLifecycleDocument: company not found (${companyId})`);
  }
  const framework = company.incorporation_type === 'CBCA' ? 'CBCA' : 'LSA';

  // Fiscal calendar config — REQUIRED for document_year stamping. Loud error
  // rather than silent fallback to null per the consolidated build amendment.
  const fyEndMonth = (company as { fiscal_year_end_month: number | null }).fiscal_year_end_month;
  const fyEndDay = (company as { fiscal_year_end_day: number | null }).fiscal_year_end_day;
  if (fyEndMonth == null || fyEndDay == null) {
    throw new Error(
      `generateLifecycleDocument: company ${companyId} is missing fiscal_year_end_month or fiscal_year_end_day — cannot determine document_year`,
    );
  }

  /* -------- Load the underlying event row --------------------------------- */
  // event_type drives which table to read:
  //   - 'director_mandate'    → director_mandates    (soft-deletes excluded)
  //   - 'officer_appointment' → officer_appointments (soft-deletes excluded)
  //   - 'shareholding'        → shareholdings (no deleted_at; "former" derived
  //                              from end_date IS NOT NULL — Phase 10A Atom 4)

  let effectiveDateIso: string | null = null;
  let personName: string | undefined;
  let officerTitleRaw: string | undefined;
  let officerCustomTitle: string | null | undefined;
  let endReasonRaw: string | null = null;
  let holderDisplayName: string | undefined;
  let shareholdingShares: number | undefined;
  let shareholdingClassName: string | undefined;

  let issueDateIso: string | null = null;
  let issuePricePerShare: number | null = null;

  // share_transfer arm locals (Phase 3 close). transferDate is sourced from
  // share_transfers.transfer_date and reused via effectiveDateIso for the
  // document_year fiscal-year stamp downstream.
  let transferorDisplayName: string | undefined;
  let transfereeDisplayName: string | undefined;
  let transferQuantity: number | undefined;
  let transferShareClassName: string | undefined;
  let considerationRaw: string | null | undefined;
  if (entry.satisfies.event_type === 'shareholding') {
    type ShRow = {
      id: string;
      quantity: number;
      issue_date: string;
      issue_price_per_share: number | null;
      end_date: string | null;
      end_reason: string | null;
      shareholding_holders: Array<{
        holder_type: 'individual' | 'entity';
        display_order: number | null;
        person: { full_name: string | null } | null;
        entity: { legal_name: string | null } | null;
      }> | null;
      share_classes: { name: string } | null;
    };

    const { data: shRow, error: shError } = await supabaseAdmin
      .from('shareholdings')
      .select(`
        id, quantity, issue_date, issue_price_per_share, end_date, end_reason,
        shareholding_holders(holder_type, display_order,
          person:company_people(full_name),
          entity:shareholder_entities(legal_name)
        ),
        share_classes(name)
      `)
      .eq('id', eventId)
      .eq('company_id', companyId)
      .single<ShRow>();

    if (shError || !shRow) {
      throw new Error(
        `generateLifecycleDocument: shareholding not found (id=${eventId})`,
      );
    }

    const orderedHolders = (shRow.shareholding_holders ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const computedHolderName = holderName(orderedHolders as RawHolder[]);
    if (!computedHolderName) {
      throw new Error(
        `generateLifecycleDocument: holder name missing for shareholding ${eventId}`,
      );
    }
    holderDisplayName = computedHolderName;

    effectiveDateIso =
      entry.satisfies.event_phase === 'cessation' ? shRow.end_date :
      entry.satisfies.event_phase === 'issuance'  ? shRow.issue_date :
      null;

    shareholdingShares = shRow.quantity;
    const className = shRow.share_classes?.name;
    if (!className) {
      throw new Error(
        `generateLifecycleDocument: share class missing for shareholding ${eventId}`,
      );
    }
    shareholdingClassName = className;
    // end_reason is meaningful only for cessation. For issuance the row's
    // end_reason is null anyway (active holding), but skipping the read here
    // makes the semantic explicit and matches the issuance template's lack
    // of endReason in requiredVars.
    endReasonRaw =
      entry.satisfies.event_phase === 'cessation' ? shRow.end_reason : null;
    issueDateIso = shRow.issue_date;
    issuePricePerShare = shRow.issue_price_per_share;
  } else if (entry.satisfies.event_type === 'share_transfer') {
    type TransferRow = {
      id: string;
      transfer_date: string;
      quantity_transferred: number;
      consideration: string | null;
      from_shareholding: {
        id: string;
        shareholding_holders: Array<{
          holder_type: 'individual' | 'entity';
          display_order: number | null;
          person: { full_name: string | null } | null;
          entity: { legal_name: string | null } | null;
        }> | null;
        share_classes: { name: string } | null;
      } | null;
      to_shareholding: {
        id: string;
        shareholding_holders: Array<{
          holder_type: 'individual' | 'entity';
          display_order: number | null;
          person: { full_name: string | null } | null;
          entity: { legal_name: string | null } | null;
        }> | null;
      } | null;
    };

    // Disambiguated PostgREST embeds via `!from_shareholding_id` /
    // `!to_shareholding_id` (share_transfers has two FKs to shareholdings).
    const { data: trRow, error: trError } = await supabaseAdmin
      .from('share_transfers')
      .select(`
        id, transfer_date, quantity_transferred, consideration,
        from_shareholding:shareholdings!from_shareholding_id(
          id,
          shareholding_holders(holder_type, display_order,
            person:company_people(full_name),
            entity:shareholder_entities(legal_name)
          ),
          share_classes(name)
        ),
        to_shareholding:shareholdings!to_shareholding_id(
          id,
          shareholding_holders(holder_type, display_order,
            person:company_people(full_name),
            entity:shareholder_entities(legal_name)
          )
        )
      `)
      .eq('id', eventId)
      .eq('company_id', companyId)
      .single<TransferRow>();

    if (trError || !trRow) {
      throw new Error(
        `generateLifecycleDocument: share_transfer not found (id=${eventId})`,
      );
    }
    if (!trRow.from_shareholding || !trRow.to_shareholding) {
      throw new Error(
        `generateLifecycleDocument: share_transfer ${eventId} missing from/to shareholding join`,
      );
    }

    // Mirror the shareholding arm's holder-resolution path (above, ~L199-208)
    // for both ends. Even though v1 transfer is ind-only (RPC-enforced), using
    // the polymorphic holderName() helper keeps the code stylistically
    // consistent with cessation+issuance and ready for v2 entity-target
    // extension without rewriting this arm.
    const fromHolders = (trRow.from_shareholding.shareholding_holders ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const fromName = holderName(fromHolders as RawHolder[]);
    if (!fromName) {
      throw new Error(
        `generateLifecycleDocument: transferor name missing for share_transfer ${eventId}`,
      );
    }
    transferorDisplayName = fromName;

    const toHolders = (trRow.to_shareholding.shareholding_holders ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const toName = holderName(toHolders as RawHolder[]);
    if (!toName) {
      throw new Error(
        `generateLifecycleDocument: transferee name missing for share_transfer ${eventId}`,
      );
    }
    transfereeDisplayName = toName;

    transferQuantity = trRow.quantity_transferred;

    const className = trRow.from_shareholding.share_classes?.name;
    if (!className) {
      throw new Error(
        `generateLifecycleDocument: share class missing for share_transfer ${eventId} source shareholding`,
      );
    }
    transferShareClassName = className;

    considerationRaw = trRow.consideration;

    // effectiveDateIso drives the document_year fiscal-year stamp downstream
    // (~L443). For a transfer act the event's effective date IS the transfer
    // date itself. The generic ctx.effectiveDate populated at the top of the
    // ctx block will also receive this formatted value; the share_transfer
    // template body does not reference {{effectiveDate}} (it uses
    // {{transferDate}} instead — populated in the ctx arm below), so the
    // extra ctx key is harmless to the engine's residual-{{ guard.
    effectiveDateIso = trRow.transfer_date;
  } else {
    type EventRow = {
      id: string;
      person_id: string;
      appointment_date: string;
      end_date: string | null;
      end_reason: string | null;
      deleted_at: string | null;
      title?: string;
      custom_title?: string | null;
      person: { full_name: string } | null;
    };

    const eventTable =
      entry.satisfies.event_type === 'director_mandate'
        ? 'director_mandates'
        : 'officer_appointments';

    const selectCols =
      entry.satisfies.event_type === 'officer_appointment'
        ? 'id, person_id, appointment_date, end_date, end_reason, deleted_at, title, custom_title, person:company_people(full_name)'
        : 'id, person_id, appointment_date, end_date, end_reason, deleted_at, person:company_people(full_name)';

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from(eventTable)
      .select(selectCols)
      .eq('id', eventId)
      .eq('company_id', companyId)
      .single<EventRow>();

    if (eventError || !eventRow) {
      throw new Error(
        `generateLifecycleDocument: event row not found (table=${eventTable}, id=${eventId})`,
      );
    }
    if (eventRow.deleted_at) {
      throw new Error(
        `generateLifecycleDocument: event row is soft-deleted (table=${eventTable}, id=${eventId})`,
      );
    }

    const fullName = eventRow.person?.full_name?.trim();
    if (!fullName) {
      throw new Error(
        `generateLifecycleDocument: person.full_name missing for event ${eventId}`,
      );
    }
    personName = fullName;

    effectiveDateIso =
      entry.satisfies.event_phase === 'appointment'
        ? eventRow.appointment_date
        : eventRow.end_date;

    officerTitleRaw = eventRow.title;
    officerCustomTitle = eventRow.custom_title;
    endReasonRaw = eventRow.end_reason;
  }

  if (!effectiveDateIso) {
    throw new Error(
      `generateLifecycleDocument: effective date missing on event (phase=${entry.satisfies.event_phase}, id=${eventId})`,
    );
  }

  /* -------- Build the fill context ---------------------------------------- */

  const ctx: Record<string, string> = {
    companyName: company.legal_name_fr,
    neq: company.neq ?? '',
    effectiveDate: formatDate(effectiveDateIso, language),
    resolutionDate: formatDate(resolutionDate, language),
  };

  if (entry.satisfies.event_type === 'shareholding') {
    ctx.holderName = holderDisplayName!;
    ctx.shares = String(shareholdingShares);
    // Both share_cessation and share_issuance bodies use the {{shareClass}}
    // token — harmonized 2026-05-27.
    ctx.shareClass = shareholdingClassName!;

    // Issuance-only: pre-compose the conditional price phrase per locale.
    // The engine is single-pass and would flag `{{pricePerShare}}` nested
    // inside a phrase token as residual; instead we inline the formatted
    // price here so the engine sees a complete substring. Both phrase keys
    // are populated (empty string when no price recorded or non-issuance)
    // so the post-fill residual-{{ guard always passes.
    let pricePhraseFr = '';
    let pricePhraseEn = '';
    if (
      entry.satisfies.event_phase === 'issuance' &&
      issuePricePerShare !== null &&
      Number(issuePricePerShare) > 0
    ) {
      // No shared currency helper exists in lib/ today — using Intl.NumberFormat
      // directly. fr-CA renders "0,15 $" by default. en-CA defaults to
      // "CA$0.15"; narrowSymbol coerces to the brief-required "$0.15".
      const priceFr = new Intl.NumberFormat('fr-CA', {
        style: 'currency',
        currency: 'CAD',
      }).format(Number(issuePricePerShare));
      const priceEn = new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        currencyDisplay: 'narrowSymbol',
      }).format(Number(issuePricePerShare));
      pricePhraseFr = ` au prix de ${priceFr} par action`;
      pricePhraseEn = ` at a price of ${priceEn} per share`;
    }
    ctx.pricePhraseFr = pricePhraseFr;
    ctx.pricePhraseEn = pricePhraseEn;
  } else if (entry.satisfies.event_type === 'share_transfer') {
    ctx.transferorName = transferorDisplayName!;
    ctx.transfereeName = transfereeDisplayName!;
    ctx.quantity = String(transferQuantity);
    ctx.shareClassName = transferShareClassName!;
    // transferDate sourced from share_transfers.transfer_date, threaded via
    // effectiveDateIso (set in the event-resolution arm above). Caller-side
    // formatted per §8.44 (locale-dep formatter stays caller-side).
    ctx.transferDate = formatDate(effectiveDateIso, language);
    // considerationClause is pre-composed caller-side per §8.44 (locale-dep
    // connective). Empty string when no consideration recorded — template's
    // line-end semicolon handles closure regardless. Always populated so the
    // engine's residual-{{ guard always passes (mirrors pricePhraseFr/En).
    ctx.considerationClause = composeConsiderationClause(considerationRaw, language);
  } else {
    ctx.personName = personName!;
    // Officer docKeys need officerTitle. director_removal omits endReason.
    if (entry.satisfies.event_type === 'officer_appointment') {
      ctx.officerTitle = getOfficerTitleLabel(
        officerTitleRaw ?? '',
        officerCustomTitle ?? null,
        language,
      );
    }
  }

  // endReason: required for director_departure + officer_departure + share_cessation
  // (per each registry entry's requiredVars). NOT required for director_removal
  // (shareholder-driven dismissal — the act of removal IS the reason).
  if (entry.requiredVars.includes('endReason')) {
    if (!endReasonRaw) {
      throw new Error(
        `generateLifecycleDocument: end_reason required for docKey "${docKey}" but missing on event ${eventId}`,
      );
    }
    const scope =
      entry.satisfies.event_type === 'director_mandate'
        ? 'director'
        : entry.satisfies.event_type === 'officer_appointment'
          ? 'officer'
          : 'shareholder';
    ctx.endReason = getEndReasonLabel(endReasonRaw, language, scope);
  }

  /* -------- Fill resolution via Brief 1 engine ---------------------------- */

  const filled = fillLifecycleResolution(docKey, ctx, language);

  /* -------- Load current-state roster for the shell ----------------------- */
  // 'board' instrument → active directors signature block.
  // 'shareholder' instrument → active shareholders signature block.

  let directors: { name: string; title: string }[] | undefined;
  let shareholders:
    | { name: string; shares: number; shareClass?: string }[]
    | undefined;

  if (entry.instrument === 'board') {
    const { data: mandates, error: mErr } = await supabaseAdmin
      .from('director_mandates')
      .select('id, company_people(id, full_name)')
      .eq('company_id', companyId)
      .eq('is_active', true);
    if (mErr) {
      throw new Error(`generateLifecycleDocument: load directors failed: ${mErr.message}`);
    }
    directors = (mandates ?? []).map((d) => ({
      name: (d.company_people as unknown as { full_name: string }).full_name,
      title: getDirectorRoleLabel(language),
    }));
  } else {
    const { data: holdings, error: hErr } = await supabaseAdmin
      .from('shareholdings')
      .select(`
        id, quantity,
        shareholding_holders(holder_type, person_id, entity_id, display_order,
          person:company_people(id, full_name),
          entity:shareholder_entities(id, legal_name, entity_type)
        ),
        share_classes(name)
      `)
      .eq('company_id', companyId)
      .is('end_date', null);
    if (hErr) {
      throw new Error(`generateLifecycleDocument: load shareholders failed: ${hErr.message}`);
    }
    shareholders = (holdings ?? []).map((s) => {
      const holders = (s.shareholding_holders ?? []) as unknown as Array<{
        person: { full_name: string } | null;
        entity: { legal_name: string } | null;
      }>;
      const name =
        holders[0]?.person?.full_name ??
        holders[0]?.entity?.legal_name ??
        '(unknown holder)';
      return {
        name,
        shares: s.quantity as number,
        shareClass: (s.share_classes as unknown as { name: string } | null)?.name ?? 'A',
      };
    });
  }

  /* -------- Compute document_year from the EVENT's effective date --------- */
  // Findability invariant: the generated doc must never be invisible. The
  // Documents view's year tabs are populated from `company_fiscal_years`
  // (status='active') — see app/[locale]/dashboard/minute-book/documents/page.tsx:42-50.
  // If we stamp a computed year that is NOT in active fiscal years, the doc
  // would not appear under any visible year tab AND would be excluded from
  // the "unclassified" bucket (which requires document_year === null). It
  // would only be reachable via the "All" tab — a discoverability hole. In
  // that specific case we fall back to document_year: null + console.warn so
  // the doc shows up under "Non classé" / "Unclassified" until the user adds
  // the matching fiscal year. The resolution/adoption date does NOT drive
  // this — only the event's effective date.
  const computedYear = fiscalYearForDate(effectiveDateIso, fyEndMonth, fyEndDay);
  const { data: activeYearRows, error: yearsError } = await supabaseAdmin
    .from('company_fiscal_years')
    .select('year')
    .eq('company_id', companyId)
    .eq('status', 'active');
  if (yearsError) {
    throw new Error(`generateLifecycleDocument: load fiscal years failed: ${yearsError.message}`);
  }
  const activeYears = new Set((activeYearRows ?? []).map((r) => (r as { year: number }).year));
  let documentYear: number | null;
  if (activeYears.has(computedYear)) {
    documentYear = computedYear;
  } else {
    console.warn(
      `generateLifecycleDocument: computed fiscal year ${computedYear} for event ${eventId} (effectiveDate=${effectiveDateIso}) is not in company_fiscal_years (status=active) for company ${companyId}; falling back to document_year=null so the doc remains findable under Unclassified.`,
    );
    documentYear = null;
  }

  /* -------- Render PDF through the existing adapter ----------------------- */

  const pdfType =
    entry.instrument === 'board' ? 'board-resolution' : 'shareholder-resolution';

  const pdfBuffer = await generatePDF({
    type: pdfType,
    data: {
      companyName: company.legal_name_fr,
      neq: company.neq ?? undefined,
      documentTitle: filled.resolution.title,
      resolutionDate: formatDate(resolutionDate, language),
      // Lifecycle resolutions are not tied to a fiscal year — suppress the
      // subtitle in the shell.
      fiscalYear: null,
      language,
      ...(entry.instrument === 'board' ? { directors } : { shareholders }),
      freeTextBody: filled.resolution.body,
    },
  });

  /* -------- Upload to storage --------------------------------------------- */

  const documentId = randomUUID();
  const fileName = `${documentId}.pdf`;
  const storagePath = `${companyId}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadError) {
    throw new Error(
      `generateLifecycleDocument: storage upload failed: ${uploadError.message}`,
    );
  }

  /* -------- Insert documents row ----------------------------------------- */
  // signature_status omitted: lets the column DEFAULT 'draft' fire (lifecycle
  // resolutions are draft-state until a signatories pack is later wired).
  // requirement_key NULL: lifecycle resolutions do NOT satisfy a row in
  // minute_book_requirements — the satisfaction link lives in event_documents.

  const { data: docInsert, error: docInsertError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: documentId,
      company_id: companyId,
      document_type: 'resolution',
      title: filled.resolution.title,
      file_name: fileName,
      file_url: storagePath,
      file_size: pdfBuffer.length,
      language,
      status: 'active',
      source: 'generated',
      framework,
      document_year: documentYear,
      requirement_key: null,
      minute_book_section: 'resolutions',
    })
    .select('id')
    .single();

  if (docInsertError || !docInsert) {
    // Roll back the orphaned storage object.
    await supabaseAdmin.storage.from('documents').remove([storagePath]);
    throw new Error(
      `generateLifecycleDocument: documents insert failed: ${docInsertError?.message ?? 'unknown'}`,
    );
  }

  /* -------- Insert event_documents link ---------------------------------- */
  // 4-col UNIQUE on (document_id, event_type, event_id, event_phase). A
  // conflict here means another generation already linked this exact tuple
  // to this exact document — vanishingly unlikely (new random documentId
  // per call) but treated as a hard error and rolled back.

  const { error: linkError } = await supabaseAdmin
    .from('event_documents')
    .insert({
      document_id: documentId,
      event_type: entry.satisfies.event_type,
      event_id: eventId,
      event_phase: entry.satisfies.event_phase,
      company_id: companyId,
    });

  if (linkError) {
    // Compensating cleanup: orphan the storage object + documents row so the
    // doc never surfaces in Coffre-fort detached from any event.
    await supabaseAdmin.from('documents').delete().eq('id', documentId);
    await supabaseAdmin.storage.from('documents').remove([storagePath]);
    throw new Error(
      `generateLifecycleDocument: event_documents insert failed: ${linkError.message}`,
    );
  }

  /* -------- Activity log (only after both writes succeed) ---------------- */

  await logActivity(
    supabaseAdmin,
    companyId,
    userId,
    'document_generated',
    `Document généré : ${filled.resolution.title}`,
    `Document generated: ${filled.resolution.title}`,
    {
      document_id: documentId,
      doc_key: docKey,
      event_type: entry.satisfies.event_type,
      event_id: eventId,
      event_phase: entry.satisfies.event_phase,
    },
  );

  return {
    documentId,
    fileName,
    fileUrl: storagePath,
    title: filled.resolution.title,
  };
}
