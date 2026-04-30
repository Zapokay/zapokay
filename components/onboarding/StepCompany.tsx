'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OnboardingData, IncorporationType, Province } from '@/lib/types';
import { OnboardingStepLayout } from './OnboardingStepLayout';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
}

const provinces: { value: Province; labelFr: string; labelEn: string }[] = [
  { value: 'QC', labelFr: 'Québec', labelEn: 'Québec' },
  { value: 'ON', labelFr: 'Ontario', labelEn: 'Ontario' },
  { value: 'BC', labelFr: 'Colombie-Britannique', labelEn: 'British Columbia' },
  { value: 'AB', labelFr: 'Alberta', labelEn: 'Alberta' },
  { value: 'MB', labelFr: 'Manitoba', labelEn: 'Manitoba' },
  { value: 'SK', labelFr: 'Saskatchewan', labelEn: 'Saskatchewan' },
  { value: 'NS', labelFr: 'Nouvelle-Écosse', labelEn: 'Nova Scotia' },
  { value: 'NB', labelFr: 'Nouveau-Brunswick', labelEn: 'New Brunswick' },
  { value: 'NL', labelFr: 'Terre-Neuve-et-Labrador', labelEn: 'Newfoundland and Labrador' },
  { value: 'PE', labelFr: "Île-du-Prince-Édouard", labelEn: 'Prince Edward Island' },
  { value: 'YT', labelFr: 'Yukon', labelEn: 'Yukon' },
  { value: 'NT', labelFr: 'Territoires du Nord-Ouest', labelEn: 'Northwest Territories' },
  { value: 'NU', labelFr: 'Nunavut', labelEn: 'Nunavut' },
];

const incorporationTypes = [
  {
    value: 'LSAQ' as IncorporationType,
    labelFr: 'LSAQ',
    labelEn: 'LSAQ',
    subFr: 'Provincial Québec',
    subEn: 'Québec Provincial',
  },
  {
    value: 'CBCA' as IncorporationType,
    labelFr: 'CBCA',
    labelEn: 'CBCA',
    subFr: 'Loi canadienne sur les sociétés par actions',
    subEn: 'Canada Business Corporations Act',
  },
];

const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
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
  const t = useTranslations('onboarding');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [neqDuplicate, setNeqDuplicate] = useState(false);
  const [declared, setDeclared] = useState(false);

  // Today as YYYY-MM-DD (local time) — used to reject future incorporation dates.
  const todayStr = new Date().toISOString().split('T')[0];
  const incorpDateValid =
    !!data.company.incorporationDate && data.company.incorporationDate <= todayStr;

  function update(field: keyof typeof data.company, value: string) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  }

  function updateNum(field: 'fiscalYearEndMonth' | 'fiscalYearEndDay', value: number) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
  }

  async function checkNeqDuplicate(neq: string): Promise<boolean> {
    if (!neq.trim()) { setNeqDuplicate(false); return false; }
    try {
      const res = await fetch('/api/onboarding/check-neq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neq }),
      });
      const json = await res.json();
      const isDuplicate = json.exists === true;
      setNeqDuplicate(isDuplicate);
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
      e.incorporationDate = t('incorporationDateRequired');
    } else if (data.company.incorporationDate > todayStr) {
      e.incorporationDate = t('incorporationDateFuture');
    }
    if (neqDuplicate) e.incorporationNumber = fr
      ? 'Une entreprise avec ce NEQ existe déjà sur ZapOkay. Si vous êtes autorisé(e) à y accéder, demandez à l\'administrateur de vous inviter.'
      : 'A company with this NEQ already exists on ZapOkay. If you are authorized to access it, ask the administrator to invite you.';
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
    if (data.company.incorporationNumber.trim()) {
      const isDuplicate = await checkNeqDuplicate(data.company.incorporationNumber);
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                    opacity: isSelected ? 1 : 0.7,
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
                  <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-heading)' }}>
                    {fr ? type.labelFr : type.labelEn}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {fr ? type.subFr : type.subEn}
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
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              update('incorporationNumber', val);
              setNeqDuplicate(false);
            }}
            onBlur={e => checkNeqDuplicate(e.target.value)}
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
              {fr
                ? "Une entreprise avec ce NEQ existe déjà sur ZapOkay. Si vous êtes autorisé(e) à y accéder, demandez à l'administrateur de vous inviter."
                : 'A company with this NEQ already exists on ZapOkay. If you are authorized to access it, ask the administrator to invite you.'}
            </p>
          )}
          {errors.incorporationNumber && !neqDuplicate && (
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444' }}>{errors.incorporationNumber}</p>
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
            placeholder={t('incorporationDatePlaceholder')}
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
            {fr ? "Fin d'exercice financier" : 'Fiscal year end'}
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
