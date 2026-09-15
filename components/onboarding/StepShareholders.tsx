'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ADRESSE_VIERGE, type AdresseSaisie } from '@/lib/address';
import {
  VALEUR_ENTITE_VIDE,
  adresseDeLaValeur,
  valeurAvecAdresse,
  type ValeurEntite,
} from '@/lib/entity-payload';
import type { ShareholderEntityType } from '@/lib/supabase/people-types';
import BlocAdresse from '@/components/ui/BlocAdresse';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import type { OnboardingDirector } from './StepDirectors';

// =============================================================================
// Types
// =============================================================================

/**
 * LA NATURE DU DÉTENTEUR — la question que l'étape 5 ne posait JAMAIS.
 *
 * ⛔ LE DÉFAUT QU'ELLE FERME. Cette étape ne créait que des personnes physiques
 * et ne demandait pas si c'en était une. Rien n'empêchait d'y taper une
 * dénomination sociale : le produit enregistrait alors une SOCIÉTÉ dans
 * `company_people`, et le registre des actionnaires l'imprimait comme une
 * personne. Une PME dont une société de gestion est actionnaire — le cas le
 * plus courant — tombait dedans au jour un.
 *
 * ★ LES DEUX VALEURS SONT CELLES DE `shareholding_holders.holder_type`, pas un
 * vocabulaire de plus. La charge de la RPC les reprend telles quelles.
 */
export type NatureDetenteur = 'individual' | 'entity';

export interface OnboardingShareholder {
  /** ⛔ SANS DÉFAUT IMPLICITE : chaque littéral qui construit une ligne le pose. */
  nature: NatureDetenteur;
  /**
   * Branche PERSONNE. Vide sur une ligne d'entité — et c'est ce vide qui écarte
   * l'entité de la liste des dirigeants à l'étape 6, par décision et non par
   * accident (voir le commentaire de `knownPeople` dans StepOfficers).
   */
  fullName: string;
  numberOfShares: number;
  /** String, not number: the input must hold partial/empty entry while typing,
   *  as IssueSharesModal does. Validated before any write in OnboardingFlow. */
  pricePerShare: string;
  issueDate: string;
  /**
   * LE DOMICILE — ET IL N'EXISTAIT PAS DU TOUT AVANT LE 2026-09-15.
   *
   * ⛔ CE N'EST PAS « QUATRE CHAMPS DE PLUS », C'EST LE BLOC ENTIER. Cette étape
   * n'offrait AUCUN champ d'adresse, et OnboardingFlow écrivait les six colonnes à
   * `null` en dur (le site d'écriture, mesuré le 2026-09-15). Un actionnaire créé
   * ici naissait donc sans domicile — et `CHAMPS_REQUIS.shareholder` exige ville et
   * pays, donc sa fiche arrivait dans la liste des trous le jour de sa création.
   *
   * ⚖️ DÉCISION DE DOM, 2026-09-15 : OFFRIR ≠ IMPOSER. L'exigence ne bouge pas, rien
   * n'est marqué, rien ne bloque.
   */
  adresse: AdresseSaisie;
  /**
   * Branche SOCIÉTÉ — la valeur que l'application emploie déjà (IssueSharesModal,
   * EditEntityModal), pour que l'inscription passe par `chargeEntite` sans écrire
   * un second chemin.
   *
   * ⛔ `jurisdiction` N'Y EST PAS, et l'étape ne l'offre pas. Décision de Dom du
   * 2026-09-15, qui confirme celle du 2026-09-11 : la colonne n'est jamais lue et
   * vaut NULL sur toutes les lignes. Un champ pour une colonne morte ferait saisir
   * une valeur dont rien ne fait rien.
   * ⛔ LA DATE DE CONSTITUTION NON PLUS. `ValeurEntite` la porte parce que
   * l'application la saisit ; l'inscription la laisse vide, et le `NULLIF` de la
   * RPC en fait un NULL. Rien n'est fabriqué, et la phrase sous le bloc dit où la
   * compléter.
   */
  entite: ValeurEntite;
}

