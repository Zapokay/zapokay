'use client'

import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'

interface YearPickerProps {
  locale: string
  years: number[]
  /**
   * When true, append "Hors exercice" / "No fiscal year".
   * ⚠️ LA VALEUR D'URL RESTE `'unclassified'`, ET C'EST DÉLIBÉRÉ : seul le
   * LIBELLÉ change, pour qu'un lien mis en signet continue de fonctionner.
   * L'option jumelle `'foundational'` a été retirée — elle disait la même chose
   * dans d'autres mots et se chevauchait avec celle-ci.
   */
  includeUnclassifiedOption?: boolean
}

function YearPickerInner({
  locale,
  years,
  includeUnclassifiedOption = false,
}: YearPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('documents')

  const selectedYear = searchParams.get('year') ?? 'all'

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', value)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <select
      value={selectedYear}
      onChange={e => handleChange(e.target.value)}
      className="text-xs rounded-lg px-2 py-1.5 border outline-none cursor-pointer"
      style={{
        background: 'var(--tb-search-bg)',
        color: 'var(--text-body)',
        borderColor: 'var(--tb-border)',
      }}
    >
      <option value="all">{t('filterAllYears')}</option>
      {years.map(y => (
        <option key={y} value={String(y)}>
          {getFiscalYearLabel(y, locale)}
        </option>
      ))}
      {includeUnclassifiedOption && (
        <option value="unclassified">
          {t('filterNoFiscalYear')}
        </option>
      )}
    </select>
  )
}

export function YearPicker(props: YearPickerProps) {
  return (
    <Suspense fallback={null}>
      <YearPickerInner {...props} />
    </Suspense>
  )
}
