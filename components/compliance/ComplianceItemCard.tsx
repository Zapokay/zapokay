'use client'

import { useTranslations } from 'next-intl'
import { EnrichedComplianceItem } from '@/lib/compliance/complianceRules'

interface ComplianceItemCardProps {
  item: EnrichedComplianceItem
  locale: 'fr' | 'en'
  onUploadClick?: () => void
}

// ─── Icônes SVG inline ────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="11" fill="#B8CCAF" />
      <path
        d="M6.5 11.2l3.2 3.2 5.8-6.4"
        stroke="#2E5425"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="10.5" stroke="#FDDB8C" strokeWidth="1.5" fill="#FFF8E7" />
      <path
        d="M11 6.5V11l3 2"
        stroke="#7A5804"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Formatage de la date affichée ───────────────────────────────────────────

function formatDate(dateStr: string | null, locale: 'fr' | 'en'): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function ComplianceItemCard({
  item,
  locale,
  onUploadClick,
}: ComplianceItemCardProps) {
  const t = useTranslations('compliance')
  const title = locale === 'fr' ? item.rule.title_fr : item.rule.title_en
  const dueDateFormatted = formatDate(item.due_date, locale)

  // ── Compliant ──────────────────────────────────────────────────────────────
  if (item.status === 'compliant') {
    return (
      <div
        style={{ borderLeft: '3px solid #B8CCAF', backgroundColor: '#F0F4EE' }}
        className="rounded-xl px-5 py-4 flex items-start gap-3"
      >
        <div className="flex-shrink-0 mt-0.5">
          <IconCheck />
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ fontFamily: "'Sora', sans-serif", color: '#2E5425' }}
          >
            {title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#2E5425', fontFamily: "'DM Sans', sans-serif" }}>
            {t('cardCompliant')} {formatDate(item.lastDocumentDate, locale)}
          </p>
        </div>
      </div>
    )
  }

  // ── Pending ────────────────────────────────────────────────────────────────
  if (item.status === 'pending') {
    const pendingLabel =
      item.daysUntilDue !== null && item.daysUntilDue > 0
        ? t('cardPendingDays', { days: item.daysUntilDue, date: dueDateFormatted })
        : t('cardPendingDate', { date: dueDateFormatted })

    return (
      <div
        style={{ borderLeft: '3px solid #FDDB8C', backgroundColor: '#FFF8E7' }}
        className="rounded-xl px-5 py-4 flex items-start gap-3"
      >
        <div className="flex-shrink-0 mt-0.5">
          <IconClock />
        </div>
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ fontFamily: "'Sora', sans-serif", color: '#070E1C' }}
          >
            {title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#7A5804', fontFamily: "'DM Sans', sans-serif" }}>
            {pendingLabel}
          </p>
        </div>
      </div>
    )
  }

  // ── Required (urgent) ──────────────────────────────────────────────────────
  return (
    <div
      style={{ borderLeft: '3px solid #C9A5A5', backgroundColor: '#F5EEEE' }}
      className="rounded-xl px-5 py-4"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p
          className="text-sm font-bold"
          style={{ fontFamily: "'Sora', sans-serif", color: '#6B1E1E' }}
        >
          {title}
        </p>
        <span
          className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: '#F5B91E',
            color: '#070E1C',
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: 'nowrap',
          }}
        >
          {t('urgentBadge')}
        </span>
      </div>

      <p className="text-xs mb-3" style={{ color: '#6B1E1E', fontFamily: "'DM Sans', sans-serif" }}>
        {t('cardRequired', { date: dueDateFormatted })}
      </p>

      <button
        onClick={onUploadClick}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
        style={{
          borderColor: '#C9A5A5',
          color: '#6B1E1E',
          backgroundColor: 'transparent',
          fontFamily: "'DM Sans', sans-serif",
          cursor: onUploadClick ? 'pointer' : 'default',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F5EEEE'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
        }}
      >
        {t('uploadDocument')}
      </button>
    </div>
  )
}
