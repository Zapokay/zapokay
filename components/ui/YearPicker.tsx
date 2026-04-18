'use client'

import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

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

  const fr = locale === 'fr'

  const selectedYear =
    searchParams.get('year') ?? (years.length > 0 ? String(years[0]) : '')

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
      {includeFoundationalOption && (
        <option value="foundational">
          {fr ? 'Documents fondateurs' : 'Foundational documents'}
        </option>
      )}
      {years.map(y => (
        <option key={y} value={String(y)}>
          {y}
        </option>
      ))}
      {includeUnclassifiedOption && (
        <option value="unclassified">
          {fr ? 'Non classé' : 'Unclassified'}
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
