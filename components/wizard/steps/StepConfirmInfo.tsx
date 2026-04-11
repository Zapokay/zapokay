'use client'

import type { CompanyInfo } from '../CatchUpWizard'

interface StepConfirmInfoProps {
  info: CompanyInfo
  onChange: (info: CompanyInfo) => void
  onNext: () => void
  onBack: () => void
  locale: 'fr' | 'en'
  directors?: string[]
  officers?: Array<{ name: string; role: string }>
}

export function StepConfirmInfo({
  info,
  onChange,
  onNext,
  onBack,
  locale,
  directors = [],
  officers = [],
}: StepConfirmInfoProps) {
  const fr = locale === 'fr'

  function set(key: keyof CompanyInfo, value: string) {
    onChange({ ...info, [key]: value })
  }

  function selectOfficer(name: string) {
    const officer = officers.find(o => o.name === name)
    onChange({ ...info, officerName: name, officerRole: officer ? officer.role : info.officerRole })
  }

  const allFilled =
    info.companyName.trim() &&
    info.directorName.trim() &&
    info.officerName.trim() &&
    info.officerRole.trim() &&
    info.resolutionDate

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors"
  const inputStyle = {
    backgroundColor: 'var(--input-bg)',
    borderColor: 'var(--input-border)',
    color: 'var(--text-body)',
  }

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div
        className="rounded-lg p-4 flex gap-3"
        style={{ backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--warning-text)' }}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
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

        {/* Director name — dropdown when directors available */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {fr ? "Nom de l'administrateur" : 'Director name'}
          </label>
          {directors.length > 0 ? (
            <select
              value={info.directorName}
              onChange={(e) => set('directorName', e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{fr ? '— Sélectionner —' : '— Select —'}</option>
              {directors.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : (
            <div>
              <input
                type="text"
                value={info.directorName}
                onChange={(e) => set('directorName', e.target.value)}
                placeholder="Ex: Marie Tremblay"
                className={inputClass}
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {fr ? "Aucun administrateur enregistré — ajoutez-en dans la section Administrateurs." : "No directors registered — add them in the Directors section."}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Officer name — dropdown when officers available */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {fr ? 'Nom du dirigeant' : 'Officer name'}
            </label>
            {officers.length > 0 ? (
              <select
                value={info.officerName}
                onChange={(e) => selectOfficer(e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">{fr ? '— Sélectionner —' : '— Select —'}</option>
                {officers.map(o => (
                  <option key={o.name} value={o.name}>{o.name}</option>
                ))}
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  value={info.officerName}
                  onChange={(e) => set('officerName', e.target.value)}
                  placeholder="Ex: Jean Gagnon"
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {fr ? "Aucun dirigeant enregistré — ajoutez-en dans la section Dirigeants." : "No officers registered — add them in the Officers section."}
                </p>
              </div>
            )}
          </div>
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
              e.currentTarget.style.borderColor = 'var(--input-border-focus)'
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
