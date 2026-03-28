'use client';
import { useState } from 'react';
import type { OnboardingData, OfficerRole } from '@/lib/types';
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

const isFr = (locale: string) => locale === 'fr';

const today = new Date().toISOString().split('T')[0];

export function StepOfficer({ data, setData, onNext, onBack, locale }: StepProps) {
  const fr = isFr(locale);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update(field: keyof typeof data.officer, value: string) {
    setData(d => ({ ...d, officer: { ...d.officer, [field]: value } }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!data.officer.fullName.trim()) e.fullName = fr ? 'Champ requis' : 'Required field';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div>
      <h1 className="font-sora text-3xl font-semibold text-navy-900 mb-2">
        {fr ? "Ajoutez votre premier dirigeant" : "Add your first officer"}
      </h1>
      <p className="text-navy-400 text-sm mb-8">
        {fr ? "Qui sont les personnes clés de cette entreprise?" : "Who are the key people in this company?"}
      </p>

      <div className="space-y-5">
        <Input
          id="officerName"
          label={fr ? "Nom complet" : "Full name"}
          value={data.officer.fullName}
          onChange={e => update('fullName', e.target.value)}
          placeholder={fr ? "ex. Marie Tremblay" : "e.g. Marie Tremblay"}
          error={errors.fullName}
          required
        />

        <Select
          id="officerRole"
          label={fr ? "Rôle" : "Role"}
          value={data.officer.role}
          onChange={e => update('role', e.target.value)}
        >
          <option value="director">{fr ? "Administrateur" : "Director"}</option>
          <option value="officer">{fr ? "Dirigeant" : "Officer"}</option>
          <option value="shareholder">{fr ? "Actionnaire" : "Shareholder"}</option>
        </Select>

        <Input
          id="startDate"
          label={fr ? "Date de début" : "Start date"}
          type="date"
          value={data.officer.startDate || today}
          onChange={e => update('startDate', e.target.value)}
        />
      </div>

      <div className="flex gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          {fr ? "Retour" : "Back"}
        </Button>
        <Button onClick={() => validate() && onNext()} variant="secondary" className="flex-1" size="lg">
          {fr ? "Continuer" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
