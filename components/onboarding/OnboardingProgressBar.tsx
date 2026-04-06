'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface OnboardingProgressBarProps {
  currentStep: number; // 1-8
  totalSteps?: number;
}

// =============================================================================
// Step labels
// =============================================================================

const STEP_LABELS_FR = [
  'Langue',
  'Société',
  'Province',
  'Administrateurs',
  'Actionnaires',
  'Dirigeants',
  'Résumé',
  'Exercices',
];

const STEP_LABELS_EN = [
  'Language',
  'Company',
  'Province',
  'Directors',
  'Shareholders',
  'Officers',
  'Summary',
  'Fiscal years',
];

// =============================================================================
// Component
// =============================================================================

export default function OnboardingProgressBar({
  currentStep,
  totalSteps = 8,
}: OnboardingProgressBarProps) {
  const t = useTranslations('onboarding');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';

  const labels = locale === 'fr' ? STEP_LABELS_FR : STEP_LABELS_EN;
  const pct = Math.round(((currentStep - 1) / (totalSteps - 1)) * 100);

  return (
    <div className="w-full max-w-2xl">
      {/* Bar */}
      <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step dots + labels (visible on sm+) */}
      <div className="hidden items-center justify-between sm:flex">
        {labels.slice(0, totalSteps).map((label, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              {/* Dot */}
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  isCompleted
                    ? 'bg-amber-500 text-white'
                    : isActive
                      ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-800'
                      : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : stepNum}
              </div>
              {/* Label */}
              <span
                className={`text-[10px] leading-tight ${
                  isActive
                    ? 'font-semibold text-amber-600 dark:text-amber-400'
                    : isCompleted
                      ? 'text-zinc-500 dark:text-zinc-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: step counter */}
      <div className="flex items-center justify-between sm:hidden">
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          {labels[currentStep - 1]}
        </span>
        <span className="text-xs text-zinc-400">
          {currentStep}/{totalSteps}
        </span>
      </div>
    </div>
  );
}

