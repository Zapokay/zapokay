'use client';
import type { OnboardingData, Province } from '@/lib/types';
import { OnboardingStepLayout } from './OnboardingStepLayout';

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

  const mapPinIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 3 — PROVINCE' : 'STEP 3 — PROVINCE'}
      icon={mapPinIcon}
      title={fr ? 'Dans quelle province ?' : 'Which province?'}
      locale={locale}
      onSkip={onBack}
      skipLabel={fr ? 'Retour' : 'Back'}
      onContinue={onNext}
      saving={saving}
      continueLabel={saving ? (fr ? 'Enregistrement…' : 'Saving…') : undefined}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {provinces.map(p => {
          const isSelected = data.company.province === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => select(p.value as Province)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '4px', padding: '14px 10px',
                borderRadius: '10px',
                border: `2px solid ${isSelected ? '#F5B91E' : 'var(--card-border)'}`,
                background: isSelected ? 'rgba(245,185,30,0.08)' : 'var(--card-bg)',
                cursor: 'pointer', transition: 'all 150ms',
              }}
            >
              {isSelected && (
                <div style={{
                  position: 'absolute', top: '6px', right: '6px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: '#F5B91E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <span style={{
                fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '11px',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}>
                {p.value}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-body)', textAlign: 'center', lineHeight: 1.3 }}>
                {fr ? p.labelFr : p.labelEn}
              </span>
            </button>
          );
        })}
      </div>

      {saveError && (
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#ef4444' }}>{saveError}</p>
      )}
    </OnboardingStepLayout>
  );
}
