import { test, expect, type Page } from '@playwright/test';

/**
 * DEUX ACTES QUI NE SE DÉFONT PAS — sur la société JETABLE de T-8.
 *
 * ⚖️ LOT T-8-5, DOM, 2026-09-23. Ils vivent sur la société créée par le parcours
 * d'inscription, et JAMAIS sur « ZZ-TEST Parcours inc. » : là-bas, la preuve
 * d'isolement exige un parc stable, et ces actes déplacent le capital.
 *
 * ⛔ CE QU'ILS LAISSENT, PAR PASSAGE, ET RIEN NE LE DÉFAIT :
 *   · nomination — 1 personne, 1 mandat, 1 ligne « Administrateur nommé » ;
 *   · transfert  — 1 personne, 1 détention CLOSE, 1 détention NEUVE, 1 ligne
 *     `share_transfers`, 1 ligne de journal.
 * ★ LE TRANSFERT EST UNE CHAÎNE : il déplace TOUT le bloc (même catégorie, même
 *   quantité — `TransferShareholdingModal.tsx:10`). Le cessionnaire d'aujourd'hui
 *   est le cédant de demain. La société dérive donc à chaque passage, et c'est
 *   assumé : elle est jetable.
 *
 * ⚪ MESURÉ AVANT D'ÉCRIRE — le transfert n'exige AUCUNE préparation que
 * l'inscription ne donne pas : la modale crée la personne au passage (« nouvelle
 * personne »), hérite de la catégorie d'actions de la détention source, et ne
 * réclame qu'une DATE. Ni certificat, ni second actionnaire préalable.
 */

const HORODATAGE = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const ADMIN = `Admin ${HORODATAGE}`;
const CESSIONNAIRE = `Cess ${HORODATAGE}`;
const AUJOURDHUI = new Date().toISOString().slice(0, 10);

function identifiants() {
  const { E2E_INSCRIPTION_EMAIL, E2E_INSCRIPTION_PASSWORD } = process.env;
  if (!E2E_INSCRIPTION_EMAIL || !E2E_INSCRIPTION_PASSWORD) {
    throw new Error(
      'E2E_INSCRIPTION_EMAIL / E2E_INSCRIPTION_PASSWORD absents — ils vivent dans .env.test.local, hors dépôt.',
    );
  }
  return { courriel: E2E_INSCRIPTION_EMAIL, motDePasse: E2E_INSCRIPTION_PASSWORD };
}

async function seConnecter(page: Page) {
  const { courriel, motDePasse } = identifiants();
  await page.goto('/fr/login');
  await page.getByLabel(/adresse courriel/i).fill(courriel);
  await page.getByLabel(/mot de passe/i).fill(motDePasse);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 });
  /* ⛔ ET L'INSCRIPTION DOIT ÊTRE FINIE. Sur un compte resté à l'étape 8, toutes
     les pages du tableau de bord renvoient à l'assistant : le test échouerait
     plus loin, sur un symptôme, au lieu de le dire ici. */
  await page.goto('/fr/dashboard');
  await expect(
    page.getByRole('heading', { name: /^Tableau de bord$/ }),
    'l’inscription de ce compte doit être TERMINÉE — sinon lancer `npm run e2e:inscription`',
  ).toBeVisible({ timeout: 60_000 });
}

/** Le formulaire de personne, identique dans les deux modales. */
async function remplirNouvellePersonne(page: Page, nom: string) {
  await page.getByPlaceholder('Jean-Philippe Roussy').fill(nom);
  await page.getByPlaceholder('123, rue Principale').fill('200, rue du Témoin');
  await page.getByPlaceholder('Sainte-Adèle').fill('Montréal');
  await page.getByPlaceholder('J8B 1A1').fill('H2X 1Y4');
  /* ⚪ Province puis Pays, dans cet ordre de rendu : le bouton reste désactivé
     tant que le pays manque — mesuré au lot T-1. */
  await page.locator('select').nth(0).selectOption('QC');
  await page.locator('select').nth(1).selectOption('CA');
}

