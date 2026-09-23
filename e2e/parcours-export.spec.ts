import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * EXPORTER LE LIVRE — lot T-7, DOM, 2026-09-23.
 *
 * ⚪ MESURÉ AVANT D'ÉCRIRE, comme demandé, et les trois réponses sont dans le
 * test parce qu'elles justifient sa forme :
 *   · CE QUE L'EXPORT ÉCRIT : RIEN. `app/api/due-diligence/export/route.ts` ne
 *     porte aucun `insert`, `update`, `upsert`, `delete`, ni `logActivity` — il
 *     LIT les registres et signe des URL de stockage. Ce parcours n'accumule
 *     donc RIEN : pas un document, pas une ligne de journal. Il n'a même pas
 *     besoin de se défaire.
 *   · SA DURÉE : 7,8 s et 12,7 s sur deux mesures, contre la production.
 *   · LE TÉLÉCHARGEMENT PAR BLOB SE CAPTE-T-IL SANS TÊTE ? OUI. La modale fait
 *     `a.download` + `a.click()` sur un `blob:` ; Chromium émet quand même
 *     l'événement `download`, et le nom du fichier arrive avec.
 *
 * ⚠️ ET C'EST CETTE MESURE-LÀ QUI AUTORISE LE TEST. Sans elle, je n'aurais pas
 * pu promettre un vert stable — c'était la condition de Dom.
 */

const ARCHIVE = join(tmpdir(), 'zapokay-livre-e2e.zip');

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

test('l’export rend une archive qui porte les registres', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/minute-book/binder');
  await page.getByRole('button', { name: /Exporter le livre/ }).click();

  /* L'écoute est posée AVANT le clic : l'archive d'une société légère arrive en
     quelques secondes, et l'événement ne se rattrape pas après coup. */
  const telechargement = page.waitForEvent('download', { timeout: 150_000 });
  await page.getByRole('button', { name: /^Exporter$/ }).click();

  const fichier = await telechargement;
  await fichier.saveAs(ARCHIVE);

  /* ⭐ ELLE N'EST PAS VIDE — par sa TAILLE, pas par sa présence : un fichier de
     zéro octet existe, lui aussi. */
  const octets = await readFile(ARCHIVE);
  expect(octets.byteLength, 'l’archive pèse quelque chose').toBeGreaterThan(10_000);

  /* ⭐ ET ELLE PORTE LES REGISTRES. ⛔ Le signal est le NOM DU DOSSIER dans
     l'archive, pas un libellé d'écran : ce nom EST le livre relié qu'un avocat
     ouvrira, et il ne change pas parce qu'Aria redessine une page. */
  const zip = await JSZip.loadAsync(octets);
  const entrees = Object.keys(zip.files);
  expect(entrees.length, 'l’archive contient des fichiers').toBeGreaterThan(0);
  expect(
    entrees.filter((n) => /Registres corporatifs/i.test(n)).length,
    `l’archive porte les registres — elle contient : ${entrees.join(', ')}`,
  ).toBeGreaterThan(0);
  expect(
    entrees.some((n) => /\.pdf$/i.test(n)),
    'et au moins un PDF — une archive de dossiers vides serait « non vide » sans rien porter',
  ).toBe(true);

  console.log(`\n⏱️  export : ${Date.now() - depart} ms · ${entrees.length} entrées · ${octets.byteLength} octets`);
});
