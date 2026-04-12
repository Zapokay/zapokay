'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Info, Upload, Sparkles } from 'lucide-react';

interface RequirementRowProps {
  requirementKey: string;
  titleFr: string;
  descriptionFr: string | null;
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  canUpload: boolean;
  canGenerate: boolean;
  year: number | null;
  isGenerating?: boolean;
  onUpload?: (requirementKey: string, year: number | null) => void;
  onGenerate?: (requirementKey: string, year: number | null) => void;
}

export default function RequirementRow({
  requirementKey,
  titleFr,
  descriptionFr,
  satisfied,
  source,
  canUpload,
  canGenerate,
  year,
  isGenerating = false,
  onUpload,
  onGenerate,
}: RequirementRowProps) {
  const [showDescription, setShowDescription] = useState(false);

  return (
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left side: icon + title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {satisfied ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-red-800 flex-shrink-0" />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-sm ${
              satisfied ? 'text-[var(--text-muted)]' : 'text-[var(--text-body)] font-medium'
            }`}
          >
            {titleFr}
          </span>
          {descriptionFr && (
            <button
              type="button"
              onMouseEnter={() => setShowDescription(true)}
              onMouseLeave={() => setShowDescription(false)}
              className="relative rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text-body)] flex-shrink-0"
            >
              <Info className="h-4 w-4" />
              {showDescription && (
                <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs text-[var(--text-body)] shadow-lg">
                  {descriptionFr}
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right side: badge or action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {satisfied ? (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              source === 'generated'
                ? 'bg-[var(--warning-bg)] text-[var(--warning-text)]'
                : 'bg-[var(--card-border)] text-[var(--text-muted)]'
            }`}
          >
            {source === 'generated' ? 'Généré' : 'Téléversé'}
          </span>
        ) : (
          <>
            {canUpload && (
              <button
                onClick={() => onUpload?.(requirementKey, year)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Téléverser
              </button>
            )}
            {canGenerate ? (
              <button
                onClick={() => onGenerate?.(requirementKey, year)}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="24" strokeDashoffset="6" />
                  </svg>
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isGenerating ? 'Génération…' : 'Générer'}
              </button>
            ) : null}
            {!canUpload && !canGenerate && (
              <span className="text-xs text-[var(--text-muted)]">
                Bientôt disponible
              </span>
            )}
          </>
        )}
      </div>

    </div>
  );
}
