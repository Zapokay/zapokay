'use client';

import { useState } from 'react';
import { OnboardingStepLayout } from './OnboardingStepLayout';

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
// Shared styles
// =============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: '5px',
};

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

  const fr = locale === 'fr';
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
    const valid = directors.filter((d) => d.fullName.trim());
    onContinue(valid.length > 0 ? valid : directors);
  }

  const usersIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 4 — ADMINISTRATEURS' : 'STEP 4 — DIRECTORS'}
      icon={usersIcon}
      title={fr ? (
        <>Qui sont les administrateurs<br />de votre entreprise ?</>
      ) : (
        <>Who are the directors<br />of your company?</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un administrateur ?" : 'What is a director?'}
      tooltipContent={fr
        ? "Les administrateurs supervisent la gestion de l'entreprise. Dans la plupart des petites entreprises, le fondateur est le seul administrateur."
        : 'Directors oversee company management. In most small businesses, the founder is the sole director.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {directors.map((director, index) => (
          <div
            key={index}
            style={{
              borderRadius: '10px',
              border: '1px solid var(--card-border)',
              background: 'var(--page-bg)',
              padding: '14px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {fr ? `Administrateur ${index + 1}` : `Director ${index + 1}`}
              </p>
              {directors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDirector(index)}
                  style={{
                    padding: '4px', borderRadius: '6px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Full name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>
                {fr ? 'Nom complet' : 'Full name'}{' '}
                <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={director.fullName}
                onChange={(e) => updateDirector(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                style={inputStyle}
              />
            </div>

            {/* Date + Resident row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? 'Date de nomination' : 'Appointment date'}
                </label>
                <input
                  type="date"
                  value={director.appointmentDate}
                  onChange={(e) => updateDirector(index, 'appointmentDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={director.isCanadianResident}
                      onChange={(e) => updateDirector(index, 'isCanadianResident', e.target.checked)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div
                      style={{
                        width: '36px', height: '20px', borderRadius: '10px',
                        background: director.isCanadianResident ? '#F5B91E' : 'var(--card-border)',
                        transition: 'background 200ms', cursor: 'pointer',
                      }}
                      onClick={() => updateDirector(index, 'isCanadianResident', !director.isCanadianResident)}
                    />
                    <div
                      style={{
                        position: 'absolute', top: '2px',
                        left: director.isCanadianResident ? '18px' : '2px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: 'white',
                        transition: 'left 200ms',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {fr ? 'Résident canadien' : 'Canadian resident'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        ))}

        {/* Add director button */}
        <button
          type="button"
          onClick={addDirector}
          style={{
            width: '100%', padding: '14px',
            border: '1.5px dashed var(--card-border)',
            borderRadius: '12px',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '14px', fontWeight: 500,
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '4px',
          }}
        >
          <span style={{ color: '#F5B91E', fontSize: '18px', lineHeight: 1 }}>+</span>
          {fr ? 'Ajouter un administrateur' : 'Add a director'}
        </button>
      </div>
    </OnboardingStepLayout>
  );
}