test('un administrateur nommé paraît au registre ET à l’Historique', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/directors');
  await page.getByRole('button', { name: /^Ajouter un administrateur$/ }).click();
  await page.getByRole('button', { name: /sélectionner une personne/i }).click();
  await page.getByRole('button', { name: /ajouter une nouvelle personne/i }).click();
  await remplirNouvellePersonne(page, ADMIN);
  await page.locator('input[type="date"]').last().fill(AUJOURDHUI);
  await page.getByRole('button', { name: /^Enregistrer$/ }).click();

  /* ⭐ IL PARAÎT AU REGISTRE — par son nom, celui qu'on vient d'écrire. */
  await expect(
    page.getByRole('heading', { name: ADMIN }),
    'le nouvel administrateur paraît au conseil',
  ).toBeVisible({ timeout: 60_000 });

  /* ⭐ ET L'ACTE EST CONSIGNÉ. ⛔ Le signal est le TEXTE de l'acte
     (`journal-charge.ts:58`), pas une pastille d'état : Aria renommera les
     états, pas le nom d'un acte au registre. */
  await page.goto('/fr/dashboard/activity');
  const ligne = page
    .locator('div')
    .filter({ hasText: 'Administrateur nommé' })
    .filter({ hasText: ADMIN });
  await expect(ligne.first(), 'l’Historique dit « Administrateur nommé » pour CETTE personne')
    .toBeVisible({ timeout: 60_000 });

  console.log(`\n⏱️  nomination : ${Date.now() - depart} ms`);
});

test('un transfert porte « Acquis par transfert le … » chez le cessionnaire', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/shareholders');
  await page.getByRole('button', { name: /^Transférer$/ }).first().click();
  await expect(page.getByRole('heading', { name: /^Transférer la détention$/ })).toBeVisible();
  /* ⚪ LE SÉLECTEUR S'OUVRE AVANT DE POUVOIR CRÉER : « Ajouter une nouvelle
     personne » ne paraît qu'une fois la liste dépliée. Mesuré, pas supposé. */
  await page.getByRole('button', { name: /^Sélectionner une personne$/ }).click();
  await page.getByRole('button', { name: /ajouter une nouvelle personne/i }).click();
  await remplirNouvellePersonne(page, CESSIONNAIRE);
  await page.locator('input[type="date"]').last().fill(AUJOURDHUI);
  await page.getByRole('button', { name: /^Confirmer le transfert$/ }).click();

  /* ⭐ LE CESSIONNAIRE PARAÎT, ET IL PORTE SA PROPRE DATE — c'est le lot AA,
     éprouvé ici dans un navigateur pour la première fois. */
  await expect(page.getByText(CESSIONNAIRE).first()).toBeVisible({ timeout: 60_000 });

  await page.goto('/fr/dashboard/minute-book/binder');
  const ligneRegistre = page
    .locator('div, tr')
    .filter({ hasText: CESSIONNAIRE })
    .filter({ hasText: /Acquis par transfert le/ });
  await expect(
    ligneRegistre.first(),
    'au registre, la ligne du cessionnaire porte « Acquis par transfert le … »',
  ).toBeVisible({ timeout: 90_000 });

  /* ⭐ ET L'HISTORIQUE PORTE LA DATE DE L'ACTE, pas seulement celle de la
     saisie — la table des dates d'acte range `share_transfer_created` sous
     `transfer_date` (`journal-date-acte.ts:134`). */
  await page.goto('/fr/dashboard/activity');
  await expect(
    page.getByText(new RegExp(AUJOURDHUI.split('-').reverse().join('|'))).first(),
    'l’Historique porte la date du transfert',
  ).toBeVisible({ timeout: 60_000 });

  console.log(`\n⏱️  transfert : ${Date.now() - depart} ms`);
});

/**
 * ⚖️ UN REMPLACEMENT DE DIRIGEANT, PAR LA PORTE « AJOUTER » — lot 4, 2026-09-23.
 *
 * ⛔ CE LOT A DÉJÀ ÉTÉ DÉCLARÉ FERMÉ UNE FOIS (`dbf19b7`) : le titre affiché
 * avait été corrigé, la caméra l'a vu, et la moitié INVISIBLE — le type, le
 * sortant, les deux dates — est restée cassée. ★ Ce test se prouve donc AU
 * REGISTRE, pas à l'écran qui vient de dire « enregistré ».
 *
 * ⭐⭐ LES DEUX DATES SONT DANS LE PASSÉ, ET C'EST TOUT L'ARGUMENT. Si le test
 * attendait la date du jour, il ne saurait pas distinguer une date SAISIE d'une
 * date DEVINÉE par l'horloge — les deux seraient identiques. Une date de 2025
 * ne peut venir que de l'usager.
 */
