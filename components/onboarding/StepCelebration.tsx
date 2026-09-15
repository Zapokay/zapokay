'use client';

import { useState } from 'react';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import type { OnboardingDirector } from './StepDirectors';
import { nomActionnaire, type OnboardingShareholder } from './StepShareholders';
import type { OnboardingOfficers } from './StepOfficers';
import type { IncorporationType } from '@/lib/types';
import { regimeEnBase } from '@/lib/regimes';
import IntlMessageFormat from 'intl-messageformat';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

// =============================================================================
// Types
// =============================================================================

interface StepCelebrationProps {
  locale: string;
  companyName: string;
  incorporationType: IncorporationType;
  directors: OnboardingDirector[];
  shareholders: OnboardingShareholder[];
  officers: OnboardingOfficers;
  /** Steps 4 and 6 shape: awaited; false = the write failed, do not advance. */
  onContinue: () => Promise<boolean>;
}

// =============================================================================
// i18n helper — formats ICU MessageFormat strings against the active locale.
// Used here (instead of next-intl's useTranslations) because OnboardingFlow's
// activeLocale (data.language) can diverge from the URL locale that
// useTranslations reads. See project_onboarding_dual_locale memory.
// =============================================================================

function formatMsg(
  locale: string,
  path: string,
  params: Record<string, string | number> = {}
): string {
  const messages = locale === 'fr' ? frMessages : enMessages;
  const template = path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    messages
  );
  if (typeof template !== 'string') return path;
  return new IntlMessageFormat(template, locale).format(params) as string;
}

/**
 * LE NOM D'UN ACTIONNAIRE AU SOMMAIRE — et sa NATURE quand c'en est une société.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-15, forme (A) : la nature entre dans le nom. « Le défaut
 * à fermer est qu'une société ressemble à une personne, pas qu'on ne sait pas combien
 * de chaque. » Un second compte aurait demandé deux clés ICU de plus, avec leurs
 * clauses =0/=1/other dans les deux langues, sur une ligne qui en porte déjà trois.
 *
 * ⛔ LE MARQUEUR DÉRIVE DU TYPE, JAMAIS UN MOT FIXE. `entity_type` admet `trust` :
 * écrire « société » sur une fiducie serait la même erreur d'un cran plus fin.
 * ★ ET LES DEUX LIBELLÉS SONT CEUX DU CATALOGUE QUE L'UTILISATEUR VIENT DE CHOISIR À
 * L'ÉTAPE 5 — `shareholders.entityTypeCorporation` / `entityTypeTrust`. Aucune table
 * de libellés neuve : c'est ainsi qu'on arrive à treize tables pour les titres.
 */
function nomAffiche(s: OnboardingShareholder, locale: string): string {
  const nom = nomActionnaire(s).trim();
  if (s.nature !== 'entity') return nom;
  const messages = locale === 'fr' ? frMessages : enMessages;
  const type =
    s.entite.entityType === 'trust'
      ? messages.shareholders.entityTypeTrust
      : messages.shareholders.entityTypeCorporation;
  return formatMsg(locale, 'onboarding.summary.shareholderEntity', { name: nom, type });
}

// Counts 1–4 show all names; 5+ shows first 3 + "et N autres" / "and N more".
function joinNames(names: string[], locale: string): string {
  if (names.length <= 4) return names.join(', ');
  const firstThree = names.slice(0, 3).join(', ');
  return formatMsg(locale, 'onboarding.summary.andMore', {
    first: firstThree,
    count: names.length - 3,
  });
}

// =============================================================================
// Component
// =============================================================================

