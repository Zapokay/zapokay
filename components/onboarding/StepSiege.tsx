'use client';
import type { OnboardingData } from '@/lib/types';
import type { AdresseSaisie } from '@/lib/address';
import BlocAdresse from '@/components/ui/BlocAdresse';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

/**
 * ÉTAPE 3 — LE SIÈGE SOCIAL. Elle demandait « Dans quelle province ? » ; la province
 * vit désormais DANS l'adresse (décision de Dom, 2026-09-13).
 *
 * ⛔ AUCUN ASTÉRISQUE, AUCUNE GARDE — la décision du 2026-09-09, appliquée telle
 * quelle : on passe VITE l'inscription, les champs sont exigés dans l'application.
 * Même forme que le domicile des administrateurs à l'étape 4. L'exigence vit dans
 * lib/data-gaps.ts (CHAMPS_REQUIS_SIEGE) : les Paramètres la marquent et la gardent,
 * la liste des trous la nomme.
 * ★ D'où l'absence de prop `marque` sur le bloc ci-dessous : ce n'est pas un oubli,
 *   c'est la décision. Ce qui n'exige rien ne marque rien.
 *
 * ⛔ AUCUNE PRÉSÉLECTION. L'ancienne étape arrivait sur « QC » déjà choisi, et 17
 * sociétés sur 17 portaient QC sans qu'on sache qui l'avait dit.
 *
 * ★ LES SIX CHAMPS NE SONT PLUS ÉCRITS ICI (lot C-2, 2026-09-15). Ils étaient l'une
 * des QUATRE copies du même bloc ; ils viennent de components/ui/BlocAdresse.tsx,
 * qui porte aussi l'ordre pays→province et la liste fermée réservée à `CA`. Cet
 * écran garde sa peau — `inputStyle`, `fieldLabelStyle` — et n'a rien changé de son
 * apparence, sauf les deux cellules de la dernière rangée, qui ont permuté.
 */

interface StepSiegeProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack: () => void;
  locale: string;
  saving?: boolean;
  saveError?: string | null;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: '5px',
};

export function StepSiege({ data, setData, onNext, onBack, locale, saving, saveError }: StepSiegeProps) {
  const fr = locale === 'fr';
  const m = fr ? frMessages : enMessages;
  const siege = data.company.siege;

  function majSiege(valeur: AdresseSaisie) {
    setData((d) => ({ ...d, company: { ...d.company, siege: valeur } }));
  }

  const mapPinIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={m.onboarding.siege.stepLabel}
      icon={mapPinIcon}
      title={m.onboarding.siege.title}
      locale={locale}
      onSkip={onBack}
      skipLabel={fr ? 'Retour' : 'Back'}
      onContinue={onNext}
      saving={saving}
      continueLabel={saving ? (fr ? 'Enregistrement…' : 'Saving…') : undefined}
    >
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
        {m.onboarding.siege.hint}
      </p>
      <BlocAdresse
        valeur={siege}
        onChange={majSiege}
        locale={locale}
        libelleLigne1={m.common.siege.line1}
        libelleLigne2={m.common.siege.line2}
        idPrefixe="siege"
        styleChamp={inputStyle}
        styleEtiquette={fieldLabelStyle}
      />

      {saveError && (
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#ef4444' }}>{saveError}</p>
      )}
    </OnboardingStepLayout>
  );
}
