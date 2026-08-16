'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, CheckCircle2, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToasts } from '@/components/ui/Toasts';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import { fiscalYearForDate } from '@/lib/active-years';
import { mustBlockGeneration } from '@/lib/fiscal-year-open';
import { getDocumentState, getStateForChecklistItem } from '@/lib/minute-book/state';
import type { ObligationLiveness } from '@/lib/obligations/obligation';
import RequirementSection from '@/components/minute-book/RequirementSection';
import ArchiveSection from '@/components/minute-book/ArchiveSection';
import EventSection from '@/components/minute-book/EventSection';
import InventoryLine from '@/components/minute-book/InventoryLine';
import DueDiligenceModal from '@/components/due-diligence/DueDiligenceModal';
import UploadDocumentModal from '@/components/documents/UploadDocumentModal';
import { useRowUpload } from '@/components/documents/useRowUpload';
import BulkCatchUpButton from '@/components/minute-book/BulkCatchUpButton';
import BulkCatchUpModal, {
  type BulkMissingByYear,
  type BulkMissingItem,
} from '@/components/minute-book/BulkCatchUpModal';
import type {
  CompletenessResponse,
  ChecklistItem,
} from '@/app/api/minute-book/completeness/route';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';
import type { VaultDocument } from '@/components/documents/DocumentRow';

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

// Chip-filter vocabulary: the 3 severity chips map to liveness tiers; "à signer"
// maps to DocumentState==='généré'. FILTER_ORDER is the chip display order,
// reused for the banner's tier-label join.
type FilterKey = 'remediate' | 'regularize' | 'asigner' | 'live';
const FILTER_ORDER: FilterKey[] = ['remediate', 'regularize', 'asigner', 'live'];

// A row matches the active chips (OR-combine). Tiers key off liveness; 'asigner'
// keys off a pre-derived DocumentState==='généré' flag so this stays shape-
// agnostic across requirement rows and event acts. Empty set → everything shows.
function rowMatchesFilters(
  liveness: ObligationLiveness | null,
  isASigner: boolean,
  filters: Set<FilterKey>,
): boolean {
  if (filters.size === 0) return true;
  return (
    (filters.has('remediate') && liveness === 'remediate') ||
    (filters.has('regularize') && liveness === 'regularize') ||
    (filters.has('live') && liveness === 'live') ||
    (filters.has('asigner') && isASigner)
  );
}

