'use client';
import { useRouter, usePathname } from 'next/navigation';
import type { OnboardingData, Language } from '@/lib/types';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
}

export function StepLanguage({ data, setData, onNext, locale }: StepProps) {
  const router = useRouter();
  const pathname = usePathname();
  // #146 (option iii): step-1 display follows the URL locale, like every other step.
  const fr = locale === 'fr';
  // Static-import pattern (see project_onboarding_dual_locale memory): mirror the URL
  // locale without a render-time useTranslations() dependency.
  const ob = (fr ? frMessages : enMessages).onboarding;

  function select(lang: Language) {
    // Sets the document-language preference (→ preferred_language) AND navigates so the
    // onboarding display follows the pick (#146 option iii), using the same path-rewrite
    // as LanguageToggle. The draft write-effect persists data.language before the async nav.
    setData(d => ({ ...d, language: lang }));
    if (lang !== locale) router.replace(pathname.replace(`/${locale}/`, `/${lang}/`));
  }

  const globeIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 1 0 20 14.5 14.5 0 0 1 0-20" />
      <path d="M2 12h20" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 1 — LANGUE' : 'STEP 1 — LANGUAGE'}
      icon={globeIcon}
      title={fr ? (
        <>Choisissez<br />votre langue</>
      ) : (
        <>Choose<br />your language</>
      )}
      locale={locale}
      onContinue={onNext}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {(['fr', 'en'] as Language[]).map(lang => {
          const isSelected = data.language === lang;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => select(lang)}
              style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '8px', padding: '28px 16px',
                borderRadius: '14px',
                border: `2px solid ${isSelected ? '#F5B91E' : 'var(--card-border)'}`,
                background: isSelected ? 'rgba(245,185,30,0.08)' : 'var(--card-bg)',
                cursor: 'pointer', transition: 'all 200ms',
              }}
            >
              <span style={{
                fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '16px',
                color: 'var(--text-heading)',
              }}>
                {lang === 'fr' ? 'Français' : 'English'}
              </span>
              {isSelected && (
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: '#F5B91E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p style={{
        fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5,
        marginTop: '14px', marginBottom: 0, textAlign: 'left',
      }}>
        {ob.languageNote}
      </p>
    </OnboardingStepLayout>
  );
}
