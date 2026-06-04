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

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import CompletionBar from './CompletionBar';
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
}

export default function EventSection({
  title,
  acts,
  companyId,
  locale,
  preferredLanguage,
  onGenerated,
  onEventFileSelected,
}: EventSectionProps) {
  // Adapter for CompletionBar — its CompletionBarItem reads
  // {satisfied, source, document_is_finalized}. EventActStatus uses the
  // documentSource / documentIsFinalized fields; map straight across.
  const barItems = acts.map((a) => ({
    satisfied: a.satisfied,
    source: a.documentSource,
    document_is_finalized: a.documentIsFinalized,
  }));

  const [expanded, setExpanded] = useState(() =>
    acts.some(
      (a) =>
        getDocumentState({
          satisfied: a.satisfied,
          source: a.documentSource,
          is_finalized: a.documentIsFinalized,
        }) !== 'téléversé',
    ),
  );

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={`w-full px-5 py-4 text-left transition-colors hover:bg-[var(--page-bg)] overflow-hidden ${
          expanded ? 'rounded-t-xl border-b border-[var(--card-border)]' : 'rounded-xl'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-shrink-0">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            )}
            <h3 className="font-sora font-semibold text-[var(--text-heading)] text-base">
              {title}
            </h3>
          </div>
          <CompletionBar items={barItems} className="w-48" />
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-[var(--card-border)] relative">
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
      )}
    </div>
  );
}
