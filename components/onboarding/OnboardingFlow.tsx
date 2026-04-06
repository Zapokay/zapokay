'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Language, OnboardingData } from '@/lib/types';
import { StepLanguage } from './StepLanguage';
import { StepCompany } from './StepCompany';
import { StepProvince } from './StepProvince';
import StepDirectors, { type OnboardingDirector } from './StepDirectors';
import StepShareholders, { type OnboardingShareholder } from './StepShareholders';
import StepOfficers, { type OnboardingOfficers } from './StepOfficers';
import StepCelebration from './StepCelebration';
import { ZapLogo } from '@/components/ui/ZapLogo';

interface OnboardingFlowProps {
  locale: string;
  userId: string;
}

// Step 8 (Fiscal Years) is a separate page — dots show 8 total
const TOTAL_STEPS = 8;
const today = new Date().toISOString().split('T')[0];

export function OnboardingFlow({ locale, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // BUG 5 fix: always default to French
  const [data, setData] = useState<OnboardingData>({
    language: 'fr',
    company: {
      legalName: '',
      incorporationType: 'LSAQ',
      incorporationNumber: '',
      incorporationDate: today,
      province: 'QC',
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
    },
    officer: { fullName: '', role: 'director', startDate: today },
  });

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [incorporationDate, setIncorporationDate] = useState(today);

  const [directors, setDirectors] = useState<OnboardingDirector[]>([]);
  const [shareholders, setShareholders] = useState<OnboardingShareholder[]>([]);
  const [officers, setOfficers] = useState<OnboardingOfficers>({
    presidentName: '',
    secretaryName: '',
    treasurerName: '',
  });

  // BUG 2 fix: use user's selected language, not URL locale
  const activeLocale = data.language || (locale as Language);
  const fr = activeLocale === 'fr';

  // ── Step 3 → 4: save company + province to DB ────────────────────────────
  async function handleProvinceContinue() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: false,
      });

      const dbType =
        data.company.incorporationType === 'LSAQ'
          ? 'LSA'
          : data.company.incorporationType;

      const { data: company, error } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          legal_name_fr: data.company.legalName,
          legal_name_en: data.company.legalName,
          incorporation_type: dbType,
          incorporation_number: data.company.incorporationNumber || null,
          incorporation_date: data.company.incorporationDate || null,
          province: data.company.province,
          fiscal_year_end_month: data.company.fiscalYearEndMonth,
          fiscal_year_end_day: data.company.fiscalYearEndDay,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      setCompanyId(company.id);
      setIncorporationDate(company.incorporation_date || today);
      setStep(4);
    } catch (err) {
      console.error('Company save error:', err);
      setSaveError(
        fr
          ? 'Une erreur est survenue. Veuillez réessayer.'
          : 'An error occurred. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Step 4: Directors ────────────────────────────────────────────────────
  const handleDirectorsContinue = useCallback(
    async (dirs: OnboardingDirector[]) => {
      setDirectors(dirs);
      if (companyId) {
        for (const dir of dirs) {
          if (!dir.fullName.trim()) continue;
          const { data: person } = await supabase
            .from('company_people')
            .insert({
              company_id: companyId,
              full_name: dir.fullName.trim(),
              is_canadian_resident: dir.isCanadianResident,
              address_country: 'CA',
            })
            .select('id')
            .single();
          if (person) {
            await supabase.from('director_mandates').insert({
              company_id: companyId,
              person_id: person.id,
              appointment_date: dir.appointmentDate,
              is_active: true,
            });
          }
        }
      }
      setStep(5);
    },
    [companyId, supabase]
  );

  // ── Step 5: Shareholders ─────────────────────────────────────────────────
  const handleShareholdersContinue = useCallback(
    async (shs: OnboardingShareholder[]) => {
      setShareholders(shs);
      if (companyId) {
        let shareClassId: string | null = null;
        const { data: existing } = await supabase
          .from('share_classes')
          .select('id')
          .eq('company_id', companyId)
          .limit(1);
        if (existing && existing.length > 0) {
          shareClassId = existing[0].id;
        } else {
          const { data: newClass } = await supabase
            .from('share_classes')
            .insert({
              company_id: companyId,
              name: 'Actions ordinaires / Common Shares',
              type: 'common',
              voting_rights: true,
              votes_per_share: 1,
              max_quantity: null,
            })
            .select('id')
            .single();
          shareClassId = newClass?.id || null;
        }
        if (shareClassId) {
          let certNum = 1;
          for (const sh of shs) {
            if (!sh.fullName.trim() || sh.numberOfShares <= 0) continue;
            const { data: existingPeople } = await supabase
              .from('company_people')
              .select('id')
              .eq('company_id', companyId)
              .ilike('full_name', sh.fullName.trim());
            let personId: string;
            if (existingPeople && existingPeople.length > 0) {
              personId = existingPeople[0].id;
            } else {
              const { data: newPerson } = await supabase
                .from('company_people')
                .insert({ company_id: companyId, full_name: sh.fullName.trim(), address_country: 'CA' })
                .select('id')
                .single();
              if (!newPerson) continue;
              personId = newPerson.id;
            }
            await supabase.from('shareholdings').insert({
              company_id: companyId,
              person_id: personId,
              share_class_id: shareClassId,
              quantity: sh.numberOfShares,
              issue_date: sh.issueDate,
              certificate_number: String(certNum).padStart(3, '0'),
            });
            certNum++;
          }
        }
      }
      setStep(6);
    },
    [companyId, supabase]
  );

  // ── Step 6: Officers ─────────────────────────────────────────────────────
  const handleOfficersContinue = useCallback(
    async (offs: OnboardingOfficers) => {
      setOfficers(offs);
      if (companyId) {
        const appointmentDate = incorporationDate || today;
        const appointOfficer = async (
          name: string,
          title: 'president' | 'secretary' | 'treasurer'
        ) => {
          if (!name.trim()) return;
          const { data: people } = await supabase
            .from('company_people')
            .select('id')
            .eq('company_id', companyId)
            .ilike('full_name', name.trim());
          let personId: string;
          if (people && people.length > 0) {
            personId = people[0].id;
          } else {
            const { data: newPerson } = await supabase
              .from('company_people')
              .insert({ company_id: companyId, full_name: name.trim(), address_country: 'CA' })
              .select('id')
              .single();
            if (!newPerson) return;
            personId = newPerson.id;
          }
          await supabase.from('officer_appointments').insert({
            company_id: companyId,
            person_id: personId,
            title,
            is_primary_signing_authority: title === 'president',
            appointment_date: appointmentDate,
            is_active: true,
          });
        };
        await appointOfficer(offs.presidentName, 'president');
        await appointOfficer(offs.secretaryName, 'secretary');
        await appointOfficer(offs.treasurerName, 'treasurer');
      }
      setStep(7);
    },
    [companyId, incorporationDate, supabase]
  );

  // ── Step 7: Celebration → fiscal-years ──────────────────────────────────
  // BUG 4 fix: set onboarding_completed here, navigate WITHOUT router.refresh()
  // (router.refresh() was causing the onboarding page to re-render, see
  //  onboarding_completed=true, and redirect to dashboard before fiscal-years loaded)
  const handleCelebrationContinue = useCallback(async () => {
    await supabase.from('users').upsert({
      id: userId,
      preferred_language: data.language,
      onboarding_completed: true,
    });
    router.push(`/${data.language}/onboarding/fiscal-years`);
  }, [userId, data.language, supabase, router]);

  return (
    <div className="min-h-screen bg-[var(--ob-bg)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <ZapLogo size="sm" />
          {/* Dot progress — 8 dots, last one (fiscal years) is a separate page */}
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
                      i + 1 < step ? 'bg-[var(--ob-step-done)]' : 'bg-[var(--ob-step-todo)]'
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
          {/* Step 1: Language */}
          {step === 1 && (
            <StepLanguage
              data={data}
              setData={setData}
              onNext={() => setStep(2)}
              onBack={() => {}}
              locale={activeLocale}
            />
          )}

          {/* Step 2: Company info (no Province) */}
          {step === 2 && (
            <StepCompany
              data={data}
              setData={setData}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
              locale={activeLocale}
            />
          )}

          {/* Step 3: Province — also triggers company save to DB */}
          {step === 3 && (
            <StepProvince
              data={data}
              setData={setData}
              onNext={handleProvinceContinue}
              onBack={() => setStep(2)}
              locale={activeLocale}
              saving={saving}
              saveError={saveError}
            />
          )}

          {/* Step 4: Directors */}
          {step === 4 && (
            <StepDirectors
              locale={activeLocale}
              incorporationDate={incorporationDate}
              initialDirectors={directors.length > 0 ? directors : undefined}
              onContinue={handleDirectorsContinue}
              onSkip={() => setStep(5)}
            />
          )}

          {/* Step 5: Shareholders */}
          {step === 5 && (
            <StepShareholders
              locale={activeLocale}
              directors={directors}
              incorporationDate={incorporationDate}
              initialShareholders={shareholders.length > 0 ? shareholders : undefined}
              onContinue={handleShareholdersContinue}
              onSkip={() => setStep(6)}
            />
          )}

          {/* Step 6: Officers */}
          {step === 6 && (
            <StepOfficers
              locale={activeLocale}
              directors={directors}
              shareholders={shareholders}
              incorporationDate={incorporationDate}
              initialOfficers={officers.presidentName ? officers : undefined}
              onContinue={handleOfficersContinue}
              onSkip={() => setStep(7)}
            />
          )}

          {/* Step 7: Celebration */}
          {step === 7 && (
            <StepCelebration
              locale={activeLocale}
              directors={directors}
              shareholders={shareholders}
              officers={officers}
              onContinue={handleCelebrationContinue}
            />
          )}
        </div>
      </main>
    </div>
  );
}
