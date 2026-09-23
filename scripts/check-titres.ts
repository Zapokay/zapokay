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
/**
 * ★ TROISIÈME FORME, AJOUTÉE LE 2026-09-16 : `=== 'president'`.
 * Une table peut s'écrire en TERNAIRE plutôt qu'en objet, et celle-là
 * échappait — mesuré sur `StepOfficers`, qui portait les trois libellés en dur
 * et divergeait du catalogue sur le trésorier. Un code COMPARÉ à un littéral
 * est aussi ancré que `value: 'code'` : c'est une valeur de l'union, pas un
 * mot dans une phrase.
 * ⛔ ET RIEN DE PLUS LARGE. La prose de l'état vide — « Officers (president,
 * secretary, treasurer) manage… » — n'a ni deux-points, ni `value:`, ni
 * `===`, et l'auto-test l'AFFIRME au lieu de l'espérer.
 */
const CODES =
  /^\s*(president|vice_president|secretary|treasurer|director_general)\s*:|value:\s*'(president|vice_president|secretary|treasurer)'|===\s*'(president|vice_president|secretary|treasurer)'/;

/**
 * ⚠️ UNE CLÉ DE CATALOGUE N'EST PAS UN LIBELLÉ, et c'est toute la finesse de ce
 * script. `'officers.titles.president'` contient le mot « president » : un
 * motif naïf accuserait la déclaration canonique elle-même. Un texte humain se
 * reconnaît à ce qu'il N'EST PAS un chemin pointé.
 */
const CLE_POINTEE = /^[a-z][a-zA-Z]*(\.[a-zA-Z_]+)+$/;
/**
 * ⚠️ LE CODE N'EST PAS SON PROPRE LIBELLÉ, et il a fallu le dire. La troisième
 * forme (`=== 'president'`) amène le CODE dans la fenêtre comme littéral de
 * chaîne — et `MOTS_HUMAINS`, insensible à la casse, y reconnaissait
 * « president ». Une comparaison nue, sans aucun libellé autour, levait donc.
 * ★ C'EST LE CONTRÔLE NÉGATIF QUI L'A TROUVÉ, au premier lancement. Sans lui
 * la garde rendait rouge pour la mauvaise raison, ce qui use une garde aussi
 * sûrement qu'un faux vert.
 * ⚪ ANCRÉ ET SENSIBLE À LA CASSE : « President », le libellé anglais, n'est PAS
 * filtré — seule la valeur exacte de l'union l'est.
 */
const CODE_NU = /^(president|vice_president|secretary|treasurer|director_general)$/;
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
      (s) => MOTS_HUMAINS.test(s) && !CLE_POINTEE.test(s) && !CODE_NU.test(s),
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
 * ⛔ ZÉRO EXCEPTION, ET C'EST NEUF — 2026-09-16.
 *
 * Deux fichiers étaient tolérés ici : `AddOfficerModal` et `RemoveOfficerModal`.
 * La raison écrite disait qu'ils composent `activity_log.title_fr` ET `title_en`
 * au même geste, et qu'« un composant client ne détient qu'UN catalogue ».
 *
 * ⛔ CETTE RAISON ÉTAIT FAUSSE, ET ELLE A COÛTÉ. Elle est vraie de
 * `useTranslations`, pas du dépôt : `lib/i18n/lifecycle-labels.ts` importe LES
 * DEUX catalogues et est consommé par un composant CLIENT. La limite invoquée
 * n'existait pas. Pendant qu'elle tenait, l'exemption a couvert deux tables qui
 * ont REDIVERGÉ du catalogue le jour même — et un côté anglais qui écrivait
 * `${title}`, LE CODE, dans quatre lignes de journal du parc.
 *
 * ★ CE QUI A REMPLACÉ L'EXCEPTION : `lib/i18n/catalogue-langue.ts` nomme la
 * capacité qui existait déjà (un résolveur lié à une LANGUE CHOISIE), et
 * `lib/journal-charge.ts` compose les deux titres d'un seul geste, en fonction
 * PURE — donc vérifiable, ce qu'une modale ne sera jamais.
 *
 * ⚠️ SI UNE EXCEPTION REVIENT ICI, QU'ELLE PORTE UNE LIMITE MESURÉE, pas une
 * limite supposée. Celle-ci a survécu à sa propre fausseté parce que personne ne
 * la remesurait.
 */
