'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ZapLogo } from '@/components/ui/ZapLogo'

interface FiscalYearsSetupProps {
  locale: string
  companyId: string
  savedFiscalYears: { year: number; status: string }[]
  documentYears: number[]
  incorporationDate?: string | null
}

export function FiscalYearsSetup({
  locale,
  companyId,
  savedFiscalYears,
  documentYears,
  incorporationDate,
}: FiscalYearsSetupProps) {
  const router = useRouter()
  const supabase = createClient()
  const fr = locale === 'fr'

  const currentYear = new Date().getFullYear()
  const incorpYear = incorporationDate
    ? new Date(incorporationDate).getFullYear()
    : currentYear - 7
  const startYear = Math.max(incorpYear, currentYear - 7)
  const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i).reverse()

  const defaultSelected = new Set<number>([currentYear, currentYear - 1])
  const initialActive = new Set<number>(
    savedFiscalYears.filter(fy => fy.status === 'active').map(fy => fy.year)
  )
  const [activeYears, setActiveYears] = useState<Set<number>>(
    initialActive.size > 0 ? initialActive : defaultSelected
  )
  const [saving, setSaving] = useState(false)

  const docYearSet = new Set(documentYears)
  const allSelected = years.every(y => activeYears.has(y))

  async function toggleYear(year: number) {
    if (docYearSet.has(year)) return
    const isActive = activeYears.has(year)
    const next = new Set(activeYears)
    if (isActive) {
      next.delete(year)
    } else {
      next.add(year)
    }
    setActiveYears(next)

    const alreadySaved = savedFiscalYears.find(fy => fy.year === year)
    if (alreadySaved) {
      await supabase
        .from('company_fiscal_years')
        .update({ status: isActive ? 'archived' : 'active' })
        .eq('company_id', companyId)
        .eq('year', year)
    } else if (!isActive) {
      await supabase
        .from('company_fiscal_years')
        .upsert({ company_id: companyId, year, status: 'active' })
    }
  }

  function toggleAll() {
    if (allSelected) {
      setActiveYears(new Set())
    } else {
      setActiveYears(new Set(years))
    }
  }

  async function handleStart() {
    setSaving(true)
    // Delete all existing entries then insert only the selected years
    // (intermediate toggles can write stale data — this ensures a clean final state)
    await supabase
      .from('company_fiscal_years')
      .delete()
      .eq('company_id', companyId)
    const inserts = Array.from(activeYears).map(year => ({
      company_id: companyId,
      year,
      status: 'active',
    }))
    if (inserts.length > 0) {
      await supabase.from('company_fiscal_years').insert(inserts)
    }
    router.push(`/${locale}/dashboard`)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[var(--ob-bg)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card-bg)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <ZapLogo size="sm" />
          <span className="text-sm text-[var(--text-muted)]">
            {fr ? 'Configuration des exercices' : 'Fiscal year setup'}
          </span>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1
              className="text-2xl font-bold text-[var(--text-heading)] mb-2"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {fr
                ? 'Quels exercices souhaitez-vous suivre ?'
                : 'Which fiscal years do you want to track?'}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {fr
                ? 'Sélectionnez les exercices fiscaux pour lesquels vous avez des obligations de conformité. Vous pourrez toujours les modifier dans les paramètres.'
                : 'Select the fiscal years for which you have compliance obligations. You can always change this in settings.'}
            </p>
          </div>

          {/* Tout sélectionner / désélectionner */}
          <div className="flex justify-end">
            <button
              onClick={toggleAll}
              className="text-xs font-medium underline"
              style={{ color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {allSelected
                ? (fr ? 'Tout désélectionner' : 'Deselect all')
                : (fr ? 'Tout sélectionner' : 'Select all')}
            </button>
          </div>

          {/* Year list */}
          <div className="space-y-2">
            {years.map(year => {
              const isActive = activeYears.has(year)
              const hasDoc = docYearSet.has(year)
              const isCurrent = year === currentYear
              return (
                <button
                  key={year}
                  onClick={() => toggleYear(year)}
                  disabled={hasDoc}
                  title={
                    hasDoc
                      ? (fr ? 'Des documents existent pour cette année' : 'Documents exist for this year')
                      : undefined
                  }
                  className="w-full text-left rounded-xl p-4 border transition-all"
                  style={{
                    borderColor: isActive ? '#F5B91E' : 'var(--card-border)',
                    backgroundColor: isActive ? '#FFF8E7' : 'var(--card-bg)',
                    opacity: hasDoc ? 0.6 : 1,
                    cursor: hasDoc ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                          borderColor: isActive ? '#F5B91E' : 'var(--neutral-300)',
                          backgroundColor: isActive ? '#F5B91E' : 'transparent',
                        }}
                      >
                        {isActive && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="var(--navy-900)">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span
                        className="font-semibold text-sm"
                        style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
                      >
                        {fr ? `Exercice ${year}` : `Fiscal year ${year}`}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            background: '#F5B91E',
                            color: '#070E1C',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '.06em',
                            textTransform: 'uppercase',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            marginLeft: '4px',
                          }}
                        >
                          {fr ? 'Exercice en cours' : 'Current year'}
                        </span>
                      )}
                    </div>
                    {hasDoc && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#F0F4EE', color: '#2E5425' }}
                      >
                        {fr ? 'Documents existants' : 'Has documents'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Info banner */}
          <div
            className="rounded-lg p-4 flex gap-3"
            style={{ backgroundColor: '#F0F4F8', border: '1px solid #CBD5E5' }}
          >
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="#4A6B93">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs" style={{ color: '#4A6B93' }}>
              {fr
                ? 'Le Wizard de rattrapage vous permettra de générer les résolutions manquantes pour chaque exercice sélectionné.'
                : 'The Catch-Up Wizard will let you generate missing resolutions for each selected fiscal year.'}
            </p>
          </div>

          {/* CTA + Passer */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleStart}
              disabled={saving}
              className="w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
            >
              {saving
                ? (fr ? 'Chargement...' : 'Loading...')
                : (fr ? '⚡ Commencer' : '⚡ Get started')}
            </button>
            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {fr ? 'Passer cette étape' : 'Skip this step'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
