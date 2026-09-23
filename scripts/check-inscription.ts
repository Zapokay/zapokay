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
import { useTranslations } from 'next-intl';
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
import { readFileSync, readdirSync } from 'fs';
import { aEchoue, etatDeSection } from '../lib/requetes-groupees';
import { titresDeCorrectionDetention } from '../lib/journal-correction-detention';
import { ligneDAcquisition } from '../lib/minute-book/registers';
import { DATE_DE_L_ACTE, lireDateDeLActe } from '../lib/journal-date-acte';
import { titresDeJournalAdministrateur } from '../lib/journal-charge';
import ActivityGroup from '../components/activity/ActivityGroup';
import { partitionRegisterLoads, readSettledRegister } from '../lib/minute-book/register-loads';
import { SectionEnEchec } from '../components/ui/SectionEnEchec';
import GlobalError, { TEXTES, langueDuChemin } from '../app/global-error';
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
 * MONTER UN COMPOSANT **SANS** FOURNISSEUR — pour la seule page qui n'en a pas.
 *
 * ⛔ `rendre()` enveloppe dans `NextIntlClientProvider`. L'envelopper ICI serait
 * un contrôle dans la mauvaise condition (§371) : `global-error.tsx` existe
 * précisément pour les instants où ce fournisseur n'est pas là. On la monte donc
 * nue — et si elle avait besoin de quoi que ce soit, ce montage lèverait.
 */
function rendreBrut(composant: unknown, props: Record<string, unknown>): string {
  return renderToStaticMarkup(React.createElement(composant as never, props as never));
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
  /* ⚠️ TROIS DEPUIS LE LOT AG-3-bis, ET LA RAISON EST ÉCRITE (§374) : le
     compteur « N postes pourvus » a gagné SA garde, pour se taire à zéro. Le
     compte n'est pas desserré, il est porté à son nombre réel — et une
     QUATRIÈME garde devra se justifier de même. */
  dire((src.match(/\.length > 0 &&/g) ?? []).length === 3,
    'trois gardes qui lisent `.length > 0` — elles s’éteignent, elles ne doublent pas');

  /* ④ LE NOM DE LA SECTION VIENT DU CATALOGUE, et c'est celui que la page
     emploie déjà pour se nommer — pas une seconde clé pour le même mot. */
  dire(/<SectionEnEchec section=\{t\('title'\)\}/.test(src),
    'l’avis lit la clé dont la page se sert DÉJÀ pour se nommer');
}

