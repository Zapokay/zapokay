'use client'

import { useState, useCallback } from 'react'
import { WizardProgressBar } from './WizardProgressBar'
import { StepYearSelection } from './steps/StepYearSelection'
import { StepGapAnalysis } from './steps/StepGapAnalysis'
import { StepConfirmInfo } from './steps/StepConfirmInfo'
import { StepGeneration } from './steps/StepGeneration'
import { StepDownload } from './steps/StepDownload'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface FiscalYearInfo {
  year: number
  label: string
  endDate: string    // human-readable for display ("31 décembre 2025")
  endDateIso: string // ISO YYYY-MM-DD for API ("2025-12-31")
  hasBoard: boolean
  hasShareholder: boolean
  status: 'complete' | 'partial' | 'missing'
}

export interface DocToGenerate {
  year: number
  type: 'board' | 'shareholder'
  endDate: string // ISO YYYY-MM-DD for the generate API
}

export interface CompanyInfo {
  companyName: string
  directorName: string
  officerName: string
  officerRole: string
  resolutionDate: string // YYYY-MM-DD
}

export interface GeneratedFile {
  id: string
  title: string
  year: number
  type: string
  fileUrl: string
  storagePath: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CatchUpWizardProps {
  locale: 'fr' | 'en'
  companyId: string
  incorporationType: string
  gapYears: FiscalYearInfo[]
  initialCompanyInfo: CompanyInfo
  initialSelectedYear?: number
  noFiscalYearsConfigured?: boolean
  settingsUrl: string
}

type WizardStep = 1 | 2 | 3 | 4 | 5

// ─── Component ────────────────────────────────────────────────────────────────

export function CatchUpWizard({
  locale,
  companyId,
  incorporationType,
  gapYears,
  initialCompanyInfo,
  initialSelectedYear,
  noFiscalYearsConfigured = false,
  settingsUrl,
}: CatchUpWizardProps) {
  const fr = locale === 'fr'

  const [step, setStep] = useState<WizardStep>(1)
  const [selectedYears, setSelectedYears] = useState<number[]>(
    initialSelectedYear && gapYears.some(y => y.year === initialSelectedYear)
      ? [initialSelectedYear]
      : []
  )
  const [selections, setSelections] = useState<DocToGenerate[]>([])
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(initialCompanyInfo)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([])
  const [error, setError] = useState<string | null>(null)

  // ── Step 1 → 2 ──
  function toggleYear(year: number) {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }

  function goToStep2() {
    // Auto-select all missing docs for selected years
    const auto: DocToGenerate[] = []
    for (const fy of gapYears) {
      if (!selectedYears.includes(fy.year)) continue
      if (!fy.hasBoard) auto.push({ year: fy.year, type: 'board', endDate: fy.endDateIso })
      if (!fy.hasShareholder) auto.push({ year: fy.year, type: 'shareholder', endDate: fy.endDateIso })
    }
    setSelections(auto)
    setStep(2)
  }

  // ── Step 2 → 3 ──
  function toggleDoc(doc: DocToGenerate) {
    setSelections((prev) => {
      const exists = prev.some((s) => s.year === doc.year && s.type === doc.type)
      return exists
        ? prev.filter((s) => !(s.year === doc.year && s.type === doc.type))
        : [...prev, doc]
    })
  }

  // ── Step 3 → 4 ──
  function goToStep4() {
    setError(null)
    setStep(4)
  }

  // ── Step 4 callbacks ──
  function handleSuccess(files: GeneratedFile[]) {
    setGeneratedFiles(files)
    setStep(5)
  }

  function handleError(err: string) {
    setError(err)
    setStep(3)
  }

  // ── Restart ──
  const restart = useCallback(() => {
    setStep(1)
    setSelectedYears([])
    setSelections([])
    setGeneratedFiles([])
    setError(null)
  }, [])

  // ── Step titles ──
  const stepTitles: Record<WizardStep, string> = {
    1: fr ? 'Sélectionnez les exercices' : 'Select fiscal years',
    2: fr ? 'Documents à générer' : 'Documents to generate',
    3: fr ? 'Vérifiez les informations' : 'Review information',
    4: fr ? 'Génération en cours' : 'Generating documents',
    5: fr ? 'Documents prêts' : 'Documents ready',
  }

  return (
    <div>
      {/* Page heading — outside max-w-2xl to align with other pages */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-heading)]" style={{ fontFamily: 'Sora, sans-serif' }}>
          {fr ? 'Assistant de rattrapage' : 'Catch-Up Wizard'}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {fr ? 'Génération automatique de résolutions' : 'Automatic resolution generation'}
        </p>
      </div>

    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <WizardProgressBar currentStep={step} locale={locale} />

      {/* Card */}
      <div
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-md overflow-hidden"
      >
        {/* Card header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--card-border)]">
          <h2
            className="text-base font-bold"
            style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
          >
            {stepTitles[step]}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {fr ? `Étape ${step} sur 5` : `Step ${step} of 5`}
          </p>
        </div>

        {/* Error banner (shown above step content when error occurred) */}
        {error && (
          <div
            className="mx-6 mt-5 rounded-lg p-4 flex gap-3"
            style={{ backgroundColor: 'var(--error-bg)', border: '1px solid var(--error-border)' }}
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="var(--error-text)">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm" style={{ color: 'var(--error-text)' }}>
              {error}
            </p>
          </div>
        )}

        {/* Step content */}
        <div className="p-6">
          {step === 1 && (
            <StepYearSelection
              years={gapYears}
              selected={selectedYears}
              onToggle={toggleYear}
              onNext={goToStep2}
              locale={locale}
              noFiscalYearsConfigured={noFiscalYearsConfigured}
              settingsUrl={settingsUrl}
            />
          )}

          {step === 2 && (
            <StepGapAnalysis
              years={gapYears}
              selectedYears={selectedYears}
              selections={selections}
              onToggle={toggleDoc}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
              locale={locale}
            />
          )}

          {step === 3 && (
            <StepConfirmInfo
              info={companyInfo}
              onChange={setCompanyInfo}
              onNext={goToStep4}
              onBack={() => setStep(2)}
              locale={locale}
            />
          )}

          {step === 4 && (
            <StepGeneration
              companyId={companyId}
              incorporationType={incorporationType}
              selections={selections}
              confirmedInfo={companyInfo}
              locale={locale}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          )}

          {step === 5 && (
            <StepDownload
              files={generatedFiles}
              locale={locale}
              onRestart={restart}
            />
          )}
        </div>
      </div>

      {/* Legal disclaimer */}
      <p
        className="text-center text-xs mt-6 px-4"
        style={{ color: 'var(--text-muted)' }}
      >
        {fr
          ? 'Les documents générés sont fournis à titre indicatif et ne constituent pas un avis juridique. Consultez un professionnel pour valider leur conformité.'
          : 'Generated documents are provided for reference purposes only and do not constitute legal advice. Consult a professional to validate their compliance.'}
      </p>
    </div>
    </div>
  )
}
