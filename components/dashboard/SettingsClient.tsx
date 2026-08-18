'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Info, Lock } from 'lucide-react'
import { logActivity } from '@/lib/activity-log'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'
import { formatDate } from '@/lib/utils'

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
  initialCorporationNumber: string
  province: string
  incorporationDate: string | null
  initialFyMonth: number
  initialFyDay: number
  // Fiscal years
  savedFiscalYears: FiscalYearEntry[]
  documentYears: number[]
  allYears: number[]
  // Appearance
  initialPreferredTheme: 'light' | 'dark' | null
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
  initialCorporationNumber,
  province,
  incorporationDate,
  initialFyMonth,
  initialFyDay,
  savedFiscalYears,
  documentYears,
  allYears,
  initialPreferredTheme,
}: SettingsClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const fr = locale === 'fr'

  // ── Profile state ──────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(initialFullName)
  const [lang, setLang] = useState(initialLang)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showLangTooltip, setShowLangTooltip] = useState(false)
  const [showEmailTooltip, setShowEmailTooltip] = useState(false)

  // ── Company state ──────────────────────────────────────────────────────────
  const [legalName, setLegalName] = useState(initialLegalName)
  const [neq, setNeq] = useState(initialNeq)
  const [corporationNumber, setCorporationNumber] = useState(initialCorporationNumber)
  // Its own tooltip state, mirroring showEmailTooltip / showLangTooltip in the
  // profile card: one boolean per tooltip, hover-driven. This is the FIRST tooltip
  // on the COMPANY card — the NEQ has none here; its explanatory bubble lives in
  // the onboarding step, not in Paramètres.
  const [showCorpNumTooltip, setShowCorpNumTooltip] = useState(false)
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

  // ── THE PADLOCK HAS TWO FUNCTIONS, AND THEY MUST NOT BE CONFLATED. ──
  //
  // On a value that GOVERNS CALCULATIONS (incorporation type, province,
  // incorporation date, fiscal year end) the warning modal tells the truth:
  // compliance IS recomputed and already-generated documents CAN become wrong.
  //
  // On an IDENTIFIER (NEQ, federal corporation number) it is FALSE — nothing is
  // recomputed, no document is invalidated. Here the padlock serves only to
  // prevent an ACCIDENTAL edit to a value we will read later.
  //
  // ★ A warning that is true every time keeps its weight; one that shouts about an
  // identifier wears it out.
  //
  // ⚠️ AN INLINE `if` ON THE BUTTON WOULD HAVE WRITTEN THE RULE TWICE (NEQ +
  // federal number), and a third identifier would have forgotten it. One list, one
  // decision site. The four calculation fields do NOT pass through here: their
  // buttons still call `setPendingUnlock` directly, and the modal remains their
  // only unlock path.
  const IDENTIFIER_FIELDS = new Set(['neq', 'corporationNumber'])
  function requestUnlock(field: string) {
    if (unlockedFields.has(field)) return
    if (IDENTIFIER_FIELDS.has(field)) {
      setUnlockedFields(prev => {
        const s = new Set(prev); s.add(field); return s
      })
      return
    }
    setPendingUnlock(field)
  }

  // ── Apparence state ────────────────────────────────────────────────────────
  const [themeUnlocked, setThemeUnlocked] = useState(initialPreferredTheme !== null)
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | null>(initialPreferredTheme)
  const [themeMsg, setThemeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingTheme, setSavingTheme] = useState(false)

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
  // Regime label: internal enum 'LSA'/'CBCA' → user-facing proper noun. Matches the
  // app-wide `=== 'CBCA' ? 'CBCA' : 'LSAQ'` pattern (compliance/page.tsx:85,
  // StepConfirmation.tsx:32). Locale-invariant proper nouns — no i18n key needed.
  const incorpTypeLabel = (v: string) => (v === 'CBCA' ? 'CBCA' : 'LSAQ')
  // Reads `editIncorpType`, the LOCAL state the unlocked <select> writes to — NOT the
  // `incorporationType` prop, which is frozen at page load. That is what makes the
  // federal-number field ungrey the instant the user picks CBCA, with no save and no
  // reload. Switching this to the prop would silently break that.
  const isCBCA = editIncorpType === 'CBCA'

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
  // IMPORTANT: Profile save updates preferred_language in DB only.
  // It MUST NOT switch the UI locale. UI locale is controlled exclusively
  // by the top-right locale toggle. See Two-Layer Language Model in
  // ZapOkay_Project_Memory_Core.md (locked May 4, 2026).
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
      await logActivity(supabase, companyId, userId, 'settings_updated',
        'Paramètres modifiés : profil utilisateur',
        'Settings updated: user profile',
        { changed_fields: ['full_name', 'preferred_language'] }
      )
      router.refresh()
    }
  }

  // ── Save company ────────────────────────────────────────────────────────────
  async function saveCompany() {
    setSavingCompany(true)
    const updates: Record<string, unknown> = {
      legal_name_fr: legalName,
      legal_name_en: legalName,
      neq: neq || null,
    }
    // ── FISCAL-YEAR-END GATE (A4 plan §9c) ──────────────────────────────────────
    // The FY-end now writes ONLY when its padlock has been unlocked this session,
    // matching the three gated fields below. It used to ship on EVERY save of this
    // form, touched or not.
    //
    // WHAT THIS IS: friction. Changing the FY-end retroactively rewrites every
    // historical due date, because historical fiscal-year endDates are composed from
    // the company's CURRENT rule. It was the easiest of the five sensitive fields to
    // trigger and the broadest in blast radius, and the only one with no friction at
    // all.
    //
    // WHAT THIS IS NOT — two things, both load-bearing:
    //   1. NOT a fix for the retroactive rewrite. Core's "a fiscal year's boundaries
    //      belong to the year, not the company" remains a PRE-LAUNCH GATE and is
    //      still UNBUILT. This makes a destructive act deliberate; it does not make
    //      it safe, and it must not be recorded as closing that work.
    //   2. NOT validation. Harvey ruled ZapOkay must PROPAGATE an FY-end change, not
    //      approve one — the user or their accountant owns that value. A padlock
    //      approves nothing and blocks nothing; it only asks "are you sure". No
    //      guard, no authorization check, and none should be added.
    //
    // ★ THE LEAST OBVIOUS EFFECT, and the most concrete: before this gate, a company
    // whose fiscal_year_end_month/day were NULL acquired 12/31 the moment it saved
    // ANY settings change — the form seeds from the read-path default (`?? 12` /
    // `?? 31`), then wrote it back as if the user had chosen it. That silently
    // destroyed the signal #175 built two guards to detect: generatePdfDocument and
    // generate-lifecycle-document both REFUSE to default a null FY-end, deliberately,
    // so they can surface an unset value rather than mis-frame a document. Gating the
    // write ends the laundering; every read path keeps its `?? 12` / `?? 31` default,
    // so nothing user-visible moves.
    //
    // Side effect worth keeping: `changed_fields` in the activity log stops naming the
    // FY-end on every save, so a future entry that DOES name it is real evidence of a
    // change rather than noise.
    if (unlockedFields.has('fiscalYearEnd')) {
      updates.fiscal_year_end_month = fyMonth
      updates.fiscal_year_end_day = fyDay
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
    // ── THE FEDERAL NUMBER — GATED TWICE, AND NEITHER GATE IS REDUNDANT. ──
    //
    // GATE 1, the padlock: the value is written only if the user deliberately opened
    // the field, exactly like the four fields above. (The NEQ is the odd one out — it
    // is written unconditionally at the top of `updates`, protected on screen but open
    // at the write. Tracked separately; deliberately not this lot.)
    //
    // ⚠️ GATE 2, `isCBCA`, IS NOT REDUNDANT — DO NOT REMOVE IT. A user can unlock the
    // field while CBCA, type a number, then switch the type back to LSAQ without
    // saving. The field then RENDERS "Sociétés fédérales seulement", but the padlock
    // is still open, so gate 1 alone would persist the number anyway. Writing a value
    // behind a sentence that says there is none is a silent lie in the data.
    //
    // ACCEPTED COST, DECIDED RATHER THAN OVERLOOKED: whoever types a number and then
    // switches to LSAQ loses that input with no warning. Acceptable — they have just
    // declared their company is not federal.
    if (unlockedFields.has('corporationNumber') && isCBCA) {
      updates.corporation_number = corporationNumber || null
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
      await logActivity(supabase, companyId, userId, 'settings_updated',
        'Paramètres modifiés : informations de la société',
        'Settings updated: company information',
        { changed_fields: Object.keys(updates) }
      )
      router.refresh()
    }
  }

  // ── Save theme ─────────────────────────────────────────────────────────────
  async function saveTheme(value: 'light' | 'dark' | null) {
    setSavingTheme(true)
    const { error } = await supabase
      .from('users')
      .update({ preferred_theme: value })
      .eq('id', userId)
    setSavingTheme(false)
    if (error) {
      flash(setThemeMsg, false, fr ? 'Erreur lors de la sauvegarde.' : 'Error saving.')
    } else {
      if (value) {
        document.documentElement.setAttribute('data-theme', value)
      } else {
        const osTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        document.documentElement.setAttribute('data-theme', osTheme)
      }
      await logActivity(supabase, companyId, userId, 'settings_updated',
        'Paramètres modifiés : thème',
        'Settings updated: theme',
        { preferred_theme: value }
      )
      flash(setThemeMsg, true, fr ? 'Thème enregistré ✓' : 'Theme saved ✓')
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
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? 'Adresse courriel' : 'Email address'}
              </label>
              <Lock size={12} style={{ color: 'var(--text-muted)' }} />
              <button
                type="button"
                onMouseEnter={() => setShowEmailTooltip(true)}
                onMouseLeave={() => setShowEmailTooltip(false)}
                className="relative rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-body)] flex-shrink-0"
              >
                <Info className="h-3.5 w-3.5" />
                {showEmailTooltip && (
                  <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs font-normal text-[var(--text-body)] shadow-lg">
                    {fr
                      ? "L'adresse courriel ne peut être modifiée directement. Pour la changer, veuillez contacter notre équipe de support."
                      : 'The email address cannot be modified directly. To change it, please contact our support team.'}
                  </div>
                )}
              </button>
            </div>
            <input
              value={initialEmail}
              readOnly
              className={inputClass}
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? 'Langue préférée' : 'Preferred language'}
              </label>
              <button
                type="button"
                onMouseEnter={() => setShowLangTooltip(true)}
                onMouseLeave={() => setShowLangTooltip(false)}
                className="relative rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-body)] flex-shrink-0"
              >
                <Info className="h-3.5 w-3.5" />
                {showLangTooltip && (
                  <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs font-normal text-[var(--text-body)] shadow-lg">
                    {fr
                      ? "Cette langue est utilisée pour générer les nouveaux documents (PDF). Pour changer la langue de l'interface, utilisez le sélecteur en haut à droite. Les deux paramètres sont indépendants."
                      : 'This language is used to generate new documents (PDF). To change the interface language, use the selector at the top right. The two settings are independent.'}
                  </div>
                )}
              </button>
            </div>
            <select value={lang} onChange={e => setLang(e.target.value)} className={selectClass}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          {lang !== initialLang && (
            <p
              className="text-xs mt-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-border)' }}
            >
              ⚠️ {fr
                ? 'Changer votre langue préférée affecte les documents générés à partir de maintenant et les titres des documents pas encore générés. Les documents déjà générés gardent leur langue — votre livre pourrait alors contenir deux langues.'
                : 'Changing your preferred language affects documents generated from now on and the titles of documents not yet generated. Documents already generated keep their language — your minute book may then contain two languages.'}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#F5B91E', color: '#1C1A17' }}
            >
              {savingProfile ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer les modifications' : 'Save changes')}
            </button>
            {profileMsg && (
              <span className="text-xs font-medium" style={{ color: profileMsg.ok ? 'var(--success-text)' : 'var(--error-text)' }}>
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
              <button
                onClick={() => requestUnlock('neq')}
                style={{ background: 'none', border: 'none', cursor: unlockedFields.has('neq') ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                title={unlockedFields.has('neq')
                  ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                  : (fr ? 'Non-modifiable — identifiant gouvernemental permanent' : 'Not editable — permanent government identifier')}
              >
                <Lock size={12} style={{ color: unlockedFields.has('neq') ? '#2E5425' : 'var(--text-muted)' }} />
              </button>
            </div>
            {unlockedFields.has('neq') ? (
              <>
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
              </>
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
                {neq || '—'}
              </div>
            )}
          </div>
          {/* ── Numéro de société fédéral — FULL WIDTH, in the current child order.
              Pairing it with the NEQ side by side is LOT 2; nothing is moved here. ── */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? 'Numéro de société fédéral' : 'Federal corporation number'}
              </label>
              <button
                onClick={() => isCBCA && requestUnlock('corporationNumber')}
                style={{ background: 'none', border: 'none', cursor: isCBCA && !unlockedFields.has('corporationNumber') ? 'pointer' : 'default', padding: 0, display: 'flex' }}
                title={!isCBCA
                  ? (fr ? 'Réservé aux sociétés fédérales' : 'Federal corporations only')
                  : unlockedFields.has('corporationNumber')
                    ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                    : (fr ? 'Non-modifiable — identifiant gouvernemental permanent' : 'Not editable — permanent government identifier')}
              >
                <Lock size={12} style={{ color: isCBCA && unlockedFields.has('corporationNumber') ? '#2E5425' : 'var(--text-muted)' }} />
              </button>
              {/* ⚪ UNVERIFIED SOURCE — this copy is pending Harvey confirmation (the
                  7-or-8-digit claim and the contrast with the CRA Business Number).
                  Do not cite it as verified legal guidance until that lands. */}
              <button
                type="button"
                onMouseEnter={() => setShowCorpNumTooltip(true)}
                onMouseLeave={() => setShowCorpNumTooltip(false)}
                className="relative rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-body)] flex-shrink-0"
              >
                <Info className="h-3.5 w-3.5" />
                {showCorpNumTooltip && (
                  <div className="absolute left-6 top-0 z-40 w-72 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-left text-xs font-normal text-[var(--text-body)] shadow-lg">
                    {fr
                      ? "Numéro attribué par Corporations Canada à la constitution de la société — un identifiant de 7 ou 8 chiffres. Il figure sur votre certificat de constitution et sert d'identité juridique à la société. ⚠️ À ne pas confondre avec le numéro d'entreprise (NE) de l'Agence du revenu du Canada, un identifiant fiscal à 9 chiffres qui sert à l'impôt et aux taxes."
                      : "Number assigned by Corporations Canada when the corporation was incorporated — a 7- or 8-digit identifier. It appears on your certificate of incorporation and serves as the corporation's legal identity. ⚠️ Not to be confused with the Canada Revenue Agency Business Number (BN), a 9-digit tax identifier used for income tax and sales taxes."}
                  </div>
                )}
              </button>
            </div>
            {isCBCA && unlockedFields.has('corporationNumber') ? (
              // NO FORMAT VALIDATION, DELIBERATELY. Dom's real example is `1810444-1` —
              // digits AND a hyphen. The NEQ's `replace(/\D/g,'')` + `maxLength={10}` pair
              // would silently eat the hyphen and truncate. Free text is the right answer
              // here; a guard invented from a guessed format is not.
              <input
                value={corporationNumber}
                onChange={e => setCorporationNumber(e.target.value)}
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
                {isCBCA
                  ? (corporationNumber || '—')
                  : (fr ? 'Sociétés fédérales seulement' : 'Federal corporations only')}
              </div>
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
                <select
                  value={editIncorpType}
                  onChange={e => setEditIncorpType(e.target.value)}
                  className={selectClass}
                >
                  <option value="LSA">LSAQ</option>
                  <option value="CBCA">CBCA</option>
                </select>
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
                  {incorpTypeLabel(editIncorpType)}
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
                  ? formatDate(editIncorpDate, fr ? 'fr' : 'en', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : (fr ? 'Non renseigné' : 'Not set')}
              </div>
            )}
          </div>
          {/* Fin d'exercice — gated (A4 plan §9c); see the FISCAL-YEAR-END GATE note in saveCompany */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="block text-xs font-medium text-[var(--text-muted)]">
                {fr ? "Fin d'exercice financier" : 'Fiscal Year end'}
              </label>
              <button
                onClick={() => !unlockedFields.has('fiscalYearEnd') && setPendingUnlock('fiscalYearEnd')}
                style={{ background: 'none', border: 'none', cursor: unlockedFields.has('fiscalYearEnd') ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                title={unlockedFields.has('fiscalYearEnd')
                  ? (fr ? 'Champ déverrouillé' : 'Field unlocked')
                  : (fr ? 'Cliquer pour déverrouiller' : 'Click to unlock')}
              >
                <Lock size={12} style={{ color: unlockedFields.has('fiscalYearEnd') ? '#2E5425' : 'var(--text-muted)' }} />
              </button>
            </div>
            {unlockedFields.has('fiscalYearEnd') ? (
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
                {fr
                  ? `${fyDay} ${MONTHS_FR[fyMonth - 1]}`
                  : `${MONTHS_EN[fyMonth - 1]} ${fyDay}`}
              </div>
            )}
            <p
              className="text-xs mt-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-border)' }}
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
              style={{ backgroundColor: '#F5B91E', color: '#1C1A17' }}
            >
              {savingCompany
                ? (fr ? 'Enregistrement...' : 'Saving...')
                : (fr ? 'Enregistrer les modifications' : 'Save changes')}
            </button>
            {companyMsg && (
              <span className="text-xs font-medium" style={{ color: companyMsg.ok ? 'var(--success-text)' : 'var(--error-text)' }}>
                {companyMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Apparence ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow-sm">
        <h2 style={sectionTitle}>{fr ? 'Apparence' : 'Appearance'}</h2>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              {fr ? 'Thème' : 'Theme'}
            </label>
            {!themeUnlocked && (
              <button
                onClick={() => setThemeUnlocked(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                title={fr ? 'Cliquer pour choisir un thème' : 'Click to choose a theme'}
              >
                <Lock size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
          {!themeUnlocked ? (
            <div
              className="px-3 py-2 rounded-lg text-sm border"
              style={{
                borderColor: 'var(--card-border)',
                backgroundColor: 'var(--page-bg)',
                color: 'var(--text-muted)',
              }}
            >
              {fr ? 'Automatique (suit votre système)' : 'Automatic (follows your system)'}
            </div>
          ) : (
            <div className="space-y-2">
              {(['light', 'dark'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={async () => {
                    if (selectedTheme === val || savingTheme) return
                    setSelectedTheme(val)
                    await saveTheme(val)
                  }}
                  disabled={savingTheme}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors"
                  style={{
                    borderColor: selectedTheme === val ? 'var(--warning-border)' : 'var(--card-border)',
                    backgroundColor: selectedTheme === val ? 'var(--warning-bg)' : 'var(--page-bg)',
                    color: 'var(--text-heading)',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: selectedTheme === val ? '5px solid #F5B91E' : '2px solid var(--card-border)',
                      backgroundColor: 'var(--card-bg)',
                      transition: 'border 150ms',
                    }}
                  />
                  <span style={{ fontWeight: selectedTheme === val ? 600 : 400 }}>
                    {val === 'light'
                      ? (fr ? 'Lin Naturel (clair)' : 'Natural Linen (light)')
                      : (fr ? 'Charbon Neutre (sombre)' : 'Neutral Charcoal (dark)')}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={async () => {
                  setThemeUnlocked(false)
                  setSelectedTheme(null)
                  await saveTheme(null)
                }}
                disabled={savingTheme}
                className="text-xs underline"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {fr ? 'Réinitialiser (automatique)' : 'Reset (automatic)'}
              </button>
            </div>
          )}
          {themeMsg && (
            <p className="mt-2 text-xs font-medium" style={{ color: themeMsg.ok ? 'var(--success-text)' : 'var(--error-text)' }}>
              {themeMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* ── Exercices financiers ───────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow-sm">
        <h2 style={sectionTitle}>{fr ? 'Exercices financiers suivis' : 'Tracked fiscal years'}</h2>
        {toggleError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-border)' }}>
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
                    borderColor: isActive ? 'var(--warning-border)' : 'var(--card-border)',
                    backgroundColor: isActive ? 'var(--warning-bg)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-semibold"
                      style={{ fontFamily: 'Sora, sans-serif', color: 'var(--text-heading)' }}
                    >
                      {getFiscalYearLabel(year, locale)}
                    </span>
                    {hasDoc && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        background: 'var(--info-bg)',
                        color: 'var(--info-text)',
                        border: '1px solid var(--info-border)',
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
                style={{ backgroundColor: '#1C1A17', color: 'white' }}
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
