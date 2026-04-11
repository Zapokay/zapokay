'use client'

import type { FiscalYearInfo } from '../CatchUpWizard'

interface StepYearSelectionProps {
  years: FiscalYearInfo[]
  selected: number[]
  onToggle: (year: number) => void
  onNext: () => void
  locale: 'fr' | 'en'
  noFiscalYearsConfigured?: boolean
  settingsUrl: string
}

export function StepYearSelection({
  years,
  selected,
  onToggle,
  onNext,
  locale,
  noFiscalYearsConfigured = false,
  settingsUrl,
}: StepYearSelectionProps) {
  const fr = locale === 'fr'
  const hasSelection = selected.length > 0

  // No fiscal years configured state
  if (noFiscalYearsConfigured) {
    return (
      <div className="text-center py-10 space-y-4">
        <div style={{ fontSize: '40px' }}>📅</div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
          {fr
            ? 'Aucun exercice financier configuré'
            : 'No fiscal years configured'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)', maxWidth: '320px', margin: '0 auto' }}>
          {fr
            ? 'Configurez vos exercices dans les paramètres pour utiliser le wizard.'
            : 'Configure your fiscal years in settings to use the wizard.'}
        </p>
        <a
          href={settingsUrl}
          className="inline-block px-4 py-2 rounded-lg text-sm font-semibold no-underline"
          style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
        >
          {fr ? 'Configurer mes exercices →' : 'Configure fiscal years →'}
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div
        className="rounded-lg p-4 flex gap-3"
        style={{ backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--warning-text)' }}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
          {fr
            ? 'Seuls les exercices présentant des lacunes documentaires sont affichés. Sélectionnez ceux pour lesquels vous souhaitez générer des résolutions.'
            : 'Only fiscal years with documentation gaps are shown. Select the ones for which you want to generate resolutions.'}
        </p>
      </div>

      {/* Year cards */}
      <div className="space-y-3">
        {years.length === 0 && (
          <div className="text-center py-10">
            <div className="text-3xl mb-3">✓</div>
            <p className="text-sm font-semibold" style={{ color: '#2E5425' }}>
              {fr
                ? 'Tous vos exercices sont complets. Aucune action requise.'
                : 'All your fiscal years are complete. No action needed.'}
            </p>
          </div>
        )}

        {years.map((fy) => {
          const isSelected = selected.includes(fy.year)
          return (
            <button
              key={fy.year}
              onClick={() => onToggle(fy.year)}
              className="w-full text-left rounded-xl p-4 border transition-all"
              style={{
                borderColor: isSelected ? 'var(--warning-border)' : 'var(--card-border)',
                backgroundColor: isSelected ? 'var(--warning-bg)' : 'var(--card-bg)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Checkbox */}
                  <div
                    className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      borderColor: isSelected ? '#F5B91E' : 'var(--neutral-300)',
                      backgroundColor: isSelected ? '#F5B91E' : 'transparent',
                    }}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--navy-900)">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span
                    className="font-semibold text-sm"
                    style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
                  >
                    {fr ? `Exercice ${fy.year}` : `Fiscal year ${fy.year}`}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    ({fy.endDate})
                  </span>
                </div>
                <StatusBadge status={fy.status} fr={fr} />
              </div>

              {/* Missing docs list */}
              {fy.status !== 'complete' && (
                <div className="mt-2 ml-8 flex flex-wrap gap-2">
                  {!fy.hasBoard && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)' }}
                    >
                      {fr ? '✗ Résolution conseil' : '✗ Board resolution'}
                    </span>
                  )}
                  {!fy.hasShareholder && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)' }}
                    >
                      {fr ? '✗ PV actionnaires' : '✗ Shareholder minutes'}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* CTA */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!hasSelection}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
        >
          {fr
            ? `Continuer (${selected.length} exercice${selected.length > 1 ? 's' : ''})`
            : `Continue (${selected.length} year${selected.length > 1 ? 's' : ''})`}
          {' →'}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  fr,
}: {
  status: FiscalYearInfo['status']
  fr: boolean
}) {
  if (status === 'complete') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success-text)' }}
      >
        {fr ? 'Complet' : 'Complete'}
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)' }}
      >
        {fr ? 'Incomplet' : 'Incomplete'}
      </span>
    )
  }
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)' }}
    >
      {fr ? 'Manquant' : 'Missing'}
    </span>
  )
}
