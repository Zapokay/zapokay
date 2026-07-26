'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import BinderSection from './BinderSection'
import RegisterCard from './RegisterCard'

/**
 * `key` is narrowed to the nine section keys so `tBinder(\`sections.${section.key}\`)`
 * resolves against minuteBook.binder.sections instead of widening to `string`.
 *
 * ⚠️ THIS IS AN ASSERTION ABOUT API DATA, NOT A DERIVATION. The values arrive as JSON
 * from /api/minute-book/binder, so TypeScript cannot prove them — the union simply
 * mirrors the literal SECTIONS list in that route. It is defensible because that list
 * lives in this repo, but if a section key is ever added there, it must be added HERE
 * and to messages/*.json, and nothing will fail at compile time to remind you.
 */
type SectionKey =
  | 'statuts' | 'avis' | 'reglements' | 'resolutions' | 'administrateurs'
  | 'dirigeants' | 'actionnaires' | 'registres' | 'autres'

interface Section {
  key: SectionKey
  title_fr: string
  documents: any[]
  count: number
}

export default function BinderView() {
  const t = useTranslations('minuteBook.registers')
  // Section headings — route (b): localized via key-map off section.key (the
  // binder API still ships title_fr, but display reads the i18n catalog).
  // Document/requirement NAMES inside sections stay FR legal (untouched).
  const tBinder = useTranslations('minuteBook.binder')
  const locale = useLocale()
  const [sections, setSections] = useState<Section[]>([])
  const [directors, setDirectors] = useState<any>(null)
  const [officers, setOfficers] = useState<any>(null)
  const [shareholders, setShareholders] = useState<any>(null)
  const [statedCapital, setStatedCapital] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [binderRes, dirRes, offRes, shRes, scRes] = await Promise.all([
          fetch('/api/minute-book/binder?scope=finalized'),
          fetch('/api/registers/directors'),
          fetch('/api/registers/officers'),
          fetch('/api/registers/shareholders'),
          fetch('/api/registers/stated-capital'),
        ])
        const binderData = await binderRes.json()
        setSections(binderData.sections || [])
        setDirectors(await dirRes.json())
        setOfficers(await offRes.json())
        setShareholders(await shRes.json())
        setStatedCapital(await scRes.json())
      } catch (err) {
        console.error('Failed to load binder data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sections.map((section, i) =>
        section.key === 'registres' ? (
          <BinderSection
            key={section.key}
            index={i}
            title={tBinder(`sections.${section.key}`)}
            documents={[]}
          >
            {directors && (
              <RegisterCard
                title={locale === 'en' ? directors.register_title_en : directors.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'resident', label: t('columns.residence') },
                  { key: 'appointment_date', label: t('columns.start') },
                  { key: 'end_date_display', label: t('columns.end') },
                  { key: 'status', label: t('columns.active') },
                ]}
                rows={(directors.entries || []).map((e: any) => ({
                  ...e,
                  resident: e.is_canadian_resident ? t('residentYes') : t('residentNo'),
                  end_date_display: e.end_date || '—',
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">✗</span>
                  ),
                }))}
              />
            )}

            {officers && (
              <RegisterCard
                title={locale === 'en' ? officers.register_title_en : officers.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'title', label: t('columns.title') },
                  { key: 'appointment_date', label: t('columns.start') },
                  { key: 'end_date_display', label: t('columns.end') },
                  { key: 'status', label: t('columns.active') },
                ]}
                rows={(officers.entries || []).map((e: any) => ({
                  ...e,
                  end_date_display: e.end_date || '—',
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">✗</span>
                  ),
                }))}
              />
            )}

            {shareholders && (
              <RegisterCard
                title={locale === 'en' ? shareholders.register_title_en : shareholders.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'full_name', label: t('columns.name') },
                  { key: 'share_class', label: t('columns.shareClass') },
                  { key: 'quantity', label: t('columns.quantity') },
                  { key: 'certificate_number', label: t('columns.certificate') },
                  { key: 'issue_date', label: t('columns.issueDate') },
                ]}
                rows={(shareholders.entries || []).map((e: any) => ({
                  ...e,
                  certificate_number: e.certificate_number || '—',
                }))}
              />
            )}

            {statedCapital && (
              <RegisterCard
                title={locale === 'en' ? statedCapital.register_title_en : statedCapital.register_title_fr}
                emptyMessage={t('emptyRegister')}
                columns={[
                  { key: 'class_name', label: t('columns.shareClass') },
                  { key: 'stated_capital', label: t('columns.statedCapital') },
                ]}
                rows={(statedCapital.entries || []).map((e: any) => ({
                  ...e,
                  stated_capital: new Intl.NumberFormat(
                    locale === 'en' ? 'en-CA' : 'fr-CA',
                    { style: 'currency', currency: e.currency || 'CAD' }
                  ).format(e.stated_capital ?? 0),
                }))}
                citation={locale === 'en' ? statedCapital.citation_en : statedCapital.citation_fr}
                footnote={(() => {
                  const missing = (statedCapital.entries || []).reduce(
                    (sum: number, e: any) => sum + (e.issuances_missing_price || 0),
                    0
                  )
                  return missing > 0 ? (
                    <p className="text-[11px] text-amber-600">
                      {t('missingConsideration', { count: missing })}
                    </p>
                  ) : undefined
                })()}
              />
            )}
          </BinderSection>
        ) : (
          <BinderSection
            key={section.key}
            index={i}
            title={tBinder(`sections.${section.key}`)}
            documents={section.documents}
          />
        )
      )}
    </div>
  )
}
