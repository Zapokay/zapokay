'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ADRESSE_VIERGE, type AdresseSaisie } from '@/lib/address';
import BlocAdresse from '@/components/ui/BlocAdresse';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import type { OnboardingDirector } from './StepDirectors';
import type { OnboardingShareholder } from './StepShareholders';

// =============================================================================
// Types
// =============================================================================

/**
 * UN DIRIGEANT, TEL QUE L'ÉTAPE 6 LE SAISIT.
 *
 * ⛔ LE DÉFAUT QUE CE TYPE FERME. Les trois listes n'offraient QUE les noms des
 * étapes 4 et 5 : on ne pouvait pas nommer un président qui n'était ni
 * administrateur ni actionnaire. C'est pourtant courant et parfaitement régulier
 * — un directeur général embauché, un CFO recruté, le gérant d'une PME familiale
 * qui ne détient rien. Aucun texte n'exige qu'un dirigeant soit administrateur ou
 * actionnaire (art. 116 LSAQ, art. 121a) LCSA).
 *
 * ⛔ ET LA SORTIE QUE L'UTILISATEUR PRENAIT ÉTAIT PIRE QUE LE TROU. Celui qui
 * devait absolument nommer son président l'inscrivait comme ACTIONNAIRE — et le
 * nombre d'actions y est exigé à plus de zéro. Il FABRIQUAIT une détention qui
 * n'existe pas, dans un registre légal.
 */
export interface SaisieDirigeant {
  /**
   * DEUX NOMS, UN PAR BRANCHE — ET C'EST CE QUI PERMET DE REVENIR SANS PERDRE.
   *
   * ⚖️ DÉCISION DE DOM, 2026-09-15 : « ← Choisir dans la liste » N'EFFACE PLUS.
   * Il portait une action DESTRUCTIVE déguisée en navigation — un lien, en bas du
   * bloc, après six champs remplis, sans confirmation ni retour.
   *
   * ⛔ ET LA RAISON EST UNE INCOHÉRENCE INTERNE, PAS UNE PRÉFÉRENCE. À l'étape 5,
   * basculer personne ↔ société n'efface rien : les deux branches y ont des champs
   * DISTINCTS (`fullName` et `entite.legalName`), donc l'état de chacune survit à
   * l'autre. Cette étape-ci partageait un seul `nom` entre ses deux branches, et
   * c'est ce partage — pas le lien — qui rendait l'effacement nécessaire : un nom
   * tapé, laissé dans un `<select>`, aurait affiché une option qui n'existe pas.
   * ★ Même forme et même remède qu'à l'étape 5.
   */
  nomChoisi: string;
  nomSaisi: string;
  /**
   * ⚠️ `true` VEUT DIRE « SAISI ICI », PAS « INCONNU DU DOSSIER ». Un nom tapé
   * qui se trouve déjà aux étapes 4 ou 5 reste marqué comme saisi, mais sa fiche
   * est RÉUTILISÉE et son bloc d'adresse n'est pas remontré. Sans quoi
   * l'utilisateur saisirait une adresse que rien n'écrirait — le piège exact de la
   * pré-lecture de l'étape 5.
   */
  nouvelle: boolean;
  /** Le domicile, offert avec le nom saisi. Conservé quand on revient à la liste. */
  adresse: AdresseSaisie;
}

/**
 * LE NOM D'UN POSTE, QUELLE QUE SOIT SA BRANCHE.
 *
 * ★ Même forme que `nomActionnaire` à l'étape 5, et pour la même raison : quatre
 * sites lisent le nom d'un dirigeant — la règle « même nom » de l'écran, la
 * boucle d'écriture, le test « y a-t-il quelqu'un à nommer », et le sommaire.
 * Une seule définition, et les quatre l'appellent.
 */
export function nomDirigeant(s: SaisieDirigeant): string {
  return s.nouvelle ? s.nomSaisi : s.nomChoisi;
}

export interface OnboardingOfficers {
  president: SaisieDirigeant;
  secretary: SaisieDirigeant;
  treasurer: SaisieDirigeant;
}

/** Un poste non pourvu. ⛔ Aucune présélection : ni nom, ni pays, ni province. */
export const DIRIGEANT_VIDE: SaisieDirigeant = {
  nomChoisi: '',
  nomSaisi: '',
  nouvelle: false,
  adresse: { ...ADRESSE_VIERGE },
};

/** Les trois postes, dans l'ordre où l'écran les pose. */
export const POSTES = ['president', 'secretary', 'treasurer'] as const;
export type Poste = (typeof POSTES)[number];

