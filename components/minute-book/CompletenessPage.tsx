'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToasts } from '@/components/ui/Toasts';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import { fiscalYearForDate } from '@/lib/active-years';
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
  // uploadDocument call with isFinalized=true, success/error sinks).
  const handleFileSelected = useCallback(
    async (file: File, requirementKey: string, year: number | null): Promise<void> => {
      if (file.type !== 'application/pdf') {
        addToast(fr ? 'Seuls les fichiers PDF sont acceptés.' : 'Only PDF files are accepted.', 'error');
        return;
      }
      if (file.size > MAX_SIZE) {
        addToast(fr ? 'Le fichier dépasse 20 Mo.' : 'File exceeds 20 MB.', 'error');
        return;
      }

      const item = data?.checklist.find(
        i => i.requirement_key === requirementKey && (i.year ?? null) === (year ?? null),
      );
      if (!item) {
        addToast(fr ? 'Exigence introuvable.' : 'Requirement not found.', 'error');
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addToast(fr ? 'Session expirée.' : 'Session expired.', 'error');
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
    [addToast, data, fr],
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

  // #19d Brief 1 — group director + officer DEPARTURE acts by the fiscal
  // year that CONTAINS act.date. Appointments are out of scope for this
  // slice (Administrateurs / Dirigeants surface no appointment-resolution
  // affordance today; Complétude mirrors that surface). Acts whose computed
  // year isn't in the page's active-fiscal-years set fall into the
  // "unclassified" bucket (mirrors the orchestrator's findability guard:
  // never render a phantom year section the user can't see elsewhere).
  // shareholding + share_transfer acts are excluded — Phase 3.
  const activeYearSet = new Set(sortedYears);
  const eventsByYear: Record<number, EventActStatus[]> = {};
  const eventsUnclassified: EventActStatus[] = [];
  if (events) {
    for (const act of events) {
      if (
        (act.event_type !== 'director_mandate' && act.event_type !== 'officer_appointment') ||
        act.event_phase !== 'departure'
      ) {
        continue;
      }
      const fy = fiscalYearForDate(act.date, fiscalYearEndMonth, fiscalYearEndDay);
      if (activeYearSet.has(fy)) {
        if (!eventsByYear[fy]) eventsByYear[fy] = [];
        eventsByYear[fy].push(act);
      } else {
        eventsUnclassified.push(act);
      }
    }
  }

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
            {fr ? 'Complétude' : 'Completeness'}
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
              ↓ {fr ? 'Exporter le livre' : 'Export book'}
            </button>
          </div>
        </div>
        {!loading && data && (
          <>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {data.score}% {fr ? 'complet' : 'complete'}
              {' · '}
              {data.totalUploaded} {fr ? 'téléversés' : 'uploaded'}
              {' · '}
              {data.totalGenerated} {fr ? 'à signer' : 'to sign'}
              {' · '}
              {data.totalMissing} {fr ? 'manquants' : 'missing'}
            </p>
            <div className="mt-3">
              <CompletenessProgressBar score={data.score} locale={locale} />
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                {fr ? 'Signé et téléversé' : 'Signed and uploaded'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
                </svg>
                {fr ? 'À signer' : 'To sign'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
                {fr ? 'À générer ou à téléverser' : 'To generate or upload'}
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
            {fr ? 'Impossible de charger le livre de minutes.' : 'Unable to load minute book.'}
          </p>
        )}

        {!loading && data && (
          <>
            {foundationalItems.length > 0 && (
              <RequirementSection
                title={fr ? 'Documents fondateurs' : 'Founding documents'}
                items={foundationalItems}
                companyId={companyId}
                locale={fr ? 'fr' : 'en'}
                onFileSelected={handleFileSelected}
                onGenerated={fetchData}
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
              />
            ))}

            {/* Hors-exercice acts have no fiscal-year box to live in —
                render the standalone EventSection card here for that bucket. */}
            {eventsUnclassified.length > 0 && (
              <EventSection
                title={tEvents('sectionUnclassified')}
                acts={eventsUnclassified}
                companyId={companyId}
                locale={fr ? 'fr' : 'en'}
                preferredLanguage={preferredLanguage}
                onGenerated={fetchEvents}
              />
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
          userId={userId}
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
