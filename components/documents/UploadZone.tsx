'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import { uploadDocument } from '@/lib/upload-document';
import { getFiscalYearLabel } from '@/lib/fiscal-year-label';

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

type UploadStep = 'idle' | 'selected' | 'uploading' | 'done';

const DOC_TYPES = [
  { value: 'statuts',    labelFr: 'Statuts',        labelEn: 'Articles' },
  { value: 'resolution', labelFr: 'Résolution',     labelEn: 'Resolution' },
  { value: 'pv',         labelFr: 'Procès-verbal',  labelEn: 'Minutes' },
  { value: 'registre',   labelFr: 'Registre',       labelEn: 'Register' },
  { value: 'rapport',    labelFr: 'Rapport',         labelEn: 'Report' },
  { value: 'autre',      labelFr: 'Autre',           labelEn: 'Other' },
];

const LANGUAGES = [
  { value: 'fr',        labelFr: 'Français', labelEn: 'French' },
  { value: 'en',        labelFr: 'Anglais',  labelEn: 'English' },
  { value: 'bilingual', labelFr: 'Bilingue', labelEn: 'Bilingual' },
];

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export function UploadZone({ companyId, framework, locale, activeFiscalYears = [], onUploadComplete, onError, preferredLanguage = 'fr' }: UploadZoneProps) {
  const fr = locale === 'fr';
  const [step, setStep] = useState<UploadStep>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [title, setTitle] = useState('');
  // True once the user has manually edited the title — protects against
  // cascade overwrites (e.g. annual fiscal-year tweaks re-generating the suffix).
  const [titleDirty, setTitleDirty] = useState(false);
  const [docType, setDocType] = useState('autre');
  const [language, setLanguage] = useState<string>(preferredLanguage);
  // Default to '' ("— No fiscal year —") so the corresponds-to filter (Item 7)
  // shows ALL annual reqs across all years until the user explicitly picks a year.
  // Matches the bundle philosophy of "all by default, filter on action".
  const [docYear, setDocYear] = useState<number | ''>('');
  const [requirementKey, setRequirementKey] = useState<string | null>(null);
  const [requirementYear, setRequirementYear] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<ChecklistItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the currently selected ChecklistItem (null until requirements fetch lands
  // or when the dropdown is cleared). Matches on both key AND year since annual
  // requirements are keyed per fiscal year in the checklist.
  const selectedReq = requirementKey
    ? requirements.find(
        r =>
          r.requirement_key === requirementKey &&
          (r.year ?? null) === (requirementYear ?? null),
      ) ?? null
    : null;
  const isFoundational = selectedReq?.category === 'foundational';

  // Item 7: filter corresponds-to options by selected fiscal year.
  // Foundational requirements are year-agnostic — always shown.
  // Annual requirements: only when req.year matches docYear, or docYear is empty (no filter).
  // Note: when requirementKey is set, FY selector is disabled (L360) — so filteredRequirements
  // can't drop the currently-selected option mid-flow.
  const filteredRequirements = requirements.filter(
    req => req.category === 'foundational' || docYear === '' || req.year === docYear,
  );

  // Cascade effect — fires on requirement change (or once `requirements` loads).
  // Sets document_type, title (for foundational), and docYear based on category.
  // Title suffix for annual is handled in the docYear-dependent effect below.
  useEffect(() => {
    // If a key is set but its ChecklistItem hasn't been fetched/matched yet,
    // wait — don't wipe state prematurely.
    if (requirementKey && !selectedReq) return;

    setTitleDirty(false);

    if (!selectedReq) {
      // Cleared: lift locks. docYear is preserved as-is — fresh-open default is
      // '' (set in useState init), and a user who picked a year manually keeps it.
      return;
    }

    setDocType(selectedReq.document_type);

    if (selectedReq.category === 'foundational') {
      setDocYear('');
      setTitle(fr ? selectedReq.title_fr : selectedReq.title_en);
    } else {
      // Annual: snap docYear to the requirement's own year. The requirement is year-scoped
      // — picking "Annual Board Resolution (2023)" means this is THE 2023 doc.
      if (typeof selectedReq.year === 'number') {
        setDocYear(selectedReq.year);
      }
      // Title is written by the docYear effect below (needs the freshly-set year).
    }
    // selectedReq is derived from (requirementKey, requirementYear, requirements);
    // depending on those is equivalent and avoids re-running on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements]);

  // Annual-only title regeneration when docYear changes (and on requirement switch
  // into annual). Respects titleDirty so manual edits are not clobbered.
  useEffect(() => {
    if (!selectedReq || selectedReq.category !== 'annual') return;
    if (titleDirty) return;
    const base = fr ? selectedReq.title_fr : selectedReq.title_en;
    const suffix = docYear !== '' ? ` — ${docYear}` : '';
    setTitle(base + suffix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, requirementYear, requirements, docYear, titleDirty]);

  // Fetch unsatisfied requirements for the optional dropdown
  useEffect(() => {
    fetch('/api/minute-book/completeness')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.checklist) {
          setRequirements(data.checklist);
        }
      })
      .catch(() => {/* non-fatal */});
  }, []);

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
      return fr ? 'Le fichier dépasse 20 Mo.' : 'File exceeds 20 MB.';
    }
    return null;
  }

  function pickFile(f: File) {
    // Layer A/B PDF gate — open the educational modal instead of inline error.
    if (f.type !== 'application/pdf') {
      setShowPdfModal(true);
      return;
    }
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError('');
    setFile(f);
    setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim());
    setStep('selected');
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fr]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  }

  async function handleUpload() {
    if (!file || !title.trim()) return;
    setStep('uploading');
    setProgress(15);

    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const msg = fr ? "Session expirée." : 'Session expired.';
      setError(msg);
      onError?.(msg);
      setStep('selected');
      return;
    }

    setProgress(40);

    const result = await uploadDocument({
      file,
      companyId,
      userId: user.id,
      supabaseClient: supabase,
      title,
      docType,
      language,
      docYear: docYear !== '' ? docYear : null,
      requirementKey,
      requirementYear,
      framework: framework === 'CBCA' ? 'CBCA' : 'LSA',
      requirements,
    });

    if (!result.ok) {
      // Layer C magic-number rejection from lib/upload-document — route to the
      // same educational modal the client-side gates use (cf. pickFile).
      if (result.error === 'NON_PDF_REJECTED') {
        setShowPdfModal(true);
        setStep('selected');
        return;
      }
      const msg = fr
        ? "Erreur lors de l'envoi du fichier."
        : 'Error uploading file.';
      setError(msg);
      onError?.(msg);
      setStep('selected');
      return;
    }

    setProgress(100);
    setStep('done');

    setTimeout(() => {
      setStep('idle');
      setFile(null);
      setTitle('');
      setTitleDirty(false);
      setDocType('autre');
      setLanguage(preferredLanguage);
      setDocYear('');
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
      onUploadComplete();
    }, 900);
  }

  function handleReset() {
    setStep('idle');
    setFile(null);
    setTitle('');
    setTitleDirty(false);
    setError('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  // PDF-only educational modal — portaled to document.body to match the project
  // convention used by BulkCatchUpModal and DueDiligenceModal. Declared once
  // here, referenced from each of the three return paths so all steps can show it.
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

  /* ── Idle: drop zone ─────────────────────────────────── */
  if (step === 'idle') {
    return (
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
        {pdfModalElement}
      </div>
    );
  }

  /* ── Selected: metadata form ─────────────────────────── */
  if (step === 'selected') {
    return (
      <div className="border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] p-5 space-y-4">
        {/* File row */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--error-bg)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--error-text)]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-body)] truncate">{file?.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}
            </p>
          </div>
          <button
            onClick={handleReset}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
              {fr ? 'Titre du document' : 'Document title'}
            </label>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleDirty(true); }}
              placeholder={fr ? 'Ex. Résolution 2024-01' : 'E.g. Resolution 2024-01'}
              className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {fr ? 'Type' : 'Type'}
              </label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                disabled={!!requirementKey}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {DOC_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {fr ? t.labelFr : t.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {fr ? 'Langue' : 'Language'}
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
              >
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>
                    {fr ? l.labelFr : l.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeFiscalYears.length > 0 && !isFoundational && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {fr ? 'Exercice fiscal' : 'Fiscal Year'}
              </label>
              <select
                value={docYear}
                onChange={e => setDocYear(e.target.value === '' ? '' : parseInt(e.target.value))}
                disabled={!!requirementKey}
                className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">{fr ? '— Aucun exercice —' : '— No fiscal year —'}</option>
                {activeFiscalYears.map(y => (
                  <option key={y} value={y}>
                    {getFiscalYearLabel(y, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional: link to a minute-book requirement */}
          {requirements.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                {fr ? 'Ce document correspond à :' : 'This document corresponds to:'}
              </label>
              <select
                value={requirementKey ? `${requirementKey}|${requirementYear ?? ''}` : ''}
                onChange={e => {
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
                <option value="">
                  {fr ? 'Sélectionner un document requis (optionnel)' : 'Select a required document (optional)'}
                </option>
                {filteredRequirements.map(req => (
                  <option
                    key={`${req.requirement_key}-${req.year ?? 'f'}`}
                    value={`${req.requirement_key}|${req.year ?? ''}`}
                  >
                    {fr ? req.title_fr : req.title_en}{req.year ? ` (${req.year})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-[var(--error-text)]">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleReset}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--card-border)] text-[var(--text-body)] bg-[var(--card-bg)] hover:bg-[var(--page-bg)] transition-colors"
          >
            {fr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={!title.trim()}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--navy-600)] text-white hover:bg-[var(--navy-800)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {fr ? 'Ajouter au coffre-fort' : 'Add to vault'}
          </button>
        </div>
        {pdfModalElement}
      </div>
    );
  }

  /* ── Uploading / Done ────────────────────────────────── */
  return (
    <div className="border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] p-5 space-y-3">
      <div className="flex items-center gap-3">
        {step === 'done' ? (
          <div className="w-8 h-8 rounded-full bg-[var(--success-bg)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--info-bg)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--info-text)] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        <p className="text-sm font-medium text-[var(--text-body)]">
          {step === 'done'
            ? (fr ? 'Document ajouté !' : 'Document added!')
            : (fr ? 'Envoi en cours…' : 'Uploading…')}
        </p>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--progress-bg)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--amber-400)' }}
        />
      </div>
      {pdfModalElement}
    </div>
  );
}