const FIN_SORTANT = '2025-03-17';
const DEBUT_ENTRANT = '2025-03-18';
const REMPLAÇANT = `Remp ${HORODATAGE}`;

test('« Ajouter » sur un poste occupé écrit un REMPLACEMENT, avec ses deux dates', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/officers');
  /* Le titulaire en place — on retient son nom AVANT, pour le chercher ensuite
     au registre en tant que SORTANT. */
  const sortant = (await page.locator('h3').first().textContent())?.trim() ?? '';
  expect(sortant, 'il y a bien un dirigeant en place').not.toBe('');

  await page.getByRole('button', { name: /^Nommer un dirigeant$/ }).click();
  await page.getByRole('button', { name: /sélectionner une personne/i }).click();
  await page.getByRole('button', { name: /ajouter une nouvelle personne/i }).click();
  await remplirNouvellePersonne(page, REMPLAÇANT);

  /* ⚪ « Poste » ARRIVE DÉJÀ SUR « Président·e » — mesuré, pas supposé : c'est
     le premier de la liste, et il est justement occupé depuis l'inscription.
     C'est donc la collision que SAFEGUARD 1 doit voir, sans qu'on touche à ce
     champ. ⛔ Le choisir quand même masquerait un changement de défaut. */
  await expect(
    page.getByRole('combobox').filter({ hasText: 'Président·e' }).first(),
    'le poste proposé par défaut est bien celui qui est occupé',
  ).toBeVisible();
  await page.locator('input[type="date"]').last().fill(DEBUT_ENTRANT);
  await page.getByRole('button', { name: /^Enregistrer$/ }).click();

  /* ⭐ LA SECONDE PORTE S'OUVRE — et elle ne recopie rien : c'est la fenêtre de
     remplacement, avec ses DEUX dates. */
  await expect(
    page.getByText(/est déjà occupé par/),
    'le poste occupé est signalé, pas écrasé',
  ).toBeVisible({ timeout: 60_000 });
  /* ⚪ DANS LA FENÊTRE, ET PAS SUR LES CARTES DERRIÈRE : chaque carte de
     dirigeant porte aussi un « Remplacer ». On vise celui de la fenêtre
     ouverte — le seul qui réponde à la collision qu'on vient de provoquer. */
  await page.getByRole('dialog').getByRole('button', { name: /^Remplacer$/ }).click();

  const fenetre = page.getByRole('heading', { name: /^Remplacer le dirigeant$/ });
  await expect(fenetre, '⭐ on passe la main à la fenêtre de REMPLACEMENT')
    .toBeVisible({ timeout: 60_000 });

  /* ⭐ ET ELLE ARRIVE AVEC LA PERSONNE DÉJÀ DÉSIGNÉE — la saisie de l'écran
     précédent n'est pas redemandée. */
  await expect(
    page.getByRole('dialog').getByText(REMPLAÇANT).first(),
    'la personne choisie à « Nommer » est portée jusqu’ici',
  ).toBeVisible();

  /* Les deux dates, DEMANDÉES par cette fenêtre — et un motif de fin. */
  const dates = page.getByRole('dialog').locator('input[type="date"]');
  await dates.nth(0).fill(FIN_SORTANT);
  await dates.nth(1).fill(DEBUT_ENTRANT);
  await page.getByRole('dialog').locator('select').last().selectOption({ index: 1 });
  await page.getByRole('button', { name: /^Confirmer le remplacement$/ }).click();

  /* ⛔ ON ATTEND LA FERMETURE, PAS L'APPARITION D'UN NOM. Le nom du remplaçant
     est affiché PAR LA FENÊTRE elle-même : l'attendre laisserait passer un
     enregistrement qui n'a jamais eu lieu. La fenêtre qui se ferme, elle, ne
     ment pas — `onSuccess` l'a fermée. */
  await expect(fenetre, 'la fenêtre se ferme — l’écriture a eu lieu').toHaveCount(0, {
    timeout: 90_000,
  });

  /* ⭐⭐ AU REGISTRE, ET C'EST LÀ QUE LE LOT SE PROUVE. Le sortant doit porter
     la date de fin SAISIE — celle de 2025, que rien n'aurait pu deviner. */
  await page.goto('/fr/dashboard/minute-book/binder');

  /* ⚠️⚠️ L'ASSERTION EST ANCRÉE SUR LA LIGNE DU SORTANT, ET C'EST UNE CORRECTION.
     Elle cherchait la date N'IMPORTE OÙ dans la page — et elle la trouvait :
     celle du passage PRÉCÉDENT, laissée par la chaîne des remplacements. Le
     test restait donc VERT avec la date de fin retirée du code. C'est le rouge
     qui l'a révélé, pour la seconde fois de la journée.
     ★ On lit donc la LIGNE de CETTE personne-là, et on y cherche sa date. */
  const ligneDuSortant = page.getByRole('row').filter({ hasText: sortant });
  await expect(ligneDuSortant.first(), 'le sortant est au registre').toBeVisible({ timeout: 90_000 });
  await expect(
    ligneDuSortant.filter({ hasText: FIN_SORTANT }).first(),
    `⭐ la ligne de « ${sortant} » porte la date de fin SAISIE (${FIN_SORTANT}) — ` +
      'une date de 2025 ne peut venir que de l’usager',
  ).toBeVisible({ timeout: 30_000 });

  /* ⭐ ET L'HISTORIQUE NOMME LES DEUX MOITIÉS DE L'ACTE. */
  await page.goto('/fr/dashboard/activity');
  await expect(page.getByText(/Fin —/).first(), 'l’Historique dit « Fin — … »').toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Nomination —/).first(), 'et « Nomination — … »').toBeVisible();

  console.log(`\n⏱️  remplacement : ${Date.now() - depart} ms · sortant « ${sortant} »`);
});

