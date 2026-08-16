'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import RequirementRow from './RequirementRow';
import EventActRow from './EventActRow';
import CompletionBar from './CompletionBar';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { getStateForChecklistItem } from '@/lib/minute-book/state';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';

interface RequirementSectionProps {
  title: string;
  items: ChecklistItem[];
  companyId?: string;
  /**
   * The END of this section's fiscal year, bare ISO `YYYY-MM-DD`. Pure
   * pass-through to RequirementRow's generation gate — the section never reads
   * it. CompletenessPage resolves it per year from `data.fiscalYears` so the
   * section is handed ONE date rather than a list to search.
   *
   * Absent on the foundational section, whose rows carry `year === null`.
   */
  fiscalYearEndDate?: string | null;
  /**
   * How many rows in THIS section the Bulk Catch-Up assistant can actually act on.
   * Supplied by CompletenessPage from `bulkMissingByYear` — the same five-condition
   * filter the assistant itself uses, never a second count. Absent on the foundational
   * section, which the assistant never touches (its filter carries
   * `category === 'annual'`), so it defaults to 0 and the banner below vanishes there
   * without a special case.
   */
  catchUpCount?: number;
  /**
   * Phase B B5 — forwarded from CompletenessPage to RequirementRow so the
   * row's bilingual button labels (Régénérer/Regenerate, etc.) and the
   * GenerateDocumentButton's locale-driven copy stay in sync with the URL
   * locale. Section itself doesn't read locale — pure pass-through.
   *
   * documentIsFinalized is intentionally NOT on this interface: it varies
   * per row and is read off each ChecklistItem inline at row mount below.
   */
  locale: 'fr' | 'en';
  onFileSelected?: (file: File, requirementKey: string, year: number | null) => Promise<void>;
  onGenerated?: () => void;
  /**
   * #19d Brief 1 (amended) — optional per-year lifecycle act stack rendered
   * INSIDE this section's card, below the requirement rows, separated by a
   * localized "Événements de l'année" divider. Empty / undefined → no
   * events footer is rendered. The header strip + "X/Y" count remain
   * REQUIREMENTS-ONLY; events live below the bar inside the same collapse.
   *
   * onEventGenerated is fired after a successful event-row generation so
   * the page can refetch the event-completeness payload (separate from the
   * requirements refetch wired to `onGenerated`).
   */
  eventActs?: EventActStatus[];
  preferredLanguage: 'fr' | 'en';
  onEventGenerated?: () => void;
  /** Brief 2 — forwarded to EventActRow so a user can upload/replace their own
   *  signed PDF on a lifecycle act. Pure pass-through. */
  onEventFileSelected?: (file: File, act: EventActStatus, title: string) => Promise<void>;
  /** Increment 5 — when true (a chip filter is active on the page), the section
   *  renders EXPANDED regardless of the user's collapse state, so filtered rows
   *  are never hidden behind a collapsed panel. OR'd at render (not into state),
   *  so clearing the filter restores the user's own expand/collapse choice. */
  forceExpanded?: boolean;
}

