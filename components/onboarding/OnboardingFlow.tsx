'use client';
import React, { useState, useEffect, useCallback } from 'react';
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
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import LanguageToggle from '@/components/ui/LanguageToggle';

interface OnboardingFlowProps {
  locale: string;
  userId: string;
}

// Step 8 (Fiscal Years) is a separate page — dots show 8 total
const TOTAL_STEPS = 8;
const today = new Date().toISOString().split('T')[0];

// #146 Phase D: in-progress onboarding draft persisted to sessionStorage so input
// survives a locale switch (URL nav remounts the flow) AND a page refresh. Per-user
// key; a corrupt or old-version draft is discarded (try/catch + version gate) and
// never crashes onboarding. v2: OnboardingShareholder gained a REQUIRED
// pricePerShare field, so a v1 draft would rehydrate a shareholder without it.
// v3: OnboardingData.company gained a REQUIRED corporationNumber, so a v2 draft
// would rehydrate a company without it.
// ★ AND TYPESCRIPT CANNOT CATCH THAT — which is the whole reason this counter
// exists. `readOnboardingDraft` below returns `parsed as OnboardingDraft`, an
// ASSERTION: with the field declared required, tsc believes it is present while
// the session JSON does not contain it. The value would reach the input as
// `undefined` and flip the field from uncontrolled to controlled on the first
// keystroke. The version gate is the only thing that can reject such a draft.
const DRAFT_VERSION = 3;

interface OnboardingDraft {
  v: number;
  step: number;
  data: OnboardingData;
  companyId: string | null;
  incorporationDate: string;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  officers: OnboardingOfficers;
}

function onboardingDraftKey(userId: string) {
  return `zapokay:onboarding-draft:${userId}`;
}

