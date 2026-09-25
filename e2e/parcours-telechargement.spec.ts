import { test, expect, type Page } from '@playwright/test';
import { remettreAZero, supprimerDuCoffre } from './aides';

/**
 * TÉLÉCHARGER DEPUIS COMPLÉTUDE — lot V4b, 2026-09-25.
 *
 * ⚖️ DÉCISION DE DOM : action AJOUTÉE (exception à la règle B). La case réservée en V4
 * dans la colonne d'icônes (œil · téléchargement · « ··· ») devient le MÊME bouton que
 * Documents (DownloadButton), même route, même nom de fichier (le titre du document).
 * ★ L'EXIGENCE CHOISIE NE CROISE AUCUN AUTRE PARCOURS : « Déclaration d'acceptation du
 * mandat d'administrateur » se téléverse et ne se génère pas.
 * ⚖️ Le parcours DÉFAIT ce qu'il a fait (principe T-4) : 2 lignes de journal par passage.
 * Pendant la partie téléchargement, toute écriture est BLOQUÉE.
 */

const EXIGENCE = "Déclaration d'acceptation du mandat d'administrateur";
const FICHIER = 'e2e/fixtures/document-test.pdf';

function identifiants() {
  const { E2E_EMAIL, E2E_PASSWORD } = process.env;
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error('E2E_EMAIL / E2E_PASSWORD absents — ils vivent dans .env.test.local, hors dépôt.');
  }
  return { courriel: E2E_EMAIL, motDePasse: E2E_PASSWORD };
}

async function seConnecter(page: Page) {
  const { courriel, motDePasse } = identifiants();
  await page.goto('/fr/login');
  await page.getByLabel(/adresse courriel/i).fill(courriel);
  await page.getByLabel(/mot de passe/i).fill(motDePasse);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 });
}

test('une ligne de Complétude AVEC fichier se télécharge par le même bouton que Documents', async ({ page }) => {
  await seConnecter(page);
  await remettreAZero(page, EXIGENCE);

  // ── Téléverser, certifié : la ligne porte ensuite un document ─────────────
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligneAvant = page
    .getByText(EXIGENCE, { exact: true })
    .locator('xpath=ancestor::div[.//input[@type="file"]][1]');
  await expect(ligneAvant).toBeVisible({ timeout: 60_000 });
  const reponse = page.waitForResponse(
    (r) => r.url().includes('/api/documents/upload') && r.request().method() === 'POST',
    { timeout: 150_000 },
  );
  await ligneAvant.locator('input[type="file"]').setInputFiles(FICHIER);
  await expect(page.getByRole('heading', { name: /^Téléverser un document$/ })).toBeVisible({ timeout: 60_000 });
  const certifie = page.getByLabel(/Je certifie que ce document est final/);
  if (!(await certifie.isChecked())) await certifie.check();
  await page.getByRole('button', { name: /^(Téléverser|Enregistrer|Confirmer)$/ }).last().click();
  const corps = await (await reponse).json();
  const documentId: string = corps.documentId ?? corps.document?.id ?? corps.id;
  expect(documentId, 'la réponse nomme le document déposé').toBeTruthy();

  // ── Télécharger, écritures BLOQUÉES ─────────────────────────────────────
  const tentees: string[] = [];
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && (r.url().includes('/api/') || r.url().includes('/rest/v1/'))) {
      tentees.push(`${r.method()} ${r.url().replace(/\?.*$/, '')}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligne = page.getByText(EXIGENCE, { exact: true }).locator('xpath=ancestor::div[.//a][1]');
  await expect(ligne.locator(`a[href*="${documentId}"]`), 'la ligne porte bien CE document').toBeVisible({ timeout: 60_000 });

  const bouton = ligne.getByRole('button', { name: 'Télécharger', exact: true });
  await expect(bouton, '⭐ la ligne porte un bouton « Télécharger »').toBeVisible();
  const get = page.waitForRequest(
    (r) => r.method() === 'GET' && new URL(r.url()).pathname === `/api/documents/${documentId}/download` && !r.url().includes('preview'),
  );
  const telechargement = page.waitForEvent('download');
  await bouton.click();
  await get;
  const fichier = await telechargement;
  // Le nom posé est le titre (a.download, comme Documents) ; le navigateur ajoute l'extension du type
  // MIME — mesuré au premier passage : « … d'administrateur.pdf ».
  expect(fichier.suggestedFilename(), 'le même nom que Documents : le titre du document').toBe(`${EXIGENCE}.pdf`);
  expect(tentees, 'aucune écriture pendant le téléchargement').toEqual([]);
  await page.unroute('**/*');

  // ── Et on défait ────────────────────────────────────────────────────────
  await supprimerDuCoffre(page, EXIGENCE);
});

test('une ligne de Complétude SANS fichier n’a aucun bouton « Télécharger »', async ({ page }) => {
  await seConnecter(page);
  const tentees: string[] = [];
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && (r.url().includes('/api/') || r.url().includes('/rest/v1/'))) {
      tentees.push(r.method());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/fr/dashboard/minute-book/completeness');
  // Une exigence que ZZ-TEST n'a jamais couverte, et qu'aucun parcours ne couvre.
  const ligne = page
    .getByText('Lettre de souscription d’actions', { exact: true })
    .or(page.getByText("Lettre de souscription d'actions", { exact: true }))
    .locator('xpath=ancestor::div[.//input[@type="file"]][1]');
  await expect(ligne).toBeVisible({ timeout: 60_000 });
  await expect(ligne.getByRole('button', { name: 'Télécharger', exact: true }), 'aucun bouton sans fichier').toHaveCount(0);
  expect(tentees).toEqual([]);
});
