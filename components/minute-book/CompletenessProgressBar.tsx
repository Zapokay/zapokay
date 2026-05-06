'use client';

interface CompletenessProgressBarProps {
  score: number;
  /** When true, render an inline "{score}% complete/complet" label above the bar. */
  showLabel?: boolean;
  locale: string;
}

/**
 * Shared progress bar used by both Completeness and Binder page headers.
 * Single source of truth for the green progress visualization.
 */
export default function CompletenessProgressBar({
  score,
  showLabel = false,
  locale,
}: CompletenessProgressBarProps) {
  const fr = locale === 'fr';
  return (
    <div className="max-w-2xl">
      {showLabel && (
        <p className="text-sm text-[var(--text-muted)] mb-2">
          {score}% {fr ? 'complet' : 'complete'}
        </p>
      )}
      <div className="h-2 bg-[var(--card-border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
