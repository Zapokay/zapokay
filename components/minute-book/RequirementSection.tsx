'use client';

import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import RequirementRow from './RequirementRow';
import { AlertTriangle } from 'lucide-react';

interface RequirementSectionProps {
  title: string;
  items: ChecklistItem[];
  companyId?: string;
  onUpload?: (requirementKey: string, year: number | null) => void;
  onGenerated?: () => void;
}

export default function RequirementSection({
  title,
  items,
  companyId,
  onUpload,
  onGenerated,
}: RequirementSectionProps) {
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  const totalCount = items.length;

  return (
    <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-[var(--card-border)]">
        <div className="flex items-center justify-between">
          <h3 className="font-sora font-semibold text-[var(--text-heading)] text-base">
            {title}
          </h3>
          <span className="text-sm text-[var(--text-muted)]">
            {satisfiedCount} / {totalCount} complets
          </span>
        </div>
      </div>

      {/* Items */}
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
            onUpload={onUpload}
            onGenerated={onGenerated}
          />
        ))}
      </div>
    </div>
  );
}
