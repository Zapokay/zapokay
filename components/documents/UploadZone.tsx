'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';
import { uploadDocument } from '@/lib/upload-document';

interface UploadZoneProps {
  companyId: string;
  framework: string;        // 'LSA' | 'CBCA' — derived from company.incorporation_type
  locale: string;
  activeFiscalYears?: number[];
  onUploadComplete: () => void;
  onError?: (message: string) => void;
  /** Pre-filled from URL params (when navigating from minute-book page) */
  initialRequirementKey?: string | null;
  initialRequirementYear?: number | null;
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

export function UploadZone({ companyId, framework, locale, activeFiscalYears = [], onUploadComplete, onError, initialRequirementKey, initialRequirementYear, preferredLanguage = 'fr' }: UploadZoneProps) {
  const fr = locale === 'fr';
  const currentYear = new Date().getFullYear();
  const [step, setStep] = useState<UploadStep>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [title, setTitle] = useState('');
  // True once the user has manually edited the title — protects against
  // cascade overwrites (e.g. annual fiscal-year tweaks re-generating the suffix).
  const [titleDirty, setTitleDirty] = useState(false);
  const [docType, setDocType] = useState('autre');
  const [language, setLanguage] = useState<string>(preferredLanguage);
  const [docYear, setDocYear] = useState<number | ''>(
    activeFiscalYears.includes(currentYear) ? currentYear : activeFiscalYears[0] ?? ''
  );
  const [requirementKey, setRequirementKey] = useState<string | null>(initialRequirementKey ?? null);
  const [requirementYear, setRequirementYear] = useState<number | null>(initialRequirementYear ?? null);
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

  // Cascade effect — fires on requirement change (or once `requirements` loads).
  // Sets document_type, title (for foundational), and docYear based on category.
  // Title suffix for annual is handled in the docYear-dependent effect below.
  useEffect(() => {
    // If a key is set but its ChecklistItem hasn't been fetched/matched yet,
    // wait — don't wipe state prematurely.
    if (requirementKey && !selectedReq) return;

    setTitleDirty(false);

    if (!selectedReq) {
      // Cleared: lift locks; restore docYear default if currently empty.
      setDocYear(prev =>
        prev === '' ? (activeFiscalYears.includes(currentYear) ? currentYear : activeFiscalYears[0] ?? '') : prev,
      );
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

  function validateFile(f: File): string | null {
    if (f.type !== 'application/pdf') {
      return fr ? 'Seuls les fichiers PDF sont acceptés.' : 'Only PDF files are accepted.';
    }
    if (f.size > MAX_SIZE) {
      return fr ? 'Le fichier dépasse 20 Mo.' : 'File exceeds 20 MB.';
    }
    return null;
  }

  function pickFile(f: File) {
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
      setDocYear(activeFiscalYears.includes(currentYear) ? currentYear : activeFiscalYears[0] ?? '');
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
                {fr ? 'Exercice fiscal' : 'Fiscal year'}
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
                    {fr ? `Exercice ${y}` : `Fiscal year ${y}`}
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
                {requirements.map(req => (
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
    </div>
  );
}
