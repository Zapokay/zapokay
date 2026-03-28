'use client';
import type { Company } from '@/lib/types';

interface WelcomeCardProps {
  company: Company | null;
  locale: string;
}

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

const typeLabels: Record<string, { fr: string; en: string }> = {
  LSA: { fr: 'Provincial Québec (LSAQ)', en: 'Québec Provincial (LSAQ)' },
  CBCA: { fr: 'Fédéral (LSAC)', en: 'Federal (CBCA)' },
};

export function WelcomeCard({ company, locale }: WelcomeCardProps) {
  const fr = locale === 'fr';
  const l = fr ? 'fr' : 'en';

  const companyName = company?.legal_name_fr ?? (fr ? 'Votre entreprise' : 'Your company');
  const incType = company?.incorporation_type ?? '';
  const provinceCode = company?.province ?? '';
  const province = provinceNames[provinceCode]?.[l] ?? provinceCode;
  const typeLabel = typeLabels[incType]?.[l] ?? incType;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-sora text-3xl font-semibold text-navy-900">
          {fr ? "Bienvenue sur ZapOkay" : "Welcome to ZapOkay"}
        </h1>
        <p className="text-navy-400 mt-1">{companyName}</p>
      </div>

      <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-amber/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-[#D4821A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="font-sora font-semibold text-navy-900 mb-1">
              {fr ? "Votre livre des minutes est en cours de configuration."
                   : "Your minute book is being set up."}
            </h2>
            <p className="text-sm text-navy-400">
              {fr
                ? "Nous préparons votre liste de conformité et vos modèles selon votre type de constitution."
                : "We're preparing your compliance checklist and templates based on your incorporation type."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5">
          <p className="text-xs font-medium text-navy-400 uppercase tracking-wider mb-2">
            {fr ? "Entreprise" : "Company"}
          </p>
          <p className="font-sora font-semibold text-navy-900 text-sm leading-snug">{companyName}</p>
        </div>
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5">
          <p className="text-xs font-medium text-navy-400 uppercase tracking-wider mb-2">
            {fr ? "Type de constitution" : "Incorporation type"}
          </p>
          <p className="font-sora font-semibold text-navy-900 text-sm">{typeLabel}</p>
        </div>
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5">
          <p className="text-xs font-medium text-navy-400 uppercase tracking-wider mb-2">
            {fr ? "Province" : "Province"}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <p className="font-sora font-semibold text-navy-900 text-sm">{province}</p>
          </div>
        </div>
      </div>

      <div className="bg-navy-900 rounded-2xl p-6 text-ivory">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-[#D4821A] rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-sora font-semibold">Sprint 2 {fr ? "arrive bientôt" : "coming soon"}</span>
        </div>
        <p className="text-sm text-navy-200">
          {fr
            ? "Conformité automatique, modèles de résolutions, rappels annuels et plus encore."
            : "Automatic compliance tracking, resolution templates, annual reminders, and more."}
        </p>
      </div>
    </div>
  );
}
