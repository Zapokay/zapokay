'use client';

import { OnboardingStepLayout } from './OnboardingStepLayout';
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

  const fr = locale === 'fr';

  const validDirectors = directors.filter((d) => d.fullName.trim());
  const validShareholders = shareholders.filter((s) => s.fullName.trim());
  const hasPresident = !!officers.presidentName;
  const hasSecretary = !!officers.secretaryName;
  const hasTreasurer = !!officers.treasurerName;

  // Build checklist items
  const items: { label: string; done: boolean }[] = [
    {
      label: fr ? 'Entreprise enregistrée' : 'Company registered',
      done: true,
    },
    {
      label: fr
        ? `${validDirectors.length} administrateur${validDirectors.length > 1 ? 's' : ''}`
        : `${validDirectors.length} director${validDirectors.length > 1 ? 's' : ''}`,
      done: validDirectors.length > 0,
    },
    {
      label: fr
        ? `${validShareholders.length} actionnaire${validShareholders.length > 1 ? 's' : ''}`
        : `${validShareholders.length} shareholder${validShareholders.length > 1 ? 's' : ''}`,
      done: validShareholders.length > 0,
    },
    {
      label: fr ? 'Président·e nommé·e' : 'President appointed',
      done: hasPresident,
    },
    {
      label: fr ? 'Secrétaire nommé·e' : 'Secretary appointed',
      done: hasSecretary,
    },
  ];

  if (hasTreasurer) {
    items.push({
      label: fr ? 'Trésorier·ière nommé·e' : 'Treasurer appointed',
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
      continueLabel={fr ? 'Terminer' : 'Finish'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {/* Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.done ? '#F5B91E' : 'var(--page-bg)',
                border: `1px solid ${item.done ? '#F5B91E' : 'var(--ob-incomplete-border)'}`,
              }}>
                {item.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                )}
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: item.done ? 500 : 400,
                color: item.done ? 'var(--text-heading)' : 'var(--text-muted)',
              }}>
                {item.label}
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
