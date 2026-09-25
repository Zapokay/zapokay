'use client';

/**
 * #19d Brief 1 — Events section card for the Complétude page.
 *
 * Mirrors RequirementSection's lego-block exactly: collapsible card with a
 * chevron header, the section title on the left, and CompletionBar
 * (segmented strip + "X / Y" count) on the right. Body is a divide-y stack
 * of EventActRow rows.
 *
 * The CompletionBar component accepts a generic shape
 * ({satisfied, source, document_is_finalized}) so we reuse it directly
 * after mapping each EventActStatus to that shape — no duplicate strip
 * markup, no drift risk if the strip's coloring rules ever change.
 *
 * Default expanded: any row not yet téléversé (matches RequirementSection).
 */

import CompletionBar from './CompletionBar';
import SectionCard from './SectionCard';
import EventActRow from './EventActRow';
import { getDocumentState } from '@/lib/minute-book/state';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';

interface EventSectionProps {
  title: string;
  acts: EventActStatus[];
  companyId: string;
  locale: 'fr' | 'en';
  preferredLanguage: 'fr' | 'en';
  onGenerated: () => void;
  /** Brief 2 — forwarded to EventActRow for upload/replace on hors-exercice acts. */
  onEventFileSelected?: (file: File, act: EventActStatus, title: string) => Promise<void>;
  /** Increment 5 — force EXPANDED while a page chip filter is active, so a
   *  filtered hors-exercice act is never hidden behind a collapsed panel. OR'd
   *  at render (not into state) so clearing the filter restores the user's choice. */
  forceExpanded?: boolean;
}

export default function EventSection({
  title,
  acts,
  companyId,
  locale,
  preferredLanguage,
  onGenerated,
  onEventFileSelected,
  forceExpanded,
}: EventSectionProps) {
  // Adapter for CompletionBar — its CompletionBarItem reads
  // {satisfied, source, document_is_finalized}. EventActStatus uses the
  // documentSource / documentIsFinalized fields; map straight across.
  const barItems = acts.map((a) => ({
    satisfied: a.satisfied,
    source: a.documentSource,
    document_is_finalized: a.documentIsFinalized,
  }));

  // V2 — règle INCHANGÉE, lue une fois au montage par SectionCard.
  const defaultOpen = acts.some(
    (a) =>
      getDocumentState({
        satisfied: a.satisfied,
        source: a.documentSource,
        is_finalized: a.documentIsFinalized,
      }) !== 'téléversé',
  );

  return (
    // Force-expand while a page filter is active (Increment 5) — OR'd in SectionCard, not written into its state.
    <SectionCard
      title={title}
      metric={<CompletionBar items={barItems} className="w-48" />}
      defaultOpen={defaultOpen}
      forceOpen={!!forceExpanded}
    >
        <div className="divide-y divide-[var(--card-border)] relative [&>div:last-child]:rounded-b-[11px] [&>div:last-child>div:first-child]:rounded-b-[11px]">
          {acts.map((act) => (
            <EventActRow
              key={`${act.event_type}|${act.event_id}|${act.event_phase}`}
              act={act}
              companyId={companyId}
              locale={locale}
              preferredLanguage={preferredLanguage}
              onGenerated={onGenerated}
              onEventFileSelected={onEventFileSelected}
            />
          ))}
        </div>
    </SectionCard>
  );
}