function lotK3Administrateurs() {
  console.log('\n   ⛔ LOT K-3 · ADMINISTRATEURS — MÊME FORME, VÉRIFIÉE ET NON SUPPOSÉE');

  const src = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'directors', 'DirectorsClient.tsx'),
    'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* ① J-2 — LES TROIS REQUÊTES PARTENT ENSEMBLE, ET EN `allSettled`. */
  dire(/await Promise\.allSettled\(\[/.test(src), 'les trois requêtes partent ENSEMBLE');
  dire(!/await Promise\.all\(\[/.test(src), '⛔ et en `allSettled`, jamais `all`');
  dire((src.match(/const \{ data: [a-zA-Z]+ \} = await supabase/g) ?? []).length === 1,
    'il ne reste QU’UNE lecture en file : la société, dont `cid` dépend');

  /* ② LE CÂBLAGE PASSE PAR LA DÉCLARATION PARTAGÉE. */
  dire(/etatDeSection\(administrateursEnEchec, totalDirectors > 0\)/.test(src),
    'la page DÉRIVE son état de la déclaration partagée');
  dire(/etatDesAdministrateurs === 'echec' \?/.test(src)
    && /etatDesAdministrateurs === 'garnie' \?/.test(src),
    'et elle branche sur les trois cas');
  dire(/setAdministrateursEnEchec\(aEchoue\(mandatesRes\)\)/.test(src),
    'et l’échec vient de `aEchoue`, pas d’une liste vide');

  /* ③ ⛔ K-3d — LE BALAYAGE, CHERCHÉ ET NON ATTENDU. Aucun bloc de rendu de
     cette page n'est gardé par une négation : toutes ses gardes lisent
     `> 0`, donc elles s'ÉTEIGNENT quand la requête tombe au lieu de
     s'allumer en plus de la branche d'échec. */
  dire(!/\{\s*!\s*[a-zA-Z]+\s*&&/.test(src),
    '⛔ aucun bloc gardé par une négation — pas de doublon possible ici');

  /* ④ ⭐ CE QUI DISTINGUE CETTE PAGE D'`officers`, ET QUI JUSTIFIE LE TRI
     REFAIT DE ZÉRO : le bandeau de RÉSIDENCE est un verdict de conformité
     (art. 105(3) LCSA) dérivé de la MÊME requête. Il est gardé par
     `totalDirectors > 0`, donc il se TAIT quand elle tombe. ⛔ Il ne doit
     JAMAIS juger sur des données absentes — cette assertion garde ce fait. */
  dire(/\{totalDirectors > 0 && residencyApplicable &&/.test(src),
    '⭐ le verdict de résidence se TAIT quand la requête tombe — il ne juge pas à vide');

  /* ⑤ LE NOM DE LA SECTION VIENT DU CATALOGUE. */
  dire(/<SectionEnEchec section=\{t\('title'\)\}/.test(src),
    'l’avis lit la clé dont la page se sert DÉJÀ pour se nommer');
}

function lotZB() {
  console.log('\n   ⛔ LOT Z-B — LA CORRECTION D’UNE DÉTENTION ENTRE AU REGISTRE');

  const AVANT = {
    issue_date: '2024-03-15', share_class: 'Catégorie A', quantity: '100',
    issue_price_per_share: '1.00', certificate_number: 'C-7',
  };

  /* ① RIEN N'A CHANGÉ → PAS DE LIGNE. ⛔ Sans ce cas, ouvrir la modale et
     enregistrer sans rien toucher inscrirait une correction imaginaire. */
  dire(titresDeCorrectionDetention('Jean Tremblay', AVANT, { ...AVANT }) === null,
    '⛔ aucune correction → AUCUNE ligne, pas un titre creux');

  /* ② UN SEUL CHAMP → il est NOMMÉ, avec ancienne → nouvelle. */
  const q = titresDeCorrectionDetention('Jean Tremblay', AVANT, { ...AVANT, quantity: '150' });
  dire(q !== null && q.champs.length === 1 && q.champs[0] === 'quantity',
    'un seul champ corrigé → un seul champ nommé');
  dire(q !== null && q.titleFr.includes('Détention corrigée : Jean Tremblay'),
    'le titre dit QUI, et dit « corrigée »');
  dire(q !== null && q.titleFr.includes('nombre d’actions 100 → 150'.replace('’', "'")),
    'et il porte ANCIENNE → NOUVELLE');
  dire(q !== null && q.titleEn.includes('Holding corrected: Jean Tremblay')
    && q.titleEn.includes('number of shares 100 → 150'),
    'les deux langues, rendues à l’écriture');

  /* ③ ⛔ LE VERBE — Z-B3. Une correction ne doit JAMAIS se lire comme un acte
     neuf : dans un registre de valeurs mobilières, une émission fantôme est
     pire que le silence qu'on remplace. */
  dire(q !== null && !/émise|émission de|Actions émises|issued|created/i.test(q.titleFr + q.titleEn),
    '⛔ et il ne se lit PAS comme une émission neuve');

  /* ④ ⚠️ `issue_date` EST UN CONTENU PRESCRIT — art. 33 par. 3° LSAQ. Quand il
     change, il vient EN TÊTE de la liste : il ne se noie pas derrière quatre
     autres champs. */
  const tout = titresDeCorrectionDetention('Jean Tremblay', AVANT, {
    issue_date: '2024-04-01', share_class: 'Catégorie B', quantity: '150',
    issue_price_per_share: '2.00', certificate_number: 'C-8',
  });
  dire(tout !== null && tout.champs.length === 5, 'cinq champs corrigés → les cinq sont nommés');
  dire(tout !== null && tout.champs[0] === 'issue_date',
    '⚠️ et la DATE D’ÉMISSION vient en TÊTE — art. 33 par. 3° LSAQ');
  dire(tout !== null && tout.titleFr.indexOf("date d'émission") <
       tout.titleFr.indexOf("nombre d'actions"),
    'elle précède les autres dans le titre rendu, pas seulement dans la liste');

  /* ⭐ CONTRÔLE POSITIF : la fonction sait dire NON. Un champ INCHANGÉ ne doit
     pas apparaître — sinon « cinq champs nommés » ne prouverait que sa
     complaisance. */
  dire(q !== null && !q.titleFr.includes("date d'émission"),
    '⭐ et un champ INCHANGÉ n’est PAS nommé');

  /* ⑤ LA MODALE APPELLE BIEN, et avec la valeur que la contrainte admet. */
  const src = readFileSync(
    join(__dirname, '..', 'components', 'shareholders', 'EditShareholdingModal.tsx'), 'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(/titresDeCorrectionDetention\(/.test(src), 'la modale compose son titre par la déclaration');
  dire(/logActivity\(/.test(src) && /'shareholding_edited'/.test(src),
    'et elle écrit au journal, sous la valeur que la contrainte admet déjà');
  dire(/if \(titres\) \{/.test(src), 'et elle n’écrit RIEN quand rien n’a changé');
}

function lotAA() {
  console.log('\n   ⛔ LOT AA — LE CESSIONNAIRE PORTE ENFIN SA PROPRE DATE');

  /* ① LES 47 ÉMISSIONS DIRECTES NE GAGNENT RIEN. ⛔ C'est la moitié de la
     preuve : une ligne ajoutée à une détention jamais transférée serait un
     FAIT INVENTÉ au registre — pire que le défaut qu'on répare. */
  dire(ligneDAcquisition({ transferts_entrants: [] }, 'fr') === '',
    '⛔ aucune acquisition → AUCUNE ligne (les 47 du parc)');
  dire(ligneDAcquisition({ transferts_entrants: null }, 'fr') === '',
    'et une jointure absente n’en invente pas non plus');

  /* ② LES 5 DÉTENTIONS TRANSFÉRÉES GAGNENT LA LEUR, dans les deux langues, et
     ELLE PORTE SES MOTS — « 2026-05-29 » nu serait pire que rien. */
  const fr = ligneDAcquisition({ transferts_entrants: [{ transfer_date: '2026-05-29' }] }, 'fr');
  const en = ligneDAcquisition({ transferts_entrants: [{ transfer_date: '2026-05-29' }] }, 'en');
  dire(fr.includes('2026-05-29') && en.includes('2026-05-29'), 'la date d’acquisition paraît');
  dire(/transfert/i.test(fr) && /transfer/i.test(en), '⛔ et elle porte SES MOTS, pas une date nue');
  dire(fr !== en, 'les deux langues diffèrent — rien n’est figé dans le code');

  /* ③ ⛔ PLUSIEURS TRANSFERTS ENTRANTS → ON LÈVE. Le schéma le permet (aucune
     unicité sur `to_shareholding_id`), le produit ne peut pas le produire.
     ★ Un cas impossible doit ÉCHOUER, pas être rendu déterministe — la même
     règle que le motif de fin inconnu et que le `single()` de company.ts. */
  let aLeve = false;
  try {
    ligneDAcquisition(
      { transferts_entrants: [{ transfer_date: '2026-05-29' }, { transfer_date: '2026-06-01' }] },
      'fr',
    );
  } catch { aLeve = true; }
  dire(aLeve, '⛔ deux transferts entrants → la lecture LÈVE, elle ne choisit pas');

  /* ④ AA-8 — `issue_date` N'EST PAS TOUCHÉE. La colonne la rend toujours en
     ligne PRINCIPALE ; l'acquisition et la fin sont des lignes AJOUTÉES. */
  const colActionnaires = readFileSync(
    join(__dirname, '..', 'lib', 'minute-book', 'register-columns.ts'), 'utf8',
  );
  dire(/key: 'issue_date',/.test(colActionnaires),
    '⛔ `issue_date` reste la ligne PRINCIPALE — on ajoute, on ne corrige pas');
  dire(/cleSecondaire: 'acquisition',\s*\n\s*cleTertiaire: 'fin',/.test(colActionnaires),
    'l’acquisition précède la fin — l’ordre de la vie du titre');

  /* ⑤ ⛔ LES DEUX SURFACES FOURNISSENT LA CLÉ. C'est le défaut que
     register-columns.ts existe pour empêcher : une clé déclarée d'un côté et
     absente de l'autre rend une CELLULE VIDE, sans erreur ni diagnostic. */
  for (const [quoi, chemin] of [
    ['l’écran', ['components', 'minute-book', 'BinderView.tsx']],
    ['le PDF', ['app', 'api', 'due-diligence', 'export', 'route.ts']],
  ] as [string, string[]][]) {
    const src = readFileSync(join(__dirname, '..', ...chemin), 'utf8');
    dire(/acquisition: (locale|docLanguage) === 'en' \? e\.acquisition_en : e\.acquisition_fr/.test(src),
      `${quoi} fournit la clé \`acquisition\``);
  }
}

/**
 * LES VALEURS QUE LA CONTRAINTE `activity_log_event_type_check` ADMET, TELLES
 * QUE LES MIGRATIONS DU DÉPÔT LA DÉCLARENT — rejouées dans l'ordre des noms,
 * ce qui est l'ordre d'application. Un ADD pose l'ensemble, un DROP le retire.
 * ⛔ La base VIVANTE n'est pas lue : voir l'en-tête de `lib/journal-date-acte.ts`.
 */
function valeursDeLaContrainte(): string[] | null {
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  let courant: string[] | null = null;
  for (const nom of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, nom), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
    const re = /(ADD|DROP)\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?activity_log_event_type_check\b([\s\S]*?);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      if (m[1].toUpperCase() === 'DROP') { courant = null; continue; }
      const valeurs: string[] = [];
      const lit = /'([a-z_]+)'/g;
      let v: RegExpExecArray | null;
      while ((v = lit.exec(m[2])) !== null) valeurs.push(v[1]);
      courant = valeurs;
    }
  }
  return courant;
}

function lotAC() {
  console.log('\n   ⛔ LOT AC — LA TABLE DES DATES D’ACTE ET LA CONTRAINTE, ENSEMBLE PAR ENSEMBLE');

  const base = valeursDeLaContrainte();
  const table = Object.keys(DATE_DE_L_ACTE);
  dire(base !== null && base.length > 0, 'la contrainte est déclarée dans les migrations');
  if (base === null) return;

  /* ⛔ ÉGALITÉ D'ENSEMBLES, PAS DE COMPTES. Un compte égal avec des ensembles
     différents est exactement le cas qu'on a passé trois lots à débusquer. Les
     manquants sont NOMMÉS, de chaque côté. */
  const absentsDeLaTable = base.filter((v) => !table.includes(v));
  const absentsDeLaBase = table.filter((v) => !base.includes(v));
  dire(absentsDeLaTable.length === 0,
    absentsDeLaTable.length === 0
      ? 'chaque valeur de la contrainte a sa ligne dans la table'
      : `⛔ la contrainte admet, la table ignore : ${absentsDeLaTable.join(', ')}`);
  dire(absentsDeLaBase.length === 0,
    absentsDeLaBase.length === 0
      ? 'et la table ne décrit aucun type que la contrainte refuse'
      : `⛔ la table décrit, la contrainte refuse : ${absentsDeLaBase.join(', ')}`);

  /* ⚪ PAS DE CONTRÔLE POSITIF SYNTHÉTIQUE ICI, ET C'EST VOULU. Un premier jet
     comparait deux tableaux inventés : il ne testait que `Array.filter` et ne
     pouvait pas échouer. La preuve est faite par MUTATION des vraies entrées —
     une migration ajoutée, un membre renommé à compte égal —, rapportée au
     message du lot. */

  /* ⛔ Le cœur d'AC-2 : aucune clé globale. Les deux types dont `details` porte
     une date qui N'EST PAS celle de l'acte ne doivent JAMAIS la lire. */
  dire(typeof DATE_DE_L_ACTE.director_added === 'object' && 'nonConsignee' in DATE_DE_L_ACTE.director_added
    && typeof DATE_DE_L_ACTE.officer_added === 'object' && 'nonConsignee' in DATE_DE_L_ACTE.officer_added,
    '⛔ les nominations rétroactives ne lisent pas leur `end_date` (la FIN du mandat)');
  dire(DATE_DE_L_ACTE.director_edited === 'saisie' && DATE_DE_L_ACTE.officer_edited === 'saisie',
    '⛔ les corrections ne lisent pas leur `appointment_date` (le contenu CORRIGÉ)');
}

function lotACRendu() {
  console.log('\n   ⛔ LOT AC-1 · AC-2 — LE VERBE, ET LA DATE DE L’ACTE À L’HISTORIQUE');

  /* ── AC-1 · « nommé », pas « ajouté » ── */
  const n = titresDeJournalAdministrateur('nomme', 'Ben Harpez');
  const r = titresDeJournalAdministrateur('nomme_retroactif', 'Ben Harpez');
  dire(n.titleFr === 'Administrateur nommé : Ben Harpez' && n.titleEn === 'Director appointed: Ben Harpez',
    'un administrateur est NOMMÉ, dans les deux langues');
  dire(r.titleFr.includes('nommé (rétroactif)') && r.titleEn.includes('appointed (retroactive)'),
    'et la variante rétroactive garde son mot');
  dire(!/ajout|added/i.test(n.titleFr + n.titleEn + r.titleFr + r.titleEn),
    '⛔ plus aucun « ajouté / added » dans la nomination');
  const modale = readFileSync(join(__dirname, '..', 'components', 'directors', 'AddDirectorModal.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(/titresDeJournalAdministrateur\(/.test(modale) && !/Administrateur ajouté/.test(modale),
    'la modale compose par la déclaration, et n’écrit plus le gabarit en dur');

  /* ── AC-2 · la table, lue ── */
  const retro = lireDateDeLActe('director_added', { end_date: '2025-06-30', retroactive: true });
  dire(retro.forme === 'non_consignee' && retro.registre === 'administrateurs',
    'nomination rétroactive → « non consignée », registre des administrateurs NOMMÉ');
  dire(!JSON.stringify(retro).includes('2025-06-30'),
    '⛔ et sa FIN de mandat n’est jamais lue comme sa nomination');
  const corr = lireDateDeLActe('director_edited', { appointment_date: '2019-01-01', end_date: '2024-02-02' });
  dire(corr.forme === 'saisie', '⛔ une correction est datée « à la saisie », pas par son contenu corrigé');
  const tr = lireDateDeLActe('share_transfer_created', { transfer_date: '2026-05-29' });
  dire(tr.forme === 'dates' && tr.lignes.length === 1 && tr.lignes[0].effet === 'transfert'
    && tr.lignes[0].date === '2026-05-29', 'un transfert porte UNE date, étiquetée « transfert »');
  const rp = lireDateDeLActe('officer_replaced', { end_date: '2026-09-17', start_date: '2026-09-18' });
  dire(rp.forme === 'dates' && rp.lignes.length === 2,
    '⚖️ un remplacement porte ses DEUX dates — aucune n’est choisie en silence');
  dire(rp.forme === 'dates' && rp.lignes[0].effet === 'fin' && rp.lignes[0].personne === 'sortant'
    && rp.lignes[0].date === '2026-09-17' && rp.lignes[1].effet === 'nomination'
    && rp.lignes[1].personne === 'entrant' && rp.lignes[1].date === '2026-09-18',
    'la fin va au SORTANT, la nomination à l’ENTRANT, dans cet ordre');
  const rpSans = lireDateDeLActe('officer_replaced', { end_date: '2026-09-17' });
  dire(rpSans.forme === 'dates' && rpSans.lignes.length === 2 && rpSans.lignes[1].date === null,
    'une date absente reste NOMMÉE — l’effet ne disparaît pas avec sa date');
  const cat = lireDateDeLActe('share_class_created', {});
  dire(cat.forme === 'non_consignee' && cat.registre === null,
    '⛔ une catégorie ne renvoie à AUCUN registre — aucun ne porte sa date');
  let leve = false;
  try { lireDateDeLActe('zz_inconnu', {}); } catch { leve = true; }
  dire(leve, '⛔ un type inconnu LÈVE — un cas impossible n’est pas rendu déterministe');

  /* ── AC-2 · l'écran, rendu pour de vrai ── */
  const ecran = rendre(ActivityGroup, {
    label: 'Aujourd’hui',
    locale: 'fr',
    events: [
      { id: 'a', event_type: 'officer_replaced', title_fr: 'Dirigeant remplacé', title_en: 'x',
        created_at: '2026-09-17T12:00:00Z', author_name: 'Joey',
        details: { end_date: '2026-09-17', start_date: '2026-09-18' },
        nom_sortant: 'Phil The Bill', nom_entrant: 'Fak Que' },
      { id: 'b', event_type: 'director_added', title_fr: 'Administrateur nommé', title_en: 'x',
        created_at: '2026-08-26T12:00:00Z', author_name: 'Joey',
        details: { end_date: '2025-06-30', retroactive: true } },
      { id: 'c', event_type: 'document_generated', title_fr: 'Document généré', title_en: 'x',
        created_at: '2026-09-16T12:00:00Z', author_name: 'Joey', details: {} },
      { id: 'd', event_type: 'officer_replaced', title_fr: 'Dirigeant remplacé', title_en: 'x',
        created_at: '2026-09-17T12:00:00Z', author_name: 'Joey',
        details: { end_date: '2026-09-17', start_date: '2026-09-17' }, nom_sortant: null, nom_entrant: null },
    ],
  });
  const iFin = ecran.indexOf('Fin — Phil The Bill');
  const iNom = ecran.indexOf('Nomination — Fak Que');
  dire(iFin > -1 && iNom > iFin, '⚖️ à l’écran : « Fin — sortant » puis « Nomination — entrant »');
  dire(dit(ecran, 'non consignée') && dit(ecran, 'voir le registre des administrateurs'),
    '« non consignée » NOMME le registre des administrateurs');
  dire(/href="\/fr\/dashboard\/minute-book\/binder"/.test(ecran), 'et il est cliquable, vers le Livre');
  dire(!ecran.includes('2025'), '⛔ la fin de mandat 2025 n’apparaît NULLE PART à l’écran');
  dire(dit(ecran, 'à la saisie'), 'un acte fait dans ZapOkay est daté « à la saisie »');
  dire(dit(ecran, 'sortant non identifié') && dit(ecran, 'entrant non identifié'),
    'sans nom connu, chaque date reste étiquetée par RÔLE — jamais une date nue');

  /* ⛔ LE CAS SANS REGISTRE, RENDU SEUL. Une première version de la sonde ne
     l'affichait pas : une mutation qui rendait la catégorie MUETTE ne faisait
     rien tomber. Rendu à part, pour qu'aucun autre texte ne le satisfasse. */
  const categorie = rendre(ActivityGroup, {
    label: 'Hier', locale: 'fr',
    events: [{ id: 'e', event_type: 'share_class_created', title_fr: 'Catégorie créée', title_en: 'x',
      created_at: '2026-08-11T12:00:00Z', author_name: 'Joey', details: {} }],
  });
  dire(dit(categorie, "Date de l'acte : non consignée") && !/<a /.test(categorie),
    '⛔ une catégorie DIT « non consignée », sans renvoi vers un registre qui ne la porte pas');
}

function lotAD() {
  console.log('\n   ⛔ LOT AD — LE COMPTE DIT CE QUE LE LIVRE A, PAS CE QUI A CHARGÉ');

  const issue = (ok: boolean) =>
    ok
      ? { status: 'fulfilled' as const, ok: true, body: {} }
      : { status: 'rejected' as const, ok: false };
  const quatre = (echecs: number) =>
    partitionRegisterLoads({
      directors: issue(echecs < 1),
      officers: issue(echecs < 2),
      shareholders: issue(true),
      statedCapital: issue(true),
    });

  /* ① LE TOTAL NE BOUGE PAS AVEC LES ÉCHECS. C'est le lot entier. */
  dire(quatre(0).total === 4 && quatre(1).total === 4 && quatre(2).total === 4,
    '⛔ 0, 1 ou 2 échecs → le livre a TOUJOURS quatre registres');
  dire(quatre(1).failed === 1 && Object.keys(quatre(1).loaded).length === 3,
    'et l’échec se soustrait du RENDU : 1 en échec, 3 cartes chargées');
  dire(quatre(2).failed === 2 && Object.keys(quatre(2).loaded).length === 2,
    'deux échecs, deux cartes — le total reste 4');
  /* ⭐ LE CAS QUI NE DOIT RIEN CHANGER. Sans lui, « il affiche toujours 4 »
     serait indistinguable de « il fonctionne ». */
  dire(quatre(0).failed === 0 && Object.keys(quatre(0).loaded).length === 4,
    '⭐ et sans échec : 4 chargés, 0 en échec, rien de changé');

  /* ② LE TOTAL VIENT DE LA LISTE QUI PRODUIT LES LECTURES, jamais d'un
     littéral : une cinquième lecture déplace le compte toute seule. */
  const cinq = partitionRegisterLoads({
    a: issue(true), b: issue(true), c: issue(true), d: issue(true), e: issue(false),
  });
  dire(cinq.total === 5, '⛔ une cinquième lecture porte le total à 5, sans toucher au code');

  /* ③ L'ÉCRAN : le compteur LIT le total, et ne lit plus les cartes rendues. */
  const src = readFileSync(
    join(__dirname, '..', 'components', 'minute-book', 'BinderView.tsx'), 'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(/registerCount=\{registresDuLivre\}/.test(src), 'la section reçoit le TOTAL');
  dire(!/registerCount=\{registerCards\.length\}/.test(src),
    '⛔ et plus jamais le nombre de cartes rendues');

  /* ④ LE LIBELLÉ, RENDU PAR LE VRAI COMPOSANT ET LE VRAI CATALOGUE.
     ⚠️ CHARGÉ ICI, PAS EN TÊTE DE FICHIER : `tsx` hisse les imports avant le
     `Object.assign(globalThis, { React })` du haut, et `BinderSection` porte du
     JSX AU NIVEAU DU MODULE (son `spinnerIcon`) — il lèverait « React is not
     defined » à l'import. Les autres composants montés ici n'ont leur JSX qu'à
     l'intérieur d'une fonction, donc après l'assignation. */
  const BinderSection = (
    require('../components/minute-book/BinderSection') as { default: unknown }
  ).default;
  const entete = (n: number) =>
    rendre(BinderSection, { index: 0, title: 'Registres corporatifs', documents: [],
      children: 'x', registerCount: n });
  dire(dit(entete(4), '4 registres'), 'l’en-tête dit « 4 registres » pour un total de 4');
  dire(dit(entete(3), '3 registres') && !dit(entete(3), '4 registres'),
    '⭐ et il dirait « 3 » si on lui passait 3 — le libellé suit le nombre, il ne le fige pas');
}

/**
 * ⛔ LES MODALES QUI NE CONSOMMENT PAS ENCORE L'ENVELOPPEUR — RECENSÉES, PAS
 *   OUBLIÉES, ET CHACUNE AVEC SA RAISON.
 *
 * ★ C'EST CETTE LISTE QUI EMPÊCHE LA 24ᵉ MODALE DE RÉINTRODUIRE LE DÉFAUT : une
 *   modale neuve qui déclare son propre voile sans figurer ici fait tomber
 *   l'assertion. Aucune caméra ne peut faire ça.
 * ⚠️ Les convertir n'est PAS mécanique : leur habillage diffère (portail,
 *   `z-[9999]`, `bg-black/50`, ou styles en ligne), donc les faire passer par
 *   l'enveloppeur CHANGERAIT leur apparence. C'est une décision, pas une
 *   extraction — et ce lot ne la prend pas.
 */
const MODALES_HORS_ENVELOPPEUR: Record<string, string> = {
  'components/documents/UploadDocumentModal.tsx': 'portail, z-[9999], bg-black/50 — le MODÈLE du lot : elle applique déjà la règle',
  'components/minute-book/BinderExportModal.tsx': 'portail, même habillage — applique déjà la règle, aucun champ',
  'components/minute-book/BulkCatchUpModal.tsx': 'portail, même habillage — applique déjà la règle',
  'components/documents/DocumentModal.tsx': 'styles EN LIGNE (zIndex 200) — aucun champ, ferme au clic hors cible',
  /* ⛔ UNE ENTRÉE DÉCRIT UNE RAISON, JAMAIS UN DÉFAUT — Dom, 2026-09-22.
     Celle-ci disait « le seul trou qui reste » : une liste d'exceptions dont
     une entrée décrit un défaut finit par le normaliser. Le trou est fermé
     (AF-4), la raison reste. */
  'components/documents/SignatoriesModal.tsx': 'styles EN LIGNE (zIndex 300) — ne consomme pas l’enveloppeur, MAIS applique la règle',
};

function lotAF() {
  console.log('\n   ⛔ LOT AF — UN CLIC À CÔTÉ NE DÉTRUIT PLUS UNE SAISIE');

  const racine = join(__dirname, '..');
  const fichiers: string[] = [];
  const marcher = (rel: string) => {
    for (const nom of readdirSync(join(racine, rel), { withFileTypes: true })) {
      const chemin = `${rel}/${nom.name}`;
      if (nom.isDirectory()) marcher(chemin);
      else if (/Modal|Dialog/.test(nom.name) && nom.name.endsWith('.tsx')) fichiers.push(chemin);
    }
  };
  marcher('components');

  /* ① AUCUNE MODALE NE DÉCLARE SON PROPRE VOILE — hors celles recensées.
     ★ L'assertion porte sur TOUTES les modales du dépôt, pas sur une liste
     figée : un fichier neuf entre dans le balayage sans que personne y pense. */
  const voile = /(absolute|fixed) inset-0 bg-black\/(40|50)|backdropCls|backdropFilter/;
  /* ⚪ L'ENVELOPPEUR LUI-MÊME EST EXCLU : c'est LUI qui déclare le voile, et
     c'est tout l'objet du lot. L'exclure par son chemin, jamais par un motif —
     un motif laisserait passer une seconde déclaration qui lui ressemble. */
  const DECLARATION = 'components/ui/Modale.tsx';
  const coupables = fichiers.filter(
    (f) =>
      f !== DECLARATION &&
      voile.test(readFileSync(join(racine, f), 'utf8')) &&
      !(f in MODALES_HORS_ENVELOPPEUR),
  );
  dire(coupables.length === 0,
    coupables.length === 0
      ? `⛔ aucune des ${fichiers.length} modales ne déclare son voile, hors les ${Object.keys(MODALES_HORS_ENVELOPPEUR).length} recensées`
      : `⛔ déclarent encore leur propre voile : ${coupables.join(', ')}`);

  /* ② ET LES RECENSÉES EXISTENT TOUJOURS — une entrée qui ne correspond à
     aucun fichier serait une exception qui protège du vide. */
  const fantomes = Object.keys(MODALES_HORS_ENVELOPPEUR).filter((f) => !fichiers.includes(f));
  dire(fantomes.length === 0, `la liste des exceptions ne protège aucun fichier disparu`);

  /* ②bis ⛔ UNE EXCEPTION À CHAMPS DOIT APPLIQUER LA RÈGLE, MÊME SANS
     L'ENVELOPPEUR — AF-4, 2026-09-22. Sans cette assertion, la liste des
     exceptions devient l'endroit où un trou se range et se normalise : il
     suffirait d'y inscrire une modale pour que le clic hors cible y revienne
     sans que rien ne le dise. */
  const fermeAuClic = /e\.currentTarget\)\s*onClose\(\)|inset-0[^>]*onClick=\{\s*onClose/;
  const exceptionsFautives = Object.keys(MODALES_HORS_ENVELOPPEUR).filter((f) => {
    const src = readFileSync(join(racine, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return /<input|<textarea|<select/.test(src) && fermeAuClic.test(src);
  });
  dire(exceptionsFautives.length === 0,
    exceptionsFautives.length === 0
      ? '⛔ les exceptions À CHAMPS appliquent la règle sans l’enveloppeur'
      : `⛔ exception à champs qui ferme au clic hors cible : ${exceptionsFautives.join(', ')}`);

  /* ③ LES MODALES À CHAMPS CONSOMMENT L'ENVELOPPEUR, et aucune ne redemande le
     clic hors cible : `fermeAuClicHorsCible` est réservé à celles SANS champ. */
  const consomment = fichiers.filter((f) =>
    /from '@\/components\/ui\/Modale'/.test(readFileSync(join(racine, f), 'utf8')));
  dire(consomment.length === 18, `dix-huit modales consomment l'enveloppeur (${consomment.length})`);
  const avecChamps = consomment.filter((f) => {
    const src = readFileSync(join(racine, f), 'utf8');
    return /<input|<textarea|<select/.test(src);
  });
  const fautives = avecChamps.filter((f) =>
    /fermeAuClicHorsCible/.test(readFileSync(join(racine, f), 'utf8')));
  dire(fautives.length === 0,
    fautives.length === 0
      ? '⛔ aucune modale À CHAMPS ne redemande le clic hors cible'
      : `⛔ redemandent le clic hors cible : ${fautives.join(', ')}`);

  /* ④ ⭐ LE CAS QUI NE DOIT RIEN CHANGER : les modales SANS champ le gardent.
     Sans lui, « plus rien ne ferme » serait indistinguable de « ça marche ». */
  for (const f of ['components/ui/ConfirmDialog.tsx', 'components/ui/ObligationModal.tsx']) {
    const src = readFileSync(join(racine, f), 'utf8');
    dire(/fermeAuClicHorsCible/.test(src) && !/<input|<textarea|<select/.test(src),
      `⭐ ${f.split('/').pop()} garde son clic hors cible — elle n'a aucun champ à perdre`);
  }

  /* ⑤ L'ENVELOPPEUR LUI-MÊME : la règle, lue dans sa source. */
  const env = readFileSync(join(racine, 'components/ui/Modale.tsx'), 'utf8');
  dire(/onClick=\{fermeAuClicHorsCible && !occupe \? onClose : undefined\}/.test(env),
    'le voile n’écoute le clic que sur demande, et jamais pendant le travail');
  dire(/e\.key === 'Escape' && !occupe/.test(env),
    '⚖️ Échap ferme — sortie DÉLIBÉRÉE —, sauf pendant le travail');
  /* ⚠️ ANCRÉE SUR UN BLANC : `/role="dialog"/` acceptait `data-role="dialog"`,
     et la mutation survivait. Une assertion qui se laisse satisfaire par un
     attribut voisin ne garde rien. */
  dire(/\srole="dialog"/.test(env) && /\saria-modal="true"/.test(env),
    'et le panneau porte `role` et `aria-modal` pour les dix-huit');
}

function lotAG() {
  console.log('\n   ⛔ LOT AG — UN JOURNAL QU’ON N’A PAS SU LIRE N’EST PAS UN JOURNAL VIDE');

  /* ① LE LECTEUR — les deux chemins d'échec d'un `fetch`, et le succès. */
  const rep = (ok: boolean, corps: unknown) => ({
    ok, json: async () => corps,
  });
  const lire = async (settled: PromiseSettledResult<{ ok: boolean; json(): Promise<unknown> }>) =>
    readSettledRegister<{ events?: unknown[]; total?: number }>(settled);

  return (async () => {
    const tenue = await lire({ status: 'fulfilled', value: rep(true, { events: [], total: 329 }) } as never);
    dire(tenue.ok && tenue.body?.total === 329, 'une lecture réussie rend son total');
    const nonOk = await lire({ status: 'fulfilled', value: rep(false, {}) } as never);
    dire(!nonOk.ok && nonOk.body === undefined,
      '⛔ un 401 ou un 500 n’est PAS un journal vide — aucun corps, aucun total');
    const rejet = await lire({ status: 'rejected', reason: new Error('réseau') } as never);
    dire(!rejet.ok, 'et un rejet lancé non plus');

    /* ② L'ÉCRAN : trois cas, et le VRAI zéro est celui qui ne doit rien changer. */
    const src = readFileSync(
      join(__dirname, '..', 'components', 'activity', 'ActivityPage.tsx'), 'utf8',
    ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    dire(/readSettledRegister</.test(src),
      'la page consomme le lecteur du lot AD, elle n’en invente pas un second');
    dire(/<SectionEnEchec section=\{t\('pageTitle'\)\} onRetry=\{charger\} \/>/.test(src),
      'et l’avis du lot K, avec sa reprise');
    dire(/echec \? \(/.test(src) && /\) : events\.length === 0 \? \(/.test(src),
      '⭐ l’échec passe AVANT l’état vide — les deux cessent d’être confondus');
    dire(/origine \?\? t\('empty'\)/.test(src),
      '⛔ ET LE VRAI ZÉRO EST INTACT : un journal réellement vide dit toujours depuis quand il regarde');
    dire(!/data\.total \|\| 0/.test(src) && !/\.then\(\(data\) =>/.test(src),
      'la lecture nue — `data.total || 0` — a disparu');
    dire((src.match(/setTotal\(/g) ?? []).length === 1,
      '⚪ un seul endroit pose le total : le chargement, partagé par le montage et la reprise');
  })();
}

function lotAG3() {
  console.log('\n   ⚖️ LOT AG-3 — LE NOMBRE COMPTE LES CARTES, LE MOT DIT CE QU’ELLES SONT');

  /* ① LE LIBELLÉ, RENDU PAR LE VRAI CATALOGUE. ⚪ C'est l'ICU qu'on éprouve
     ici, pas l'écran : `OfficersClient` charge ses données dans un effet, et
     un rendu statique n'en exécute aucun. */
  const Compteur = ({ n }: { n: number }) => {
    const t = useTranslations('officers');
    return React.createElement('span', null, t('positionsFilled', { count: n }));
  };
  const dire3 = (n: number) => rendre(Compteur, { n });
  dire(dit(dire3(3), '3 postes pourvus'), '3 mandats / 2 personnes → « 3 postes pourvus »');
  dire(dit(dire3(1), '1 poste pourvu') && !dit(dire3(1), 'postes'), 'un mandat → le singulier');
  /* ⭐ LE ZÉRO NE PASSE PLUS PAR UN LIBELLÉ, IL PASSE PAR UNE GARDE — Dom,
     2026-09-22. Le compteur se tait, l'état vide parle. La clause `=0` est
     donc sortie du catalogue : inatteignable, elle aurait prouvé qu'on y avait
     pensé sans rien faire (§366).
     ⛔ CE QUI TIENT LE ZÉRO EST DONC L'ASSERTION ④ — la garde du point d'appel
     — et non une chaîne. Vérifié ici que le catalogue ne porte plus de clause
     morte, et là-bas que l'appel est gardé. */

  /* ② LE MOT A CHANGÉ, PAS SEULEMENT LE NOMBRE. « dirigeants » affirmerait des
     PERSONNES ; les cartes sont des POSTES. */
  dire(!/dirigeant/i.test(dire3(3)) && !/officer/i.test(rendre(Compteur, { n: 3 })),
    '⛔ et il ne dit plus « dirigeants » au-dessus d’une liste de postes');

  /* ③ L'ÉCRAN LIT LES CARTES, et plus aucun pluriel bricolé dans le fichier. */
  const src = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'officers', 'OfficersClient.tsx'), 'utf8',
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(/t\('positionsFilled', \{ count: sortedOfficers\.length \}\)/.test(src),
    'le compteur lit `sortedOfficers.length` — les cartes rendues');
  dire(!/uniqueOfficerCount/.test(src), '⛔ et le compte des PERSONNES a disparu');
  dire(!/> 1 \? 's' : ''/.test(src),
    '⛔ plus aucun pluriel bricolé dans ce fichier — assertion, pas relecture');

  /* ④ ⚖️ LE COMPTEUR SE TAIT À ZÉRO — Dom, 2026-09-22. L'état vide parle déjà.
     ⛔ ET LA CLAUSE `=0` SORT AVEC : plus aucun chemin ne l'atteignait, et une
     branche rendue INATTEIGNABLE PAR CONSTRUCTION est pire qu'absente — elle
     prouve qu'on y avait pensé (§366). C'est la GARDE qui tient le zéro
     maintenant, et elle, elle a un chemin. */
  dire(/\{sortedOfficers\.length > 0 && \(/.test(src),
    '⚖️ à zéro le compteur se tait — l’état vide, en grand, dit déjà le fait');
  const cat = JSON.parse(readFileSync(join(__dirname, '..', 'messages', 'fr.json'), 'utf8'));
  dire(!/=0 \{/.test(cat.officers.positionsFilled),
    '⛔ et la clause `=0`, devenue inatteignable, est retirée du catalogue');

  /* ⑤ LES DEUX ÉCRANS VOISINS COMPTENT DEUX UNITÉS, ET LE DISENT. */
  const dir = readFileSync(
    join(__dirname, '..', 'app', '[locale]', 'dashboard', 'directors', 'DirectorsClient.tsx'), 'utf8');
  dire(/NE PAS ALIGNER CE LIBELLÉ SUR CELUI DES DIRIGEANTS/.test(dir),
    '⭐ et la raison de DROIT est écrite chez les administrateurs — un siège par personne');
  dire(/une personne peut en cumuler deux|EN CUMULER DEUX/i.test(
    readFileSync(join(__dirname, '..', 'app', '[locale]', 'dashboard', 'officers', 'OfficersClient.tsx'), 'utf8')),
    'et la raison de STRUCTURE chez les dirigeants — un cumul possible');
}

/**
 * ⚖️ LA GARDE DE L'EXCEPTION — LOT AH, 2026-09-22.
 *
 * `app/global-error.tsx` est SORTI du catalogue, avec la raison écrite dans le
 * fichier. Or c'est le catalogue qui garantissait qu'une chaîne existe dans les
 * deux langues : `messages/en.json` manquant une clé, `next-intl` le dit. Ici,
 * plus personne ne le dirait — une quatrième chaîne ajoutée en anglais seul
 * partirait en production et s'afficherait en anglais à un lecteur français,
 * sur la page qu'il voit AU PIRE MOMENT.
 *
 * ⛔ SANS CETTE FONCTION, L'EXCEPTION DEVIENDRAIT L'ENDROIT OÙ LES CHAÎNES NON
 * TRADUITES VONT SE RANGER. C'est la condition que Dom a posée en l'approuvant,
 * et c'est elle qui rend l'exception tenable : une règle qu'on brise doit être
 * remplacée par une preuve, pas par une promesse.
 */
function lotAH() {
  console.log('\n   ⚖️ LOT AH — LA PAGE DE DERNIER RECOURS PARLE LES DEUX LANGUES');

  /* ① LE FAIT QUE DOM A DEMANDÉ : compte FR = compte EN, aucune vide.
     ⭐ ÉCRIT COMME UNE FONCTION, ET NON EN LIGNE, PARCE QU'IL FAUT POUVOIR LA
     MUTER. Une assertion qu'on ne peut pas éprouver sur un faux ne prouve que
     sa propre complaisance. */
  type Jeu = Record<string, string>;
  const desequilibre = (fr: Jeu, en: Jeu): string[] => {
    /* ⚪ L'UNION SANS `Set` : la cible du dépôt est ES5, et itérer un `Set` y
       demande `--downlevelIteration`. `next build` l'a refusé ; la sonde, qui
       tourne sous `tsx`, l'acceptait. Le compilateur du dépôt décide. */
    const cles = Object.keys(fr).concat(Object.keys(en).filter((c) => !(c in fr)));
    const fautes: string[] = [];
    for (const c of cles) {
      if (!(c in fr)) fautes.push(`${c} : absente en FR`);
      else if (!(c in en)) fautes.push(`${c} : absente en EN`);
      else if (!fr[c].trim() || !en[c].trim()) fautes.push(`${c} : vide`);
    }
    return fautes;
  };

  const fr = TEXTES.fr as unknown as Jeu;
  const en = TEXTES.en as unknown as Jeu;
  const fautes = desequilibre(fr, en);
  dire(fautes.length === 0, `les ${Object.keys(fr).length} chaînes existent dans les DEUX langues${fautes.length ? ` — ${fautes.join(' · ')}` : ''}`);
  dire(Object.keys(fr).length === Object.keys(en).length,
    `compte FR (${Object.keys(fr).length}) = compte EN (${Object.keys(en).length})`);

  /* ⭐ MUTATION — DEMANDÉE PAR DOM : une cinquième chaîne ajoutée en anglais
     seul doit faire TOMBER l'assertion. C'est exactement le geste qu'on
     redoute d'un futur lot pressé. */
  const mute = desequilibre(fr, { ...en, support: 'Contact support' });
  dire(mute.length === 1 && mute[0] === 'support : absente en FR',
    '⭐ MUTATION : une chaîne ajoutée en ANGLAIS SEUL → l’assertion TOMBE, et elle la NOMME');
  dire(desequilibre({ ...fr, support: '  ' }, { ...en, support: 'Contact support' })[0] === 'support : vide',
    '⭐ MUTATION : une chaîne présente mais VIDE → refusée aussi');

  /* ② LA RÉSOLUTION, CAS PAR CAS — les quatre que Dom a nommés. */
  const CAS: [string, 'fr' | 'en'][] = [
    ['/en/dashboard/officers', 'en'],
    ['/en', 'en'],
    ['/fr/dashboard/officers', 'fr'],
    ['/dashboard', 'fr'],
    ['', 'fr'],
    ['/', 'fr'],
  ];
  for (const [chemin, attendu] of CAS) {
    dire(langueDuChemin(chemin) === attendu,
      `« ${chemin || '(vide)'} » → ${attendu.toUpperCase()}`);
  }
  /* ⛔ ET LE PIÈGE : un segment qui COMMENCE par « en » n'est pas l'anglais. */
  dire(langueDuChemin('/entreprise/1') === 'fr',
    '⛔ « /entreprise/1 » → FR — c’est le segment ENTIER qui décide, pas son début');

  /* ③ LA RÉSOLUTION EST BRANCHÉE SUR LE RENDU, et pas seulement exportée.
     ⚠️ SANS CE PASSAGE, ① ET ② PASSERAIENT SUR UNE PAGE RESTÉE ANGLAISE : une
     fonction juste que personne n'appelle est un §366 de plus. On stube donc
     `window` — la page lit `window.location.pathname` et rien d'autre. */
  const err = Object.assign(new Error(''), { digest: 'x' });
  const sansFenetre = rendreBrut(GlobalError, { error: err, reset: () => {} });
  dire(dit(sansFenetre, 'Réessayer') && /<html lang="fr"/.test(sansFenetre),
    'au SERVEUR (pas de `window`) → français, et `lang="fr"` sur la balise');

  const avant = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = { location: { pathname: '/en/dashboard' } };
    const anglais = rendreBrut(GlobalError, { error: err, reset: () => {} });
    dire(dit(anglais, 'Try again') && /<html lang="en"/.test(anglais),
      '⭐ sous `/en/…` l’écran REND l’anglais — la résolution est branchée, pas décorative');
    (globalThis as { window?: unknown }).window = { location: { pathname: '/fr/dashboard' } };
    dire(dit(rendreBrut(GlobalError, { error: err, reset: () => {} }), 'Réessayer'),
      'et sous `/fr/…` le français');
  } finally {
    if (avant === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = avant;
  }

  /* ④ CE QUI REND L'EXCEPTION LÉGITIME EST L'ABSENCE D'IMPORT. Le jour où
     quelqu'un « range » ce fichier en y important le catalogue, l'exception
     perd sa raison ET la page perd sa garantie de survie. */
  const src = readFileSync(join(__dirname, '..', 'app', 'global-error.tsx'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(!/^\s*import\s/m.test(code),
    '⛔ le fichier n’importe RIEN — ni catalogue, ni `routing`, ni composant');
  dire(!/routing|useTranslations|NextIntl/.test(code),
    '⛔ et il ne reprend pas par la bande la dépendance qu’on évite');

  /* ⑤ LA SOURCE ① EST PARTIE, ET SA RAISON RESTE ÉCRITE (correction de Dom :
     `document.documentElement.lang` est CIRCULAIRE — cette page remplace le
     `<html>` entier). */
  dire(!/documentElement/.test(code),
    '⛔ plus aucune lecture de `documentElement.lang` — elle était circulaire');
  dire(/CIRCULAIRE/.test(src), 'et la raison de son retrait est écrite dans le fichier');

  /* ⑥ OÙ ÇA CASSERA, ÉCRIT (§357 : une raison non écrite se fait supprimer). */
  dire(/TROISIÈME langue/.test(src) && /routing\.locales/.test(src),
    '⭐ et la limite est écrite : une TROISIÈME langue oblige à revoir cette ligne');
  dire(/§1/.test(src) && /APPROUVÉE PAR DOM/.test(src),
    '⚖️ l’exception à §1 porte sa raison et son auteur');

  /* ⑦ AUCUN TEXTE EN DUR NE SUBSISTE HORS DES DEUX LITTÉRAUX. Sans ça, une
     quatrième phrase pourrait vivre dans le JSX sans jamais entrer dans le
     jeu que ① vérifie — la garde serait vraie et l'écran, moitié anglais. */
  const EN_DUR = />\s*[A-Za-zÀ-ÿ][^<>{}]*<\//;
  const jsx = code.replace(/export const TEXTES[\s\S]*?\} as const;/, '');
  dire(!EN_DUR.test(jsx),
    '⛔ aucune phrase en dur hors des deux littéraux — tout passe par `TEXTES`');
  dire(EN_DUR.test('<h2 style={s}>Something went wrong</h2>'),
    '⭐ et l’expression SAIT dire non : la phrase en dur d’avant le lot est refusée');

  /* ⑧ ⛔ LE REPLI A UN CHEMIN. `error.message` d'une vraie `Error` est toujours
     une chaîne — vide, mais présente. Écrit `??`, le repli n'aurait JAMAIS été
     rendu : une chaîne traduite, gardée par ①, comptée, et invisible (§366).
     ★ C'est le défaut que ma propre garde aurait couvert ; il se vérifie donc
     AU RENDU, pas à la lecture. */
  dire(dit(rendreBrut(GlobalError, { error: new Error(''), reset: () => {} }), TEXTES.fr.repli),
    '⭐ un message VIDE rend la phrase de repli — elle a un chemin, elle est atteignable');
  dire(dit(rendreBrut(GlobalError, { error: new Error('Boom'), reset: () => {} }), 'Boom'),
    'et un message présent s’affiche tel quel');
}

/**
 * ⚖️ L'INSCRIPTION N'EST FINIE QU'APRÈS LES EXERCICES — LOT EX, 2026-09-23.
 *
 * ⛔ CE QUE CE LOT A MIS EN JEU, ET QUE CETTE FONCTION GARDE. Le drapeau
 * `onboarding_completed` s'écrivait à l'étape 7, UNE LIGNE avant
 * `logActivity('company_created')`, et c'est ce qui rendait l'étape 7
 * inatteignable pour toujours : une société, une ligne de registre. Déplacer la
 * fin à l'étape 8 lui retirait son gardien.
 * ★ LE GARDIEN EST DÉSORMAIS LA LIGNE ELLE-MÊME. Les assertions ⑤ et ⑥ tiennent
 * ce report ; sans elles, on aurait troqué un trou contre un doublon.
 */
function lotEX() {
  console.log('\n   ⚖️ LOT EX — LA FIN DE L’INSCRIPTION EST APRÈS LES EXERCICES');

  const lire = (...p: string[]) =>
    readFileSync(join(__dirname, '..', ...p), 'utf8');
  const sansCommentaires = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const flot = lire('components', 'onboarding', 'OnboardingFlow.tsx');
  const exercices = lire('components', 'onboarding', 'FiscalYearsSetup.tsx');
  const pageAssistant = lire('app', '[locale]', 'onboarding', 'page.tsx');
  const pageExercices = lire('app', '[locale]', 'onboarding', 'fiscal-years', 'page.tsx');

  /* ① LA FIN A QUITTÉ L'ÉTAPE 7. */
  /* ⚠️ ASSERTION RECALIBRÉE, AVEC SA RAISON (§374). Elle interdisait TOUTE
     mention du drapeau et elle a échoué à juste titre : l'étape 3 écrit
     `onboarding_completed: false` en créant la ligne `users`, ce qui est
     l'INVERSE d'une clôture et doit rester. Ce qu'on interdit est la mise à
     VRAI — la seule qui termine l'inscription. ⛔ Ne pas la relâcher davantage :
     `: true` est exactement le geste que le lot déplace. */
  dire(!/onboarding_completed:\s*true/.test(sansCommentaires(flot)),
    '⛔ l’assistant ne met plus le drapeau à VRAI — l’étape 7 ne clôt plus rien');
  dire(/onboarding_completed:\s*false/.test(sansCommentaires(flot)),
    '⚪ et il l’écrit toujours à FAUX en créant la ligne — l’inverse d’une clôture');
  dire(/preferred_language:\s*data\.language/.test(sansCommentaires(flot)),
    '⚪ mais il écrit toujours la LANGUE : elle gouverne chaque document généré');

  /* ② ELLE EST ARRIVÉE À L'ÉTAPE 8, ET APRÈS L'ÉCRITURE DES EXERCICES. */
  const codeExercices = sansCommentaires(exercices);
  dire(/onboarding_completed:\s*true/.test(codeExercices),
    '⭐ l’écran des exercices pose la fin de l’inscription');
  const posUpsertAnnees = codeExercices.indexOf("from('company_fiscal_years')");
  const posFin = codeExercices.indexOf('onboarding_completed');
  dire(posUpsertAnnees !== -1 && posFin > posUpsertAnnees,
    '⛔ et il la pose APRÈS les exercices — l’inverse déclarerait finie une écriture ratée');
  dire(/if \(finErreur\)/.test(codeExercices) && /setSaving\(false\)/.test(codeExercices),
    '⛔ un échec de cette écriture NE NAVIGUE PAS — sinon la boucle, en silence');

  /* ③ « PASSER » N'EXISTE PLUS — ni le bouton, ni sa chaîne au catalogue. */
  dire(!/'Passer'|"Passer"|'Skip'/.test(codeExercices),
    '⛔ « Passer » a disparu de l’écran — l’étape 8 est obligatoire');
  for (const langue of ['fr', 'en']) {
    const cat = JSON.parse(lire('messages', `${langue}.json`));
    dire(cat.onboarding?.unsavedFiscalYearsWarning === undefined,
      `⛔ et sa chaîne sort du catalogue ${langue.toUpperCase()} — plus rien ne la rend (§366)`);
  }

  /* ④ ⭐ LE CAS QUI NE DOIT RIEN CHANGER : une inscription complète aboutit au
     MÊME tableau de bord qu'avant. C'est la moitié du lot qu'on oublie de
     vérifier — on prouve ce qu'on a changé, jamais ce qu'on n'a pas voulu
     changer. */
  dire(/router\.push\(`\/\$\{locale\}\/dashboard`\)/.test(codeExercices),
    '⭐ une inscription complète finit au MÊME tableau de bord qu’avant');
  dire(/router\.push\(`\/\$\{locale\}\/onboarding\/fiscal-years`\)/.test(sansCommentaires(flot)),
    '⭐ et l’étape 7 mène toujours à l’étape 8, par le même chemin');

  /* ⑤ ⛔ LA GARANTIE DU REGISTRE, REPORTÉE SUR LA LIGNE ELLE-MÊME. */
  const codePageAssistant = sansCommentaires(pageAssistant);
  dire(/event_type['"]?,\s*['"]company_created['"]/.test(codePageAssistant),
    '⭐ l’assistant COMPTE les lignes « company_created » de la société');
  dire(/redirect\(`\/\$\{locale\}\/onboarding\/fiscal-years`\)/.test(codePageAssistant),
    '⛔ et dès qu’il en trouve une, il envoie à l’étape 8 — l’étape 7 reste inatteignable');
  dire(/if \(registreError\)\s*\{?\s*throw new Error\(\)/.test(codePageAssistant),
    '⛔ une lecture ratée LÈVE — la prendre pour « aucune ligne » fabriquerait le doublon');

  /* ⑥ LA PAGE DES EXERCICES A ENFIN UNE GARDE, DANS LES DEUX SENS. */
  const codePageExercices = sansCommentaires(pageExercices);
  dire(/profile\?\.onboarding_completed\)\s*redirect\(`\/\$\{locale\}\/dashboard`\)/.test(codePageExercices),
    '⛔ par le haut : une inscription déjà finie n’y revient pas');
  dire(/lignesDeRegistre \?\? 0\) === 0\) redirect\(`\/\$\{locale\}\/onboarding`\)/.test(codePageExercices),
    '⛔ par le bas : sans ligne de registre, on ne saute pas ici par l’URL');
  dire(/throw new Error\(\)/.test(codePageExercices),
    '⛔ et sa lecture LÈVE aussi — une garde qui s’ouvre sur une erreur n’est pas une garde');

  /* ⑦ LA PHRASE ANGLAISE A DISPARU, et la coquille bilingue prend le relais. */
  dire(!/Onboarding could not load your company/.test(pageAssistant),
    '⛔ la phrase anglaise n’est plus levée — `global-error` parle les deux langues');

  /* ⭐ CONTRÔLE POSITIF : la sonde sait dire NON. On lui donne les deux formes
     fautives — l'ancienne fin à l'étape 7, et une lecture qui s'ouvre sur
     l'erreur — et elle doit les refuser. Sans ça, les assertions ci-dessus ne
     prouveraient que sa complaisance. */
  const ANCIENNE_FIN = 'upsert({ id: userId, preferred_language: x, onboarding_completed: true })';
  dire(/onboarding_completed/.test(ANCIENNE_FIN),
    '⭐ et l’ancienne forme — la fin à l’étape 7 — serait bien VUE par l’assertion ①');
  const LECTURE_MOLLE = 'if (registreError) { /* on continue */ }';
  dire(!/if \(registreError\)\s*\{?\s*throw new Error\(\)/.test(LECTURE_MOLLE),
    '⭐ et une lecture qui s’ouvre sur l’erreur est REFUSÉE par l’assertion ⑤');
}

/**
 * ⚖️ UN REMPLACEMENT, UN SEUL ÉCRIVAIN — LOT 4, 2026-09-23.
 *
 * ⛔ CE LOT A DÉJÀ ÉTÉ DÉCLARÉ FERMÉ UNE FOIS. `dbf19b7` avait corrigé le TITRE
 * affiché par la branche fautive ; la caméra l'a vu, on a écrit « fermé », et la
 * moitié INVISIBLE — le type d'événement, le sortant, les deux dates — est
 * restée cassée. ★ Ces assertions portent donc sur ce qu'un écran ne montre
 * pas : qui écrit, et quoi.
 */
function lotL4() {
  console.log('\n   ⚖️ LOT 4 — LE REMPLACEMENT N’A PLUS QU’UN ÉCRIVAIN');

  const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
  const sansCommentaires = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const ajout = lire('components', 'officers', 'AddOfficerModal.tsx');
  const remplace = lire('components', 'officers', 'ReplaceOfficerModal.tsx');
  const client = lire('app', '[locale]', 'dashboard', 'officers', 'OfficersClient.tsx');
  const codeAjout = sansCommentaires(ajout);

  /* ① LA FENÊTRE D'AJOUT N'ÉCRIT PLUS DE REMPLACEMENT. */
  dire(!/replaceConflict/.test(codeAjout),
    '⛔ la branche `replaceConflict` n’existe plus dans la fenêtre d’ajout');
  dire(!/titresDeJournalRemplacement/.test(codeAjout),
    '⛔ et elle ne compose plus de titre de remplacement');
  dire(!/is_active:\s*false/.test(codeAjout),
    '⛔ elle ne ferme plus le mandat de personne — c’était ça, le sortant sans date');
  dire(/'officer_added'/.test(codeAjout) && !/'officer_replaced'/.test(codeAjout),
    '⚪ elle n’écrit plus que des nominations');

  /* ② ELLE PASSE LA MAIN, ET L'ÉCRAN LA BRANCHE. */
  dire(/onConflitDeTitre/.test(codeAjout),
    '⭐ le poste occupé PASSE LA MAIN au lieu d’écrire');
  const codeClient = sansCommentaires(client);
  dire(/onConflitDeTitre=\{/.test(codeClient) && /setReplacingOfficer\(titulaire\)/.test(codeClient),
    '⭐ et l’écran ouvre la fenêtre de REMPLACEMENT sur le titulaire en place');
  dire(/personneEntranteInitiale=\{/.test(codeClient),
    '⛔ en emportant la personne déjà désignée — une saisie ne se redemande pas');

  /* ③ ⭐ UN SEUL ÉCRIVAIN DU REMPLACEMENT DANS TOUT LE DÉPÔT. C'est l'assertion
     qui tient le lot : deux copies divergeraient, et l'une mentirait. */
  const ecrivains: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(join(__dirname, '..', dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) { parcourir(chemin); continue; }
      if (!/\.tsx?$/.test(entree.name)) continue;
      const src = sansCommentaires(readFileSync(join(__dirname, '..', chemin), 'utf8'));
      /* ⚠️ ASSERTION RECALIBRÉE, AVEC SA RAISON (§374). Elle cherchait la
         MENTION du type et a échoué à juste titre : `lib/journal-date-acte.ts`
         le NOMME comme clé de sa table — c'est une DÉCLARATION, pas une
         écriture. Ce qu'on interdit est un second ÉCRIVAIN, donc un appel à
         `logActivity` portant ce type. ⛔ Ne pas relâcher plus : la mention
         seule reviendrait à autoriser un écrivain qui s'appelle autrement. */
      /* ⚪ `[\s\S]` plutôt que le drapeau `s` : la cible du dépôt est ES5 et
         `tsc` refuse ce drapeau — même mur qu'au lot AH avec `Set`. */
      if (/logActivity\([\s\S]*?'officer_replaced'/.test(src)) ecrivains.push(chemin);
    }
  };
  parcourir('components');
  parcourir('app');
  parcourir('lib');
  dire(ecrivains.length === 1 && ecrivains[0].endsWith('ReplaceOfficerModal.tsx'),
    `⭐ un SEUL écrivain de « officer_replaced » : ${ecrivains.join(', ') || 'aucun'}`);

  /* ④ ET CET ÉCRIVAIN DIT TOUT L'ACTE — les deux personnes, les deux dates. */
  const codeRemplace = sansCommentaires(remplace);
  for (const champ of ['outgoing_person_id', 'incoming_person_id', 'outgoing_full_name',
    'incoming_full_name', 'end_date', 'start_date', 'end_reason']) {
    dire(new RegExp(champ).test(codeRemplace), `⚪ il consigne \`${champ}\``);
  }
  dire(/end_date:\s*endDate/.test(codeRemplace) && /is_active:\s*false/.test(codeRemplace),
    '⭐ et il FERME le mandat du sortant AVEC sa date de fin — le défaut du lot');

  /* ⑤ LES DEUX DATES SONT DEMANDÉES, JAMAIS DEVINÉES (`38f8303`). */
  const champsDate = (remplace.match(/type="date"/g) ?? []).length;
  dire(champsDate >= 2, `⭐ deux champs de date au moins sont OFFERTS à l’usager (${champsDate})`);
  dire(!/new Date\(\)\.toISOString\(\)\.slice/.test(codeRemplace),
    '⛔ et aucune date n’est fabriquée à partir de l’horloge');

  /* ⑥ ⭐ CONTRÔLE POSITIF : la sonde sait dire NON. */
  const FAUTIF = "await logActivity(supabase, id, u, 'officer_added', a, b, { person_id: p });";
  dire(/'officer_added'/.test(FAUTIF) && !/'officer_replaced'/.test(FAUTIF),
    '⭐ et l’ancienne écriture serait bien VUE par l’assertion ①');
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

/**
 * ⛔ UNE SEULE SÉQUENCE, ET ELLE ATTEND CE QUI EST ASYNCHRONE.
 *
 * ⚠️ `lotAG` rend une promesse — le lecteur de `register-loads` est `async`.
 * Lancé avec `void`, ses assertions s'exécutaient APRÈS `process.exit` : la
 * sonde annonçait « TOUT PASSE » sans les avoir vues. Un contrôle lancé dans
 * la mauvaise condition ne prouve rien ET SE DÉGUISE EN PREUVE (§371).
 */
async function principal() {
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
  lotK3Administrateurs();
  lotZB();
  lotAA();
  lotAC();
  lotACRendu();
  lotAD();
  lotAF();
  await lotAG();
  lotAG3();
  lotAH();
  lotEX();
  lotL4();
  console.log(`\n${echecs === 0 ? '✔ TOUT PASSE' : `⛔ ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

void principal();
