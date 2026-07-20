'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Row description tooltip (Aria) — the hover "i" that reveals a requirement's
 * catalog description. Extracted VERBATIM from RequirementRow so Complétude and
 * the A3 board render an IDENTICAL affordance (one source of truth). Renders
 * nothing when there is no description (matches the original `description &&`
 * gate). 'use client' is REQUIRED (it uses useState) — tsc cannot catch a
 * missing directive; see the 3a lesson.
 */
export default function DescriptionTooltip({ description }: { description: string | null }) {
  const [showDescription, setShowDescription] = useState(false);
  if (!description) return null;
  return (
    <button
      type="button"
      onMouseEnter={() => setShowDescription(true)}
      onMouseLeave={() => setShowDescription(false)}
      className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)] flex-shrink-0"
    >
      <Info className="h-4 w-4" />
      {showDescription && (
        <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
          {description}
        </div>
      )}
    </button>
  );
}
