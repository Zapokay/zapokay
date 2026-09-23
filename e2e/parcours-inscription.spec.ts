import { test, expect, type Page } from '@playwright/test';

/**
 * L'INSCRIPTION, DE BOUT EN BOUT — ET L'ONGLET FERMÉ AU MILIEU.
 *
 * ⚖️ LOT T-8, DOM, 2026-09-23. Compte SÉPARÉ, `zz-test-inscription@zapokay.com`.
 * ⛔ JAMAIS `zz-test-parcours@` : sa preuve d'isolement exige qu'il ne voie
 * qu'UNE société, et ce parcours-ci en crée une par passage.
 *
 * ⛔ AUCUNE CLÉ D'ADMINISTRATION, comme les autres : il s'inscrit par les gestes
 * du produit, et le NEQ qu'il choisit est vérifié libre PAR LE PRODUIT.
 *
 * ⚠️⚠️ ET IL NE SE REJOUE PAS SUR LE MÊME COMPTE — MESURÉ, PAS SUPPOSÉ.
 * `app/[locale]/onboarding/page.tsx:11` renvoie au tableau de bord dès que
 * `onboarding_completed` est vrai, et la seconde société est en liste d'attente
 * (`CompanySwitcher.tsx:114`, « Bientôt disponible »). Une fois ce parcours
 * passé, CE compte ne peut plus s'inscrire : il faudrait remettre le drapeau à
 * faux en base — ce que la règle interdit — ou un compte neuf.
 * ★ LA DERNIÈRE ASSERTION LE PROUVE plutôt que de le raconter.
 */

const BASE = process.env.E2E_BASE_URL ?? 'https://zapokay.vercel.app';

/** ⭐ Horodaté : deux passages ne peuvent pas se disputer un nom. */
const HORODATAGE = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const NOM = `ZZ-TEST Inscription ${HORODATAGE}`;

/** Le nom de l'administrateur, du seul actionnaire et du président. */
const PERSONNE = 'Alex Essai';

function identifiants() {
  const { E2E_INSCRIPTION_EMAIL, E2E_INSCRIPTION_PASSWORD } = process.env;
  if (!E2E_INSCRIPTION_EMAIL || !E2E_INSCRIPTION_PASSWORD) {
    throw new Error(
      'E2E_INSCRIPTION_EMAIL / E2E_INSCRIPTION_PASSWORD absents — ils vivent dans .env.test.local, hors dépôt.',
    );
  }
  return { courriel: E2E_INSCRIPTION_EMAIL, motDePasse: E2E_INSCRIPTION_PASSWORD };
}

async function seConnecter(page: Page) {
  const { courriel, motDePasse } = identifiants();
  await page.goto('/fr/login');
  await page.getByLabel(/adresse courriel/i).fill(courriel);
  await page.getByLabel(/mot de passe/i).fill(motDePasse);
  await page.getByRole('button', { name: /^se connecter$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 });
}

const continuer = async (page: Page) => {
  await page.getByRole('button', { name: /^(Continuer|Suivant)$/ }).first().click();
};

/**
 * UN NEQ LIBRE — et c'est LE PRODUIT qui le dit, pas une requête à la base.
 * ⛔ `/api/onboarding/check-identifier` est la garde que l'écran interroge déjà.
 * L'interroger ici prouve que le numéro est libre PAR LE MÊME CHEMIN que celui
 * qui refuserait un doublon — une vérification par un autre chemin ne dirait
 * rien de celui-là.
 */
