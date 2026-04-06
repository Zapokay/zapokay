'use client';

import { useState } from 'react';
import { Plus, Trash2, Info, PieChart } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingShareholder {
  fullName: string;
  numberOfShares: number;
  issueDate: string;
}

interface StepShareholdersProps {
  locale: string;
  directors: OnboardingDirector[];
  incorporationDate?: string;
  initialShareholders?: OnboardingShareholder[];
  onContinue: (shareholders: OnboardingShareholder[]) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepShareholders({
  locale,
  directors,
  incorporationDate = '',
  initialShareholders,
  onContinue,
  onSkip,
}: StepShareholdersProps) {

  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  // Smart pre-fill: if only 1 director, pre-fill shareholder with same name + 100 shares
  const defaultShareholders: OnboardingShareholder[] =
    initialShareholders && initialShareholders.length > 0
      ? initialShareholders
      : directors.length === 1
        ? [
            {
              fullName: directors[0].fullName,
              numberOfShares: 100,
              issueDate: defaultDate,
            },
          ]
        : directors.length > 0
          ? directors.map((d) => ({
              fullName: d.fullName,
              numberOfShares: 100,
              issueDate: defaultDate,
            }))
          : [
              {
                fullName: '',
                numberOfShares: 100,
                issueDate: defaultDate,
              },
            ];

  const [shareholders, setShareholders] =
    useState<OnboardingShareholder[]>(defaultShareholders);

  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateShareholder(
    index: number,
    field: keyof OnboardingShareholder,
    value: any
  ) {
    setShareholders((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function addShareholder() {
    setShareholders((prev) => [
      ...prev,
      { fullName: '', numberOfShares: 100, issueDate: defaultDate },
    ]);
  }

  function removeShareholder(index: number) {
    setShareholders((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    const valid = shareholders.filter((s) => s.fullName.trim());
    onContinue(valid.length > 0 ? valid : shareholders);
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <PieChart className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? 'Qui sont les actionnaires (propriétaires) ?'
            : 'Who are the shareholders (owners)?'}
        </h2>

        {/* Tooltip */}
        <div className="relative mx-auto mt-2 inline-block">
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Info className="h-3.5 w-3.5" />
            {locale === 'fr' ? "Qu'est-ce qu'un actionnaire ?" : 'What is a shareholder?'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? "Les actionnaires possèdent l'entreprise. Si vous êtes le seul propriétaire, ajoutez-vous avec le nombre d'actions émises."
                : 'Shareholders own the company. If you are the sole owner, add yourself with the number of shares issued.'}
            </div>
          )}
        </div>
      </div>

      {/* Default share class badge */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <span className="text-emerald-500">✓</span>
          {locale === 'fr'
            ? "Classe d'actions par défaut : Actions ordinaires"
            : 'Default share class: Common Shares'}
        </div>
      </div>

      {/* Shareholder entries */}
      <div className="space-y-3">
        {shareholders.map((shareholder, index) => (
          <div
            key={index}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {locale === 'fr' ? `Actionnaire ${index + 1}` : `Shareholder ${index + 1}`}
              </p>
              {shareholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareholder(index)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Name */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {locale === 'fr' ? 'Nom' : 'Name'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={shareholder.fullName}
                onChange={(e) => updateShareholder(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Shares + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? "Nombre d'actions" : 'Number of shares'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shareholder.numberOfShares}
                  onChange={(e) =>
                    updateShareholder(
                      index,
                      'numberOfShares',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  placeholder="100"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? "Date d'émission" : 'Issue date'}
                </label>
                <input
                  type="date"
                  value={shareholder.issueDate}
                  onChange={(e) => updateShareholder(index, 'issueDate', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another */}
      <button
        type="button"
        onClick={addShareholder}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:text-amber-400"
      >
        <Plus className="h-4 w-4" />
        {locale === 'fr' ? 'Ajouter un actionnaire' : 'Add a shareholder'}
      </button>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {locale === 'fr' ? 'Passer' : 'Skip'}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          {locale === 'fr' ? 'Continuer →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

