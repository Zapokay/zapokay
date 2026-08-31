'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { computeDefaultActiveYears } from '@/lib/active-years'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'
import LanguageToggle from '@/components/ui/LanguageToggle'

interface FiscalYearsSetupProps {
  locale: string
  companyId: string
  savedFiscalYears: { year: number; status: string }[]
  documentYears: number[]
  incorporationDate?: string | null
  fyEndMonth: number
  fyEndDay: number
}

export function FiscalYearsSetup({
  locale,
  companyId,
  savedFiscalYears,
  documentYears,
  incorporationDate,
  fyEndMonth,
  fyEndDay,
}: FiscalYearsSetupProps) {
  const router = useRouter()
  const supabase = createClient()
  const fr = locale === 'fr'
  const t = useTranslations('onboarding')
  // Même forme qu'à l'étape 5 (StepShareholders) : un second lecteur pour le
  // namespace `common`, où vit la phrase d'échec déjà employée par le produit.
  // Aucune chaîne neuve : `common.saveFailed` est réutilisée telle quelle.
  const tCommon = useTranslations('common')

  // Current fiscal year = the year in which the current fiscal year ENDS
  const now = new Date()
  const fyEndDateThisYear = new Date(now.getFullYear(), fyEndMonth - 1, fyEndDay)
  const currentFiscalYear = now <= fyEndDateThisYear ? now.getFullYear() : now.getFullYear() + 1

  // Rendered list: up to 8 fiscal years capped at incorporation, descending for UI.
  const years = computeDefaultActiveYears(incorporationDate ?? null, fyEndMonth, fyEndDay)
    .slice()
    .reverse()

  const defaultSelected = new Set<number>(years)
  const initialActive = new Set<number>(
    savedFiscalYears.filter(fy => fy.status === 'active').map(fy => fy.year)
  )
  const [activeYears, setActiveYears] = useState<Set<number>>(
    initialActive.size > 0 ? initialActive : defaultSelected
  )
  const [saving, setSaving] = useState(false)
  // ⚠️ CE FICHIER N'AVAIT AUCUN CANAL DE MESSAGE. Deux états seulement —
  // `activeYears` et `saving` — donc rien qui puisse porter un échec, et donc
  // quatre écritures dont l'échec ne pouvait atteindre aucun écran.
  const [saveError, setSaveError] = useState<string | null>(null)

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
    // La valeur d'AVANT, capturée pour pouvoir revenir en arrière. `next` est un
    // Set neuf, donc `previous` garde bien l'ancien contenu.
    const previous = activeYears
    setSaveError(null)
    setActiveYears(next)

    // ⚠️ DEUX CHEMINS D'ÉCHEC, ET COUVRIR L'UN NE COUVRE PAS L'AUTRE.
    // supabase-js RETOURNE { error } sur un échec Postgres et LÈVE sur un échec
    // réseau. Ces deux écritures ne lisaient ni l'un ni l'autre.
    let dbError: unknown = null
    try {
      const alreadySaved = savedFiscalYears.find(fy => fy.year === year)
      if (alreadySaved) {
        const { error } = await supabase
          .from('company_fiscal_years')
          .update({ status: isActive ? 'archived' : 'active' })
          .eq('company_id', companyId)
          .eq('year', year)
        dbError = error
      } else if (!isActive) {
        const { error } = await supabase
          .from('company_fiscal_years')
          .upsert({ company_id: companyId, year, status: 'active' })
        dbError = error
      }
    } catch (err) {
      console.error('[onboarding] fiscal year toggle threw:', err)
      dbError = err
    }

    // ⚠️ LA BASCULE EST ANNULÉE, PAS SEULEMENT SIGNALÉE. Une case laissée dans un
    // état que la base ne porte pas est un mensonge que l'utilisateur emporte
    // jusqu'au tableau de bord — il croit suivre un exercice qui n'existe pas.
    if (dbError) {
      setActiveYears(previous)
      setSaveError(tCommon('saveFailed'))
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
    setSaveError(null)

    let dbError: unknown = null
    try {
      const { error: delErr } = await supabase
        .from('company_fiscal_years')
        .delete()
        .eq('company_id', companyId)
      dbError = delErr
      // ⚠️ L'INSERT NE PART QUE SI LE DELETE A RÉUSSI. Enchaîner sans vérifier
      // ferait reposer les lignes par-dessus celles qu'on croyait effacées.
      if (!dbError) {
        const inserts = Array.from(activeYears).map(year => ({
          company_id: companyId,
          year,
          status: 'active',
        }))
        if (inserts.length > 0) {
          const { error: insErr } = await supabase
            .from('company_fiscal_years')
            .insert(inserts)
          dbError = insErr
        }
      }
    } catch (err) {
      console.error('[onboarding] fiscal years finish threw:', err)
      dbError = err
    }

    // ⚠️ ON NE NAVIGUE QUE SI LES DEUX ONT RÉUSSI. Le DELETE efface TOUS les
    // exercices de la société avant que l'INSERT ne les repose : partir au
    // tableau de bord après un INSERT échoué, c'est annoncer un succès en
    // ouvrant sur une conformité vidée — et douze fichiers lisent cette table.
    // ⚠️ ET `saving` EST RELÂCHÉ ICI, sur le chemin d'échec seulement. Il ne
    // l'était nulle part : c'est ce qui figeait le bouton sur « Chargement… »
    // sans un mot. Sur le succès la navigation démonte, et relâcher ouvrirait
    // une fenêtre d'un rendu où le bouton est cliquable une seconde fois.
    if (dbError) {
      setSaveError(tCommon('saveFailed'))
      setSaving(false)
      return
    }

    router.push(`/${locale}/dashboard`)
    router.refresh()
  }

  // ── Stepper config (labels live in messages/{fr,en}.json under onboarding.stepLabels) ─
  const STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const
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
          <LanguageToggle />
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div style={{ padding: '24px 32px 0', maxWidth: '820px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
          {STEP_NUMBERS.map((sNum, i) => {
            const done = sNum < STEP
            const current = sNum === STEP
            const isLast = i === STEP_NUMBERS.length - 1
            return (
              <React.Fragment key={i}>
                <div style={{ width: '88px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
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
                    maxWidth: '88px', textAlign: 'center',
                  }}>
                    {t(`stepLabels.step${sNum}`)}
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
                const isCurrent = year === currentFiscalYear
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
                          {getFiscalYearLabel(year, locale)}
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
                {t('fiscalYearsCatchUpHint')}
              </p>
            </div>
          </div>

          {/* Message d'échec — même forme que la boîte info ci-dessus, jetons
              --error-* au lieu de --info-*. Les deux triplets sont adaptatifs. */}
          {saveError && (
            <div style={{
              width: '100%', marginBottom: '16px',
              borderRadius: '10px', padding: '12px 14px',
              display: 'flex', gap: '10px',
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p style={{ fontSize: '12px', color: 'var(--error-text)', lineHeight: 1.6 }}>
                {saveError}
              </p>
            </div>
          )}

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
