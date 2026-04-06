'use client';

import { Zap, Check } from 'lucide-react';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';
import type { OnboardingOfficers } from './StepOfficers';

// =============================================================================
// Types
// =============================================================================

interface StepCelebrationProps {
  locale: string;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  officers: OnboardingOfficers;
  onContinue: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function StepCelebration({
  locale,
  directors,
  shareholders,
  officers,
  onContinue,
}: StepCelebrationProps) {

  const validDirectors = directors.filter((d) => d.fullName.trim());
  const validShareholders = shareholders.filter((s) => s.fullName.trim());
  const hasPresident = !!officers.presidentName;
  const hasSecretary = !!officers.secretaryName;
  const hasTreasurer = !!officers.treasurerName;

  // Build checklist items
  const items: { label: string; done: boolean }[] = [
    {
      label: locale === 'fr' ? 'Entreprise enregistrée' : 'Company registered',
      done: true,
    },
    {
      label:
        locale === 'fr'
          ? `${validDirectors.length} administrateur${validDirectors.length > 1 ? 's' : ''}`
          : `${validDirectors.length} director${validDirectors.length > 1 ? 's' : ''}`,
      done: validDirectors.length > 0,
    },
    {
      label:
        locale === 'fr'
          ? `${validShareholders.length} actionnaire${validShareholders.length > 1 ? 's' : ''}`
          : `${validShareholders.length} shareholder${validShareholders.length > 1 ? 's' : ''}`,
      done: validShareholders.length > 0,
    },
    {
      label: locale === 'fr' ? 'Président·e nommé·e' : 'President appointed',
      done: hasPresident,
    },
    {
      label: locale === 'fr' ? 'Secrétaire nommé·e' : 'Secretary appointed',
      done: hasSecretary,
    },
  ];

  if (hasTreasurer) {
    items.push({
      label: locale === 'fr' ? 'Trésorier·ière nommé·e' : 'Treasurer appointed',
      done: true,
    });
  }

  return (
    <div className="w-full max-w-md space-y-8 text-center">
      {/* Icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
        <Zap className="h-8 w-8 text-amber-500" />
      </div>

      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {locale === 'fr'
            ? '⚡ Votre entreprise est configurée !'
            : '⚡ Your company is set up!'}
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {locale === 'fr'
            ? 'Votre registre corporatif est en place.'
            : 'Your corporate register is in place.'}
        </p>
      </div>

      {/* Checklist */}
      <div className="mx-auto max-w-xs space-y-2.5 text-left">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.done
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}
            >
              {item.done ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="text-[10px]">—</span>
              )}
            </div>
            <span
              className={`text-sm ${
                item.done
                  ? 'font-medium text-zinc-700 dark:text-zinc-300'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Subtitle */}
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {locale === 'fr'
          ? 'Prochaine étape : choisissez vos exercices financiers.'
          : 'Next step: choose your fiscal years.'}
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-amber-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
      >
        {locale === 'fr' ? 'Choisir mes exercices →' : 'Choose my fiscal years →'}
      </button>
    </div>
  );
}

