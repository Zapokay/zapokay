'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
import { uploadErrorMessageKey } from '@/lib/upload-error-message';
import { composeDisplayName } from '@/lib/display-name';
import { mustBlockUpload } from '@/lib/fiscal-year-open';
import { formatDate } from '@/lib/utils';
import { MINUTE_BOOK_SECTIONS, resolveMinuteBookSection } from '@/lib/minute-book-section';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';

const DOC_TYPE_KEYS = ['statuts', 'resolution', 'pv', 'registre', 'rapport', 'autre'] as const;
const LANGUAGE_KEYS = ['fr', 'en', 'bilingual'] as const;

type Mode = 'vault' | 'row';
type Step = 'form' | 'confirm' | 'uploading' | 'done';

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
  /**
   * Selects the replace-warning copy. 'archive' (Complétude archive rows) uses
   * archive-appropriate keys; default 'requirement' keeps the existing copy so
   * current callers render unchanged.
   */
  replaceContext?: 'requirement' | 'archive';
  /**
   * Brief 2b — lifecycle event-row upload. When set, forwarded verbatim into the
   * POST as `eventLink` so the uploaded doc links to its act (event_documents),
   * exactly as the direct-POST path did. Additive: requirement / vault / archive
   * callers omit it and are unaffected.
   */
  eventLink?: { event_type: string; event_id: string; event_phase: string };
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
    framework,
    locale,
    prefill,
    activeFiscalYears = [],
    preferredLanguage = 'fr',
    replaceDocumentId,
    onUploadComplete,
    onError,
    replaceContext,
    eventLink,
  } = props;
  const isReplace = !!replaceDocumentId;
  const warnTitleKey =
    replaceContext === 'archive' ? 'upload.archiveReplaceWarningTitle' : 'upload.replaceWarningTitle';
  const warnBodyKey =
    replaceContext === 'archive' ? 'upload.archiveReplaceWarningBody' : 'upload.replaceWarningBody';

  const fr = locale === 'fr';
  const t = useTranslations('documents');
  // The gate's sentence is single-sourced with Complétude and the board — the same
  // key, so the three surfaces cannot drift into three phrasings of one fact.
  const tReq = useTranslations('requirementRow');
  // The Livre's own section labels, so the user reads the exact tab name.
  const tSections = useTranslations('minuteBook.binder.sections');

  // -- State --
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [titleDirty, setTitleDirty] = useState(false);
  const [docType, setDocType] = useState(prefill?.docType ?? 'autre');
  const [language, setLanguage] = useState<string>(preferredLanguage);
  // Three states, NOT two. '' = nothing picked yet, and the gate at
  // `yearMissing` below blocks submit on it. A number = a real fiscal year.
  // 'none' = the user deliberately said this document belongs to NO fiscal
  // year — the founding-documents case.
  //
  // Before 'none' existed there was no way to say that. With no requirement
  // selected, `isFoundational` is false, so the field was shown AND mandatory,
  // and it offered nothing but fiscal years. A law-firm PDF bundling several
  // founding pieces has no single requirement to attach and belongs to no
  // year: it could not be uploaded AT ALL. This was a closed door, not a
  // classification problem.
  const [docYear, setDocYear] = useState<number | '' | 'none'>(prefill?.docYear ?? '');
  const [requirementKey, setRequirementKey] = useState<string | null>(
    prefill?.requirementKey ?? null,
  );
  const [requirementYear, setRequirementYear] = useState<number | null>(
    prefill?.requirementYear ?? null,
  );
  const [requirements, setRequirements] = useState<ChecklistItem[]>([]);
  // The fiscal-year ENDS, for the upload gate on the corresponds-to options. They
  // ride in on the SAME response as `requirements` below — the fetch was already
  // throwing them away. No second request, no new prop.
  const [fiscalYears, setFiscalYears] = useState<{ year: number; endDate: string }[]>([]);
  // A2c — the user's shelf override: once the user picks, the derived value
  // stops replacing their choice. Like `titleDirty`, the requirement cascade
  // lowers it again, so a NEW requirement re-proposes its own section.
  const [bookSection, setBookSection] = useState('');
  const [sectionDirty, setSectionDirty] = useState(false);
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
    setBookSection('');
    setSectionDirty(false);
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
        if (data?.fiscalYears) setFiscalYears(data.fiscalYears);
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

  // -- Vault-mode FY filter on the corresponds-to dropdown --
  const filteredRequirements = useMemo(
    () =>
      requirements.filter(
        (req) =>
          req.category === 'foundational' || docYear === '' || req.year === docYear,
      ),
    [requirements, docYear],
  );

  // A2c — the shelf the server WOULD derive, shown to the user before it does.
  // Same function, same arguments, so the form can never disagree with the insert.
  const derivedSection = useMemo(
    () =>
      resolveMinuteBookSection(requirementKey, docType, requirements, docYear === 'none') ?? '',
    [requirementKey, docType, requirements, docYear],
  );
  const effectiveSection = sectionDirty ? bookSection : derivedSection;

  // ── THE UPLOAD GATE, ON THE CORRESPONDS-TO OPTIONS. ──
  //
  // Third and last surface of the gate (Complétude row, A3 board card, here). Same
  // predicate, same sentence, no second copy of the comparison.
  //
  // ⚠️ IT MATTERS MOST IN THE `docYear === ''` STATE. The filter above shows EVERY
  // requirement while no year is chosen, so an open-year annual resolution is
  // offered before the user has picked anything. Keying on the requirement's own
  // `req.year` — never on `docYear` — makes the gate correct in that state too.
  //
  // ⚠️ NO `eventLink` ARGUMENT, AND IT IS NOT AN OMISSION. Options come from
  // `data.checklist`, which the API contract keeps requirements-only precisely
  // because THIS dropdown iterates it ("would render acts as requirement options",
  // app/api/minute-book/completeness/route.ts). Acts arrive in a separate `acts`
  // field this modal does not read, so the lifecycle-act exclusion is unreachable
  // here. If that contract ever changes, this call must gain the argument.
  const uploadBlockedFor = useCallback(
    (req: ChecklistItem): boolean =>
      mustBlockUpload(
        req.requirement_key,
        req.year,
        req.year === null
          ? null
          : fiscalYears.find((f) => f.year === req.year)?.endDate ?? null,
      ),
    [fiscalYears],
  );

  // -- Cascade: requirement change → set type/title/docYear (vault mode only) --
  useEffect(() => {
    if (mode === 'row') return;
    if (requirementKey && !selectedReq) return;
    setTitleDirty(false);
    setSectionDirty(false);
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

  // -- Annual title set (vault mode) --
  // The sole setter of an ANNUAL requirement's title box (the foundational
  // cascade above sets the title only for foundational). Now always the clean
  // localized requirement title: the year does NOT belong in the NAME — it lives
  // in document_year and is rendered once, middot-separated, at each surface
  // (composeDisplayName). Previously this baked "— {docYear}", the vault-mode
  // twin of the row-path bake in useRowUpload.
  useEffect(() => {
    if (mode === 'row') return;
    if (!selectedReq || selectedReq.category !== 'annual') return;
    if (titleDirty) return;
    setTitle(fr ? selectedReq.title_fr : selectedReq.title_en);
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

  // -- Final-replace detection (Part 4, #135) — Vault path only. A CERTIFIED
  //    upload onto a "correspond à" requirement that ALREADY holds a final
  //    must be confirmed before it supersedes that final. Draft replaces and
  //    non-vault paths are unaffected. selectedReq is derived from the already
  //    -fetched completeness checklist, so detection needs no extra fetch. --
  const isFinalConflict =
    mode === 'vault' &&
    isCertified &&
    !!selectedReq?.satisfied &&
    selectedReq?.document_is_finalized === true;
  const detectedFinalId = isFinalConflict ? (selectedReq?.document_id ?? undefined) : undefined;

  // -- Submit gate --
  // Phase B B5: certification is no longer mandatory. The checkbox is still
  // rendered and toggleable; its state determines `is_finalized` at insert
  // time (B5-edit-4 below). Title non-empty; allow the form step AND the
  // final-replace confirm step (the confirm button re-enters handleSubmit).
  // Vault mandatory year (3b): when the FY field is shown (vault, has years,
  // not foundational) a real fiscal year must be picked. Row mode + foundational
  // (field hidden / year auto-set) and requirement-selected vault (year
  // auto-set, select disabled) all satisfy this without a manual pick.
  const fyFieldShown = mode === 'vault' && activeFiscalYears.length > 0 && !isFoundational;
  const yearMissing = fyFieldShown && docYear === '';
  const canSubmit = !!title.trim() && !yearMissing && (step === 'form' || step === 'confirm');

  const handleSubmit = useCallback(async (opts?: { confirmed?: boolean }) => {
    if (!canSubmit) return;
    // Final-replace gate (Vault): divert to the confirm step unless the user
    // already confirmed via the confirm view. Never POST while diverting.
    if (isFinalConflict && !opts?.confirmed) {
      setStep('confirm');
      return;
    }
    setStep('uploading');
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('companyId', companyId);
    fd.append('title', title);
    fd.append('docType', docType);
    fd.append('language', language);
    // '' and 'none' both mean "no fiscal year": omit the field rather than let
    // String('none') reach the route, where numOrNull would coerce it to NaN and
    // answer null by accident. Same result, stated instead of inferred.
    if (typeof docYear === 'number') fd.append('docYear', String(docYear));
    // A2b — the third year state, on its own field precisely because the comment
    // above forbids it riding on docYear. Lets the server derive as the client did.
    if (docYear === 'none') fd.append('noFiscalYear', 'true');
    if (requirementKey) fd.append('requirementKey', requirementKey);
    if (requirementYear != null) fd.append('requirementYear', String(requirementYear));
    // A2c — always sent when the field was shown; the helper validates it and
    // derives instead if it is not one of the nine.
    if (effectiveSection) fd.append('minuteBookSection', effectiveSection);
    fd.append('framework', framework);
    fd.append('requirements', JSON.stringify(requirements));
    // Phase B B5: actual checkbox state — true ⇒ 'téléversé', false ⇒ WIP
    // upload that the three-state model rebuckets to 'généré' (see
    // lib/minute-book/state.ts) until the user finalizes via re-upload.
    fd.append('isFinalized', String(isCertified));
    // Single source for the replace target: the explicit prop (Completeness
    // row path) OR the Vault-detected existing final id (Part 4). Either way
    // it flows into the Pass-B supersede in uploadDocument.
    const effectiveReplaceId = replaceDocumentId ?? detectedFinalId;
    if (effectiveReplaceId) fd.append('replaceDocumentId', effectiveReplaceId);
    // No userId field — the route derives it from the session (closes the
    // trusted-param hole). eventLink (Brief 2b): forwarded when the event-row
    // caller sets it, so uploadDocument writes the event_documents link (the
    // act's identity — orthogonal to Binder placement, which follows document_type).
    if (eventLink) fd.append('eventLink', JSON.stringify(eventLink));

    // ⚠️ fetch and res.json() are the only steps on this path that can REJECT
    // rather than return an { ok:false } body, so they are the only ones inside
    // the try. A dropped connection — or a non-JSON body from an edge/proxy
    // error — used to reject into nothing: no message, and the modal stayed
    // frozen on 'uploading' forever. The rest of the path was already sound:
    // the route answers { ok, error } on every branch and the { ok:false }
    // handler below reports it.
    let res: Response | null = null;
    let result: any = null;
    try {
      res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      result = await res.json();
    } catch {
      // Same treatment as the { ok:false } branch, with the mapper's generic
      // fallback: no error code and no status is exactly the case
      // uploadErrorMessageKey() answers 'uploadFailed' to. No new key.
      const msg = t(uploadErrorMessageKey());
      setError(msg);
      onError?.(msg);
      setStep('form');
      return;
    }

    if (!result || !result.ok) {
      const msg = t(uploadErrorMessageKey(result?.error, res?.status));
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
    title,
    docType,
    language,
    docYear,
    requirementKey,
    requirementYear,
    framework,
    requirements,
    effectiveSection,
    isCertified,
    replaceDocumentId,
    eventLink,
    isFinalConflict,
    detectedFinalId,
    t,
    onError,
    onUploadComplete,
    onClose,
  ]);

  // -- Row-mode subtitle: canonical title with annual year (middot, shared format) --
  const subtitleRow = useMemo(() => {
    if (mode !== 'row') return '';
    const req = selectedReq;
    if (!req) return prefill?.title ?? '';
    const base = fr ? req.title_fr : req.title_en;
    return composeDisplayName(
      base,
      null,
      req.category === 'annual' && typeof req.year === 'number' ? req.year : null,
    );
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
                {t(warnTitleKey)}
              </h4>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t(warnBodyKey)}
              </p>
            </div>
          </div>
        )}

        {/* Final-replace confirm (Part 4, #135) — Vault certified upload over an
            existing final. Same amber treatment as the B4 replace warning;
            distinct copy (the old final is retired, with a 10-day undo). The
            actions row below owns the Annuler / Remplacer buttons. */}
        {step === 'confirm' && (
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
                {t('upload.finalReplaceTitle')}
              </h4>
              <p className="mt-1 text-sm text-[var(--warning-text)]">
                {t('upload.finalReplaceBody')}
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
              readOnly={isLockedAll}
              placeholder={t('metaTitlePlaceholder')}
              className={`w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors ${isLockedAll ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                  setDocYear(
                    e.target.value === ''
                      ? ''
                      : e.target.value === 'none'
                        ? 'none'
                        : parseInt(e.target.value)
                  )
                }
                disabled={!!requirementKey}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="" disabled>{t('upload.fiscalYearPlaceholder')}</option>
                <option value="none">{t('filterFoundational')}</option>
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
                {/* ★ "Aucune" STAYS, AND THE FIELD STAYS OPTIONAL — Dom's product
                    decision, 2026-08-15, not an oversight: "un utilisateur qui veut
                    téléverser un document propre à son entreprise, non prévu par la
                    plateforme, peut quand même le faire s'il considère qu'il doit
                    aller dans son livre des minutes." A conformity form with an
                    optional classification field looks like a gap; it is a choice.
                    ★ It is also what makes the disabled options SAFE. The gate never
                    traps a user with a real document and nowhere to put it — it
                    closes one wrong shelf, never the door. */}
                <option value="">{t('upload.correspondsToOptional')}</option>
                {filteredRequirements.map((req) => {
                  // The reason has to live INSIDE the label: an <option> renders text
                  // and nothing else — no sibling <span>, and `title=` is not shown
                  // consistently across browsers. Measured before choosing this.
                  const blocked = uploadBlockedFor(req);
                  const endDate =
                    req.year === null
                      ? null
                      : fiscalYears.find((f) => f.year === req.year)?.endDate ?? null;
                  return (
                    <option
                      key={`${req.requirement_key}-${req.year ?? 'f'}`}
                      value={`${req.requirement_key}|${req.year ?? ''}`}
                      disabled={blocked}
                    >
                      {fr ? req.title_fr : req.title_en}
                      {req.year ? ` (${req.year})` : ''}
                      {blocked && endDate
                        ? ` — ${tReq('generateUnavailableUntil', { date: formatDate(endDate, locale) })}`
                        : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Book section — vault mode only, like corresponds-to.
              ⚠️ PLACEMENT AND GROUPING AWAIT ARIA: this is a seventh field in a
              modal that had six, and no design pass has ever been made on it.
              The form here is deliberately the plainest copy of the existing
              selects, not a decision. */}
          {mode === 'vault' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {t('upload.bookSection')}
              </label>
              <select
                value={effectiveSection}
                onChange={(e) => {
                  setSectionDirty(true);
                  setBookSection(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                {MINUTE_BOOK_SECTIONS.map((k) => (
                  <option key={k} value={k}>
                    {tSections(k)}
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
            onClick={step === 'confirm' ? () => setStep('form') : onClose}
            disabled={step === 'uploading'}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(step === 'confirm' ? { confirmed: true } : undefined)}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--navy-600)] text-white hover:bg-[var(--navy-800)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'uploading'
              ? t('upload.submitting')
              : step === 'confirm' || isReplace
                ? t('upload.replaceSubmit')
                : t('upload.submit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
