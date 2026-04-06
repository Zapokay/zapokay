'use client';
import { useState } from 'react';
import type { OnboardingData, IncorporationType, Province } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

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

const isFr = (locale: string) => locale === 'fr';

export function StepCompany({ data, setData, onNext, onBack, locale }: StepProps) {
  const fr = isFr(locale);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update(field: keyof typeof data.company, value: string) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  }

  function updateNum(field: 'fiscalYearEndMonth' | 'fiscalYearEndDay', value: number) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!data.company.legalName.trim()) e.legalName = fr ? 'Champ requis' : 'Required field';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validate()) onNext();
  }

  return (
    <div>
      <h1 className="font-sora text-3xl font-semibold text-navy-900 mb-2">
        {fr ? "Parlez-nous de votre entreprise" : "Tell us about your company"}
      </h1>
      <p className="text-navy-400 text-sm mb-8">
        {fr
          ? "Nous utiliserons ceci pour configurer votre livre des minutes."
          : "We'll use this to set up your minute book correctly."}
      </p>

      <div className="space-y-5">
        <Input
          id="legalName"
          label={fr ? "Nom légal de l'entreprise" : "Legal name of the company"}
          value={data.company.legalName}
          onChange={e => update('legalName', e.target.value)}
          placeholder={fr ? "ex. 9453-2281 Québec Inc." : "e.g. 9453-2281 Québec Inc."}
          error={errors.legalName}
          required
        />

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-2">
            {fr ? "Type de constitution" : "Incorporation type"}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {incorporationTypes.map(type => {
              const isSelected = data.company.incorporationType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update('incorporationType', type.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all relative ${
                    isSelected
                      ? 'border-[var(--amber-400)] bg-[var(--amber-50)] shadow-sm'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] opacity-60 hover:opacity-100 hover:border-[var(--input-border-hover)]'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-6 h-6 bg-[var(--amber-400)] rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  <div className="font-sora font-semibold text-sm text-navy-900">
                    {fr ? type.labelFr : type.labelEn}
                  </div>
                  <div className="text-xs text-navy-400 mt-0.5">
                    {fr ? type.subFr : type.subEn}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-sm font-medium text-navy-700">
              {fr ? "NEQ (Numéro d'entreprise du Québec)" : "NEQ (Québec Enterprise Number)"}
            </label>
            <div className="relative group">
              <svg className="w-4 h-4 text-navy-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute left-5 top-0 z-40 hidden group-hover:block w-64 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-xs text-[var(--text-body)] shadow-lg">
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
            }}
            placeholder={fr ? "ex. 1234567890" : "e.g. 1234567890"}
            maxLength={10}
            className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] placeholder:text-[var(--input-placeholder)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
          />
          {data.company.incorporationNumber.length > 0 && data.company.incorporationNumber.length < 10 && (
            <p className="mt-1 text-xs text-amber-600">
              {fr ? `${10 - data.company.incorporationNumber.length} chiffres manquants` : `${10 - data.company.incorporationNumber.length} digits missing`}
            </p>
          )}
        </div>

        <Input
          id="incorporationDate"
          label={fr ? "Date de constitution" : "Incorporation date"}
          type="date"
          value={data.company.incorporationDate}
          onChange={e => update('incorporationDate', e.target.value)}
        />

        {/* Fin d'exercice financier */}
        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1">
            {fr ? "Fin d'exercice financier" : "Fiscal year end"}
          </label>
          <p className="text-xs text-navy-400 mb-2">
            {fr
              ? "Requis pour le calcul de conformité"
              : "Required for compliance calculation"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={data.company.fiscalYearEndMonth}
              onChange={e => updateNum('fiscalYearEndMonth', parseInt(e.target.value))}
              className="px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
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
              className="px-3 py-2 rounded-xl text-sm border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-body)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          {fr ? "Retour" : "Back"}
        </Button>
        <Button onClick={handleNext} variant="secondary" className="flex-1" size="lg">
          {fr ? "Continuer" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
