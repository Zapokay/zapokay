'use client'

import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'

interface YearPickerProps {
  locale: string
  years: number[]
  /** When true, prepend "Documents fondateurs" / "Foundational documents" (value = 'foundational'). */
  includeFoundationalOption?: boolean
  /** When true, append "Non classé" / "Unclassified" (value = 'unclassified'). */
  includeUnclassifiedOption?: boolean
}

function YearPickerInner({
  locale,
  years,
  includeFoundationalOption = false,
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
      {includeFoundationalOption && (
        <option value="foundational">
          {t('filterFoundational')}
        </option>
      )}
      {years.map(y => (
        <option key={y} value={String(y)}>
          {getFiscalYearLabel(y, locale)}
        </option>
      ))}
      {includeUnclassifiedOption && (
        <option value="unclassified">
          {t('filterUnclassified')}
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
