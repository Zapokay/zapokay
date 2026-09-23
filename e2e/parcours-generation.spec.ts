import { test, expect, type Page } from '@playwright/test';

/**
 * LE PARCOURS QUI COMPTE : se connecter, et faire naître un document.
 *
 * ⚖️ LOT T-1, DOM, 2026-09-23. UN seul parcours, contre le produit DÉPLOYÉ,
 * avec le compte de test et sa société « ZZ-TEST Parcours inc. ».
 *
 * ⛔ AUCUNE CLÉ D'ADMINISTRATION. Il se connecte par mot de passe, comme un
 * client : il ne voit donc que ce que la RLS lui laisse voir, et ne peut pas
 * atteindre une autre société même par erreur de ma part.
 *
 * ⭐ LES CIBLES SONT DU TEXTE ET DES RÔLES, jamais des classes — Aria refera
 * ces écrans, et un test accroché à `bg-amber-500` mourrait au premier coup de
 * pinceau en annonçant une panne qui n'existe pas.
 *
 * ⭐⭐ ET IL VÉRIFIE **CE QU'IL VIENT DE CRÉER**, par son identifiant, jamais un
 * compte global. Chaque passage ajoute un PDF à la société de test : « il y a
 * 4 documents » serait vrai aujourd'hui, faux demain, et ne dirait rien de la
 * génération qu'on vient de demander.
 */

/** L'exigence choisie : fondatrice, donc toujours présente, et elle a deux
 *  signataires — c'est ce qui fait s'ouvrir la fenêtre. */
const EXIGENCE = "Première résolution du conseil d'administration";

/**
 * L'AUTRE CHEMIN, CELUI QUI N'OUVRE RIEN — lot T-3.
 *
 * ⚖️ C'EST LE PARCOURS DE LA CIBLE DE DOM : la PME à un seul signataire. T-1
 * ne l'éprouvait pas, et c'est pourtant le plus fréquent.
 *
 * ★ POURQUOI CELLE-CI, ET SANS SECONDE SOCIÉTÉ. `requirement-map.ts:11` range
 * « Première résolution des actionnaires » sous `shareholder`, et ZZ-TEST n'a
 * QU'UN actionnaire : un seul bloc, donc `GenerateDocumentButton:86` génère
 * directement. Le même compte sert donc aux deux chemins, et le second
 * administrateur dont T-1 a besoin reste en place.
 */
const EXIGENCE_SOLO = 'Première résolution des actionnaires';

/** ⛔ « Générer » OU « Régénérer », ET C'EST MESURÉ, PAS TOLÉRÉ. Au premier
 *  passage la ligne dit « Générer » ; dès qu'un document existe elle dit
 *  « Régénérer ». Le test doit pouvoir tourner DEUX FOIS — n'accepter que le
 *  premier mot le rendrait vert une fois puis rouge pour une raison qui n'est
 *  pas une panne. */
const VERBE = /^(Générer|Régénérer)$/;

/** La ligne d'une exigence : son plus proche ancêtre qui porte le verbe. */
function ligneDe(page: Page, exigence: string) {
  return page.getByText(exigence, { exact: true }).locator(
    'xpath=ancestor::div[.//button[normalize-space()="Générer" or normalize-space()="Régénérer"]][1]',
  );
}

function identifiants() {
  const { E2E_EMAIL, E2E_PASSWORD } = process.env;
  /* ⛔ ABSENTS → LE TEST ÉCHOUE EN LE DISANT. Un test qui se saute lui-même
     parce qu'il manque un secret est un test vert qui n'a rien prouvé. */
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD absents — ils vivent dans .env.test.local, hors dépôt.',
    );
  }
  return { courriel: E2E_EMAIL, motDePasse: E2E_PASSWORD };
}

async function seConnecter(page: Page) {
  const { courriel, motDePasse } = identifiants();
  await page.goto('/fr/login');
  await page.getByLabel(/adresse courriel/i).fill(courriel);
  await page.getByLabel(/mot de passe/i).fill(motDePasse);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  /* La connexion est faite quand l'URL a QUITTÉ /login — pas quand le réseau
     se calme : le routeur pousse la navigation après la réponse. */
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 });
}

