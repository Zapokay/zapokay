'use client';

import { useState, useMemo } from 'react';
import { OnboardingStepLayout } from './OnboardingStepLayout';
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
// Shared styles
// =============================================================================

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
  appearance: 'none',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 500,
  color: 'var(--text-body)', marginBottom: '6px',
};

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

  const fr = locale === 'fr';

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
        <label style={fieldLabelStyle}>
          {label}
          {optional && (
            <span style={{ marginLeft: '4px', fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>
              ({fr ? 'optionnel' : 'optional'})
            </span>
          )}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">
            {fr ? '— Sélectionner —' : '— Select —'}
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

  const briefcaseIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="12" />
      <path d="M12 12h.01" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 6 — DIRIGEANTS' : 'STEP 6 — OFFICERS'}
      icon={briefcaseIcon}
      title={fr ? (
        <>Les dirigeants<br />de votre entreprise</>
      ) : (
        <>Officers<br />of your company</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un dirigeant ?" : 'What is an officer?'}
      tooltipContent={fr
        ? "Le président supervise les affaires. Le secrétaire tient les registres. Souvent, c'est la même personne dans les petites entreprises."
        : 'The president oversees business affairs. The secretary maintains records. Often, this is the same person in small businesses.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <PersonDropdown
          value={presidentName}
          onChange={setPresidentName}
          label={fr ? 'Président·e' : 'President'}
        />

        <PersonDropdown
          value={secretaryName}
          onChange={setSecretaryName}
          label={fr ? 'Secrétaire' : 'Secretary'}
        />

        <PersonDropdown
          value={treasurerName}
          onChange={setTreasurerName}
          label={fr ? 'Trésorier·ière' : 'Treasurer'}
          optional
        />

        {/* Note */}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{display:'inline',verticalAlign:'middle',color:'var(--color-nt-400)',marginRight:'4px'}}>
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 7v5M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {fr
            ? "Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises."
            : 'The same person can hold multiple positions. This is very common in small businesses.'}
        </p>
      </div>
    </OnboardingStepLayout>
  );
}