const TOLERES = new Map<string, string>([]);
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
  /** La forme que StepOfficers portait — une table écrite en TERNAIRE. */
  const TERNAIRE = `const label =
  poste === 'president' ? (fr ? 'Président·e' : 'President')
  : poste === 'secretary' ? (fr ? 'Secrétaire' : 'Secretary')
  : (fr ? 'Trésorier·ière' : 'Treasurer');`;
  /* ⛔ TROIS NÉGATIFS — un motif élargi doit prouver qu'il n'a pas élargi TROP.
     Sans eux, la troisième forme pourrait accuser de la prose : on exempterait
     le fichier, et l'exemption couvrirait ensuite une vraie table. */
  const PROSE = `// Officers (president, secretary, treasurer) manage the day-to-day operations.`;
  const COMPARAISON_NUE = `if (poste === 'president') return null;`;
  const TEXTE_SANS_CODE = `const titre = 'Président·e de la séance';`;

  dire(recenser(TABLE_FR_EN, 'x').length > 0, 'table fr/en          → vue');
  dire(recenser(TABLE_FR_SEULE, 'x').length > 0, 'table FR seule       → vue');
  dire(recenser(OPTIONS, 'x').length > 0, "liste d'options      → vue");
  dire(recenser(DECLARATION_DE_CLES, 'x').length === 0, 'déclaration de CLÉS  → ignorée (ce sont des clés, pas des libellés)');
  dire(recenser(APPEL, 'x').length === 0, 'appel à libelleTitre → ignoré');
  dire(recenser(TERNAIRE, 'x').length > 0, 'table en TERNAIRE    → vue   (la forme de StepOfficers)');
  dire(recenser(PROSE, 'x').length === 0, 'prose état vide      → IGNORÉE (négatif)');
  dire(recenser(COMPARAISON_NUE, 'x').length === 0, 'comparaison sans libellé → IGNORÉE (négatif)');
  dire(recenser(TEXTE_SANS_CODE, 'x').length === 0, 'libellé sans code    → IGNORÉ (négatif)');
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

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LES FORMES INCLUSIVES — lot AH, 2026-09-22.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⛔ CETTE GARDE ÉTAIT VERTE SUR « Trésorier·ière ». Elle vérifiait D'OÙ vient
 * un libellé de titre — la déclaration unique — jamais COMMENT il est écrit.
 * Une faute de forme passait donc indéfiniment, et elle est passée.
 *
 * ★ LA RÈGLE EST DÉRIVÉE, PAS RECOPIÉE. Une forme inclusive s'obtient du
 * masculin et du féminin : le masculin ENTIER, un point médian, puis ce que le
 * féminin ajoute À PARTIR DU POINT OÙ LES DEUX DIVERGENT.
 *   Président / Présidente          → Président·e
 *   Trésorier / Trésorière          → Trésorier·ère  (divergence après « Trésori »)
 *   Administrateur / Administratrice → Administrateur·rice
 * ⛔ « Trésorier·ière » recollait « ièr » sur une racine finissant déjà par
 * « ier » : le féminin reconstitué aurait été « Trésorierière ».
 *
 * ⚠️ LE COUPLE EST DÉCLARÉ ICI, ET C'EST ASSUMÉ : c'est une donnée de LANGUE,
 * pas d'application. Un mot inconnu fait ÉCHOUER la garde — elle ne devine
 * aucun féminin, et elle ne se tait pas non plus.
 */
const FEMININS = new Map<string, string>([
  ['Président', 'Présidente'],
  ['Vice-président', 'Vice-présidente'],
  ['Trésorier', 'Trésorière'],
  ['Secrétaire', 'Secrétaire'],
  ['Administrateur', 'Administratrice'],
  ['Dirigeant', 'Dirigeante'],
  ['Nommé', 'Nommée'],
  ['Retiré', 'Retirée'],
]);

/** La forme attendue, DÉRIVÉE du couple — aucune table de formes toutes faites. */
function formeInclusive(masculin: string, feminin: string): string {
  let i = 0;
  while (i < masculin.length && i < feminin.length && masculin[i] === feminin[i]) i += 1;
  return `${masculin}·${feminin.slice(i)}`;
}

/** Des lettres, un point médian, des lettres — jamais un séparateur « · ». */
const FORME_INCLUSIVE = /([A-Za-zÀ-ÿ-]+)·([A-Za-zÀ-ÿ]+)/g;

function verifierFormesInclusives(): boolean {
  console.log('\n━━ LES FORMES INCLUSIVES DU CATALOGUE ━━');
  let bon = true;
  let vues = 0;
  for (const langue of ['fr', 'en']) {
    const plat: Record<string, string> = {};
    const aplatir = (o: Record<string, unknown>, p = '') => {
      for (const [k, v] of Object.entries(o)) {
        const q = p ? `${p}.${k}` : k;
        if (v && typeof v === 'object') aplatir(v as Record<string, unknown>, q);
        else if (typeof v === 'string') plat[q] = v;
      }
    };
    aplatir(JSON.parse(readFileSync(join(RACINE, 'messages', `${langue}.json`), 'utf8')));
    for (const [cle, valeur] of Object.entries(plat)) {
      FORME_INCLUSIVE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = FORME_INCLUSIVE.exec(valeur)) !== null) {
        const forme = m[0];
        const racine = m[1];
        const suffixe = m[2];
        vues += 1;
        const feminin = FEMININS.get(racine);
        if (feminin === undefined) {
          console.log(`  ⛔ ${langue}.${cle} — « ${forme} » : féminin de « ${racine} » INCONNU.`);
          console.log('     Ajoute le couple à FEMININS ; la garde ne devine pas.');
          bon = false;
          continue;
        }
        const attendue = formeInclusive(racine, feminin);
        if (forme !== attendue) {
          console.log(`  ⛔ ${langue}.${cle} — « ${forme} » devrait s'écrire « ${attendue} »`);
          console.log(`     (${racine} / ${feminin} — le féminin reconstitué serait « ${racine}${suffixe} »)`);
          bon = false;
        }
      }
    }
  }
  console.log(`  ${bon ? '✔' : '⛔'} ${vues} forme(s) inclusive(s), dérivée(s) de leur couple`);
  return bon;
}

function main(): void {
  if (!verifierFormesInclusives()) process.exitCode = 1;
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
  console.log('  useResolveurCatalogue au client sur la locale de l\'URL, et');
  console.log('  resolveurDeLangue(langue) quand la langue est CHOISIE — journal, document,');
  console.log('  inscription. La déclaration est lib/officer-titles.ts.');
  process.exitCode = 1;
}

main();
