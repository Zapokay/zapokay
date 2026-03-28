'use client';
import type { OnboardingData } from '@/lib/types';
import Button from '@/components/ui/Button';

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  locale: string;
}

const isFr = (locale: string) => locale === 'fr';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-ivory-dark last:border-0">
      <span className="text-sm text-navy-400 shrink-0 mr-4">{label}</span>
      <span className="text-sm font-medium text-navy-900 text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );
}

const roleLabels: Record<string, { fr: string; en: string }> = {
  director: { fr: 'Administrateur', en: 'Director' },
  officer: { fr: 'Dirigeant', en: 'Officer' },
  shareholder: { fr: 'Actionnaire', en: 'Shareholder' },
};

const typeLabels: Record<string, { fr: string; en: string }> = {
  LSA: { fr: 'Provincial Québec (LSAQ)', en: 'Québec Provincial (LSAQ)' },
  CBCA: { fr: 'Fédéral (LSAC)', en: 'Federal (CBCA)' },
};

export function StepConfirmation({ data, onBack, onFinish, saving, locale }: StepProps) {
  const fr = isFr(locale);
  const l = fr ? 'fr' : 'en';

  return (
    <div>
      <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-6">
        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="font-sora text-3xl font-semibold text-navy-900 mb-2">
        {fr ? "Tout semble parfait!" : "Everything looks good!"}
      </h1>
      <p className="text-navy-400 text-sm mb-8">
        {fr
          ? "Voici un résumé de ce que nous avons configuré pour vous."
          : "Here's a summary of what we've set up for you."}
      </p>

      <div className="bg-white rounded-2xl border border-ivory-dark p-6 mb-4">
        <h2 className="font-sora font-semibold text-navy-700 text-xs uppercase tracking-wider mb-3">
          {fr ? "Entreprise" : "Company"}
        </h2>
        <Row label={fr ? "Nom légal" : "Legal name"} value={data.company.legalName} />
        <Row
          label={fr ? "Type de constitution" : "Incorporation type"}
          value={typeLabels[data.company.incorporationType]?.[l] ?? data.company.incorporationType}
        />
        <Row label={fr ? "Numéro" : "Number"} value={data.company.incorporationNumber} />
        <Row label={fr ? "Date" : "Date"} value={data.company.incorporationDate} />
        <Row label={fr ? "Province" : "Province"} value={data.company.province} />
      </div>

      <div className="bg-white rounded-2xl border border-ivory-dark p-6 mb-8">
        <h2 className="font-sora font-semibold text-navy-700 text-xs uppercase tracking-wider mb-3">
          {fr ? "Premier dirigeant" : "First officer"}
        </h2>
        <Row label={fr ? "Nom" : "Name"} value={data.officer.fullName} />
        <Row
          label={fr ? "Rôle" : "Role"}
          value={roleLabels[data.officer.role]?.[l] ?? data.officer.role}
        />
        <Row label={fr ? "Début" : "Start"} value={data.officer.startDate} />
      </div>

      <p className="text-xs text-navy-400 text-center mb-6">
        {fr
          ? "Vous pouvez modifier ces détails dans Paramètres."
          : "You can update these details later in Settings."}
      </p>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1">
          {fr ? "Retour" : "Back"}
        </Button>
        <Button onClick={onFinish} loading={saving} className="flex-1" size="lg" variant="secondary">
          {fr ? "C'est parti" : "Let's go"}
        </Button>
      </div>
    </div>
  );
}