/**
 * ⭐ LE CAS QUI NE DOIT RIEN CHANGER — « Ajouter » sur un poste LIBRE.
 *
 * ⛔ SANS LUI, LE LOT 4 AURAIT PROUVÉ LA MOITIÉ DE SON TRAVAIL. On montre
 * volontiers ce qu'on a corrigé ; ce qu'on n'a pas voulu toucher se vérifie
 * rarement, et c'est là que les lots cassent des choses en silence.
 * ⚠️ IL VISAIT D'ABORD LE POSTE DE TRÉSORIER·ÈRE, « resté vacant depuis
 * l'inscription ». Faux dès le SECOND passage : le premier l'avait pourvu, et
 * le test tombait sur une collision — un rouge qui ne disait rien du produit.
 * ★ IL VISE DONC UN TITRE PERSONNALISÉ, LIBRE PAR CONSTRUCTION : SAFEGUARD 1
 * ne contrôle l'unicité QUE des titres du catalogue (`title !== 'custom'`,
 * `AddOfficerModal` l.185). Le test s'appuie donc sur la règle elle-même, pas
 * sur un état du parc qu'il modifie lui-même.
 */
const POSTE_LIBRE = `Poste ${HORODATAGE}`;

test('« Nommer » sur un poste LIBRE reste une simple nomination', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/officers');
  await page.getByRole('button', { name: /^Nommer un dirigeant$/ }).click();
  await page.getByRole('button', { name: /sélectionner une personne/i }).click();
  await page.getByRole('button', { name: /ajouter une nouvelle personne/i }).click();
  await remplirNouvellePersonne(page, POSTE_LIBRE);
  await page.getByRole('dialog').locator('select').last().selectOption('custom');
  await page.getByPlaceholder('Ex. : Directeur des opérations').fill(POSTE_LIBRE);
  await page.locator('input[type="date"]').last().fill(AUJOURDHUI);
  await page.getByRole('button', { name: /^Enregistrer$/ }).click();

  /* ⛔ AUCUNE COLLISION NE DOIT ÊTRE SIGNALÉE : le poste est libre. */
  await expect(
    page.getByText(/est déjà occupé par/),
    'un poste libre ne déclenche aucune porte de remplacement',
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: POSTE_LIBRE })).toBeVisible({ timeout: 60_000 });

  /* ⭐ ET LE JOURNAL DIT « nommé », PAS « remplacé ». */
  await page.goto('/fr/dashboard/activity');
  const ligne = page.locator('div').filter({ hasText: 'Dirigeant nommé' }).filter({ hasText: POSTE_LIBRE });
  await expect(ligne.first(), 'l’Historique dit « Dirigeant nommé »').toBeVisible({ timeout: 60_000 });

  console.log(`\n⏱️  nomination sur poste libre : ${Date.now() - depart} ms`);
});
