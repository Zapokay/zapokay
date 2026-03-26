'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Language, IncorporationType, Province, OfficerRole, OnboardingData } from '@/lib/types';
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
      incorporationDate: '',
      province: 'QC',
    },
    officer: {
      fullName: '',
      role: 'director',
      startDate: '',
    },
  });

  const activeLocale = data.language || (locale as Language);

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)); }
  function back() { setStep(s => Math.max(s - 1, 1)); }

  async function handleFinish() {
    setSaving(true);
    try {
      // 1. Update user profile
      await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: true,
      });

      // 2. Create company
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

      // 3. Create first officer
      await supabase.from('company_officers').insert({
        company_id: company.id,
        full_name: data.officer.fullName,
        role: data.officer.role,
        start_date: data.officer.startDate || null,
      });

      // 4. Redirect to dashboard in selected language
      router.push(`/${data.language}/dashboard`);
      router.refresh();
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSaving(false);
    }
  }

  const stepProps = { data, setData, onNext: next, onBack: back, locale: activeLocale };

  return (
    <div className="min-h-screen bg-ivory">
      {/* Header */}
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

      {/* Content */}
      <main className="max-w-xl mx-auto px-6 py-12">
        <div className="animate-fade-up">
          {step === 1 && <StepLanguage {...stepProps} />}
          {step === 2 && <StepCompany {...stepProps} />}
          {step === 3 && <StepOfficer {...stepProps} />}
          {step === 4 && (
            <StepConfirmation {...stepProps} onFinish={handleFinish} saving={saving} />
          )}
        </div>
      </main>
    </div>
  );
}
