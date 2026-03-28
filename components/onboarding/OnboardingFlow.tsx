'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Language, OnboardingData } from '@/lib/types';
import { StepLanguage } from './StepLanguage';
import { StepCompany } from './StepCompany';
import { StepOfficer } from './StepOfficer';
import { StepConfirmation } from './StepConfirmation';
import { ZapLogo } from '@/components/ui/ZapLogo';

interface OnboardingFlowProps {
  locale: string;
  userId: string;
}

const TOTAL_STEPS = 4;
const today = new Date().toISOString().split('T')[0];

const provinceNames: Record<string, { fr: string; en: string }> = {
  QC: { fr: 'Québec', en: 'Québec' },
  ON: { fr: 'Ontario', en: 'Ontario' },
  BC: { fr: 'Colombie-Britannique', en: 'British Columbia' },
  AB: { fr: 'Alberta', en: 'Alberta' },
  MB: { fr: 'Manitoba', en: 'Manitoba' },
  SK: { fr: 'Saskatchewan', en: 'Saskatchewan' },
  NS: { fr: 'Nouvelle-Écosse', en: 'Nova Scotia' },
  NB: { fr: 'Nouveau-Brunswick', en: 'New Brunswick' },
  NL: { fr: 'Terre-Neuve-et-Labrador', en: 'Newfoundland and Labrador' },
  PE: { fr: 'Île-du-Prince-Édouard', en: 'Prince Edward Island' },
  YT: { fr: 'Yukon', en: 'Yukon' },
  NT: { fr: 'Territoires du Nord-Ouest', en: 'Northwest Territories' },
  NU: { fr: 'Nunavut', en: 'Nunavut' },
};

export function OnboardingFlow({ locale, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    language: locale as Language,
    company: {
      legalName: '',
      incorporationType: 'LSA',
      incorporationNumber: '',
      incorporationDate: today,
      province: 'QC',
    },
    officer: {
      fullName: '',
      role: 'director',
      startDate: today,
    },
  });

  const activeLocale = data.language || (locale as Language);
  const fr = activeLocale === 'fr';

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)); }
  function back() { setStep(s => Math.max(s - 1, 1)); }

  async function handleFinish() {
    setSaving(true);
    try {
      await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: true,
      });

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          legal_name_fr: data.company.legalName,
          legal_name_en: data.company.legalName,
          incorporation_type: data.company.incorporationType,
          incorporation_number: data.company.incorporationNumber || null,
          incorporation_date: data.company.incorporationDate || null,
          province: data.company.province,
          status: 'active',
        })
        .select()
        .single();

      if (companyError) throw companyError;

      await supabase.from('company_officers').insert({
        company_id: company.id,
        full_name: data.officer.fullName,
        role: data.officer.role,
        start_date: data.officer.startDate || null,
      });

      router.push(`/${data.language}/dashboard`);
      router.refresh();
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSaving(false);
    }
  }

  // Resolve province display name
  const provinceDisplay = provinceNames[data.company.province]?.[fr ? 'fr' : 'en'] ?? data.company.province;

  // Enrich data for confirmation display
  const displayData = {
    ...data,
    company: {
      ...data.company,
      province: provinceDisplay,
    },
  };

  const stepProps = { data, setData, onNext: next, onBack: back, locale: activeLocale };

  return (
    <div className="min-h-screen bg-ivory">
      <header className="border-b border-ivory-dark bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <ZapLogo size="sm" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-navy-400">
              {step} / {TOTAL_STEPS}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full transition-all duration-300 ${
                    i + 1 <= step ? 'bg-navy-900' : 'bg-navy-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-12">
        <div className="animate-fade-up">
          {step === 1 && <StepLanguage {...stepProps} />}
          {step === 2 && <StepCompany {...stepProps} />}
          {step === 3 && <StepOfficer {...stepProps} />}
          {step === 4 && (
            <StepConfirmation
              {...stepProps}
              data={displayData}
              onFinish={handleFinish}
              saving={saving}
            />
          )}
        </div>
      </main>
    </div>
  );
}
