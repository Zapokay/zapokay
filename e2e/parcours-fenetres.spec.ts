import { test, expect, type Page } from '@playwright/test';
import { ligneDe } from './aides';

/**
 * UNE FENÊTRE N'EST JAMAIS DANS LA LIGNE QU'ELLE RECOUVRE — §392, lot V4, 2026-09-25.
 *
 * ⛔ LE DÉFAUT MESURÉ (V4-0, ACME) : le dialogue de résolution d'un acte était rendu DANS
 * la div de ligne ; son voile fixe « survolait » donc la ligne (:hover remonte aux
 * ancêtres) et la ligne restait en surbrillance derrière la fenêtre. Même structure pour
 * la fenêtre des signataires, rendue dans GenerateDocumentButton, dans la ligne.
 * ★ LE SIGNAL : `div.group` est la div À SURVOL de chaque ligne. Aucune ne doit contenir
 * la fenêtre ouverte.
 * ⚖️ ZÉRO ÉCRITURE : toute requête qui n'est pas un GET vers l'API ou la base est BLOQUÉE,
 * et le test tombe si une seule est tentée. On ouvre, on regarde, on annule.
 */

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

/** Après la connexion : toute écriture vers l'API ou la base est refusée, et notée. */
async function bloquerLesEcritures(page: Page): Promise<string[]> {
  const tentees: string[] = [];
  await page.route('**/*', (route) => {
    const r = route.request();
    const u = r.url();
    if (r.method() !== 'GET' && (u.includes('/api/') || u.includes('/rest/v1/'))) {
      tentees.push(`${r.method()} ${u.replace(/\?.*$/, '')}`);
      return route.abort();
    }
    return route.continue();
  });
  return tentees;
}

test('la fenêtre des signataires n’est pas dans la ligne qui l’a ouverte', async ({ page }) => {
  await seConnecter(page);
  const tentees = await bloquerLesEcritures(page);
  await page.goto('/fr/dashboard/minute-book/completeness');

  const ligne = ligneDe(page, "Première résolution du conseil d'administration");
  await ligne.getByRole('button', { name: /^(Générer|Régénérer)$/ }).click({ timeout: 60_000 });
  const titre = page.getByRole('heading', { name: /^Signataires$/ });
  await expect(titre, 'la fenêtre des signataires s’ouvre').toBeVisible({ timeout: 60_000 });

  await expect(
    page.locator('div.group').filter({ has: titre }),
    '⛔ aucune div de ligne (à survol) ne contient la fenêtre',
  ).toHaveCount(0);

  await page.getByRole('button', { name: /^Annuler$/ }).click();
  await expect(titre).toBeHidden();
  expect(tentees, 'aucune écriture tentée').toEqual([]);
});

test('le dialogue de résolution d’un acte n’est pas dans la ligne qui l’a ouvert', async ({ page }) => {
  await seConnecter(page);
  const tentees = await bloquerLesEcritures(page);
  await page.goto('/fr/dashboard/minute-book/completeness');

  /* ZZ-TEST n'a aucun exercice : son seul acte (une nomination d'administrateur,
     postérieure à la constitution) vit sous « Événements — hors exercice ». */
  const horsExercice = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: 'Événements — hors exercice', exact: true }) })
    .last();
  await expect(horsExercice).toBeVisible({ timeout: 60_000 });
  await horsExercice.getByRole('button', { name: /^(Générer|Régénérer)$/ }).first().click();

  const dialogue = page.getByRole('dialog');
  await expect(dialogue, 'le dialogue de résolution s’ouvre').toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator('div.group').filter({ has: dialogue }),
    '⛔ aucune div de ligne (à survol) ne contient le dialogue',
  ).toHaveCount(0);

  await dialogue.getByRole('button', { name: /^Annuler$/ }).click();
  await expect(dialogue).toBeHidden();
  expect(tentees, 'aucune écriture tentée').toEqual([]);
});
