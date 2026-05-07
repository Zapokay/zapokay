'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BinderExportModalProps {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface BinderSection {
  key: string;
  title_fr: string;
  documents: any[];
  count: number;
}

interface BinderData {
  sections: BinderSection[];
  totalDocuments: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BinderExportModal({
  companyId,
  isOpen,
  onClose,
}: BinderExportModalProps) {
  const t = useTranslations('minuteBook.binderExport');

  /* ---------- State ---------- */
  const [binderData, setBinderData] = useState<BinderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  /* ---------- Fetch binder data on open ---------- */
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setBinderData(null);
    setLoadError(false);
    setExportError(false);

    async function fetchBinder() {
      setLoading(true);
      try {
        const res = await fetch('/api/minute-book/binder?scope=finalized');
        if (!res.ok) throw new Error('fetch failed');
        const data: BinderData = await res.json();
        if (!cancelled) setBinderData(data);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBinder();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /* ---------- ESC handler ---------- */
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /* ---------- Focus trap (DIY) ---------- */
  useEffect(() => {
    if (!isOpen) return;
    const node = modalRef.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
      if (!node) return [];
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  /* ---------- Overlay click ---------- */
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  /* ---------- Retry binder fetch ---------- */
  async function handleRetryLoad() {
    setLoadError(false);
    setLoading(true);
    try {
      const res = await fetch('/api/minute-book/binder?scope=finalized');
      if (!res.ok) throw new Error('fetch failed');
      const data: BinderData = await res.json();
      setBinderData(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Export ---------- */
  async function handleExport() {
    setExporting(true);
    setExportError(false);
    try {
      const res = await fetch(
        `/api/due-diligence/export?companyId=${encodeURIComponent(companyId)}&scope=finalized`,
      );
      if (!res.ok) throw new Error('export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        'livre-minutes.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  /* ---------- Render ---------- */
  if (!isOpen) return null;

  const totalCount = binderData?.totalDocuments ?? 0;
  // registres is synthetic and never empty in practice — exclude it from the
  // empty-section signal.
  const hasEmptySections = !!binderData?.sections.some(
    (s) => s.count === 0 && s.key !== 'registres',
  );
  const canExport = !loading && !loadError && totalCount > 0;

  const modal = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--card-bg)] p-7 text-[var(--text-body)] shadow-2xl"
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-heading)]">
            {t('title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAriaLabel')}
            className="flex-shrink-0 rounded p-1 text-2xl leading-none text-[var(--text-muted)] hover:text-[var(--text-heading)]"
          >
            ×
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div
            className="flex flex-col items-center justify-center py-10"
            aria-live="polite"
            aria-atomic="true"
          >
            <div
              aria-hidden="true"
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--amber-400)] border-t-transparent"
            />
            <span className="sr-only">{t('loading')}</span>
          </div>
        )}

        {/* Load error */}
        {loadError && !loading && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4"
          >
            <p className="text-sm text-[var(--error-text)]">
              {t('errors.loadFailed')}
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRetryLoad}
              >
                {t('errors.retry')}
              </Button>
            </div>
          </div>
        )}

        {/* Loaded body */}
        {!loading && !loadError && binderData && (
          <>
            <p className="text-sm text-[var(--text-body)]">
              {t('countSummary', { count: totalCount })}
            </p>

            {hasEmptySections && totalCount > 0 && (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                {t('emptySectionsNote')}
              </p>
            )}

            {exportError && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4"
              >
                <p className="text-sm text-[var(--error-text)]">
                  {t('errors.exportFailed')}
                </p>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={exporting}
          >
            {t('cta.cancel')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleExport}
            disabled={!canExport || exporting}
          >
            {t('cta.export')}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
