'use client'

import React from 'react'

interface WizardProgressBarProps {
  currentStep: number
  locale: 'fr' | 'en'
}

const STEPS_FR = ['Années', 'Lacunes', 'Informations', 'Génération', 'Téléchargement']
const STEPS_EN = ['Years', 'Gaps', 'Information', 'Generation', 'Download']

export function WizardProgressBar({ currentStep, locale }: WizardProgressBarProps) {
  const steps = locale === 'fr' ? STEPS_FR : STEPS_EN

  return (
    <div className="flex items-start mb-8" style={{ width: '100%' }}>
      {steps.map((label, index) => {
        const step = index + 1
        const isDone = step < currentStep
        const isActive = step === currentStep
        const isLast = index === steps.length - 1

        return (
          <React.Fragment key={step}>
            {/* Circle + label — fixed width so labels never shift circles */}
            <div style={{ width: '72px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, zIndex: 1, position: 'relative',
                  backgroundColor: isDone
                    ? 'var(--amber-400)'
                    : isActive
                    ? 'var(--amber-400)'
                    : 'var(--card-border)',
                  outline: '3px solid var(--page-bg)',
                  outlineOffset: '0px',
                }}
              >
                {isDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{
                    fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '11px',
                    color: isActive ? 'var(--cta-text)' : 'var(--text-muted)',
                  }}>
                    {step}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '9px', fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                textAlign: 'center', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: '72px',
              }}>
                {label}
              </span>
            </div>

            {/* Connecting line — vertically centered at circle midpoint (16px from top) */}
            {!isLast && (
              <div style={{
                flex: 1, height: '3px', flexShrink: 1,
                marginTop: '14px', zIndex: 0,
                backgroundColor: isDone ? 'var(--amber-400)' : 'var(--card-border)',
                transition: 'background-color 300ms',
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
