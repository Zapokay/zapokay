import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';

/**
 * LE PARCOURS, CONTRE LE PRODUIT DÉPLOYÉ.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-23 (lot T-1) : les tests roulent sur la MÊME base
 * que la production, avec un compte dédié et UNE société, « ZZ-TEST Parcours
 * inc. ». Ce n'est pas un compromis de confort : un test sur une base jouet
 * prouve que le code marche sur une base jouet.
 *
 * ⛔ AUCUNE CLÉ D'ADMINISTRATION ICI NI DANS AUCUN TEST. Le test se connecte par
 * MOT DE PASSE, comme un client, et ne voit donc QUE ce que la RLS lui laisse
 * voir. C'est ce qui rend le parcours sûr : la seule brèche de l'isolement est
 * `service_role`, et un test qui ne la porte pas ne peut pas l'ouvrir.
 *
 * ⛔ LES IDENTIFIANTS VIENNENT DE `.env.test.local`, que `.gitignore` couvre.
 * Absent → les tests échouent en le DISANT, ils ne s'ignorent pas en silence :
 * un test vert parce qu'il n'a pas tourné est pire qu'un test rouge.
 */
/**
 * ⚪ LU À LA MAIN, SANS `dotenv`. Le dépôt ne le porte pas, et ajouter une
 * dépendance pour trois lignes d'analyse serait payer un paquet pour une
 * boucle `for`. ⛔ Les valeurs déjà présentes dans l'environnement GAGNENT —
 * c'est ce qui laissera une CI fournir les siennes sans toucher à ce fichier.
 */
for (const chemin of ['.env.test.local']) {
  if (!existsSync(chemin)) continue;
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    if (!ligne.includes('=') || ligne.trim().startsWith('#')) continue;
    const i = ligne.indexOf('=');
    const cle = ligne.slice(0, i).trim();
    if (process.env[cle] === undefined) {
      process.env[cle] = ligne.slice(i + 1).trim().replace(/^"|"$/g, '');
    }
  }
}

export default defineConfig({
  testDir: './e2e',
  /* ⚠️ UN SEUL FIL, ET LA RAISON A GRANDI AVEC T-4. Deux parcours simultanés
     ne se disputaient que la génération ; ils se disputent maintenant la
     SUPPRESSION — l'un effacerait le document que l'autre vient de créer, et
     le rouge qui s'ensuivrait ne dirait rien du produit. */
  workers: 1,
  fullyParallel: false,
  /* ⛔ AUCUNE REPRISE. Un test qui passe au deuxième essai a échoué au premier,
     et une reprise silencieuse cacherait exactement la lenteur qu'on veut voir.
     ⚪ L'argument « une reprise laisse un document de plus » est tombé avec
     T-4 : chaque passage commence par remettre la société dans l'état attendu.
     Ce qui reste — une reprise MENT sur la stabilité — suffit à lui seul. */
  retries: 0,
  timeout: 180_000,
  /* ⭐ DEUX RAPPORTS, ET LE SECOND EST POUR DOM (W-3). `list` écrit dans le
     terminal ; `html` écrit `playwright-report/index.html`, qu'on ouvre d'un
     clic après l'avoir téléchargé du run en échec — capture, pas-à-pas et
     trace dedans. ⛔ `open: 'never'` : sans lui, une exécution locale en échec
     ouvre un navigateur et BLOQUE la CI en attendant qu'on le ferme. */
  reporter: [['list'], ['html', { open: 'never' }]],
  /**
   * ⛔ DEUX PROJETS, ET C'EST UNE RÉPARATION — pas un raffinement.
   *
   * ⚠️ LA FAUTE, ÉCRITE POUR NE PAS ÊTRE REFAITE : `npm run e2e` lançait TOUT
   * `e2e/`, et le jour où le parcours d'inscription y est entré, la CI l'a
   * lancé sans ses secrets — un rouge qui ne disait rien du produit, exactement
   * ce que W-1 venait de fermer ailleurs. Ajouter un fichier ne doit pas
   * pouvoir casser une chaîne qui ne le demande pas.
   *
   *   · `deploiement` — ce qui roule après chaque déploiement et chaque nuit.
   *     Répétable à l'infini : il défait ce qu'il fait (lot T-4).
   *   · `inscription` — UNE FOIS PAR COMPTE, à la main. Il crée une société et
   *     ne peut pas se rejouer : le compte se referme derrière lui.
   */
  projects: [
    {
      name: 'deploiement',
      testIgnore: /parcours-(inscription|actes)\.spec\.ts/,
    },
    {
      name: 'inscription',
      testMatch: /parcours-inscription\.spec\.ts/,
    },
    {
      /* Les deux ACTES, sur la société jetable de l'inscription. Répétables —
         ils dérivent la société à chaque passage, et c'est assumé. */
      name: 'actes',
      testMatch: /parcours-actes\.spec\.ts/,
    },
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://zapokay.vercel.app',
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
