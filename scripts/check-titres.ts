/**
 * RECENSEMENT DES TABLES DE LIBELLÉS DE TITRES DE CHARGE — combien en
 * reste-t-il, et sont-ce celles qu'on accepte ?
 *
 * Run via:
 *   npm run check:titres                 → recense, rc=1 s'il en trouve une hors liste
 *   npm run check:titres -- --self-test  → vérifie l'OUTIL, ne recense pas
 *
 * ── POURQUOI CE SCRIPT EXISTE, À CÔTÉ DE LA RÈGLE ESLINT ────────────────────
 * ⛔ UN `Record` EXHAUSTIF FORCE LA COMPLÉTUDE D'UNE TABLE, JAMAIS SON UNICITÉ.
 * `CLE_TITRE` fait échouer la compilation si un cinquième titre arrive sans sa
 * clé — et n'empêche personne d'écrire un littéral neuf dans un autre fichier.
 * C'est exactement ce qui s'est produit : le dépôt a porté TREIZE tables dans
 * onze fichiers, toutes en désaccord, pendant que le type tenait.
 *
 * ★ LA RÈGLE ESLINT ATTRAPE LA FORME, CE SCRIPT AFFIRME LE COMPTE. Les deux
 * sont nécessaires et ne voient pas la même chose :
 *   · la règle lit un AST — aveugle à une table construite autrement
 *     (`Object.fromEntries`, concaténation, clé calculée), et une ligne
 *     `// eslint-disable-next-line` la tait ;
 *   · ce script lit du TEXTE — il voit ces formes-là, et il est aveugle là où
 *     un dépouilleur se trompe (§300 : un octet NUL ; §302 : un motif trop
 *     étroit). Il dit COMBIEN, et OÙ.
 *
 * ⛔ NI CI NI CROCHET DANS CE DÉPÔT — mesuré le 2026-09-12 : pas de
 * `.github/workflows`, pas de husky. Cette garde est donc une DISCIPLINE, à
 * lancer à côté de `tsc`, comme `check:glyphs` l'assume déjà de lui-même.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = process.cwd();
const ARBRES = ['app', 'components', 'lib', 'scripts'];

/* ═══════════════════════════════════════════════════════════════════════════
   1. CE QU'ON CHERCHE — un code de titre associé à un TEXTE HUMAIN
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Les cinq valeurs du CHECK de `officer_appointments`, plus la disparue.
 *
 * ⚠️ LE CODE DOIT ÊTRE UNE CLÉ DE PROPRIÉTÉ, PAS UN MOT DANS UNE PHRASE. Une
 * première version acceptait « code suivi d'une virgule » et accusait la prose
 * de l'état vide des dirigeants — « Officers (president, secretary, treasurer)
 * manage the day-to-day operations ». Un faux positif use la garde : on finit
 * par exempter le fichier, et l'exemption couvre alors une vraie table.
 */
const CODES = /^\s*(president|vice_president|secretary|treasurer|director_general)\s*:|value:\s*'(president|vice_president|secretary|treasurer)'/;

/**
 * ⚠️ UNE CLÉ DE CATALOGUE N'EST PAS UN LIBELLÉ, et c'est toute la finesse de ce
 * script. `'officers.titles.president'` contient le mot « president » : un
 * motif naïf accuserait la déclaration canonique elle-même. Un texte humain se
 * reconnaît à ce qu'il N'EST PAS un chemin pointé.
 */
const CLE_POINTEE = /^[a-z][a-zA-Z]*(\.[a-zA-Z_]+)+$/;
const MOTS_HUMAINS = /(?:Pr[ée]sident|Secr[ée]taire|Tr[ée]sorier|Vice[- ]?pr[ée]sident|President|Treasurer|Secretary|Directeur|Fiduciaire|Trustee)/i;

/** Les littéraux de chaîne d'une ligne, quel que soit le délimiteur. */
function chaines(ligne: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(ligne.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}

interface Trouvaille { fichier: string; ligne: number; extrait: string }

function recenser(texte: string, fichier: string): Trouvaille[] {
  const trouvailles: Trouvaille[] = [];
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!CODES.test(l)) continue;
    // Le libellé peut vivre sur la ligne du code ou juste après.
    const fenetre = lignes.slice(i, i + 3).join('\n');
    const humains = chaines(fenetre).filter(
      (s) => MOTS_HUMAINS.test(s) && !CLE_POINTEE.test(s),
    );
    if (humains.length === 0) continue;
    trouvailles.push({ fichier, ligne: i + 1, extrait: humains[0].slice(0, 40) });
  }
  return trouvailles;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CE QU'ON ACCEPTE — et chaque entrée porte SA raison
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔⛔ DEUX EXCEPTIONS, ET CE N'EST PAS UNE DETTE À SOLDER. Lis ceci avant de
 * les retirer — les retirer RÉINTRODUIRAIT un défaut, il n'en corrigerait
 * aucun.
 *
 * Ces deux fichiers composent la ligne d'Historique (`activity_log.title_fr`
 * ET `title_en`), qui stocke du TEXTE RENDU, dans LES DEUX LANGUES, au moment
 * de l'écriture. Leur table française doit donc être INDÉPENDANTE DE LA LOCALE
 * D'INTERFACE — et c'est précisément ce qu'une lecture de catalogue ne peut pas
 * être depuis un composant client : `i18n/request.ts:11` n'importe qu'UN
 * catalogue (`messages/${locale}.json`) et `app/[locale]/layout.tsx:24,37` ne
 * passe que celui-là au fournisseur. Le client ne DÉTIENT qu'une langue.
 *
 * ⛔ Conséquence concrète : migrer la ligne française vers `libelleTitre` ferait
 * écrire « Treasurer » dans `title_fr` dès qu'un utilisateur travaille en
 * anglais. Ce n'est pas une table oubliée : c'est la seule forme qui tienne
 * tant que le journal stocke du texte rendu.
 *
 * ⚪ CE QUI LÈVERAIT VRAIMENT L'EXCEPTION : que le journal cesse de stocker du
 * texte rendu (une clé + ses paramètres), ou que l'écriture passe au serveur,
 * qui détient les deux catalogues. Tant que ni l'un ni l'autre n'est fait, ces
 * deux lignes restent — et elles restent JUSTES.
 */
