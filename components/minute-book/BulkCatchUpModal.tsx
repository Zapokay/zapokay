'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { BulkGenerateResult } from '@/app/api/minute-book/bulk-generate/route';
import Button from '@/components/ui/Button';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface BulkMissingItem {
  requirementKey: string;
  title: string;
  canGenerate: boolean;
}

/**
 * Scope of missing documents the user may regenerate, grouped by a fiscal-year
 * identifier (the Record key). Each group carries explicit startYear/endYear
 * so the yearGroup.title i18n string ("Exercice {startYear}–{endYear}") renders
 * correctly for both calendar-year and offset fiscal years, plus a per-year
 * resolutionDate (the date stamped onto every generated document for that
 * year). These values come from the completeness API's fiscal_years entries
 * and are supplied by the page component in Edit 6.
 */
export type BulkMissingByYear = Record<
  number,
  {
    startYear: number;
    endYear: number;
    resolutionDate: string; // YYYY-MM-DD, per-year, editable in the modal
    items: BulkMissingItem[];
  }
>;

export interface BulkCatchUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingByYear: BulkMissingByYear;
  onComplete?: (results: BulkGenerateResult[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Internal types                                                     */
/* ------------------------------------------------------------------ */

type Step = 'scope' | 'generating' | 'success';

interface YearItemState extends BulkMissingItem {
  selected: boolean;
}

type YearsState = Record<
  number,
  {
    startYear: number;
    endYear: number;
    resolutionDate: string;
    items: YearItemState[];
  }
>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function initYearsState(src: BulkMissingByYear): YearsState {
  const out: YearsState = {};
  for (const [yearStr, group] of Object.entries(src)) {
    out[Number(yearStr)] = {
      startYear: group.startYear,
      endYear: group.endYear,
      resolutionDate: group.resolutionDate,
      items: group.items.map((it) => ({
        ...it,
        selected: it.canGenerate,
      })),
    };
  }
  return out;
}

/**
 * Structural deep-compare of two YearsState trees. Only compares fields that
 * are mutable via the modal's setYears write paths: group.resolutionDate and
 * item.selected. startYear/endYear/title/canGenerate/requirementKey are
 * stable for the lifetime of a given missingByYear prop (the reset effect
 * rebuilds state when the prop changes).
 */
function yearsEqual(a: YearsState, b: YearsState): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[Number(k)];
    const bv = b[Number(k)];
    if (!bv) return false;
    if (av.resolutionDate !== bv.resolutionDate) return false;
    if (av.items.length !== bv.items.length) return false;
    for (let i = 0; i < av.items.length; i++) {
      if (
        av.items[i].requirementKey !== bv.items[i].requirementKey ||
        av.items[i].selected !== bv.items[i].selected
      ) {
        return false;
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BulkCatchUpModal({
  isOpen,
  onClose,
  missingByYear,
  onComplete,
}: BulkCatchUpModalProps) {
  /* ---------- State ---------- */
  const [step, setStep] = useState<Step>('scope');
  const [years, setYears] = useState<YearsState>(() => initYearsState(missingByYear));
  const [signatoriesConfirmed, setSignatoriesConfirmed] = useState(false);
  const [generationResults, setGenerationResults] = useState<BulkGenerateResult[] | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showEscConfirm, setShowEscConfirm] = useState(false);
  const [generatingCounter, setGeneratingCounter] = useState(1);
  const [totalToGenerate, setTotalToGenerate] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const initialYearsRef = useRef<YearsState>(initYearsState(missingByYear));

  const t = useTranslations('minuteBook.bulkCatchUp');

  /* ---------- Reset on (re)open ---------- */
  useEffect(() => {
    if (isOpen) {
      const fresh = initYearsState(missingByYear);
      setYears(fresh);
      initialYearsRef.current = fresh;
      setStep('scope');
      setSignatoriesConfirmed(false);
      setGenerationResults(null);
      setGenerationError(null);
      setIsPending(false);
      setShowEscConfirm(false);
      setGeneratingCounter(1);
      setTotalToGenerate(0);
    }
  }, [isOpen, missingByYear]);

  /* ---------- Derived ---------- */
  const selectedCount = useMemo(() => {
    let n = 0;
    for (const group of Object.values(years)) {
      for (const it of group.items) if (it.selected) n++;
    }
    return n;
  }, [years]);

  // Reference-equality fast path (reset effect keeps refs aligned when unmodified),
  // deep compare only if refs differ.
  const hasModifications = useMemo(() => {
    if (years === initialYearsRef.current) return false;
    return !yearsEqual(years, initialYearsRef.current);
  }, [years]);

  const canSubmit = useMemo(
    () => signatoriesConfirmed && selectedCount > 0 && !isPending,
    [signatoriesConfirmed, selectedCount, isPending],
  );

  /* ---------- Escape handling ---------- */
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (step === 'generating') return;
      if (hasModifications && !showEscConfirm) {
        setShowEscConfirm(true);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, step, hasModifications, showEscConfirm, onClose]);

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

  /* ---------- Optimistic counter tick (generating step only) ---------- */
  useEffect(() => {
    if (step !== 'generating') return;
    const id = setInterval(() => {
      setGeneratingCounter((n) =>
        n < totalToGenerate - 1 ? n + 1 : n,
      );
    }, 2000);
    return () => clearInterval(id);
  }, [step, totalToGenerate]);

  /* ---------- Overlay click ---------- */
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target !== overlayRef.current) return;
    if (step === 'generating') return;
    if (hasModifications && !showEscConfirm) {
      setShowEscConfirm(true);
    } else {
      onClose();
    }
  }

  /* ---------- Submit ---------- */
  async function handleSubmit() {
    if (!canSubmit) return;
    setGenerationError(null);

    const items = Object.entries(years).flatMap(([yearStr, group]) =>
      group.items
        .filter((it) => it.selected)
        .map((it) => ({
          requirementKey: it.requirementKey,
          fiscalYear: Number(yearStr),
          resolutionDate: group.resolutionDate,
        })),
    );

    setTotalToGenerate(items.length);
    setGeneratingCounter(1);
    setIsPending(true);
    setStep('generating');

    try {
      const res = await fetch('/api/minute-book/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success: boolean; results?: BulkGenerateResult[]; error?: string }
        | null;
      if (!res.ok || !data?.success || !data.results) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setGenerationResults(data.results);
      setStep('success');
    } catch (err) {
      console.error('[BulkCatchUp] Submit failed:', err);
      setGenerationError(t('modal.scopeError.body'));
      setStep('scope');
    } finally {
      setIsPending(false);
    }
  }

  /* ---------- Render ---------- */
  if (!isOpen) return null;

  const totalMissing = Object.values(missingByYear).reduce(
    (sum, g) => sum + g.items.length,
    0,
  );
  const yearsWithItems = Object.keys(missingByYear).length;
  const sortedYears = Object.keys(years)
    .map(Number)
    .sort((a, b) => b - a);

  const modal = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Rattrapage groupé"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={modalRef}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--card-bg)] p-7 text-[var(--text-body)] shadow-2xl"
      >
        {step === 'scope' && (
          <>
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex-1 pr-4">
                <h2 className="text-lg font-semibold text-[var(--text-heading)]">
                  {t('modal.title')}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {t('modal.subtitle', {
                    docCount: totalMissing,
                    yearCount: yearsWithItems,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('modal.closeAriaLabel')}
                className="flex-shrink-0 rounded p-1 text-2xl leading-none text-[var(--text-muted)] hover:text-[var(--text-heading)]"
              >
                ×
              </button>
            </div>

            {/* Submit error (scope step) — set on fetch/HTTP failure, dismissable */}
            {generationError && (
              <div
                role="alert"
                className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] p-4"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[var(--error-text)]">
                    {t('modal.scopeError.title')}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--error-text)]">
                    {generationError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGenerationError(null)}
                  aria-label={t('modal.scopeError.dismissAriaLabel')}
                  className="flex-shrink-0 rounded p-1 text-[var(--error-text)] hover:opacity-70"
                >
                  ×
                </button>
              </div>
            )}

            {/* Esc-with-modifications confirmation (inline banner) */}
            {showEscConfirm && (
              <div
                role="alert"
                aria-labelledby="bulk-catchup-esc-confirm-title"
                className="mb-6 rounded-lg border border-[var(--amber-400)] bg-[var(--warning-bg)] p-4"
              >
                <h3
                  id="bulk-catchup-esc-confirm-title"
                  className="text-sm font-semibold text-[var(--warning-text)]"
                >
                  {t('modal.escConfirm.title')}
                </h3>
                <div className="mt-3 flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowEscConfirm(false)}
                  >
                    {t('modal.escConfirm.continue')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                  >
                    {t('modal.escConfirm.discard')}
                  </Button>
                </div>
              </div>
            )}

            {/* Disclaimer banner — signatories are current only */}
            <div
              role="alert"
              className="mb-6 rounded-lg border-l-4 border-[var(--amber-400)] bg-[var(--warning-bg)] p-4"
            >
              <h3 className="text-sm font-semibold text-[var(--warning-text)]">
                {t('modal.disclaimer.heading')}
              </h3>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t('modal.disclaimer.body')}
              </p>
            </div>

            {/* Year groups */}
            <div className="flex flex-col gap-4">
              {sortedYears.map((year) => {
                const group = years[year];
                const selectedInYear = group.items.filter((it) => it.selected).length;
                const allUnchecked = selectedInYear === 0;

                return (
                  <div
                    key={year}
                    className={`rounded-xl border border-[var(--card-border)] p-4 ${
                      allUnchecked ? 'opacity-[0.45]' : ''
                    }`}
                  >
                    {/* Year title + dynamic missing-count */}
                    <div className="mb-3 flex items-baseline justify-between">
                      <h3 className="font-semibold text-[var(--text-heading)]">
                        {t('modal.yearGroup.title', {
                          startYear: group.startYear,
                          endYear: group.endYear,
                        })}
                      </h3>
                      <span className="text-xs text-[var(--text-muted)]">
                        {t('modal.yearGroup.missingCount', { count: selectedInYear })}
                      </span>
                    </div>

                    {/* Date input — reads + writes group.resolutionDate */}
                    <div className="mb-3 flex items-center gap-2">
                      <label
                        htmlFor={`bulk-date-${year}`}
                        className="text-sm text-[var(--text-body)]"
                      >
                        {t('modal.yearGroup.dateLabel')}
                      </label>
                      <input
                        id={`bulk-date-${year}`}
                        type="date"
                        value={group.resolutionDate}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          setYears((prev) => ({
                            ...prev,
                            [year]: { ...prev[year], resolutionDate: newDate },
                          }));
                        }}
                        className="rounded border border-[var(--card-border)] bg-transparent px-2 py-1 text-sm"
                      />
                    </div>

                    {/* Doc checkboxes — only toggle `selected` on the item */}
                    <ul className="flex flex-col gap-2">
                      {group.items.map((it) => {
                        const id = `bulk-item-${year}-${it.requirementKey}`;
                        const fadeItem = !allUnchecked && !it.selected;
                        const strike = !it.selected;
                        return (
                          <li key={it.requirementKey} className="flex items-center gap-2">
                            <input
                              id={id}
                              type="checkbox"
                              checked={it.selected}
                              disabled={!it.canGenerate}
                              onChange={(e) => {
                                const nextSelected = e.target.checked;
                                setYears((prev) => ({
                                  ...prev,
                                  [year]: {
                                    ...prev[year],
                                    items: prev[year].items.map((x) =>
                                      x.requirementKey === it.requirementKey
                                        ? { ...x, selected: nextSelected }
                                        : x,
                                    ),
                                  },
                                }));
                              }}
                            />
                            <label
                              htmlFor={id}
                              className={`cursor-pointer text-sm ${
                                fadeItem ? 'opacity-[0.45]' : ''
                              } ${strike ? 'line-through' : ''}`}
                            >
                              {it.title}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Empty state (user deselected everything) */}
            {selectedCount === 0 && (
              <div className="mt-4 py-6 text-center">
                <h3 className="font-semibold text-[var(--text-heading)]">
                  {t('modal.emptyState.heading')}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {t('modal.emptyState.body')}
                </p>
              </div>
            )}

            {/* Confirmation checkbox */}
            <div className="mt-6 border-t border-[var(--card-border)] pt-6">
              <label
                htmlFor="bulk-catchup-signatories-confirmed"
                className="flex cursor-pointer items-start gap-2"
              >
                <input
                  id="bulk-catchup-signatories-confirmed"
                  type="checkbox"
                  checked={signatoriesConfirmed}
                  onChange={(e) => setSignatoriesConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-[var(--text-body)]">
                  {t('modal.confirmCheckbox')}
                </span>
              </label>
            </div>

            {/* Invisible CTA-enabled announcement for screen readers */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {canSubmit ? t('modal.ctaEnabledAnnouncement') : ''}
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" size="md" onClick={onClose}>
                {t('modal.cta.cancel')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                aria-label={
                  !canSubmit
                    ? t('modal.cta.submitDisabledAria', { count: selectedCount })
                    : undefined
                }
              >
                {t('modal.cta.submit', { count: selectedCount })}
              </Button>
            </div>
          </>
        )}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div aria-live="polite" aria-atomic="true">
              <h2 className="text-lg font-semibold text-[var(--text-heading)]">
                {t('modal.loading.counter', {
                  current: generatingCounter,
                  total: totalToGenerate,
                })}
              </h2>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t('modal.loading.body')}
            </p>
            <div
              aria-hidden="true"
              className="mt-6 h-8 w-8 animate-spin rounded-full border-2 border-[var(--amber-400)] border-t-transparent"
            />
          </div>
        )}
        {step === 'success' && generationResults && (() => {
          const okResults = generationResults.filter(
            (r): r is Extract<BulkGenerateResult, { ok: true }> => r.ok,
          );
          const okCount = okResults.length;
          const total = generationResults.length;
          const allSucceeded = okCount === total;
          const allFailed = okCount === 0;
          const yearCount = new Set(okResults.map((r) => r.fiscalYear)).size;
          const sortedOk = [...okResults].sort(
            (a, b) => b.fiscalYear - a.fiscalYear,
          );

          const titleKey = allSucceeded
            ? 'modal.success.title'
            : allFailed
              ? 'modal.success.failureTitle'
              : 'modal.success.partialTitle';

          const handleDone = () => {
            onComplete?.(generationResults);
            onClose();
          };

          return (
            <>
              <div className="mb-6 flex items-start justify-between">
                <div className="flex-1 pr-4">
                  <h2 className="text-lg font-semibold text-[var(--text-heading)]">
                    {t(titleKey)}
                  </h2>
                  {!allFailed && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {allSucceeded
                        ? t('modal.success.count', { count: okCount })
                        : t('modal.success.partialCount', {
                            ok: okCount,
                            total,
                          })}
                      {' · '}
                      {t('modal.success.yearCount', { count: yearCount })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDone}
                  aria-label={t('modal.closeAriaLabel')}
                  className="flex-shrink-0 rounded p-1 text-2xl leading-none text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                >
                  ×
                </button>
              </div>

              {allFailed ? (
                <p className="text-sm text-[var(--text-body)]">
                  {t('modal.success.failureBody')}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sortedOk.map((r) => (
                    <li
                      key={r.documentId}
                      className="text-sm text-[var(--text-body)]"
                    >
                      ✓ {r.title} — {r.fiscalYear - 1}–{r.fiscalYear}
                    </li>
                  ))}
                </ul>
              )}

              {!allFailed && (
                <p className="mt-6 text-sm text-[var(--text-muted)]">
                  {t('modal.success.nextStep')}
                </p>
              )}

              {!allSucceeded && !allFailed && (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  {t('modal.success.partialRetryHelper')}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={handleDone}
                >
                  {t('modal.success.closeCta')}
                </Button>
                {!allFailed && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleDone}
                  >
                    {t('modal.success.viewBookCta')}
                  </Button>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
