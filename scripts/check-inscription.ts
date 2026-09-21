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
import { CHAMPS_REQUIS, CHAMPS_REQUIS_ENTITE, CHAMPS_REQUIS_SIEGE } from '@/lib/data-gaps';
import { societeEnColonnes } from '@/lib/societe-colonnes';
import { StepSiege } from '@/components/onboarding/StepSiege';
import { StepCompany } from '@/components/onboarding/StepCompany';
import StepDirectors, { type OnboardingDirector } from '@/components/onboarding/StepDirectors';
import StepShareholders, { type OnboardingShareholder } from '@/components/onboarding/StepShareholders';
import EntityForm from '@/components/shareholders/EntityForm';
import StepOfficers, { DIRIGEANT_VIDE, nomDirigeant, type OnboardingOfficers, type SaisieDirigeant } from '@/components/onboarding/StepOfficers';
import { declarationDesExercices } from '@/lib/active-years';
import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { aEchoue, etatDeSection } from '../lib/requetes-groupees';
import { SectionEnEchec } from '../components/ui/SectionEnEchec';
import { join } from 'path';
import { VALEUR_ENTITE_VIDE, chargeEntite, correctifEntite, valeurAvecAdresse } from '@/lib/entity-payload';

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

/**
 * LE TEXTE RENDU DIT-IL CETTE PHRASE ? — et il faut défaire les entités d'abord.
 *
 * ⛔ PIÈGE TROUVÉ AU LOT C2, PAR UNE ASSERTION QUI A ÉCHOUÉ ALORS QUE L'ÉCRAN
 * DISAIT VRAI. `renderToStaticMarkup` échappe l'apostrophe en `&#x27;`, si bien
 * qu'une phrase du catalogue — « le nombre d'actions » — ne se retrouve JAMAIS
 * telle quelle dans le balisage. Un `includes` nu aurait donc dit « le message ne
 * le nomme pas » de tout message contenant une apostrophe, c'est-à-dire du tiers
 * du catalogue français.
 * ★ C'est un faux NÉGATIF, le moins dangereux des deux — mais il aurait pu être
 * « corrigé » en retirant l'assertion.
 */
const dit = (html: string, phrase: string): boolean =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .includes(phrase);

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
const adresseRemplie = (champs: readonly string[]): AdresseSaisie => ({
  ...ADRESSE_VIERGE,
  ...Object.fromEntries(champs.map((champ) => [champ, 'rempli'])),
}) as AdresseSaisie;

const SIEGE_COMPLET = adresseRemplie(CHAMPS_REQUIS_SIEGE);

/**
 * ⚠️ LA SOCIÉTÉ DU LOT A ÉTAIT COMPLÈTE PAR HASARD, ELLE L'EST MAINTENANT PAR
 * CONSTRUCTION. L'étape 3 se moque du contenu de `company` ; l'étape 2 en vit.
 * `societe` porte donc les valeurs par défaut d'une société QUI PASSE l'étape 2,
 * et chaque cas ne surcharge que ce qu'il veut mettre en défaut.
 * ⛔ Aucune donnée d'apparence réelle : des jetons. La déclaration ne teste que
 * le VIDE (`estVide`) — un NEQ « réaliste » laisserait croire le contraire.
 * ⚪ `incorporationNumber` porte dix chiffres parce que `isValidNeq` est une règle
 * d'ÉCRAN, pas de déclaration : la sonde ne la teste pas, elle ne la contredit pas.
 */
const SOCIETE_COMPLETE = {
  legalName: 'Essai inc.', legalNameEn: '', incorporationType: 'LSAQ',
  incorporationNumber: '1111111111', corporationNumber: '', incorporationDate: '2020-01-01',
  fiscalYearEndMonth: 12, fiscalYearEndDay: 31,
};

