'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, Upload } from 'lucide-react';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { getDocumentState } from '@/lib/minute-book/state';

interface RequirementRowProps {
  requirementKey: string;
  titleFr: string;
  descriptionFr: string | null;
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  canUpload: boolean;
  canGenerate: boolean;
  year: number | null;
  companyId?: string;
  onFileSelected?: (file: File, requirementKey: string, year: number | null) => Promise<boolean>;
  onGenerated?: () => void;
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
  companyId,
  onFileSelected,
  onGenerated,
}: RequirementRowProps) {
  const [showDescription, setShowDescription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const state = getDocumentState({ satisfied, source });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset the input value so the SAME file can be re-selected after an error
    // (browsers suppress onChange for identical filenames otherwise).
    e.target.value = '';
    if (!f || !onFileSelected) return;
    setIsUploading(true);
    try {
      await onFileSelected(f, requirementKey, year);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left side: icon + title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {state === 'téléversé' ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        ) : state === 'généré' ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 flex-shrink-0 text-amber-500"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
          </svg>
        ) : (
          <XCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
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
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isUploading ? 'Téléversement…' : 'Téléverser'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </>
            )}
            {canGenerate && companyId && (
              <GenerateDocumentButton
                companyId={companyId}
                requirementKey={requirementKey}
                year={year}
                onSuccess={onGenerated}
                locale="fr"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            )}
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