export default function RequirementSection({
  title,
  items,
  companyId,
  fiscalYearEndDate,
  catchUpCount = 0,
  locale,
  onFileSelected,
  onGenerated,
  eventActs,
  preferredLanguage,
  onEventGenerated,
  onEventFileSelected,
  forceExpanded,
}: RequirementSectionProps) {
  const tEvents = useTranslations('events');
  const tMB = useTranslations('minuteBook');
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  const totalCount = items.length;

  // Default expanded: any item not yet 'téléversé' (i.e. généré or missing).
  // Sections fully téléversé render collapsed on first load. Lazy initializer
  // runs once on mount, so the section does NOT auto-collapse when the user
  // satisfies the last requirement — per Brief D-2 design decision.
  const [expanded, setExpanded] = useState(() =>
    items.some((i) => getStateForChecklistItem(i) !== 'téléversé'),
  );
  // Force-expand while a page filter is active (Increment 5). OR'd here, not
  // written into `expanded`, so the user's manual choice returns when cleared.
  const isExpanded = expanded || !!forceExpanded;

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)]">
      {/* Section header — entire row clickable */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={isExpanded}
        className={`w-full px-5 py-4 text-left transition-colors hover:bg-[var(--page-bg)] overflow-hidden ${
          isExpanded ? 'rounded-t-xl border-b border-[var(--card-border)]' : 'rounded-xl'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            )}
            <h3 className="font-sora font-semibold text-[var(--text-heading)] text-base">
              {title}
            </h3>
          </div>
          <CompletionBar items={items} eventActs={eventActs} className="w-48" />
        </div>
      </button>

      {/* Items — only when expanded */}
      {isExpanded && (
        <div className="divide-y divide-[var(--card-border)] relative">
          {/* ── THE BANNER ONLY SPEAKS WHEN THE ASSISTANT CAN ACT. ──
              It says "Utilisez l'assistant de rattrapage pour générer les résolutions
              manquantes", and until 2026-08-16 it appeared on ANY section with nothing
              satisfied. Measured, it was wrong four ways at once on the foundational
              section: it says "cet exercice" where there is no fiscal year; "les
              résolutions" where the rows are the certificate, the articles and the
              by-laws; and "générer" for five keys carrying can_generate = false.
              ⚠️ THE FOURTH WAS OURS. Since `5b21967` closed generation on an open fiscal
              year, this banner has been sitting above rows whose every button is greyed
              — telling the user to do exactly what the page forbids. And on Fixture Cap
              it pointed at a button that is not on screen at all: the bulk count fell
              from 3 to 0 and BulkCatchUpButton renders null below 2.
              One condition closes all five, because the count comes from the assistant's
              own filter: if the assistant can do nothing here, the banner says nothing. */}
          {totalCount > 0 && satisfiedCount === 0 && catchUpCount > 0 && (
            <div className="mx-4 my-3 flex items-start gap-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
              <AlertTriangle className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--warning-text)]">
                {tMB('completeness.noDocumentsForYear')}
              </p>
            </div>
          )}
          {items.map((item) => (
            <RequirementRow
              key={`${item.requirement_key}-${item.year ?? 'f'}`}
              requirementKey={item.requirement_key}
              titleFr={(item.document_language ?? preferredLanguage) === 'en' ? item.title_en : item.title_fr}
              descriptionFr={item.description_fr}
              descriptionEn={item.description_en}
              satisfied={item.satisfied}
              source={item.source}
              documentIsFinalized={item.document_is_finalized}
              canUpload={item.can_upload}
              canGenerate={item.can_generate}
              year={item.year}
              fiscalYearEndDate={fiscalYearEndDate}
              // Read off the ROW, not off a section prop: `fiscalYearEndDate` is one
              // date per year and the section resolves it once, but availability varies
              // per row — a year section can hold an annual resolution and the federal
              // return, which run on different clocks.
              availability={item.availability}
              companyId={companyId}
              locale={locale}
              documentLanguage={preferredLanguage === 'en' ? 'en' : 'fr'}
              onFileSelected={onFileSelected}
              onGenerated={onGenerated}
            />
          ))}

          {/* #19d Brief 1 (amended) — in-card events footer. Renders below
              the requirement rows when this year has lifecycle acts. The
              divider is chrome (localized); the rows themselves use the
              registry's FR resolution title (page convention: legal doc
              names stay FR). Companies without companyId / preferredLanguage
              wiring (defensive — shouldn't happen on the live page) skip
              rendering rather than crash the section. */}
          {eventActs && eventActs.length > 0 && companyId && preferredLanguage && (
            <>
              <div className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {tEvents('inYearDivider')}
              </div>
              {eventActs.map((act) => (
                <EventActRow
                  key={`${act.event_type}|${act.event_id}|${act.event_phase}`}
                  act={act}
                  companyId={companyId}
                  locale={locale}
                  preferredLanguage={preferredLanguage}
                  onGenerated={onEventGenerated ?? (() => {})}
                  onEventFileSelected={onEventFileSelected}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
