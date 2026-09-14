/**
 * LE SOCLE DU REGISTRE DES PARTICULIERS AYANT UN CONTRÔLE IMPORTANT EST INERTE — et cette garde
 * le fait expirer.
 *
 * Run via:
 *   npm run check:significant-control                 → rc=1 dès qu'un fichier applicatif branche le socle
 *   npm run check:significant-control -- --self-test  → vérifie l'OUTIL, ne lit pas le dépôt
 *
 * ── LA DÉCISION ─────────────────────────────────────────────────────────────
 * 2026-09-14 : deux tables sont déclarées en base SANS SURFACE —
 * significant_control_individuals (Partie A) et significant_control_diligence_steps
 * (Partie B). Trois champs exigés par l'art. 21.1(1) LCSA attendent la réponse de l'avocat
 * sur leur forme. Une déclaration que personne ne lit est déjà un item de file
 * (company_active_years, companies.active_fiscal_year) : celle-ci porte son fil de rappel.
 *
 * ── CE QUE CE SCRIPT AFFIRME ────────────────────────────────────────────────
 *   · LE SOCLE EST DÉCLARÉ : chacune des deux tables figure dans un CREATE TABLE des
 *     migrations. Sans ce contrôle, un renommage ferait passer la garde à vide ;
 *   · AUCUN LECTEUR NI ÉCRIVAIN : aucun fichier de app/, components/, lib/ ni middleware.ts
 *     ne porte une chaîne qui nomme l'une des deux tables — lecture de l'arbre syntaxique,
 *     un commentaire ne compte pas ;
 *   · AUCUN IMPORT du module lib/supabase/significant-control-types, statique ou dynamique ;
 *   · LES UNIONS DISENT CE QUE DISENT LES CHECK : les valeurs de chaque CHECK nommée de la
 *     migration sont EXACTEMENT les membres de l'union TypeScript qui la redit, dans les deux
 *     sens — aucune valeur SQL absente du type, aucun membre du type absent du SQL.
 * ⭐ LE JOUR OÙ L'UNE TOMBE, le socle cesse d'être inerte : retirer l'assertion, et vérifier
 * d'abord que les trois colonnes en attente ont reçu leur réponse.
 *
 * ── ⛔ SES ANGLES MORTS — écrits ici, parce qu'une garde muette sur ce qu'elle ne voit pas
 *    est une fausse assurance ─────────────────────────────────────────────────
 *   · un nom de table CONSTRUIT (concaténation, variable, clé calculée) ;
 *   · une fonction SQL, une vue, une politique ou un déclencheur qui lirait ces tables en
 *     base : ce script lit le dépôt, pas la base ;
 *   · scripts/ : ce n'est pas du code applicatif, et il n'est pas balayé ;
 *   · un accès par l'API REST depuis l'extérieur du dépôt ;
 *   · la parité ne lit que la forme `CONSTRAINT <nom> CHECK (<colonne> IN ('…', …))` et une union
 *     de littéraux déclarée par `export type`. Une CHECK réécrite autrement, ou un type dérivé
 *     d'une constante, font tomber la garde en « introuvable » — jamais passer en silence.
 *
 * ⛔ NI CI NI CROCHET DANS CE DÉPÔT — même discipline que check:dates et check:adresses.
 */

import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const RACINE = process.cwd();
const TABLES = ['significant_control_individuals', 'significant_control_diligence_steps'] as const;
const MODULE_DES_TYPES = 'lib/supabase/significant-control-types';
const FICHIER_DES_TYPES = `${MODULE_DES_TYPES}.ts`;
/** Chaque CHECK nommée de la migration, et l'union TypeScript qui la redit. */
const PARITES = [
  { contrainte: 'significant_control_individuals_holding_manner_check', union: 'SignificantControlHoldingManner' },
  { contrainte: 'significant_control_individuals_concert_manner_check', union: 'SignificantControlConcertManner' },
] as const;
const ARBRES = ['app', 'components', 'lib'];
const FICHIERS_DE_RACINE = ['middleware.ts'];
const CODE = /\.(tsx?|mjs|js)$/;

