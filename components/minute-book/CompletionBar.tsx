'use client';

import { getDocumentState } from '@/lib/minute-book/state';

interface CompletionBarItem {
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
}

interface CompletionBarProps {
  items: CompletionBarItem[];
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
export default function CompletionBar({ items, className }: CompletionBarProps) {
  if (items.length === 0) return null;

  const states = items.map(getDocumentState);
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
