'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadDocument } from '@/lib/upload-document';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';

const DOC_TYPE_KEYS = ['statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'] as const;
const LANGUAGE_KEYS = ['fr', 'en', 'bilingual'] as const;

type Mode = 'vault' | 'row';
type Step = 'form' | 'uploading' | 'done';

export interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** PDF already validated by the parent (drop zone or row file input). */
  file: File;
  /**
   * 'vault' — classification fields editable; title locks iff a requirement is set.
   * 'row'   — type, fiscal year, "corresponds to", title all locked. Language editable.
   */
  mode: Mode;
  companyId: string;
  userId: string;
  framework: 'LSA' | 'CBCA';
  /** Used for canonical FR/EN title resolution + subtitle interpolation. */
  locale: string;
  /**
   * In 'vault' mode: optional starting values, all fields remain editable.
   * In 'row' mode: requirementKey/requirementYear/docType/docYear/title are
   * authoritative and locked.
   */
  prefill?: {
    requirementKey?: string | null;
    requirementYear?: number | null;
    docType?: string;
    docYear?: number | null;
    title?: string;
  };
  /** Vault mode only — populates the FY selector. */
  activeFiscalYears?: number[];
  /** Seeds the language field on open; user can change it in either mode. */
  preferredLanguage?: 'fr' | 'en';
  /**
   * Phase B B4 — when set, the modal renders the destructive-replace
   * warning, swaps the submit label to "Remplacer" / "Replace", and the
   * upload helper deletes this row + its storage object on insert success.
   * Single neutral copy for both 'uploaded' and 'generated' source rows.
   */
  replaceDocumentId?: string;
  /** Resolves with the new document id on successful upload. */
  onUploadComplete: (documentId: string) => void;
  /** Optional error sink for parents that own toast UX. */
  onError?: (message: string) => void;
}

