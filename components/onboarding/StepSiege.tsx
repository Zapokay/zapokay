'use client';
import { useMemo } from 'react';
import type { OnboardingData } from '@/lib/types';
import type { ChampAdresse } from '@/lib/address';
import { countryOptions } from '@/lib/countries';
import { PROVINCE_CODES, optionsProvinces } from '@/lib/provinces';
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
 *
 * ⛔ AUCUNE PRÉSÉLECTION. L'ancienne étape arrivait sur « QC » déjà choisi, et 17
 * sociétés sur 17 portaient QC sans qu'on sache qui l'avait dit.
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
  const paysOptions = useMemo(() => countryOptions(locale), [locale]);
  const provinces = useMemo(
    () => optionsProvinces(locale, m.provinces as Record<string, string | undefined>),
    [locale, m],
  );
  const siege = data.company.siege;

  function maj(champ: ChampAdresse, valeur: string) {
    setData((d) => ({ ...d, company: { ...d.company, siege: { ...d.company.siege, [champ]: valeur } } }));
  }

  // Pays canadien OU non déclaré → la liste fermée ; sinon un champ libre. Même
  // prédicat que PersonSelector, EntityForm et les Paramètres.
  const subdivisionCanadienne = siege.address_country === 'CA' || siege.address_country === '';
  // La valeur détenue gagne son option quand elle sort de la liste : le menu ne doit
  // pas afficher une chose et en sauver une autre (PersonSelector, même raison).
  const provinceHorsListe =
    subdivisionCanadienne &&
    siege.address_province !== '' &&
    !PROVINCE_CODES.some((code) => code === siege.address_province);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label htmlFor="siege-address_line1" style={fieldLabelStyle}>{m.common.siege.line1}</label>
          <input id="siege-address_line1" type="text" value={siege.address_line1}
            onChange={(e) => maj('address_line1', e.target.value)} placeholder={m.people.addressLine1Placeholder} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="siege-address_line2" style={fieldLabelStyle}>{m.common.siege.line2}</label>
          <input id="siege-address_line2" type="text" value={siege.address_line2}
            onChange={(e) => maj('address_line2', e.target.value)} placeholder={m.people.addressLine2Placeholder} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="siege-address_city" style={fieldLabelStyle}>{m.people.city}</label>
            <input id="siege-address_city" type="text" value={siege.address_city}
              onChange={(e) => maj('address_city', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="siege-address_postal_code" style={fieldLabelStyle}>{m.people.postalCode}</label>
            <input id="siege-address_postal_code" type="text" value={siege.address_postal_code}
              onChange={(e) => maj('address_postal_code', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label htmlFor="siege-address_province" style={fieldLabelStyle}>
              {subdivisionCanadienne ? m.people.province : m.people.stateRegion}
            </label>
            {subdivisionCanadienne ? (
              <select id="siege-address_province" value={siege.address_province}
                onChange={(e) => maj('address_province', e.target.value)} style={inputStyle}>
                <option value="">{m.people.provinceNotDeclared}</option>
                {provinceHorsListe && <option value={siege.address_province}>{siege.address_province}</option>}
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            ) : (
              <input id="siege-address_province" type="text" value={siege.address_province}
                onChange={(e) => maj('address_province', e.target.value)} style={inputStyle} />
            )}
          </div>
          <div>
            <label htmlFor="siege-address_country" style={fieldLabelStyle}>{m.people.country}</label>
            <select id="siege-address_country" value={siege.address_country}
              onChange={(e) => maj('address_country', e.target.value)} style={inputStyle}>
              <option value="">{m.people.countryNotDeclared}</option>
              {paysOptions.map((pays) => (
                <option key={pays.code} value={pays.code}>{pays.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {saveError && (
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#ef4444' }}>{saveError}</p>
      )}
    </OnboardingStepLayout>
  );
}