// Coherence chip (Aria): filled = severity (bg+border+text tokens), outline = action
// (transparent bg + border+text). Colors MUST match the dashboard verdict boxes
// (StatusVerdict): --lv-remediate = défaut prolongé, --lv-regularize = à régulariser.
function Chip({
  value,
  label,
  className,
  active = false,
  onClick,
}: {
  value: number;
  label: string;
  className: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 cursor-pointer transition hover:-translate-y-px hover:shadow-sm ${className} ${
        active ? 'ring-2 ring-current ring-offset-2 ring-offset-[var(--page-bg)]' : ''
      }`}
    >
      <span className="text-[18px] font-extrabold leading-none" style={{ fontFamily: 'Sora, sans-serif' }}>
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.03em] leading-tight">
        {label}
      </span>
    </button>
  );
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
  // Reuse the dashboard verdict's labels so Complétude chips speak the same words.
  const tSV = useTranslations('dashboard.statusVerdict');
  const [data, setData] = useState<CompletenessResponse | null>(null);
  // Director + officer lifecycle acts grouped by FY. DERIVED, not state (2026-07-28):
  // acts now arrive on the completeness payload itself, so there is nothing to sync.
  // This is what makes the old hors-exercice race structurally impossible rather than
  // merely unlikely — the grouping below keys on `data.fiscalYears`, and acts and
  // fiscalYears are now guaranteed to come from the SAME response. Two independent
  // fetches let acts land first, with `activeYearSet` still empty, which transiently
  // classified every act as hors-exercice. A payload without `acts` degrades to `[]`:
  // requirement sections render, event sections simply don't appear.
  const events: EventActStatus[] = data?.acts ?? [];
  const [loading, setLoading] = useState(true);
  const [showDueDiligenceModal, setShowDueDiligenceModal] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Archive-replace (Piece-4 follow-up #1): opens the certify-capable modal
  // (replaceContext="archive") for a hold-year doc. Distinct from the
  // requirement modal state above — archive docs have no ChecklistItem.
  const [holdReplaceDoc, setHoldReplaceDoc] = useState<VaultDocument | null>(null);
  const [holdReplaceFile, setHoldReplaceFile] = useState<File | null>(null);
  const { addToast, ToastStack } = useToasts();

  // Phase B-1 — ONE upload orchestration for document rows + event rows (and the
  // A3 board in B-2). Replaces the removed pickedFile/pickedItem/pickedEvent* state
  // + the two inline UploadDocumentModal renders below. Hold-archive stays separate.
  const { openUpload, modalElement } = useRowUpload({
    companyId,
    framework,
    locale,
    preferredLanguage,
    addToast,
  });
  // Chip filters — client-side only, reset on load (no URL param, no persistence).
  // OR-combine: a row shows if it matches ANY active chip. Dual-membership (a
  // généré row also carries a liveness tier) is expected — shows under either.
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const anyFilterActive = activeFilters.size > 0;
  const toggleFilter = useCallback((k: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);
  const clearFilters = useCallback(() => setActiveFilters(new Set()), []);
  // Chip labels reused for the filter banner's tier-name join (chip order).
  const FILTER_LABEL: Record<FilterKey, string> = {
    remediate: tSV('defaut_prolonge.label'),
    regularize: tSV('attention.label'),
    asigner: tMB('completeness.toSign'),
    live: tMB('completeness.upcoming'),
  };

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

  // ONE FETCH (2026-07-28). The second fetch to /api/minute-book/event-completeness
  // is gone: that route re-ran the entire event engine, which the completeness route
  // ALREADY runs inside its Promise.all — 8 duplicated queries and ~99 duplicated rows
  // per load on Acme, including the 70-row event_documents read executed twice
  // concurrently. Now one response, one auth, one company lookup.
  //
  // FAILURE BEHAVIOUR, stated accurately — the comment this replaces claimed the event
  // fetch was "non-fatal", which was true of that fetch and misleading about the page:
  //   - An event-ENGINE throw blanks the page. That is PRE-EXISTING and UNCHANGED: the
  //     completeness route's Promise.all has no per-engine guard, so a computeEvent-
  //     Completeness rejection already returned 500 and left `data` null, which renders
  //     the load-error line and NO requirement sections. Deleting the second fetch does
  //     not make this worse. (Banked as its own item; deliberately not fixed here.)
  //   - A payload that arrives WITHOUT `acts` degrades to `[]` — requirement sections
  //     render normally, event sections simply don't appear.
  // What the old second fetch actually protected was narrower than it looked: only
  // failures unique to that extra round-trip (its own auth, its own company lookup, its
  // own network hop) — all of them duplicates of work the first response already did.
  //
  // /api/minute-book/event-completeness is NOT deprecated. Five consumers remain
  // (Directors/Officers/ShareholdersClient, useEventGenerate, useRowUpload).
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter reconciliation — when a refetch drops a tier's count to 0 (the user
  // resolved every item in it), that chip un-renders on its `> 0` guard, which
  // would strand the user filtered to an empty set with no chip to toggle off.
  // Auto-drop any active key whose count is now 0 so a fully-resolved tier
  // unfilters itself and the full page returns (reads as completion, not a
  // dead-end). Data-driven ONLY — the user toggle/clear paths are untouched.
  // The functional updater returns `prev` unchanged when nothing was pruned, so
  // React bails out (no needless render, no loop; effect depends on `data` only).
  useEffect(() => {
    if (!data) return;
    const countFor: Record<FilterKey, number> = {
      remediate: data.overdueProlonged,
      regularize: data.overdueRegularize,
      asigner: data.totalGenerated,
      live: data.upcoming,
    };
    setActiveFilters((prev) => {
      let changed = false;
      const next = new Set(prev);
      prev.forEach((k) => {
        if (countFor[k] === 0) {
          next.delete(k);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data]);

  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB — matches UploadZone cap

  // Row-driven file pickup. Looks up the row's ChecklistItem, then delegates to
  // useRowUpload.openUpload({ source: 'requirement' }) — the hook owns validation
  // (MIME + size), the session gate, and the UploadDocumentModal render. onSuccess
  // below reproduces the former per-title toast (§1 ternary, out of scope) + fetchData.
  const handleFileSelected = useCallback(
    async (file: File, requirementKey: string, year: number | null): Promise<void> => {
      const item = data?.checklist.find(
        i => i.requirement_key === requirementKey && (i.year ?? null) === (year ?? null),
      );
      if (!item) {
        addToast(tMB('completeness.requirementNotFound'), 'error');
        return;
      }
      // Validation + session gate now live in useRowUpload. onSuccess reproduces the
      // former onUploadComplete verbatim: the isReplace-aware per-title toast (§1
      // ternary left as-is, out of scope) + fetchData refetch.
      await openUpload({
        file,
        source: { kind: 'requirement', item },
        onSuccess: () => {
          const base = fr ? item.title_fr : item.title_en;
          const yearSuffix =
            item.category === 'annual' && item.year !== null ? ` ${item.year}` : '';
          const isReplace = item.document_id != null;
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
        },
      });
    },
    [openUpload, data, addToast, tMB, fr, fetchData],
  );

  // Brief 2b — lifecycle event-row upload. Delegates to useRowUpload.openUpload({
  // source: 'event' }); the hook owns validation, the session gate, and the modal.
  // The event source carries eventLink (built from the act) so the event_documents
  // link is written server-side exactly as the old direct POST did, and the certify
  // checkbox drives is_finalized. The act's filing year is passed by the caller
  // (per-year section knows it; hors-exercice = null).
  const handleEventFileSelected = useCallback(
    async (file: File, act: EventActStatus, title: string, year: number | null): Promise<void> => {
      // Validation + session gate live in useRowUpload; the modal's submit carries
      // eventLink (from the act) so the event_documents link is written server-side
      // exactly as the old direct POST did, and the certify checkbox drives
      // is_finalized. onSuccess reproduces the former onUploadComplete: the tMB
      // success toast + a refetch. That refetch is now fetchData: acts ride on the
      // completeness payload, so one call refreshes both halves.
      await openUpload({
        file,
        source: { kind: 'event', act, title, year },
        onSuccess: () => {
          addToast(tMB('completeness.documentUploaded'), 'success');
          void fetchData();
        },
      });
    },
    [openUpload, addToast, tMB, fetchData],
  );

  const handleHoldFileSelected = useCallback(
    async (doc: VaultDocument, file: File): Promise<void> => {
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

      // Open the certify-capable replace modal instead of a direct POST: the
      // modal's certification checkbox now owns isFinalized, giving an
      // uncertified archive doc a path to become certified (and reach the
      // finalized binder) on replace. No isFinalized set here.
      setUserId(user.id);
      setHoldReplaceDoc(doc);
      setHoldReplaceFile(file);
    },
    [addToast, tDocs, MAX_SIZE],
  );

  // ── Chip-filter choke point ───────────────────────────────────────────────
  // Filter requirements + events by the active chips BEFORE grouping, so every
  // downstream group (foundational / annual / events-by-year) is pre-filtered
  // and section gauges (CompletionBar) recompute from what they're passed. When
  // activeFilters is empty, rowMatchesFilters returns true for everything, so
  // these arrays are IDENTICAL to data.checklist / events — unfiltered behaviour
  // is byte-identical. data.* aggregates (chip counts, stats line) stay UNFILTERED.
  const filteredChecklist: ChecklistItem[] = (data?.checklist ?? []).filter((i) =>
    rowMatchesFilters(i.liveness, getStateForChecklistItem(i) === 'généré', activeFilters),
  );
  const filteredEvents: EventActStatus[] = events.filter((a) =>
    rowMatchesFilters(
      a.liveness,
      getDocumentState({
        satisfied: a.satisfied,
        source: a.documentSource,
        is_finalized: a.documentIsFinalized,
      }) === 'généré',
      activeFilters,
    ),
  );

  const foundationalItems: ChecklistItem[] = filteredChecklist.filter(
    (i) => i.category === 'foundational',
  );

  const annualItemsByYear: Record<number, ChecklistItem[]> = {};
  for (const item of filteredChecklist.filter((i) => i.category === 'annual')) {
    if (item.year !== null) {
      if (!annualItemsByYear[item.year]) {
        annualItemsByYear[item.year] = [];
      }
      annualItemsByYear[item.year].push(item);
    }
  }

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
  // Active-FY set for the in-year vs hors-exercice classification. Sourced from
  // data.fiscalYears (the canonical active-FY list), NOT the filtered requirement
  // years — filtering changes which ROWS show, never which YEARS are active.
  // Unfiltered this equals today's set (annual years == fiscalYears).
  const activeYearSet = new Set((data?.fiscalYears ?? []).map((f) => f.year));
  // Fiscal-year END per year, for the generation gate (lib/fiscal-year-open.ts).
  // SAME source as activeYearSet above — `data.fiscalYears`, already in the
  // response. No refetch, no second data path. Keyed so a year section can hand
  // its rows ONE resolved date instead of a list to search.
  //
  // A section year with no entry here (an event-only year, or the anniversary
  // row's year) yields undefined → the predicate blocks on its second branch.
  // That is the safe default and it reaches no button today: the only annual
  // requirement built outside this list carries can_generate = false.
  const fiscalYearEndByYear = new Map<number, string>(
    (data?.fiscalYears ?? []).map((f) => [f.year, f.endDate]),
  );
  const eventsByYear: Record<number, EventActStatus[]> = {};
  const eventsUnclassifiedByYear: Record<number, EventActStatus[]> = {};
  if (events.length > 0) {
    for (const act of filteredEvents) {
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

  // ★ Union-of-years — annual sections render for years with matching REQS OR
  // matching EVENTS (bounded by activeYearSet), so an event-only year (after
  // filtering) never vanishes and takes its event with it. Unfiltered, eventsByYear
  // years ⊆ activeYearSet == annual years, so this equals today's sortedYears.
  const sortedYears = Array.from(
    new Set<number>([
      ...Object.keys(annualItemsByYear).map(Number),
      ...Object.keys(eventsByYear).map(Number),
    ]),
  ).sort((a, b) => b - a);

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
            i.can_generate &&
            // ── FIFTH CONDITION — the fiscal-year gate. ──
            //
            // ⚠️ THIS PATH IS NOT THE BUTTONS'. Closing RequirementRow's two
            // generate surfaces and the board's does NOT close this one: Bulk
            // Catch-Up reads the checklist directly and hands its own list to the
            // generator. On a company whose year is still open it would produce, in
            // one click, exactly the documents the row buttons now refuse — annual
            // resolutions approving financial statements that do not exist yet
            // (art. 493 al. 2 LSAQ). Four gates, one predicate, no shortcut.
            //
            // `i.year`, not `fy.year`: the LINE's year decides. The filter above
            // already proves they are equal, so this is the same value today — but
            // if the two ever diverge, reading the row is the correct behaviour and
            // reading the loop variable is the silent bug.
            !mustBlockGeneration(i.year, fy.endDate),
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
              disabled={anyFilterActive}
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
            <div className="flex items-center gap-2.5 mt-3 flex-wrap">
              {/* Coherence bridge — same tokens/words as the dashboard verdict boxes.
                  Each chip renders only when its count > 0 (a zero chip is noise; its
                  absence is the signal). "à venir" is muted (neutral border + muted
                  text) — deliberately calmer than the three problem chips. */}
              {data.overdueProlonged > 0 && (
                <Chip
                  value={data.overdueProlonged}
                  label={tSV('defaut_prolonge.label')}
                  className="bg-[var(--lv-remediate-bg)] border-[var(--lv-remediate-bd)] text-[var(--lv-remediate)]"
                  active={activeFilters.has('remediate')}
                  onClick={() => toggleFilter('remediate')}
                />
              )}
              {data.overdueRegularize > 0 && (
                <Chip
                  value={data.overdueRegularize}
                  label={tSV('attention.label')}
                  className="bg-[var(--lv-regularize-bg)] border-[var(--lv-regularize-bd)] text-[var(--lv-regularize)]"
                  active={activeFilters.has('regularize')}
                  onClick={() => toggleFilter('regularize')}
                />
              )}
              {data.totalGenerated > 0 && (
                <Chip
                  value={data.totalGenerated}
                  label={tMB('completeness.toSign')}
                  className="bg-[var(--card-bg)] border-[var(--lv-regularize)] text-[var(--lv-regularize)]"
                  active={activeFilters.has('asigner')}
                  onClick={() => toggleFilter('asigner')}
                />
              )}
              {data.upcoming > 0 && (
                <Chip
                  value={data.upcoming}
                  label={tMB('completeness.upcoming')}
                  className="bg-transparent border-[var(--text-body)] text-[var(--text-body)]"
                  active={activeFilters.has('live')}
                  onClick={() => toggleFilter('live')}
                />
              )}
            </div>
            {/* Filter banner — informational status strip (neutral surface, NOT
                --lv-* severity tokens). Active tiers + visible-count/real-total +
                a clear-all. Safety rail against the "I filtered and my documents
                vanished" panic. Numerator + denominator are apples-to-apples:
                (matching reqs + matching events) sur (all reqs + all events =
                data.totalRequired). Renders only when a chip filter is active. */}
            {anyFilterActive && (
              <div className="flex items-center justify-between gap-3 mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-2 text-xs text-[var(--text-body)]">
                <span>
                  {tMB('completeness.filterBanner', {
                    tiers: FILTER_ORDER.filter((k) => activeFilters.has(k))
                      .map((k) => FILTER_LABEL[k])
                      .join(', '),
                    n: filteredChecklist.length + filteredEvents.length,
                    total: data.totalRequired,
                  })}
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 font-semibold text-[var(--text-link)] hover:underline"
                >
                  {tMB('completeness.filterClearAll')}
                </button>
              </div>
            )}
            <InventoryLine
              total={data.totalRequired}
              uploaded={data.totalUploaded}
              generated={data.totalGenerated}
              // ⚠️ `totalToGenerate`, NOT `totalMissing`. The two are both `number`, so
              // tsc cannot tell them apart — this is the one substitution in the lot that
              // no automatic gate catches. Passing totalMissing here would print
              // "13 à générer · 4 à venir" against a Total of 12 and the row would stop
              // adding up. The split lives in the engine; this site only routes it.
              missing={data.totalToGenerate}
              upcoming={data.totalUpcoming}
              archived={(data.holdYears ?? []).reduce((s, hy) => s + hy.documents.length, 0)}
            />
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
                forceExpanded={anyFilterActive}
              />
            )}

            {sortedYears.map((year) => {
              const yearItems = annualItemsByYear[year] ?? [];
              const yearEvents = eventsByYear[year];
              // Hide-empty: BOTH must be empty to skip. Guarding on items alone
              // would re-hide the event-only years union-of-years just rescued.
              // (A sortedYears entry always has ≥1 of the two, so this is
              // defensive — it keeps "hide empty" correct if the year list changes.)
              if (yearItems.length === 0 && (yearEvents?.length ?? 0) === 0) return null;
              return (
                <RequirementSection
                  key={year}
                  title={getFiscalYearLabel(year, locale)}
                  items={yearItems}
                  companyId={companyId}
                  fiscalYearEndDate={fiscalYearEndByYear.get(year) ?? null}
                  // The assistant's OWN count for this year — `bulkMissingByYear` is
                  // already built above from the five-condition filter, so the banner and
                  // the button can never disagree about whether there is work to do.
                  catchUpCount={bulkMissingByYear[year]?.items.length ?? 0}
                  locale={fr ? 'fr' : 'en'}
                  onFileSelected={handleFileSelected}
                  onGenerated={fetchData}
                  eventActs={yearEvents}
                  preferredLanguage={preferredLanguage}
                  onEventGenerated={fetchData}
                  onEventFileSelected={(file, act, title) =>
                    handleEventFileSelected(file, act, title, year)
                  }
                  forceExpanded={anyFilterActive}
                />
              );
            })}

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
                    onGenerated={fetchData}
                    onEventFileSelected={(file, act, title) =>
                      handleEventFileSelected(file, act, title, null)
                    }
                    forceExpanded={anyFilterActive}
                  />
                ))}
              </div>
            )}

            {!anyFilterActive && (data.holdYears ?? []).map((hy) => (
              <ArchiveSection
                key={hy.year}
                year={hy.year}
                documents={hy.documents}
                locale={locale}
                onReplace={handleHoldFileSelected}
              />
            ))}
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

      {modalElement}

      {holdReplaceFile && holdReplaceDoc && userId && (
        <UploadDocumentModal
          isOpen={true}
          file={holdReplaceFile}
          mode="row"
          companyId={companyId}
          framework={framework}
          locale={locale}
          preferredLanguage={holdReplaceDoc.language === 'en' ? 'en' : 'fr'}
          prefill={{
            docType: holdReplaceDoc.document_type,
            docYear: holdReplaceDoc.document_year,
            title: holdReplaceDoc.title,
          }}
          replaceDocumentId={holdReplaceDoc.id}
          replaceContext="archive"
          onClose={() => {
            setHoldReplaceDoc(null);
            setHoldReplaceFile(null);
          }}
          onUploadComplete={() => {
            setHoldReplaceDoc(null);
            setHoldReplaceFile(null);
            void fetchData();
          }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}

      {ToastStack}
    </div>
  );
}
