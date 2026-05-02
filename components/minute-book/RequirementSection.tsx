'use client';

import { useState } from 'react';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import RequirementRow from './RequirementRow';
import CompletionBar from './CompletionBar';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { getDocumentState } from '@/lib/minute-book/state';

interface RequirementSectionProps {
  title: string;
  items: ChecklistItem[];
  companyId?: string;
  onFileSelected?: (file: File, requirementKey: string, year: number | null) => Promise<boolean>;
  onGenerated?: () => void;
}

export default function RequirementSection({
  title,
  items,
  companyId,
  onFileSelected,
  onGenerated,
}: RequirementSectionProps) {
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  const totalCount = items.length;

  // Default expanded: any item not yet 'téléversé' (i.e. généré or missing).
  // Sections fully téléversé render collapsed on first load. Lazy initializer
  // runs once on mount, so the section does NOT auto-collapse when the user
  // satisfies the last requirement — per Brief D-2 design decision.
  const [expanded, setExpanded] = useState(() =>
    items.some((i) => getDocumentState(i) !== 'téléversé'),
  );

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)]">
      {/* Section header — entire row clickable */}
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
          <CompletionBar items={items} className="w-48" />
        </div>
      </button>

      {/* Items — only when expanded */}
      {expanded && (
        <div className="divide-y divide-[var(--card-border)] relative">
          {totalCount > 0 && satisfiedCount === 0 && (
            <div className="mx-4 my-3 flex items-start gap-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
              <AlertTriangle className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--warning-text)]">
                Aucun document pour cet exercice. Utilisez l&apos;assistant de
                rattrapage pour générer les résolutions manquantes.
              </p>
            </div>
          )}
          {items.map((item) => (
            <RequirementRow
              key={`${item.requirement_key}-${item.year ?? 'f'}`}
              requirementKey={item.requirement_key}
              titleFr={item.title_fr}
              descriptionFr={item.description_fr}
              satisfied={item.satisfied}
              source={item.source}
              canUpload={item.can_upload}
              canGenerate={item.can_generate}
              year={item.year}
              companyId={companyId}
              onFileSelected={onFileSelected}
              onGenerated={onGenerated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
