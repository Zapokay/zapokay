'use client';

import { OnboardingStepLayout } from './OnboardingStepLayout';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';
import type { OnboardingOfficers } from './StepOfficers';
import type { IncorporationType } from '@/lib/types';
import IntlMessageFormat from 'intl-messageformat';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

// =============================================================================
// Types
// =============================================================================

interface StepCelebrationProps {
  locale: string;
  companyName: string;
  incorporationType: IncorporationType;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  officers: OnboardingOfficers;
  onContinue: () => void;
}

// =============================================================================
// i18n helper — formats ICU MessageFormat strings against the active locale.
// Used here (instead of next-intl's useTranslations) because OnboardingFlow's
// activeLocale (data.language) can diverge from the URL locale that
// useTranslations reads. See project_onboarding_dual_locale memory.
// =============================================================================

function formatMsg(
  locale: string,
  path: string,
  params: Record<string, string | number> = {}
): string {
  const messages = locale === 'fr' ? frMessages : enMessages;
  const template = path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    messages
  );
  if (typeof template !== 'string') return path;
  return new IntlMessageFormat(template, locale).format(params) as string;
}

// Counts 1–4 show all names; 5+ shows first 3 + "et N autres" / "and N more".
function joinNames(names: string[], locale: string): string {
  if (names.length <= 4) return names.join(', ');
  const firstThree = names.slice(0, 3).join(', ');
  return formatMsg(locale, 'onboarding.summary.andMore', {
    first: firstThree,
    count: names.length - 3,
  });
}

// =============================================================================
// Component
// =============================================================================

export default function StepCelebration({
  locale,
  companyName,
  incorporationType,
  directors,
  shareholders,
  officers,
  onContinue,
}: StepCelebrationProps) {

  const fr = locale === 'fr';

  const validDirectors = directors.filter((d) => d.fullName.trim());
  const validShareholders = shareholders.filter((s) => s.fullName.trim());

  // Build summary lines per Bundle B Fix 3: medium-detail per category.
  const lines: { text: string; done: boolean }[] = [];

  // Company line — always rendered (company is saved at Step 3).
  lines.push({
    text: formatMsg(locale, 'onboarding.summary.company', {
      companyName,
      incorporationType,
    }),
    done: true,
  });

  // Directors line — count always; names appended only when count > 0.
  {
    const count = validDirectors.length;
    let text = formatMsg(locale, 'onboarding.summary.directorsCount', { count });
    if (count > 0) {
      text += formatMsg(locale, 'onboarding.summary.directorsNames', {
        names: joinNames(validDirectors.map((d) => d.fullName.trim()), locale),
      });
    }
    lines.push({ text, done: count > 0 });
  }

  // Shareholders line — count always; names appended only when count > 0.
  {
    const count = validShareholders.length;
    let text = formatMsg(locale, 'onboarding.summary.shareholdersCount', { count });
    if (count > 0) {
      text += formatMsg(locale, 'onboarding.summary.shareholdersNames', {
        names: joinNames(validShareholders.map((s) => s.fullName.trim()), locale),
      });
    }
    lines.push({ text, done: count > 0 });
  }

  // Officers — one line per assigned role; omit lines for unassigned roles.
  if (officers.presidentName.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerPresident', {
        name: officers.presidentName.trim(),
      }),
      done: true,
    });
  }
  if (officers.secretaryName.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerSecretary', {
        name: officers.secretaryName.trim(),
      }),
      done: true,
    });
  }
  if (officers.treasurerName.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerTreasurer', {
        name: officers.treasurerName.trim(),
      }),
      done: true,
    });
  }

  const clipboardIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 7 — SOMMAIRE' : 'STEP 7 — SUMMARY'}
      icon={clipboardIcon}
      title={fr ? 'Votre entreprise est prête !' : 'Your company is ready!'}
      locale={locale}
      onContinue={onContinue}
      // Fix 2: continueLabel omitted → layout default "Continuer/Continue".
      // Step 7 is mid-flow (Step 8 / Fiscal Years follows), so "Terminer" was misleading.
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {/* Summary lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: line.done ? '#F5B91E' : 'var(--page-bg)',
                border: `1px solid ${line.done ? '#F5B91E' : 'var(--ob-incomplete-border)'}`,
              }}>
                {line.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                )}
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: line.done ? 500 : 400,
                color: line.done ? 'var(--text-heading)' : 'var(--text-muted)',
                lineHeight: 1.4,
              }}>
                {line.text}
              </span>
            </div>
          ))}
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: '13px', color: 'var(--text-secondary)',
          textAlign: 'center', paddingTop: '12px',
          borderTop: '1px solid var(--card-border)',
        }}>
          {fr
            ? 'Prochaine étape : choisissez vos exercices financiers.'
            : 'Next step: choose your fiscal years.'}
        </p>
      </div>
    </OnboardingStepLayout>
  );
}