const TOLERES = new Map<string, string>([
  [
    'components/officers/AddOfficerModal.tsx',
    "journal bilingue — indépendant de la locale PAR CONSTRUCTION ; le client ne détient qu'un catalogue (2026-09-12)",
  ],
  [
    'components/officers/RemoveOfficerModal.tsx',
    "journal bilingue — indépendant de la locale PAR CONSTRUCTION ; le client ne détient qu'un catalogue (2026-09-12)",
  ],
]);

/* ═══════════════════════════════════════════════════════════════════════════
   3. L'AUTO-TEST — ce script a-t-il le droit de dire « une seule » ?
   ═══════════════════════════════════════════════════════════════════════════ */

function autoTest(): boolean {
  let ok = true;
  const dire = (bon: boolean, quoi: string) => {
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };

  const TABLE_FR_EN = `const T: Record<string, { fr: string; en: string }> = {
  president: { fr: 'Président·e', en: 'President' },
  treasurer: { fr: 'Trésorier·ière', en: 'Treasurer' },
};`;
  const TABLE_FR_SEULE = `const m: Record<string, string> = {
  president: 'Président·e',
  treasurer: 'Trésorier·ère',
};`;
  const OPTIONS = `const O = [{ value: 'president', fr: 'Président·e', en: 'President' }];`;
  const DECLARATION_DE_CLES = `export const CLE_TITRE = {
  president: 'officers.titles.president',
  treasurer: 'officers.titles.treasurer',
};`;
  const APPEL = `const l = libelleTitre(charge, tCatalogue);`;

  dire(recenser(TABLE_FR_EN, 'x').length > 0, 'table fr/en          → vue');
  dire(recenser(TABLE_FR_SEULE, 'x').length > 0, 'table FR seule       → vue');
  dire(recenser(OPTIONS, 'x').length > 0, "liste d'options      → vue");
  dire(recenser(DECLARATION_DE_CLES, 'x').length === 0, 'déclaration de CLÉS  → ignorée (ce sont des clés, pas des libellés)');
  dire(recenser(APPEL, 'x').length === 0, 'appel à libelleTitre → ignoré');
  return ok;
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. LE BALAYAGE
   ═══════════════════════════════════════════════════════════════════════════ */

function fichiers(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === 'node_modules' || nom.startsWith('.')) continue;
      fichiers(p, out);
    } else if (/\.tsx?$/.test(nom)) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  console.log("AUTO-TEST — ce script a-t-il le droit de dire « une seule » ?");
  const sain = autoTest();
  console.log(
    sain
      ? "  → l'outil est vérifié ; il a le droit de conclure.\n"
      : "  → ⛔ L'OUTIL EST CASSÉ. Sa conclusion ne vaudrait rien ; il se tait.\n",
  );
  if (!sain) {
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--self-test')) {
    console.log("--self-test : l'outil est vérifié, le recensement n'est pas lancé.");
    return;
  }

  const tous: string[] = [];
  for (const arbre of ARBRES) tous.push(...fichiers(join(RACINE, arbre)));

  const hors: Trouvaille[] = [];
  const tolerees: Trouvaille[] = [];
  for (const p of tous) {
    const rel = relative(RACINE, p);
    if (rel === 'scripts/check-titres.ts') continue; // ses propres cas d'auto-test
    const t = recenser(readFileSync(p, 'utf8'), rel);
    if (t.length === 0) continue;
    (TOLERES.has(rel) ? tolerees : hors).push(...t);
  }

  console.log(`RECENSEMENT — ${tous.length} fichiers balayés`);
  for (const [f, raison] of Array.from(TOLERES)) {
    const n = tolerees.filter((t) => t.fichier === f).length;
    console.log(`  ⚪ EXCEPTION DOCUMENTÉE : ${f} (${n} ligne(s))`);
    console.log(`     ${raison}`);
  }
  if (hors.length === 0) {
    console.log(
      `  ✔ UNE DÉCLARATION + ${TOLERES.size} EXCEPTIONS DOCUMENTÉES, ET RIEN D'AUTRE.`,
    );
    console.log('    La déclaration est lib/officer-titles.ts (CLE_TITRE).');
    console.log("    ⛔ Ce script n'affirme PAS « une seule table » : il affirme que");
    console.log("    toute table hors des exceptions ci-dessus est un défaut.");
    return;
  }
  console.log(`  ⛔ ${hors.length} libellé(s) de titre hors de la déclaration unique :`);
  for (const t of hors) console.log(`      ${t.fichier}:${t.ligne}  « ${t.extrait} »`);
  console.log('\n  Résous par libelleTitre() : getServerMessage au serveur,');
  console.log('  useResolveurCatalogue au client. La déclaration est lib/officer-titles.ts.');
  process.exitCode = 1;
}

main();
