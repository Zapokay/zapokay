'use client';

import { useState } from 'react';
import { OnboardingStepLayout } from './OnboardingStepLayout';
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

export default function StepShareholders({
  locale,
  directors,
  incorporationDate = '',
  initialShareholders,
  onContinue,
  onSkip,
}: StepShareholdersProps) {

  const fr = locale === 'fr';
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

  const pieChartIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 5 — ACTIONNAIRES' : 'STEP 5 — SHAREHOLDERS'}
      icon={pieChartIcon}
      title={fr ? (
        <>Qui détient des actions<br />de votre entreprise ?</>
      ) : (
        <>Who holds shares<br />in your company?</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un actionnaire ?" : 'What is a shareholder?'}
      tooltipContent={fr
        ? "Les actionnaires possèdent l'entreprise. Si vous êtes le seul propriétaire, ajoutez-vous avec le nombre d'actions émises."
        : 'Shareholders own the company. If you are the sole owner, add yourself with the number of shares issued.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
      extraAboveCard={
        <div style={{
          width: '100%', maxWidth: '560px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            borderRadius: '20px', background: 'var(--page-bg)',
            border: '1px solid var(--card-border)',
            padding: '5px 12px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)',
          }}>
            <span style={{ color: '#22c55e' }}>✓</span>
            {fr ? "Classe d'actions par défaut : Actions ordinaires" : 'Default share class: Common Shares'}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {shareholders.map((shareholder, index) => (
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
                {fr ? `Actionnaire ${index + 1}` : `Shareholder ${index + 1}`}
              </p>
              {shareholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareholder(index)}
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

            {/* Name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>
                {fr ? 'Nom' : 'Name'} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={shareholder.fullName}
                onChange={(e) => updateShareholder(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                style={inputStyle}
              />
            </div>

            {/* Shares + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Nombre d'actions" : 'Number of shares'}
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
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Date d'émission" : 'Issue date'}
                </label>
                <input
                  type="date"
                  value={shareholder.issueDate}
                  onChange={(e) => updateShareholder(index, 'issueDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add shareholder button */}
        <button
          type="button"
          onClick={addShareholder}
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
          {fr ? 'Ajouter un actionnaire' : 'Add a shareholder'}
        </button>
      </div>
    </OnboardingStepLayout>
  );
}
