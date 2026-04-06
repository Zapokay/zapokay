'use client';

import { useState } from 'react';
import { Plus, Trash2, Info, UserCheck } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingDirector {
  fullName: string;
  appointmentDate: string;
  isCanadianResident: boolean;
}

interface StepDirectorsProps {
  locale: string;
  userFullName?: string;
  incorporationDate?: string;
  initialDirectors?: OnboardingDirector[];
  onContinue: (directors: OnboardingDirector[]) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepDirectors({
  locale,
  userFullName = '',
  incorporationDate = '',
  initialDirectors,
  onContinue,
  onSkip,
}: StepDirectorsProps) {

  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  const [directors, setDirectors] = useState<OnboardingDirector[]>(
    initialDirectors && initialDirectors.length > 0
      ? initialDirectors
      : [
          {
            fullName: userFullName,
            appointmentDate: defaultDate,
            isCanadianResident: true,
          },
        ]
  );

  const [showTooltip, setShowTooltip] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateDirector(index: number, field: keyof OnboardingDirector, value: any) {
    setDirectors((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  function addDirector() {
    setDirectors((prev) => [
      ...prev,
      { fullName: '', appointmentDate: defaultDate, isCanadianResident: true },
    ]);
  }

  function removeDirector(index: number) {
    setDirectors((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    // Filter out empty entries
    const valid = directors.filter((d) => d.fullName.trim());
    onContinue(valid.length > 0 ? valid : directors);
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <UserCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? 'Qui sont les administrateurs de votre entreprise ?'
            : 'Who are the directors of your company?'}
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
            {locale === 'fr' ? "Qu'est-ce qu'un administrateur ?" : 'What is a director?'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? "Les administrateurs supervisent la gestion de l'entreprise. Dans la plupart des petites entreprises, le fondateur est le seul administrateur."
                : 'Directors oversee company management. In most small businesses, the founder is the sole director.'}
            </div>
          )}
        </div>
      </div>

      {/* Director entries */}
      <div className="space-y-3">
        {directors.map((director, index) => (
          <div
            key={index}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {locale === 'fr' ? `Administrateur ${index + 1}` : `Director ${index + 1}`}
              </p>
              {directors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDirector(index)}
                  className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Full name */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {locale === 'fr' ? 'Nom complet' : 'Full name'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={director.fullName}
                onChange={(e) => updateDirector(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Date + Resident row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'fr' ? 'Date de nomination' : 'Appointment date'}
                </label>
                <input
                  type="date"
                  value={director.appointmentDate}
                  onChange={(e) => updateDirector(index, 'appointmentDate', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={director.isCanadianResident}
                      onChange={(e) =>
                        updateDirector(index, 'isCanadianResident', e.target.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-600" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {locale === 'fr' ? 'Résident canadien' : 'Canadian resident'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another */}
      <button
        type="button"
        onClick={addDirector}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-200 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:text-amber-400"
      >
        <Plus className="h-4 w-4" />
        {locale === 'fr' ? 'Ajouter un administrateur' : 'Add a director'}
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