/**
 * LE NOM D'UNE LIGNE, QUELLE QUE SOIT SA NATURE.
 *
 * ⛔ CE QUI CASSAIT SANS ELLE — SIX SITES, MESURÉS. Le parcours lisait l'actionnaire
 * par `fullName` partout : les deux gardes de cette étape, son filtre de validité,
 * la boucle d'écriture d'OnboardingFlow et les deux lignes du sommaire. Une entité
 * porte sa dénomination dans `entite.legalName` et laisse `fullName` vide : chacun
 * de ces six sites l'aurait donc IGNORÉE — pas mal affichée, ignorée. Le sommaire
 * aurait annoncé « 1 actionnaire » pour deux saisis.
 * ★ Une seule définition, et les six l'appellent.
 */
export function nomActionnaire(s: OnboardingShareholder): string {
  return s.nature === 'entity' ? s.entite.legalName : s.fullName;
}

interface StepShareholdersProps {
  locale: string;
  directors: OnboardingDirector[];
  initialShareholders?: OnboardingShareholder[];
  /** Resolves true when every shareholding was written, false when the write
   *  failed. Step 5 stays put on false so the user can fix and retry. */
  onContinue: (shareholders: OnboardingShareholder[]) => Promise<boolean>;
  onSkip: () => void;
}

// =============================================================================
// Shared styles
// =============================================================================

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

// =============================================================================
// Component
// =============================================================================

