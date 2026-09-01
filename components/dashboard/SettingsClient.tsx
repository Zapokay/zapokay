'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Info, Lock } from 'lucide-react'
import { logActivity } from '@/lib/activity-log'
import { getFiscalYearLabel } from '@/lib/fiscal-year-label'
import { formatDate } from '@/lib/utils'
import { normalizeNeq, isValidNeq, normalizeCorporationNumber } from '@/lib/identifiers'
import frMessages from '@/messages/fr.json'
import enMessages from '@/messages/en.json'

const MONTHS_FR = [
  'janvier','février','mars','avril','mai','juin',
  'juillet','août','septembre','octobre','novembre','décembre',
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
  initialLegalNameEn: string
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
  initialLegalNameEn,
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
  // Static import, the form of StepCompany:79 — NOT useTranslations, which reads the
  // URL locale and would diverge from the `fr` boolean this file already uses
  // everywhere. Reuses the two keys the onboarding rule added: zero new strings.
  const cm = (fr ? frMessages : enMessages).common
  const pv = (fr ? frMessages : enMessages).provinces

  // ── Profile state ──────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(initialFullName)
  const [lang, setLang] = useState(initialLang)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showLangTooltip, setShowLangTooltip] = useState(false)
  const [showEmailTooltip, setShowEmailTooltip] = useState(false)

  // ── Company state ──────────────────────────────────────────────────────────
  const [legalName, setLegalName] = useState(initialLegalName)
  const [legalNameEn, setLegalNameEn] = useState(initialLegalNameEn)
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
  // ⚠️ THE COMMENT THAT STOOD HERE CLAIMED "locale-invariant proper nouns — no i18n
  // key needed". MEASURED FALSE: the acronym DOES differ by locale — French says
  // LSAQ / LCSA, English says QBCA / CBCA — so the old ternary handed the French
  // acronym to English readers and the English one to French readers, each in turn.
  // One table now, in common.regimes, keyed by the value the database stores.
  // ⚠️ LA FORME COURTE SE COMPOSE, ELLE NE SE LIT PLUS. L'acronyme nu — « LCSA » —
  // mettait le jargon en tête, exactement ce que 30c5c15 a retiré des cartes de
  // l'inscription : le même utilisateur lisait « Fédéral » à l'étape 2 puis du sigle
  // ici. On compose depuis les deux clés qui existent déjà plutôt que d'en lire une
  // troisième qui porterait la même information sous une seconde forme — deux écritures
  // d'une même chaîne finissent par diverger.
  const incorpTypeLabel = (v: string) => {
    const r = (cm.regimes as Record<string, { jurisdiction: string; acronym: string } | undefined>)[v]
    return r ? `${r.jurisdiction} (${r.acronym})` : v
  }

  // ⚠️ PREMIER LECTEUR DE `messages.provinces`, treize noms traduits restés sans usage.
  // Le code d'énumération brut — « QC » — est une fuite du modèle de données sur une
  // carte rédigée en prose, même famille que « LSA » fermée en da1b4f6. Repli sur le
  // code si la valeur stockée sortait un jour de la contrainte : mieux vaut afficher un
  // code qu'un vide.
  const provinceLabel = (v: string) =>
    (pv as Record<string, string | undefined>)[v] ?? v

  // ⚠️ TRI CONSCIENT DE LA LOCALE, PAS UN sort() NU. En ordre de points de code le « Î »
  // d'« Île-du-Prince-Édouard » passe APRÈS le Z : la province tombe en DERNIER de la
  // liste française. `localeCompare` la remet entre Colombie-Britannique et Manitoba.
  // Mesuré : l'anglais rend le même ordre dans les deux cas — c'est le français seul que
  // le tri naïf trahit, et c'est exactement le genre d'écart qu'on ne voit pas sans
  // regarder la fin de la liste.
  const provincesTriees = Object.keys(pv)
    .sort((a, b) => provinceLabel(a).localeCompare(provinceLabel(b), locale))
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
    // Au moins un des deux, comme la contrainte companies_legal_name_present.
    if (!legalName.trim() && !legalNameEn.trim()) {
      setSavingCompany(false)
      flash(setCompanyMsg, false, fr ? 'Au moins une des deux versions est requise.' : 'At least one version is required.')
      return
    }
    const updates: Record<string, unknown> = {
      // Chaque colonne prend SA valeur. Vide -> null, comme a l'inscription.
      legal_name_fr: legalName.trim() || null,
      legal_name_en: legalNameEn.trim() || null,
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
    // The NEQ, gated like the four fields above. It used to ship on EVERY save of
    // this form, touched or not — the only one of the five padlocked fields that was
    // protected on screen but open at the write.
    //
    // Harmless in practice TODAY: the input only renders while the padlock is open
    // (see the `unlockedFields.has('neq')` render gate below), so a closed padlock
    // rewrote the value it had just read. Gated anyway, for the same two reasons as
    // the FY-end above — consistency across the five, and `changed_fields` stops
    // naming `neq` on every save. That second effect arrives WITH this gate: until
    // now `Object.keys(updates)` listed `neq` unconditionally, so a log entry naming
    // it proved nothing. From here on it is real evidence of a change.
    // ⚠️ CORRECT IT, NEVER EMPTY IT. `neq || null` used to turn a cleared field into
    // NULL — and a NULL escapes BOTH check-identifier AND the partial unique index,
    // so the requirement onboarding now enforces could be undone here in two clicks.
    // Refused OUT LOUD: a silent no-op would be the same swallowed write this codebase
    // has been closing since 133d034.
    //
    // ⚠️ AND REFUSE A MALFORMED ONE TOO, NOT ONLY AN EMPTY ONE. Onboarding now blocks a
    // NEQ that is not exactly ten digits; without the same test here, Paramètres would
    // be the way around the rule it exists to repair. Same key on both surfaces.
    if (unlockedFields.has('neq')) {
      const canonical = normalizeNeq(neq)
      if (!canonical) {
        setSavingCompany(false)
        flash(setCompanyMsg, false, cm.neqRequired)
        return
      }
      if (!isValidNeq(canonical)) {
        setSavingCompany(false)
        flash(setCompanyMsg, false, cm.neqInvalid)
        return
      }
      updates.neq = canonical
    }
    // ── THE FEDERAL NUMBER — GATED TWICE, AND NEITHER GATE IS REDUNDANT. ──
    //
    // GATE 1, the padlock: the value is written only if the user deliberately opened
    // the field, exactly like the five fields above. (The NEQ used to be the odd one
    // out — written unconditionally at the top of `updates`, protected on screen but
    // open at the write. It is gated just above now.)
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
    // Same rule, same reason. Gated on isCBCA exactly as before — for an LSAQ company
    // the field is not applicable and this branch never runs.
    if (unlockedFields.has('corporationNumber') && isCBCA) {
      const canonical = normalizeCorporationNumber(corporationNumber)
      if (!canonical) {
        setSavingCompany(false)
        flash(setCompanyMsg, false, cm.corporationNumberRequired)
        return
      }
      updates.corporation_number = canonical
    }
    // supabase-js RETURNS { error } on a Postgres failure and THROWS on a network one.
    // Only the first was guarded here: a network failure skipped the release below and
    // left the button frozen with no message at all. Same class as 133d034, mirrored —
    // AddOfficerModal had the catch without the read; this had the read without the catch.
    try {
      const { error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', companyId)
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
    } catch (err) {
      // REUSES the existing message instead of inventing one for a second failure path
      // the user cannot tell apart anyway.
      console.error('[settings] saveCompany threw:', err)
      flash(setCompanyMsg, false, fr ? 'Erreur lors de la sauvegarde.' : 'Error saving.')
    } finally {
      // MOVED here from before the branch — the move IS the fix. Released on every path,
      // including the throw that used to skip it entirely.
      setSavingCompany(false)
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
      // ⚠️ CETTE LECTURE EST LA GARDE ELLE-MÊME, ET ELLE ÉTAIT MUETTE.
      // `const { count } = await …` ne lisait pas son `error` : sur un échec
      // retourné, `count` vaut null, `if (count && count > 0)` est FAUX, et la
      // protection ne se déclenche pas — la bascule passe sur une année qui
      // porte des documents. Une garde qui se tait quand quelque chose va mal
      // est au plus faible exactement quand on en a le plus besoin.
      let count: number | null = null
      let checkError: unknown = null
      try {
        const res = await supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('document_year', year)
          .eq('status', 'active')
        count = res.count
        checkError = res.error
      } catch (err) {
        console.error('[settings] fiscal year document check threw:', err)
        checkError = err
      }
      setTogglingYear(null)

      // ⚠️ ON ÉCHOUE FERMÉ. Si on ne PEUT PAS savoir si des documents existent,
      // on REFUSE la bascule. Laisser passer sur une incertitude reviendrait à
      // désactiver un exercice qui en porte peut-être — la chose même que cette
      // garde existe pour empêcher. Le message ne dit pas POURQUOI ; il dit vrai :
      // la bascule n'a pas été enregistrée.
      if (checkError) {
        setToggleError(cm.saveFailed)
        return
      }

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

    // ⚠️ LE CHEMIN RETOURNÉ ÉTAIT DÉJÀ LU ; C'EST LE CHEMIN LANCÉ QUI MANQUAIT.
    // supabase-js RETOURNE { error } sur un échec Postgres — couvert ci-dessous
    // depuis toujours — et LÈVE sur un échec réseau. Sans ce try, une coupure
    // laissait la case basculée à l'écran, `togglingYear` jamais relâché, et pas
    // un mot : l'utilisateur croyait suivre un exercice que la base ne porte pas.
    let dbError: unknown = null
    try {
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
    } catch (err) {
      console.error('[settings] fiscal year toggle threw:', err)
      dbError = err
    }

    setTogglingYear(null)

    if (dbError) {
      // Rollback
      setActiveYears(new Set(activeYears))
      // ⚠️ LE CANAL DE L'ÉCRAN, PLUS UNE BOÎTE DU NAVIGATEUR. `toggleError` rend
      // déjà du texte sous la carte ; il n'attendait qu'un second appelant. Un
      // `alert()` sort du produit, bloque le fil, et ne se traduit pas.
      // Les deux messages ne peuvent pas se chevaucher : toggleYear commence par
      // `setToggleError(null)`, donc chaque bascule efface le précédent.
      // `cm.saveFailed` plutôt qu'une chaîne à soi — c'est celle que l'étape 5 et
      // l'écran d'inscription emploient déjà pour le même événement.
      setToggleError(cm.saveFailed)
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
              {fr ? 'Dénomination sociale — version française' : 'Corporate name — French version'}
            </label>
            <input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
              {fr ? 'Version anglaise (si votre certificat en porte une)' : 'English version (if your certificate has one)'}
            </label>
            <input value={legalNameEn} onChange={e => setLegalNameEn(e.target.value)} className={inputClass} />
          </div>
          <p className="text-xs text-[var(--text-muted)] -mt-2">
            {fr ? 'Au moins une des deux versions est requise.' : 'At least one version is required.'}
          </p>
          {/* ── Protected fields — Type, Province.
              ★ THE REGIME IS READ BEFORE THE IDENTIFIERS, AND THE ORDER SAYS
              SOMETHING. The user sees "CBCA" first and only then meets the federal
              corporation number, so the field being live is already explained by the
              time they reach it. Moved above the NEQ / federal rows for that reason,
              not for looks. ── */}
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
                  {/* value = the DB enum, NEVER localised. Only the LABEL is, and it has to
                      be: this select sat two lines from a display line that now says LCSA
                      in French, and it would have contradicted it on the same screen. */}
                  <option value="LSA">{cm.regimes.LSA.acronym}</option>
                  <option value="CBCA">{cm.regimes.CBCA.acronym}</option>
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
                /* ⚠️ UNE LISTE, PLUS UNE SAISIE LIBRE. Le champ acceptait n'importe quoi ;
                   rien ne validait à l'écran et c'était `companies_province_check` qui
                   refusait, avec le message générique de sauvegarde — qui ne dit pas ce
                   qui ne va pas. Les treize valeurs sont connues, elles sont au catalogue
                   dans les deux langues : une liste rend la faute impossible au lieu de
                   la rattraper.
                   ⚠️ La valeur reste le CODE (`QC`), jamais le nom — seul l'affichage est
                   traduit. Même règle que la liste du type de constitution au-dessus. */
                <select
                  value={editProvince}
                  onChange={e => setEditProvince(e.target.value)}
                  className={selectClass}
                >
                  {provincesTriees.map(code => (
                    <option key={code} value={code}>{provinceLabel(code)}</option>
                  ))}
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
                  {provinceLabel(editProvince)}
                </div>
              )}
            </div>
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
                  onChange={e => setNeq(normalizeNeq(e.target.value))}
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
          {/* ── Numéro de société fédéral — FULL WIDTH, directly under the NEQ.
              The side-by-side pairing sketched for LOT 2 was DROPPED: both identifiers
              stay full width, one under the other. What LOT 2 moved is the
              Type|Province grid, now above them — see its comment. ── */}
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
                    {/* ⚠️ UNE SEULE SOURCE, AU CATALOGUE. Ces deux phrases étaient écrites
                        ICI, en dur, et 6496ca1 les a corrigées AILLEURS — dans la clé que
                        lit l'étape 2. Pendant ce temps cet écran affirmait encore « 7 ou 8
                        chiffres », donc deux écrans du produit disaient deux choses du même
                        identifiant, en production.
                        ⚠️ ET LE DÉFAUT EST INTROUVABLE PAR SON NOM : chercher une clé i18n
                        ne trouve jamais un doublon codé en dur. Ne recopie pas un texte de
                        catalogue dans du JSX, même « juste pour cet écran ». */}
                    {cm.corporationNumberTooltip}
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
                onChange={e => setCorporationNumber(normalizeCorporationNumber(e.target.value))}
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
