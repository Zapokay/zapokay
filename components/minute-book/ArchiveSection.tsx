'use client';

import { useTranslations } from 'next-intl';
import type { VaultDocument } from '@/components/documents/DocumentRow';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import ArchiveDocRow from './ArchiveDocRow';
import SectionCard from './SectionCard';

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
  // ⚠️ Pas de forceOpen : sous un filtre, les archives ne s'ouvrent pas, elles DISPARAISSENT (CompletenessPage).
  return (
    <SectionCard
      title={getFiscalYearLabel(year, locale)}
      tone="archive"
      defaultOpen={false}
      // Muted "· Archives" qualifier — its own span, NOT concatenated into the label (ni dans le nom du <h3>).
      qualifier={
        <span className="text-sm font-normal text-[var(--text-muted)]">
          · {tMB('completeness.archivesQualifier')}
        </span>
      }
      // Neutral count — replaces CompletionBar; no progress meter.
      metric={documents.length}
    >
        <div className="divide-y divide-[var(--card-border)] relative [&>div:last-child>div:first-child]:rounded-b-[11px]">
          {documents.map((doc) => (
            <ArchiveDocRow key={doc.id} doc={doc} onReplace={onReplace} />
          ))}
        </div>
    </SectionCard>
  );
}
