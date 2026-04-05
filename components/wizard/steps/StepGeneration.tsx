'use client'

import { useEffect, useRef } from 'react'
import type { DocToGenerate, CompanyInfo, GeneratedFile } from '../CatchUpWizard'

interface StepGenerationProps {
  companyId: string
  incorporationType: string
  selections: DocToGenerate[]
  confirmedInfo: CompanyInfo
  locale: 'fr' | 'en'
  onSuccess: (files: GeneratedFile[]) => void
  onError: (err: string) => void
}

export function StepGeneration({
  companyId,
  incorporationType,
  selections,
  confirmedInfo,
  locale,
  onSuccess,
  onError,
}: StepGenerationProps) {
  const fr = locale === 'fr'
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    async function generate() {
      try {
        const res = await fetch('/api/wizard/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            incorporationType,
            selections,
            confirmedInfo,
            locale,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Generation failed')
        onSuccess(data.files as GeneratedFile[])
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      {/* Spinner */}
      <div className="relative">
        <div
          className="w-16 h-16 rounded-full border-4 animate-spin"
          style={{
            borderColor: 'var(--neutral-200)',
            borderTopColor: 'var(--amber-400)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--amber-400)">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h3
          className="text-base font-semibold mb-1"
          style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
        >
          {fr ? 'Génération en cours…' : 'Generating documents…'}
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {fr
            ? `Création de ${selections.length} document${selections.length > 1 ? 's' : ''}`
            : `Creating ${selections.length} document${selections.length > 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  )
}
