'use client';
import type { OnboardingData, Province } from '@/lib/types';
import Button from '@/components/ui/Button';

interface StepProvinceProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  saving?: boolean;
  saveError?: string | null;
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

export function StepProvince({ data, setData, onNext, onBack, locale, saving, saveError }: StepProvinceProps) {
  const fr = locale === 'fr';

  function select(value: Province) {
    setData(d => ({ ...d, company: { ...d.company, province: value } }));
  }

  return (
    <div>
      <h1 className="font-sora text-3xl font-semibold text-navy-900 mb-2">
        {fr ? "Province d'incorporation" : 'Province of incorporation'}
      </h1>
      <p className="text-navy-400 text-sm mb-8">
        {fr
          ? "Dans quelle province votre entreprise a-t-elle été constituée ?"
          : "In which province was your company incorporated?"}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {provinces.map(p => {
          const isSelected = data.company.province === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => select(p.value as Province)}
              className={`
                relative flex flex-col items-center justify-center gap-1
                p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer text-sm font-medium
                ${isSelected
                  ? 'border-[var(--amber-400)] bg-[var(--amber-50)] text-[var(--navy-900)] shadow-sm'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-body)] hover:border-[var(--input-border-hover)] hover:shadow-sm'
                }
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-[var(--amber-400)] rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <span className="font-sora font-semibold text-xs uppercase tracking-wide text-[var(--text-muted)]">
                {p.value}
              </span>
              <span className="text-xs text-center leading-tight">
                {fr ? p.labelFr : p.labelEn}
              </span>
            </button>
          );
        })}
      </div>

      {saveError && (
        <p className="mt-4 text-center text-sm text-red-500">{saveError}</p>
      )}

      <div className="flex gap-3 mt-8">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          {fr ? 'Retour' : 'Back'}
        </Button>
        <Button
          onClick={onNext}
          variant="secondary"
          className="flex-1"
          size="lg"
          disabled={saving}
        >
          {saving
            ? (fr ? 'Enregistrement…' : 'Saving…')
            : (fr ? 'Continuer' : 'Continue')}
        </Button>
      </div>
    </div>
  );
}
