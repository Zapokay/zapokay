'use client'

import { useEffect } from 'react'
import type { FiscalYearInfo, DocToGenerate } from '../CatchUpWizard'

interface StepGapAnalysisProps {
  years: FiscalYearInfo[]
  selectedYears: number[]
  selections: DocToGenerate[]
  onToggle: (doc: DocToGenerate) => void
  onNext: () => void
  onBack: () => void
  locale: 'fr' | 'en'
}

export function StepGapAnalysis({
  years,
  selectedYears,
  selections,
  onToggle,
  onNext,
  onBack,
  locale,
}: StepGapAnalysisProps) {
  const fr = locale === 'fr'
  const filteredYears = years.filter((y) => selectedYears.includes(y.year))
  const totalToGenerate = selections.length

  // Debug log — vérifie quels docs sont présents par exercice
  useEffect(() => {
    for (const fy of filteredYears) {
      console.log('[WizardGap] docs présents pour', fy.year, ':', {
        board: fy.hasBoard ? '✅ résolution conseil' : '❌ manquant',
        shareholder: fy.hasShareholder ? '✅ PV actionnaires' : '❌ manquant',
      })
    }
  }, [filteredYears])

  function isSelected(year: number, type: 'board' | 'shareholder') {
    return selections.some((s) => s.year === year && s.type === type)
  }

  function makeDoc(fy: FiscalYearInfo, type: 'board' | 'shareholder'): DocToGenerate {
    return { year: fy.year, type, endDate: fy.endDateIso }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: 'var(--text-body)' }}>
        {fr
          ? 'Documents détectés pour les exercices sélectionnés. Les documents manquants (❌) seront générés — décochez ceux que vous souhaitez exclure.'
          : 'Documents detected for the selected years. Missing documents (❌) will be generated — uncheck any you want to exclude.'}
      </p>

      <div className="space-y-4">
        {filteredYears.map((fy) => (
          <div
            key={fy.year}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden"
          >
            {/* Year header */}
            <div
              className="px-4 py-3 border-b border-[var(--card-border)]"
              style={{ backgroundColor: 'var(--neutral-50)' }}
            >
              <span
                className="text-sm font-bold"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
              >
                {fr ? `Exercice ${fy.year}` : `Fiscal year ${fy.year}`}
              </span>
              <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                — {fy.endDate}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {/* Board resolution — always shown */}
              {fy.hasBoard ? (
                <PresentDoc
                  label={fr ? "Résolution du conseil d'administration" : "Board of directors resolution"}
                  fr={fr}
                />
              ) : (
                <DocCheckbox
                  label={fr ? "Résolution du conseil d'administration" : "Board of directors resolution"}
                  description={
                    fr
                      ? 'Approuve les états financiers et ratifie les actes de gestion'
                      : 'Approves financial statements and ratifies management acts'
                  }
                  checked={isSelected(fy.year, 'board')}
                  onChange={() => onToggle(makeDoc(fy, 'board'))}
                />
              )}

              {/* Shareholder resolution — always shown */}
              {fy.hasShareholder ? (
                <PresentDoc
                  label={fr ? 'Procès-verbal des actionnaires' : "Shareholders' meeting minutes"}
                  fr={fr}
                />
              ) : (
                <DocCheckbox
                  label={fr ? 'Procès-verbal des actionnaires' : "Shareholders' meeting minutes"}
                  description={
                    fr
                      ? 'Assemblée annuelle des actionnaires (résolution écrite)'
                      : 'Annual general meeting of shareholders (written resolution)'
                  }
                  checked={isSelected(fy.year, 'shareholder')}
                  onChange={() => onToggle(makeDoc(fy, 'shareholder'))}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors"
          style={{
            borderColor: 'var(--neutral-200)',
            color: 'var(--text-body)',
            backgroundColor: 'transparent',
          }}
        >
          ← {fr ? 'Retour' : 'Back'}
        </button>
        <button
          onClick={onNext}
          disabled={totalToGenerate === 0}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
        >
          {fr
            ? `Vérifier les infos (${totalToGenerate} doc${totalToGenerate > 1 ? 's' : ''})`
            : `Review info (${totalToGenerate} doc${totalToGenerate > 1 ? 's' : ''})`}
          {' →'}
        </button>
      </div>
    </div>
  )
}

// ── Present doc indicator (locked, ✅) ────────────────────────────────────────

function PresentDoc({ label, fr }: { label: string; fr: boolean }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{
        border: '1px solid #B8CCAF',
        backgroundColor: '#F0F4EE',
      }}
    >
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#2E5425' }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium" style={{ color: '#2E5425' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: '#2E5425', opacity: 0.7 }}>
          {fr ? 'Document déjà présent dans le coffre-fort' : 'Document already present in the vault'}
        </div>
      </div>
    </div>
  )
}

// ── Missing doc checkbox ──────────────────────────────────────────────────────

function DocCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="w-full text-left flex items-start gap-3 p-3 rounded-lg transition-colors"
      style={{
        border: '1px solid',
        borderColor: checked ? '#F5B91E' : 'var(--neutral-200)',
        backgroundColor: checked ? '#FFF8E7' : 'transparent',
      }}
    >
      <div
        className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
        style={{
          borderColor: checked ? '#F5B91E' : 'var(--neutral-300)',
          backgroundColor: checked ? '#F5B91E' : 'transparent',
        }}
      >
        {checked && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--navy-900)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {description}
        </div>
      </div>
    </button>
  )
}
