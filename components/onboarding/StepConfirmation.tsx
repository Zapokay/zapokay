'use client';
import type { OnboardingData } from '@/lib/types';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  locale: string;
  provinceDisplay: string;
  error?: string | null;
}

const isFr = (locale: string) => locale === 'fr';

function CheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-[var(--text-body)]">
      <svg className="w-4 h-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
      {text}
    </li>
  );
}

export function StepConfirmation({ data, onFinish, saving, locale, error }: StepProps) {
  const fr = isFr(locale);
  const isCBCA = data.company.incorporationType === 'CBCA';
  const complianceLabel = isCBCA ? 'CBCA' : 'LSAQ';

  const checklistFr = [
    'Livre de minutes numérique créé',
    `Règles de conformité ${complianceLabel} chargées`,
    'Premier rapport de conformité généré',
    'Rappels annuels activés',
  ];
  const checklistEn = [
    'Digital minute book created',
    `${complianceLabel} compliance rules loaded`,
    'First compliance report generated',
    'Annual reminders activated',
  ];
  const checklist = fr ? checklistFr : checklistEn;

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl p-8 text-center max-w-md mx-auto">
      {/* Triple-halo amber ⚡ icon */}
      <div style={{ width: '80px', height: '80px', background: 'rgba(245,185,30,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <div style={{ width: '64px', height: '64px', background: 'rgba(245,185,30,0.20)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '48px', height: '48px', background: 'var(--amber-400)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M13 3L6 14h7l-1 7 8-11h-7l1-7z" fill="white" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="font-sora font-bold text-2xl text-[var(--text-heading)] mb-2">
        {fr ? 'Vous êtes prêt !' : "You're all set!"}
      </h1>

      {/* Subtitle */}
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {fr
          ? `Votre livre de minutes numérique pour ${data.company.legalName} est configuré. Zappons la paperasse ensemble.`
          : `Your digital minute book for ${data.company.legalName} is set up. Let's zap the paperwork together.`}
      </p>

      {/* Checklist */}
      <ul className="text-left mb-8 space-y-3">
        {checklist.map(item => <CheckItem key={item} text={item} />)}
      </ul>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-center" style={{ color: 'var(--error-text)' }}>{error}</p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onFinish}
        disabled={saving}
        className="w-full bg-[var(--amber-400)] text-[var(--navy-900)] font-semibold py-3 rounded-lg hover:bg-[var(--spark-400)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving
          ? (fr ? 'Chargement...' : 'Loading...')
          : (fr ? 'Choisir mes exercices →' : 'Choose my fiscal years →')}
      </button>
    </div>
  );
}
