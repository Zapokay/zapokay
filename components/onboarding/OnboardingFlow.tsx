'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Language, OnboardingData, Province } from '@/lib/types';
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    language: locale as Language,
    company: {
      legalName: '',
      incorporationType: 'LSAQ',
      incorporationNumber: '',
      incorporationDate: today,
      province: 'QC',
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
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
    setSaveError(null);
    try {
      await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: true,
      });

      const dbIncorporationType = data.company.incorporationType === 'LSAQ' ? 'LSA' : data.company.incorporationType;

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          legal_name_fr: data.company.legalName,
          legal_name_en: data.company.legalName,
          incorporation_type: dbIncorporationType,
          incorporation_number: data.company.incorporationNumber || null,
          incorporation_date: data.company.incorporationDate || null,
          province: data.company.province,
          fiscal_year_end_month: data.company.fiscalYearEndMonth,
          fiscal_year_end_day: data.company.fiscalYearEndDay,
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

      router.push(`/${data.language}/onboarding/fiscal-years`);
      router.refresh();
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSaveError(
        fr
          ? 'Une erreur est survenue. Veuillez réessayer.'
          : 'An error occurred. Please try again.'
      );
      setSaving(false);
    }
  }

  const provinceDisplay = provinceNames[data.company.province]?.[fr ? 'fr' : 'en'] ?? data.company.province;

  const stepProps = { data, setData, onNext: next, onBack: back, locale: activeLocale };

  return (
    <div className="min-h-screen bg-[var(--ob-bg)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <ZapLogo size="sm" />
          {/* Visual dot progress with connecting track */}
          <div className="flex items-center">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className="flex items-center">
                <div
                  className={`rounded-full transition-all duration-300 ${
                    i + 1 < step
                      ? 'w-2.5 h-2.5 bg-[var(--ob-step-done)]'
                      : i + 1 === step
                      ? 'w-4 h-4 bg-[var(--ob-step-active)]'
                      : 'w-2.5 h-2.5 bg-[var(--ob-step-todo)]'
                  }`}
                />
                {i < TOTAL_STEPS - 1 && (
                  <div
                    className={`h-0.5 w-6 transition-all duration-300 ${
                      i + 1 < step
                        ? 'bg-[var(--ob-step-done)]'
                        : 'bg-[var(--ob-step-todo)]'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            {step} / {TOTAL_STEPS}
          </span>
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
              provinceDisplay={provinceDisplay}
              onFinish={handleFinish}
              saving={saving}
              error={saveError}
            />
          )}
        </div>
      </main>
    </div>
  );
}
