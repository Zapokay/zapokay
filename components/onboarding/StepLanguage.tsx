'use client';
import type { OnboardingData, Language } from '@/lib/types';
import Button from '@/components/ui/Button';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
}

export function StepLanguage({ data, setData, onNext }: StepProps) {
  function select(lang: Language) {
    setData(d => ({ ...d, language: lang }));
    setTimeout(onNext, 150);
  }

  return (
    <div>
      <h1 className="font-sora text-3xl font-semibold text-navy-900 mb-2">
        Choose your language
        <span className="block text-2xl text-navy-400 mt-1">Choisissez votre langue</span>
      </h1>
      <p className="text-navy-400 text-sm mb-10">
        You can change this at any time. · Vous pouvez modifier ceci en tout temps.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {(['fr', 'en'] as Language[]).map(lang => (
          <button
            key={lang}
            onClick={() => select(lang)}
            className={`
              group relative flex flex-col items-center justify-center gap-3
              p-8 rounded-2xl border-2 transition-all duration-200 cursor-pointer
              ${data.language === lang
                ? 'border-navy-900 bg-navy-900 text-ivory shadow-lg scale-[1.02]'
                : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-body)] hover:border-[var(--input-border-hover)] hover:shadow-md'
              }
            `}
          >
            <span className="font-sora font-semibold text-lg">
              {lang === 'fr' ? 'Français' : 'English'}
            </span>
            {data.language === lang && (
              <div className="absolute top-3 right-3">
                <div className="w-5 h-5 bg-[var(--amber-400)] rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