interface StepOfficersProps {
  locale: string;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  incorporationDate?: string;
  initialOfficers?: OnboardingOfficers;
  // ⚠️ Promise<boolean>, NOT void. A `=> void` prop on an async handler makes the
  // promise float: the step cannot await the write, so it advances whether or not
  // anything was saved. That was the second half of the bceb84d defect at step 5,
  // and tsc reports NOTHING for it. Keep the return type.
  onContinue: (officers: OnboardingOfficers) => Promise<boolean>;
  onSkip: () => void;
}

// =============================================================================
// Shared styles
// =============================================================================

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
  appearance: 'none',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 500,
  color: 'var(--text-body)', marginBottom: '6px',
};

// =============================================================================
// Component
// =============================================================================

export default function StepOfficers({
  locale,
  directors,
  shareholders,
  incorporationDate = '',
  initialOfficers,
  onContinue,
  onSkip,
}: StepOfficersProps) {

  const fr = locale === 'fr';
  // i18n — DELIBERATE DIVERGENCE from this file's local convention. Every other
  // string here is a `fr ? … : …` ternary, which CLAUDE.md §1 forbids. The rule
  // "each file follows what it carries" arbitrates between two VALID conventions;
  // here one of the two is prohibited, so the new strings use keys. Following the
  // local convention would extend the debt to one more file. Precedent: bceb84d
  // did exactly this in StepShareholders. The existing ternaries are deliberately
  // NOT converted — that is a separate, queued cleanup, not this bundle.
  const tCommon = useTranslations('common');
  const t = useTranslations('officers');
  // ★ Les étiquettes d'adresse viennent de `people`, comme partout ailleurs ; seule
  //   la ligne 1 est une prop de BlocAdresse, et c'est celle qui diffère.
  const tPeople = useTranslations('people');

  // Build list of known people names (deduped)
  //
  // ⚖️ UNE PERSONNE MORALE N'EST PAS DIRIGEANTE, ET C'EST DÉSORMAIS ÉCRIT.
  // Depuis que l'étape 5 demande la nature du détenteur (2026-09-15), elle peut
  // rendre des actionnaires-SOCIÉTÉS. Aucun ne doit entrer dans ces trois listes :
  // une charge de président ou de secrétaire se tient par un être humain.
  //
  // ⛔ CE FILTRE ÉTAIT DÉJÀ JUSTE — PAR ACCIDENT. Une ligne d'entité laisse
  // `fullName` vide, donc `s.fullName.trim()` l'écartait toute seule. Le
  // comportement était bon et sa raison n'était écrite nulle part : quelqu'un
  // l'aurait « réparé » un jour en croyant combler un oubli, et aurait fait entrer
  // une société dans la liste des dirigeants.
  // ★ Le test porte donc sur `nature`, pas sur le vide d'un champ : l'intention
  // vit dans le code, pas dans une absence.
  const knownPeople = useMemo(() => {
    const names = new Set<string>();
    directors.forEach((d) => {
      if (d.fullName.trim()) names.add(d.fullName.trim());
    });
    shareholders.forEach((s) => {
      if (s.nature === 'individual' && s.fullName.trim()) names.add(s.fullName.trim());
    });
    return Array.from(names);
  }, [directors, shareholders]);

  // Smart default: pre-select sole director for president + secretary
  const seul = knownPeople.length === 1 ? knownPeople[0] : '';
  const [officiers, setOfficiers] = useState<OnboardingOfficers>(() =>
    initialOfficers ?? {
      president: { ...DIRIGEANT_VIDE, nomChoisi: seul },
      secretary: { ...DIRIGEANT_VIDE, nomChoisi: seul },
      treasurer: { ...DIRIGEANT_VIDE },
    },
  );

  /**
   * ⛔ UNE SENTINELLE, PAS UN NOM POSSIBLE. `<select>` ne porte que des chaînes ;
   * il faut donc une valeur qu'aucune personne ne puisse avoir. Les deux points
   * d'exclamation la rendent impossible à saisir dans un champ de nom.
   */
  const AUTRE = '!!autre!!';

  const maj = (poste: Poste, valeur: Partial<SaisieDirigeant>) =>
    setOfficiers((prev) => ({ ...prev, [poste]: { ...prev[poste], ...valeur } }));

  /**
   * LES NOMS QUE LE DOSSIER CONNAÎT DÉJÀ — pour la règle « on ne remontre pas
   * l'adresse d'une fiche qui existe ».
   *
   * ⛔ IL INCLUT LES AUTRES POSTES DE CETTE MÊME ÉTAPE. Nommer la même personne
   * neuve présidente PUIS secrétaire ne doit ouvrir qu'UN bloc d'adresse : le
   * second ne serait jamais écrit, puisque la boucle d'écriture réutilise la fiche
   * que le premier vient de créer.
   * ⚠️ Comparaison en minuscules et sans espaces de bord — la pré-lecture
   * d'OnboardingFlow emploie `ilike`, qui ignore la casse. Comparer autrement ici
   * afficherait un bloc que l'écriture ignorerait ensuite.
   */
  const nomsConnus = (postePropre: Poste) => {
    const noms = new Set(knownPeople.map((n) => n.trim().toLowerCase()));
    POSTES.forEach((p) => {
      if (p === postePropre) return;
      const nom = nomDirigeant(officiers[p]);
      if (nom.trim()) noms.add(nom.trim().toLowerCase());
    });
    return noms;
  };

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    // Reentrancy belt. MEASURED 2026-08-28: it cannot fire today —
    // the only invoker is the layout's continue button, which is
    // disabled={saving || continueDisabled} and reads the SAME render's `saving`.
    // Kept for the day a <form onSubmit> or an Enter handler is added:
    // Enter bypasses a disabled button, and officer_appointments carries no UNIQUE,
    // so a re-entry appoints the same title twice.
    if (saving) return;
    setError(null);

    // NO pre-write validation here, and that is DELIBERATE — not an oversight in
    // the copy from steps 4 and 5. Those guard a real precondition the user typed
    // and can empty (a price, an appointment date). This step has none: the
    // appointment_date is DERIVED by the parent from the incorporation date, which
    // step 2 requires — and if it is ever missing, the parent writes nothing and
    // returns false (no fallback to today since 2026-09-12). The three names come
    // from a fixed dropdown. A check here would protect nothing, and would falsely
    // suggest a control exists where there is nothing to control.

    setSaving(true);
    let ok = false;
    // supabase-js RETURNS { error } on Postgres and THROWS on a network failure.
    // Without the catch, saving stays true and the button freezes with no message.
    try {
      // ⛔ RIEN N'EST TRIMÉ ICI. `nomDirigeant` choisit la branche, la boucle
      //    d'écriture trime le nom qu'elle insère, et `chargeAdresse` trime chaque
      //    champ d'adresse. Le faire une seconde fois ici serait une seconde
      //    définition du vide, à côté de celles qui existent.
      ok = await onContinue(officiers);
      if (!ok) {
        setError(tCommon('saveFailed'));
      }
    } catch (err) {
      console.error('[onboarding] step 6 onContinue threw:', err);
      setError(tCommon('saveFailed'));
    } finally {
      // Release ONLY on failure. On success the step unmounts this component,
      // and releasing would open a one-render window where the button is
      // clickable at the OLD step — insert-only, no UNIQUE, so a click there
      // duplicates. Today setStep(7) and this line batch into one render
      // (MEASURED 2026-08-28: no await between setStep and return true in
      // OnboardingFlow) — this guard does not DEPEND on that staying true.
      if (!ok) setSaving(false);
    }
  }

  const briefcaseIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="12" />
      <path d="M12 12h.01" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 6 — DIRIGEANTS' : 'STEP 6 — OFFICERS'}
      icon={briefcaseIcon}
      title={fr ? (
        <>Les dirigeants<br />de votre entreprise</>
      ) : (
        <>Officers<br />of your company</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un dirigeant ?" : 'What is an officer?'}
      tooltipContent={fr
        ? "Le président supervise les affaires. Le secrétaire tient les registres. Souvent, c'est la même personne dans les petites entreprises."
        : 'The president oversees business affairs. The secretary maintains records. Often, this is the same person in small businesses.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
      saving={saving}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* ⛔ RENDU EN LIGNE, ET CE N'EST PAS UN CHOIX DE STYLE.
            Ce bloc vivait dans un composant `ChampPoste` DÉFINI DANS LE CORPS de
            StepOfficers. Un composant déclaré dans un rendu est une fonction NEUVE à
            chaque rendu : React compare les types d'élément par identité, ne les
            reconnaît pas, DÉMONTE le sous-arbre et le REMONTE. Le nœud DOM de
            l'entrée est donc remplacé à chaque frappe, et le focus part avec lui —
            on ne peut pas taper un nom.
            ⛔ LE DÉFAUT EST ANTÉRIEUR À CE LOT, ET IL DORMAIT. Son prédécesseur
            `PersonDropdown` était nesté de la même façon depuis toujours, mais il ne
            rendait qu'un `<select>` : on clique, on choisit, l'interaction est finie
            avant que la perte de focus se voie. Le premier champ TEXTE l'a réveillé.
            ★ Mesuré au 2026-09-15, balayage AST de app/ et components/ : c'était le
            SEUL composant défini dans le corps d'un autre. Pas un motif, un cas.
            ⛔ NE PAS LE REMETTRE DANS UN COMPOSANT LOCAL « pour la lisibilité ». Si
            ce bloc doit redevenir un composant, il se hisse AU MODULE. */}
        {POSTES.map((poste) => {
          const valeur = officiers[poste];
          const connus = nomsConnus(poste);
          // ⚠️ « Déjà connue » se décide sur le NOM TAPÉ, pas sur `nouvelle` :
          //    l'utilisateur peut taper un nom qui se trouve aux étapes 4 ou 5. Sa
          //    fiche sera réutilisée, donc son adresse ne serait écrite nulle part —
          //    on ne la demande pas.
          // ⚠️ Minuscules et sans espaces de bord : la pré-lecture d'OnboardingFlow
          //    emploie `ilike`, qui ignore la casse. Deux mécanismes qui décident de
          //    la même chose doivent comparer de la même façon.
          const dejaConnue = valeur.nouvelle && connus.has(valeur.nomSaisi.trim().toLowerCase());
          const label =
            poste === 'president' ? (fr ? 'Président·e' : 'President')
            : poste === 'secretary' ? (fr ? 'Secrétaire' : 'Secretary')
            : (fr ? 'Trésorier·ière' : 'Treasurer');
          return (
            <div key={poste}>
              <label style={fieldLabelStyle}>
                {label}
                {poste === 'treasurer' && (
                  <span style={{ marginLeft: '4px', fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>
                    ({fr ? 'optionnel' : 'optional'})
                  </span>
                )}
              </label>

              {!valeur.nouvelle ? (
                <select
                  value={valeur.nomChoisi}
                  onChange={(e) =>
                    e.target.value === AUTRE
                      ? maj(poste, { nouvelle: true })
                      : maj(poste, { nomChoisi: e.target.value })
                  }
                  style={selectStyle}
                >
                  <option value="">{fr ? '— Sélectionner —' : '— Select —'}</option>
                  {knownPeople.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option disabled value="__separateur">
                    ──────────
                  </option>
                  <option value={AUTRE}>{t('otherPerson')}</option>
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input
                    type="text"
                    value={valeur.nomSaisi}
                    onChange={(e) => maj(poste, { nomSaisi: e.target.value })}
                    placeholder="Jean-Philippe Roussy"
                    style={selectStyle}
                  />

                  {/* ⛔ AUCUNE PROP `marque` : CHAMPS_REQUIS.officer ne bouge pas, et
                      cette étape n'exige rien de neuf. OFFRIR ≠ IMPOSER. */}
                  {dejaConnue ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('alreadyKnown')}</p>
                  ) : (
                    <>
                      <BlocAdresse
                        valeur={valeur.adresse}
                        onChange={(adresse) => maj(poste, { adresse })}
                        locale={locale}
                        libelleLigne1={tPeople('address')}
                        idPrefixe={`dirigeant-${poste}`}
                        styleChamp={selectStyle}
                        styleEtiquette={fieldLabelStyle}
                      />
                      {/* ⚠️ ET ON SAIT CE QU'ELLE VAUT. Sa jumelle de l'étape 3 est là
                          depuis le 2026-09-09 et la plupart des sièges du parc sont
                          encore vides. On la met parce qu'elle coûte une phrase.
                          ⛔ Le compte vit dans le message de commit, que l'historique
                          date. ★ CHAMPS_REQUIS.officer exige ville et pays : une
                          personne nommée ici sans adresse entre dans la liste des
                          trous LE JOUR de sa création. La phrase dit où. */}
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {t('completeLater')}
                      </p>
                    </>
                  )}

                  {/* ⚖️ IL N'EFFACE PLUS — décision de Dom, 2026-09-15. Il ne touche
                      que `nouvelle` : le nom saisi et l'adresse restent en état, et
                      rebasculer sur « Une autre personne… » les retrouve. Ce qu'ils
                      deviennent si l'on reste sur un nom de la liste : rien ne les
                      écrit, puisque `nomDirigeant` ne lit que la branche active. */}
                  <button
                    type="button"
                    onClick={() => maj(poste, { nouvelle: false })}
                    style={{
                      alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
                      fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    {t('backToList')}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Note */}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{display:'inline',verticalAlign:'middle',color:'var(--color-nt-400)',marginRight:'4px'}}>
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 7v5M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {fr
            ? "Une même personne peut occuper plusieurs postes. C'est très courant dans les petites entreprises."
            : 'The same person can hold multiple positions. This is very common in small businesses.'}
        </p>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
            {error}
          </p>
        )}
      </div>
    </OnboardingStepLayout>
  );
}
