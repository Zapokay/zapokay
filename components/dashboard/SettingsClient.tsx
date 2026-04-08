'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Lock } from 'lucide-react'

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
]
const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface FiscalYearEntry {
  year: number
  status: string
}

interface SettingsClientProps {
  locale: string
  userId: string
  companyId: string
  // Profile
  initialFullName: string
  initialEmail: string
  initialLang: string
  // Company
  incorporationType: string
  initialLegalName: string
  initialNeq: string
  province: string
  incorporationDate: string | null
  initialFyMonth: number
  initialFyDay: number
  // Fiscal years
  savedFiscalYears: FiscalYearEntry[]
  documentYears: number[]
  allYears: number[]
}

export function SettingsClient({
  locale,
  userId,
  companyId,
  initialFullName,
  initialEmail,
  initialLang,
  incorporationType,
  initialLegalName,
  initialNeq,
  province,
  incorporationDate,
  initialFyMonth,
  initialFyDay,
  savedFiscalYears,
  documentYears,
  allYears,
}: SettingsClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const fr = locale === 'fr'

  // ── Profile state ──────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(initialFullName)
  const [lang, setLang] = useState(initialLang)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Company state ──────────────────────────────────────────────────────────
  const [legalName, setLegalName] = useState(initialLegalName)
  const [neq, setNeq] = useState(initialNeq)
  const [fyMonth, setFyMonth] = useState(initialFyMonth)
  const [fyDay, setFyDay] = useState(initialFyDay)
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Locked fields state ────────────────────────────────────────────────────
  const [editIncorpType, setEditIncorpType] = useState(incorporationType)
  const [editProvince, setEditProvince] = useState(province)
  const [editIncorpDate, setEditIncorpDate] = useState(incorporationDate ?? '')
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set())
  const [pendingUnlock, setPendingUnlock] = useState<string | null>(null)

  // ── Fiscal years state ─────────────────────────────────────────────────────
  const initialActive = new Set<number>(
    savedFiscalYears.filter(fy => fy.status === 'active').map(fy => fy.year)
  )
  const [activeYears, setActiveYears] = useState<Set<number>>(initialActive)
  const [togglingYear, setTogglingYear] = useState<number | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────
  const inputClass =
    'w-full px-3 py-2 rounded-lg text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors'
  const selectClass =
    'w-full px-3 py-2 rounded-lg text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors'

  const sectionTitle: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif",
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '16px',
  }

  function flash(
    setter: React.Dispatch<React.SetStateAction<{ ok: boolean; text: string } | null>>,
    ok: boolean,
    text: string
  ) {
    setter({ ok, text })
    setTimeout(() => setter(null), 3000)
  }

  // ── Save profile ────────────────────────────────────────────────────────────
  async function saveProfile() {
    setSavingProfile(true)
    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName, preferred_language: lang })
      .eq('id', userId)
    setSavingProfile(false)
    if (error) {
      flash(setProfileMsg, false, fr ? 'Erreur lors de la sauvegarde.' : 'Error saving.')
    } else {
      flash(setProfileMsg, true, fr ? 'Profil enregistré ✓' : 'Profile saved ✓')
      if (lang !== locale) {
        router.push(`/${lang}/dashboard/settings`)
      } else {
        router.refresh()
      }
    }
  }

  // ── Save company ────────────────────────────────────────────────────────────
  async function saveCompany() {
    setSavingCompany(true)
    const updates: Record<string, unknown> = {
      legal_name_fr: legalName,
      legal_name_en: legalName,
      neq: neq || null,
      fiscal_year_end_month: fyMonth,
      fiscal_year_end_day: fyDay,
    }
    if (unlockedFields.has('incorporationType')) {
      updates.incorporation_type = editIncorpType
    }
    if (unlockedFields.has('province')) {
      updates.province = editProvince
    }
    if (unlockedFields.has('incorporationDate')) {
      updates.incorporation_date = editIncorpDate || null
    }
    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId)
    setSavingCompany(false)
    if (error) {
      flash(setCompanyMsg, false, fr ? 'Erreur lors de la sauvegarde.' : 'Error saving.')
    } else {
      flash(setCompanyMsg, true, fr ? 'Entreprise enregistrée ✓' : 'Company saved ✓')
      router.refresh()
    }
  }

  // ── Toggle fiscal year ──────────────────────────────────────────────────────
  async function toggleYear(year: number) {
    setToggleError(null)
    const isActive = activeYears.has(year)

    if (isActive) {
      // Async doc check BEFORE any UI change
      setTogglingYear(year)
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('document_year', year)
        .eq('status', 'active')
      setTogglingYear(null)

      if (count && count > 0) {
        setToggleError(
          fr
            ? `Des documents existent pour l'exercice ${year}. Supprimez-les d'abord.`
            : `Documents exist for fiscal year ${year}. Delete them first.`
        )
        return
      }
    }

    // Optimistic update
    const next = new Set(activeYears)
    if (isActive) next.delete(year); else next.add(year)
    setActiveYears(next)
    setTogglingYear(year)

    let dbError: unknown = null
    if (isActive) {
      const { error } = await supabase
        .from('company_fiscal_years')
        .update({ status: 'archived' })
        .eq('company_id', companyId)
        .eq('year', year)
      dbError = error
    } else {
      const { error } = await supabase
        .from('company_fiscal_years')
        .upsert({ company_id: companyId, year, status: 'active' }, { onConflict: 'company_id,year' })
      dbError = error
    }

    setTogglingYear(null)

    if (dbError) {
      // Rollback
      setActiveYears(new Set(activeYears))
      alert(fr ? 'Erreur lors de la mise à jour.' : 'Error updating fiscal year.')
      return
    }

    await new Promise(r => setTimeout(r, 100))
    router.refresh()
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Mon profil ──────────────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow-sm">
        <h2 style={sectionTitle}>{fr ? 'Mon profil' : 'My profile'}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? 'Nom complet' : 'Full name'}
            </label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? 'Adresse courriel' : 'Email address'}
            </label>
            <input
              value={initialEmail}
              readOnly
              className={inputClass}
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? 'Langue préférée' : 'Preferred language'}
            </label>
            <select value={lang} onChange={e => setLang(e.target.value)} className={selectClass}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#070E1C', color: 'white' }}
            >
              {savingProfile ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
            </button>
            {profileMsg && (
              <span className="text-xs font-medium" style={{ color: profileMsg.ok ? '#2E5425' : '#6B1E1E' }}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Mon entreprise ─────────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow-sm">
        <h2 style={sectionTitle}>{fr ? 'Mon entreprise' : 'My company'}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? 'Dénomination sociale' : 'Legal name'}
            </label>
            <input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? "NEQ (Numéro d'entreprise du Québec)" : "NEQ (Québec Enterprise Number)"}
              </label>
            </div>
            <input
              value={neq}
              onChange={e => setNeq(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder={fr ? 'ex. 1234567890' : 'e.g. 1234567890'}
              inputMode="numeric"
              maxLength={10}
              className={inputClass}
            />
            {neq.length > 0 && neq.length < 10 && (
              <p className="mt-1 text-xs text-amber-600">
                {fr ? `${10 - neq.length} chiffres manquants` : `${10 - neq.length} digits missing`}
              </p>
            )}
          </div>
          {/* Protected fields — Type, Province, Date de constitution */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  {fr ? 'Type de constitution' : 'Incorporation type'}
                </label>
                <button
                  onClick={() => !unlockedFields.has('incorporationType') && setPendingUnlock('incorporationType')}
                  style={{ background: 'none', border: 'none', cursor: unlockedFields.has('incorporationType') ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                  title={unlockedFields.has('incorporationType')
                    ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                    : (fr ? 'Cliquer pour déverrouiller' : 'Click to unlock')}
                >
                  <Lock size={12} style={{ color: unlockedFields.has('incorporationType') ? '#2E5425' : 'var(--text-muted)' }} />
                </button>
              </div>
              {unlockedFields.has('incorporationType') ? (
                <input
                  value={editIncorpType}
                  onChange={e => setEditIncorpType(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <div
                  className="px-3 py-2 rounded-lg text-sm border"
                  style={{
                    borderColor: 'var(--card-border)',
                    backgroundColor: 'var(--page-bg)',
                    color: 'var(--text-body)',
                    opacity: 0.7,
                  }}
                >
                  {editIncorpType}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  {fr ? 'Province' : 'Province'}
                </label>
                <button
                  onClick={() => !unlockedFields.has('province') && setPendingUnlock('province')}
                  style={{ background: 'none', border: 'none', cursor: unlockedFields.has('province') ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                  title={unlockedFields.has('province')
                    ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                    : (fr ? 'Cliquer pour déverrouiller' : 'Click to unlock')}
                >
                  <Lock size={12} style={{ color: unlockedFields.has('province') ? '#2E5425' : 'var(--text-muted)' }} />
                </button>
              </div>
              {unlockedFields.has('province') ? (
                <input
                  value={editProvince}
                  onChange={e => setEditProvince(e.target.value)}
                  className={inputClass}
                />
              ) : (
                <div
                  className="px-3 py-2 rounded-lg text-sm border"
                  style={{
                    borderColor: 'var(--card-border)',
                    backgroundColor: 'var(--page-bg)',
                    color: 'var(--text-body)',
                    opacity: 0.7,
                  }}
                >
                  {editProvince}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? 'Date de constitution' : 'Incorporation date'}
              </label>
              <button
                onClick={() => !unlockedFields.has('incorporationDate') && setPendingUnlock('incorporationDate')}
                style={{ background: 'none', border: 'none', cursor: unlockedFields.has('incorporationDate') ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                title={unlockedFields.has('incorporationDate')
                  ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                  : (fr ? 'Cliquer pour déverrouiller' : 'Click to unlock')}
              >
                <Lock size={12} style={{ color: unlockedFields.has('incorporationDate') ? '#2E5425' : 'var(--text-muted)' }} />
              </button>
            </div>
            {unlockedFields.has('incorporationDate') ? (
              <input
                type="date"
                value={editIncorpDate}
                onChange={e => setEditIncorpDate(e.target.value)}
                className={inputClass}
              />
            ) : (
              <div
                className="px-3 py-2 rounded-lg text-sm border"
                style={{
                  borderColor: 'var(--card-border)',
                  backgroundColor: 'var(--page-bg)',
                  color: 'var(--text-body)',
                  opacity: 0.7,
                }}
              >
                {editIncorpDate
                  ? new Date(editIncorpDate + 'T00:00:00').toLocaleDateString(
                      fr ? 'fr-CA' : 'en-CA',
                      { year: 'numeric', month: 'long', day: 'numeric' }
                    )
                  : (fr ? 'Non renseigné' : 'Not set')}
              </div>
            )}
          </div>
          {/* Fin d'exercice */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? "Fin d'exercice financier" : 'Fiscal year end'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={fyMonth}
                onChange={e => setFyMonth(parseInt(e.target.value))}
                className={selectClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {fr ? MONTHS_FR[m - 1] : MONTHS_EN[m - 1]}
                  </option>
                ))}
              </select>
              <select
                value={fyDay}
                onChange={e => setFyDay(parseInt(e.target.value))}
                className={selectClass}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <p
              className="text-xs mt-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#FFF8E7', color: '#7A5804', border: '1px solid #FDDB8C' }}
            >
              ⚠️ {fr
                ? "La modification de la fin d'exercice recalcule votre conformité."
                : 'Changing the fiscal year end recalculates your compliance.'}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveCompany}
              disabled={savingCompany}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#070E1C', color: 'white' }}
            >
              {savingCompany
                ? (fr ? 'Enregistrement...' : 'Saving...')
                : (fr ? 'Enregistrer les modifications' : 'Save changes')}
            </button>
            {companyMsg && (
              <span className="text-xs font-medium" style={{ color: companyMsg.ok ? '#2E5425' : '#6B1E1E' }}>
                {companyMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Exercices financiers ───────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow-sm">
        <h2 style={sectionTitle}>{fr ? 'Exercices financiers suivis' : 'Tracked fiscal years'}</h2>
        {toggleError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: '#F5EEEE', color: '#6B1E1E', border: '1px solid #C9A5A5' }}>
            {toggleError}
          </div>
        )}
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {fr
            ? 'Activez les exercices pour lesquels vous souhaitez suivre la conformité. Les années avec des documents ne peuvent pas être désactivées.'
            : 'Enable fiscal years for compliance tracking. Years with documents cannot be disabled.'}
        </p>

        {allYears.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {fr ? 'Aucun exercice disponible.' : 'No fiscal years available.'}
          </p>
        ) : (
          <div className="space-y-2">
            {allYears.map(year => {
              const isActive = activeYears.has(year)
              const isToggling = togglingYear === year
              const hasDoc = documentYears.includes(year)
              return (
                <div
                  key={year}
                  className="flex items-center justify-between p-3 rounded-lg border transition-colors"
                  style={{
                    borderColor: isActive ? '#F5B91E' : 'var(--card-border)',
                    backgroundColor: isActive ? '#FFF8E7' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-semibold"
                      style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
                    >
                      {fr ? `Exercice ${year}` : `Fiscal year ${year}`}
                    </span>
                    {hasDoc && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        background: '#EEF1F7',
                        color: '#1E3D6B',
                        border: '1px solid #9EB0C9',
                        borderRadius: '20px',
                        padding: '2px 8px',
                      }}>
                        {fr ? 'Protégé' : 'Protected'}
                      </span>
                    )}
                  </div>
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleYear(year)}
                    disabled={isToggling}
                    className="relative flex items-center cursor-pointer disabled:cursor-not-allowed"
                    style={{ opacity: isToggling ? 0.5 : 1, background: 'none', border: 'none', padding: 0 }}
                  >
                    <div
                      className="w-10 h-5 rounded-full transition-colors relative"
                      style={{ backgroundColor: isActive ? '#F5B91E' : '#CBD5E5' }}
                    >
                      <div
                        className="w-4 h-4 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform"
                        style={{ transform: isActive ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Unlock confirmation modal ──────────────────────────────────────── */}
      {pendingUnlock && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-xl p-6 shadow-xl max-w-sm mx-4"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <h3
              className="text-sm font-bold mb-3"
              style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
            >
              ⚠ {fr ? 'Attention' : 'Warning'}
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-body)' }}>
              {fr
                ? 'Modifier ce champ recalculera votre conformité et pourrait invalider des documents déjà générés. Voulez-vous continuer ?'
                : 'Editing this field will recalculate your compliance and may invalidate already generated documents. Do you want to continue?'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingUnlock(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'var(--neutral-200)', color: 'var(--text-body)', backgroundColor: 'transparent' }}
              >
                {fr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  setUnlockedFields(prev => { const s = new Set(prev); s.add(pendingUnlock!); return s })
                  setPendingUnlock(null)
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#070E1C', color: 'white' }}
              >
                {fr ? 'Déverrouiller' : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
