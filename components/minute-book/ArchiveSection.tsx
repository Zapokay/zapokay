'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { VaultDocument } from '@/components/documents/DocumentRow';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import ArchiveDocRow from './ArchiveDocRow';

interface ArchiveSectionProps {
  year: number;
  documents: VaultDocument[];
  locale: string;
  /** Passed straight down to each ArchiveDocRow (doc-id-based hold replace). */
  onReplace: (doc: VaultDocument, file: File) => void | Promise<void>;
}

export default function ArchiveSection({ year, documents, locale, onReplace }: ArchiveSectionProps) {
  const tMB = useTranslations('minuteBook');
  // Archives default COLLAPSED — reference material, not an action queue.
  // (Deliberately NOT RequirementSection's open-if-incomplete default.)
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--archive-box-bg)] rounded-xl border border-[var(--archive-box-bd)] border-l-[3px] border-l-[var(--text-muted)]">
      {/* Section header — entire row clickable (cloned from RequirementSection) */}
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
            <h3 className="font-sora font-semibold text-[var(--text-muted)] text-base">
              {getFiscalYearLabel(year, locale)}
            </h3>
            {/* Muted "· Archives" qualifier — its own span, NOT concatenated into the label. */}
            <span className="text-sm font-normal text-[var(--text-muted)]">
              · {tMB('completeness.archivesQualifier')}
            </span>
          </div>
          {/* Neutral count chip — replaces CompletionBar; no progress meter. */}
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
            {documents.length}
          </span>
        </div>
      </button>

      {/* Documents — only when expanded */}
      {expanded && (
        <div className="divide-y divide-[var(--card-border)] relative">
          {documents.map((doc) => (
            <ArchiveDocRow key={doc.id} doc={doc} onReplace={onReplace} />
          ))}
        </div>
      )}
    </div>
  );
}
