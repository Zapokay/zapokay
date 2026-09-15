/**
 * LE SOCLE DU REGISTRE DES PARTICULIERS AYANT UN CONTRÔLE IMPORTANT EST INERTE — et cette garde
 * le fait expirer.
 *
 * Run via:
 *   npm run check:significant-control                 → rc=1 dès qu'un fichier applicatif branche le socle
 *   npm run check:significant-control -- --self-test  → vérifie l'OUTIL, ne lit pas le dépôt
 *
 * ── LA DÉCISION ─────────────────────────────────────────────────────────────
 * 2026-09-14 : le socle est déclaré en base SANS SURFACE. Une première migration a posé deux
 * tables ; la seconde les a recréées dans la forme que l'autorité a tranchée, et en a ajouté
 * trois — les particuliers (art. 21.1(1)a) à d) LCSA), leurs citoyennetés (a.1)) et leurs
 * résidences fiscales (b)), chaque mesure de diligence (f)), et la déclaration de la société
 * qui n'en identifie aucun (art. 21.2 LCSA, art. 34.1 DORS/2001-512). Une déclaration que
 * personne ne lit est déjà un item de file (company_active_years, companies.active_fiscal_year) :
 * celle-ci porte son fil de rappel.
 *
 * ── CE QUE CE SCRIPT AFFIRME ────────────────────────────────────────────────
 *   · LE SOCLE EST DÉCLARÉ : chacune des cinq tables figure dans un CREATE TABLE des
 *     migrations. Sans ce contrôle, un renommage ferait passer la garde à vide ;
 *   · AUCUN LECTEUR NI ÉCRIVAIN : aucun fichier de app/, components/, lib/ ni middleware.ts
 *     ne porte une chaîne qui nomme l'une des cinq tables — lecture de l'arbre syntaxique,
 *     un commentaire ne compte pas ;
 *   · AUCUN IMPORT du module lib/supabase/significant-control-types, statique ou dynamique ;
 *   · LES UNIONS DISENT CE QUE DISENT LES CHECK : les valeurs de chaque CHECK nommée dans
 *     PARITES sont EXACTEMENT les membres de l'union TypeScript qui la redit, dans les deux
 *     sens — aucune valeur SQL absente du type, aucun membre du type absent du SQL ;
 *   · CHAQUE ENSEMBLE FERMÉ NOMME SA SOURCE : toute CHECK `<colonne> IN (…)` de la définition
 *     en vigueur d'une table du socle est déclarée dans PARITES, et porte un COMMENT ON
 *     CONSTRAINT qui dit « SOURCE » et une date. Une source qui ne nomme aucune de ces CHECK
 *     tombe aussi.
 *     ⭐ POURQUOI (2026-09-14) : la parité comparait la CHECK de holding_manner à son union ;
 *     elles disaient la même chose, et elles étaient FAUSSES ENSEMBLE. Une garde impose la
 *     COHÉRENCE, pas la JUSTESSE. Celle-ci vérifie la PRÉSENCE de la source, pas son contenu :
 *     elle ne sait pas ce que dit le monde, mais elle refuse qu'un ensemble soit fermé sans que
 *     personne ait nommé d'où il vient.
 * ⭐ LE JOUR OÙ L'INERTIE TOMBE, retirer cette assertion — et revérifier d'abord les libellés
 * et les ensembles fermés contre les gabarits de Corporations Canada : ils se révisent.
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
 *     d'une constante, font tomber la garde en « introuvable » — jamais passer en silence ;
 *   · la définition en vigueur d'une table est son DERNIER CREATE TABLE, puis les ALTER TABLE
 *     … ADD CHECK qui suivent : un DROP TABLE n'est pas lu, et une CHECK d'ensemble fermé
 *     écrite sous une autre forme que `<colonne> IN (…)` n'est pas vue comme telle ;
 *   · les commentaires SQL sont retirés avant lecture : un littéral qui contiendrait `--`
 *     fausserait ce retrait.
 *
 * ⛔ NI CI NI CROCHET DANS CE DÉPÔT — même discipline que check:dates et check:adresses.
 */