export default function UploadDocumentModal(props: UploadDocumentModalProps) {
  const {
    isOpen,
    onClose,
    file,
    mode,
    companyId,
    userId,
    framework,
    locale,
    prefill,
    activeFiscalYears = [],
    preferredLanguage = 'fr',
    replaceDocumentId,
    onUploadComplete,
    onError,
  } = props;
  const isReplace = !!replaceDocumentId;

  const fr = locale === 'fr';
  const t = useTranslations('documents');

  // -- State --
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [titleDirty, setTitleDirty] = useState(false);
  const [docType, setDocType] = useState(prefill?.docType ?? 'autre');
  const [language, setLanguage] = useState<string>(preferredLanguage);
  const [docYear, setDocYear] = useState<number | ''>(prefill?.docYear ?? '');
  const [requirementKey, setRequirementKey] = useState<string | null>(
    prefill?.requirementKey ?? null,
  );
  const [requirementYear, setRequirementYear] = useState<number | null>(
    prefill?.requirementYear ?? null,
  );
  const [requirements, setRequirements] = useState<ChecklistItem[]>([]);
  const [isCertified, setIsCertified] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const isLockedAll = mode === 'row';

  // -- Reset on (re)open. Prefill intentionally absent from deps: row-mode
  //    prefill should not re-snap state mid-session if the parent re-renders. --
  useEffect(() => {
    if (!isOpen) return;
    setTitle(prefill?.title ?? '');
    setTitleDirty(false);
    setDocType(prefill?.docType ?? 'autre');
    setLanguage(preferredLanguage);
    setDocYear(prefill?.docYear ?? '');
    setRequirementKey(prefill?.requirementKey ?? null);
    setRequirementYear(prefill?.requirementYear ?? null);
    setIsCertified(false);
    setStep('form');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // -- Fetch requirements (both modes — row needs canonical title for the subtitle). --
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/minute-book/completeness')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.checklist) setRequirements(data.checklist);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // -- Derived: currently linked requirement --
  const selectedReq = useMemo(
    () =>
      requirementKey
        ? (requirements.find(
            (r) =>
              r.requirement_key === requirementKey &&
              (r.year ?? null) === (requirementYear ?? null),
          ) ?? null)
        : null,
    [requirementKey, requirementYear, requirements],
  );
  const isFoundational = selectedReq?.category === 'foundational';

  // Title is readOnly in row mode (always) or in vault mode when a requirement is set.
  const titleReadOnly = isLockedAll || !!requirementKey;

  // -- Vault-mode FY filter on the corresponds-to dropdown --
  const filteredRequirements = useMemo(
    () =>
      requirements.filter(
        (req) =>
          req.category === 'foundational' || docYear === '' || req.year === docYear,
      ),
    [requirements, docYear],
  );

  // -- Cascade: requirement change → set type/title/docYear (vault mode only) --
  useEffect(() => {
    if (mode === 'row') return;
    if (requirementKey && !selectedReq) return;
    setTitleDirty(false);
    if (!selectedReq) return;
    setDocType(selectedReq.document_type);
    if (selectedReq.category === 'foundational') {
      setDocYear('');
      setTitle(fr ? selectedReq.title_fr : selectedReq.title_en);
    } else if (typeof selectedReq.year === 'number') {
      setDocYear(selectedReq.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements]);

  // -- Annual title regen on docYear change (vault mode) --
  useEffect(() => {
    if (mode === 'row') return;
    if (!selectedReq || selectedReq.category !== 'annual') return;
    if (titleDirty) return;
    const base = fr ? selectedReq.title_fr : selectedReq.title_en;
    const suffix = docYear !== '' ? ` — ${docYear}` : '';
    setTitle(base + suffix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements, docYear, titleDirty]);

  // -- ESC closes (unless mid-upload) --
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && step !== 'uploading') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, step, onClose]);

  // -- Focus trap (mirrors BulkCatchUpModal) --
  useEffect(() => {
    if (!isOpen) return;
    const node = modalRef.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function getFocusable(): HTMLElement[] {
      if (!node) return [];
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([readonly]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }
    getFocusable()[0]?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !node?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node.addEventListener('keydown', handleKey);
    return () => {
      node.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // -- Submit gate --
  // Phase B B5: certification is no longer mandatory. The checkbox is still
  // rendered and toggleable; its state determines `is_finalized` at insert
  // time (B5-edit-4 below). Submit gate is now: title non-empty + form step.
  const canSubmit = !!title.trim() && step === 'form';

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStep('uploading');
    setError('');
    const supabase = createClient();
    const result = await uploadDocument({
      file,
      companyId,
      userId,
      supabaseClient: supabase,
      title,
      docType,
      language,
      docYear: docYear !== '' ? docYear : null,
      requirementKey,
      requirementYear,
      framework,
      requirements,
      // Phase B B5: actual checkbox state — true ⇒ 'téléversé', false ⇒ WIP
      // upload that the three-state model rebuckets to 'généré' (see
      // lib/minute-book/state.ts) until the user finalizes via re-upload.
      isFinalized: isCertified,
      replaceDocumentId,
    });

    if (!result.ok) {
      const msg = fr ? "Erreur lors de l'envoi du fichier." : 'Error uploading file.';
      setError(msg);
      onError?.(msg);
      setStep('form');
      return;
    }

    setStep('done');
    onUploadComplete(result.documentId);
    setTimeout(() => onClose(), 600);
  }, [
    canSubmit,
    file,
    companyId,
    userId,
    title,
    docType,
    language,
    docYear,
    requirementKey,
    requirementYear,
    framework,
    requirements,
    isCertified,
    replaceDocumentId,
    fr,
    onError,
    onUploadComplete,
    onClose,
  ]);

  // -- Row-mode subtitle: canonical title with annual year suffix --
  const subtitleRow = useMemo(() => {
    if (mode !== 'row') return '';
    const req = selectedReq;
    if (!req) return prefill?.title ?? '';
    const base = fr ? req.title_fr : req.title_en;
    return req.category === 'annual' && typeof req.year === 'number'
      ? `${base} — ${req.year}`
      : base;
  }, [mode, selectedReq, prefill?.title, fr]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current && step !== 'uploading') onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="bg-[var(--card-bg)] rounded-xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-base font-semibold text-[var(--text-heading)]">
            {t('upload.modalTitle')}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {mode === 'vault'
              ? t('upload.modalSubtitleVault')
              : t('upload.modalSubtitleRow', { requirement: subtitleRow })}
          </p>
        </div>

        {/* Replace warning (Phase B B4) — amber treatment per Dom's call:
            consequential but recoverable (regenerate-from-template recourse). */}
        {isReplace && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--amber-400)] bg-[var(--warning-bg)] p-4"
          >
            <AlertTriangle
              className="h-5 w-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-semibold text-[var(--warning-text)]">
                {t('upload.replaceWarningTitle')}
              </h4>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t('upload.replaceWarningBody')}
              </p>
            </div>
          </div>
        )}

        {/* File summary (read-only) */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-[var(--error-bg)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--error-text)]" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-body)] truncate">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              {t('metaTitle')}
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleDirty(true);
              }}
              readOnly={titleReadOnly}
              placeholder={t('metaTitlePlaceholder')}
              className={`w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors ${titleReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Type + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('metaType')}
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={isLockedAll || !!requirementKey}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {DOC_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`types.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('metaLanguage')}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                {LANGUAGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`languages.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fiscal Year — vault mode only, hidden when foundational */}
          {mode === 'vault' && activeFiscalYears.length > 0 && !isFoundational && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('upload.fiscalYear')}
              </label>
              <select
                value={docYear}
                onChange={(e) =>
                  setDocYear(e.target.value === '' ? '' : parseInt(e.target.value))
                }
                disabled={!!requirementKey}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">{t('upload.fiscalYearNone')}</option>
                {activeFiscalYears.map((y) => (
                  <option key={y} value={y}>
                    {getFiscalYearLabel(y, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Corresponds-to — vault mode only */}
          {mode === 'vault' && requirements.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('upload.correspondsTo')}
              </label>
              <select
                value={requirementKey ? `${requirementKey}|${requirementYear ?? ''}` : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const [key, yearStr] = val.split('|');
                    setRequirementKey(key);
                    setRequirementYear(yearStr ? parseInt(yearStr) : null);
                  } else {
                    setRequirementKey(null);
                    setRequirementYear(null);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                <option value="">{t('upload.correspondsToOptional')}</option>
                {filteredRequirements.map((req) => (
                  <option
                    key={`${req.requirement_key}-${req.year ?? 'f'}`}
                    value={`${req.requirement_key}|${req.year ?? ''}`}
                  >
                    {fr ? req.title_fr : req.title_en}
                    {req.year ? ` (${req.year})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Certification */}
          <div className="pt-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isCertified}
                onChange={(e) => setIsCertified(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-[var(--text-body)]">{t('upload.certify')}</span>
            </label>
            <p className="text-xs text-[var(--text-muted)] ml-6 mt-1">
              {t('upload.certifyHelp')}
            </p>
          </div>

          {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'uploading'}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--navy-600)] text-white hover:bg-[var(--navy-800)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'uploading'
              ? t('upload.submitting')
              : isReplace
                ? t('upload.replaceSubmit')
                : t('upload.submit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
