import { test, expect, type Page } from '@playwright/test';

/**
 * UN CLIC À CÔTÉ NE DÉTRUIT PAS UNE SAISIE — lot T-5, DOM, 2026-09-23.
 *
 * ⭐ LE SEUL PARCOURS QUI N'ÉCRIT RIEN. Il ouvre, remplit la moitié, clique à
 * côté, vérifie, et ANNULE. Il peut donc rouler sur « ZZ-TEST Parcours inc. »
 * sans rien déplacer — aucune accumulation, pas même une ligne de journal.
 *
 * ⚖️ CE QU'IL GARDE EST LA DÉCISION DU LOT AF : un geste ACCIDENTEL ne ferme pas
 * une modale à champs ; un geste DÉLIBÉRÉ, oui. Seize modales portaient
 * `onClick={onClose}` sur leur voile — dix-sept copies d'une décision que
 * personne n'avait prise, et une saisie entière partait avec.
 *
 * ⛔ LA CIBLE EST LE TITRE, PAS `role="dialog"`. `Modale.tsx` le porte
 * aujourd'hui, mais viser le rôle ferait passer ce test pour une preuve du
 * rôle ; ce qu'on éprouve ici est le COMPORTEMENT. Le titre est aussi ce que
 * le lecteur voit.
 */

const TEXTE_SAISI = 'Saisie qui ne doit pas disparaître';

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

test('un clic à côté ne détruit pas une saisie, et « Annuler » ferme', async ({ page }) => {
  const depart = Date.now();
  await seConnecter(page);

  await page.goto('/fr/dashboard/directors');
  await page.getByRole('button', { name: /^Ajouter un administrateur$/ }).click();
  const titre = page.getByRole('heading', { name: /^Ajouter un administrateur$/ });
  await expect(titre).toBeVisible({ timeout: 60_000 });

  // La moitié du formulaire, et pas plus : c'est ce qu'on refuse de perdre.
  await page.getByRole('button', { name: /sélectionner une personne/i }).click();
  await page.getByRole('button', { name: /ajouter une nouvelle personne/i }).click();
  const champ = page.getByPlaceholder('Jean-Philippe Roussy');
  await champ.fill(TEXTE_SAISI);

  /* ⛔ LE CLIC ACCIDENTEL — JUSTE À CÔTÉ DU PANNEAU, et calculé.
     ⚠️⚠️ CE BLOC EST NÉ D'UNE FAUTE, ET LA VOICI POUR QU'ELLE NE REVIENNE PAS.
     Il cliquait en (5, 5), « loin du panneau ». Or à cet endroit se trouve la
     BARRE LATÉRALE : le clic ne touchait pas le voile, et le test passait donc
     pour une raison qui n'était pas la bonne — vert avec l'ancien comportement
     remis. C'est le ROUGE qui l'a révélé ; sans lui, j'aurais livré une preuve
     creuse (§371).
     ★ ON VISE DONC LE PANNEAU, PUIS 20 PIXELS À SA GAUCHE — le seul endroit
     dont on peut dire qu'il est « à côté » sans le supposer. */
  const panneau = page.getByRole('dialog');
  const boite = await panneau.boundingBox();
  if (!boite) throw new Error('le panneau n’a pas de boîte — impossible de viser à côté');
  const x = Math.round(boite.x - 20);
  const y = Math.round(boite.y + boite.height / 2);

  /* ⛔ ET ON VÉRIFIE CE QU'ON VA FRAPPER AVANT DE FRAPPER. Le voile est le seul
     élément `aria-hidden` à couvrir l'écran ; si le point tombe ailleurs, le
     test le DIT au lieu de conclure. C'est la garde contre la faute ci-dessus. */
  const cible = await page.evaluate(([cx, cy]) => {
    const el = document.elementFromPoint(cx, cy);
    return { aria: el?.getAttribute('aria-hidden'), tag: el?.tagName.toLowerCase() };
  }, [x, y]);
  expect(cible.aria, `le point visé (${x}, ${y}) doit être le VOILE, pas un ${cible.tag}`).toBe('true');

  await page.mouse.click(x, y);
  await page.waitForTimeout(500);

  await expect(titre, '⭐ la fenêtre est TOUJOURS là').toBeVisible();
  await expect(champ, '⭐ et la saisie est INTACTE').toHaveValue(TEXTE_SAISI);

  /* ⭐ ET LE GESTE DÉLIBÉRÉ, LUI, FERME. Sans cette moitié, on aurait prouvé
     qu'une fenêtre ne se ferme jamais — ce qui serait un autre défaut. */
  await page.getByRole('button', { name: /^Annuler$/ }).click();
  await expect(titre, '⭐ « Annuler » ferme — le geste délibéré passe').toHaveCount(0, {
    timeout: 30_000,
  });

  console.log(`\n⏱️  saisie gardée : ${Date.now() - depart} ms`);
});
