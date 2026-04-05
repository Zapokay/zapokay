'use client'

interface WizardProgressBarProps {
  currentStep: number
  locale: 'fr' | 'en'
}

const STEPS_FR = ['Années', 'Lacunes', 'Informations', 'Génération', 'Téléchargement']
const STEPS_EN = ['Years', 'Gaps', 'Information', 'Generation', 'Download']

export function WizardProgressBar({ currentStep, locale }: WizardProgressBarProps) {
  const steps = locale === 'fr' ? STEPS_FR : STEPS_EN

  return (
    <div className="flex items-start gap-0 mb-8">
      {steps.map((label, index) => {
        const step = index + 1
        const isDone = step < currentStep
        const isActive = step === currentStep

        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: isDone
                    ? 'var(--navy-800)'
                    : isActive
                    ? 'var(--amber-400)'
                    : 'var(--neutral-200)',
                  color: isDone ? 'white' : isActive ? 'var(--navy-900)' : 'var(--neutral-500)',
                }}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step
                )}
              </div>
              <span
                className="text-[10px] font-medium text-center leading-tight px-1"
                style={{ color: isActive ? 'var(--text-heading)' : 'var(--text-muted)' }}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className="h-0.5 flex-1 mx-1 mb-5 transition-colors"
                style={{ backgroundColor: isDone ? 'var(--navy-800)' : 'var(--neutral-200)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