import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const RACINE = process.cwd();
const TABLES = [
  'significant_control_individuals',
  'significant_control_individual_citizenships',
  'significant_control_individual_tax_residences',
  'significant_control_diligence_steps',
  'significant_control_statements',
] as const;
const MODULE_DES_TYPES = 'lib/supabase/significant-control-types';
const FICHIER_DES_TYPES = `${MODULE_DES_TYPES}.ts`;
/** Chaque CHECK d'ensemble fermé du socle, sa table, et l'union TypeScript qui la redit. */
const PARITES = [
  { table: 'significant_control_individuals', contrainte: 'significant_control_individuals_holding_manner_check', union: 'SignificantControlHoldingManner' },
  { table: 'significant_control_individuals', contrainte: 'significant_control_individuals_concert_manner_check', union: 'SignificantControlConcertManner' },
  { table: 'significant_control_individuals', contrainte: 'significant_control_individuals_interest_type_check', union: 'SignificantControlInterestType' },
  { table: 'significant_control_statements', contrainte: 'significant_control_statements_kind_check', union: 'SignificantControlStatementKind' },
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

/** Le SQL sans ses commentaires. */
const sansCommentaires = (sql: string): string => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** Les tables du socle qu'un texte SQL déclare, commentaires retirés. */
function tablesDeclarees(sql: string): string[] {
  const propre = sansCommentaires(sql);
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
    const propre = sansCommentaires(sql);
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

/** Ce qui est entre la parenthèse ouvrante donnée et sa fermante, chaînes SQL respectées ; null si elle ne ferme pas. */
function entreParentheses(texte: string, ouvrante: number): string | null {
  let profondeur = 0;
  let dansChaine = false;
  for (let i = ouvrante; i < texte.length; i++) {
    const c = texte[i];
    if (c === "'") dansChaine = !dansChaine;
    else if (!dansChaine && c === '(') profondeur++;
    else if (!dansChaine && c === ')' && --profondeur === 0) return texte.slice(ouvrante + 1, i);
  }
  return null;
}

interface EnsembleFerme {
  colonne: string;
  contrainte: string | null;
}

/**
 * Les CHECK `<colonne> IN (…)` de la définition EN VIGUEUR d'une table — son dernier CREATE TABLE,
 * puis les ALTER TABLE … ADD CHECK de la même migration et des suivantes — et l'indice de la
 * migration de ce dernier CREATE TABLE (-1 s'il n'y en a pas).
 */
function ensemblesFermes(sqls: readonly string[], table: string): { depuis: number; ensembles: EnsembleFerme[] } {
  const propres = sqls.map(sansCommentaires);
  const creation = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?${table}"?\s*\(`, 'gi');
  let depuis = -1;
  let corps = '';
  propres.forEach((sql, i) => {
    for (const m of Array.from(sql.matchAll(creation))) {
      const c = entreParentheses(sql, (m.index ?? 0) + m[0].length - 1);
      if (c !== null) {
        depuis = i;
        corps = c;
      }
    }
  });
  if (depuis < 0) return { depuis, ensembles: [] };
  const lire = (m: RegExpMatchArray): EnsembleFerme => ({ contrainte: m[1] ?? null, colonne: m[2] });
  const ensembles = Array.from(corps.matchAll(/(?:constraint\s+"?(\w+)"?\s+)?check\s*\(\s*"?(\w+)"?\s+in\s*\(/gi)).map(lire);
  const ajout = new RegExp(
    String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?${table}"?\s+add\s+(?:constraint\s+"?(\w+)"?\s+)?check\s*\(\s*"?(\w+)"?\s+in\s*\(`,
    'gi',
  );
  for (const sql of propres.slice(depuis)) ensembles.push(...Array.from(sql.matchAll(ajout)).map(lire));
  return { depuis, ensembles };
}

/** Les COMMENT ON CONSTRAINT d'une table, de la migration `depuis` à la dernière : nom → texte. `IS NULL` retire. */
function commentairesDeContrainte(sqls: readonly string[], table: string, depuis: number): Map<string, string> {
  const re = new RegExp(String.raw`comment\s+on\s+constraint\s+"?(\w+)"?\s+on\s+(?:public\.)?"?${table}"?\s+is\s+(?:'((?:[^']|'')*)'|null)`, 'gi');
  const out = new Map<string, string>();
  for (const sql of sqls.slice(depuis).map(sansCommentaires)) {
    for (const m of Array.from(sql.matchAll(re))) {
      if (m[2] === undefined) out.delete(m[1]);
      else out.set(m[1], m[2].replace(/''/g, "'"));
    }
  }
  return out;
}

const SOURCE = /\bSOURCE\b/;
const DATE = /\b\d{4}-\d{2}(?:-\d{2})?\b/;

interface VerdictDesSources {
  /** CHECK d'ensemble fermé en vigueur que PARITES ne déclare pas (ou sans nom). */
  nonDeclares: string[];
  /** CHECK déclarée et en vigueur, sans COMMENT ON CONSTRAINT qui dise « SOURCE » et une date. */
  sansSource: string[];
  /** COMMENT ON CONSTRAINT qui dit « SOURCE » d'une contrainte qui n'est aucune CHECK d'ensemble fermé en vigueur. */
  orphelines: string[];
  /** Les sources trouvées, pour les montrer. */
  sources: Map<string, string>;
}

function verdictDesSources(
  sqls: readonly string[],
  tables: readonly string[],
  declarees: readonly { table: string; contrainte: string }[],
): VerdictDesSources {
  const v: VerdictDesSources = { nonDeclares: [], sansSource: [], orphelines: [], sources: new Map() };
  for (const table of tables) {
    const { depuis, ensembles } = ensemblesFermes(sqls, table);
    if (depuis < 0) continue;
    const commentaires = commentairesDeContrainte(sqls, table, depuis);
    for (const e of ensembles) {
      const declaree = e.contrainte !== null && declarees.some((d) => d.table === table && d.contrainte === e.contrainte);
      if (!declaree) {
        v.nonDeclares.push(`${table}.${e.colonne} (${e.contrainte ?? 'CHECK sans nom'})`);
        continue;
      }
      const texte = commentaires.get(e.contrainte as string);
      if (texte === undefined || !SOURCE.test(texte) || !DATE.test(texte)) v.sansSource.push(e.contrainte as string);
      else v.sources.set(e.contrainte as string, texte);
    }
    for (const [nom, texte] of Array.from(commentaires)) {
      if (SOURCE.test(texte) && !ensembles.some((e) => e.contrainte === nom)) v.orphelines.push(`${table} · ${nom}`);
    }
  }
  return v;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. L'AUTO-TEST — ce script a-t-il le droit de conclure ?
   ═══════════════════════════════════════════════════════════════════════════ */

const memes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function autoTest(): boolean {
  let ok = true;
  let cas = 0;
  const test = (bon: boolean, quoi: string) => {
    cas++;
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };
  const n = (texte: string, fichier = 'lib/essai.ts') => branchements(fichier, texte).length;
  test(n("supabase.from('significant_control_individuals').select('id');") === 1, "lecture .from('…individuals')         → vue");
  test(n('await supabase.from(`significant_control_diligence_steps`).insert(x);') === 1, 'écriture en gabarit                    → vue');
  test(n("supabase.from('significant_control_statements').select('*');") === 1, 'lecture de la table des déclarations   → vue');
  test(n("supabase.from('significant_control_individual_tax_residences').delete();") === 1, 'écriture dans une table de jonction    → vue');
  test(n('const t = `x ${a} significant_control_individuals`;') === 1, 'nom dans un gabarit à substitution     → vu');
  test(n('// significant_control_individuals, lu un jour') === 0, 'commentaire seul                       → ignoré');
  test(n("const s = 'significant_control';") === 0, 'fragment sans nom de table             → ignoré');
  test(n("import type { SignificantControlIndividual } from '@/lib/supabase/significant-control-types';") === 1, 'import du module des types (alias)     → vu');
  test(n("import { x } from '../supabase/significant-control-types';", 'lib/minute-book/essai.ts') === 1, 'import du module des types (relatif)   → vu');
  test(n("const m = await import('@/lib/supabase/significant-control-types');") === 1, 'import dynamique                       → vu');
  test(n("type T = import('@/lib/supabase/significant-control-types').SignificantControlIndividual;") === 1, 'import de type en ligne                → vu');
  test(n("import type { CompanyPerson } from '@/lib/supabase/people-types';") === 0, 'import d’un autre module               → ignoré');
  test(tablesDeclarees('CREATE TABLE public.significant_control_individuals (id uuid);').length === 1, 'CREATE TABLE                           → déclaré');
  test(tablesDeclarees('CREATE TABLE public.significant_control_individual_citizenships (id uuid);').length === 1, 'CREATE TABLE d’une table de jonction   → déclaré');
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

  // Les sources des ensembles fermés
  const cree = "CREATE TABLE t (m text CONSTRAINT t_m_check CHECK (m IN ('a', 'b')), d date, e date, CONSTRAINT t_d_check CHECK (e IS NULL OR e >= d));";
  const source = "COMMENT ON CONSTRAINT t_m_check ON public.t IS 'SOURCE DE L''ÉNUMÉRATION : gabarit X, daté 2023-12';";
  const dT = [{ table: 't', contrainte: 't_m_check' }];
  const juste = (v: VerdictDesSources) => v.nonDeclares.length === 0 && v.sansSource.length === 0 && v.orphelines.length === 0;
  test(ensemblesFermes([cree], 't').ensembles.length === 1, 'CHECK IN (…) vue, CHECK de dates ignorée → un ensemble fermé');
  test(juste(verdictDesSources([cree, source], ['t'], dT)), 'ensemble déclaré, sourcé, daté         → juste');
  test(memes(verdictDesSources([cree], ['t'], dT).sansSource, ['t_m_check']), 'source retirée                         → vue');
  test(memes(verdictDesSources([cree, "COMMENT ON CONSTRAINT t_m_check ON t IS 'SOURCE : gabarit X';"], ['t'], dT).sansSource, ['t_m_check']), 'source sans date                       → vue');
  test(memes(verdictDesSources([cree, "COMMENT ON CONSTRAINT t_m_check ON t IS 'gabarit X, 2023-12';"], ['t'], dT).sansSource, ['t_m_check']), 'commentaire qui ne dit pas SOURCE      → vu');
  test(memes(verdictDesSources([cree, `-- ${source}`], ['t'], dT).sansSource, ['t_m_check']), 'source en commentaire SQL              → vue');
  test(memes(verdictDesSources([cree, source, 'COMMENT ON CONSTRAINT t_m_check ON t IS NULL;'], ['t'], dT).sansSource, ['t_m_check']), 'source retirée par IS NULL             → vue');
  test(memes(verdictDesSources([cree, source, "COMMENT ON CONSTRAINT t_x_check ON t IS 'SOURCE : gabarit Y, 2023-12';"], ['t'], dT).orphelines, ['t · t_x_check']), 'source qui ne nomme aucune CHECK       → orpheline');
  test(verdictDesSources([cree, source], ['t'], []).nonDeclares.length === 1, 'ensemble fermé que la garde ignore     → vu');
  test(verdictDesSources(["CREATE TABLE t (m text CHECK (m IN ('a')));"], ['t'], dT).nonDeclares[0] === 't.m (CHECK sans nom)', 'ensemble fermé sans nom                → vu');
  test(verdictDesSources([cree, source, "ALTER TABLE t ADD CONSTRAINT t_n_check CHECK (n IN ('x'));"], ['t'], dT).nonDeclares.length === 1, 'ensemble ajouté par ALTER TABLE        → vu');
  test(juste(verdictDesSources([cree, "CREATE TABLE t (m text CONSTRAINT t_m_check CHECK (m IN ('a', 'b', 'c')));", source], ['t'], dT)), 'table recréée : seule la définition en vigueur compte → juste');
  test(memes(verdictDesSources([cree, source, "CREATE TABLE t (m text CONSTRAINT t_m_check CHECK (m IN ('a')));"], ['t'], dT).sansSource, ['t_m_check']), 'table recréée APRÈS sa source          → source perdue, vue');
  console.log(`  ${cas} cas`);
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
  const sqls = readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dossier, f), 'utf8'));
  const declarees = new Set(sqls.flatMap(tablesDeclarees));
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
    console.log("    Retirer cette assertion, et revérifier d'abord les libellés et les ensembles fermés");
    console.log('    contre les gabarits de Corporations Canada : ils ont été relevés le 2026-09-14, et un');
    console.log('    gabarit se révise.');
  } else {
    console.log('  ✔ aucun lecteur, aucun écrivain, aucun import');
  }

  // ③ LES UNIONS DISENT CE QUE DISENT LES CHECK — dans les deux sens
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

  // ④ CHAQUE ENSEMBLE FERMÉ NOMME SA SOURCE — la parité dit la cohérence, pas la justesse
  const v = verdictDesSources(sqls, TABLES, PARITES);
  console.log('\nCHAQUE ENSEMBLE FERMÉ NOMME-T-IL SA SOURCE ?');
  for (const e of v.nonDeclares) console.log(`  ⛔ ENSEMBLE FERMÉ QUE LA GARDE NE DÉCLARE PAS : ${e} — le nommer, et l'ajouter à PARITES avec son union et sa source`);
  for (const c of v.sansSource) console.log(`  ⛔ ENSEMBLE FERMÉ SANS SOURCE : ${c} — un COMMENT ON CONSTRAINT qui dit « SOURCE », d'où vient l'énumération, et sa date`);
  for (const c of v.orphelines) console.log(`  ⛔ SOURCE ORPHELINE : ${c} — ce COMMENT ON CONSTRAINT ne nomme aucune CHECK d'ensemble fermé en vigueur`);
  for (const [c, texte] of Array.from(v.sources)) console.log(`  ✔ ${c} — « ${texte.slice(0, 110)}${texte.length > 110 ? '…' : ''} »`);
  if (v.nonDeclares.length || v.sansSource.length || v.orphelines.length) echec = true;

  if (echec) {
    process.exitCode = 1;
    return;
  }
  console.log('\n  ✔ LE SOCLE EST DÉCLARÉ ET INERTE ; SES UNIONS DISENT CE QUE DISENT SES CHECK, ET CHAQUE ENSEMBLE FERMÉ NOMME SA SOURCE.');
  console.log("    ⛔ Sur ce que ce script voit — lis ses angles morts dans l'en-tête avant de conclure.");
}

main();
