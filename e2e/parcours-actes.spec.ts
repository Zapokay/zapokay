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