function donnees(siege: AdresseSaisie, societe: Partial<typeof SOCIETE_COMPLETE> = {}) {
  return {
    language: 'fr',
    company: { ...SOCIETE_COMPLETE, ...societe, siege },
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
    .every((mot) => dit(vide, mot));
  dire(nomme, 'le message NOMME les cinq champs manquants');
  dire(dit(vide, 'incomplète'), 'et il dit que le siège est incomplet');

  console.log('   ② état COMPLET');
  dire(!dit(complet, 'incomplète'), 'aucun message d’incomplétude');
  dire(!boutonDesactive(complet), '⛔ NÉGATIF — un siège COMPLET ne bloque JAMAIS');
  dire(asterisques(complet) === 5, 'les astérisques restent (ils marquent, ils n’accusent pas)');

  console.log('   ⭐ contrôle positif de la sonde elle-même');
  dire(asterisques('<label>Ville <span>*</span></label>') === 1, 'le motif SAIT voir un astérisque');
  dire(boutonDesactive('<button disabled>x</button>'), 'le motif SAIT voir un bouton désactivé');
  dire(!boutonDesactive('<button>x</button>'), 'et il ne le voit PAS quand il n’y est pas');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT B — L'ÉTAPE 2 EXIGE CE QUI FAIT UNE SOCIÉTÉ
   ═══════════════════════════════════════════════════════════════════════════ */

const socleSociete = { locale: 'fr', setData: () => {}, onNext: () => {}, onBack: () => {} };

const etape2 = (societe: Partial<typeof SOCIETE_COMPLETE>) =>
  rendre(StepCompany, { ...socleSociete, data: donnees(SIEGE_COMPLET, societe) });

/** Le message d'incomplétude, sans son préambule — ce qu'il NOMME. */
const VIDE_TOTAL = {
  legalName: '', legalNameEn: '', incorporationNumber: '', corporationNumber: '', incorporationDate: '',
};

function lotB(): void {
  console.log('\n── LOT B · étape 2 · la société');

  const vide = etape2(VIDE_TOTAL);
  const complet = etape2({});

  console.log('   ① état VIDE (régime provincial)');
  // ⚪ DEUX astérisques, pas trois : le NEQ et la date. Le numéro fédéral n'en a
  //    pas sous LSAQ — c'est la conditionnelle, et c'est le négatif ② plus bas.
  dire(asterisques(vide) === 2, `deux astérisques rendus (obtenu ${asterisques(vide)})`);
  dire(boutonDesactive(vide), 'le bouton « Continuer » est DÉSACTIVÉ');
  dire(
    ['dénomination sociale', 'NEQ', 'date de constitution'].every((mot) => dit(vide, mot)),
    'le message NOMME les trois exigences manquantes',
  );
  dire(dit(vide, 'Il manque des renseignements'), 'et il dit que la société est incomplète');

  console.log('   ② état COMPLET');
  dire(!dit(complet, 'Il manque des renseignements'), 'aucun message d’incomplétude');
  dire(!boutonDesactive(complet), '⛔ NÉGATIF ① — un formulaire COMPLET ne bloque JAMAIS');
  dire(asterisques(complet) === 2, 'les astérisques restent (ils marquent, ils n’accusent pas)');

  console.log('   ③ ⛔ NÉGATIF ② — le régime réclame le BON champ, pas les deux');
  // ⭐ LSAQ, tout rempli SAUF le numéro fédéral : il ne doit rien réclamer.
  dire(
    !dit(complet, 'numéro de société fédéral'),
    'une société PROVINCIALE ne réclame PAS le numéro fédéral',
  );
  const federalVide = etape2({ incorporationType: 'CBCA', corporationNumber: '' });
  dire(boutonDesactive(federalVide), 'une société FÉDÉRALE sans ce numéro est bloquée');
  dire(dit(federalVide, 'numéro de société fédéral'), 'et le message le NOMME');
  dire(asterisques(federalVide) === 3, `l’astérisque fédéral APPARAÎT (3 astérisques, obtenu ${asterisques(federalVide)})`);
  const federalRempli = etape2({ incorporationType: 'CBCA', corporationNumber: '1111111' });
  dire(!boutonDesactive(federalRempli), '⛔ et une FÉDÉRALE complète ne bloque JAMAIS');

  console.log('   ③ ⛔ NÉGATIF ③ — une dénomination ANGLAISE SEULE ne bloque PAS');
  // ⚖️ C'est l'arbitrage de Dom rendu exécutable : « au moins un des deux ».
  const anglaiseSeule = etape2({ legalName: '', legalNameEn: 'Trial Inc.' });
  dire(!boutonDesactive(anglaiseSeule), 'le bouton reste ACTIF');
  dire(!dit(anglaiseSeule, 'dénomination sociale'), 'et rien ne réclame la dénomination');
  // ⛔ ET LA RÉCIPROQUE : française seule passe aussi. Un groupe qui n'accepterait
  //    qu'un de ses deux membres ne serait pas un groupe.
  dire(!boutonDesactive(etape2({ legalName: 'Essai inc.', legalNameEn: '' })), 'la française seule aussi');
  dire(boutonDesactive(etape2({ legalName: '', legalNameEn: '' })), 'et les DEUX vides bloquent');

  console.log('   ⭐ contrôle positif de la conversion flux → colonnes');
  // ⛔ SANS CE CONTRÔLE, TOUT LE RESTE PEUT ÊTRE JUSTE POUR UNE MAUVAISE RAISON :
  //    c'est cette fonction que la garde ET l'écriture emploient.
  const lsaq = societeEnColonnes({ ...SOCIETE_COMPLETE, corporationNumber: '1111111' } as never);
  dire(lsaq.corporation_number === null, 'un numéro fédéral saisi sous LSAQ ne SORT PAS en colonne');
  const cbca = societeEnColonnes({ ...SOCIETE_COMPLETE, incorporationType: 'CBCA', corporationNumber: '1111111' } as never);
  dire(cbca.corporation_number === '1111111', 'et il sort sous CBCA');
  dire(societeEnColonnes({ ...SOCIETE_COMPLETE, legalNameEn: '   ' } as never).legal_name_en === null,
    'un champ d’espaces s’écrit `null`, jamais une chaîne vide');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT C1 — L'ÉTAPE 4 EXIGE UN ADMINISTRATEUR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ AUCUNE ADRESSE FABRIQUÉE, MÊME RAISON QU'AU SIÈGE — ET A2 M'A REPRIS UNE
 * SECONDE FOIS. `adresse: { address_city: 'rempli' }` est un LITTÉRAL AFFECTÉ À UNE
 * ADRESSE, et A2 le refuse même quand la valeur est un jeton : elle balaie
 * `scripts/` comme le reste et n'exempte personne. L'adresse se construit donc
 * DEPUIS `CHAMPS_REQUIS.director`, par le même fabricant que le siège — et c'est
 * plus juste, puisque la fixture suit la déclaration si elle change.
 * ⚪ `appointmentDate` est remplie partout : c'est une règle d'ÉCRAN (elle refuse
 * au clic), pas une exigence de la déclaration. La sonde ne la teste pas et ne la
 * contredit pas.
 */
const ADMIN_VIDE: OnboardingDirector = {
  fullName: '', appointmentDate: '2020-01-01',
  adresse: { ...ADRESSE_VIERGE }, isCanadianResident: null,
};
const ADMIN_COMPLET: OnboardingDirector = {
  ...ADMIN_VIDE, fullName: 'Essai', adresse: adresseRemplie(CHAMPS_REQUIS.director),
};
/** Un nom, mais pas de ville : le cas exact du négatif ③ du brief. */
const ADMIN_SANS_VILLE: OnboardingDirector = {
  ...ADMIN_VIDE,
  fullName: 'Essai',
  adresse: adresseRemplie(CHAMPS_REQUIS.director.filter((c) => c !== 'address_city')),
};

const etape4 = (lignes: OnboardingDirector[]) =>
  rendre(StepDirectors, {
    locale: 'fr', residencyApplies: false, initialDirectors: lignes,
    onContinue: async () => true,
  });

function lotC1(): void {
  console.log('\n── LOT C1 · étape 4 · les administrateurs');

  const vide = etape4([ADMIN_VIDE]);
  const complet = etape4([ADMIN_COMPLET]);

  console.log('   ① aucune ligne complète');
  // ⚪ TROIS astérisques par ligne : le nom, la ville, le pays — et PAS les trois
  //    autres colonnes d'adresse, que rien n'exige.
  dire(asterisques(vide) === 3, `trois astérisques rendus (obtenu ${asterisques(vide)})`);
  dire(boutonDesactive(vide), 'le bouton « Continuer » est DÉSACTIVÉ');
  dire(dit(vide, 'Au moins un administrateur complet'), 'le message dit la RÈGLE');
  dire(
    ['le nom', 'la ville du domicile', 'le pays du domicile'].every((mot) => dit(vide, mot)),
    'et il NOMME les trois champs qui manquent',
  );
  dire(dit(vide, 'Administrateur 1'), 'et il dit à QUELLE ligne');

  console.log('   ⛔ ET AUCUN BOUTON « PASSER » DANS LE RENDU');
  dire(!dit(vide, 'Passer') && !dit(vide, 'Skip'), 'ni « Passer » ni « Skip »');
  // ⭐ Le contrôle positif de cette assertion-là : l'étape 2 en porte un, et le
  //    motif le voit. Sans ça, « absent » ne prouverait que l'aveuglement du motif.
  dire(etape2({}).includes('Retour'), '⭐ et le motif SAIT voir un bouton de gauche (étape 2 : « Retour »)');

  console.log('   ② une ligne complète');
  dire(!boutonDesactive(complet), '⛔ NÉGATIF ① — une ligne complète ne bloque JAMAIS');
  dire(!dit(complet, 'Au moins un administrateur'), 'aucun message de minimum');
  dire(asterisques(complet) === 3, 'les astérisques restent (ils marquent, ils n’accusent pas)');

  console.log('   ③ ⛔ NÉGATIFS');
  const completPlusVierge = etape4([ADMIN_COMPLET, ADMIN_VIDE]);
  dire(!boutonDesactive(completPlusVierge), 'une complète + une vierge ne bloque PAS');
  dire(asterisques(completPlusVierge) === 6, 'et les deux lignes portent leurs marques');
  const sansVille = etape4([ADMIN_SANS_VILLE]);
  dire(boutonDesactive(sansVille), 'un nom SANS VILLE bloque');
  dire(dit(sansVille, 'la ville du domicile'), 'et le message NOMME la ville');
  dire(!dit(sansVille, 'le nom'), '⛔ et il ne réclame PAS ce qui est rempli');

  console.log('   ⛔ LOT E4 — UN FAIT, UN PROPRIÉTAIRE (balayage des cinq écrans)');
  // ⛔ « requis POUR CONTINUER » appartient à l'astérisque et au message du minimum.
  //    La phrase du domicile possède « requis POUR L'EXPORT », qu'aucune autre ne dit.
  dire(dit(vide, "requises pour l'export de votre livre"), "la phrase du domicile parle de l'EXPORT");
  dire(
    !dit(vide, "l'export de votre livre, et pour continuer"),
    '⛔ et elle ne redit PLUS « et pour continuer » — le minimum le dit déjà',
  );
  dire(dit(vide, 'est requis pour continuer'), 'le minimum, lui, possède « pour continuer »');

  console.log('   ⭐ la ligne vierge reste VISIBLE comme incomplète');
  // ⚖️ Elle reste sautée à l'écriture (`continue`), et c'est correct — mais elle ne
  //    doit pas être muette. Ses astérisques et le message s'en chargent.
  dire(asterisques(completPlusVierge) > asterisques(complet), 'la seconde ligne est marquée, pas silencieuse');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT C2 — L'ÉTAPE 5 EXIGE UN ACTIONNAIRE, DE L'UNE OU L'AUTRE NATURE
   ═══════════════════════════════════════════════════════════════════════════ */

const ACTIONNAIRE_VIDE: OnboardingShareholder = {
  nature: 'individual', fullName: '', numberOfShares: 100, pricePerShare: '1',
  issueDate: '2020-01-01', adresse: { ...ADRESSE_VIERGE }, entite: { ...VALEUR_ENTITE_VIDE, legalName: '' },
};
const PERSONNE_COMPLETE: OnboardingShareholder = {
  ...ACTIONNAIRE_VIDE, fullName: 'Essai', adresse: adresseRemplie(CHAMPS_REQUIS.shareholder),
};
/** ⭐ LE NÉGATIF PROPRE À CE LOT : une SOCIÉTÉ actionnaire, complète. */
const SOCIETE_ACTIONNAIRE_COMPLETE: OnboardingShareholder = {
  ...ACTIONNAIRE_VIDE,
  nature: 'entity',
  entite: valeurAvecAdresse(
    { ...VALEUR_ENTITE_VIDE, legalName: 'Gestion Essai inc.' },
    adresseRemplie(CHAMPS_REQUIS_ENTITE),
  ),
};
const PERSONNE_SANS_VILLE: OnboardingShareholder = {
  ...ACTIONNAIRE_VIDE,
  fullName: 'Essai',
  adresse: adresseRemplie(CHAMPS_REQUIS.shareholder.filter((c) => c !== 'address_city')),
};

const etape5 = (lignes: OnboardingShareholder[]) =>
  rendre(StepShareholders, {
    locale: 'fr', directors: [], initialShareholders: lignes, onContinue: async () => true,
  });

function lotC2(): void {
  console.log('\n── LOT C2 · étape 5 · les actionnaires');

  const vide = etape5([ACTIONNAIRE_VIDE]);
  const personne = etape5([PERSONNE_COMPLETE]);

  console.log('   ① aucune ligne complète');
  dire(asterisques(vide) === 3, `trois astérisques rendus (obtenu ${asterisques(vide)})`);
  dire(boutonDesactive(vide), 'le bouton « Continuer » est DÉSACTIVÉ');
  dire(dit(vide, 'Au moins un actionnaire complet'), 'le message dit la RÈGLE');
  dire(
    ['le nom', 'la ville', 'le pays'].every((mot) => dit(vide, mot)),
    'et il NOMME les champs qui manquent',
  );
  dire(dit(vide, 'Actionnaire 1'), 'et il dit à QUELLE ligne');
  dire(!dit(vide, 'Passer') && !dit(vide, 'Skip'), '⛔ ni « Passer » ni « Skip »');

  console.log('   ② une PERSONNE complète');
  dire(!boutonDesactive(personne), '⛔ NÉGATIF ① — une personne complète ne bloque JAMAIS');
  dire(!dit(personne, 'Au moins un actionnaire'), 'aucun message de minimum');

  console.log('   ③ ⛔ NÉGATIF PROPRE À CE LOT — LA SOCIÉTÉ COMPTE AUTANT');
  const societe = etape5([SOCIETE_ACTIONNAIRE_COMPLETE]);
  dire(!boutonDesactive(societe), 'une SOCIÉTÉ actionnaire complète ne bloque PAS non plus');
  dire(!dit(societe, 'Au moins un actionnaire'), 'et rien ne lui est réclamé');
  // ⭐ ET SES ASTÉRISQUES SONT CEUX DE SA PROPRE DÉCLARATION — la branche société ne
  //    porte pas « Nom complet », elle porte « Nom légal ». Sans cette assertion, le
  //    minimum pourrait être juste en ayant aplati les deux natures en une.
  dire(dit(societe, 'Nom légal'), 'sa branche est bien la branche SOCIÉTÉ');
  dire(asterisques(societe) === 3, `trois astérisques, ceux de l’entité (obtenu ${asterisques(societe)})`);
  const societeVide = etape5([{ ...SOCIETE_ACTIONNAIRE_COMPLETE, entite: { ...VALEUR_ENTITE_VIDE, legalName: '' } }]);
  dire(boutonDesactive(societeVide), '⛔ et une société SANS rien est bloquée');
  dire(dit(societeVide, 'le nom légal'), 'et le message réclame le NOM LÉGAL, pas « le nom »');

  console.log('   ③ ⛔ AUTRES NÉGATIFS');
  const sansVille = etape5([PERSONNE_SANS_VILLE]);
  dire(boutonDesactive(sansVille), 'une personne avec nom SANS VILLE bloque');
  dire(dit(sansVille, 'la ville'), 'et le message NOMME la ville');
  dire(!dit(sansVille, 'il manque le nom'), 'et ne réclame PAS ce qui est rempli');
  dire(!boutonDesactive(etape5([PERSONNE_COMPLETE, ACTIONNAIRE_VIDE])), 'complète + vierge ne bloque PAS');

  console.log('   ⛔ LOT E2 — RIEN DE NOMMÉ NE SE JETTE EN SILENCE');
  // ⛔ LA RÈGLE EST DISTINCTE DU MINIMUM : une ligne complète ne la satisfait pas.
  const uneCompleteUneJetee = etape5([PERSONNE_COMPLETE, { ...PERSONNE_COMPLETE, numberOfShares: 0 }]);
  dire(boutonDesactive(uneCompleteUneJetee), '⭐ une COMPLÈTE + une NOMMÉE à 0 action → BLOQUE quand même');
  dire(dit(uneCompleteUneJetee, 'actionnaire 2'), 'et le message nomme la ligne 2');
  // ⭐ TOUTES les lignes jetées, pas la plus proche.
  const deuxJetees = etape5([
    { ...PERSONNE_COMPLETE, numberOfShares: 0 },
    { ...PERSONNE_COMPLETE, numberOfShares: 0 },
  ]);
  dire(
    dit(deuxJetees, 'actionnaire 1') && dit(deuxJetees, 'actionnaire 2'),
    'deux lignes jetées → les DEUX sont nommées',
  );
  // ⛔ NÉGATIF : une ligne VIERGE n'est pas « jetée » — elle n'a jamais existé.
  const completePlusVierge = etape5([PERSONNE_COMPLETE, ACTIONNAIRE_VIDE]);
  dire(!boutonDesactive(completePlusVierge), '⛔ NÉGATIF — une ligne VIERGE ne bloque PAS');
  dire(!dit(completePlusVierge, "Le nombre d'actions doit être"), 'et rien ne lui est reproché');

  console.log('   ⛔ LOT F — LE NUMÉRO FÉDÉRAL EST OFFERT, JAMAIS EXIGÉ');
  // ① LE CHAMP EST RENDU SUR LES DEUX FICHIERS — trois surfaces.
  const etape5Societe = etape5([SOCIETE_ACTIONNAIRE_COMPLETE]);
  dire(dit(etape5Societe, 'Numéro de société fédéral'), "l'étape 5 rend le champ");
  const formulaireEntite = rendre(EntityForm, { value: VALEUR_ENTITE_VIDE, onChange: () => {} });
  dire(
    dit(formulaireEntite, 'Numéro de société fédéral'),
    "`EntityForm` aussi — il sert IssueSharesModal ET EditEntityModal",
  );

  // ② ⛔ NÉGATIF : AUCUN astérisque de plus. La branche société en portait TROIS
  //    au lot C2 — nom légal, ville, pays — et elle doit en porter TROIS encore.
  dire(
    asterisques(etape5Societe) === 3,
    `aucun astérisque de plus sur la branche société (obtenu ${asterisques(etape5Societe)})`,
  );
  // ⭐ Et sur `EntityForm`, le NEQ garde le sien, le fédéral n'en prend pas.
  dire(
    (formulaireEntite.match(/text-red-500/g) ?? []).length ===
      (rendre(EntityForm, { value: { ...VALEUR_ENTITE_VIDE, entityType: 'trust' }, onChange: () => {} }).match(/text-red-500/g) ?? []).length + 1,
    "`EntityForm` ne gagne QU'UN astérisque en passant société → celui du NEQ",
  );

  // ③ LA CHARGE ÉCRIT LA COLONNE, ET VIDE → `null` / `''`.
  const avec = chargeEntite('c1', { ...VALEUR_ENTITE_VIDE, legalName: 'X', corporationNumber: '1709431-1' });
  dire(avec.corporation_number === '1709431-1', "la charge de CRÉATION transporte le numéro, trait d'union compris");
  const sans = chargeEntite('c1', { ...VALEUR_ENTITE_VIDE, legalName: 'X' });
  dire(sans.corporation_number === '', "vide → `''`, que le NULLIF de la fonction ramène à NULL");
  const fiducie = chargeEntite('c1', { ...VALEUR_ENTITE_VIDE, entityType: 'trust', legalName: 'X', corporationNumber: '1709431-1' });
  dire(fiducie.corporation_number === '', '⛔ une FIDUCIE n’en porte pas — filtré par type, comme le NEQ');
  const correctif = correctifEntite({ ...VALEUR_ENTITE_VIDE, legalName: 'X' });
  dire(correctif.corporation_number === null, 'la charge de CORRECTION écrit `null` quand le champ est vidé');

  // ⛔ ET LE TRAIT D'UNION SURVIT À LA FRAPPE, SUR LES DEUX SURFACES — lu à la
  //    source, parce que la sonde ne tape pas. Une mutation qui recopiait le
  //    `replace(/\D/g,'')` du NEQ sur le champ fédéral ne faisait tomber AUCUNE
  //    assertion : la charge, elle, reçoit déjà une valeur décapée. Le défaut naît
  //    à la FRAPPE, donc c'est la frappe qu'il faut lire.
  for (const [quoi, chemin] of [
    ["l'étape 5", ['components', 'onboarding', 'StepShareholders.tsx']],
    ['`EntityForm`', ['components', 'shareholders', 'EntityForm.tsx']],
  ] as [string, string[]][]) {
    const src = readFileSync(join(__dirname, '..', ...chemin), 'utf8');
    const ligne = src
      .split('\n')
      .find((l) => /corporationNumber'?,\s*e\.target\.value/.test(l) || /maj\('corporationNumber'/.test(l));
    dire(
      ligne !== undefined && !/replace\(\/\\D/.test(ligne),
      `${quoi} n'ampute PAS le numéro fédéral — le trait d'union survit`,
    );
  }

  // ④ ⭐ UNE ENTITÉ SANS NUMÉRO FÉDÉRAL RESTE VALIDE PARTOUT — tout le sens d'« offert ».
  dire(!boutonDesactive(etape5Societe), "une société actionnaire SANS numéro fédéral ne bloque PAS");
  dire(
    !dit(etape5Societe, 'Numéro de société fédéral est requis') &&
      !dit(etape5Societe, 'il manque le numéro'),
    'et rien ne le réclame nulle part',
  );

  console.log('   ⛔ LOT E4 — CHAQUE FAIT A UN SEUL PROPRIÉTAIRE');
  // ⛔ Le verdict ne change pas : une ligne à zéro action bloque toujours. Ce qui
  //    change, c'est QUI le dit — les jetées, jamais le minimum.
  const zeroActions = etape5([{ ...PERSONNE_COMPLETE, numberOfShares: 0 }]);
  dire(boutonDesactive(zeroActions), 'une ligne complète à ZÉRO action bloque toujours');
  dire(dit(zeroActions, "Le nombre d'actions doit être"), 'et ce sont les JETÉES qui le disent');
  dire(
    !dit(zeroActions, 'Au moins un actionnaire complet'),
    '⛔ le message du MINIMUM ne sort pas — il ne possède pas ce fait',
  );
  // ⭐ LE CAS LIMITE DU BRIEF : une phrase vide.
  dire(!dit(zeroActions, 'il manque .'), '⭐ et aucune phrase vide « il manque . »');
  // ⛔ ET LE MINIMUM POSSÈDE TOUJOURS LE SIEN : une ligne sans ville le réveille.
  const zeroEtSansVille = etape5([{ ...PERSONNE_SANS_VILLE, numberOfShares: 0 }]);
  dire(dit(zeroEtSansVille, 'Au moins un actionnaire complet'), 'le minimum parle quand la VILLE manque');
  dire(dit(zeroEtSansVille, 'la ville'), 'et il nomme la ville');
  dire(
    !dit(zeroEtSansVille, "Au moins un actionnaire complet : il manque le nombre"),
    "⛔ et il ne nomme JAMAIS le nombre d'actions",
  );}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT C3 — L'ÉTAPE 6 EXIGE UN PRÉSIDENT, PAS « UN DIRIGEANT »
   ═══════════════════════════════════════════════════════════════════════════ */

const SAISI_COMPLET: SaisieDirigeant = {
  nomChoisi: '', nomSaisi: 'Chantal', nouvelle: true,
  adresse: adresseRemplie(CHAMPS_REQUIS.officer),
};
const SAISI_SANS_VILLE: SaisieDirigeant = {
  ...SAISI_COMPLET,
  adresse: adresseRemplie(CHAMPS_REQUIS.officer.filter((c) => c !== 'address_city')),
};

/**
 * ⚠️ `directors` ET `shareholders` SONT VIDES PAR DÉFAUT, ET C'EST VOULU : la
 * branche ① (nom choisi dans la liste) n'existe que s'il y a une liste. Le cas qui
 * la teste en fournit une.
 */
const etape6 = (officiers: Partial<OnboardingOfficers>, connus: string[] = []) =>
  rendre(StepOfficers, {
    locale: 'fr',
    directors: connus.map((nom) => ({ ...ADMIN_COMPLET, fullName: nom })),
    shareholders: [],
    incorporationDate: '2020-01-01',
    initialOfficers: { president: { ...DIRIGEANT_VIDE }, secretary: { ...DIRIGEANT_VIDE }, treasurer: { ...DIRIGEANT_VIDE }, ...officiers },
    onContinue: async () => true,
  });

function lotC3(): void {
  console.log('\n── LOT C3 · étape 6 · le président');

  const vide = etape6({});

  console.log('   ① aucun président');
  dire(boutonDesactive(vide), 'le bouton « Continuer » est DÉSACTIVÉ');
  dire(dit(vide, 'Un président est requis'), 'le message dit la RÈGLE');
  dire(
    ['le nom', 'la ville du domicile', 'le pays du domicile'].every((mot) => dit(vide, mot)),
    'et il NOMME les trois champs qui manquent',
  );
  dire(!dit(vide, 'Passer') && !dit(vide, 'Skip'), '⛔ ni « Passer » ni « Skip »');
  // ⭐ Le poste exigé se marque, les deux autres se disent facultatifs.
  dire(asterisques(vide) === 1, `un seul astérisque, celui du président (obtenu ${asterisques(vide)})`);
  dire((vide.match(/\(optionnel\)/g) ?? []).length === 2, 'et DEUX postes se disent « (optionnel) »');

  console.log('   ② un président SAISI et complet (branche ③)');
  const president = etape6({ president: SAISI_COMPLET });
  dire(!boutonDesactive(president), '⛔ NÉGATIF ① — un président complet ne bloque JAMAIS');
  dire(!dit(president, 'Un président est requis'), 'aucun message de minimum');

  console.log('   ③ ⛔ LE NÉGATIF DE CE LOT — UN TRÉSORIER SEUL NE SUFFIT PAS');
  // ⛔ Sans cette assertion, `MINIMUM_PAR_ROLE.officer = 1` passerait pour juste.
  const tresorierSeul = etape6({ treasurer: SAISI_COMPLET });
  dire(boutonDesactive(tresorierSeul), 'un TRÉSORIER complet, seul, BLOQUE toujours');
  dire(dit(tresorierSeul, 'Un président est requis'), 'et le message réclame le PRÉSIDENT');
  const secretaireSeul = etape6({ secretary: SAISI_COMPLET });
  dire(boutonDesactive(secretaireSeul), 'un SECRÉTAIRE complet, seul, BLOQUE aussi');

  console.log('   ③ ⛔ LA BRANCHE ① — UN NOM CHOISI SUFFIT, SANS ADRESSE');
  const choisi = etape6({ president: { ...DIRIGEANT_VIDE, nomChoisi: 'Ana' } }, ['Ana']);
  dire(!boutonDesactive(choisi), 'un président CHOISI dans la liste ne bloque pas');
  dire(!dit(choisi, 'Un président est requis'), 'et rien ne lui est réclamé');
  // ⭐ Et la preuve que c'est bien la branche ① : aucun champ d'adresse rendu.
  dire(!dit(choisi, 'Adresse du domicile'), 'aucun bloc d’adresse : la fiche existe déjà');

  console.log('   ③ ⛔ LA BRANCHE ③ INCOMPLÈTE');
  const sansVille = etape6({ president: SAISI_SANS_VILLE });
  dire(boutonDesactive(sansVille), 'un président saisi SANS VILLE bloque');
  dire(dit(sansVille, 'la ville du domicile'), 'et le message NOMME la ville');
  dire(!dit(sansVille, 'il manque le nom'), 'et ne réclame PAS ce qui est rempli');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT E1 — L'ÉTAPE 6 GAGNE « AUCUN »
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ CE QU'ON NE PEUT PAS FAIRE ICI : CLIQUER. La sonde monte un balisage, elle ne
 * choisit rien dans un menu. La transition « un nom choisi → Aucun » se prouve donc
 * en TROIS morceaux qui se tiennent :
 *   ① l'OPTION existe, rendue, avec la valeur vide ;
 *   ② la choisir appelle `vider`, et `vider` écrit `DIRIGEANT_VIDE` — lu à l'AST ;
 *   ③ l'ÉTAT D'ARRIVÉE (`DIRIGEANT_VIDE`) rebloque, et l'emplacement y est vraiment
 *      vide.
 * ★ Aucun des trois ne suffit seul : ① sans ② serait une option qui ne fait rien,
 * ② sans ③ un effacement vers un état qui n'exige rien.
 */
function cheminDuVide(): { appelle: boolean; remetAuVide: boolean } {
  const chemin = join(__dirname, '..', 'components', 'onboarding', 'StepOfficers.tsx');
  const sf = ts.createSourceFile(chemin, readFileSync(chemin, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let appelle = false;
  let remetAuVide = false;
  const parcourir = (n: ts.Node) => {
    // ① la valeur vide du menu mène à `vider`
    if (ts.isConditionalExpression(n) && /e\.target\.value === ''/.test(n.condition.getText(sf))) {
      if (/vider\(poste\)/.test(n.whenTrue.getText(sf))) appelle = true;
    }
    // ② `vider` écrit l'unique définition du vide, par REMPLACEMENT et non par fusion
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'vider') {
      const corps = n.initializer?.getText(sf) ?? '';
      remetAuVide = /\.\.\.DIRIGEANT_VIDE/.test(corps) && !/\.\.\.prev\[poste\]/.test(corps);
    }
    n.forEachChild(parcourir);
  };
  parcourir(sf);
  return { appelle, remetAuVide };
}

function lotE1(): void {
  console.log('\n── LOT E1 · étape 6 · « Aucun »');

  const choisi = etape6({ president: { ...DIRIGEANT_VIDE, nomChoisi: 'Ana' } }, ['Ana']);
  const vide = etape6({});

  console.log('   ① l’option existe, et elle porte le bon mot');
  dire(dit(choisi, '— Aucun —'), 'le menu offre « — Aucun — »');
  dire(!dit(choisi, 'Sélectionner'), '⛔ et « — Sélectionner — » a disparu : une entrée, un sens');
  dire((choisi.match(/<option value=""/g) ?? []).length === 3, 'une par poste, trois en tout');

  console.log('   ② le chemin du vide, lu à l’AST');
  const chemin = cheminDuVide();
  dire(chemin.appelle, 'choisir la valeur vide appelle `vider`');
  dire(chemin.remetAuVide, "`vider` REMPLACE par `DIRIGEANT_VIDE` — il ne fusionne pas");
  // ⛔ ET LA DÉFINITION DU VIDE EST BIEN VIDE — sans quoi les deux au-dessus
  //    prouveraient qu'on remet l'emplacement dans un état qui n'est pas vide.
  dire(
    nomDirigeant(DIRIGEANT_VIDE) === '' &&
      Object.values(DIRIGEANT_VIDE.adresse).every((v) => v === ''),
    "et `DIRIGEANT_VIDE` ne porte ni nom ni adresse — aucun orphelin",
  );

  console.log('   ③ l’état d’arrivée REBLOQUE, et le message revient');
  dire(!boutonDesactive(choisi), 'départ : un président choisi ne bloque pas');
  dire(boutonDesactive(vide), "arrivée : « Aucun » RE-DÉSACTIVE le bouton");
  dire(dit(vide, 'Un président est requis'), 'et le message REVIENT');
  dire(!dit(vide, 'Adresse du domicile'), 'aucun bloc d’adresse orphelin sous le poste vidé');

  console.log('   ⛔ LE CAS QUE DOM N’A PAS PU FAIRE — UN TRÉSORIER SEUL');
  const tresorierSeulPresidentAucun = etape6({ treasurer: SAISI_COMPLET }, ['Ana']);
  dire(boutonDesactive(tresorierSeulPresidentAucun), 'trésorier complet + président à « Aucun » → BLOQUE');
  dire(dit(tresorierSeulPresidentAucun, 'Un président est requis'), 'et le message réclame le président');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOT D — L'EXERCICE EN COURS EST DÉJÀ COCHÉ
   ═══════════════════════════════════════════════════════════════════════════ */

/** Une société d'essai : constituée en 2020, exercice clos au 31 décembre. */
const SOCIETE_EXERCICES = {
  incorporation_date: '2020-03-15',
  fiscal_year_end_month: 12,
  fiscal_year_end_day: 31,
};
/** ⛔ UNE HORLOGE FIXE. Une sonde qui lit l'heure réelle change de verdict le
 *  1ᵉʳ janvier — c'est le défaut que `lib/active-years.ts` a fermé en sortant
 *  l'horloge des écrans ; elle ne revient pas ici. */
const AUJOURDHUI = new Date('2026-09-17T12:00:00-04:00');

/**
 * ⛔⛔ CET ÉCRAN NE SE MONTE PAS ICI, ET IL FAUT LE DIRE PLUTÔT QUE LE CONTOURNER.
 * `FiscalYearsSetup` appelle `useRouter()` à sa première ligne ; hors d'un app
 * router, React lève « invariant expected app router to be mounted ». Les cinq
 * écrans d'inscription, eux, montent — mesuré au lot A. Celui-ci est le seul du
 * parcours qui ne le fasse pas.
 *
 * ★ CE QU'ON PROUVE À LA PLACE, ET C'EST DEUX CHOSES, PAS UNE :
 *   ① LA RÈGLE, PAR EXÉCUTION — `declarationDesExercices` est pure, sans horloge
 *      imposée ni lecture de base, et c'est elle qui décide de ce qui est coché.
 *   ② LE BRANCHEMENT, PAR STRUCTURE — que l'état des cases NAISSE de `suivis` et
 *      de rien d'autre, lu à l'AST du fichier. Sans ②, prouver ① ne dirait rien de
 *      l'écran ; sans ①, ② ne dirait rien de la règle.
 *
 * ⚠️ CE QUE ÇA NE PROUVE PAS : le rendu. Une case dont `checked` serait câblé
 * ailleurs qu'à `activeYears` échapperait à ②. C'est la limite, elle est écrite.
 */
function brancheLesCasesSurSuivis(): { initial: boolean; checked: boolean } {
  const chemin = join(__dirname, '..', 'components', 'onboarding', 'FiscalYearsSetup.tsx');
  const sf = ts.createSourceFile(chemin, readFileSync(chemin, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initial = false;
  let checked = false;
  const parcourir = (n: ts.Node) => {
    // ① `useState(() => new Set(suivis))` — l'état naît de la prop, et d'elle seule.
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'useState') {
      const arg = n.arguments[0];
      if (arg && /new Set\(\s*suivis\s*\)/.test(arg.getText(sf))) initial = true;
    }
    // ② L'ÉTAT VISUEL D'UN EXERCICE SORT DE `activeYears`.
    // ⚠️ PAS D'ATTRIBUT `checked` À CHERCHER, ET MA PREMIÈRE ASSERTION LE CHERCHAIT.
    //    Cet écran n'a AUCUN `<input type="checkbox">` : chaque exercice est un
    //    `<button>` dont la bordure, le fond et la pastille dérivent d'un
    //    `isActive`. La sonde avait tort, pas l'écran — et elle l'a dit en
    //    échouant, ce qui est exactement ce qu'on lui demande.
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(sf) === 'isActive' &&
      /^activeYears\.has\(/.test(n.initializer?.getText(sf) ?? '')
    ) {
      checked = true;
    }
    n.forEachChild(parcourir);
  };
  parcourir(sf);
  return { initial, checked };
}

function lotD(): void {
  console.log('\n── LOT D · étape 8 · les exercices');

  console.log('   ⚠️ cet écran NE MONTE PAS (useRouter) — voir l’en-tête ci-dessus');
  const branchement = brancheLesCasesSurSuivis();
  dire(branchement.initial, "l'état des cases NAÎT de `suivis`, et de rien d'autre");
  dire(branchement.checked, "et l'état visuel d'un exercice sort de `activeYears`");

  console.log('   ① écran neuf, aucune ligne enregistrée');
  const neuf = declarationDesExercices(SOCIETE_EXERCICES, [], AUJOURDHUI);
  dire(neuf.suivis.includes(neuf.enCours), `l'exercice en cours (${neuf.enCours}) est COCHÉ`);

  console.log('   ② ⛔ NÉGATIF — aucune AUTRE année que les verrouillées');
  dire(neuf.suivis.length === neuf.verrouilles.length, 'suivis = verrouillés, rien de plus');
  dire(!neuf.suivis.includes(2021), "2021 n'est PAS coché");
  dire(!neuf.suivis.includes(2020), "2020 non plus — deux cochés sur sept exercices");

  console.log('   ③ ⛔ LE PLUS IMPORTANT — AUCUNE DOUBLE ÉCRITURE');
  // ⛔ `aActiver` est exactement ce que « Terminer » écrit. Si l'exercice en cours
  //    est DÉJÀ enregistré actif, il ne doit pas y figurer — sinon chaque passage
  //    réécrit une ligne qui existe.
  const dejaSuivi = declarationDesExercices(SOCIETE_EXERCICES, [2026], AUJOURDHUI);
  const storedActive = new Set([2026]);
  const aActiver = dejaSuivi.suivis.filter((y) => !storedActive.has(y));
  dire(!aActiver.includes(2026), "l'exercice en cours déjà suivi n'est PAS réécrit");
  dire(aActiver.length === 0, `et rien d'autre ne l'est (aActiver = [${aActiver}])`);

  console.log('   ⛔ LOT E3 — LE REFUS SE LIT, AU LIEU DE SE TAIRE');
  /**
   * ⛔ MÊME LIMITE QU'AU LOT D : l'écran ne monte pas (`useRouter`), et la sonde ne
   * clique pas. Le chemin se lit donc à l'AST, en trois morceaux :
   *   ① le bouton d'un exercice VERROUILLÉ n'est plus `disabled` — sans quoi le clic
   *      n'arriverait jamais et la raison ne pourrait pas se poser ;
   *   ② `toggleYear` POSE la raison au lieu de rendre en silence ;
   *   ③ la carte REND cette raison, et la phrase vient du catalogue.
   * ⚠️ Et une quatrième, négative : `title=` ne porte plus la phrase. La laisser là
   * ferait deux sources pour un seul fait, dont une inatteignable.
   */
  const ecran = readFileSync(
    join(__dirname, '..', 'components', 'onboarding', 'FiscalYearsSetup.tsx'),
    'utf8',
  );
  dire(/disabled=\{hasDoc\}/.test(ecran), 'le bouton n’est `disabled` que pour `hasDoc`');
  dire(!/disabled=\{hasDoc \|\| isLocked\}/.test(ecran), '⛔ un exercice verrouillé est CLIQUABLE');
  dire(/setRefus\(year\)/.test(ecran), '`toggleYear` POSE la raison au lieu de se taire');
  dire(/refus === year &&/.test(ecran), 'et la carte la REND');
  dire(
    !/title=[\s\S]{0,200}lockedAlwaysTracked/.test(ecran),
    "⛔ et `title=` ne la porte plus — une infobulle sur un élément désactivé ne s'affiche jamais",
  );
  // ⭐ CONTRÔLE POSITIF : la phrase EXISTE bien au catalogue, aux deux locales.
  dire(
    typeof messages.common.fiscalYears.lockedAlwaysTracked === 'string' &&
      messages.common.fiscalYears.lockedAlwaysTracked.length > 0,
    '⭐ et la phrase du catalogue est celle qu’on rend, pas une neuve',
  );

  console.log('   ⭐ ET IL EST COCHÉ DANS TOUS LES CAS, PAS SEULEMENT À NEUF');
  const cas: [string, number[]][] = [
    ['aucune ligne', []],
    ['une ancienne seule', [2021]],
    ['en cours déjà suivi', [2026]],
    ['en cours + anciennes', [2021, 2022, 2026]],
    ['le dernier terminé seul', [2025]],
    /**
     * ⭐⭐ LE CAS QUI MANQUAIT, ET C'EST UNE MUTATION QUI L'A RÉVÉLÉ. Retirer le
     * `push(enCours)` explicite de `declarationDesExercices` ne faisait tomber
     * AUCUNE assertion : dans les cinq cas ci-dessus, l'exercice en cours arrive
     * déjà par les verrouillés ou par la prolongation vers l'avant. La règle
     * paraissait donc prouvée alors que sa dernière ligne ne l'était pas.
     * ⛔ CE CAS-CI EST LE SEUL OÙ ELLE SEULE TRAVAILLE : une ligne active pour un
     * exercice AU-DESSUS de la liste déclarée. `fiscalYearSet` n'étend que vers
     * l'AVANT du plus haut enregistré, donc il ne rend RIEN, et sans le `push`
     * l'exercice en cours ne serait pas suivi.
     * ⚪ L'état est réel, pas inventé : l'en-tête de `declarationDesExercices` dit
     * qu'une ligne hors de la règle « reste lue », par décision de Dom du
     * 2026-09-13.
     */
    ['une ligne AU-DESSUS de la liste déclarée', [2030]],
  ];
  for (const [quoi, actifs] of cas) {
    const d = declarationDesExercices(SOCIETE_EXERCICES, actifs, AUJOURDHUI);
    dire(d.suivis.includes(d.enCours), `${quoi} → ${d.enCours} coché`);
  }
  // ⭐ CONTRÔLE POSITIF : la sonde sait dire NON. L'extension est vers l'AVANT, donc
  //    un exercice ANTÉRIEUR à la plus haute ligne active n'est pas ramené — sans
  //    ça, « toujours coché » ne prouverait que son aveuglement.
  const avecAncienne = declarationDesExercices(SOCIETE_EXERCICES, [2021], AUJOURDHUI);
  dire(!avecAncienne.suivis.includes(2020), '⭐ et 2020 ne revient PAS (extension vers l’avant)');
}

function lotK2() {
  console.log('\n   ⛔ LOT K-2 — UNE SECTION QUI ÉCHOUE N’EST PAS UNE PAGE QUI ÉCHOUE');

  /* ① LE LECTEUR D'ÉCHEC — les quatre formes qu'un résultat peut prendre.
     ★★ LA TROISIÈME EST LA SEULE QUI COMPTE VRAIMENT : une section VIDE n'est
     pas une section TOMBÉE. Si `aEchoue` la disait tombée, chaque société sans
     classe d'actions verrait « je n'ai pas pu charger » sur une page
     parfaitement chargée — un mensonge dans l'autre sens, et l'avis ne vaudrait
     plus rien. */
  dire(aEchoue({ status: 'rejected', reason: new Error('réseau') } as never),
    'une promesse REJETÉE est un échec');
  dire(aEchoue({ status: 'fulfilled', value: { data: null, error: { message: 'RLS' } } } as never),
    'une réponse TENUE qui porte `error` est un échec (supabase ne lève pas)');
  dire(!aEchoue({ status: 'fulfilled', value: { data: [] } } as never),
    '⭐ une section VIDE n’est PAS un échec');
  dire(!aEchoue({ status: 'fulfilled', value: { data: [{ id: 'x' }] } } as never),
    'une réponse pleine n’est pas un échec');

  /* ② CE QUE L'AVIS DIT À L'ÉCRAN. Rendu pour de vrai, avec le catalogue. */
  const avis = rendre(SectionEnEchec, { section: 'Classes d’actions', onRetry: () => {} });
  dire(dit(avis, 'Classes d’actions'), 'l’avis NOMME la section touchée');
  dire(dit(avis, 'n’a pas pu être chargée'), 'et il dit qu’il n’a pas pu charger');
  dire(/role="alert"/.test(avis), 'il est annoncé aux lecteurs d’écran (`role="alert"`)');
  /* ⛔ §366 — RENDU N'EST PAS ATTEIGNABLE, et cette assertion a d'abord été
     TROP FAIBLE : une mutation qui ajoutait `hidden` au bouton ne faisait rien
     tomber. On lit donc la balise elle-même, pas seulement sa présence. */
  const bouton = avis.match(/<button[^>]*>/)?.[0] ?? '';
  dire(
    bouton !== '' && !/\shidden/.test(bouton) && !/\sdisabled/.test(bouton) && dit(avis, 'Réessayer'),
    'et il offre une REPRISE ATTEIGNABLE, pas une consigne',
  );
  // ⛔ ③ LE COMPTE D'ASTÉRISQUES NE BOUGE PAS : un échec de chargement n'est pas
  //    une exigence de saisie, et l'astérisque appartient aux champs requis.
  dire(asterisques(avis) === 0, '⛔ et il n’introduit AUCUN astérisque');

  /* ⭐ CONTRÔLE POSITIF : la sonde sait dire NON. Le même rendu avec un autre
     nom de section ne doit PAS satisfaire l'assertion du nom. */
  const autre = rendre(SectionEnEchec, { section: 'Actionnaires', onRetry: () => {} });
  dire(!dit(autre, 'Classes d’actions'), '⭐ et un autre nom de section n’est PAS accepté');

  /* ③ LES AUTRES SECTIONS S'AFFICHENT — lu à la source, commentaires ÔTÉS.
     ⛔ C'EST LA LEÇON DU LOT K-1 : ma sonde de `/login` lisait le fichier brut,
     si bien qu'une NOTE parlant de redirection aurait satisfait — ou fait
     tomber — une assertion. Une garde qu'un commentaire décide n'est pas une
     garde. */
  const src = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'shareholders', 'ShareholdersClient.tsx'),
    'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  dire(/classesEnEchec \? \(\s*<SectionEnEchec/.test(src),
    'la section des classes bascule sur l’avis quand elle échoue');
  /* ⛔ ET RIEN D'AUTRE N'EST CONDITIONNÉ PAR CET ÉCHEC — le COMPTE de gardes
     est la sentinelle. ⚠️ Il valait 1 au lot K-2 et vaut 2 depuis K-2d, et ce
     n'est PAS un relâchement : la seconde garde est le bloc « Classes d'actions
     disponibles » de l'état vide, qui était MUET quand la requête tombait. Deux
     surfaces montrent les classes, donc deux gardes.
     ★ L'assertion a ÉCHOUÉ quand K-2d a ajouté la seconde, et c'est ce qu'on lui
     demande : forcer une relecture plutôt que laisser une garde apparaître sans
     que personne ne la remarque. Une TROISIÈME devra se justifier de même. */
  dire((src.match(/\{classesEnEchec \?/g) ?? []).length === 2,
    '⛔ exactement DEUX gardes de classes — les deux surfaces qui les montrent');
  dire(/<CapTableChart/.test(src) && !/classesEnEchec[^\n]*CapTableChart/.test(src),
    'le graphique n’est pas conditionné par cet échec');
  dire(/shareholderGroups\.map/.test(src) && !/classesEnEchec[^\n]*shareholderGroups/.test(src),
    'la liste des actionnaires non plus');
  dire(/section=\{t\('sectionShareClasses'\)\}/.test(src) && /\{t\('sectionShareClasses'\)\}/.test(src),
    'le titre et l’avis lisent la MÊME clé de catalogue');
}

function lotK2d() {
  console.log('\n   ⛔ LOT K-2d — « AUCUN ACTIONNAIRE » ET « JE N’AI PAS PU REGARDER »');

  /* ① LES TROIS CAS, ET LES QUATRE COMBINAISONS QUI LES PRODUISENT.
     ★★ LES DEUX DU MILIEU SONT LE LOT : même absence de lignes, deux écrans
     différents, parce que la RAISON de l'absence n'est pas la même. */
  dire(etatDeSection(false, true) === 'garnie', 'réussie avec des lignes → la liste');
  dire(etatDeSection(false, false) === 'vide', '⭐ réussie SANS ligne → « aucun actionnaire »');
  dire(etatDeSection(true, false) === 'echec', '⭐ TOMBÉE sans ligne → l’avis, PAS l’état vide');
  dire(etatDeSection(true, true) === 'echec', 'tombée prime, même si des lignes traînent');

  /* ⭐ CONTRÔLE POSITIF : les deux cas sans ligne doivent DIFFÉRER. Si la
     déclaration les confondait — ce qu'elle faisait avant ce lot —, cette
     assertion est la seule qui le dirait. */
  dire(etatDeSection(true, false) !== etatDeSection(false, false),
    '⛔ et les deux absences ne rendent PAS le même écran');

  const src = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'shareholders', 'ShareholdersClient.tsx'),
    'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* ② LA PAGE CONSOMME LA DÉCLARATION, elle ne refait pas le ternaire. */
  dire(/etatDeSection\(detentionsEnEchec, hasShareholders\)/.test(src),
    'la page DÉRIVE son état de la déclaration');
  dire(/etatDesDetentions === 'echec' \?/.test(src) && /etatDesDetentions === 'garnie' \?/.test(src),
    'et elle branche sur les trois cas');

  /* ③ LE BLOC DES CLASSES EST UNE VARIABLE, PAS UNE COPIE — §360. Deux
     références, une seule définition : le recopier ferait deux surfaces pour un
     fait, et l'une finirait par diverger. */
  dire((src.match(/const blocClasses = \(/g) ?? []).length === 1, 'le bloc des classes est DÉFINI une fois');
  dire((src.match(/\{blocClasses\}/g) ?? []).length === 2, 'et RÉFÉRENCÉ deux fois, jamais recopié');

  /* ④ ⛔ LE DOUBLON QUE K-2d A FAILLI INTRODUIRE. Quand les détentions
     échouent, `hasShareholders` est faux : le bloc « Classes d'actions
     disponibles » de l'état vide s'allumait EN PLUS du `blocClasses` de la
     branche d'échec. Cette garde est la seule chose qui l'empêche. */
  dire(/\{!detentionsEnEchec && !hasShareholders &&/.test(src),
    '⛔ les classes ne s’affichent pas DEUX fois quand les détentions tombent');
  dire(/\(classesEnEchec \|\| shareClasses\.length > 0\)/.test(src),
    'et une requête de classes tombée n’est pas MUETTE dans l’état vide');

  /* ⑤ LE CAS NORMAL NE BOUGE PAS D'UN PIXEL — l'ordre du balisage est le même
     qu'avant : graphique, classes, actionnaires. */
  const normale = src.slice(src.indexOf("etatDesDetentions === 'garnie'"));
  const iGraphe = normale.indexOf('<CapTableChart');
  const iClasses = normale.indexOf('{blocClasses}');
  const iActionnaires = normale.indexOf("{t('sectionShareholders')}");
  dire(iGraphe > -1 && iClasses > iGraphe && iActionnaires > iClasses,
    '⛔ l’ordre du cas normal est inchangé : graphique → classes → actionnaires');
}

function lotK3Dirigeants() {
  console.log('\n   ⛔ LOT K-3 · DIRIGEANTS — UNE SEULE SECTION, ET ELLE CESSE DE MENTIR');

  const src = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'officers', 'OfficersClient.tsx'),
    'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* ① J-2 — LES TROIS REQUÊTES PARTENT ENSEMBLE, ET EN `allSettled`. */
  dire(/await Promise\.allSettled\(\[/.test(src), 'les trois requêtes partent ENSEMBLE');
  dire(!/await Promise\.all\(\[/.test(src), '⛔ et en `allSettled`, jamais `all` — une seule ne doit pas tout emporter');
  dire((src.match(/const \{ data: [a-zA-Z]+ \} = await supabase/g) ?? []).length === 1,
    'il ne reste QU’UNE lecture en file : la société, dont `cid` dépend');

  /* ② LE CÂBLAGE PASSE PAR LA DÉCLARATION, il n'est pas recopié. */
  dire(/etatDeSection\(dirigeantsEnEchec, sortedOfficers\.length > 0\)/.test(src),
    'la page DÉRIVE son état de la déclaration partagée');
  dire(/etatDesDirigeants === 'echec' \?/.test(src) && /etatDesDirigeants === 'garnie' \?/.test(src),
    'et elle branche sur les trois cas');
  dire(/setDirigeantsEnEchec\(aEchoue\(officersRes\)\)/.test(src),
    'et l’échec vient de `aEchoue`, pas d’une liste vide');

  /* ③ ⛔ K-3d — LE PIÈGE CHERCHÉ, PAS ATTENDU. Un bloc gardé par une NÉGATION
     s'allumerait quand la requête tombe, donc EN PLUS de la branche d'échec.
     ★ Sur Actionnaires je l'avais trouvé par accident ; ici je le cherche, et
     il n'y en a pas : les trois gardes de cette page lisent `.length > 0`,
     donc elles s'ÉTEIGNENT quand la requête tombe au lieu de s'allumer. */
  dire(!/\{\s*!\s*[a-zA-Z]+\s*&&/.test(src),
    '⛔ aucun bloc gardé par une négation — pas de doublon possible ici');
  dire((src.match(/\.length > 0 &&/g) ?? []).length === 2,
    'les deux blocs annexes lisent `.length > 0` — ils s’éteignent, ils ne doublent pas');

  /* ④ LE NOM DE LA SECTION VIENT DU CATALOGUE, et c'est celui que la page
     emploie déjà pour se nommer — pas une seconde clé pour le même mot. */
  dire(/<SectionEnEchec section=\{t\('title'\)\}/.test(src),
    'l’avis lit la clé dont la page se sert DÉJÀ pour se nommer');
}

function lotK1() {
  console.log('\n   ⛔ LOT K-1 — LA SESSION QUI TOMBE RENVOIE À LA CONNEXION');

  /* ⛔ LUE À LA SOURCE, ET C'EST LE SEUL ENDROIT POSSIBLE. La sonde ne monte
     pas ces trois clients : leur `fetchData` est un effet qui interroge
     Supabase, et `window.location.assign` n'existe pas sous Node. Ce qui se
     vérifie ici est la FORME du garde — qu'il redirige au lieu de rendre la
     main —, pas son exécution.
     ★ ET C'EST EXACTEMENT LE DÉFAUT QU'ON RÉPARE : `if (!user) return` était
     un chargement éternel, muet. Une régression le réécrirait de la même
     façon, et cette assertion la verrait. */
  const PAGES: [string, string[]][] = [
    ['actionnaires', ['app', '[locale]', 'dashboard', 'shareholders', 'ShareholdersClient.tsx']],
    ['administrateurs', ['app', '[locale]', 'dashboard', 'directors', 'DirectorsClient.tsx']],
    ['dirigeants', ['app', '[locale]', 'dashboard', 'officers', 'OfficersClient.tsx']],
  ];

  for (const [quoi, chemin] of PAGES) {
    const src = readFileSync(join(__dirname, '..', ...chemin), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    dire(
      /if \(!user\)\s*\{\s*redirigeVersConnexion\(locale\);\s*return;\s*\}/.test(code),
      `${quoi} : une session perdue RENVOIE à la connexion`,
    );
    // ⛔ L'ANCIENNE FORME NE DOIT PLUS EXISTER — sinon les deux coexisteraient
    //    et l'assertion ci-dessus passerait pour la mauvaise raison.
    dire(!/if \(!user\) return;/.test(code), `${quoi} : plus aucun \`return\` muet`);
    dire(
      /from '@\/lib\/session-perdue'/.test(code),
      `${quoi} : la redirection vient de la déclaration unique`,
    );
  }

  /* ⭐ CONTRÔLE POSITIF : la sonde sait dire NON. On lui donne les deux formes
     fautives et elle doit les refuser — sans ça, les trois assertions
     ci-dessus ne prouveraient que sa complaisance. */
  const MUET = 'if (!user) return;';
  const BON = 'if (!user) { redirigeVersConnexion(locale); return; }';
  dire(!/if \(!user\)\s*\{\s*redirigeVersConnexion\(locale\);\s*return;\s*\}/.test(MUET),
    '⭐ et la forme muette est REFUSÉE par la même expression');
  dire(/if \(!user\)\s*\{\s*redirigeVersConnexion\(locale\);\s*return;\s*\}/.test(BON),
    '⭐ et la bonne forme est ACCEPTÉE');

  /* ⛔ ET LA PREUVE DE NON-BOUCLE, LUE AUSSI À LA SOURCE : `/login` ne doit
     porter AUCUNE redirection. Le jour où quelqu'un y ajoute un « si déjà
     connecté, va au tableau de bord », l'aller-retour devient possible —
     parce que le layout du tableau de bord rend une session RÉVOQUÉE (lot R),
     et que cette page-ci la renvoie ici. Cette assertion est le seul endroit
     du dépôt qui garde ce couple. */
  const login = readFileSync(join(__dirname, '..', 'app', '[locale]', 'login', 'page.tsx'), 'utf8')
    // ⚠️ Les commentaires sont ôtés : une note disant « ne pas rediriger ici »
    //    aurait fait tomber la garde, et une garde qu'un commentaire casse est
    //    une garde qu'on finit par supprimer.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  dire(
    !/redirect\(|router\.(push|replace)|window\.location/.test(login),
    '⛔ `/login` ne redirige NULLE PART — la boucle est impossible',
  );
}

console.log('EXIGENCES DE L’INSCRIPTION — montage réel, sans navigateur');
lotA();
lotB();
lotC1();
lotC2();
lotC3();
lotE1();
lotD();
lotK1();
lotK2();
lotK2d();
lotK3Dirigeants();
console.log(`\n${echecs === 0 ? '✔ TOUT PASSE' : `⛔ ${echecs} échec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);
