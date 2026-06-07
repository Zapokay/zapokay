'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import UploadDocumentModal from '@/components/documents/UploadDocumentModal';

interface UploadZoneProps {
  companyId: string;
  framework: string;        // 'LSA' | 'CBCA' — derived from company.incorporation_type
  locale: string;
  activeFiscalYears?: number[];
  onUploadComplete: () => void;
  onError?: (message: string) => void;
  /** Seeds the Language field on open; user can still change it. */
  preferredLanguage?: 'fr' | 'en';
}

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export function UploadZone({ companyId, framework, locale, activeFiscalYears = [], onUploadComplete, onError, preferredLanguage = 'fr' }: UploadZoneProps) {
  const fr = locale === 'fr';
  const tDocs = useTranslations('documents');
  const [isDragging, setIsDragging] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the PDF-only educational modal on Escape — mirrors the affordance
  // offered by the click-outside backdrop.
  useEffect(() => {
    if (!showPdfModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPdfModal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showPdfModal]);

  function validateFile(f: File): string | null {
    // PDF gate is handled in pickFile() so it can route to the educational modal
    // (setShowPdfModal) instead of the generic inline error.
    if (f.size > MAX_SIZE) {
      return tDocs('tooLarge');
    }
    return null;
  }

  async function pickFile(f: File) {
    // Layer A/B PDF gate — open the educational modal instead of inline error.
    if (f.type !== 'application/pdf') {
      setShowPdfModal(true);
      return;
    }
    const err = validateFile(f);
    if (err) { setError(err); return; }

    // Resolve current user before opening the modal (UploadDocumentModal requires userId).
    // Auth call lives here (not on mount) to mirror the original handleUpload behavior
    // and avoid an unconditional API call on every page mount.
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const msg = tDocs('sessionExpired');
      setError(msg);
      onError?.(msg);
      return;
    }

    setError('');
    setUserId(user.id);
    setPickedFile(f);
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void pickFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fr]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void pickFile(f);
  }

  function resetPick() {
    setPickedFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  // PDF-only educational modal — portaled to document.body to match the project
  // convention used by BulkCatchUpModal and DueDiligenceModal.
  const pdfModalElement =
    showPdfModal && typeof document !== 'undefined'
      ? createPortal(
          <div
            onClick={(e) => { e.stopPropagation(); setShowPdfModal(false); }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="bg-[var(--card-bg)] rounded-xl max-w-md w-full p-6 shadow-2xl"
            >
              <h3 className="text-base font-semibold text-[var(--text-body)] mb-3">
                {fr ? 'Format PDF requis' : 'PDF format required'}
              </h3>
              <div className="space-y-3 text-sm text-[var(--text-body)]">
                <p>
                  {fr
                    ? "Les documents de votre livre de minutes doivent être en format PDF pour assurer la lisibilité à long terme, l'intégrité des archives et la conformité légale. D'autres formats (.docx, .pages, images) ne peuvent pas être acceptés."
                    : 'Documents in your minute book must be PDFs to ensure long-term legibility, archive integrity, and legal compliance. Other formats (.docx, .pages, images) cannot be accepted.'}
                </p>
                <p>
                  {fr
                    ? 'Pour convertir : ouvrez votre document et utilisez «\u00A0Enregistrer au format PDF\u00A0» ou «\u00A0Imprimer en PDF\u00A0».'
                    : "To convert: open your document and use 'Save as PDF' or 'Print to PDF'."}
                </p>
              </div>
              <div className="flex justify-end mt-5">
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--navy-600)] text-white hover:bg-[var(--navy-800)] transition-colors"
                >
                  {fr ? 'Compris' : 'Got it'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
          isDragging
            ? 'border-[var(--amber-400)] bg-[var(--warning-bg)]'
            : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--input-border-hover)]'
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--hover)] flex items-center justify-center">
          <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--text-body)]">
            {fr ? 'Glissez un fichier ici ou ' : 'Drag a file here or '}
            <span className="text-[var(--text-link)] font-semibold">
              {fr ? 'parcourir' : 'browse'}
            </span>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">PDF · {fr ? 'max 20 Mo' : 'max 20 MB'}</p>
        </div>
        {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {pickedFile && userId && (
        <UploadDocumentModal
          isOpen={true}
          file={pickedFile}
          mode="vault"
          companyId={companyId}
          framework={framework === 'CBCA' ? 'CBCA' : 'LSA'}
          locale={locale}
          activeFiscalYears={activeFiscalYears}
          preferredLanguage={preferredLanguage}
          prefill={{
            title: pickedFile.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim(),
          }}
          onClose={resetPick}
          onUploadComplete={() => {
            // Parent (DocumentsClient) handles toast + list refresh via its onUploadComplete.
            // The modal then auto-fires onClose after its 600ms 'done' state, which
            // calls resetPick to clear pickedFile and the file input.
            onUploadComplete();
          }}
          onError={(msg) => onError?.(msg)}
        />
      )}

      {pdfModalElement}
    </>
  );
}
