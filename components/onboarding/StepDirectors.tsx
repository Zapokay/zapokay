'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { countryOptions } from '@/lib/countries';
import { OnboardingStepLayout } from './OnboardingStepLayout';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingDirector {
  fullName: string;
  appointmentDate: string;
  /**
   * Le domicile, exige a la CREATION. `''` = non declare — jamais une
   * valeur fabriquee. Requis et sans defaut : les deux litteraux qui
   * construisent un administrateur echouent a compiler s'ils l'omettent.
   */
  addressCity: string;
  addressCountry: string;
  /**
   * ⚠️ TROIS ETATS : declare oui · declare non · JAMAIS DECLARE (`null`).
   * `null` quand la residence ne s'applique pas au regime — jamais `false`,
   * qui affirmerait qu'une personne n'est pas residente.
   */
  isCanadianResident: boolean | null;
}

interface StepDirectorsProps {
  locale: string;
  userFullName?: string;
  incorporationDate?: string;
  initialDirectors?: OnboardingDirector[];
  /**
   * La residence canadienne s'applique-t-elle ? Cette etape porte son PROPRE
   * interrupteur, hors PersonSelector — elle a donc besoin de la meme decision.
   * Decidee par OnboardingFlow, jamais ici.
   */
  residencyApplies: boolean;
  // ⚠️ Promise<boolean>, NOT void. A `=> void` prop on an async handler makes the
  // promise float: the step cannot await the write, so it advances whether or not
  // anything was saved. That was the second half of the bceb84d defect at step 5,
  // and tsc reports NOTHING for it. Keep the return type.
  onContinue: (directors: OnboardingDirector[]) => Promise<boolean>;
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

export default function StepDirectors({
  locale,
  userFullName = '',
  incorporationDate = '',
  initialDirectors,
  onContinue,
  onSkip,
  residencyApplies,
}: StepDirectorsProps) {

  const fr = locale === 'fr';
  // i18n — DELIBERATE DIVERGENCE from this file's local convention. Every other
  // string here is a `fr ? … : …` ternary, which CLAUDE.md §1 forbids. The rule
  // "each file follows what it carries" arbitrates between two VALID conventions;
  // here one of the two is prohibited, so the new strings use keys. Following the
  // local convention would extend the debt to one more file. Precedent: bceb84d
  // did exactly this in StepShareholders. The existing ternaries are deliberately
  // NOT converted — that is a separate, queued cleanup, not this bundle.
  const t = useTranslations('directors');
  const tCommon = useTranslations('common');
  // ★ Les etiquettes d'adresse viennent de `people`, celles que PersonSelector
  //   emploie deja : une meme etiquette ne vit pas a deux endroits du catalogue.
  const tPeople = useTranslations('people');
  const paysOptions = useMemo(() => countryOptions(locale), [locale]);
  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  const [directors, setDirectors] = useState<OnboardingDirector[]>(
    initialDirectors && initialDirectors.length > 0
      ? initialDirectors
      : [
          {
            fullName: userFullName,
            appointmentDate: defaultDate,
            addressCity: '',
            // ⛔ AUCUNE PRESELECTION. Un champ obligatoire dont le defaut est
            //    deja valide n'est pas obligatoire.
            addressCountry: '',
            // ② `null`, PAS une omission ni un `false` : la colonne porte encore
            //    son DEFAULT TRUE (retire seulement a l'etape 7a), donc omettre
            //    refabriquerait un « Oui ». Ecrire null vaut avant et apres.
            // ⛔ « Non declare » a l'ajout, jamais « Oui » : preselectionner
            //    une declaration la fabriquerait dans l'interface, exactement
            //    ce que le DEFAULT TRUE fait en base et qu'on retire.
            isCanadianResident: null,
          },
        ]
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateDirector(index: number, field: keyof OnboardingDirector, value: any) {
    setDirectors((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  function addDirector() {
    setDirectors((prev) => [
      ...prev,
      {
        fullName: '',
        appointmentDate: defaultDate,
        addressCity: '',
        addressCountry: '',
        isCanadianResident: null,
      },
    ]);
  }

  function removeDirector(index: number) {
    setDirectors((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleContinue() {
    // Reentrancy belt. MEASURED 2026-08-28: it cannot fire today —
    // the only invoker is the layout's continue button, which is
    // disabled={saving || continueDisabled} and reads the SAME render's `saving`.
    // Kept for the day a <form onSubmit> or an Enter handler is added:
    // Enter bypasses a disabled button, and company_people/director_mandates carry no UNIQUE,
    // so a re-entry duplicates a director.
    if (saving) return;
    setError(null);
    const valid = directors.filter((d) => d.fullName.trim());
    const rows = valid.length > 0 ? valid : directors;

    // Validate EVERY appointment date before a single row is written.
    // director_mandates.appointment_date is NOT NULL, so an emptied date field is
    // rejected by the database MID-LOOP, and the write loop has no pre-read that
    // would make a retry clean. Same reasoning and same shape as the price check
    // in StepShareholders. The skipped-row condition mirrors the write loop's.
    for (const d of rows) {
      if (!d.fullName.trim()) continue;
      if (!d.appointmentDate.trim()) {
        setError(t('errorAppointmentDate'));
        return;
      }
      // ⛔ LE DOMICILE, EXIGE A LA CREATION SEULEMENT. Ce chemin ne cree que des
      //    administrateurs neufs ; aucune fiche existante n'y passe.
      const villeVide = !d.addressCity.trim();
      const paysVide = !d.addressCountry;
      if (villeVide || paysVide) {
        setError(
          villeVide && paysVide ? t('errorCityAndCountry')
          : villeVide ? t('errorCity')
          : t('errorCountry'),
        );
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
      console.error('[onboarding] step 4 onContinue threw:', err);
      setError(tCommon('saveFailed'));
    } finally {
      // Release ONLY on failure. On success the step unmounts this component,
      // and releasing would open a one-render window where the button is
      // clickable at the OLD step — insert-only, no UNIQUE, so a click there
      // duplicates. Today setStep(5) and this line batch into one render
      // (MEASURED 2026-08-28: no await between setStep and return true in
      // OnboardingFlow) — this guard does not DEPEND on that staying true.
      if (!ok) setSaving(false);
    }
  }

  /**
   * ⛔ UNE SEULE SOURCE, DEUX CONSOMMATEURS — ET C'EST LE CORRECTIF D'UNE GARDE
   * MUETTE. Le bouton se desactivait par un predicat, le message ne se rendait
   * qu'a la soumission : un bouton desactive rend cette soumission
   * INATTEIGNABLE, donc le refus n'avait pas de voix. La liste ci-dessous est
   * rendue A L'ECRAN et desactive le bouton ; les deux ne peuvent plus diverger.
   *
   * ★ Un administrateur NOMME doit porter ville et pays. Une ligne SANS nom est
   * ignoree par la boucle d'ecriture — rien ne lui est exige, et rien ne
   * s'affiche a son sujet. Un utilisateur qui arrive sur l'etape ne lit aucun
   * reproche.
   */
  const domicilesIncomplets = directors
    .map((d, i) => {
      if (!d.fullName.trim()) return null;
      const ville = !d.addressCity.trim();
      const pays = !d.addressCountry;
      if (!ville && !pays) return null;
      return {
        n: i + 1,
        detail: ville && pays ? t('errorCityAndCountry') : ville ? t('errorCity') : t('errorCountry'),
      };
    })
    .filter((x): x is { n: number; detail: string } => x !== null);
  const domicileManquant = domicilesIncomplets.length > 0;

  const usersIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 4 — ADMINISTRATEURS' : 'STEP 4 — DIRECTORS'}
      icon={usersIcon}
      title={fr ? (
        <>Qui sont les administrateurs<br />de votre entreprise ?</>
      ) : (
        <>Who are the directors<br />of your company?</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un administrateur ?" : 'What is a director?'}
      tooltipContent={fr
        ? "Les administrateurs supervisent la gestion de l'entreprise. Dans la plupart des petites entreprises, le fondateur est le seul administrateur."
        : 'Directors oversee company management. In most small businesses, the founder is the sole director.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
      saving={saving}
      continueDisabled={domicileManquant}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {directors.map((director, index) => (
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
                {fr ? `Administrateur ${index + 1}` : `Director ${index + 1}`}
              </p>
              {directors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDirector(index)}
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

            {/* Full name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>
                {fr ? 'Nom complet' : 'Full name'}{' '}
                <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={director.fullName}
                onChange={(e) => updateDirector(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                style={inputStyle}
              />
            </div>

            {/* Date + Resident row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? 'Date de nomination' : 'Appointment date'}
                </label>
                <input
                  type="date"
                  value={director.appointmentDate}
                  onChange={(e) => updateDirector(index, 'appointmentDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
              {/* ① REMPLACE, PAS DESACTIVE. Un interrupteur grise en position
                  « off » se lit `false` — une affirmation fausse sur une
                  personne. Deux couches seulement : le champ disparait et rien
                  n'est ecrit pour lui ; les autres champs de l'etape et son
                  bouton « Continuer » restent actifs. */}
              {!residencyApplies ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {fr ? 'Résidence canadienne : ne s\u2019applique pas à ce régime'
                        : 'Canadian residency: not applicable under this regime'}
                  </span>
                </div>
              ) : (
              /* ⛔ UN MENU, PAS UN INTERRUPTEUR — meme raison que dans
                 PersonSelector : deux positions fabriquent forcement un
                 troisieme etat par defaut, et c'est ainsi qu'une absence
                 devenait « Oui ». Trois choix nommes, et « Non declare »
                 selectionnable pour revenir en arriere.
                 ⚠️ Les trois mots sont ceux du registre. Ce fichier porte ses
                 libelles en ternaires codees en dur — convention du fichier,
                 anterieure a ce lot — donc ils ne viennent PAS de la cle
                 partagee. Si ce fichier passe a i18n un jour, c'est la
                 premiere chose a brancher. */
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? 'Résident canadien' : 'Canadian resident'}
                </label>
                <select
                  value={
                    director.isCanadianResident === true ? 'true'
                    : director.isCanadianResident === false ? 'false'
                    : 'null'
                  }
                  onChange={(e) =>
                    updateDirector(
                      index,
                      'isCanadianResident',
                      e.target.value === 'true' ? true
                      : e.target.value === 'false' ? false
                      : null,
                    )
                  }
                  style={inputStyle}
                >
                  <option value="null">{fr ? 'Non déclaré' : 'Not declared'}</option>
                  <option value="true">{fr ? 'Oui' : 'Yes'}</option>
                  <option value="false">{fr ? 'Non' : 'No'}</option>
                </select>
              </div>
              )}
            </div>

            {/* Domicile — ville + pays, exiges a la creation */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {tPeople('city')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={director.addressCity}
                  onChange={(e) => updateDirector(index, 'addressCity', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {tPeople('country')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={director.addressCountry}
                  onChange={(e) => updateDirector(index, 'addressCountry', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{tPeople('countryNotDeclared')}</option>
                  {paysOptions.map((pays) => (
                    <option key={pays.code} value={pays.code}>
                      {pays.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        {/* Add director button */}
        <button
          type="button"
          onClick={addDirector}
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
          {fr ? 'Ajouter un administrateur' : 'Add a director'}
        </button>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
            {error}
          </p>
        )}

        {/* ⛔ DERNIER ENFANT DE LA CARTE, DONC ADJACENT AU BOUTON. Cette ligne
            parle du BOUTON « Continuer », pas d'un champ : la placer sous les
            champs la detacherait de ce qu'elle explique. La rangee d'actions du
            layout suit immediatement cette carte.
            ★ Jeton Aria `--error-text`, jamais un litteral. */}
        {domicilesIncomplets.map((d) => (
          <p
            key={d.n}
            style={{ fontSize: '12px', color: 'var(--error-text)', marginTop: '8px' }}
          >
            {t('domicileMissingFor', { n: d.n, detail: d.detail })}
          </p>
        ))}
      </div>
    </OnboardingStepLayout>
  );
}
