import { test, expect, type Page } from '@playwright/test';
import { ligneDuCoffre, remettreAZero, supprimerDuCoffre } from './aides';

/**
 * TÉLÉVERSER SANS CERTIFIER — lot V1, 2026-09-24.
 *
 * ⚖️ LE CAS QUE LE LOT V1 EST VENU RÉGLER : un document téléversé et NON
 * certifié est un brouillon (state.ts le range en 'généré'). Complétude le
 * disait déjà ; le coffre, qui ne regardait que `source === 'generated'`, se
 * taisait. Ce parcours exige que les deux pages disent « À finaliser ».
 *
 * ★ L'EXIGENCE CHOISIE NE CROISE AUCUN AUTRE PARCOURS. « Règlement intérieur
 * (Règlement nº 1) » ne se génère pas et n'est touchée ni par la génération
 * (deux « Première résolution ») ni par le téléversement (RE-200).
 *
 * ⛔ LE LIVRE NE DOIT PAS LE PORTER : il ne relie que les documents finaux
 * (binder/route.ts, `is_finalized = true`). Une section chargée d'abord, puis
 * zéro occurrence — sinon l'absence prouverait seulement que la page attendait.
 *
 * ⚖️ ET IL DÉFAIT CE QU'IL A FAIT, par les gestes du produit (principe T-4).
 */

const EXIGENCE = 'Règlement intérieur (Règlement nº 1)';
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

/** La ligne d'une exigence à Complétude, tant qu'elle offre un fichier à déposer. */
function ligneCompletude(page: Page) {
  return page
    .getByText(EXIGENCE, { exact: true })
    .locator('xpath=ancestor::div[.//input[@type="file"]][1]');
}

test('un document téléversé NON certifié dit « À finaliser » au coffre ET à Complétude, et n’entre pas au Livre', async ({ page }) => {
  const depart = Date.now();
  const chrono: Record<string, number> = {};
  const jalon = (quoi: string) => { chrono[quoi] = Date.now() - depart; };

  await seConnecter(page);
  await remettreAZero(page, EXIGENCE);
  jalon('état attendu');

  // ── TÉLÉVERSER, CASE DÉCOCHÉE ───────────────────────────────────────────
  await page.goto('/fr/dashboard/minute-book/completeness');
  await expect(page.getByText(EXIGENCE, { exact: true })).toBeVisible({ timeout: 60_000 });
  const reponse = page.waitForResponse(
    (r) => r.url().includes('/api/documents/upload') && r.request().method() === 'POST',
    { timeout: 150_000 },
  );
  await ligneCompletude(page).locator('input[type="file"]').setInputFiles(FICHIER);
  await expect(page.getByRole('heading', { name: /^Téléverser un document$/ })).toBeVisible({ timeout: 60_000 });
  const certifie = page.getByLabel(/Je certifie que ce document est final/);
  if (await certifie.isChecked()) await certifie.uncheck();
  await expect(certifie, '⛔ la certification reste DÉCOCHÉE — c’est tout le cas').not.toBeChecked();
  await page.getByRole('button', { name: /^(Téléverser|Enregistrer|Confirmer)$/ }).last().click();

  const r = await reponse;
  expect(r.status(), 'le téléversement répond 200').toBe(200);
  const corps = await r.json();
  const documentId: string = corps.documentId ?? corps.document?.id ?? corps.id;
  expect(documentId, 'la réponse nomme le document déposé').toBeTruthy();
  jalon('document téléversé, non certifié');

  // ── ⭐ LE COFFRE DIT « À FINALISER » — la moitié que V1 corrige ─────────
  await page.goto('/fr/dashboard/minute-book/documents');
  const ligneCoffre = ligneDuCoffre(page, EXIGENCE);
  await expect(ligneCoffre).toBeVisible({ timeout: 60_000 });
  await expect(
    ligneCoffre.getByText('À finaliser', { exact: true }),
    '⭐ le coffre porte « À finaliser » sur un téléversement non certifié',
  ).toBeVisible();
  jalon('coffre : À finaliser');

  // ── ET COMPLÉTUDE DIT LA MÊME CHOSE, sur la ligne de CE document ────────
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligneApres = page
    .getByText(EXIGENCE, { exact: true })
    .locator('xpath=ancestor::div[.//a][1]');
  await expect(ligneApres.locator(`a[href*="${documentId}"]`)).toBeVisible({ timeout: 60_000 });
  await expect(
    ligneApres.getByText('À finaliser', { exact: true }),
    'Complétude porte « À finaliser » sur la même ligne',
  ).toBeVisible();
  jalon('Complétude : À finaliser');

  // ── ⛔ LE LIVRE NE LE PORTE PAS ────────────────────────────────────────
  await page.goto('/fr/dashboard/minute-book/binder');
  await expect(
    page.getByRole('heading', { name: /^Règlements$/ }),
    'la section où il serait rangé est chargée',
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText(EXIGENCE),
    '⛔ un document non certifié n’entre pas au Livre (finaux seulement)',
  ).toHaveCount(0);
  jalon('Livre : absent');

  // ── EN ANGLAIS : « Pending » au coffre ────────────────────────────────
  await page.goto('/en/dashboard/minute-book/documents');
  const ligneCoffreEn = page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: /^Delete$/ }) })
    .filter({ hasText: EXIGENCE })
    .last();
  await expect(ligneCoffreEn).toBeVisible({ timeout: 60_000 });
  await expect(ligneCoffreEn.getByText('Pending', { exact: true }), 'le coffre anglais dit « Pending »').toBeVisible();
  jalon('coffre EN : Pending');

  // ── ET ON DÉFAIT ────────────────────────────────────────────────────────
  await supprimerDuCoffre(page, EXIGENCE);
  jalon('document supprimé');

  /* ⚪ Le verbe « Générer » n'existe pas sur cette ligne : le signal est le RETOUR
     de « Téléverser », sans « Voir » ni « Remplacer ». */
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligneFin = ligneCompletude(page);
  await expect(ligneFin.getByRole('button', { name: /^Téléverser$/ })).toBeVisible({ timeout: 60_000 });
  await expect(ligneFin.getByRole('button', { name: /^Remplacer$/ })).toHaveCount(0);
  await expect(ligneFin.getByRole('link', { name: /^Voir$/ })).toHaveCount(0);
  await expect(page.locator(`a[href*="${documentId}"]`)).toHaveCount(0);
  jalon('Complétude redemande');

  console.log('\n⏱️  JALONS (ms depuis le départ)');
  for (const [quoi, ms] of Object.entries(chrono)) console.log(`   ${String(ms).padStart(7)} — ${quoi}`);
});
