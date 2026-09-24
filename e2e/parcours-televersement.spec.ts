import { test, expect, type Page } from '@playwright/test';
import { ligneDuCoffre, supprimerDuCoffre } from './aides';

/**
 * TÉLÉVERSER, PUIS SUPPRIMER — lot T-6, DOM, 2026-09-23.
 *
 * ⚖️ MÊME PRINCIPE QUE T-4 : le parcours défait ce qu'il a fait, par les gestes
 * du produit. Il laisse donc 0 document et 0 objet au stockage ; restent deux
 * lignes de journal (`document_uploaded`, `document_deleted`) qui, elles, ne se
 * défont pas et ne doivent pas.
 *
 * ★ L'EXIGENCE CHOISIE NE SE GÉNÈRE PAS. « Déclaration initiale (RE-200) » est
 * un document que l'État produit : ZapOkay ne peut que le RECEVOIR. Ce parcours
 * n'entre donc jamais en collision avec ceux de la génération, qui travaillent
 * sur deux autres lignes.
 *
 * ⛔ LE SIGNAL EST L'IDENTIFIANT DU DOCUMENT, jamais un compte de section
 * (« 1/7 ») : le compte bougerait aussi si un AUTRE parcours téléversait
 * ailleurs, et Aria peut le renommer. L'identifiant, lui, ne désigne que ce
 * qu'on vient de déposer.
 */

const EXIGENCE = 'Déclaration initiale (RE-200)';
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

test('un document téléversé paraît au livre, et sa suppression rouvre l’obligation', async ({ page }) => {
  const depart = Date.now();
  const chrono: Record<string, number> = {};
  const jalon = (quoi: string) => { chrono[quoi] = Date.now() - depart; };

  await seConnecter(page);

  /* ⭐ L'ÉTAT ATTENDU — règle de Dom : un passage interrompu hier ne décide pas
     du verdict d'aujourd'hui. */
  await page.goto('/fr/dashboard/minute-book/documents');
  for (let i = 0; i < 3 && (await ligneDuCoffre(page, EXIGENCE).count()) > 0; i++) {
    await supprimerDuCoffre(page, EXIGENCE);
  }
  jalon('état attendu');

  await page.goto('/fr/dashboard/minute-book/completeness');
  const titre = page.getByText(EXIGENCE, { exact: true });
  await expect(titre).toBeVisible({ timeout: 60_000 });

  const ligne = titre.locator('xpath=ancestor::div[.//input[@type="file"]][1]');
  await expect(
    ligne.getByRole('button', { name: /^Générer$/ }),
    '⚪ cette exigence NE SE GÉNÈRE PAS — c’est un document de l’État',
  ).toHaveCount(0);

  /* La réponse est mise à l'écoute AVANT le geste : le téléversement d'un
     fichier de 576 octets répondrait sinon avant qu'on regarde. */
  const reponse = page.waitForResponse(
    (r) => r.url().includes('/api/documents/upload') && r.request().method() === 'POST',
    { timeout: 150_000 },
  );
  await ligne.locator('input[type="file"]').setInputFiles(FICHIER);

  await expect(page.getByRole('heading', { name: /^Téléverser un document$/ })).toBeVisible({
    timeout: 60_000,
  });
  /* ⚪ La case « Je certifie que ce document est final » arrive DÉCOCHÉE
     (UploadDocumentModal:181) ; ce parcours la coche, et vérifie avant de cliquer. */
  const certifie = page.getByLabel(/Je certifie que ce document est final/);
  if (!(await certifie.isChecked())) await certifie.check();
  await page.getByRole('button', { name: /^(Téléverser|Enregistrer|Confirmer)$/ }).last().click();

  const r = await reponse;
  expect(r.status(), 'le téléversement répond 200').toBe(200);
  const corps = await r.json();
  expect(corps.ok ?? corps.success, 'le téléversement se déclare réussi').toBeTruthy();
  const documentId: string = corps.documentId ?? corps.document?.id ?? corps.id;
  expect(documentId, 'la réponse nomme le document déposé').toBeTruthy();
  jalon('document téléversé');

  /* ⭐ COMPLÉTUDE LE RECONNAÎT — par l'identifiant, dans SA ligne. */
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligneApres = page
    .getByText(EXIGENCE, { exact: true })
    .locator('xpath=ancestor::div[.//a][1]');
  await expect(
    ligneApres.locator(`a[href*="${documentId}"]`),
    'Complétude reconnaît le document déposé — dans la ligne de CETTE exigence',
  ).toBeVisible({ timeout: 60_000 });
  jalon('Complétude le reconnaît');

  /* ⭐ ET LE LIVRE LE PORTE. C'est l'autre moitié : reconnu par le moteur ET
     rangé dans le livre relié. */
  await page.goto('/fr/dashboard/minute-book/binder');
  await expect(page.getByText(EXIGENCE).first()).toBeVisible({ timeout: 90_000 });
  jalon('le Livre le porte');

  // ── ET ON DÉFAIT ────────────────────────────────────────────────────────
  await supprimerDuCoffre(page, EXIGENCE);
  jalon('document supprimé');

  await page.goto('/fr/dashboard/minute-book/completeness');
  await expect(
    page.locator(`a[href*="${documentId}"]`),
    '⛔ l’obligation est rouverte — plus aucun lien vers le document supprimé',
  ).toHaveCount(0, { timeout: 60_000 });
  jalon('Complétude redemande');

  console.log('\n⏱️  JALONS (ms depuis le départ)');
  for (const [quoi, ms] of Object.entries(chrono)) console.log(`   ${String(ms).padStart(7)} — ${quoi}`);
});
