'use client'

import Link from 'next/link'
import { useLocale } from 'next-intl'
import ComplianceGauge from './ComplianceGauge'
import ComplianceItemCard from './ComplianceItemCard'
import ComplianceUploadRedirect from './ComplianceUploadRedirect'
import FiscalYearForm from './FiscalYearForm'
import type { EnrichedComplianceItem } from '@/lib/compliance/complianceRules'

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
}

interface ComplianceClientProps {
  locale: 'fr' | 'en'
  companyId: string
  // Computed compliance data
  items: EnrichedComplianceItem[]
  percentage: number
  compliantCount: number
  pendingCount: number
  urgentCount: number
  needsFiscalYear: boolean
  // Display strings
  fyLabel: string
  yearLabel: string
  contentSubtitle: string
  // Banners
  fiscalYearsConfigured: boolean
  hasFiscalYearConfig: boolean
  // Translations (passed from server to avoid duplicating getTranslations)
  t: {
    missingFiscalYear: string
    emptyTitle: string
    emptyDescription: string
    uploadDocument: string
    sectionRequired: string
    sectionPending: string
    sectionCompliant: string
  }
}

export function ComplianceClient({
  locale,
  companyId,
  items,
  percentage,
  compliantCount,
  pendingCount,
  urgentCount,
  needsFiscalYear,
  fyLabel,
  contentSubtitle,
  fiscalYearsConfigured,
  hasFiscalYearConfig,
  t,
}: ComplianceClientProps) {
  const currentLocale = useLocale()
  const fr = currentLocale === 'fr'

  const requiredItems  = items.filter(i => i.status === 'required')
  const pendingItems   = items.filter(i => i.status === 'pending')
  const compliantItems = items.filter(i => i.status === 'compliant')

  const hasAnyItems  = items.length > 0
  const isEmptyState = !hasAnyItems && !needsFiscalYear
  const total        = items.length

  return (
    <div>
      {/* ── Bannière exercices non configurés ────────────────────────────── */}
      {!fiscalYearsConfigured && (
        <div style={{
          background: 'var(--error-bg)',
          border: '1px solid var(--error-border)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: 700, color: 'var(--error-text)', marginBottom: '2px' }}>
                {fr ? 'Exercices financiers non configurés' : 'Fiscal years not configured'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--error-text)', opacity: 0.8 }}>
                {fr
                  ? 'Configurez vos exercices pour activer le suivi de conformité.'
                  : 'Configure your fiscal years to activate compliance tracking.'}
              </div>
            </div>
          </div>
          <a
            href={`/${locale}/dashboard/settings`}
            style={{ background: 'var(--error-text)', color: 'var(--card-bg)', fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: '16px' }}
          >
            {fr ? 'Configurer →' : 'Configure →'}
          </a>
        </div>
      )}

      {/* ── Bandeau warning fin d'exercice manquante ──────────────────────── */}
      {fiscalYearsConfigured && !hasFiscalYearConfig && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid var(--warning-border)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--warning-text)' }}>
            ⚠️ {fr
              ? "Configurez votre fin d'exercice fiscal pour activer le suivi de conformité."
              : 'Configure your fiscal year end to activate compliance tracking.'}
          </span>
          <a
            href={`/${locale}/dashboard/settings`}
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warning-text)', textDecoration: 'underline' }}
          >
            {fr ? 'Paramètres →' : 'Settings →'}
          </a>
        </div>
      )}

      {/* ── En-tête de contenu ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h1
          className="text-2xl font-bold text-[var(--text-heading)]"
          style={{ fontFamily: 'Sora, sans-serif' }}
        >
          {fr ? 'Suivi de conformité' : 'Compliance tracker'}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {contentSubtitle}
        </p>
      </div>

      {/* ── Bandeau fiscal year manquant ───────────────────────────────────── */}
      {needsFiscalYear && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 20px',
              borderRadius: '12px',
              backgroundColor: '#1C1A17',
              color: 'white',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}>
              {t.missingFiscalYear}
            </p>
          </div>
          <FiscalYearForm companyId={companyId} locale={locale} />
        </div>
      )}

      {/* ── Ligne du haut : Jauge + Résumé ────────────────────────────────── */}
      {!needsFiscalYear && hasAnyItems && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: '16px',
          marginBottom: '24px',
        }}>
          {/* Carte jauge */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <ComplianceGauge percentage={percentage} size={120} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {fr ? `Exercice ${fyLabel}` : `Fiscal year ${fyLabel}`}
            </p>
          </div>

          {/* Carte résumé */}
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '14px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '12px',
          }}>
            <h3 style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              marginBottom: '4px',
            }}>
              {fr ? 'Résumé' : 'Summary'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12l3 3 5-5" />
                </svg>
                <span style={{ fontSize: '13px', color: 'var(--success-text)' }}>{fr ? 'Complétés' : 'Completed'}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success-text)' }}>{compliantCount}/{total}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6" />
                  <path d="M12 16h.01" />
                </svg>
                <span style={{ fontSize: '13px', color: 'var(--warning-text)' }}>{fr ? 'En attente' : 'Pending'}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warning-text)' }}>{pendingCount}/{total}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
                <span style={{ fontSize: '13px', color: 'var(--error-text)' }}>{fr ? 'À corriger' : 'To fix'}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--error-text)' }}>{urgentCount}/{total}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── État vide total ────────────────────────────────────────────────── */}
      {isEmptyState && (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', borderRadius: '50%',
            backgroundColor: '#EEF1F7', marginBottom: '20px',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M16 4a12 12 0 100 24A12 12 0 0016 4zm0 5v7m0 4h.01"
                stroke="#4A6B93" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: '18px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
            {t.emptyTitle}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '360px', margin: '0 auto 24px' }}>
            {t.emptyDescription}
          </p>
          <Link
            href={`/${locale}/dashboard/documents`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '8px',
              fontWeight: 600, fontSize: '14px',
              backgroundColor: '#F5B91E', color: '#070E1C',
              fontFamily: "'DM Sans', sans-serif", textDecoration: 'none',
            }}
          >
            {t.uploadDocument}
          </Link>
        </div>
      )}

      {/* ── Sections items ─────────────────────────────────────────────────── */}
      {hasAnyItems && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {requiredItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: 'var(--error-text)' }}>
                {t.sectionRequired} ({requiredItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {requiredItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}
          {pendingItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: 'var(--warning-text)' }}>
                {t.sectionPending} ({pendingItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}
          {compliantItems.length > 0 && (
            <div>
              <h3 style={{ ...sectionTitleStyle, color: 'var(--success-text)' }}>
                {t.sectionCompliant} ({compliantItems.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {compliantItems.map(item => (
                  <ComplianceItemCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}
          {requiredItems.length > 0 && (
            <div>
              <ComplianceUploadRedirect locale={locale} label={t.uploadDocument} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
