/**
 * LES EXIGENCES DE L'INSCRIPTION, MONTÉES ET VÉRIFIÉES — sonde CUMULATIVE.
 *
 * Run via:
 *   npm run check:inscription
 *
 * ⚖️ POURQUOI ELLE EXISTE. Dom ne teste l'inscription qu'UNE FOIS, à la fin des
 * quatre lots — un parcours coûte une société. Sans preuve PAR LOT, quatre lots
 * non vérifiés s'empilent et sa caméra ne peut plus dire lequel a cassé quoi.
 * On a payé ça avec la garde de l'étape 8.
 *
 * ⭐⭐ ELLE EST CUMULATIVE, ET C'EST TOUT SON INTÉRÊT. Le lot B rejoue A, le lot
 * C rejoue A+B, le lot D rejoue A+B+C. Une régression introduite au lot C sur
 * l'écran du lot A se trouve AU LOT C — pas par Dom à la fin.
 *
 * ── CE QU'ELLE PROUVE, PAR ÉCRAN, EN TROIS BRANCHES ─────────────────────────
 *   ① état VIDE    → les astérisques sont rendus · le bouton est DÉSACTIVÉ ·
 *                    le message NOMME les champs manquants
 *   ② état COMPLET → aucun message · bouton ACTIF
 *   ③ ⛔ NÉGATIF   → un formulaire VALIDE ne bloque JAMAIS. Une garde qui refuse
 *                    une saisie correcte est pire que pas de garde.
 *
 * ⚠️ CE QU'ELLE NE PROUVE PAS. Le comportement du navigateur : la frappe, le
 * focus, la soumission réelle. Elle monte l'arbre avec `react-dom/server` et lit
 * le BALISAGE. Ce qu'elle affirme, elle l'affirme sur ce qui est rendu.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
/** `jsx: preserve` : tsx retombe sur `React.createElement` — même raison que check-adresses. */
Object.assign(globalThis, { React });
import messages from '../messages/fr.json';
import { ADRESSE_VIERGE, type AdresseSaisie } from '@/lib/address';
import { CHAMPS_REQUIS_SIEGE } from '@/lib/data-gaps';
import { StepSiege } from '@/components/onboarding/StepSiege';

let echecs = 0;
const dire = (bon: boolean, quoi: string) => {
  if (!bon) echecs++;
  console.log(`     ${bon ? '✔' : '⛔'} ${quoi}`);
};

function rendre(composant: unknown, props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: 'fr', messages, timeZone: 'America/Toronto',
      children: React.createElement(composant as never, props as never),
    }),
  );
}

/** Les astérisques rendus — les TROIS notations du dépôt, pas une seule. */
function asterisques(html: string): number {
  return (html.match(/>\s*\*\s*</g) ?? []).length;
}

/**
 * Le bouton « Continuer » est-il désactivé ?
 * ⚠️ `OnboardingStepLayout` rend `disabled={saving || continueDisabled}` : React
 * n'émet l'attribut QUE s'il est vrai. Son absence est donc un bouton actif.
 */
function boutonDesactive(html: string): boolean {
  return /<button[^>]*\sdisabled(\s|=|>)/.test(html);
}

/**
 * UN SIÈGE COMPLET — et AUCUNE ADRESSE FABRIQUÉE.
 *
 * ⛔ LA PREMIÈRE VERSION PORTAIT « Montréal », « QC », « H2X 1Y4 », et A2 de
 * `check:adresses` l'a REFUSÉE — elle balaie `scripts/` comme le reste et
 * n'exempte personne, pas même elle-même. Elle avait raison, et je n'ai pas
 * desserré la garde.
 *
 * ★ ET LA CORRECTION EST PLUS JUSTE QUE L'ORIGINAL, PAS UN CONTOURNEMENT.
 * `champsManquantsSiege` ne teste QUE le vide (`estVide`) : il n'a jamais été
 * question de format. Une adresse d'apparence réaliste laissait croire que
 * cette sonde vérifie une syntaxe postale. Elle ne vérifie que « rempli ».
 * Les valeurs sont donc des jetons, et les champs sont NOMMÉS par la
 * déclaration elle-même — si `CHAMPS_REQUIS_SIEGE` s'étend, ce siège la suit.
 */
const SIEGE_COMPLET = {
  ...ADRESSE_VIERGE,
  ...Object.fromEntries(CHAMPS_REQUIS_SIEGE.map((champ) => [champ, 'rempli'])),
} as AdresseSaisie;

function donnees(siege: AdresseSaisie) {
  return {
    language: 'fr',
    company: {
      legalName: 'Essai inc.', legalNameEn: '', incorporationType: 'LSAQ',
      incorporationNumber: '', corporationNumber: '', incorporationDate: '2020-01-01',
      siege, fiscalYearEndMonth: 12, fiscalYearEndDay: 31,
    },
    officer: { fullName: '', role: 'director', startDate: '2026-01-01' },
  };
}

const socleSiege = {
  locale: 'fr', setData: () => {}, onNext: () => {}, onBack: () => {},
  saving: false, saveError: null,
};

/* ═══════════════════════════════════════════════════════════════════════════
   LOT A — L'ÉTAPE 3 EXIGE CE QU'ELLE DÉCLARE
   ═══════════════════════════════════════════════════════════════════════════ */
function lotA(): void {
  console.log('\n── LOT A · étape 3 · le siège');

  const vide = rendre(StepSiege, { ...socleSiege, data: donnees({ ...ADRESSE_VIERGE }) });
  const complet = rendre(StepSiege, { ...socleSiege, data: donnees(SIEGE_COMPLET) });

  console.log('   ① état VIDE');
  dire(asterisques(vide) === 5, `cinq astérisques rendus (obtenu ${asterisques(vide)})`);
  dire(boutonDesactive(vide), 'le bouton « Continuer » est DÉSACTIVÉ');
  const nomme = ['adresse', 'ville', 'province', 'code postal', 'pays']
    .every((mot) => vide.includes(mot));
  dire(nomme, 'le message NOMME les cinq champs manquants');
  dire(vide.includes('incomplète'), 'et il dit que le siège est incomplet');

  console.log('   ② état COMPLET');
  dire(!complet.includes('incomplète'), 'aucun message d’incomplétude');
  dire(!boutonDesactive(complet), '⛔ NÉGATIF — un siège COMPLET ne bloque JAMAIS');
  dire(asterisques(complet) === 5, 'les astérisques restent (ils marquent, ils n’accusent pas)');

  console.log('   ⭐ contrôle positif de la sonde elle-même');
  dire(asterisques('<label>Ville <span>*</span></label>') === 1, 'le motif SAIT voir un astérisque');
  dire(boutonDesactive('<button disabled>x</button>'), 'le motif SAIT voir un bouton désactivé');
  dire(!boutonDesactive('<button>x</button>'), 'et il ne le voit PAS quand il n’y est pas');
}

/* ─── LOTS B, C, D : leurs écrans s'ajoutent ici, et A se rejoue à chaque fois. */

console.log('EXIGENCES DE L’INSCRIPTION — montage réel, sans navigateur');
lotA();
console.log(`\n${echecs === 0 ? '✔ TOUT PASSE' : `⛔ ${echecs} échec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);
