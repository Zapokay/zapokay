'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  // ── Stepper config (same as OnboardingFlow) ───────────────────────────────
  const stepConfig = [
    { labelFr: 'Langue',   labelEn: 'Language' },
    { labelFr: 'Société',  labelEn: 'Company' },
    { labelFr: 'Province', labelEn: 'Province' },
    { labelFr: 'Admin.',   labelEn: 'Directors' },
    { labelFr: 'Action.',  labelEn: 'Shares' },
    { labelFr: 'Dirig.',   labelEn: 'Officers' },
    { labelFr: 'Sommaire', labelEn: 'Summary' },
    { labelFr: 'Fiscal',   labelEn: 'Fiscal' },
  ]
  const STEP = 8
  const AMBER = '#F5B91E'
  const PAGE = 'var(--page-bg)'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>

      {/* ─── Header ─── */}
      <header style={{
        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
      }}>
        {/* Left: Z tag + ZapOkay signature */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '6px', background: '#1C1A17', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '18px', color: '#F5B91E', lineHeight: 1 }}>Z</span>
            <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#F5B91E', border: '1.5px solid var(--page-bg)' }} />
          </div>
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '14px', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#F5B91E' }}>Zap</span>
            <span style={{ color: 'var(--wm-okay)' }}>Okay</span>
          </span>
        </div>

        {/* Right: Aide + FR/EN toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="#" style={{ fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {fr ? 'Aide' : 'Help'}
          </a>
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['fr', 'en'] as const).map(lang => (
              <a
                key={lang}
                href={`/${lang}/onboarding/fiscal-years`}
                style={{
                  padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                  borderRadius: '5px', border: '1px solid #E6E4DE',
                  cursor: 'pointer', transition: 'all 120ms',
                  background: locale === lang ? '#1C1A17' : 'white',
                  color: locale === lang ? 'white' : '#7A7066',
                  textDecoration: 'none',
                }}
              >
                {lang.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div style={{ padding: '24px 32px 0', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
          {stepConfig.map((sc, i) => {
            const sNum = i + 1
            const done = sNum < STEP
            const current = sNum === STEP
            const isLast = i === stepConfig.length - 1
            return (
              <React.Fragment key={i}>
                <div style={{ width: '56px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: done || current ? AMBER : 'var(--ob-circle-todo-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    outline: `3px solid ${PAGE}`,
                    outlineOffset: '0px',
                    flexShrink: 0,
                    zIndex: 1, position: 'relative',
                  }}>
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span style={{
                        fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '11px',
                        color: current ? 'white' : 'var(--ob-circle-todo-text)',
                      }}>{sNum}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '9px', fontWeight: current ? 700 : 400,
                    color: current ? 'var(--ob-label-active)' : 'var(--ob-label-done)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: '56px', textAlign: 'center',
                  }}>
                    {fr ? sc.labelFr : sc.labelEn}
                  </span>
                </div>
                {!isLast && (
                  <div style={{
                    flex: 1, height: '4px', flexShrink: 1,
                    marginTop: '14px',
                    zIndex: 0,
                    background: done ? AMBER : 'var(--ob-track-bg)',
                    transition: 'background 300ms',
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ─── Main content ─── */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 24px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Step icon — 56x56 */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'rgba(245,185,30,0.20)',
            border: '1px solid rgba(245,185,30,0.50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '16px',
            color: '#C4900A',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
            </svg>
          </div>

          {/* Step label */}
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#C4900A',
            textAlign: 'center', marginBottom: '10px',
          }}>
            {fr ? 'ÉTAPE 8 — EXERCICES FINANCIERS' : 'STEP 8 — FISCAL YEARS'}
          </p>

          {/* Title */}
          <h1 style={{
            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '28px',
            color: 'var(--text-heading)', textAlign: 'center', lineHeight: 1.25,
            marginBottom: '24px',
          }}>
            {fr
              ? <>Quels exercices souhaitez-<br />vous suivre ?</>
              : <>Which fiscal years do you<br />want to track?</>}
          </h1>

          {/* Form card */}
          <div style={{
            width: '100%',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            marginBottom: '20px',
          }}>
            {/* Select all toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                onClick={toggleAll}
                style={{
                  fontSize: '12px', fontWeight: 500, color: '#C4900A',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textDecoration: 'underline', padding: 0,
                }}
              >
                {allSelected
                  ? (fr ? 'Tout désélectionner' : 'Deselect all')
                  : (fr ? 'Tout sélectionner' : 'Select all')}
              </button>
            </div>

            {/* Year list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                    style={{
                      width: '100%', textAlign: 'left',
                      borderRadius: '10px', padding: '12px 14px',
                      border: `1px solid ${isActive ? 'var(--warning-border)' : 'var(--card-border)'}`,
                      backgroundColor: isActive ? 'var(--warning-bg)' : 'var(--page-bg)',
                      opacity: hasDoc ? 0.6 : 1,
                      cursor: hasDoc ? 'not-allowed' : 'pointer',
                      transition: 'border-color 150ms, background-color 150ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '4px',
                          border: `2px solid ${isActive ? '#F5B91E' : 'var(--card-border)'}`,
                          backgroundColor: isActive ? '#F5B91E' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'all 150ms',
                        }}>
                          {isActive && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)' }}>
                          {fr ? `Exercice ${year}` : `Fiscal year ${year}`}
                        </span>
                        {isCurrent && (
                          <span style={{
                            background: '#F5B91E', color: '#1C1A17',
                            fontSize: '10px', fontWeight: 800,
                            letterSpacing: '.06em', textTransform: 'uppercase',
                            padding: '2px 8px', borderRadius: '20px',
                          }}>
                            {fr ? 'Exercice en cours' : 'Current year'}
                          </span>
                        )}
                      </div>
                      {hasDoc && (
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                          backgroundColor: 'var(--success-bg)', color: 'var(--success-text)',
                          border: '1px solid var(--success-border)',
                        }}>
                          {fr ? 'Documents existants' : 'Has documents'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Info banner */}
            <div style={{
              marginTop: '16px', borderRadius: '10px', padding: '12px 14px',
              display: 'flex', gap: '10px',
              background: 'var(--info-bg)', border: '1px solid var(--info-border)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <p style={{ fontSize: '12px', color: 'var(--info-text)', lineHeight: 1.6 }}>
                {fr
                  ? 'Le Wizard de rattrapage vous permettra de générer les résolutions manquantes pour chaque exercice sélectionné.'
                  : 'The Catch-Up Wizard will let you generate missing resolutions for each selected fiscal year.'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              style={{
                fontSize: '14px', color: 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
              }}
            >
              {fr ? 'Passer' : 'Skip'}
            </button>
            <button
              onClick={handleStart}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#F5B91E', color: '#1C1A17',
                fontSize: '15px', fontWeight: 700,
                padding: '13px 32px', borderRadius: '10px',
                border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'opacity 150ms',
              }}
            >
              {saving ? (fr ? 'Chargement...' : 'Loading...') : (fr ? 'Terminer' : 'Finish')}
              {!saving && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
