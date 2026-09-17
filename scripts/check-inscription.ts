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
import { VALEUR_ENTITE_VIDE, valeurAvecAdresse } from '@/lib/entity-payload';

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

  console.log('   ⭐ LE NOMBRE D’ACTIONS COMPTE, ET CE N’ÉTAIT PAS AU BRIEF');
  // ⛔ La boucle d'écriture saute sur `nom vide OU numberOfShares <= 0`. Une ligne
  //    nommée et domiciliée à ZÉRO action passerait le bouton et n'écrirait RIEN.
  const zeroActions = etape5([{ ...PERSONNE_COMPLETE, numberOfShares: 0 }]);
  dire(boutonDesactive(zeroActions), 'une ligne complète à ZÉRO action bloque');
  dire(dit(zeroActions, "le nombre d'actions"), 'et le message le NOMME');
}

/* ─── LOT C3, D : leurs écrans s'ajoutent ici, et A+B+C1+C2 se rejouent. */

console.log('EXIGENCES DE L’INSCRIPTION — montage réel, sans navigateur');
lotA();
lotB();
lotC1();
lotC2();
console.log(`\n${echecs === 0 ? '✔ TOUT PASSE' : `⛔ ${echecs} échec(s)`}`);
process.exit(echecs === 0 ? 0 : 1);
