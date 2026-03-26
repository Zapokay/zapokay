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

const isFr = (locale: string) => locale === 'fr';

export function StepCompany({ data, setData, onNext, onBack, locale }: StepProps) {
  const fr = isFr(locale);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update(field: keyof typeof data.company, value: string) {
    setData(d => ({ ...d, company: { ...d.company, [field]: value } }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
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
            {(['LSA', 'CBCA'] as IncorporationType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => update('incorporationType', type)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.company.incorporationType === type
                    ? 'border-navy-900 bg-navy-50'
                    : 'border-ivory-dark bg-white hover:border-navy-300'
                }`}
              >
                <div className="font-sora font-semibold text-sm text-navy-900">{type}</div>
                <div className="text-xs text-navy-400 mt-0.5">
                  {type === 'LSA'
                    ? fr ? 'Provincial Québec' : 'Québec Provincial'
                    : fr ? 'Loi canadienne' : 'Federal Canada'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Input
          id="incorporationNumber"
          label={fr ? "Numéro de constitution" : "Incorporation number"}
          value={data.company.incorporationNumber}
          onChange={e => update('incorporationNumber', e.target.value)}
          placeholder={fr ? "ex. 1234567890" : "e.g. 1234567890"}
        />

        <Input
          id="incorporationDate"
          label={fr ? "Date de constitution" : "Incorporation date"}
          type="date"
          value={data.company.incorporationDate}
          onChange={e => update('incorporationDate', e.target.value)}
        />

        <Select
          id="province"
          label={fr ? "Province" : "Province"}
          value={data.company.province}
          onChange={e => update('province', e.target.value)}
        >
          {provinces.map(p => (
            <option key={p.value} value={p.value}>
              {fr ? p.labelFr : p.labelEn}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          {fr ? "Retour" : "Back"}
        </Button>
        <Button onClick={handleNext} className="flex-1" size="lg">
          {fr ? "Continuer" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
