'use client';
import type { OnboardingData } from '@/lib/types';
import type { AdresseSaisie } from '@/lib/address';
import BlocAdresse from '@/components/ui/BlocAdresse';
import type { ChampAdresse } from '@/lib/address';
import { CHAMPS_REQUIS_SIEGE, champsManquantsSiege } from '@/lib/data-gaps';
import { CLE_CHAMP_ADRESSE_ENTITE } from '@/lib/entity-labels';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

/**
 * ÉTAPE 3 — LE SIÈGE SOCIAL. Elle demandait « Dans quelle province ? » ; la province
 * vit désormais DANS l'adresse (décision de Dom, 2026-09-13).
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-17 — ELLE RENVERSE CELLE DU 2026-09-09. L'étape 3
 * EXIGE désormais ce qu'elle déclare. L'ancienne décision disait « on passe VITE
 * l'inscription, les champs sont exigés dans l'application » ; le parc a montré
 * ce qu'elle produit — des sociétés créées sans siège, sans personne, sans
 * action, mesurées le 2026-09-17.
 *
 * ⛔⛔ ET LES TROIS PARTENT ENSEMBLE OU RIEN NE PART : l'astérisque, le bouton
 * désactivé, et le message qui NOMME les champs manquants. C'est la leçon de
 * `b0f44ed`, qui avait retiré une garde parce qu'elle était juste et INVISIBLE —
 * « le champ bloquait sans jamais avoir annoncé qu'il bloquerait ».
 *
 * ⚪ L'ASTÉRISQUE GARDE SA POSITION ET SA COULEUR, ET C'EST UNE DÉCISION DATÉE.
 * Dom le veut en HAUT À DROITE du libellé ; ce sera un LOT À PART — « l'astérisque
 * a une déclaration unique ». Raison : le dépôt porte 29 astérisques écrits à la
 * main dans 12 fichiers, sous TROIS notations de la même couleur, et aucun
 * composant partagé. Les déplacer demande ce composant, 12 fichiers au diff, et
 * de rééduquer `check:adresses`, qui LIT ces astérisques par leur couleur et
 * deviendrait aveugle EN SILENCE.
 * ★ Ce n'était donc pas une préférence : c'était le refus d'un lot de 12 fichiers
 * à l'intérieur d'un lot d'une cause.
 *
 * ★ L'EXIGENCE NE S'ÉCRIT PAS ICI : elle vient de `CHAMPS_REQUIS_SIEGE`
 * (lib/data-gaps.ts), la même liste que les Paramètres marquent et gardent, et
 * que la liste des trous nomme. Quatre lecteurs, une seule déclaration.
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

  // ★ L'ASTÉRISQUE DÉRIVE DE LA DÉCLARATION, IL NE S'ÉCRIT PAS À LA MAIN — forme
  //   copiée de SettingsClient, qui marque le même siège depuis la même liste.
  // ⚪ Couleur en ligne `#ef4444` : celle des deux autres étapes d'inscription.
  //   Les Paramètres emploient `text-red-500`. Les deux sont le même rouge, et
  //   `check:adresses` lit les deux — c'est la dette que le lot de l'astérisque
  //   unique soldera.
  const marqueSiege = (champ: ChampAdresse) =>
    (CHAMPS_REQUIS_SIEGE as readonly ChampAdresse[]).includes(champ)
      ? <span style={{ color: '#ef4444' }}> *</span>
      : null;

  // ⛔ LE MÊME CALCUL SERT LE BOUTON ET LE MESSAGE. Deux copies divergeraient, et
  //   l'une des deux mentirait — un bouton actif avec un message d'erreur, ou
  //   l'inverse.
  const manquants = champsManquantsSiege(siege);
  const siegeIncomplet = manquants.length > 0;
  // ⚪ LA TABLE DE LIBELLÉS EST CELLE DES ENTITÉS, ET C'EST DÉLIBÉRÉ. Elle est
  //   typée `Record<ChampAdresse, …>` — les SIX colonnes, pas seulement celles
  //   qu'une surface exige — donc elle couvre le siège sans rien ajouter. En
  //   écrire une seconde ferait la septième copie de six libellés que ce dépôt
  //   passe son temps à réunir.
  //   ⚠️ Son NOM parle d'entités : dette de nommage, notée, pas corrigée ici.
  const messageIncomplet = siegeIncomplet
    ? m.common.siege.incompleteFields.replace(
        '{champs}',
        manquants.map((c) => m.shareholders.entityAddressFields[c]).join(', '),
      )
    : null;

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
      continueDisabled={siegeIncomplet}
      continueLabel={saving ? (fr ? 'Enregistrement…' : 'Saving…') : undefined}
    >
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
        {m.onboarding.siege.hint}
      </p>
      <BlocAdresse
        marque={marqueSiege}
        valeur={siege}
        onChange={majSiege}
        locale={locale}
        libelleLigne1={m.common.siege.line1}
        libelleLigne2={m.common.siege.line2}
        idPrefixe="siege"
        styleChamp={inputStyle}
        styleEtiquette={fieldLabelStyle}
      />

      {messageIncomplet && (
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#ef4444' }}>
          {messageIncomplet}
        </p>
      )}

      {saveError && (
        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#ef4444' }}>{saveError}</p>
      )}
    </OnboardingStepLayout>
  );
}