async function neqLibre(page: Page): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidat = `11${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const reponse = await page.evaluate(async (valeur) => {
      const r = await fetch('/api/onboarding/check-identifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'neq', value: valeur }),
      });
      return (await r.json()) as { exists?: boolean };
    }, candidat);
    if (reponse.exists === false) return candidat;
  }
  throw new Error('neqLibre : cinq candidats de suite étaient pris — improbable, donc suspect.');
}

/** Les six étapes à champs, puis le sommaire. */
async function etapes1a7(page: Page, neq: string) {
  // ① la langue des documents
  await expect(page.getByRole('heading', { name: /Choisissez/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /^Français$/ }).click();
  await continuer(page);

  // ② la société
  await expect(page.getByRole('heading', { name: /^Votre entreprise$/ })).toBeVisible();

  /* ⛔⛔ UNE INSCRIPTION QUI COMMENCE NE TROUVE PAS DE SOCIÉTÉ DÉJÀ LÀ.
     ★ CETTE ASSERTION EST LA SENTINELLE DU LOT, ET SA PLACE EST CALCULÉE. Le
     champ arrive PRÉ-REMPLI quand le compte a déjà une société
     (`OnboardingFlow.tsx:152`, les initialiseurs lisent `existingCompany`).
     Si la garde par le registre tombait, on retomberait à l'étape 1 avec une
     société existante, et l'assistant se rejouerait jusqu'à l'étape 7 — où il
     écrirait une SECONDE ligne « Société inscrite ». Cette assertion arrête le
     test DEUX ÉTAPES AVANT cette écriture.
     ⚪ C'est aussi pour ça qu'elle est ici plutôt qu'à la fin : une assertion
     qui constate le doublon APRÈS coup le laisse d'abord se produire, dans une
     base qu'on n'a pas le droit de nettoyer. */
  await expect(
    page.getByPlaceholder('ex. 9453-2281 Québec Inc.'),
    '⛔ l’étape 2 arrive VIDE — sinon ce compte a déjà une société et l’assistant n’aurait jamais dû revenir ici',
  ).toHaveValue('');

  await page.getByPlaceholder('ex. 9453-2281 Québec Inc.').fill(NOM);
  await page.getByRole('button', { name: /Société constituée au Québec/ }).click();
  await page.getByPlaceholder('ex. 1234567890').fill(neq);
  await page.locator('input[type="date"]').first().fill('2023-05-10');
  const declaration = page.locator('input[type="checkbox"]').first();
  if (!(await declaration.isChecked())) await declaration.check();
  await continuer(page);

  // ③ le siège — c'est CETTE étape qui insère la société
  await expect(page.getByRole('heading', { name: /siège social/ })).toBeVisible();
  await page.getByLabel(/^Adresse \*/).fill('100, rue de l’Essai');
  await page.getByLabel(/^Ville \*/).fill('Montréal');
  await page.getByLabel(/^Code postal \*/).fill('H2X 1Y4');
  await page.getByLabel(/^Pays \*/).selectOption('CA');
  /* ⚪ Le pays choisi, le champ CHANGE DE NOM : « État / région / province »
     devient « Province ». On accepte les deux plutôt que de parier. */
  await page.getByLabel(/^Province \*|État \/ région \/ province \*/).selectOption('QC');
  await continuer(page);

  // ④ les administrateurs
  await expect(page.getByRole('heading', { name: /administrateurs/ })).toBeVisible({ timeout: 60_000 });
  await page.getByPlaceholder('Jean-Philippe Roussy').first().fill(PERSONNE);
  await page.locator('input[type="date"]').first().fill('2023-05-10');
  await page.getByPlaceholder('123, rue Principale').first().fill('100, rue de l’Essai');
  await page.getByLabel(/^Ville\*/).first().fill('Montréal');
  await page.getByLabel(/^Code postal$/).first().fill('H2X 1Y4');
  await page.getByLabel(/^Pays\*/).first().selectOption('CA');
  await page.getByLabel(/province/i).first().selectOption('QC');
  await continuer(page);

  // ⑤ les actionnaires — nom, nombre et prix arrivent déjà remplis de l'étape 4
  await expect(page.getByRole('heading', { name: /détient des actions/ })).toBeVisible({ timeout: 60_000 });
  await page.locator('input[type="date"]').first().fill('2023-05-10');
  await page.getByPlaceholder('123, rue Principale').first().fill('100, rue de l’Essai');
  await page.getByLabel(/^Ville\*/).first().fill('Montréal');
  await page.getByLabel(/^Code postal$/).first().fill('H2X 1Y4');
  await page.getByLabel(/^Pays\*/).first().selectOption('CA');
  await page.getByLabel(/province/i).first().selectOption('QC');
  await continuer(page);

  // ⑥ les dirigeants — président et secrétaire arrivent pourvus
  await expect(page.getByRole('heading', { name: /Les dirigeants/ })).toBeVisible({ timeout: 60_000 });
  await continuer(page);

  // ⑦ le sommaire — c'est lui qui écrit la ligne de registre
  await expect(page.getByRole('heading', { name: /est prête/ })).toBeVisible({ timeout: 60_000 });
  await continuer(page);
}

test('les huit étapes, l’onglet fermé à la huitième, et une seule ligne au registre', async ({
  page,
  browser,
}) => {
  const depart = Date.now();
  const chrono: Record<string, number> = {};
  const jalon = (quoi: string) => { chrono[quoi] = Date.now() - depart; };

  await seConnecter(page);
  jalon('connexion');

  /* ⭐ L'ÉTAT ATTENDU — RÈGLE DE DOM, APPLIQUÉE À CE QUI NE SE DÉFAIT PAS.
     Les autres parcours remettent la société à zéro ; une INSCRIPTION ne se
     défait pas. Le test lit donc où en est le compte et le DIT :
       · l'assistant à l'étape 1 → le parcours complet ;
       · la page des exercices → un passage précédent s'est arrêté là, on
         reprend (c'est exactement ce que le produit promet) ;
       · le tableau de bord → ⛔ ce compte est ÉPUISÉ. Il ne peut plus
         s'inscrire, et un test qui continuerait ne prouverait plus rien. */
  await page.goto('/fr/onboarding');
  await page.waitForLoadState('networkidle');
  const ou = new URL(page.url()).pathname;

  if (ou.includes('/dashboard')) {
    throw new Error(
      `Compte ÉPUISÉ : ${identifiants().courriel} est déjà inscrit, et le produit ` +
      'ne permet ni de recommencer ni de créer une seconde société (liste ' +
      'd’attente). Ce parcours exige un compte NEUF — voir l’en-tête du fichier.',
    );
  }

  if (!ou.includes('/fiscal-years')) {
    const neq = await neqLibre(page);
    await etapes1a7(page, neq);
    console.log(`\n⚪ SOCIÉTÉ CRÉÉE : ${NOM} (NEQ ${neq})`);
  } else {
    console.log('\n⚪ REPRISE : un passage précédent s’était arrêté à l’étape 8.');
  }
  jalon('sept étapes');

  // ── L'ÉTAPE 8 ────────────────────────────────────────────────────────────
  await page.waitForURL(/\/onboarding\/fiscal-years/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /Quels exercices/ })).toBeVisible();

  /* ⭐ « PASSER » N'EXISTE PLUS — lot EX. C'est la moitié visible de la décision :
     l'étape 8 est obligatoire. */
  await expect(
    page.getByRole('button', { name: /^(Passer|Skip)$/ }),
    '⛔ aucune sortie « Passer » — l’étape 8 est obligatoire',
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Terminer$/ })).toBeVisible();

  /* ⭐ ET L'INSCRIPTION N'EST PAS FINIE : le tableau de bord nous RENVOIE ici.
     C'est l'autre moitié, celle qu'on ne voit pas sur l'écran. */
  await page.goto('/fr/dashboard');
  await page.waitForURL(/\/onboarding\/fiscal-years/, { timeout: 60_000 });
  jalon('étape 8 atteinte, et elle retient');

  // ── ⛔ LE CAS QUI MENACE LA GARANTIE ─────────────────────────────────────
  // Le brouillon vit en `sessionStorage` : fermer le contexte le TUE, comme
  // fermer l'onglet. C'est exactement la manœuvre qui, sans la garde par le
  // registre, ramènerait à l'étape 1 et écrirait une SECONDE ligne.
  const contexte = await browser.newContext({
    baseURL: BASE, locale: 'fr-CA', timezoneId: 'America/Toronto',
  });
  const page2 = await contexte.newPage();
  await seConnecter(page2);

  await page2.waitForURL(/\/onboarding\/fiscal-years/, { timeout: 60_000 });
  await expect(
    page2.getByRole('heading', { name: /Choisissez/ }),
    '⛔ on ne retombe PAS à l’étape 1 — la ligne de registre garde l’assistant',
  ).toHaveCount(0);
  await expect(page2.getByRole('heading', { name: /Quels exercices/ })).toBeVisible();
  jalon('onglet fermé, retour à l’étape 8');

  // ── FINIR ────────────────────────────────────────────────────────────────
  await page2.getByRole('button', { name: /^Tout sélectionner$/ }).click();
  await page2.getByRole('button', { name: /^Terminer$/ }).click();
  await page2.waitForURL(/\/dashboard(?!\/)/, { timeout: 90_000 });
  await expect(page2.getByRole('heading', { name: /^Tableau de bord$/ })).toBeVisible({ timeout: 60_000 });
  jalon('inscription terminée');

  // ── ⭐ EXACTEMENT UNE LIGNE AU REGISTRE ──────────────────────────────────
  // `titresDeJournalInscription` compose « Société inscrite : <nom> ». Le nom
  // est horodaté, donc cette recherche ne peut ramener que CETTE inscription —
  // pas celle d'un passage précédent.
  await page2.goto('/fr/dashboard/activity');
  /* ⛔ UNE SEULE, ET C'EST TOUT LE LOT. Deux lignes voudraient dire que
     l'assistant a été rejoué après la fermeture de l'onglet.
     ⚪ La recherche porte sur « Société inscrite », pas sur le nom : en REPRISE,
     le nom vient du passage précédent et ce test ne le connaît pas. Le compte
     est neuf à chaque inscription, donc une ligne de ce type ⇒ une inscription. */
  await expect(
    page2.getByText(/^Société inscrite :/),
    '⛔ EXACTEMENT une ligne « Société inscrite » — l’assistant n’a pas été rejoué',
  ).toHaveCount(1, { timeout: 60_000 });
  jalon('une seule ligne « Société inscrite »');

  /* ⚠️⚠️ ET LA LIMITE DU PARCOURS, PROUVÉE PLUTÔT QUE RACONTÉE : ce compte ne
     peut plus s'inscrire. L'assistant renvoie au tableau de bord. Un second
     passage sur ce compte ne testerait donc RIEN — il faut un compte neuf. */
  await page2.goto('/fr/onboarding');
  await page2.waitForURL(/\/dashboard(?!\/)/, { timeout: 60_000 });

  await contexte.close();

  console.log('\n⏱️  JALONS (ms depuis le départ)');
  for (const [quoi, ms] of Object.entries(chrono)) console.log(`   ${String(ms).padStart(7)} — ${quoi}`);
});