export default function StepCelebration({
  locale,
  companyName,
  incorporationType,
  directors,
  shareholders,
  officers,
  onContinue,
}: StepCelebrationProps) {

  const fr = locale === 'fr';

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Steps 4 and 6 shape. Single product-wide message: `common.saveFailed`.
  async function handleContinue() {
    setError(null);
    setSaving(true);
    const ok = await onContinue();
    if (!ok) {
      setError(formatMsg(locale, 'common.saveFailed'));
      setSaving(false);
    }
  }

  const validDirectors = directors.filter((d) => d.fullName.trim());
  /**
   * ⛔ `nomActionnaire`, PAS `fullName` — ET C'EST LE FILTRE QUI CASSAIT LE PLUS FORT.
   * Une ligne d'actionnaire-SOCIÉTÉ porte sa dénomination dans `entite.legalName` et
   * laisse `fullName` vide. Ce filtre l'aurait donc écartée — pas affichée comme une
   * personne : ÉCARTÉE, donc absente du COMPTE. Le sommaire aurait annoncé
   * « 1 actionnaire » là où l'utilisateur venait d'en saisir deux, avec sa pastille
   * verte, sur l'écran où il relit son travail juste avant de le sceller.
   * ★ Le lot aurait fermé la confusion à l'étape 5 et l'aurait rouverte ici, en pire.
   */
  const validShareholders = shareholders.filter((s) => nomActionnaire(s).trim());

  // Build summary lines per Bundle B Fix 3: medium-detail per category.
  const lines: { text: string; done: boolean }[] = [];

  // Company line — always rendered (company is saved at Step 3).
  //
  // ⛔ LA VALEUR BRUTE NE SORT PLUS ICI, ET C'ÉTAIT LE SEUL ENDROIT DU PARCOURS OÙ
  //    ELLE SORTAIT. Cette ligne passait `incorporationType` — le vocabulaire du
  //    FLUX, 'LSAQ' ou 'CBCA' — directement dans le gabarit ICU. L'écran affichait
  //    donc « Ma société inc. (CBCA) », littéralement, IDENTIQUE en français et en
  //    anglais, sans passer par aucun catalogue. Les quatre autres surfaces qui
  //    nomment un régime lisaient déjà `common.regimes` ; celle-ci, non.
  // ★ C'EST L'ÉCRAN OÙ L'UTILISATEUR RELIT SON CHOIX JUSTE AVANT DE LE SCELLER.
  // ⚠️ `regimeEnBase` ET NON UNE COMPARAISON ÉCRITE ICI : le catalogue est indexé
  //    par la valeur de la BASE ('LSA'), le flux porte 'LSAQ'. La conversion vivait
  //    déjà à deux endroits, et cette ligne aurait été le troisième.
  // ⚪ `acronym`, PAS `choix` : un sommaire ÉTIQUETTE ce qui a été choisi, il ne
  //    propose plus rien. Voir lib/regimes.ts.
  const messagesRegime = locale === 'fr' ? frMessages : enMessages;
  lines.push({
    text: formatMsg(locale, 'onboarding.summary.company', {
      companyName,
      incorporationType: messagesRegime.common.regimes[regimeEnBase(incorporationType)].acronym,
    }),
    done: true,
  });

  // Directors line — count always; names appended only when count > 0.
  {
    const count = validDirectors.length;
    let text = formatMsg(locale, 'onboarding.summary.directorsCount', { count });
    if (count > 0) {
      text += formatMsg(locale, 'onboarding.summary.directorsNames', {
        names: joinNames(validDirectors.map((d) => d.fullName.trim()), locale),
      });
    }
    lines.push({ text, done: count > 0 });
  }

  // Shareholders line — count always; names appended only when count > 0.
  {
    const count = validShareholders.length;
    let text = formatMsg(locale, 'onboarding.summary.shareholdersCount', { count });
    if (count > 0) {
      text += formatMsg(locale, 'onboarding.summary.shareholdersNames', {
        // ⛔ PAS `.map(nomAffiche)` NU : `Array.map` passe (valeur, INDEX, tableau), et
        //    l'index serait arrivé dans `locale`. tsc l'a refusé — il ne l'aurait pas
        //    fait si `nomAffiche` n'avait eu qu'un paramètre.
        names: joinNames(validShareholders.map((s) => nomAffiche(s, locale)), locale),
      });
    }
    lines.push({ text, done: count > 0 });
  }

  // Officers — one line per assigned role; omit lines for unassigned roles.
  if (officers.president.nom.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerPresident', {
        name: officers.president.nom.trim(),
      }),
      done: true,
    });
  }
  if (officers.secretary.nom.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerSecretary', {
        name: officers.secretary.nom.trim(),
      }),
      done: true,
    });
  }
  if (officers.treasurer.nom.trim()) {
    lines.push({
      text: formatMsg(locale, 'onboarding.summary.officerTreasurer', {
        name: officers.treasurer.nom.trim(),
      }),
      done: true,
    });
  }

  const clipboardIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );

  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 7 — SOMMAIRE' : 'STEP 7 — SUMMARY'}
      icon={clipboardIcon}
      title={fr ? 'Votre entreprise est prête !' : 'Your company is ready!'}
      locale={locale}
      onContinue={handleContinue}
      saving={saving}
      // Fix 2: continueLabel omitted → layout default "Continuer/Continue".
      // Step 7 is mid-flow (Step 8 / Fiscal Years follows), so "Terminer" was misleading.
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {/* Summary lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: line.done ? '#F5B91E' : 'var(--page-bg)',
                border: `1px solid ${line.done ? '#F5B91E' : 'var(--ob-incomplete-border)'}`,
              }}>
                {line.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C1A17" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                )}
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: line.done ? 500 : 400,
                color: line.done ? 'var(--text-heading)' : 'var(--text-muted)',
                lineHeight: 1.4,
              }}>
                {line.text}
              </span>
            </div>
          ))}
        </div>

        {/* Subtitle */}
        <p style={{
          fontSize: '13px', color: 'var(--text-secondary)',
          textAlign: 'center', paddingTop: '12px',
          borderTop: '1px solid var(--card-border)',
        }}>
          {fr
            ? 'Prochaine étape : choisissez vos exercices financiers.'
            : 'Next step: choose your fiscal years.'}
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
