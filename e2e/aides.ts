import { expect, type Page } from '@playwright/test';

/**
 * LES GESTES QUE PLUSIEURS PARCOURS PARTAGENT — une seule déclaration.
 *
 * ⛔ EXTRAIT PLUTÔT QUE RECOPIÉ (lot T-6). Deux copies de « supprimer un
 * document » divergeraient le jour où l'écran change, et l'une des deux
 * mentirait sans que rien ne le dise — c'est la faute que ce dépôt appelle
 * « deux surfaces pour un fait » (§360).
 */

/** La ligne d'une exigence à Complétude : son plus proche ancêtre qui porte le verbe. */
export function ligneDe(page: Page, exigence: string) {
  return page.getByText(exigence, { exact: true }).locator(
    'xpath=ancestor::div[.//button[normalize-space()="Générer" or normalize-space()="Régénérer"]][1]',
  );
}

/** La ligne du coffre : son plus proche ancêtre qui porte « Supprimer ». */
export function ligneDuCoffre(page: Page, exigence: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: /^Supprimer$/ }) })
    .filter({ hasText: exigence })
    .last();
}

/**
 * SUPPRIMER UN DOCUMENT — PAR LES GESTES DU PRODUIT, ET PAR AUCUN AUTRE.
 *
 * ⚖️ PRINCIPE DE DOM, 2026-09-23 : un parcours DÉFAIT ce qu'il a fait. ⛔ Jamais
 * par SQL, jamais avec la clé d'administration : un ménage qui emprunte un
 * chemin que l'utilisateur n'a pas éprouverait un produit qui n'existe pas.
 *
 * ⚪ CE QUE CE GESTE FAIT VRAIMENT, mesuré avant de l'écrire
 * (`DocumentsClient.tsx:141-184`) : il retire l'objet du stockage — au mieux, un
 * échec y est ignoré —, SUPPRIME la rangée `documents` (un vrai DELETE, pas un
 * statut), et écrit UNE ligne `document_deleted` au journal. Les liens
 * `requirement_documents` et `event_documents` partent en cascade (`confdeltype
 * = 'c'`, vérifié au schéma).
 */
export async function supprimerDuCoffre(page: Page, exigence: string) {
  await page.goto('/fr/dashboard/minute-book/documents');
  const ligne = ligneDuCoffre(page, exigence);
  await expect(ligne).toBeVisible({ timeout: 60_000 });
  await ligne.getByRole('button', { name: /^Supprimer$/ }).click();
  /* ⚪ « Supprimer définitivement » N'EST PAS UNE SECONDE SORTE DE SUPPRESSION :
     c'est le libellé du bouton de CONFIRMATION de la seule qui existe au coffre
     (`DocumentRow.tsx:254`). Mesuré avant d'écrire, parce que les notes ZK
     laissaient croire à deux chemins. */
  await expect(page.getByRole('heading', { name: /^Supprimer ce document \?$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Supprimer définitivement$/ }).click();
  await expect(ligne).toHaveCount(0, { timeout: 60_000 });
}

/**
 * ⭐ RAMENER LA SOCIÉTÉ DANS L'ÉTAT ATTENDU — RÈGLE DE DOM POUR TOUS LES PARCOURS.
 *
 * ⛔ SANS CECI, UN ÉCHEC EN FAIT TOMBER UN AUTRE. Un passage interrompu au
 * milieu laisse un document actif ; le passage suivant trouverait « Régénérer »
 * là où il attend « Générer », et le rouge ne dirait plus rien du produit — il
 * dirait seulement que le rouge d'hier n'a pas été rangé.
 * ⚪ La boucle est bornée : le coffre ne montre qu'un document ACTIF par
 * exigence (les périmés n'y paraissent pas). Deux tours suffisent donc
 * largement ; au-delà, c'est une panne, et elle doit se voir.
 */
export async function remettreAZero(page: Page, exigence: string) {
  await page.goto('/fr/dashboard/minute-book/documents');
  for (let i = 0; i < 3; i++) {
    const ligne = ligneDuCoffre(page, exigence);
    if ((await ligne.count()) === 0) return;
    await supprimerDuCoffre(page, exigence);
  }
  throw new Error(`remettreAZero: « ${exigence} » revient après trois suppressions.`);
}

/**
 * ⭐ LE SIGNAL QUE COMPLÉTUDE REDEMANDE L'OBLIGATION — ET C'EST LE VERBE.
 *
 * ⚖️ Choisi sur mesure, pas par habitude : la ligne dit « Régénérer » tant qu'un
 * document actif la couvre, et « Générer » quand plus rien ne la couvre. Le
 * verbe est donc l'état, rendu par le produit lui-même.
 * ⛔ PAS UN LIBELLÉ D'ÉTAT (« À faire », « Manquant », une pastille) : Aria va
 * les renommer au Visual Update 1, et un test accroché à ces mots-là virerait au
 * rouge sur un changement de vocabulaire — un rouge qui ne dit rien du produit.
 * Le VERBE, lui, est une commande : il ne peut pas disparaître sans que la
 * fonction disparaisse avec.
 */
export async function completudeRedemande(page: Page, exigence: string) {
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligne = ligneDe(page, exigence);
  await expect(ligne.getByRole('button', { name: /^Générer$/ }))
    .toBeVisible({ timeout: 60_000 });
  await expect(
    ligne.getByRole('button', { name: /^Régénérer$/ }),
    'plus aucun document ne la couvre — le verbe est redevenu « Générer »',
  ).toHaveCount(0);
}

