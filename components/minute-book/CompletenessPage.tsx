'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToasts } from '@/components/ui/Toasts';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import { fiscalYearForDate } from '@/lib/active-years';
import { uploadErrorMessageKey } from '@/lib/upload-error-message';
import RequirementSection from '@/components/minute-book/RequirementSection';
import EventSection from '@/components/minute-book/EventSection';
import DueDiligenceModal from '@/components/due-diligence/DueDiligenceModal';
import UploadDocumentModal from '@/components/documents/UploadDocumentModal';
import BulkCatchUpButton from '@/components/minute-book/BulkCatchUpButton';
import BulkCatchUpModal, {
  type BulkMissingByYear,
  type BulkMissingItem,
} from '@/components/minute-book/BulkCatchUpModal';
import CompletenessProgressBar from '@/components/minute-book/CompletenessProgressBar';
import type {
  CompletenessResponse,
  ChecklistItem,
} from '@/app/api/minute-book/completeness/route';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';

interface CompletenessPageProps {
  locale: string;
  companyId: string;
  framework: 'LSA' | 'CBCA';
  preferredLanguage: 'fr' | 'en';
  /** Fiscal calendar — used to derive each lifecycle act's filing year via
   *  fiscalYearForDate (mirrors the orchestrator's findability guard). */
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
}

