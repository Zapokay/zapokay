'use client';
import { useState } from 'react';
import type { OnboardingData, IncorporationType } from '@/lib/types';
import { normalizeNeq, isValidNeq, normalizeCorporationNumber } from '@/lib/identifiers';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
}

// ⚠️ THE ACRONYM IS NO LONGER HERE. It differs by LOCALE — FR says LSAQ/LCSA, EN says
// QBCA/CBCA — and three surfaces were each carrying their own copy, which is how one of
// them came to ship "LSAC", the letters transposed, for as long as it existed. That
// surface was dead code and has since been deleted; the lesson stands. It now comes from
// common.regimes, keyed by `dbValue` because that is what the database stores and
// what the two dashboard surfaces already index by.
// ★ THE SUBTITLES HAVE LEFT THIS ARRAY TOO. They used to be literals, and they were
// ASYMMETRIC: a CATEGORY under LSAQ, the NAME OF THE STATUTE under CBCA. The catalogue
// now carries both levels for both regimes — `jurisdiction` and `law` — so the two
// cards finally say the same KINDS of thing. The four law names are the exact heads of
// lib/legal-definitions.ts, minus their explanatory tails: one spelling of a statute
// title in the codebase, not two.
// What remains here is what the catalogue cannot hold: the flow's own vocabulary
// ('LSAQ') and the database's ('LSA').
const incorporationTypes = [
  { value: 'LSAQ' as IncorporationType, dbValue: 'LSA' as const },
  { value: 'CBCA' as IncorporationType, dbValue: 'CBCA' as const },
];

const MONTHS_FR = [
  'janvier','février','mars','avril','mai','juin',
  'juillet','août','septembre','octobre','novembre','décembre',
];
const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 500,
  color: 'var(--text-body)', marginBottom: '6px',
};

const isFr = (locale: string) => locale === 'fr';