test('connexion → Complétude → Générer → le document paraît', async ({ page }) => {
  const depart = Date.now();
  const chrono: Record<string, number> = {};
  const jalon = (quoi: string) => { chrono[quoi] = Date.now() - depart; };

  await seConnecter(page);
  jalon('connexion');

  await page.goto('/fr/dashboard/minute-book/completeness');
  const titre = page.getByText(EXIGENCE, { exact: true });
  await expect(titre).toBeVisible({ timeout: 60_000 });
  jalon('complétude affichée');

  const ligne = ligneDe(page, EXIGENCE);
  await expect(ligne.getByRole('button', { name: VERBE })).toHaveCount(1);
  await ligne.getByRole('button', { name: VERBE }).click();

  /* LA FENÊTRE DES SIGNATAIRES. ⚠️ Elle ne porte PAS `role="dialog"` : c'est la
     seule modale du dépôt qui n'a pas pris l'enveloppeur du lot AF (sa raison
     est écrite dans `SignatoriesModal.tsx:103`). On la reconnaît donc à son
     titre — ce que le lecteur voit, lui aussi. */
  await expect(page.getByRole('heading', { name: /^Signataires$/ })).toBeVisible({ timeout: 60_000 });
  jalon('fenêtre ouverte');

  /* La réponse est mise à l'écoute AVANT le clic : une génération rapide
     répondrait sinon avant qu'on regarde. */
  const reponse = page.waitForResponse(
    (r) => r.url().includes('/api/minute-book/generate-item') && r.request().method() === 'POST',
    { timeout: 150_000 },
  );
  await page.getByRole('button', { name: /^Générer le document$/ }).click();

  const r = await reponse;
  expect(r.status(), 'la génération répond 200').toBe(200);
  const corps = await r.json();
  expect(corps.success, 'la génération se déclare réussie').toBe(true);
  const documentId: string = corps.documentId ?? corps.document?.id;
  expect(documentId, 'la réponse nomme le document créé').toBeTruthy();
  jalon('document généré');

  /* ⭐ CE QUE JE VIENS DE CRÉER PARAÎT — ET C'EST BIEN LUI.
     ⛔ Pas « un document de plus » : CELUI-LÀ, par son identifiant.
     ⚠️ La ligne ne porte AUCUN `href` — ses commandes sont des boutons, et le
     coffre ne met l'identifiant nulle part dans le balisage. L'identité se
     prouve donc par le GESTE : « Voir » demande le document au serveur, et
     c'est cette requête qui nomme l'identifiant. Un test qui se contenterait du
     titre passerait sur le document d'AVANT — le titre est le même à chaque
     passage. */
  const lienDuDocument = ligne.locator(`a[href*="${documentId}"]`);
  await expect(lienDuDocument, 'la ligne offre « Voir » SUR LE DOCUMENT CRÉÉ')
    .toBeVisible({ timeout: 60_000 });
  jalon('document visible dans sa ligne');

  /* ⚪ ET LE COFFRE LE PORTE AUSSI. ⛔ Ici l'identité ne peut PAS se lire : les
     lignes du coffre n'ont ni `href` ni identifiant dans le balisage, seulement
     des boutons (`DocumentRow.tsx:69` ouvre une fenêtre). Cette assertion-ci est
     donc plus faible que la précédente, et c'est dit : elle prouve la présence,
     pas l'identité. C'est la première qui tient le lot. */
  await page.goto('/fr/dashboard/minute-book/documents');
  await expect(page.getByText(EXIGENCE).first()).toBeVisible({ timeout: 60_000 });
  jalon('document listé au coffre');

  console.log('\n⏱️  JALONS (ms depuis le départ)');
  for (const [quoi, ms] of Object.entries(chrono)) console.log(`   ${String(ms).padStart(7)} — ${quoi}`);
});

/**
 * ⭐ LE CHEMIN SANS FENÊTRE — LOT T-3, ET C'EST LA CIBLE DE DOM.
 *
 * Un seul signataire : pas de choix à faire, donc AUCUNE fenêtre, et un seul
 * geste sépare le clic du document. T-1 n'éprouvait que l'autre branche —
 * celle qui demande de choisir — alors que c'est celle-ci que la PME à un
 * administrateur rencontrera.
 *
 * ⛔ ET LA PREUVE DE L'ABSENCE EST LE POST LUI-MÊME. Si une fenêtre s'ouvrait,
 * rien ne partirait avant un SECOND clic, que ce test ne fait pas : la réponse
 * ne viendrait jamais et le test échouerait. L'assertion `toHaveCount(0)` qui
 * suit ne fait que le dire tout haut.
 */
test('un seul signataire → aucune fenêtre, et le document paraît', async ({ page }) => {
  const depart = Date.now();

  await seConnecter(page);
  await page.goto('/fr/dashboard/minute-book/completeness');
  await expect(page.getByText(EXIGENCE_SOLO, { exact: true })).toBeVisible({ timeout: 60_000 });

  const ligne = ligneDe(page, EXIGENCE_SOLO);
  await expect(ligne.getByRole('button', { name: VERBE })).toHaveCount(1);

  const reponse = page.waitForResponse(
    (r) => r.url().includes('/api/minute-book/generate-item') && r.request().method() === 'POST',
    { timeout: 150_000 },
  );
  await ligne.getByRole('button', { name: VERBE }).click();

  const r = await reponse;
  expect(r.status(), 'la génération répond 200 — sans qu’on ait rien choisi').toBe(200);
  const corps = await r.json();
  expect(corps.success, 'la génération se déclare réussie').toBe(true);
  const documentId: string = corps.documentId ?? corps.document?.id;
  expect(documentId, 'la réponse nomme le document créé').toBeTruthy();

  await expect(
    page.getByRole('heading', { name: /^Signataires$/ }),
    'AUCUNE fenêtre ne s’est ouverte — un seul bloc ne se choisit pas',
  ).toHaveCount(0);

  await expect(
    ligne.locator(`a[href*="${documentId}"]`),
    'la ligne offre « Voir » SUR LE DOCUMENT CRÉÉ',
  ).toBeVisible({ timeout: 60_000 });

  console.log(`\n⏱️  chemin sans fenêtre : ${Date.now() - depart} ms`);
});
