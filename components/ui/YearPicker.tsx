'use client'

import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface YearPickerProps {
  locale: string
  years: number[]
}

function YearPickerInner({ locale, years }: YearPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectedYear = searchParams.get('year') ?? ''
  const fr = locale === 'fr'

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('year', value)
    } else {
      params.delete('year')
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
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
      <option value="">{fr ? 'Toutes les années' : 'All years'}</option>
      {years.map(y => (
        <option key={y} value={String(y)}>
          {y}
        </option>
      ))}
    </select>
  )
}

export function YearPicker({ locale, years }: YearPickerProps) {
  return (
    <Suspense fallback={null}>
      <YearPickerInner locale={locale} years={years} />
    </Suspense>
  )
}
