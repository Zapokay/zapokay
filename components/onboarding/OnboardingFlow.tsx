'use client';
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { seedDefaultActiveYears } from '@/lib/active-years';
import type { Language, OnboardingData } from '@/lib/types';
import { StepLanguage } from './StepLanguage';
import { StepCompany } from './StepCompany';
import { StepProvince } from './StepProvince';
import StepDirectors, { type OnboardingDirector } from './StepDirectors';
import StepShareholders, { type OnboardingShareholder } from './StepShareholders';
import StepOfficers, { type OnboardingOfficers } from './StepOfficers';
import StepCelebration from './StepCelebration';

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
          neq: data.company.incorporationNumber || null,
          incorporation_date: data.company.incorporationDate || null,
          province: data.company.province,
          fiscal_year_end_month: data.company.fiscalYearEndMonth,
          fiscal_year_end_day: data.company.fiscalYearEndDay,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      // Seed default active years (last 8 fiscal years, capped at incorporation).
      // Do not block onboarding if this fails — user can fix via Paramètres later.
      try {
        await seedDefaultActiveYears(
          company.id,
          data.company.incorporationDate,
          data.company.fiscalYearEndMonth,
          data.company.fiscalYearEndDay,
          supabase
        );
      } catch (err) {
        console.error('[onboarding] Failed to seed active years:', err);
        // Do not rethrow — onboarding continues.
      }

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
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>
      {/* ─── Header ─── */}
      <header style={{
        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
      }}>
        {/* Left: Z tag + ZapOkay signature */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Z tag — 28x28 charcoal rounded square with amber Z + amber dot */}
          <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '6px', background: '#1C1A17', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '18px', color: '#F5B91E', lineHeight: 1 }}>Z</span>
            <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#F5B91E', border: '1.5px solid var(--page-bg)' }} />
          </div>
          {/* Signature */}
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 900, fontSize: '14px', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#F5B91E' }}>Zap</span>
            <span style={{ color: 'var(--wm-okay)' }}>Okay</span>
          </span>
        </div>

        {/* Right: Aide link + FR/EN toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="#" style={{ fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            {fr ? 'Aide' : 'Help'}
          </a>
          {/* Lang toggle */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['fr', 'en'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setData(d => ({ ...d, language: lang }))}
                style={{
                  padding: '3px 8px', fontSize: '10px', fontWeight: 600,
                  borderRadius: '5px', border: '1px solid #E6E4DE',
                  cursor: 'pointer', transition: 'all 120ms',
                  background: activeLocale === lang ? '#1C1A17' : 'white',
                  color: activeLocale === lang ? 'white' : '#7A7066',
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div style={{ padding: '24px 32px 0', maxWidth: '700px', margin: '0 auto' }}>
        {(() => {
          const stepConfig = [
            { labelFr: 'Langue',   labelEn: 'Language' },
            { labelFr: 'Société',  labelEn: 'Company' },
            { labelFr: 'Province', labelEn: 'Province' },
            { labelFr: 'Admin.',   labelEn: 'Directors' },
            { labelFr: 'Action.',  labelEn: 'Shares' },
            { labelFr: 'Dirig.',   labelEn: 'Officers' },
            { labelFr: 'Sommaire', labelEn: 'Summary' },
            { labelFr: 'Fiscal',   labelEn: 'Fiscal' },
          ];
          const AMBER = '#F5B91E';
          const PAGE = 'var(--page-bg)';
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
              {stepConfig.map((sc, i) => {
                const sNum = i + 1;
                const done = sNum < step;
                const current = sNum === step;
                const isLast = i === stepConfig.length - 1;
                return (
                  <React.Fragment key={i}>
                    {/* Circle + label — fixed 56px width so labels never shift circles */}
                    <div style={{ width: '56px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: done || current ? AMBER : 'var(--ob-circle-todo-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        outline: `3px solid ${PAGE}`,
                        outlineOffset: '0px',
                        flexShrink: 0,
                        zIndex: 1, position: 'relative',
                      }}>
                        {done ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span style={{
                            fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '11px',
                            color: current ? 'white' : 'var(--ob-circle-todo-text)',
                          }}>{sNum}</span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '9px', fontWeight: current ? 700 : 400,
                        color: current ? 'var(--ob-label-active)' : 'var(--ob-label-done)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: '56px', textAlign: 'center',
                      }}>
                        {fr ? sc.labelFr : sc.labelEn}
                      </span>
                    </div>
                    {/* Connecting line — vertically centered at circle midpoint (16px from top) */}
                    {!isLast && (
                      <div style={{
                        flex: 1, height: '4px', flexShrink: 1,
                        marginTop: '14px',
                        zIndex: 0,
                        background: done ? AMBER : 'var(--ob-track-bg)',
                        transition: 'background 300ms',
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ─── Main content ─── */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 24px 40px' }}>
        {step === 1 && <StepLanguage data={data} setData={setData} onNext={() => setStep(2)} onBack={() => {}} locale={activeLocale} />}
        {step === 2 && <StepCompany data={data} setData={setData} onNext={() => setStep(3)} onBack={() => setStep(1)} locale={activeLocale} />}
        {step === 3 && <StepProvince data={data} setData={setData} onNext={handleProvinceContinue} onBack={() => setStep(2)} locale={activeLocale} saving={saving} saveError={saveError} />}
        {step === 4 && <StepDirectors locale={activeLocale} incorporationDate={incorporationDate} initialDirectors={directors.length > 0 ? directors : undefined} onContinue={handleDirectorsContinue} onSkip={() => setStep(5)} />}
        {step === 5 && <StepShareholders locale={activeLocale} directors={directors} incorporationDate={incorporationDate} initialShareholders={shareholders.length > 0 ? shareholders : undefined} onContinue={handleShareholdersContinue} onSkip={() => setStep(6)} />}
        {step === 6 && <StepOfficers locale={activeLocale} directors={directors} shareholders={shareholders} incorporationDate={incorporationDate} initialOfficers={officers.presidentName ? officers : undefined} onContinue={handleOfficersContinue} onSkip={() => setStep(7)} />}
        {step === 7 && <StepCelebration locale={activeLocale} directors={directors} shareholders={shareholders} officers={officers} onContinue={handleCelebrationContinue} />}
      </main>
    </div>
  );
}