export default function CompletenessPage({
  locale,
  companyId,
  framework,
  preferredLanguage,
  fiscalYearEndMonth,
  fiscalYearEndDay,
}: CompletenessPageProps) {
  const fr = locale === 'fr';
  const tEvents = useTranslations('events');
  const tDocs = useTranslations('documents');
  const tMB = useTranslations('minuteBook');
  const [data, setData] = useState<CompletenessResponse | null>(null);
  // #19d Brief 1 — director + officer lifecycle acts grouped by FY. Non-fatal:
  // when the event-completeness fetch fails, this stays null and the page
  // renders exactly as today (event sections simply don't appear).
  const [events, setEvents] = useState<EventActStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDueDiligenceModal, setShowDueDiligenceModal] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedItem, setPickedItem] = useState<ChecklistItem | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // B4/B5 — when set, the modal opens in replace mode and the upload helper
  // deletes this row + its storage object on insert success. Resolved
  // directly off the ChecklistItem.document_id field (B5-edit-2 surfaced it
  // server-side), replacing B4-edit-4's on-demand documents lookup.
  const [existingDocumentId, setExistingDocumentId] = useState<string | null>(null);
  const { addToast, ToastStack } = useToasts();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/minute-book/completeness');
      if (res.ok) {
        const json: CompletenessResponse = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch completeness:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // #19d Brief 1 — event-completeness fetch is non-fatal. A failure leaves
  // `events` null and the page renders requirement sections only, exactly as
  // it did before this brief. We log so a regression is visible in the
  // console without breaking the user's primary flow.
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/minute-book/event-completeness');
      if (!res.ok) {
        console.warn('[CompletenessPage] event-completeness fetch non-OK:', res.status);
        return;
      }
      const json = (await res.json()) as { acts?: EventActStatus[] };
      setEvents(json.acts ?? []);
    } catch (e) {
      console.warn('[CompletenessPage] event-completeness fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchEvents();
  }, [fetchData, fetchEvents]);

  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB — matches UploadZone cap

  // Row-driven file pickup. Validates MIME + size, looks up the row's
  // ChecklistItem, lazy-resolves the user id, then opens UploadDocumentModal
  // in row-mode. The modal owns the rest of the pipeline (certification gate,
  // then POSTs to /api/documents/upload — the authoritative server route — with
  // isFinalized derived from the certification checkbox; success/error sinks).
  const handleFileSelected = useCallback(
    async (file: File, requirementKey: string, year: number | null): Promise<void> => {
      if (file.type !== 'application/pdf') {
        addToast(tDocs('onlyPdf'), 'error');
        return;
      }
      if (file.size > MAX_SIZE) {
        addToast(tDocs('tooLarge'), 'error');
        return;
      }

      const item = data?.checklist.find(
        i => i.requirement_key === requirementKey && (i.year ?? null) === (year ?? null),
      );
      if (!item) {
        addToast(tMB('completeness.requirementNotFound'), 'error');
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast(tDocs('sessionExpired'), 'error');
        return;
      }

      // B5 — read existing-document id directly off the API-extended
      // ChecklistItem (route.ts surfaces document_id whenever satisfied=true).
      // Defensive warn for data drift: if a row is marked satisfied but
      // document_id is null, fall through to a non-replace upload (better
      // to over-upload than block the user; next fetchData() reconciles).
      const existingDocId = item.document_id ?? null;
      if (item.satisfied && !existingDocId) {
        console.warn(
          '[CompletenessPage] Row marked satisfied but document_id is null; data inconsistency. Falling back to fresh upload.',
          { requirementKey, year },
        );
      }

      setUserId(user.id);
      setPickedItem(item);
      setPickedFile(file);
      setExistingDocumentId(existingDocId);
    },
    [addToast, data, tMB, tDocs, MAX_SIZE],
  );

  // Brief 2 — lifecycle event-row upload. Unlike the requirement path above
  // (which opens UploadDocumentModal), events POST DIRECTLY to
  // /api/documents/upload (the authoritative server route) with an `eventLink`
  // FormData field (JSON-encoded) — there is no requirement correspondence to
  // collect. The event_documents link is written server-side from that eventLink.
  // The act's filing year is passed in by the caller (the per-year section knows
  // it; hors-exercice = null). isFinalized:true — the user is uploading their own
  // SIGNED doc. When the act already has a doc (generated draft or prior upload),
  // replaceDocumentId supersedes it: old doc deleted, its event_documents link
  // cascades, the new upload + link leave exactly one link.
  const handleEventFileSelected = useCallback(
    async (file: File, act: EventActStatus, title: string, year: number | null): Promise<void> => {
      if (file.type !== 'application/pdf') {
        addToast(tDocs('onlyPdf'), 'error');
        return;
      }
      if (file.size > MAX_SIZE) {
        addToast(tDocs('tooLarge'), 'error');
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast(tDocs('sessionExpired'), 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);
      formData.append('title', title);
      formData.append('docType', 'resolution');
      formData.append('language', preferredLanguage);
      if (year != null) formData.append('docYear', String(year));
      formData.append('framework', framework);
      formData.append('requirements', JSON.stringify(data?.checklist ?? []));
      formData.append('isFinalized', 'true');
      formData.append('eventLink', JSON.stringify({
        event_type: act.event_type,
        event_id: act.event_id,
        event_phase: act.event_phase,
      }));
      if (act.satisfied && act.documentId) formData.append('replaceDocumentId', act.documentId);
      // requirementKey/requirementYear omitted (always null on the event path — route reads them as null).
      // No userId — the route derives it from the session; the getUser() above is UX-only
      // (preserves the "Session expirée" toast). The route is the sole authority.

      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      const result = await res.json();

      if (!result.ok) {
        addToast(tDocs(uploadErrorMessageKey(result.error, res.status)), 'error');
        return;
      }

      addToast(tMB('completeness.documentUploaded'), 'success');
      fetchEvents();
    },
    [addToast, companyId, data, framework, tMB, preferredLanguage, fetchEvents, MAX_SIZE, tDocs],
  );

  const foundationalItems: ChecklistItem[] =
    data?.checklist.filter((i) => i.category === 'foundational') || [];

  const annualItemsByYear: Record<number, ChecklistItem[]> = {};
  for (const item of data?.checklist.filter((i) => i.category === 'annual') || []) {
    if (item.year !== null) {
      if (!annualItemsByYear[item.year]) {
        annualItemsByYear[item.year] = [];
      }
      annualItemsByYear[item.year].push(item);
    }
  }

  const sortedYears = Object.keys(annualItemsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  // #19d Brief 1 — group director + officer lifecycle acts by the fiscal
  // year that CONTAINS act.date. Acts whose computed year isn't in the
  // page's active-fiscal-years set fall into the "unclassified" bucket
  // (mirrors the orchestrator's findability guard: never render a phantom
  // year section the user can't see elsewhere).
  //
  // #19d Brief 2c — director + officer APPOINTMENT acts are now admitted
  // alongside departures: the Administrateurs / Dirigeants active cards
  // surface a "Générer la résolution de nomination" trigger (founder-gated
  // to appointment_date > incorporation_date), so Complétude mirrors that
  // surface. The engine already emits + scores appointment acts (#19c);
  // this filter just stops excluding them.
  //
  // #19d Phase 3 (cessation + issuance + transfer) — shareholding cessation,
  // shareholding issuance, AND share_transfer acts are admitted on the same
  // footing as director/officer departures (same generate / upload / replace
  // affordances via the shared EventActRow → dialog path). The engine
  // handles transfer's source-cessation double-count suppression upstream so
  // this filter stays declarative — no end_reason gating needed here.
  const activeYearSet = new Set(sortedYears);
  const eventsByYear: Record<number, EventActStatus[]> = {};
  const eventsUnclassifiedByYear: Record<number, EventActStatus[]> = {};
  if (events) {
    for (const act of events) {
      const isDirectorOrOfficerDeparture =
        (act.event_type === 'director_mandate' || act.event_type === 'officer_appointment') &&
        act.event_phase === 'departure';
      const isDirectorOrOfficerAppointment =
        (act.event_type === 'director_mandate' || act.event_type === 'officer_appointment') &&
        act.event_phase === 'appointment';
      const isShareholdingCessation =
        act.event_type === 'shareholding' && act.event_phase === 'cessation';
      const isShareholdingIssuance =
        act.event_type === 'shareholding' && act.event_phase === 'issuance';
      const isShareTransfer =
        act.event_type === 'share_transfer' && act.event_phase === 'transfer';
      if (
        !isDirectorOrOfficerDeparture &&
        !isDirectorOrOfficerAppointment &&
        !isShareholdingCessation &&
        !isShareholdingIssuance &&
        !isShareTransfer
      ) {
        continue;
      }
      const fy = fiscalYearForDate(act.date, fiscalYearEndMonth, fiscalYearEndDay);
      if (activeYearSet.has(fy)) {
        if (!eventsByYear[fy]) eventsByYear[fy] = [];
        eventsByYear[fy].push(act);
      } else {
        if (!eventsUnclassifiedByYear[fy]) eventsUnclassifiedByYear[fy] = [];
        eventsUnclassifiedByYear[fy].push(act);
      }
    }
  }

  // Hors-exercice events grouped by their (already-computed) fiscal year,
  // newest-first. Only years that actually have events appear (no phantom
  // year headers). Display grouping only — keys on the event's fy, never on
  // document_year, so the docs stay put regardless of any year stamp.
  const unclassifiedYears = Object.keys(eventsUnclassifiedByYear)
    .map(Number)
    .sort((a, b) => b - a);

  // Bulk Catch-Up: build per-year groups of annual missing items
  // (filters out foundational; modal owns canGenerate-driven checkbox state).
  const bulkMissingByYear: BulkMissingByYear = {};
  let bulkMissingCount = 0;
  if (data) {
    for (const fy of data.fiscalYears) {
      const items: BulkMissingItem[] = data.checklist
        .filter(
          (i) =>
            i.category === 'annual' &&
            i.year === fy.year &&
            !i.satisfied &&
            i.can_generate,
        )
        .map((i) => ({
          requirementKey: i.requirement_key,
          title: fr ? i.title_fr : i.title_en,
          canGenerate: i.can_generate,
        }));
      if (items.length > 0) {
        bulkMissingByYear[fy.year] = {
          resolutionDate: fy.endDate,
          items,
        };
        bulkMissingCount += items.length;
      }
    }
  }

  return (
    <div>
      {/* Rich page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {tMB('completeness.title')}
          </h1>
          <div className="flex items-center gap-3">
            <BulkCatchUpButton
              missingCount={bulkMissingCount}
              onOpen={() => setIsBulkModalOpen(true)}
            />
            <button
              type="button"
              onClick={() => setShowDueDiligenceModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-[1.5px] border-[var(--card-hover-border)] text-[var(--text-heading)] bg-transparent transition-colors hover:bg-[var(--hover)]"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              ↓ {tMB('completeness.exportBook')}
            </button>
          </div>
        </div>
        {!loading && data && (
          <>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {data.score}% {tMB('completeness.complete')}
              {' · '}
              {data.totalUploaded} {tMB('completeness.uploaded')}
              {' · '}
              {data.totalGenerated} {tMB('completeness.toSign')}
              {' · '}
              {data.totalMissing} {tMB('completeness.missing')}
            </p>
            <div className="mt-3">
              <CompletenessProgressBar score={data.score} locale={locale} />
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                {tMB('completeness.legendSignedUploaded')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
                </svg>
                {tMB('completeness.legendToSign')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
                {tMB('completeness.legendToGenerate')}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div className="space-y-6">
        {loading && (
          <div className="animate-pulse">
            <div className="h-48 bg-[var(--card-bg)] rounded-xl" />
          </div>
        )}
        {!loading && !data && (
          <p className="text-sm text-[var(--text-muted)]">
            {tMB('completeness.loadError')}
          </p>
        )}

        {!loading && data && (
          <>
            {foundationalItems.length > 0 && (
              <RequirementSection
                title={tMB('completeness.foundingDocuments')}
                items={foundationalItems}
                companyId={companyId}
                locale={fr ? 'fr' : 'en'}
                onFileSelected={handleFileSelected}
                onGenerated={fetchData}
                preferredLanguage={preferredLanguage}
              />
            )}

            {sortedYears.map((year) => (
              <RequirementSection
                key={year}
                title={getFiscalYearLabel(year, locale)}
                items={annualItemsByYear[year]}
                companyId={companyId}
                locale={fr ? 'fr' : 'en'}
                onFileSelected={handleFileSelected}
                onGenerated={fetchData}
                eventActs={eventsByYear[year]}
                preferredLanguage={preferredLanguage}
                onEventGenerated={fetchEvents}
                onEventFileSelected={(file, act, title) =>
                  handleEventFileSelected(file, act, title, year)
                }
              />
            ))}

            {/* Hors-exercice acts have no fiscal-year box to live in. Group them
                by their computed fiscal year under a kept umbrella heading; one
                collapsible EventSection per year (newest-first). Uploads KEEP
                year=null to preserve the Vault Unclassified findability invariant
                (matches generate-lifecycle-document.ts' deliberate null stamp). */}
            {unclassifiedYears.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-sora font-semibold text-[var(--text-heading)] text-base">
                  {tEvents('sectionUnclassified')}
                </h3>
                {unclassifiedYears.map((year) => (
                  <EventSection
                    key={year}
                    title={getFiscalYearLabel(year, locale)}
                    acts={eventsUnclassifiedByYear[year]}
                    companyId={companyId}
                    locale={fr ? 'fr' : 'en'}
                    preferredLanguage={preferredLanguage}
                    onGenerated={fetchEvents}
                    onEventFileSelected={(file, act, title) =>
                      handleEventFileSelected(file, act, title, null)
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <DueDiligenceModal
        companyId={companyId}
        isOpen={showDueDiligenceModal}
        onClose={() => setShowDueDiligenceModal(false)}
      />

      <BulkCatchUpModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        missingByYear={bulkMissingByYear}
        onComplete={() => {
          void fetchData();
        }}
      />

      {pickedFile && pickedItem && userId && (
        <UploadDocumentModal
          isOpen={true}
          file={pickedFile}
          mode="row"
          companyId={companyId}
          framework={framework}
          locale={locale}
          preferredLanguage={preferredLanguage}
          prefill={{
            requirementKey: pickedItem.requirement_key,
            requirementYear: pickedItem.year,
            docType: pickedItem.document_type,
            docYear: pickedItem.category === 'annual' ? pickedItem.year : null,
            title:
              pickedItem.category === 'annual' && pickedItem.year !== null
                ? `${fr ? pickedItem.title_fr : pickedItem.title_en} — ${pickedItem.year}`
                : (fr ? pickedItem.title_fr : pickedItem.title_en),
          }}
          replaceDocumentId={existingDocumentId ?? undefined}
          onClose={() => {
            setPickedFile(null);
            setPickedItem(null);
            setExistingDocumentId(null);
          }}
          onUploadComplete={() => {
            const base = fr ? pickedItem.title_fr : pickedItem.title_en;
            const yearSuffix =
              pickedItem.category === 'annual' && pickedItem.year !== null
                ? ` ${pickedItem.year}`
                : '';
            const isReplace = existingDocumentId !== null;
            addToast(
              isReplace
                ? (fr
                    ? `Document remplacé pour « ${base} »${yearSuffix}.`
                    : `Document replaced for "${base}"${yearSuffix}.`)
                : (fr
                    ? `Document ajouté à « ${base} »${yearSuffix}.`
                    : `Document added to "${base}"${yearSuffix}.`),
              'success',
            );
            void fetchData();
          }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}

      {ToastStack}
    </div>
  );
}