export default function StepShareholders({
  locale,
  directors,
  initialShareholders,
  onContinue,
  onSkip,
}: StepShareholdersProps) {

  const fr = locale === 'fr';
  const t = useTranslations('shareholders');
  const tCommon = useTranslations('common');
  // ★ La seule etiquette que ce fichier passe au bloc d'adresse : la ligne 1, qui
  //   differe d'une surface a l'autre. Les cinq autres vivent dans BlocAdresse.
  const tPeople = useTranslations('people');

  // ⛔ THE ISSUE DATE STARTS EMPTY — no incorporation date, no today (Dom's
  // decision, 2026-09-12): when shares were issued is a fact only the user
  // knows. handleContinue refuses an empty one before any write.
  // Smart pre-fill: if only 1 director, pre-fill shareholder with same name + 100 shares
  //
  // ⛔ L'ADRESSE, ELLE, NE SE RECOPIE PAS DE L'ADMINISTRATEUR — et c'est délibéré,
  // à la différence du NOM juste au-dessus. Deux raisons, et la seconde suffirait :
  //   · si le nom reste celui de l'administrateur, la pré-lecture `ilike` de
  //     OnboardingFlow RÉUTILISE la fiche déjà créée à l'étape 4 — l'adresse saisie
  //     ici ne serait écrite nulle part. Une copie invisible ;
  //   · si l'utilisateur CHANGE le nom, la copie devient l'adresse d'une personne
  //     pour une autre. C'est une adresse fabriquée, exactement ce qu'A2 interdit.
  // Même raison et même forme que la date d'émission, qui n'hérite pas non plus.
  const defaultShareholders: OnboardingShareholder[] =
    initialShareholders && initialShareholders.length > 0
      ? initialShareholders
      : directors.length === 1
        ? [
            {
              nature: 'individual',
              fullName: directors[0].fullName,
              numberOfShares: 100,
              pricePerShare: '1',
              issueDate: '',
              adresse: { ...ADRESSE_VIERGE },
              entite: { ...VALEUR_ENTITE_VIDE },
            },
          ]
        : directors.length > 0
          ? directors.map((d) => ({
              nature: 'individual',
              fullName: d.fullName,
              numberOfShares: 100,
              pricePerShare: '1',
              issueDate: '',
              adresse: { ...ADRESSE_VIERGE },
              entite: { ...VALEUR_ENTITE_VIDE },
            }))
          : [
              {
                nature: 'individual',
                fullName: '',
                numberOfShares: 100,
                pricePerShare: '1',
                issueDate: '',
                adresse: { ...ADRESSE_VIERGE },
                entite: { ...VALEUR_ENTITE_VIDE },
              },
            ];

  const [shareholders, setShareholders] =
    useState<OnboardingShareholder[]>(defaultShareholders);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateShareholder(
    index: number,
    field: keyof OnboardingShareholder,
    value: any
  ) {
    setShareholders((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  /**
   * ★ UN SEUL CHAMP DE L'ENTITÉ À LA FOIS, sans que l'appelant ait à reconstruire
   * la valeur entière. Même forme que `maj` dans EntityForm — et la valeur reste
   * `ValeurEntite`, donc `chargeEntite` la reçoit sans conversion.
   */
  function majEntite<K extends keyof ValeurEntite>(index: number, champ: K, v: ValeurEntite[K]) {
    setShareholders((prev) =>
      prev.map((s, i) => (i === index ? { ...s, entite: { ...s.entite, [champ]: v } } : s)),
    );
  }

  function addShareholder() {
    setShareholders((prev) => [
      ...prev,
      {
        // ⛔ 'individual' EST LE DÉPART, PAS UN DÉFAUT CACHÉ : le choix est le
        //    PREMIER contrôle de la carte, au-dessus du nom. Voir le rendu.
        nature: 'individual',
        fullName: '',
        numberOfShares: 100,
        pricePerShare: '1',
        issueDate: '',
        adresse: { ...ADRESSE_VIERGE },
        entite: { ...VALEUR_ENTITE_VIDE },
      },
    ]);
  }

  function removeShareholder(index: number) {
    setShareholders((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleContinue() {
    // Reentrancy belt. MEASURED 2026-08-28: it cannot fire today —
    // the only invoker is the layout's continue button, which is
    // disabled={saving || continueDisabled} and reads the SAME render's `saving`.
    // Kept for the day a <form onSubmit> or an Enter handler is added:
    // Enter bypasses a disabled button, and shareholdings carries no UNIQUE,
    // so a re-entry duplicates a shareholder.
    if (saving) return;
    setError(null);
    const valid = shareholders.filter((s) => nomActionnaire(s).trim());
    const rows = valid.length > 0 ? valid : shareholders;

    // Validate EVERY issue date before a single row is written.
    // shareholdings.issue_date is NOT NULL, and since 2026-09-12 the field has no
    // default: an empty date would reach the write loop and fail MID-LOOP, after
    // the earlier shareholders were written. Same shape as StepDirectors'
    // appointment-date check. The skipped-row condition mirrors the write loop's.
    for (const s of rows) {
      if (!nomActionnaire(s).trim() || s.numberOfShares <= 0) continue;
      if (!s.issueDate.trim()) {
        setError(t('errorIssueDate'));
        return;
      }
    }

    // Validate EVERY price before a single row is written. The A-SC guard in
    // create_shareholding_with_holders rejects a direct issuance carrying no
    // issue_price_per_share, and a mid-loop rejection would leave the earlier
    // shareholders written with no way to retry cleanly. Same check, same keys
    // as IssueSharesModal. The skipped-row condition mirrors the write loop's.
    for (const s of rows) {
      if (!nomActionnaire(s).trim() || s.numberOfShares <= 0) continue;
      const priceNum = parseFloat(s.pricePerShare);
      if (!s.pricePerShare.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
        setError(t('errorPrice'));
        return;
      }
    }

    setSaving(true);
    let ok = false;
    // supabase-js RETURNS { error } on Postgres and THROWS on a network failure.
    // Without the catch, saving stays true and the button freezes with no message.
    try {
      ok = await onContinue(rows);
      if (!ok) {
        setError(tCommon('saveFailed'));
      }
    } catch (err) {
      console.error('[onboarding] step 5 onContinue threw:', err);
      setError(tCommon('saveFailed'));
    } finally {
      // Release ONLY on failure. On success the step unmounts this component,
      // and releasing would open a one-render window where the button is
      // clickable at the OLD step — insert-only, no UNIQUE, so a click there
      // duplicates. Today setStep(6) and this line batch into one render
      // (MEASURED 2026-08-28: no await between setStep and return true in
      // OnboardingFlow) — this guard does not DEPEND on that staying true.
      if (!ok) setSaving(false);
    }
  }

  const pieChartIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 5 — ACTIONNAIRES' : 'STEP 5 — SHAREHOLDERS'}
      icon={pieChartIcon}
      title={fr ? (
        <>Qui détient des actions<br />de votre entreprise ?</>
      ) : (
        <>Who holds shares<br />in your company?</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un actionnaire ?" : 'What is a shareholder?'}
      tooltipContent={fr
        ? "Les actionnaires possèdent l'entreprise. Si vous êtes le seul propriétaire, ajoutez-vous avec le nombre d'actions émises."
        : 'Shareholders own the company. If you are the sole owner, add yourself with the number of shares issued.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
      saving={saving}
      extraAboveCard={
        <div style={{
          width: '100%', maxWidth: '560px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            borderRadius: '20px', background: 'var(--page-bg)',
            border: '1px solid var(--card-border)',
            padding: '5px 12px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)',
          }}>
            <span style={{ color: '#22c55e' }}>✓</span>
            {fr ? "Classe d'actions par défaut : Actions ordinaires" : 'Default share class: Common Shares'}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {shareholders.map((shareholder, index) => (
          <div
            key={index}
            style={{
              borderRadius: '10px',
              border: '1px solid var(--card-border)',
              background: 'var(--page-bg)',
              padding: '14px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {fr ? `Actionnaire ${index + 1}` : `Shareholder ${index + 1}`}
              </p>
              {shareholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareholder(index)}
                  style={{
                    padding: '4px', borderRadius: '6px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* ★★ LE CHOIX VIENT AVANT LE NOM — ET C'EST LA RÈGLE, PAS LA MISE EN PAGE.
                ⚖️ Décision de Dom, 2026-09-15, la même que le pays avant la province :
                celui qui ne remarque pas le choix tape une dénomination sociale dans
                un champ de personne, et c'est EXACTEMENT le défaut que cette étape
                ferme. Placé après le nom, il se saute ; placé à côté, il se lit
                comme une option. Premier contrôle de la carte, pleine largeur.
                ⛔ NE PAS LE DÉPLACER SOUS LE NOM « pour la symétrie avec l'étape 4 ».
                ⚪ La forme — deux boutons en segment plutôt que deux grandes cartes —
                tient à la répétition : cette carte se monte une fois PAR actionnaire,
                et les cartes de l'étape 1 feraient trois écrans pour trois lignes. */}
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>{t('natureQuestion')}</label>
              <div
                role="radiogroup"
                aria-label={t('natureQuestion')}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
              >
                {(['individual', 'entity'] as NatureDetenteur[]).map((n) => {
                  const choisi = shareholder.nature === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={choisi}
                      onClick={() => updateShareholder(index, 'nature', n)}
                      style={{
                        padding: '9px 10px', borderRadius: '10px',
                        border: `2px solid ${choisi ? '#F5B91E' : 'var(--card-border)'}`,
                        background: choisi ? 'rgba(245,185,30,0.08)' : 'var(--card-bg)',
                        fontSize: '13px', fontWeight: choisi ? 600 : 400,
                        color: 'var(--text-heading)',
                        cursor: 'pointer', transition: 'all 150ms',
                      }}
                    >
                      {n === 'individual' ? t('natureIndividual') : t('natureEntity')}
                    </button>
                  );
                })}
              </div>
            </div>

            {shareholder.nature === 'individual' ? (
              /* ── BRANCHE PERSONNE — inchangée ────────────────────────────── */
              <div style={{ marginBottom: '12px' }}>
                <label style={fieldLabelStyle}>
                  {fr ? 'Nom' : 'Name'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={shareholder.fullName}
                  onChange={(e) => updateShareholder(index, 'fullName', e.target.value)}
                  placeholder="Jean-Philippe Roussy"
                  style={inputStyle}
                />
              </div>
            ) : (
              /* ── BRANCHE SOCIÉTÉ ──────────────────────────────────────────
                  ⛔ AUCUN SIGNATAIRE. Ce n'est pas l'actionnaire : c'est une personne
                  de plus, avec son rôle et ses dates. La RPC admet nativement une
                  liste vide, donc l'inscription n'écrit AUCUN chemin neuf pour ça.
                  ⛔ NI JURIDICTION NI DATE — voir l'en-tête de `entite`. */
              <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={fieldLabelStyle}>
                    {t('legalName')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={shareholder.entite.legalName}
                    onChange={(e) => majEntite(index, 'legalName', e.target.value)}
                    placeholder="9453-2281 Québec Inc."
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={fieldLabelStyle}>{t('entityType')}</label>
                    <select
                      value={shareholder.entite.entityType}
                      onChange={(e) =>
                        majEntite(index, 'entityType', e.target.value as ShareholderEntityType)
                      }
                      style={inputStyle}
                    >
                      <option value="corporation">{t('entityTypeCorporation')}</option>
                      <option value="trust">{t('entityTypeTrust')}</option>
                    </select>
                  </div>
                  {/* ⚪ LE NUMÉRO NE VAUT QUE POUR UNE SOCIÉTÉ — même condition que
                      l'application : `chargeEntite` le vide pour une fiducie. */}
                  {shareholder.entite.entityType === 'corporation' && (
                    <div>
                      <label style={fieldLabelStyle}>{t('neq')}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={shareholder.entite.entityNumber}
                        onChange={(e) =>
                          majEntite(index, 'entityNumber', e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                        maxLength={10}
                        placeholder="1234567890"
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>

                {/* ⛔ AUCUNE PROP `marque` : CHAMPS_REQUIS_ENTITE ne bouge pas, et cette
                    étape n'exige rien de neuf. OFFRIR ≠ IMPOSER. */}
                <BlocAdresse
                  valeur={adresseDeLaValeur(shareholder.entite)}
                  onChange={(a) =>
                    updateShareholder(index, 'entite', valeurAvecAdresse(shareholder.entite, a))
                  }
                  locale={locale}
                  libelleLigne1={t('address')}
                  idPrefixe={`actionnaire-societe-${index}`}
                  styleChamp={inputStyle}
                  styleEtiquette={fieldLabelStyle}
                />

                {/* ⚠️ ET ON SAIT CE QU'ELLE VAUT. Sa jumelle de l'étape 3 est là depuis
                    le 2026-09-09, et la plupart des sièges du parc sont encore vides.
                    On la met parce qu'elle coûte une phrase, pas parce qu'on y croit.
                    ⛔ Le compte vit dans le message de commit, que l'historique date.
                    ★ Elle nomme un écran qui EXISTE : la correction d'entité est en
                    place depuis le 2026-09-10 — avant elle, une entité était
                    incorrigible. */}
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {t('entityCompleteLater')}
                </p>
              </div>
            )}

            {/* Shares + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Nombre d'actions" : 'Number of shares'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shareholder.numberOfShares}
                  onChange={(e) =>
                    updateShareholder(
                      index,
                      'numberOfShares',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  placeholder="100"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {t('pricePerShare')}
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px', color: 'var(--text-secondary)',
                  }}>
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shareholder.pricePerShare}
                    onChange={(e) =>
                      updateShareholder(index, 'pricePerShare', e.target.value)
                    }
                    placeholder="1.00"
                    style={{ ...inputStyle, paddingLeft: '26px' }}
                  />
                </div>
                <p style={{
                  marginTop: '4px', fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}>
                  {t('pricePerShareHint')}
                </p>
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Date d'émission" : 'Issue date'}
                </label>
                <input
                  type="date"
                  value={shareholder.issueDate}
                  onChange={(e) => updateShareholder(index, 'issueDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* ★ LE DOMICILE — le bloc entier, qui n'existait pas.
                ⛔ AUCUNE PROP `marque` : cette étape n'exige rien de neuf.
                ⛔ ET IL APPARTIENT À LA BRANCHE PERSONNE. Sans cette condition il se
                   rendait AUSSI sous une société : deux blocs d'adresse sur la même
                   carte, « Adresse du domicile » sous une personne morale, et celui
                   du bas n'aurait jamais été écrit — `chargeEntite` ne lit que
                   `entite`. Trouvé au rendu, pas au raisonnement : tsc ne voit pas
                   qu'un bloc est de trop. */}
            {shareholder.nature === 'individual' && (
              <div style={{ marginTop: '12px' }}>
                <BlocAdresse
                  valeur={shareholder.adresse}
                  onChange={(adresse) => updateShareholder(index, 'adresse', adresse)}
                  locale={locale}
                  libelleLigne1={tPeople('address')}
                  idPrefixe={`actionnaire-${index}`}
                  styleChamp={inputStyle}
                  styleEtiquette={fieldLabelStyle}
                />
              </div>
            )}
          </div>
        ))}

        {/* Add shareholder button */}
        <button
          type="button"
          onClick={addShareholder}
          style={{
            width: '100%', padding: '14px',
            border: '1.5px dashed var(--card-border)',
            borderRadius: '12px',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '14px', fontWeight: 500,
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '4px',
          }}
        >
          <span style={{ color: '#F5B91E', fontSize: '18px', lineHeight: 1 }}>+</span>
          {fr ? 'Ajouter un actionnaire' : 'Add a shareholder'}
        </button>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
            {error}
          </p>
        )}
      </div>
    </OnboardingStepLayout>
  );
}