/* ═══════════════════════════════════════════════════════════════════════════
   1. CE QU'ON CHERCHE
   ═══════════════════════════════════════════════════════════════════════════ */

interface Branchement {
  ligne: number;
  quoi: string;
}

/** Le module importé, ramené à un chemin du dépôt sans extension. */
function moduleVise(fichier: string, specifier: string): string {
  const sansAlias = specifier.startsWith('@/')
    ? specifier.slice(2)
    : specifier.startsWith('.')
      ? relative(RACINE, resolve(dirname(join(RACINE, fichier)), specifier))
      : specifier;
  return sansAlias.replace(/\.(tsx?|mjs|js)$/, '');
}

/** Tout ce qui, dans un fichier, lit, écrit ou importe le socle. */
function branchements(fichier: string, texte: string): Branchement[] {
  const genre = fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : fichier.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, genre);
  const out: Branchement[] = [];
  const ligne = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const importe = (n: ts.Node, specifier: string) => {
    if (moduleVise(fichier, specifier) === MODULE_DES_TYPES) out.push({ ligne: ligne(n), quoi: `import de ${specifier}` });
  };
  const visite = (n: ts.Node): void => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) &&
      TABLES.some((t) => n.text.includes(t))
    ) {
      out.push({ ligne: ligne(n), quoi: `chaîne « ${n.text.slice(0, 90)} »` });
    }
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      importe(n, n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = n.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) importe(n, a.text);
    }
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      importe(n, n.argument.literal.text);
    }
    n.forEachChild(visite);
  };
  visite(sf);
  return out;
}

/** Les tables du socle qu'un texte SQL déclare, commentaires retirés. */
function tablesDeclarees(sql: string): string[] {
  const propre = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return TABLES.filter((t) =>
    new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?${t}"?\s*\(`, 'i').test(propre),
  );
}

/**
 * Les valeurs de la DERNIÈRE définition d'une CHECK nommée de forme `IN (…)`, dans l'ordre des
 * migrations — ou null si elle est introuvable sous cette forme.
 */
