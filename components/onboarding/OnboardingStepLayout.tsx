'use client';
import React, { useState } from 'react';

interface OnboardingStepLayoutProps {
  stepLabel: string;
  icon: React.ReactNode;
  title: string | React.ReactNode;
  tooltip?: string;
  tooltipContent?: string;
  onSkip?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  skipLabel?: string;
  saving?: boolean;
  continueDisabled?: boolean;
  children: React.ReactNode;
  locale: string;
  extraAboveCard?: React.ReactNode;
}

export function OnboardingStepLayout({
  stepLabel, icon, title, tooltip, tooltipContent, onSkip, onContinue, continueLabel, skipLabel,
  saving, continueDisabled, children, locale, extraAboveCard,
}: OnboardingStepLayoutProps) {
  const fr = locale === 'fr';
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>

      {/* Step icon — 56x56 */}
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: 'rgba(245,185,30,0.20)',
        border: '1px solid rgba(245,185,30,0.50)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px',
        color: '#C4900A',
      }}>
        {icon}
      </div>

      {/* Step label */}
      <p style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#C4900A', opacity: 1,
        textAlign: 'center', marginBottom: '10px',
      }}>
        {stepLabel}
      </p>

      {/* Main title */}
      <h1 style={{
        fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '28px',
        color: 'var(--text-heading)', textAlign: 'center', lineHeight: 1.25,
        marginBottom: tooltip ? '10px' : '24px',
      }}>
        {title}
      </h1>

      {/* Tooltip trigger + popup */}
      {tooltip && (
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '24px' }}>
          <button
            type="button"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={() => setShowTooltip(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', color: '#C4900A',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 0',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            {tooltip}
          </button>

          {showTooltip && tooltipContent && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
              transform: 'translateX(-50%)',
              width: '280px', zIndex: 50,
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '12px 14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              fontSize: '13px', color: 'var(--text-body)',
              lineHeight: 1.6, textAlign: 'left',
            }}>
              {tooltipContent}
            </div>
          )}
        </div>
      )}

      {extraAboveCard}

      {/* Form card */}
      <div style={{
        width: '100%', maxWidth: '560px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '20px',
      }}>
        {children}
      </div>

      {/* Actions */}
      <div style={{
        width: '100%', maxWidth: '560px',
        display: 'flex', alignItems: 'center',
        justifyContent: onSkip ? 'space-between' : 'flex-end',
      }}>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              fontSize: '14px', color: 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
            }}
          >
            {skipLabel ?? (fr ? 'Passer' : 'Skip')}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={saving || continueDisabled}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#F5B91E', color: '#1C1A17',
            fontSize: '15px', fontWeight: 700,
            padding: '13px 32px', borderRadius: '10px',
            border: 'none',
            cursor: (saving || continueDisabled) ? 'not-allowed' : 'pointer',
            opacity: (saving || continueDisabled) ? 0.5 : 1,
            transition: 'opacity 150ms',
          }}
        >
          {continueLabel ?? (fr ? 'Continuer' : 'Continue')}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
