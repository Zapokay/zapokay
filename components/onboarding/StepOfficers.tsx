'use client';

import { useState, useMemo } from 'react';
import { Info, Briefcase } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingOfficers {
  presidentName: string;
  secretaryName: string;
  treasurerName: string;
}

interface StepOfficersProps {
  locale: string;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  incorporationDate?: string;
  initialOfficers?: OnboardingOfficers;
  onContinue: (officers: OnboardingOfficers) => void;
  onSkip: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepOfficers({
  locale,
  directors,
  shareholders,
  incorporationDate = '',
  initialOfficers,
  onContinue,
  onSkip,
}: StepOfficersProps) {

  // Build list of known people names (deduped)
  const knownPeople = useMemo(() => {
    const names = new Set<string>();
    directors.forEach((d) => {
      if (d.fullName.trim()) names.add(d.fullName.trim());
    });
    shareholders.forEach((s) => {
      if (s.fullName.trim()) names.add(s.fullName.trim());
    });
    return Array.from(names);
  }, [directors, shareholders]);

  // Smart default: pre-select sole director for president + secretary
  const defaultPresident =
    initialOfficers?.presidentName ?? (knownPeople.length === 1 ? knownPeople[0] : '');
  const defaultSecretary =
    initialOfficers?.secretaryName ?? (knownPeople.length === 1 ? knownPeople[0] : '');
  const defaultTreasurer = initialOfficers?.treasurerName ?? '';

  const [presidentName, setPresidentName] = useState(defaultPresident);
  const [secretaryName, setSecretaryName] = useState(defaultSecretary);
  const [treasurerName, setTreasurerName] = useState(defaultTreasurer);

  const [showTooltip, setShowTooltip] = useState(false);

  function handleContinue() {
    onContinue({
      presidentName: presidentName.trim(),
      secretaryName: secretaryName.trim(),
      treasurerName: treasurerName.trim(),
    });
  }

  // ---- Person dropdown ------------------------------------------------------
  function PersonDropdown({
    value,
    onChange,
    label,
    required = false,
    optional = false,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
    required?: boolean;
    optional?: boolean;
  }) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {optional && (
            <span className="ml-1 text-xs font-normal text-zinc-400">
              ({locale === 'fr' ? 'optionnel' : 'optional'})
            </span>
          )}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">
            {locale === 'fr' ? '— Sélectionner —' : '— Select —'}
          </option>
          {knownPeople.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Title */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Briefcase className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? "Qui dirige l'entreprise au quotidien ?"
            : 'Who manages the company day-to-day?'}
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
            {locale === 'fr' ? 'En savoir plus' : 'Learn more'}
          </button>
          {showTooltip && (
            <div className="absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              {locale === 'fr'
                ? "Le président supervise les affaires. Le secrétaire tient les registres. Souvent, c'est la même personne."
                : 'The president oversees business affairs. The secretary maintains records. Often, this is the same person.'}
            </div>
          )}
        </div>
      </div>

      {/* Officer dropdowns */}
      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800/60">
        <PersonDropdown
          value={presidentName}
          onChange={setPresidentName}
          label={locale === 'fr' ? 'Président·e' : 'President'}
        />

        <PersonDropdown
          value={secretaryName}
          onChange={setSecretaryName}
          label={locale === 'fr' ? 'Secrétaire' : 'Secretary'}
        />

        <PersonDropdown
          value={treasurerName}
          onChange={setTreasurerName}
          label={locale === 'fr' ? 'Trésorier·ière' : 'Treasurer'}
          optional
        />
      </div>

      {/* Note about same person */}
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        {locale === 'fr'
          ? "ℹ️ Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises."
          : 'ℹ️ The same person can hold multiple positions. This is very common in small businesses.'}
      </p>

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

