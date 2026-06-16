'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, Info, Upload } from 'lucide-react';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { getDocumentState } from '@/lib/minute-book/state';

interface RequirementRowProps {
  requirementKey: string;
  titleFr: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  satisfied: boolean;
  source?: 'uploaded' | 'generated' | null;
  /**
   * Phase B B5 — distinguishes signed-final uploads (green check, no badge)
   * from WIP uploads (amber half-circle + "Non signé" badge). Null/undefined
   * falls back to "treat as final" per the data-drift rule documented in
   * lib/minute-book/state.ts.
   */
  documentIsFinalized?: boolean | null;
  canUpload: boolean;
  canGenerate: boolean;
  year: number | null;
  companyId?: string;
  /**
   * Locale forwarded from CompletenessPage → RequirementSection. Drives
   * GenerateDocumentButton's bilingual labels. The row's own UI strings
   * use useTranslations() and pick up locale from next-intl context.
   */
  locale: 'fr' | 'en';
  /**
   * #75 — the document's GENERATION language (Two-Layer model: the doc's stored
   * language if it exists, else the user's preferred_language). DISTINCT from
   * `locale` (UI chrome). Threaded into GenerateDocumentButton.documentLanguage
   * so generated/regenerated resolutions render in the correct language.
   */
  documentLanguage: 'fr' | 'en';
  onFileSelected?: (file: File, requirementKey: string, year: number | null) => Promise<void>;
  onGenerated?: () => void;
}

export default function RequirementRow({
  requirementKey,
  titleFr,
  descriptionFr,
  descriptionEn,
  satisfied,
  source,
  documentIsFinalized,
  canUpload,
  canGenerate,
  year,
  companyId,
  locale,
  documentLanguage,
  onFileSelected,
  onGenerated,
}: RequirementRowProps) {
  const t = useTranslations('requirementRow');
  const tDocs = useTranslations('documents');
  const [showDescription, setShowDescription] = useState(false);
  // #149 — the requirement description is catalog CHROME (the seed provides both
  // description_fr AND description_en), so it follows the UI locale — unlike the
  // document title above, which follows the doc's generation language (Two-Layer).
  const description = locale === 'en' ? descriptionEn : descriptionFr;
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase B B5 — delegate three-state classification to lib/minute-book/state.ts
  // so this row stays in lockstep with CompletionBar / CompletenessPage / API
  // rather than re-deriving the rules inline. The booleans below are pure
  // adapters from the canonical state to the row's two visual concerns:
  // icon (3-way) and badge (binary "needs signature").
  const state = getDocumentState({ satisfied, source, is_finalized: documentIsFinalized });
  const isSignedFinal = state === 'téléversé';
  const isUnsigned = state === 'généré'; // generated OR uploaded-WIP

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

  // Shared button class for the file-input triggers (Téléverser / Remplacer)
  // and the Generate/Regenerate button (passed via GenerateDocumentButton's
  // className override). Keeping a single string avoids drift between the
  // empty-state, generated, and uploaded button surfaces.
  const buttonClass =
    'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--text-body)] hover:bg-[var(--card-bg)] hover:text-[var(--text-heading)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="group flex items-center justify-between py-3 px-4 rounded-lg hover:bg-[var(--card-bg)] transition-colors">
      {/* Left side: icon + title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!satisfied ? (
          <XCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--error-text)' }} />
        ) : isSignedFinal ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 flex-shrink-0 text-amber-500"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="currentColor" />
          </svg>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-sm ${
              satisfied ? 'text-[var(--text-muted)]' : 'text-[var(--text-body)] font-medium'
            }`}
          >
            {titleFr}
          </span>
          {description && (
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
          )}
        </div>
      </div>

      {/*
        Right side — Phase B B5 reachability fix.

        Badge: surfaces "Non signé" / "Unsigned" on rows where the document
        exists but isn't a signed final (generated rows AND uploaded-WIP
        rows). Signed finals show no badge — the green check icon carries
        the signal.

        Action buttons (per option 3):
          - Empty (!satisfied)            → Téléverser, Générer, or notAvailable
          - Generated (uploaded=false)    → Téléverser + Régénérer
          - Uploaded (any finalized)      → Remplacer  (B4 destructive flow)

        The Remplacer button intentionally drops the `canUpload` gate: a row
        whose `source` is 'uploaded' is by definition replaceable, and
        gating would re-introduce the reachability bug this batch fixes
        on requirements where canUpload toggled false after upload.
      */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {isUnsigned && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)]">
            {tDocs('toSignBadge')}
          </span>
        )}

        {/* Empty state */}
        {!satisfied && (
          <>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={buttonClass}
              >
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? t('uploadingButton') : t('uploadButton')}
              </button>
            )}
            {canGenerate && companyId && (
              <GenerateDocumentButton
                companyId={companyId}
                requirementKey={requirementKey}
                year={year}
                onSuccess={onGenerated}
                locale={locale}
                documentLanguage={documentLanguage}
                className={buttonClass}
              />
            )}
            {!canUpload && !canGenerate && (
              <span className="text-xs text-[var(--text-muted)]">
                {t('notAvailable')}
              </span>
            )}
          </>
        )}

        {/* Generated — Téléverser (signed) + Régénérer (replace template) */}
        {satisfied && source === 'generated' && (
          <>
            {canUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={buttonClass}
              >
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? t('uploadingButton') : t('uploadButton')}
              </button>
            )}
            {canGenerate && companyId && (
              <GenerateDocumentButton
                companyId={companyId}
                requirementKey={requirementKey}
                year={year}
                onSuccess={onGenerated}
                locale={locale}
                documentLanguage={documentLanguage}
                label={t('regenerate')}
                className={buttonClass}
              />
            )}
          </>
        )}

        {/* Uploaded (any finalized state) — single Remplacer button */}
        {satisfied && source === 'uploaded' && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={buttonClass}
          >
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? t('uploadingButton') : t('replace')}
          </button>
        )}

        {/* Single hidden file input shared across all surfaces — only one
            button is visible at a time per row state, so a single ref is
            sufficient and avoids ref-index gymnastics. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

    </div>
  );
}