function readOnboardingDraft(userId: string): OnboardingDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(onboardingDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.v === DRAFT_VERSION ? (parsed as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export function OnboardingFlow({ locale, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const supabase = createClient();

  // #146 Phase D: read any saved draft ONCE at mount. The lazy initializers below
  // restore it on the FIRST render (no flash). data.language is restored from the draft
  // (the step-1 document-language pick) so it survives the toggle/radio navigation;
  // onboarding CONTENT follows the URL locale regardless (activeLocale, below).
  const [draft] = useState<OnboardingDraft | null>(() => readOnboardingDraft(userId));

  const [step, setStep] = useState(() => draft?.step ?? 1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // No draft → default the document-language preference to the URL locale (#146 B3),
  // not a hardcoded 'fr'. The step-1 radio is the only user control that changes it.
  const [data, setData] = useState<OnboardingData>(() => draft?.data ?? {
    language: locale as Language,
    company: {
      legalName: '',
      incorporationType: 'LSAQ',
      incorporationNumber: '',
      corporationNumber: '',
      incorporationDate: '',
      province: 'QC',
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
    },
    officer: { fullName: '', role: 'director', startDate: today },
  });

  const [companyId, setCompanyId] = useState<string | null>(() => draft?.companyId ?? null);
  const [incorporationDate, setIncorporationDate] = useState(() => draft?.incorporationDate ?? today);

  const [directors, setDirectors] = useState<OnboardingDirector[]>(() => draft?.directors ?? []);
  const [shareholders, setShareholders] = useState<OnboardingShareholder[]>(() => draft?.shareholders ?? []);
  const [officers, setOfficers] = useState<OnboardingOfficers>(() => draft?.officers ?? {
    presidentName: '',
    secretaryName: '',
    treasurerName: '',
  });

  // #146 (option iii): onboarding CONTENT follows the URL locale. data.language is
  // the independent document-language preference (→ preferred_language), set ONLY by
  // the step-1 radio — the UI/URL toggle must never write it (CLAUDE.md §3 Two-Layer).
  const activeLocale = locale as Language;
  const fr = activeLocale === 'fr';
  const stepLabels = (activeLocale === 'fr' ? frMessages : enMessages).onboarding.stepLabels;

  // #146 Phase D: persist the draft on every state commit. React batches the setState
  // calls, so this is one coalesced write per commit — not per keystroke.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: OnboardingDraft = { v: DRAFT_VERSION, step, data, companyId, incorporationDate, directors, shareholders, officers };
    try {
      window.sessionStorage.setItem(onboardingDraftKey(userId), JSON.stringify(payload));
    } catch {
      /* sessionStorage full/unavailable — draft is best-effort, never blocks onboarding */
    }
  }, [userId, step, data, companyId, incorporationDate, directors, shareholders, officers]);

  // ── Step 3 → 4: save company + province to DB ────────────────────────────
  async function handleProvinceContinue() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error: langErr } = await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: false,
      });
      // ⚠️ THIS FIELD GOVERNS THE LANGUAGE OF EVERY GENERATED LEGAL DOCUMENT.
      // Blocking costs a retry; silence costs a minute book in the wrong language.
      if (langErr) throw langErr;

      const dbType =
        data.company.incorporationType === 'LSAQ'
          ? 'LSA'
          : data.company.incorporationType;

      const companyPayload = {
        user_id: userId,
        legal_name_fr: data.company.legalName,
        legal_name_en: data.company.legalName,
        incorporation_type: dbType,
        incorporation_number: data.company.incorporationNumber || null,
        neq: data.company.incorporationNumber || null,
        // ⚠️ GATED ON THE REGIME — DO NOT REMOVE IT AS REDUNDANT. The field is
        // disabled for LSAQ on step 2, which is NOT enough: the two regime cards
        // stay clickable for as long as step 2 is on screen, and this write only
        // fires at the step 3 → 4 transition. Typing a number, clicking LSAQ, then
        // pressing Continue twice reaches here with a number and a non-federal
        // regime. ★ It is MORE reachable than the same case in Paramètres, where
        // the equivalent slip first required opening a padlock.
        //
        // The typed value is deliberately NOT cleared when the user clicks LSAQ:
        // it survives in the session draft, so switching back to CBCA restores it.
        // It is simply never written while the regime is not federal.
        //
        // ⚠️ `=== 'CBCA'` AND NEVER `!== 'LSA'`: this flow's vocabulary is
        // 'LSAQ' | 'CBCA' and `dbType` above is what converts LSAQ → LSA. A test
        // against 'LSA' would match no company here and let every value through.
        corporation_number:
          data.company.incorporationType === 'CBCA'
            ? data.company.corporationNumber || null
            : null,
        incorporation_date: data.company.incorporationDate || null,
        province: data.company.province,
        fiscal_year_end_month: data.company.fiscalYearEndMonth,
        fiscal_year_end_day: data.company.fiscalYearEndDay,
        status: 'active',
      };

      // #146 Phase E: if a draft restored an existing companyId (user switched locale or
      // refreshed AFTER step 3 created the row), UPDATE that row instead of inserting a
      // second company — prevents a duplicate company on resume.
      const { data: company, error } = companyId
        ? await supabase.from('companies').update(companyPayload).eq('id', companyId).select().single()
        : await supabase.from('companies').insert(companyPayload).select().single();

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
    async (dirs: OnboardingDirector[]): Promise<boolean> => {
      setDirectors(dirs);
      if (companyId) {
        // Appointment dates are validated in StepDirectors BEFORE this runs, so
        // the NOT NULL on director_mandates.appointment_date cannot reject a row
        // here under normal use.
        //
        // ⚠️ KNOWN GAP, NOT CLOSED HERE — DUPLICATION ON A SECOND PASS.
        // This loop has NO pre-read. Unlike step 6, it never looks for an
        // existing company_people row before inserting one, and NEITHER
        // company_people NOR director_mandates carries a UNIQUE constraint
        // (20260405000000_sprint6_people_ownership.sql, l.9-23 and l.36-45).
        // So a second pass — even one that succeeds COMPLETELY — duplicates
        // every director and every mandate. Stopping at the first failure below
        // does NOT close that: it only stops the flow from ADVANCING on a false
        // success. Closing it needs a DB constraint or a pre-read. Queued, and
        // deliberately out of this bundle.
        for (const dir of dirs) {
          if (!dir.fullName.trim()) continue;
          const { data: person, error: personErr } = await supabase
            .from('company_people')
            .insert({
              company_id: companyId,
              full_name: dir.fullName.trim(),
              is_canadian_resident: dir.isCanadianResident,
              address_country: 'CA',
            })
            .select('id')
            .single();
          // Stop at the FIRST failure: do not advance, and never write a mandate
          // pointing at a person that was never created.
          if (personErr || !person) return false;
          const { error: mandateErr } = await supabase.from('director_mandates').insert({
            company_id: companyId,
            person_id: person.id,
            appointment_date: dir.appointmentDate,
            is_active: true,
          });
          if (mandateErr) return false;
        }
      } else {
        // Same false-success shape as step 5: no company means nothing can be
        // written, so advancing to step 5 would report a success that never
        // happened. Not reachable through the normal flow (step 3 sets companyId
        // before it advances), which is exactly why it must not be a silent true.
        return false;
      }
      setStep(5);
      return true;
    },
    [companyId, supabase]
  );

  // ── Step 5: Shareholders ─────────────────────────────────────────────────
  const handleShareholdersContinue = useCallback(
    async (shs: OnboardingShareholder[]): Promise<boolean> => {
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
          // Prices are validated in StepShareholders BEFORE this runs, so the
          // A-SC guard cannot reject a row here under normal use. An UNEXPECTED
          // server failure at the n-th shareholder still leaves rows 1..n-1
          // written: shareholdings carries no UNIQUE constraint, so pressing
          // Continue again would DUPLICATE them. Known and NOT closed here —
          // deduplication needs a DB constraint or a pre-read, and is queued.
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
            // Atom 2 (Q-R-G2-A): Pattern β2 RPC. Individual-only holder for atom 2;
            // entity-holder onboarding paths are atom 3+ scope.
            const { error: shErr } = await supabase.rpc('create_shareholding_with_holders', {
              p_shareholding: {
                company_id: companyId,
                share_class_id: shareClassId,
                quantity: sh.numberOfShares,
                issue_date: sh.issueDate,
                issue_price_per_share: parseFloat(sh.pricePerShare),
                certificate_number: String(certNum).padStart(3, '0'),
              },
              p_holders: [
                { holder_type: 'individual', person_id: personId },
              ],
            });
            // Stop at the FIRST failure: do not advance, and do not consume
            // another certificate number — they are a real, readable series in
            // a minute book, and a gap is a defect a human will one day chase.
            if (shErr) return false;
            certNum++;
          }
        } else {
          // CANNOT write — which is NOT the same as having nothing to write.
          // The share class is created above for EVERY company, independently
          // of whether any shareholder was entered, so a null here means both
          // the SELECT and the INSERT failed. A user who entered no shareholder
          // still gets a share class, skips every row in the loop, and advances
          // normally — that path stays open on purpose.
          return false;
        }
      } else {
        // Same false-success shape: no company means nothing can be written, so
        // advancing to step 6 would report a success that never happened. Not
        // reachable through the normal flow (step 3 sets companyId before it
        // advances), which is exactly why it must not be left as a silent true.
        return false;
      }
      setStep(6);
      return true;
    },
    [companyId, supabase]
  );

  // ── Step 6: Officers ─────────────────────────────────────────────────────
  const handleOfficersContinue = useCallback(
    async (offs: OnboardingOfficers): Promise<boolean> => {
      setOfficers(offs);
      if (companyId) {
        const appointmentDate = incorporationDate || today;

        // ⚠️ KNOWN GAP, NOT CLOSED HERE — DUPLICATION ON A SECOND PASS.
        // The pre-read below reuses an existing company_people row, so people are
        // NOT duplicated on a retry. officer_appointments is a different story:
        // it is inserted unconditionally, with no pre-read and no UNIQUE
        // constraint (20260405000000_sprint6_people_ownership.sql, l.60-71). A
        // second pass appoints the same person to the same title twice. Stopping
        // at the first failure below does NOT close that — it only stops the flow
        // from ADVANCING on a false success. Queued, out of this bundle.
        //
        // Returns true on success, false on the first failed write.
        const appointOfficer = async (
          name: string,
          title: 'president' | 'secretary' | 'treasurer'
        ): Promise<boolean> => {
          if (!name.trim()) return true;
          const { data: people, error: peopleErr } = await supabase
            .from('company_people')
            .select('id')
            .eq('company_id', companyId)
            .ilike('full_name', name.trim());
          // ⚠️ A FAILED LOOKUP IS NOT "NO SUCH PERSON". Falling through to the
          // insert on an error would create a SECOND row for someone who already
          // exists — the pre-read's whole purpose, inverted. Stop instead.
          if (peopleErr) return false;
          let personId: string;
          if (people && people.length > 0) {
            personId = people[0].id;
          } else {
            const { data: newPerson, error: newPersonErr } = await supabase
              .from('company_people')
              .insert({ company_id: companyId, full_name: name.trim(), address_country: 'CA' })
              .select('id')
              .single();
            if (newPersonErr || !newPerson) return false;
            personId = newPerson.id;
          }
          const { error: apptErr } = await supabase.from('officer_appointments').insert({
            company_id: companyId,
            person_id: personId,
            title,
            is_primary_signing_authority: title === 'president',
            appointment_date: appointmentDate,
            is_active: true,
          });
          if (apptErr) return false;
          return true;
        };
        // Sequential and short-circuiting: stop at the first officer that fails,
        // so a later title is never appointed over a broken earlier one.
        if (!(await appointOfficer(offs.presidentName, 'president'))) return false;
        if (!(await appointOfficer(offs.secretaryName, 'secretary'))) return false;
        if (!(await appointOfficer(offs.treasurerName, 'treasurer'))) return false;
      } else {
        // Same false-success shape as steps 4 and 5: no company means nothing can
        // be written, so advancing to step 7 would report a success that never
        // happened. Not reachable through the normal flow.
        return false;
      }
      setStep(7);
      return true;
    },
    [companyId, incorporationDate, supabase]
  );

  // ── Step 7: Celebration → fiscal-years ──────────────────────────────────
  // BUG 4 fix: set onboarding_completed here, navigate WITHOUT router.refresh()
  // (router.refresh() was causing the onboarding page to re-render, see
  //  onboarding_completed=true, and redirect to dashboard before fiscal-years loaded)
  const handleCelebrationContinue = useCallback(async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from('users').upsert({
        id: userId,
        preferred_language: data.language,
        onboarding_completed: true,
      });
      // ⚠️ BLOCKING IS THE EXIT, NOT A PRECAUTION. Ten pages read this flag and
      // redirect to /onboarding when it is false (dashboard, settings, activity,
      // officers, shareholders, directors, minute-book ×3, [locale]/page.tsx).
      // Navigating past a failed write traps the user in a loop with the company
      // already created. Staying here is the only way out.
      if (error) {
        console.error('[onboarding] step 7 users.upsert failed:', error);
        return false;
      }
    } catch (err) {
      // supabase-js RETURNS { error } on Postgres and THROWS on a network
      // failure. Both must return false, or the button freezes with no message.
      console.error('[onboarding] step 7 users.upsert threw:', err);
      return false;
    }
    // #146 Phase D: onboarding done — clear the draft so a fresh start can't resurrect it.
    try { window.sessionStorage.removeItem(onboardingDraftKey(userId)); } catch {}
    router.push(`/${locale}/onboarding/fiscal-years`);
    return true;
  }, [userId, data.language, locale, supabase, router]);

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
          <LanguageToggle />
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div style={{ padding: '24px 32px 0', maxWidth: '820px', margin: '0 auto' }}>
        {(() => {
          const STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
          const AMBER = '#F5B91E';
          const PAGE = 'var(--page-bg)';
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
              {STEP_NUMBERS.map((sNum, i) => {
                const done = sNum < step;
                const current = sNum === step;
                const isLast = i === STEP_NUMBERS.length - 1;
                const labelKey = `step${sNum}` as keyof typeof stepLabels;
                return (
                  <React.Fragment key={i}>
                    {/* Circle + label — fixed 88px width so labels never shift circles */}
                    <div style={{ width: '88px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
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
                        maxWidth: '88px', textAlign: 'center',
                      }}>
                        {stepLabels[labelKey]}
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
        {step === 7 && <StepCelebration locale={activeLocale} companyName={data.company.legalName} incorporationType={data.company.incorporationType} directors={directors} shareholders={shareholders} officers={officers} onContinue={handleCelebrationContinue} />}
      </main>
    </div>
  );
}
