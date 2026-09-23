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
 * compte global. Le titre, lui, est le MÊME à chaque passage : une assertion
 * sur le titre passerait sur le document d'avant.
 *
 * ⚖️ DEPUIS LE LOT T-4, IL DÉFAIT CE QU'IL A FAIT — par les gestes du produit.
 * ⛔ ET VOICI CE QU'IL ACCUMULE MALGRÉ TOUT, DÉCLARÉ PLUTÔT QUE TU :
 *   · 0 document, 0 objet au stockage — le parcours supprime le sien ;
 *   · 2 lignes de journal par parcours (`document_generated` puis
 *     `document_deleted`), soit QUATRE par exécution. Elles ne se défont pas,
 *     et elles ne doivent pas : le journal consigne ce qui a EU LIEU, et ces
 *     gestes ont eu lieu.
 *   · au rythme actuel — une exécution par déploiement, plus le filet
 *     quotidien — environ quatre lignes par jour dans la société de test.
 * ⚠️ RÉSIDU HISTORIQUE, NOMMÉ POUR NE PAS ÊTRE OUBLIÉ : dix documents `superseded`
 * datant d'avant T-4 restent en base. AUCUN geste du produit ne les atteint —
 * le coffre ne montre que l'actif —, et les effacer demanderait du SQL, que la
 * règle interdit. Ils sont donc là, comptés, et ils n'augmentent plus.
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

/** La ligne du coffre : son plus proche ancêtre qui porte « Supprimer ». */
function ligneDuCoffre(page: Page, exigence: string) {
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
async function supprimerDuCoffre(page: Page, exigence: string) {
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
async function remettreAZero(page: Page, exigence: string) {
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
async function completudeRedemande(page: Page, exigence: string) {
  await page.goto('/fr/dashboard/minute-book/completeness');
  const ligne = ligneDe(page, exigence);
  await expect(ligne.getByRole('button', { name: /^Générer$/ }))
    .toBeVisible({ timeout: 60_000 });
  await expect(
    ligne.getByRole('button', { name: /^Régénérer$/ }),
    'plus aucun document ne la couvre — le verbe est redevenu « Générer »',
  ).toHaveCount(0);
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

  /* ⭐ L'ÉTAT ATTENDU D'ABORD — règle de Dom. Un passage interrompu hier ne doit
     pas décider du verdict d'aujourd'hui. */
  await remettreAZero(page, EXIGENCE);
  jalon('état attendu');

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

  /* ⭐ ET LE PARCOURS DÉFAIT CE QU'IL A FAIT — LOT T-4. Sans cette fin, chaque
     passage laissait un PDF de plus ; avec elle, il ne laisse que deux lignes de
     journal, qui, elles, ne se défont pas et n'ont pas à se défaire. */
  await supprimerDuCoffre(page, EXIGENCE);
  jalon('document supprimé');

  /* ⛔ ET L'OBLIGATION REDEVIENT DUE. C'est la moitié qui compte : une
     suppression qui laisserait Complétude satisfaite cacherait un trou au
     livre — le client croirait son obligation couverte par un document qui
     n'existe plus. */
  await completudeRedemande(page, EXIGENCE);
  jalon('Complétude redemande');

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
  await remettreAZero(page, EXIGENCE_SOLO);

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

  /* ⭐ MÊME FIN, MÊME RAISON (T-4). */
  await supprimerDuCoffre(page, EXIGENCE_SOLO);
  await completudeRedemande(page, EXIGENCE_SOLO);

  console.log(`\n⏱️  chemin sans fenêtre : ${Date.now() - depart} ms`);
});