export function StepCompany({ data, setData, onNext, onBack, locale }: StepProps) {
  const fr = isFr(locale);
  // Static-import pattern (see project_onboarding_dual_locale memory):
  // useTranslations() reads URL locale and would diverge from `fr` boolean above
  // when user toggles language via the OnboardingFlow header pill.
  const ob = (fr ? frMessages : enMessages).onboarding;
  // Shared with Settings, so it lives in common.* — a message TWO surfaces render
  // belongs to neither of them. Same precedent as common.saveFailed.
  const cm = (fr ? frMessages : enMessages).common;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [neqDuplicate, setNeqDuplicate] = useState(false);
  const [corpNumberDuplicate, setCorpNumberDuplicate] = useState(false);
  const [declared, setDeclared] = useState(false);

  // Today as YYYY-MM-DD (local time) — used to reject future incorporation dates.
  const todayStr = new Date().toISOString().split('T')[0];
  const incorpDateValid =
    !!data.company.incorporationDate && data.company.incorporationDate <= todayStr;

  // ⚠️ THE REGIME VOCABULARY IS NOT THE SAME ON BOTH SURFACES — DO NOT "SYMMETRISE"
  // THIS. Paramètres holds the DB values 'LSA' | 'CBCA'; this flow holds
  // 'LSAQ' | 'CBCA' (see `incorporationTypes` above), and OnboardingFlow converts
  // LSAQ → LSA at write time. Testing `=== 'CBCA'` is correct on BOTH sides;
  // testing `!== 'LSA'` would be silently WRONG here, matching every company.
  //
  // Reading the shared `data` state is what makes the field ungrey on the same
  // render: line ~194 already compares this exact expression to drive the selected
  // card's amber border, so its result is visible on screen before this guard
  // reads it.
  const isCBCA = data.company.incorporationType === 'CBCA';

  function update(field: keyof typeof data.company, value: string) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  }

  function updateNum(field: 'fiscalYearEndMonth' | 'fiscalYearEndDay', value: number) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
  }

  // ONE endpoint for BOTH identifiers. The field name is a key the server maps through
  // a literal whitelist — it is never a column name travelling from here.
  // `exists` still means "held by SOMEONE ELSE": the server excludes the caller's own
  // companies, which is what lets a returning user retype their own number.
  async function checkIdentifierDuplicate(
    field: 'neq' | 'corporationNumber',
    value: string,
  ): Promise<boolean> {
    const setFlag = field === 'neq' ? setNeqDuplicate : setCorpNumberDuplicate;
    if (!value.trim()) { setFlag(false); return false; }
    try {
      const res = await fetch('/api/onboarding/check-identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      });
      const json = await res.json();
      const isDuplicate = json.exists === true;
      setFlag(isDuplicate);
      return isDuplicate;
    } catch {
      // non-fatal — don't block the form on network error
      return false;
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!data.company.legalName.trim()) e.legalName = fr ? 'Champ requis' : 'Required field';
    if (!data.company.incorporationDate) {
      e.incorporationDate = ob.incorporationDateRequired;
    } else if (data.company.incorporationDate > todayStr) {
      e.incorporationDate = ob.incorporationDateFuture;
    }
    // One key, read in BOTH places. The old copy was a hardcoded FR/EN ternary
    // duplicated here and in the JSX below, and it promised an invitation flow that
    // does not exist — same defect as a right offered without a path built for it.
    //
    // ⚠️ MANDATORY BY REGIME, AND THE RULE HAS AN EXPIRY DATE.
    // LSAQ requires the NEQ. CBCA requires the NEQ *and* the federal number — true
    // only because ZapOkay serves Québec ONLY today: a federal corporation operating
    // here registers with the REQ and therefore holds a NEQ. The roadmap is
    // Canada-wide, and an Ontario federal corporation will NOT have one.
    // Multi-province is on the roadmap: whoever adds a province must revisit EVERY entry
    // in this rule, because requiring the NEQ here means opting IN, not out.
    //
    // Ordered on purpose: EMPTY beats MALFORMED beats DUPLICATE on the shared key. The
    // three states are mutually exclusive by construction — neqDuplicate can only be
    // true for a value well-formed enough to have been sent to check-identifier — so
    // neither else-if ever hides the message below it.
    //
    // ⚠️ THE FORMAT GUARD IS ON THE NEQ ONLY, and it was posed AFTER measuring: all 12
    // park rows are exactly ten digits, so it rejects zero existing rows. The federal
    // number gets no such guard — see the sourced comment above its field.
    if (!data.company.incorporationNumber.trim()) {
      e.incorporationNumber = cm.neqRequired;
    } else if (!isValidNeq(data.company.incorporationNumber)) {
      e.incorporationNumber = cm.neqInvalid;
    } else if (neqDuplicate) {
      e.incorporationNumber = ob.neqTakenByAnotherAccount;
    }
    if (isCBCA && !data.company.corporationNumber.trim()) {
      e.corporationNumber = cm.corporationNumberRequired;
    }
    if (!declared) e.declared = fr
      ? 'Vous devez cocher cette case pour continuer.'
      : 'You must check this box to continue.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleNext() {
    // Re-run duplicate check on submit in case onBlur was skipped.
    // Use the returned boolean directly — don't rely on neqDuplicate state,
    // which won't reflect setNeqDuplicate's update until the next render.
    // ⚠️ ONLY WELL-FORMED VALUES ARE ASKED ABOUT. A malformed NEQ cannot collide with a
    // stored one, and validate() below is what names the shape problem. Asking anyway
    // would spend a round-trip to learn nothing.
    if (isValidNeq(data.company.incorporationNumber)) {
      const isDuplicate = await checkIdentifierDuplicate('neq', data.company.incorporationNumber);
      if (isDuplicate) return;
    }
    const corpNumber = normalizeCorporationNumber(data.company.corporationNumber);
    if (isCBCA && corpNumber) {
      const isDuplicate = await checkIdentifierDuplicate('corporationNumber', corpNumber);
      if (isDuplicate) return;
    }
    if (validate()) onNext();
  }

  const buildingIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="14" rx="1" />
      <path d="M8 21V7" />
      <path d="M16 21V7" />
      <path d="M3 11h18" />
      <path d="M3 15h18" />
      <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 2 — SOCIÉTÉ' : 'STEP 2 — COMPANY'}
      icon={buildingIcon}
      title={fr ? 'Votre entreprise' : 'Your company'}
      locale={locale}
      onSkip={onBack}
      skipLabel={fr ? 'Retour' : 'Back'}
      onContinue={handleNext}
      continueDisabled={!incorpDateValid}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Legal name */}
        <div>
          <label style={labelStyle}>
            {fr ? "Nom légal de l'entreprise" : 'Legal name of the company'}
            <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>
          </label>
          <input
            id="legalName"
            type="text"
            value={data.company.legalName}
            onChange={e => update('legalName', e.target.value)}
            placeholder={fr ? 'ex. 9453-2281 Québec Inc.' : 'e.g. 9453-2281 Québec Inc.'}
            style={inputStyle}
          />
          {errors.legalName && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>{errors.legalName}</p>
          )}
        </div>

        {/* Incorporation type */}
        <div>
          <label style={labelStyle}>
            {fr ? 'Type de constitution' : 'Incorporation type'}
          </label>
          {/* ④ LA HAUTEUR ÉGALE DES DEUX CARTES TIENT PAR LE `stretch` IMPLICITE DE LA
              GRILLE — aucune règle ne l'écrit. Un alignItems ajouté ici la casserait en
              silence, et le nom de loi le plus long décide seul de la hauteur commune.
              ③ auto-fit + minmax remplace '1fr 1fr' : un style en ligne ne peut pas porter
              de media query, et sans ça les cartes se compressaient sans jamais s'empiler. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {incorporationTypes.map(type => {
              const isSelected = data.company.incorporationType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update('incorporationType', type.value)}
                  style={{
                    position: 'relative', padding: '14px', borderRadius: '10px', textAlign: 'left',
                    border: `2px solid ${isSelected ? '#F5B91E' : 'var(--card-border)'}`,
                    background: isSelected ? 'rgba(245,185,30,0.08)' : 'var(--card-bg)',
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                >
                  {isSelected && (
                    <span style={{
                      position: 'absolute', top: '8px', right: '8px',
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#F5B91E',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  {/* NIVEAU 1 — la pastille. Fond TRANSPARENT et bordure sémantique, et ce
                      n'est pas un repli esthétique : le bouton non sélectionné porte
                      opacity: 0.7 (ci-dessus), qui compose AUSSI son contenu. Un écart de
                      fond n'y survit pas — mesuré à 1.062 en thème clair contre --card-bg.
                      Un contour, lui, reste lisible sous la transparence — et il ne dépend
                      d'aucun écart de fond, ce qui reste vrai maintenant que l'opacité est
                      partie. DM Mono est chargée par l'@import de globals.css:1. */}
                  <div style={{
                    display: 'inline-block',
                    fontFamily: "'DM Mono', ui-monospace, monospace",
                    fontSize: '12px', fontWeight: 500, letterSpacing: '.03em',
                    padding: '3px 9px', borderRadius: '6px',
                    background: isSelected ? 'rgba(245,185,30,0.14)' : 'transparent',
                    border: `1px solid ${isSelected ? 'transparent' : 'var(--card-border)'}`,
                    color: isSelected ? 'var(--amber-800)' : 'var(--text-body)',
                  }}>
                    {cm.regimes[type.dbValue].acronym}
                  </div>
                  {/* NIVEAU 2 — la juridiction. Le marginTop de 8px est la seule valeur que la
                      spec ne fixait pas : sans elle le titre colle à la pastille. */}
                  <div style={{
                    fontFamily: 'Sora, sans-serif', fontSize: '16px', fontWeight: 600,
                    color: 'var(--text-heading)', lineHeight: 1.2, marginTop: '8px',
                  }}>
                    {cm.regimes[type.dbValue].jurisdiction}
                  </div>
                  {/* NIVEAU 3 — le nom de loi. IL S'ENROULE. Aucun overflow, aucun
                      textOverflow, aucun whiteSpace nowrap, aucune infobulle : un titre de loi
                      tronqué est FAUX, pas abrégé. */}
                  <div style={{
                    fontFamily: 'DM Sans, sans-serif', fontSize: '12px', fontWeight: 400,
                    color: 'var(--text-body)', lineHeight: 1.4, marginTop: '3px',
                  }}>
                    {cm.regimes[type.dbValue].law}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* NEQ */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              {fr ? "NEQ (Numéro d'entreprise du Québec)" : 'NEQ (Québec Enterprise Number)'}
            </label>
            <div style={{ position: 'relative', display: 'inline-block' }} className="group">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'help' }}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div style={{
                position: 'absolute', left: '20px', top: 0, zIndex: 40,
                width: '256px', borderRadius: '10px',
                border: '1px solid var(--card-border)', background: 'var(--card-bg)',
                padding: '12px', fontSize: '12px', color: 'var(--text-body)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }} className="hidden group-hover:block">
                {fr
                  ? "Le NEQ est le numéro à 10 chiffres attribué à votre entreprise par le Registraire des entreprises du Québec. Vous le trouverez sur vos statuts de constitution ou votre extrait du REQ."
                  : "The NEQ is the 10-digit number assigned to your company by the Québec Enterprise Registrar. You can find it on your articles of incorporation or REQ extract."}
              </div>
            </div>
          </div>
          <input
            id="incorporationNumber"
            type="text"
            inputMode="numeric"
            value={data.company.incorporationNumber}
            onChange={e => {
              update('incorporationNumber', normalizeNeq(e.target.value));
              setNeqDuplicate(false);
            }}
            onBlur={e => checkIdentifierDuplicate('neq', normalizeNeq(e.target.value))}
            placeholder={fr ? 'ex. 1234567890' : 'e.g. 1234567890'}
            maxLength={10}
            style={inputStyle}
          />
          {data.company.incorporationNumber.length > 0 && data.company.incorporationNumber.length < 10 && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#d97706' }}>
              {fr ? `${10 - data.company.incorporationNumber.length} chiffres manquants` : `${10 - data.company.incorporationNumber.length} digits missing`}
            </p>
          )}
          {neqDuplicate && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444' }}>
              {ob.neqTakenByAnotherAccount}
            </p>
          )}
          {errors.incorporationNumber && !neqDuplicate && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444' }}>{errors.incorporationNumber}</p>
          )}
        </div>

        {/* Numéro de société fédéral — OPTIONAL, like the NEQ above. No padlock:
            nothing on this screen is saved yet, and a padlock protects a value that
            already IS. Nothing is moved; the regime selector is already above. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              {ob.corporationNumber}
            </label>
            {/* SOURCED — Corporations Canada (ISED), two primary documents for the
                SAME corporation, one already in our own park:
                  · Certificate of Incorporation, official bilingual label
                    "Corporation number / Numéro de société" → 1709431-1
                  · Canada's Business Registries, label "Registry ID" → 17094311
                  · Corporations Canada "Search tips": "seven-digit corporation number"
                Seven digits plus a check digit. The hyphen is PRESENTATION, not
                information — the certificate carries it, the online registry does not.
                That is why this copy names both forms instead of picking one: the user
                may legitimately have either in front of them.
                ⚠️ The CRA Business Number is a different identifier: 752378166RC0001 —
                nine digits plus a program account. The copy's warning is accurate.
                ⚠️ STILL OPEN (Harvey), and it is the ONLY reason there is no format
                guard here: are older corporation numbers ever shorter than seven
                digits, or zero-padded? Until that lands, Harvey's standing
                recommendation "allow at least 12" holds, and the cost asymmetry
                decides — accepting a malformed number is repairable in Settings;
                REJECTING A LEGITIMATE ONE LOSES A CUSTOMER AT SIGNUP.
                ⚠️⚠️ "BOTH FORMS ARE ACCEPTED" IS A PROMISE THIS CODE DOES NOT FULLY
                KEEP. The field does accept both — that part is true for the user. But
                check-identifier compares value.trim() through .eq(), and the partial
                unique index compares the same way, so 1709431-1 and 17094311 are two
                distinct values to BOTH mechanisms: two accounts can register the SAME
                corporation under the two spellings and nothing catches it.
                Normalisation is the next lot; this sentence is what makes it due.
                CSS-only tooltip: the pattern of the NEQ above, not the useState one
                used in SettingsClient. Each file follows what is already in it. */}
            <div style={{ position: 'relative', display: 'inline-block' }} className="group">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'help' }}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div style={{
                position: 'absolute', left: '20px', top: 0, zIndex: 40,
                width: '256px', borderRadius: '10px',
                border: '1px solid var(--card-border)', background: 'var(--card-bg)',
                padding: '12px', fontSize: '12px', color: 'var(--text-body)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }} className="hidden group-hover:block">
                {cm.corporationNumberTooltip}
              </div>
            </div>
          </div>
          {/* NO FORMAT VALIDATION, DELIBERATELY. Dom's real number is `1810444-1` —
              digits AND a hyphen. The NEQ's `replace(/\D/g,'')` + `maxLength={10}`
              pair sits ten lines above and would eat the hyphen and truncate, in
              silence. Do not copy it down here. */}
          {/* ── THE 12-CHARACTER CAP IS PRUDENCE, NOT PRECISION. ──
              ⚠️ DO NOT TIGHTEN IT TO 9. Nothing in the documentation FIXES this
              identifier's length; everything POINTS at 9 without guaranteeing it,
              and Harvey's recommendation is explicitly "allow at least 12". A cap
              at 9 would REFUSE a real number the day the form differs — the exact
              failure this lot already avoided once, when an invented regex would
              have rejected `1810444-1`. A cap at 12 blocks the absurd (the camera
              accepted 30 digits) without refusing anything plausible.
              ★ AND IT IS NOT FORMAT VALIDATION: `maxLength` alone, and NO
              `replace(/\D/g,'')`. The hyphen must pass.
              ⚠️ IT BOUNDS TYPING ONLY. A value arriving from the session draft or
              from the database is never truncated by it — do not read it as a
              length guarantee on the stored value. This lot makes no such
              guarantee. ── */}
          <input
            id="corporationNumber"
            type="text"
            value={data.company.corporationNumber}
            onChange={e => {
              update('corporationNumber', normalizeCorporationNumber(e.target.value));
              setCorpNumberDuplicate(false);
            }}
            onBlur={e => checkIdentifierDuplicate('corporationNumber', normalizeCorporationNumber(e.target.value))}
            disabled={!isCBCA}
            maxLength={12}
            style={isCBCA ? inputStyle : { ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}
          />
          {/* ⚠️ THIS WAS A PLACEHOLDER, AND A PLACEHOLDER CANNOT WORK HERE — found on
              camera, not by reasoning. A placeholder only shows while the input is
              EMPTY. Someone who types a number and THEN clicks LSAQ keeps the value
              visible, so the line never appeared in the one case that needed it.
              And the value must survive: switching back to CBCA restores it.
              "Keep what was typed" and "state the rule inside the box" are mutually
              exclusive, so the rule moved OUT of the box. Do not put it back.
              Style: `var(--text-muted)` at 12px is the help-text pattern of the
              fiscal-year block below; `marginTop: '4px'` is how this screen places a
              note UNDER an input (the NEQ's own messages above use it, in amber and
              red — this one is neutral because it states a rule, not an error). */}
          {!isCBCA && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {ob.corporationNumberFederalOnly}
            </p>
          )}
          {/* Error slot, copied from the NEQ's at the top of this file — same tag, same
              12px/#ef4444/marginTop, so the two identifiers report the same way. It did
              NOT exist before: the field had no way to say it was missing. No
              !isCBCA guard is needed here — validate() only ever sets this key while
              isCBCA, so a stale error cannot survive a switch back to LSAQ. */}
          {corpNumberDuplicate && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444' }}>
              {ob.corporationNumberTakenByAnotherAccount}
            </p>
          )}
          {errors.corporationNumber && !corpNumberDuplicate && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444' }}>{errors.corporationNumber}</p>
          )}
        </div>

        {/* Incorporation date */}
        <div>
          <label style={labelStyle}>
            {fr ? 'Date de constitution' : 'Incorporation date'}
            <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>
          </label>
          <input
            id="incorporationDate"
            type="date"
            value={data.company.incorporationDate}
            onChange={e => update('incorporationDate', e.target.value)}
            placeholder={ob.incorporationDatePlaceholder}
            max={todayStr}
            style={inputStyle}
          />
          {errors.incorporationDate && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>{errors.incorporationDate}</p>
          )}
        </div>

        {/* Fiscal year end */}
        <div>
          <label style={labelStyle}>
            {fr ? "Fin d'exercice financier" : 'Fiscal Year end'}
          </label>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', marginTop: '-2px' }}>
            {fr ? 'Requis pour le calcul de conformité' : 'Required for compliance calculation'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select
              value={data.company.fiscalYearEndMonth}
              onChange={e => updateNum('fiscalYearEndMonth', parseInt(e.target.value))}
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>
                  {fr ? MONTHS_FR[m - 1] : MONTHS_EN[m - 1]}
                </option>
              ))}
            </select>
            <select
              value={data.company.fiscalYearEndDay}
              onChange={e => updateNum('fiscalYearEndDay', parseInt(e.target.value))}
              style={inputStyle}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Declaration checkbox */}
        <div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={declared}
              onChange={e => {
                setDeclared(e.target.checked);
                if (e.target.checked && errors.declared) setErrors(prev => ({ ...prev, declared: '' }));
              }}
              style={{
                marginTop: '2px', flexShrink: 0,
                width: '16px', height: '16px', cursor: 'pointer',
                accentColor: '#F5B91E',
              }}
            />
            <span style={{
              fontSize: '13px',
              color: errors.declared ? '#ef4444' : 'var(--text-body)',
              lineHeight: 1.5,
            }}>
              {fr
                ? 'Je déclare être autorisé(e) à gérer le livre de minutes de cette entreprise.'
                : 'I declare that I am authorized to manage this company\'s minute book.'}
            </span>
          </label>
          {errors.declared && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444', paddingLeft: '26px' }}>
              {errors.declared}
            </p>
          )}
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
