'use client';

import { getDocumentState, getStateForChecklistItem } from '@/lib/minute-book/state';
import type { EventActStatus } from '@/lib/minute-book/event-completeness';

interface CompletionBarItem {
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /**
   * Phase B B5-fix — enables segment coloring to distinguish signed-final
   * uploads (green) from WIP uploads (amber). Threaded via the API's
   * ChecklistItem.document_is_finalized field; the field-name remap to
   * the helper's `is_finalized` parameter is encapsulated in
   * getStateForChecklistItem.
   */
  document_is_finalized?: boolean | null;
  can_generate?: boolean | null;
}

interface CompletionBarProps {
  items: CompletionBarItem[];
  /**
   * Tier 1 #21 — per-year lifecycle act stack folded into the X/Y count and
   * the bar segments. The CompletenessPage groups events by FY and passes
   * eventsByYear[year] through RequirementSection. Hors-exercice events are
   * filtered out upstream (they render in their own standalone section) so
   * this prop only ever receives same-FY acts. Same three-state derivation
   * as requirements via getDocumentState (field-name remap: documentSource →
   * source, documentIsFinalized → is_finalized).
   */
  eventActs?: EventActStatus[];
  /**
   * Optional className override on the outer flex container. Defaults to
   * `max-w-md` for section-header use. Page-header use passes a wider
   * override (e.g. `w-full max-w-2xl`).
   */
  className?: string;
}

/**
 * Tetris-style completion bar with three-state per-segment coloring.
 *
 *   green (filled)  = téléversé  (uploaded, signed — truly done)
 *   amber (filled)  = généré     (generated, awaiting signature)
 *   dotted outline  = missing
 *
 * Segments use `flex-1` within a fixed-width container so they sub-divide
 * proportionally as item count grows — the bar's overall width stays
 * constant; segments shrink to fit. A section with 27 résolutions still
 * renders without horizontal scroll, just with thinner segments.
 *
 * The "X/Y" tail uses simple counts (X = téléversé+généré, Y = total).
 * Page-level percentage uses weighted math instead — see
 * lib/minute-book/state.ts (STATE_WEIGHT).
 *
 * NOTE: colors use Tailwind/hex hardcodes (emerald-600, amber-500). Will
 * re-theme to Aria v2 tokens when Sprint 7 ships them.
 */
export default function CompletionBar({ items, eventActs, className }: CompletionBarProps) {
  if (items.length === 0 && (!eventActs || eventActs.length === 0)) return null;

  // Tier 1 #21 — per-year strip folds requirement rows + same-FY event acts.
  // Unweighted not-missing count by design (the page-level % is the weighted
  // figure; the section strip is a row-count display).
  const reqStates = items.map(getStateForChecklistItem);
  const eventStates = (eventActs ?? []).map((a) =>
    getDocumentState({
      satisfied: a.satisfied,
      source: a.documentSource,
      is_finalized: a.documentIsFinalized,
    }),
  );
  const states = [...reqStates, ...eventStates];
  const filledCount = states.filter((s) => s !== 'missing').length;
  const totalCount = states.length;

  return (
    <div className={`flex items-center gap-3 ${className ?? 'max-w-md'}`}>
      <div className="flex-1 flex items-stretch gap-0.5 h-2.5" aria-hidden="true">
        {states.map((state, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              state === 'téléversé'
                ? 'bg-emerald-600'
                : state === 'généré'
                  ? 'bg-amber-500'
                  : 'border-2 border-dashed border-[var(--error-text)]'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
        {filledCount}/{totalCount}
      </span>
    </div>
  );
}