function valeursDeLaCheck(sqls: readonly string[], contrainte: string): string[] | null {
  let trouvees: string[] | null = null;
  for (const sql of sqls) {
    const propre = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = new RegExp(String.raw`constraint\s+"?${contrainte}"?\s+check\s*\(\s*"?\w+"?\s+in\s*\(([^)]*)\)\s*\)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(propre))) {
      trouvees = Array.from(m[1].matchAll(/'((?:[^']|'')*)'/g)).map((v) => v[1].replace(/''/g, "'"));
    }
  }
  return trouvees;
}

/** Les membres d'une union de littéraux déclarée par `export type`, ou null. */
function membresDeLUnion(texte: string, nom: string): string[] | null {
  const sf = ts.createSourceFile('types.ts', texte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const n of sf.statements) {
    if (!ts.isTypeAliasDeclaration(n) || n.name.text !== nom) continue;
    const membres = ts.isUnionTypeNode(n.type) ? Array.from(n.type.types) : [n.type];
    const valeurs = membres.map((t) => (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? t.literal.text : null));
    return valeurs.every((v): v is string => v !== null) ? valeurs : null;
  }
  return null;
}

/** Ce qui manque d'un côté et de l'autre. */
function ecart(sql: readonly string[], membres: readonly string[]): { horsType: string[]; horsSql: string[] } {
  return { horsType: sql.filter((v) => !membres.includes(v)), horsSql: membres.filter((v) => !sql.includes(v)) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. L'AUTO-TEST — ce script a-t-il le droit de conclure ?
   ═══════════════════════════════════════════════════════════════════════════ */

const memes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function autoTest(): boolean {
  let ok = true;
  const test = (bon: boolean, quoi: string) => {
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };
  const n = (texte: string, fichier = 'lib/essai.ts') => branchements(fichier, texte).length;
  test(n("supabase.from('significant_control_individuals').select('id');") === 1, "lecture .from('…individuals')         → vue");
  test(n('await supabase.from(`significant_control_diligence_steps`).insert(x);') === 1, 'écriture en gabarit                    → vue');
  test(n('const t = `x ${a} significant_control_individuals`;') === 1, 'nom dans un gabarit à substitution     → vu');
  test(n('// significant_control_individuals, lu un jour') === 0, 'commentaire seul                       → ignoré');
  test(n("const s = 'significant_control';") === 0, 'fragment sans nom de table             → ignoré');
  test(n("import type { SignificantControlIndividual } from '@/lib/supabase/significant-control-types';") === 1, 'import du module des types (alias)     → vu');
  test(n("import { x } from '../supabase/significant-control-types';", 'lib/minute-book/essai.ts') === 1, 'import du module des types (relatif)   → vu');
  test(n("const m = await import('@/lib/supabase/significant-control-types');") === 1, 'import dynamique                       → vu');
  test(n("type T = import('@/lib/supabase/significant-control-types').SignificantControlIndividual;") === 1, 'import de type en ligne                → vu');
  test(n("import type { CompanyPerson } from '@/lib/supabase/people-types';") === 0, 'import d’un autre module               → ignoré');
  test(tablesDeclarees('CREATE TABLE public.significant_control_individuals (id uuid);').length === 1, 'CREATE TABLE                           → déclaré');
  test(tablesDeclarees('-- CREATE TABLE significant_control_individuals (id uuid);').length === 0, 'CREATE TABLE en commentaire            → pas déclaré');
  const sqlEssai = "CREATE TABLE t (m text NOT NULL CONSTRAINT t_m_check CHECK (m IN ('a', 'b')));";
  test(JSON.stringify(valeursDeLaCheck([sqlEssai], 't_m_check')) === '["a","b"]', 'CHECK nommée IN (…)                    → valeurs lues');
  test(valeursDeLaCheck(["-- CONSTRAINT t_m_check CHECK (m IN ('a'))"], 't_m_check') === null, 'CHECK en commentaire                   → introuvable');
  test(valeursDeLaCheck([sqlEssai, "ALTER TABLE t ADD CONSTRAINT t_m_check CHECK (m IN ('a', 'b', 'c'));"], 't_m_check')?.length === 3, 'CHECK redéfinie plus loin              → la dernière compte');
  test(JSON.stringify(membresDeLUnion("export type M = 'a' | 'b';", 'M')) === '["a","b"]', 'union de littéraux                     → membres lus');
  test(membresDeLUnion('export type M = string;', 'M') === null, 'type qui n’est pas une union de littéraux → introuvable');
  test(memes(ecart(['a', 'b', 'c'], ['a', 'b']).horsType, ['c']), 'valeur SQL absente du type             → vue');
  test(memes(ecart(['a', 'b'], ['a', 'b', 'c']).horsSql, ['c']), 'membre du type absent du SQL           → vu');
  const egal = ecart(['a', 'b'], ['b', 'a']);
  test(egal.horsType.length === 0 && egal.horsSql.length === 0, 'mêmes valeurs, autre ordre             → parité');
  return ok;
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. LE DÉPÔT
   ═══════════════════════════════════════════════════════════════════════════ */

function fichiers(dir: string, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom === 'node_modules' || nom.startsWith('.')) continue;
      fichiers(p, out);
    } else if (CODE.test(nom)) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  console.log('AUTO-TEST — ce script a-t-il le droit de conclure ?');
  const sain = autoTest();
  console.log(sain ? "  → l'outil est vérifié ; il a le droit de conclure." : "  → ⛔ L'OUTIL EST CASSÉ. Sa conclusion ne vaudrait rien ; il se tait.");
  if (!sain) {
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--self-test')) {
    console.log("--self-test : l'outil est vérifié, le dépôt n'est pas lu.");
    return;
  }

  let echec = false;

  // ① LE SOCLE EST DÉCLARÉ — sans quoi la garde passerait à vide
  const dossier = join(RACINE, 'supabase/migrations');
  const declarees = new Set<string>();
  for (const nom of readdirSync(dossier).filter((f) => f.endsWith('.sql'))) {
    for (const t of tablesDeclarees(readFileSync(join(dossier, nom), 'utf8'))) declarees.add(t);
  }
  console.log('\nLE SOCLE EST-IL DÉCLARÉ ?');
  for (const t of TABLES) {
    const vu = declarees.has(t);
    if (!vu) echec = true;
    console.log(`  ${vu ? '✔' : '⛔'} ${t} ${vu ? '— créée par une migration' : "— INTROUVABLE dans les migrations : la garde ne prouve plus rien, mets-la à jour"}`);
  }

  // ② AUCUN LECTEUR, AUCUN ÉCRIVAIN, AUCUN IMPORT
  const balayes = [
    ...ARBRES.flatMap((a) => fichiers(join(RACINE, a))),
    ...FICHIERS_DE_RACINE.map((f) => join(RACINE, f)),
  ];
  const trouves = balayes.flatMap((p) => {
    const rel = relative(RACINE, p);
    return branchements(rel, readFileSync(p, 'utf8')).map((b) => `${rel}:${b.ligne} — ${b.quoi}`);
  });
  console.log(`\nLE SOCLE EST-IL INERTE ? ${balayes.length} fichiers de app/, components/, lib/ et middleware.ts`);
  if (trouves.length > 0) {
    echec = true;
    for (const t of trouves) console.log(`  ⛔ ${t}`);
    // ⚪ LE SIGLE « ISC » RESTE DANS CE MESSAGE, PAR DÉCISION (2026-09-14). Il est banni des NOMS
    //    — tables, colonnes, fichiers — parce que le fichier de verrouillage npm le porte comme
    //    licence et pollue tout grep du concept. Une chaîne de message n'est pas une cible de grep :
    //    elle est lue par un humain devant un échec. Ne pas la « corriger ».
    console.log("\n  ⛔ LE SOCLE ISC CESSE D'ÊTRE INERTE.");
    console.log('    Retirer cette assertion, et vérifier d\'abord que les trois colonnes en attente —');
    console.log("    citoyennetés, résidences fiscales, nature de l'intérêt ou du contrôle — ont reçu");
    console.log("    leur réponse de l'avocat.");
  } else {
    console.log('  ✔ aucun lecteur, aucun écrivain, aucun import');
  }

  // ③ LES UNIONS DISENT CE QUE DISENT LES CHECK — dans les deux sens
  const sqls = readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dossier, f), 'utf8'));
  const texteDesTypes = readFileSync(join(RACINE, FICHIER_DES_TYPES), 'utf8');
  console.log('\nLES UNIONS DISENT-ELLES CE QUE DISENT LES CHECK ?');
  for (const { contrainte, union } of PARITES) {
    const valeurs = valeursDeLaCheck(sqls, contrainte);
    const membres = membresDeLUnion(texteDesTypes, union);
    if (!valeurs || !membres) {
      echec = true;
      console.log(`  ⛔ ${contrainte} ↔ ${union} — ${!valeurs ? 'CHECK introuvable sous la forme IN (…)' : `union de littéraux introuvable dans ${FICHIER_DES_TYPES}`} : la garde ne peut pas comparer`);
      continue;
    }
    const { horsType, horsSql } = ecart(valeurs, membres);
    const juste = horsType.length === 0 && horsSql.length === 0;
    if (!juste) echec = true;
    console.log(
      `  ${juste ? '✔' : '⛔'} ${contrainte} [${valeurs.join(', ')}] ↔ ${union} [${membres.join(', ')}]` +
        (horsType.length ? ` — VALEUR SQL ABSENTE DU TYPE : ${horsType.join(', ')}` : '') +
        (horsSql.length ? ` — MEMBRE DU TYPE ABSENT DU SQL : ${horsSql.join(', ')}` : ''),
    );
  }

  if (echec) {
    process.exitCode = 1;
    return;
  }
  console.log('\n  ✔ LE SOCLE EST DÉCLARÉ, INERTE, ET SES UNIONS DISENT CE QUE DISENT SES CHECK.');
  console.log("    ⛔ Sur ce que ce script voit — lis ses angles morts dans l'en-tête avant de conclure.");
}

main();
