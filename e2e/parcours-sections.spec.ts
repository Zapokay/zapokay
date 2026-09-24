import { test, expect, type Page } from '@playwright/test';

/**
 * LE CONTENANT COMMUN SE REPLIE — lot V2, test S1 d'Aria, 2026-09-24.
 *
 * ★ MÊMES ÉTAPES SUR LES DEUX PAGES, parce que c'est UN composant (SectionCard) :
 * l'en-tête se trouve par son RÔLE et son NOM EXACT — un nom qui porterait le
 * chevron, le numéro ou la métrique ferait tomber ce test, et c'est voulu.
 * ⚪ Lecture seule : aucun geste d'écriture, rien à défaire.
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

/** Clic, clic, puis clavier : la séquence S1, identique sur les deux pages. */
async function sequenceS1(page: Page, titre: string, contenu: () => ReturnType<Page['locator']>) {
  const enTete = page.getByRole('heading', { name: titre, exact: true });
  await expect(enTete, `l’en-tête « ${titre} » se trouve par son rôle et son nom exact`).toBeVisible({ timeout: 90_000 });
  const bouton = enTete.getByRole('button');
  await expect(bouton).toHaveAttribute('aria-expanded', 'true');
  await expect(contenu().first()).toBeVisible();

  await bouton.click();
  await expect(bouton, 'un clic replie').toHaveAttribute('aria-expanded', 'false');
  await expect(contenu(), 'replié : le contenu est ABSENT, pas seulement caché').toHaveCount(0);

  await bouton.click();
  await expect(bouton, 'un second clic rouvre').toHaveAttribute('aria-expanded', 'true');
  await expect(contenu().first()).toBeVisible();

  await bouton.focus();
  await page.keyboard.press('Enter');
  await expect(bouton, 'au clavier : focus + Entrée bascule').toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(bouton).toHaveAttribute('aria-expanded', 'true');
}

test('Complétude : l’en-tête commun se replie au clic et au clavier', async ({ page }) => {
  await seConnecter(page);
  await page.goto('/fr/dashboard/minute-book/completeness');
  await sequenceS1(page, 'Documents fondateurs', () =>
    page.getByText('Règlement intérieur (Règlement nº 1)', { exact: true }),
  );
});

test('Livre : même en-tête, même repli ; une section VIDE n’a pas de bouton', async ({ page }) => {
  await seConnecter(page);
  await page.goto('/fr/dashboard/minute-book/binder');
  await sequenceS1(page, 'Registres corporatifs', () => page.getByRole('table'));

  /* ⛔ L'EN-TÊTE INERTE : ZZ-TEST n'a aucun document signé, donc « Règlements »
     est vide — un titre, et AUCUN bouton à basculer. */
  const vide = page.getByRole('heading', { name: 'Règlements', exact: true });
  await expect(vide).toBeVisible();
  await expect(vide.getByRole('button'), 'une section vide ne se replie pas').toHaveCount(0);
});
