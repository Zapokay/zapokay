'use client'

import type { CompanyInfo } from '../CatchUpWizard'

interface StepConfirmInfoProps {
  info: CompanyInfo
  onChange: (info: CompanyInfo) => void
  onNext: () => void
  onBack: () => void
  locale: 'fr' | 'en'
}

export function StepConfirmInfo({
  info,
  onChange,
  onNext,
  onBack,
  locale,
}: StepConfirmInfoProps) {
  const fr = locale === 'fr'

  function set(key: keyof CompanyInfo, value: string) {
    onChange({ ...info, [key]: value })
  }

  const allFilled =
    info.companyName.trim() &&
    info.directorName.trim() &&
    info.officerName.trim() &&
    info.officerRole.trim() &&
    info.resolutionDate

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div
        className="rounded-lg p-4 flex gap-3"
        style={{ backgroundColor: '#FFF8E7', border: '1px solid #FDDB8C' }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="#7A5804">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm" style={{ color: '#7A5804' }}>
          {fr
            ? 'Ces informations seront substituées dans les documents générés. Vérifiez-les attentivement avant de continuer.'
            : 'This information will be substituted into the generated documents. Review carefully before continuing.'}
        </p>
      </div>

      <div className="space-y-4">
        <Field
          label={fr ? 'Nom de la compagnie' : 'Company name'}
          value={info.companyName}
          onChange={(v) => set('companyName', v)}
          placeholder="Ex: 9999999 Québec Inc."
        />
        <Field
          label={fr ? "Nom de l'administrateur" : 'Director name'}
          value={info.directorName}
          onChange={(v) => set('directorName', v)}
          placeholder="Ex: Marie Tremblay"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label={fr ? 'Nom du dirigeant' : 'Officer name'}
            value={info.officerName}
            onChange={(v) => set('officerName', v)}
            placeholder="Ex: Jean Gagnon"
          />
          <Field
            label={fr ? 'Titre du dirigeant' : 'Officer role/title'}
            value={info.officerRole}
            onChange={(v) => set('officerRole', v)}
            placeholder={fr ? 'Ex: Président' : 'Ex: President'}
          />
        </div>

        {/* Resolution date */}
        <div>
          <label
            className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {fr ? 'Date de la résolution' : 'Resolution date'}
          </label>
          <input
            type="date"
            value={info.resolutionDate}
            onChange={(e) => set('resolutionDate', e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--input-border)',
              color: 'var(--text-body)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--navy-400)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)'
            }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {fr
              ? 'Date à laquelle les résolutions sont adoptées (par voie écrite).'
              : 'Date on which the resolutions are adopted (in writing).'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors"
          style={{
            borderColor: 'var(--neutral-200)',
            color: 'var(--text-body)',
            backgroundColor: 'transparent',
          }}
        >
          ← {fr ? 'Retour' : 'Back'}
        </button>
        <button
          onClick={onNext}
          disabled={!allFilled}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
        >
          {fr ? 'Confirmer et générer' : 'Confirm and generate'} →
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label
        className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--input-border)',
          color: 'var(--text-body)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--navy-400)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--input-border)'
        }}
      />
    </div>
  )
}
