/**
 * LA FAMILLE « ADRESSES » EST FERMÉE — huit assertions, et chacune se vérifie seule.
 *
 * Run via:
 *   npm run check:adresses                 → vérifie les huit, rc=1 si une seule tombe
 *   npm run check:adresses -- --self-test  → vérifie l'OUTIL, ne lit pas le dépôt
 *
 * ── LE CRITÈRE ──────────────────────────────────────────────────────────────
 * Posé le 2026-09-12 (investigation « adresses »), fermé par le lot du 2026-09-13 :
 *   A1  une seule composition : hors lib/address.ts, aucun site ne rend deux champs
 *       d'adresse ou plus ;
 *   A2  aucune adresse fabriquée : aucun littéral affecté à un champ d'adresse, dans le
 *       code ET les scripts ; aucun DEFAULT ni COALESCE qui en fabrique une au schéma
 *       déclaré par les migrations ;
 *   A3  tout ce qu'un registre imprime sans ville ou sans pays est listé par
 *       trousDeLaSociete ;
 *   A4a tout formulaire qui CRÉE un porteur de rôle, personne ET entité, refuse sans
 *       ville ou pays et affiche un astérisque dérivé de la déclaration ; et tout
 *       formulaire qui se contente d'OFFRIR une adresse n'exige ni ne marque rien ;
 *   A4b toute CORRECTION d'un porteur de rôle, personne ET entité, refuse de VIDER un
 *       champ exigé qui portait une valeur enregistrée, laisse passer une fiche déjà
 *       incomplète, et garde l'astérisque dérivé ;
 *   A5  la société a un siège : ses six colonnes au schéma, deux surfaces qui les
 *       écrivent par `chargeAdresse`, une page de garde qui imprime une valeur de test ;
 *   A6  la liste des pays ne contient que des pays (XK compris, par décision) ;
 *   A7  la province de la société n'existe plus qu'à l'intérieur du siège.
 *
 * ── ⭑ TROIS ASSERTIONS RÉÉCRITES POUR ÊTRE VÉRIFIABLES ICI ──────────────────
 * ⭑ A3 SE LISAIT « SUR LE PARC, EN LECTURE SEULE ». Ce script ne lit pas la base — ni
 *   réseau, ni clé : ce n'est pas le même genre de garde. Il lance les VRAIS lecteurs
 *   (les trois registres et trousDeLaSociete) sur un JEU DE FICHES écrit ici, derrière
 *   un faux client qui honore `select` (colonnes ET embarqués), `eq` et `single`, et
 *   qui LÈVE sur tout le reste. Le jeu porte chaque forme qu'un registre imprime :
 *   mandat actif, clos, supprimé ; charge close ; détention en cours et terminée, pour
 *   une personne et pour une entité. La mesure du parc réel reste un témoin de commit.
 * ⭑ A7 SE LISAIT « companies.province sans défaut, et l'étape 3 refuse sans choix ».
 *   Dom a décidé l'absorption (8620b74) : la question séparée n'existe plus. Ce qui se
 *   vérifie, c'est qu'elle ne revienne pas.
 * ⭑ A4 SE LISAIT « tout formulaire qui crée OU CORRIGE un porteur de rôle refuse sans
 *   ville ou pays ». Dom a décidé, le 2026-09-13, qu'une correction refuse de VIDER et
 *   n'impose pas de REMPLIR : création et correction ne disent plus la même chose. A4
 *   est coupée en A4a et A4b — huit assertions vraies plutôt que sept dont une
 *   approximative.
 *
 * ── ⛔ SES ANGLES MORTS — écrits ici, parce qu'une garde muette sur ce qu'elle ne
 *    voit pas est une fausse assurance ─────────────────────────────────────────
 * A1 · une composition par variables intermédiaires (`const v = p.address_city`, puis
 *      `${v}, ${p.address_province}`), ou par une fonction qui reçoit les champs un à
 *      un ; tout ce qui vit hors de app/, components/ et lib/.
 * A2 · une valeur CALCULÉE — concaténation, constante nommée affectée plus loin, gabarit
 *      à substitution. ⚠️ Ce script emploie lui-même cette dernière forme, exprès et une
 *      seule fois : ses valeurs de test sortent de `valeurDeTest`, et ses fiches ne
 *      portent aucune adresse.
 *    · le SQL appliqué hors migrations (tableau de bord, MCP) ; les tables créées hors
 *      migrations — `companies` en est une, ses défauts d'origine sont invisibles ici ;
 *      une instruction que `rejouerMigrations` ne reconnaît pas. LA BASE N'EST PAS LUE :
 *      son DEFAULT se mesure par information_schema, au message de commit.
 * A3 · les formes absentes du jeu ; ce que le faux client ne simule pas (RLS, `!inner`,
 *      filtres autres que `eq`, tri) ; une quatrième surface qui imprimerait une adresse
 *      de personne ; le parc lui-même.
 * A4a · ⛔ UN MONTAGE NE CLIQUE PAS. Au rendu d'une modale de CRÉATION, aucune
 *      personne n'est saisie : son refus y est invisible. Il est vérifié par LECTURE —
 *      le `disabled` d'un bouton remonte-t-il à `champsManquants` ? — et une garde
 *      contournée par un gestionnaire (Entrée, `onSubmit`) échappe aux deux.
 *    · le recensement lit `<PersonSelector`, `<EntityForm` et — depuis le 2026-09-15 —
 *      `<BlocAdresse` : un formulaire d'adresse écrit à la main à côté de ces TROIS
 *      composants lui échappe encore. Même limite que check:dates, et elle s'est
 *      RÉDUITE : les deux surfaces du siège et les deux étapes d'inscription y sont
 *      entrées. Un genre `offre` ne prouve pas qu'un formulaire ne refuse RIEN, mais
 *      qu'il ne refuse rien PAR SES `disabled` et n'exige rien sur un PersonSelector ;
 *      pour les deux étapes montées, il prouve en plus l'absence d'astérisque.
 * A4b · ⛔ UN MONTAGE NE VIDE RIEN. Monté, un formulaire de correction montre la fiche
 *      telle qu'elle est enregistrée : on y voit qu'une fiche incomplète PASSE, jamais
 *      qu'une saisie vidée TOMBE. Ce second sens est vérifié sur la fonction
 *      (`champsVidesParLaCorrection`, des cas écrits) et par LECTURE : le `disabled`
 *      remonte-t-il à elle, et reçoit-elle la fiche enregistrée (`person`, `entity`) ?
 * A5 · l'enregistrement des Paramètres et de l'inscription n'est pas joué : on lit que la
 *      charge passe par `chargeAdresse`, pas qu'elle part.
 * A6 · le verdict dépend de l'ICU du Node qui lance le script ; celui du navigateur
 *      peut différer.
 * A7 · une lecture de `province` écrite autrement qu'en clé, en signature ou en `select`.
 *
 * ⛔ NI CI NI CROCHET DANS CE DÉPÔT — même discipline que check:dates et check:titres :
 * à lancer à côté de `tsc`.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import ts from 'typescript';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import messages from '@/messages/fr.json';
import { ADRESSE_VIERGE, adresseRegistre, chargeAdresse, type AdresseSaisie, type ChampAdresse } from '@/lib/address';
import {
  CHAMPS_REQUIS_ENTITE,
  CHAMPS_REQUIS_SIEGE,
  HORS_ROLE_AUCUNE_EXIGENCE,
  REQUIS_PAR_LE_COMPOSANT,
  champsManquantsSiege,
  champsRequisDeLaPortee,
  champsVidesParLaCorrection,
  porteeDeLaPersonne,
  trousDeLaSociete,
  type ChampPersonne,
  type PersonneAvecRoles,
  type PorteeExigence,
} from '@/lib/data-gaps';
import { readDirectorRegister, readOfficerRegister, readShareholderRegister } from '@/lib/minute-book/registers';
import { COUNTRY_CODES, REGIONS_EXCLUES } from '@/lib/countries';
import { coverPageHTML } from '@/lib/pdf-templates/cover-page';
import { VALEUR_ENTITE_VIDE } from '@/lib/entity-payload';
import PersonSelector from '@/components/people/PersonSelector';
import { CorrectionIdentite, type ExigenceDeCorrection } from '@/components/people/EditPersonModal';
import EntityForm from '@/components/shareholders/EntityForm';
import StepDirectors from '@/components/onboarding/StepDirectors';
import StepShareholders from '@/components/onboarding/StepShareholders';
import StepOfficers, { DIRIGEANT_VIDE } from '@/components/onboarding/StepOfficers';
import EditEntityModal from '@/components/shareholders/EditEntityModal';

const RACINE = process.cwd();
const CODE = /\.(tsx?|mjs|js)$/;

/** Les composants appellent `createClient()` au rendu ; aucune requête ne part d'un montage serveur. */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:1';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'cle-factice-check-adresses';
/** `jsx: preserve` : tsx retombe sur `React.createElement` — même raison que check:dates. */
Object.assign(globalThis, { React });

type Dire = (vrai: boolean, texte: string) => boolean;
const dire: Dire = (vrai, texte) => {
  console.log(`  ${vrai ? '✔' : '⛔'} ${texte}`);
  return vrai;
};

const CHAMPS: ChampAdresse[] = ['address_line1', 'address_line2', 'address_city', 'address_province', 'address_postal_code', 'address_country'];

/**
 * ⚠️ LA SEULE FABRIQUE DE VALEURS D'ADRESSE DE CE SCRIPT, ET ELLE EST VOULUE. Un marqueur
 * que personne ne confondra avec une donnée, produit par un gabarit — la forme que le
 * balayage d'A2 ne voit pas (voir l'en-tête). Aucune fiche du jeu n'en porte.
 */
const valeurDeTest = (champ: ChampAdresse): string => `⟦${champ}⟧`;

/* ═══════════════════════════════════════════════════════════════════════════
   1. LECTURE DU CODE — fichiers, arbres syntaxiques
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

function analyser(nom: string, texte: string): ts.SourceFile {
  const genre = nom.endsWith('.tsx') ? ts.ScriptKind.TSX : nom.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(nom, texte, ts.ScriptTarget.Latest, true, genre);
}

function parcourir(n: ts.Node, visite: (n: ts.Node) => void): void {
  visite(n);
  n.forEachChild((c) => parcourir(c, visite));
}

const ligneDe = (sf: ts.SourceFile, n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** Le nom lu par `p.champ` ou `p['champ']`. */
function nomLu(n: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) return n.argumentExpression.text;
  return null;
}

function nomDeCle(n: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

/** Les fichiers d'arbres donnés, chacun avec son chemin relatif et son arbre. */
function lireArbres(arbres: string[]): { chemin: string; sf: ts.SourceFile }[] {
  const out: { chemin: string; sf: ts.SourceFile }[] = [];
  for (const arbre of arbres) {
    for (const p of fichiers(join(RACINE, arbre))) {
      out.push({ chemin: relative(RACINE, p), sf: analyser(p, readFileSync(p, 'utf8')) });
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. A1 — LES COMPOSITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Les six colonnes, sous leurs deux graphies : la base (snake_case) et les formulaires (camelCase). */
const CHAMP_ADRESSE = /^(address_(line1|line2|city|province|postal_code|country)|address(Line1|Line2|City|Province|PostalCode|Country))$/;
const COMPOSITION_PERMISE = 'lib/address.ts';

function champsLus(n: ts.Node, jsx: boolean, acc: Set<string>): Set<string> {
  const nom = nomLu(n);
  if (nom && CHAMP_ADRESSE.test(nom)) acc.add(nom);
  n.forEachChild((c) => {
    // ⚠️ UN ATTRIBUT N'EST PAS UN RENDU. `<input value={f.addressCity}>` à côté de
    //    `<input value={f.addressCountry}>` est un formulaire, pas une adresse composée.
    if (jsx && ts.isJsxAttributes(c)) return;
    if (ts.isArrowFunction(c) || ts.isFunctionExpression(c)) return;
    champsLus(c, jsx, acc);
  });
  return acc;
}

/**
 * Quatre formes de composition : un gabarit, les enfants d'un élément JSX, une chaîne de `+`,
 * un tableau de champs. ★ L'INTÉRIEUR D'ABORD : un candidat qui en contient un autre n'est pas
 * une composition de plus.
 */
function compositions(sf: ts.SourceFile): { ligne: number; champs: string[] }[] {
  const candidats: { n: ts.Node; champs: string[] }[] = [];
  parcourir(sf, (n) => {
    let lus: Set<string> | null = null;
    if (ts.isTemplateExpression(n)) {
      lus = champsLus(n, false, new Set());
    } else if (ts.isJsxElement(n)) {
      lus = new Set();
      for (const enfant of n.children) champsLus(enfant, true, lus);
    } else if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      lus = champsLus(n, false, new Set());
    } else if (ts.isArrayLiteralExpression(n)) {
      lus = new Set();
      for (const e of n.elements) {
        const nom = nomLu(e);
        if (nom && CHAMP_ADRESSE.test(nom)) lus.add(nom);
      }
    }
    if (lus && lus.size >= 2) candidats.push({ n, champs: Array.from(lus).sort() });
  });
  return candidats
    .filter((k) => !candidats.some((j) => j !== k && j.n.pos >= k.n.pos && j.n.end <= k.n.end))
    .map((k) => ({ ligne: ligneDe(sf, k.n), champs: k.champs }));
}

function verifierA1(code: { chemin: string; sf: ts.SourceFile }[]): boolean {
  console.log("\n━━ A1 — UNE SEULE COMPOSITION D'ADRESSE ━━");
  const dedans: string[] = [];
  const dehors: string[] = [];
  for (const { chemin, sf } of code) {
    for (const c of compositions(sf)) {
      (chemin === COMPOSITION_PERMISE ? dedans : dehors).push(`${chemin}:${c.ligne} [${c.champs.join(' + ')}]`);
    }
  }
  console.log(`  ${code.length} fichiers de app/, components/, lib/ balayés`);
  for (const d of dedans) console.log(`  ⚪ permise  ${d}`);
  for (const d of dehors) dire(false, `COMPOSITION HORS ${COMPOSITION_PERMISE} : ${d} — appelle adresseCourte ou adresseRegistre`);
  const vrai = dehors.length === 0 && dedans.length > 0;
  if (dedans.length === 0) dire(false, `aucune composition dans ${COMPOSITION_PERMISE} : le balayage ne voit plus rien, il ne prouve rien`);
  return dire(vrai, `A1 ${vrai ? 'VRAIE' : 'FAUSSE'} — ${dehors.length} composition(s) hors ${COMPOSITION_PERMISE}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. A2 — LES ADRESSES FABRIQUÉES : littéraux dans le code, défauts au schéma
   ═══════════════════════════════════════════════════════════════════════════ */

/** Les six colonnes, et les deux mots nus qu'un formulaire a déjà employés (`province`, `country`). */
const CLE_ADRESSE = /^(address_(line1|line2|city|province|postal_code|country)|address(Line1|Line2|City|Province|PostalCode|Country)|province|country)$/;

const CLES_DU_CATALOGUE: string[] = [];
(function aplatir(o: Record<string, unknown>, prefixe: string) {
  for (const [k, v] of Object.entries(o)) {
    const cle = prefixe ? `${prefixe}.${k}` : k;
    if (v && typeof v === 'object') aplatir(v as Record<string, unknown>, cle);
    else CLES_DU_CATALOGUE.push(cle);
  }
})(messages as unknown as Record<string, unknown>, '');

/**
 * ⚠️ UNE CLÉ DE CATALOGUE N'EST PAS UNE ADRESSE. `address_city: 'entityAddressFields.address_city'`
 * nomme un LIBELLÉ : le texte est un chemin pointé qui existe dans messages/fr.json.
 */
const estCleDuCatalogue = (s: string): boolean =>
  s.includes('.') && CLES_DU_CATALOGUE.some((c) => c === s || c.endsWith(`.${s}`));

function fabrique(e: ts.Node | undefined): boolean {
  return !!e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && e.text.trim() !== '' && !estCleDuCatalogue(e.text);
}

/** Cinq formes sous lesquelles ce dépôt a déjà fabriqué — ou pourrait fabriquer — une adresse. */
function litterauxAffectes(sf: ts.SourceFile): { ligne: number; texte: string }[] {
  const out: { ligne: number; texte: string }[] = [];
  const noter = (n: ts.Node) => out.push({ ligne: ligneDe(sf, n), texte: n.getText(sf).replace(/\s+/g, ' ').slice(0, 100) });
  const operateurs: ts.SyntaxKind[] = [
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
  ];
  parcourir(sf, (n) => {
    // ① { address_country: 'CA' }
    if (ts.isPropertyAssignment(n)) {
      const c = nomDeCle(n.name);
      if (c && CLE_ADRESSE.test(c) && fabrique(n.initializer)) noter(n);
    }
    // ② x.address_country = 'CA' · v.addressCountry ?? 'CA' · addressCountry || 'CA'
    if (ts.isBinaryExpression(n) && operateurs.includes(n.operatorToken.kind)) {
      const c = nomLu(n.left) ?? (ts.isIdentifier(n.left) ? n.left.text : null);
      if (c && CLE_ADRESSE.test(c) && fabrique(n.right)) noter(n);
    }
    // ③ const [province, setProvince] = useState('QC')
    if (ts.isVariableDeclaration(n) && ts.isArrayBindingPattern(n.name) && n.initializer && ts.isCallExpression(n.initializer)) {
      const premier = n.name.elements[0];
      const c = premier && ts.isBindingElement(premier) && ts.isIdentifier(premier.name) ? premier.name.text : null;
      if (c && CLE_ADRESSE.test(c) && fabrique(n.initializer.arguments[0])) noter(n);
    }
    // ④ function f({ address_country = 'CA' }) · const { country = 'CA' } = v
    if (ts.isBindingElement(n) && n.initializer) {
      const c = n.propertyName ? nomDeCle(n.propertyName) : ts.isIdentifier(n.name) ? n.name.text : null;
      if (c && CLE_ADRESSE.test(c) && fabrique(n.initializer)) noter(n);
    }
    // ⑤ maj('addressCountry', 'CA')
    if (ts.isCallExpression(n) && n.arguments.length >= 2) {
      const [a, b] = n.arguments;
      if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && CLE_ADRESSE.test(a.text) && fabrique(b)) noter(n);
    }
  });
  return out;
}

interface Schema {
  /** `table.colonne` → le dernier évènement qu'une migration lui a fait subir. */
  colonnes: Map<string, 'ajout' | 'retrait'>;
  /** `table.colonne` → le DEFAULT en vigueur, et la migration qui l'a posé. */
  defauts: Map<string, string>;
  /** nom → le corps de la DERNIÈRE définition. */
  fonctions: Map<string, string>;
  /** Une instruction qui touche le défaut d'une adresse et que l'analyseur ne sait pas lire. */
  illisibles: string[];
}

/** Découpe au séparateur, hors parenthèses et hors chaînes entre apostrophes. */
function decouper(texte: string, sep: ',' | ';'): string[] {
  const parts: string[] = [];
  let prof = 0;
  let guillemet = false;
  let cur = '';
  for (const ch of texte) {
    if (ch === "'") guillemet = !guillemet;
    if (!guillemet) {
      if (ch === '(') prof++;
      else if (ch === ')') prof--;
      else if (ch === sep && prof === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * LE SCHÉMA DÉCLARÉ, REJOUÉ MIGRATION PAR MIGRATION, dans l'ordre des noms.
 * Lit : CREATE TABLE (colonnes et DEFAULT), ALTER TABLE (ADD / DROP / RENAME COLUMN,
 * SET / DROP DEFAULT), CREATE [OR REPLACE] FUNCTION (le corps entre dollars).
 * ⚠️ Commentaires retirés AVANT tout : la migration qui a ôté le COALESCE le RACONTE en
 * commentaire, 'CA' compris.
 */
function rejouerMigrations(migrations: { nom: string; sql: string }[]): Schema {
  const s: Schema = { colonnes: new Map(), defauts: new Map(), fonctions: new Map(), illisibles: [] };
  const id = String.raw`"?(\w+)"?`;
  for (const { nom, sql } of migrations) {
    const corps: string[] = [];
    const propre = sql
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/g, (_m: string, _balise: string, c: string) => {
        corps.push(c);
        return `§${corps.length - 1}§`;
      });
    for (const brut of decouper(propre, ';')) {
      const st = brut.replace(/\s+/g, ' ').trim();
      let m: RegExpExecArray | null;
      if ((m = new RegExp(String.raw`^create (?:unlogged )?table (?:if not exists )?(?:public\.)?${id} \((.*)\)$`, 'i').exec(st))) {
        const table = m[1].toLowerCase();
        for (const def of decouper(m[2], ',')) {
          const c = new RegExp(String.raw`^${id}(?: (.*))?$`, 'i').exec(def);
          if (!c || /^(constraint|primary|unique|foreign|check|exclude|like)$/i.test(c[1])) continue;
          const cle = `${table}.${c[1].toLowerCase()}`;
          s.colonnes.set(cle, 'ajout');
          const d = /\bdefault\s+(.*)$/i.exec(c[2] ?? '');
          if (d) s.defauts.set(cle, `DEFAULT ${d[1]} (${nom})`);
          else s.defauts.delete(cle);
        }
      } else if ((m = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(?:public\.)?${id} (.*)$`, 'i').exec(st))) {
        const table = m[1].toLowerCase();
        for (const action of decouper(m[2], ',')) {
          let a: RegExpExecArray | null;
          if (/^(add|drop|alter|validate|rename) constraint\b/i.test(action)) continue;
          if ((a = new RegExp(String.raw`^add (?:column )?(?:if not exists )?${id}(?: (.*))?$`, 'i').exec(action))) {
            const cle = `${table}.${a[1].toLowerCase()}`;
            s.colonnes.set(cle, 'ajout');
            const d = /\bdefault\s+(.*)$/i.exec(a[2] ?? '');
            if (d) s.defauts.set(cle, `DEFAULT ${d[1]} (${nom})`);
          } else if ((a = new RegExp(String.raw`^alter (?:column )?${id} set default (.*)$`, 'i').exec(action))) {
            s.defauts.set(`${table}.${a[1].toLowerCase()}`, `DEFAULT ${a[2]} (${nom})`);
          } else if ((a = new RegExp(String.raw`^alter (?:column )?${id} drop default$`, 'i').exec(action))) {
            s.defauts.delete(`${table}.${a[1].toLowerCase()}`);
          } else if ((a = new RegExp(String.raw`^drop (?:column )?(?:if exists )?${id}(?: (?:cascade|restrict))?$`, 'i').exec(action))) {
            const cle = `${table}.${a[1].toLowerCase()}`;
            s.colonnes.set(cle, 'retrait');
            s.defauts.delete(cle);
          } else if ((a = new RegExp(String.raw`^rename (?:column )?${id} to ${id}$`, 'i').exec(action))) {
            const avant = `${table}.${a[1].toLowerCase()}`;
            const apres = `${table}.${a[2].toLowerCase()}`;
            s.colonnes.set(avant, 'retrait');
            s.colonnes.set(apres, 'ajout');
            const d = s.defauts.get(avant);
            s.defauts.delete(avant);
            if (d) s.defauts.set(apres, d);
          } else if (/default/i.test(action) && /address_|province|country/i.test(action)) {
            s.illisibles.push(`${nom} : ALTER TABLE ${table} ${action.slice(0, 90)}`);
          }
        }
      } else if ((m = new RegExp(String.raw`^create (?:or replace )?function (?:public\.)?${id}`, 'i').exec(st))) {
        const ref = /§(\d+)§/.exec(st);
        if (ref) s.fonctions.set(m[1].toLowerCase(), corps[Number(ref[1])]);
      }
    }
  }
  return s;
}

/** Un COALESCE qui remplace une adresse absente par une chaîne non vide. */
function coalesceFabrique(corps: string): boolean {
  const propre = corps.replace(/--[^\n]*/g, '');
  const re = /coalesce\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(propre))) {
    let prof = 1;
    let dedans = '';
    for (let i = m.index + m[0].length; i < propre.length && prof > 0; i++) {
      const ch = propre[i];
      if (ch === '(') prof++;
      else if (ch === ')') prof--;
      if (prof > 0) dedans += ch;
    }
    if (!/address_|province|country/i.test(dedans)) continue;
    const litteraux = Array.from(dedans.matchAll(/'((?:[^']|'')*)'/g)).map((l) => l[1]);
    if (litteraux.some((l) => l !== '' && !CLE_ADRESSE.test(l))) return true;
  }
  return false;
}

const lireMigrations = (): { nom: string; sql: string }[] =>
  readdirSync(join(RACINE, 'supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nom) => ({ nom, sql: readFileSync(join(RACINE, 'supabase/migrations', nom), 'utf8') }));

function verifierA2(code: { chemin: string; sf: ts.SourceFile }[], schema: Schema, migrations: number): boolean {
  console.log('\n━━ A2 — AUCUNE ADRESSE FABRIQUÉE ━━');
  let vrai = true;
  const litteraux = code.flatMap(({ chemin, sf }) => litterauxAffectes(sf).map((l) => `${chemin}:${l.ligne}  ${l.texte}`));
  console.log(`  ${code.length} fichiers de app/, components/, lib/, scripts/ balayés`);
  for (const l of litteraux) vrai = dire(false, `LITTÉRAL AFFECTÉ À UNE ADRESSE : ${l}`) && vrai;
  if (litteraux.length === 0) dire(true, 'aucun littéral affecté à un champ d\'adresse — code et scripts');
  console.log(`  ${migrations} migrations rejouées`);
  const defauts = Array.from(schema.defauts).filter(([cle]) => /\.(address_\w+|province|country)$/.test(cle));
  for (const [cle, d] of defauts) vrai = dire(false, `DEFAULT EN VIGUEUR SUR ${cle} : ${d}`) && vrai;
  if (defauts.length === 0) dire(true, "aucun DEFAULT en vigueur sur une colonne d'adresse, au schéma déclaré");
  const fonctions = Array.from(schema.fonctions).filter(([, corps]) => coalesceFabrique(corps)).map(([nom]) => nom);
  for (const f of fonctions) vrai = dire(false, `LA DERNIÈRE DÉFINITION DE ${f} FABRIQUE UNE ADRESSE PAR COALESCE`) && vrai;
  if (fonctions.length === 0) dire(true, `aucune fonction ne fabrique une adresse par COALESCE (${schema.fonctions.size} fonctions lues)`);
  for (const i of schema.illisibles) vrai = dire(false, `INSTRUCTION ILLISIBLE — la garde ne peut pas conclure : ${i}`) && vrai;
  return dire(vrai, `A2 ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. A3 — TOUT CE QUI S'IMPRIME EST LISTÉ : les vrais lecteurs, un faux client
   ═══════════════════════════════════════════════════════════════════════════ */

type Ligne = Record<string, unknown>;
type Base = Record<string, Ligne[]>;

/** Les liens que les lecteurs embarquent, et leur sens. Un lien absent d'ici fait LEVER le faux client. */
const LIENS: Record<string, { cle: string; sens: 'enfants' | 'parent' }> = {
  'company_people>director_mandates': { cle: 'person_id', sens: 'enfants' },
  'company_people>officer_appointments': { cle: 'person_id', sens: 'enfants' },
  'company_people>shareholding_holders': { cle: 'person_id', sens: 'enfants' },
  'shareholder_entities>shareholding_holders': { cle: 'entity_id', sens: 'enfants' },
  'shareholdings>shareholding_holders': { cle: 'shareholding_id', sens: 'enfants' },
  'shareholdings>share_classes': { cle: 'share_class_id', sens: 'parent' },
  'shareholding_holders>shareholdings': { cle: 'shareholding_id', sens: 'parent' },
  'shareholding_holders>company_people': { cle: 'person_id', sens: 'parent' },
  'shareholding_holders>shareholder_entities': { cle: 'entity_id', sens: 'parent' },
};

interface Noeud {
  tout?: true;
  colonne?: string;
  alias?: string;
  table?: string;
  enfants?: Noeud[];
}

/** `'*, a(b, c), x:y(*)'` → l'arbre de ce que PostgREST rendrait. */
function analyserSelect(select: string): Noeud[] {
  return decouper(select.replace(/\s+/g, ' '), ',').map((p): Noeud => {
    if (p === '*') return { tout: true };
    const m = /^(?:(\w+):)?(\w+)(?:!\w+)?\s*\(([\s\S]*)\)$/.exec(p);
    if (m) return { alias: m[1] ?? m[2], table: m[2], enfants: analyserSelect(m[3]) };
    if (/^\w+$/.test(p)) return { colonne: p };
    throw new Error(`faux client : select non reconnu « ${p} »`);
  });
}

function projeter(base: Base, table: string, ligne: Ligne, noeuds: Noeud[]): Ligne {
  const out: Ligne = {};
  for (const n of noeuds) {
    if (n.tout) {
      Object.assign(out, ligne);
    } else if (n.colonne) {
      if (!(n.colonne in ligne)) throw new Error(`faux client : colonne ${table}.${n.colonne} absente du jeu`);
      out[n.colonne] = ligne[n.colonne];
    } else if (n.table && n.alias && n.enfants) {
      const lien = LIENS[`${table}>${n.table}`];
      if (!lien) throw new Error(`faux client : lien ${table}>${n.table} inconnu`);
      const cibles = base[n.table] ?? [];
      const enfants = n.enfants;
      const cible = n.table;
      if (lien.sens === 'enfants') {
        out[n.alias] = cibles.filter((r) => r[lien.cle] === ligne.id).map((r) => projeter(base, cible, r, enfants));
      } else {
        const r = cibles.find((x) => x.id === ligne[lien.cle]);
        out[n.alias] = r ? projeter(base, cible, r, enfants) : null;
      }
    }
  }
  return out;
}

/** `from · select · eq · single`, et RIEN D'AUTRE : une méthode de plus fait lever le lecteur. */
function fauxClient(base: Base): SupabaseClient {
  return {
    from(table: string) {
      let select = '*';
      let unique = false;
      const filtres: [string, unknown][] = [];
      const requete = {
        select(s: string) { select = s; return requete; },
        eq(colonne: string, valeur: unknown) { filtres.push([colonne, valeur]); return requete; },
        single() { unique = true; return requete; },
        then<A, B>(ok: (v: { data: unknown; error: { message: string } | null }) => A, ko?: (e: unknown) => B) {
          return Promise.resolve()
            .then(() => {
              const noeuds = analyserSelect(select);
              const lignes = (base[table] ?? [])
                .filter((l) => filtres.every(([c, v]) => {
                  if (!(c in l)) throw new Error(`faux client : filtre sur ${table}.${c}, absente du jeu`);
                  return l[c] === v;
                }))
                .map((l) => projeter(base, table, l, noeuds));
              if (!unique) return { data: lignes, error: null };
              return lignes.length === 1
                ? { data: lignes[0], error: null }
                : { data: null, error: { message: `single : ${lignes.length} lignes` } };
            })
            .then(ok, ko);
        },
      };
      return requete;
    },
  } as unknown as SupabaseClient;
}

/** ⛔ AUCUNE ADRESSE DANS LE JEU — six `null`. Tout ce qui s'imprime doit donc être listé. */
const SANS_ADRESSE = {
  address_line1: null, address_line2: null, address_city: null,
  address_province: null, address_postal_code: null, address_country: null,
};
const SOCIETE = 'societe-du-jeu';
const personne = (id: string, full_name: string): Ligne => ({
  id, company_id: SOCIETE, full_name, email: null, phone: null, is_canadian_resident: null, ...SANS_ADRESSE,
});
const mandat = (id: string, person_id: string, is_active: boolean, deleted_at: string | null): Ligne => ({
  id, company_id: SOCIETE, person_id, appointment_date: '2020-01-01', end_date: is_active ? null : '2024-06-30',
  end_reason: is_active ? null : 'resignation', is_active, deleted_at,
});
const detention = (id: string, end_date: string | null): Ligne => ({
  id, company_id: SOCIETE, share_class_id: 'k1', quantity: 100, certificate_number: id, issue_date: '2020-01-01',
  issue_price_per_share: 1, end_date, end_reason: end_date ? 'redemption' : null,
});
const detenteur = (id: string, shareholding_id: string, person_id: string | null, entity_id: string | null): Ligne => ({
  id, shareholding_id, holder_type: person_id ? 'individual' : 'entity', person_id, entity_id, display_order: 0,
});

const IMPRIMES_ATTENDUS = [
  'Administratrice en fonction', 'Administrateur au mandat clos', 'Dirigeante à la charge close',
  'Actionnaire en cours', 'Ancien actionnaire', 'Société détentrice', 'Société sortie',
];
const JEU: Base = {
  companies: [{ id: SOCIETE, ...SANS_ADRESSE }],
  company_people: [
    personne('p1', 'Administratrice en fonction'),
    personne('p2', 'Administrateur au mandat clos'),
    personne('p3', 'Mandat supprimé, jamais imprimé'),
    personne('p4', 'Dirigeante à la charge close'),
    personne('p5', 'Actionnaire en cours'),
    personne('p6', 'Ancien actionnaire'),
    personne('p7', 'Sans rôle'),
  ],
  director_mandates: [mandat('m1', 'p1', true, null), mandat('m2', 'p2', false, null), mandat('m3', 'p3', true, '2025-01-01')],
  officer_appointments: [{ ...mandat('o1', 'p4', false, null), title: 'president', custom_title: null, is_primary_signing_authority: false }],
  share_classes: [{ id: 'k1', company_id: SOCIETE, name: 'Catégorie A' }],
  shareholdings: [detention('s1', null), detention('s2', '2024-06-30'), detention('s3', null), detention('s4', '2024-06-30')],
  shareholding_holders: [detenteur('h1', 's1', 'p5', null), detenteur('h2', 's2', 'p6', null), detenteur('h3', 's3', null, 'e1'), detenteur('h4', 's4', null, 'e2')],
  shareholder_entities: [
    { id: 'e1', company_id: SOCIETE, legal_name: 'Société détentrice', entity_type: 'corporation', ...SANS_ADRESSE },
    { id: 'e2', company_id: SOCIETE, legal_name: 'Société sortie', entity_type: 'corporation', ...SANS_ADRESSE },
  ],
};

async function verifierA3(): Promise<boolean> {
  console.log("\n━━ A3 — TOUT CE QUI S'IMPRIME SANS VILLE OU SANS PAYS EST LISTÉ ━━");
  const client = fauxClient(JEU);
  let registres: [Awaited<ReturnType<typeof readDirectorRegister>>, Awaited<ReturnType<typeof readOfficerRegister>>, Awaited<ReturnType<typeof readShareholderRegister>>];
  let trous: Awaited<ReturnType<typeof trousDeLaSociete>>;
  try {
    registres = await Promise.all([
      readDirectorRegister(client, SOCIETE, 'LSA'),
      readOfficerRegister(client, SOCIETE),
      readShareholderRegister(client, SOCIETE),
    ]);
    trous = await trousDeLaSociete(client, SOCIETE);
  } catch (err) {
    return dire(false, `LECTURE IMPOSSIBLE — la garde ne peut pas conclure : ${(err as Error).message}`);
  }
  const [adm, dir, act] = registres;
  const imprimes = new Set<string>([
    ...adm.entries.map((e) => e.full_name),
    ...dir.entries.map((e) => e.full_name),
    ...act.entries.map((e) => e.full_name),
    ...(act.former_holdings?.entries ?? []).map((e) => e.full_name),
  ]);
  const listes = new Set(trous.flatMap((t) => (t.sujet === 'societe' ? [] : [t.nom])));
  let vrai = true;
  const ecart = IMPRIMES_ATTENDUS.filter((n) => !imprimes.has(n)).concat(Array.from(imprimes).filter((n) => !IMPRIMES_ATTENDUS.includes(n)));
  if (ecart.length > 0) {
    vrai = dire(false, `LES REGISTRES N'IMPRIMENT PLUS LE JEU COMME PRÉVU (${ecart.join(', ')}) — la garde ne prouve plus rien : revois le jeu`);
  }
  console.log(`  ${imprimes.size} fiches imprimées par les trois registres, toutes sans ville ni pays ; ${listes.size} listées`);
  for (const nom of IMPRIMES_ATTENDUS) {
    if (!imprimes.has(nom)) continue;
    vrai = dire(listes.has(nom), `${nom} — ${listes.has(nom) ? 'listée' : 'IMPRIMÉE ET NON LISTÉE'}`) && vrai;
  }
  return dire(vrai, `A3 ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. A4a ET A4b — LES FORMULAIRES DE RÔLE : recensement, lecture du refus, montages
   ═══════════════════════════════════════════════════════════════════════════ */

type Refus = 'champsManquants' | 'champsManquantsEntite' | 'champsVidesParLaCorrection';
interface Formulaire {
  /**
   * ⚖️ DEUX RÈGLES DEPUIS LE 2026-09-13 (décision de Dom) : une CRÉATION exige de remplir,
   * une CORRECTION refuse seulement de vider.
   *
   * ⚖️ ET UN TROISIÈME GENRE DEPUIS LE 2026-09-15 : `offre`. « Un utilisateur va
   * s'attendre à faire l'entrée avec précision […] On n'a pas besoin d'imposer tous les
   * champs, mais ça ne nous empêche pas de les OFFRIR. » Un formulaire de ce genre MONTRE
   * les six champs et n'exige RIEN de neuf.
   * ★ CE QU'`offre` AFFIRME : aucune exigence déclarée sur un `<PersonSelector>`, aucun
   *   `disabled` remontant à l'une des trois fonctions de refus, et — pour les deux qu'on
   *   monte — AUCUN ASTÉRISQUE sur les six libellés d'adresse. C'est la forme machine de
   *   la décision : « si une inscription devient plus difficile à terminer, le lot a
   *   échoué. »
   * ⛔ CE QU'`offre` N'AFFIRME PAS : que le formulaire ne refuse rien du tout. Les
   *   Paramètres refusent un siège incomplet — mais dans `saveCompany`, pas sur un
   *   `disabled`, et par `champsManquantsSiege`, qui n'est pas un `Refus`. C'est A5 qui
   *   lit cette écriture-là, et elle la lit toujours.
   */
  genre: 'création' | 'correction' | 'offre';
  raison: string;
  /** Les `exigences` attendues sur ses <PersonSelector>, dans l'ordre ; `(dérivée)` pour la correction d'identité. */
  exigences: string[];
  /** Ce que le `disabled` d'un de ses boutons doit atteindre. */
  refus: Refus[];
  /** Une correction : la fiche ENREGISTRÉE que `champsVidesParLaCorrection` doit recevoir. */
  fiche?: string;
}

const FORMULAIRES = new Map<string, Formulaire>([
  ['components/directors/AddDirectorModal.tsx', { genre: 'création', raison: 'nomme un administrateur', exigences: ['director'], refus: ['champsManquants'] }],
  ['components/officers/AddOfficerModal.tsx', { genre: 'création', raison: 'nomme un dirigeant', exigences: ['officer'], refus: ['champsManquants'] }],
  ['components/officers/ReplaceOfficerModal.tsx', { genre: 'création', raison: 'remplace un dirigeant', exigences: ['officer'], refus: ['champsManquants'] }],
  ['components/shareholders/TransferShareholdingModal.tsx', { genre: 'création', raison: 'transfère à un actionnaire', exigences: ['shareholder'], refus: ['champsManquants'] }],
  ['components/shareholders/IssueSharesModal.tsx', {
    genre: 'création', raison: "émet à une personne ou à une entité ; le signataire n'exige rien, par décision",
    exigences: ['shareholder', 'entity_signatory'], refus: ['champsManquants', 'champsManquantsEntite'],
  }],
  ['components/shareholders/EditEntityModal.tsx', {
    genre: 'correction', raison: 'corrige une entité actionnaire', exigences: [], refus: ['champsVidesParLaCorrection'], fiche: 'entity',
  }],
  ['components/people/EditPersonModal.tsx', {
    genre: 'correction', raison: "corrige l'identité — portée DÉRIVÉE des rôles actifs (décision de Dom, 2026-09-13)",
    exigences: ['(dérivée)'], refus: ['champsVidesParLaCorrection'], fiche: 'person',
  }],
  // ── LES QUATRE PORTEURS DE <BlocAdresse>, entrés au recensement le 2026-09-15 ──
  // Ils lui échappaient tous : le filtre ne lisait que <PersonSelector et <EntityForm,
  // et l'en-tête l'avouait — « un formulaire d'adresse écrit à côté de ces deux
  // composants lui échappe ». Deux d'entre eux montaient déjà leur bloc à la main ;
  // les deux autres le montent depuis ce lot. Aucun n'exige quoi que ce soit.
  ['components/onboarding/StepDirectors.tsx', {
    genre: 'offre', raison: "offre le domicile à l'étape 4 — six champs, aucun exigé (décision de Dom, 2026-09-15)",
    exigences: [], refus: [],
  }],
  ['components/onboarding/StepShareholders.tsx', {
    genre: 'offre', raison: "offre le domicile à l'étape 5, SUR SES DEUX BRANCHES — personne et société (la nature du détenteur, 2026-09-15)",
    exigences: [], refus: [],
  }],
  ['components/onboarding/StepOfficers.tsx', {
    genre: 'offre', raison: "offre le domicile d'un dirigeant SAISI à l'étape 6 — « Une autre personne… », 2026-09-15",
    exigences: [], refus: [],
  }],
  ['components/onboarding/StepSiege.tsx', {
    genre: 'offre', raison: "offre le siège à l'étape 3 — exigé dans l'application, pas ici (décision de Dom, 2026-09-09)",
    exigences: [], refus: [],
  }],
  ['components/dashboard/SettingsClient.tsx', {
    genre: 'offre',
    raison: "corrige le siège — son refus vit dans saveCompany (champsManquantsSiege), PAS sur un disabled : c'est A5 qui le lit",
    exigences: [], refus: [],
  }],
]);

/** Les appels atteints depuis un nœud, en suivant les variables jusqu'à leur initialisation. */
function appelsAtteints(sf: ts.SourceFile, depart: ts.Node): ts.CallExpression[] {
  const declarations = new Map<string, ts.Node[]>();
  parcourir(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      declarations.set(n.name.text, [...(declarations.get(n.name.text) ?? []), n.initializer]);
    }
  });
  const vus = new Set<string>();
  const appels: ts.CallExpression[] = [];
  const suivre = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) appels.push(n);
    if (ts.isIdentifier(n) && !vus.has(n.text)) {
      const inits = declarations.get(n.text);
      if (inits) {
        vus.add(n.text);
        for (const i of inits) suivre(i);
      }
    }
    n.forEachChild(suivre);
  };
  suivre(depart);
  return appels;
}

/** Ce qu'un fichier déclare sur ses <PersonSelector>, ce que ses boutons refusent, et contre quelle fiche. */
function lireFormulaire(sf: ts.SourceFile): { exigences: string[]; refus: Set<string>; fiches: Set<string> } {
  const exigences: string[] = [];
  const refus = new Set<string>();
  const fiches = new Set<string>();
  let derivee = false;
  let lectureDesRoles = false;
  parcourir(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'porteeDeLaPersonne') {
      const etat = n.arguments[1];
      if (etat && ts.isStringLiteral(etat) && etat.text === 'actif') derivee = true;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'select') {
      const a = n.arguments[0];
      if (a && ts.isIdentifier(a) && a.text === 'SELECT_ROLES_PERSONNE') lectureDesRoles = true;
    }
  });
  parcourir(sf, (n) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'PersonSelector') {
      const attr = n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'exigences');
      const init = attr && ts.isJsxAttribute(attr) ? attr.initializer : undefined;
      const expr = init && ts.isJsxExpression(init) ? init.expression : init;
      if (!expr) exigences.push('(absente)');
      else if (ts.isStringLiteral(expr)) exigences.push(expr.text);
      else if (ts.isIdentifier(expr)) exigences.push(derivee && lectureDesRoles ? '(dérivée)' : `{${expr.text}}`);
      else exigences.push(`{${expr.getText(sf)}}`);
    }
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'disabled' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      for (const appel of appelsAtteints(sf, n.initializer.expression)) {
        const nom = (appel.expression as ts.Identifier).text;
        refus.add(nom);
        if (nom === 'champsVidesParLaCorrection') {
          const fiche = appel.arguments[1];
          fiches.add(fiche && ts.isIdentifier(fiche) ? fiche.text : `{${fiche ? fiche.getText(sf) : '(absente)'}}`);
        }
      }
    }
  });
  return { exigences, refus, fiches };
}

/**
 * Tout fichier de app/ ou components/ qui monte un formulaire d'adresse.
 *
 * ★ `BlocAdresse` ENTRE ICI LE 2026-09-15, et c'est la moitié du lot. Le recensement
 * ne connaissait que les deux composants de rôle ; les deux surfaces du siège lui
 * échappaient, et les deux étapes d'inscription allaient lui échapper aussi. Un
 * formulaire d'adresse ne peut désormais plus apparaître dans app/ ou components/
 * sans DÉCLARER son genre ci-dessus — c'est ce que la ligne `NON RECENSÉ` d'A4a
 * impose.
 * ⛔ L'ANGLE MORT SE DÉPLACE, IL NE DISPARAÎT PAS : un bloc d'adresse écrit à la main
 * à côté de ces TROIS composants échappe toujours. Même limite que check:dates.
 */
function recenser(): string[] {
  return ['app', 'components']
    .flatMap((a) => fichiers(join(RACINE, a)))
    .filter((p) => /<(PersonSelector|EntityForm|BlocAdresse)\b/.test(readFileSync(p, 'utf8')))
    .map((p) => relative(RACINE, p))
    .sort();
}

/** ⚠️ UN SEUL TRANSTYPAGE POUR LES MONTAGES — les fixtures sont partielles, comme dans check:dates. */
function el(composant: unknown, props: Record<string, unknown>): React.ReactElement {
  return React.createElement(composant as React.ComponentType<Record<string, unknown>>, props);
}

function rendre(element: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, { locale: 'fr', messages, timeZone: 'America/Toronto', children: element }),
  );
}

function texteDe(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les libellés rendus AVEC un astérisque.
 *
 * ⚠️ DEUX MARQUES, PAS UNE — et la seconde manquait. Ce filtre ne lisait que
 * `text-red-500`, la classe Tailwind du tableau de bord ; l'inscription marque en
 * STYLE EN LIGNE (`color: '#ef4444'` — StepDirectors, StepShareholders,
 * StepCompany). Un astérisque posé à l'inscription était donc INVISIBLE pour cette
 * garde, ce qui aurait rendu vide — donc vraie sans rien vérifier — l'assertion
 * « aucun astérisque neuf » du genre `offre`. Une assertion vide est une fausse
 * assurance, et l'en-tête de ce fichier interdit d'en poser.
 * ★ L'ajout ne fait que RENFORCER les assertions existantes : il ne retire aucune
 * détection, il en ajoute une.
 */
function libellesMarques(html: string): string[] {
  return Array.from(html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g))
    .filter((m) => /text-red-500/.test(m[1]) || /#ef4444/i.test(m[1]))
    .map((m) => texteDe(m[1]))
    .sort();
}

/** `true` désactivé, `false` actif, `null` introuvable. */
function boutonDesactive(html: string, libelle: string): boolean | null {
  for (const m of Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g))) {
    if (texteDe(m[2]) === libelle) return /\sdisabled=""/.test(m[1]);
  }
  return null;
}

/** Le libellé de chaque champ de PersonSelector — branche canadienne, pays non déclaré. */
const LIBELLE_PERSONNE: Partial<Record<ChampPersonne, string>> = {
  full_name: messages.people.fullName,
  email: messages.people.email,
  phone: messages.people.phone,
  address_line1: messages.people.address,
  address_line2: messages.people.addressLine2,
  address_city: messages.people.city,
  address_province: messages.people.province,
  address_postal_code: messages.people.postalCode,
  address_country: messages.people.country,
};
/** Le libellé de chaque champ d'adresse d'EntityForm. `address_line2` n'y porte pas de libellé. */
const LIBELLE_ENTITE: Partial<Record<ChampAdresse, string>> = {
  address_line1: messages.shareholders.address,
  address_city: messages.shareholders.city,
  address_province: messages.shareholders.province,
  address_postal_code: messages.shareholders.postalCode,
  address_country: messages.people.country,
};
function libelle<C extends string>(table: Partial<Record<C, string>>, champ: C): string {
  const l = table[champ];
  if (!l) throw new Error(`champ exigé sans libellé connu de la garde : ${champ} — ajoute-le à la table`);
  return l;
}

const PERSONNE_SANS_ADRESSE = {
  id: 'p1', company_id: 'c1', full_name: 'Ana Martin', email: null, phone: null,
  is_canadian_resident: null, created_at: '', updated_at: '', ...SANS_ADRESSE,
};
const ENTITE_SANS_ADRESSE = {
  id: 'e1', company_id: 'c1', entity_type: 'corporation', legal_name: 'Société sans adresse', entity_number: '1234567890',
  entity_descriptor: 'corporation', date_incorporated: null, date_constituted: null, jurisdiction: null,
  created_at: '', updated_at: '', ...SANS_ADRESSE,
};
const rien = () => {};
/** `onContinue` des étapes d'inscription : Promise<boolean>, jamais appelée au montage. */
const accepte = async () => true;
const memes = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** Les libellés qu'une portée doit marquer : le nom, plus l'union de ses rôles. */
const marquesDeclarees = (portee: PorteeExigence): string[] =>
  Array.from(new Set([...REQUIS_PAR_LE_COMPOSANT, ...champsRequisDeLaPortee(portee)])).map((c) => libelle(LIBELLE_PERSONNE, c)).sort();

/** La lecture des formulaires d'un genre : l'exigence déclarée, le refus qui y remonte, la fiche comparée. */
function lireLesFormulaires(genre: Formulaire['genre'], porteurs: string[]): boolean {
  let vrai = true;
  for (const [chemin, attendu] of Array.from(FORMULAIRES)) {
    if (attendu.genre !== genre) continue;
    if (!porteurs.includes(chemin)) {
      vrai = dire(false, `RECENSÉ SANS FORMULAIRE : ${chemin} — l'entrée est périmée`) && vrai;
      continue;
    }
    const lu = lireFormulaire(analyser(chemin, readFileSync(join(RACINE, chemin), 'utf8')));
    const exigencesJustes = memes(lu.exigences, attendu.exigences);
    const refusManquants = attendu.refus.filter((r) => !lu.refus.has(r));
    const fiches = Array.from(lu.fiches);
    const ficheJuste = attendu.fiche === undefined || memes(fiches, [attendu.fiche]);
    const texteFiche = attendu.fiche === undefined ? ''
      : ficheJuste ? ` · comparé à la fiche enregistrée (${attendu.fiche})`
      : ` · comparé à [${fiches.join(', ')}] AU LIEU DE LA FICHE ENREGISTRÉE (${attendu.fiche})`;
    const juste = exigencesJustes && refusManquants.length === 0 && ficheJuste;
    // ⚪ `refus: []` se LIT — un genre `offre` n'attend aucun refus, et « refus par »
    //    suivi de rien ne dit pas cela, il a l'air tronqué.
    const texteRefus =
      refusManquants.length > 0 ? `MANQUANT : aucun disabled n'atteint ${refusManquants.join(', ')}`
      : attendu.refus.length === 0 ? 'aucun attendu'
      : `par ${attendu.refus.join(' + ')}`;
    vrai = dire(juste, `${chemin} — ${attendu.raison} · exigences [${lu.exigences.join(', ')}]${exigencesJustes ? '' : ` ≠ attendues [${attendu.exigences.join(', ')}]`} · refus ${texteRefus}${texteFiche}`) && vrai;
  }
  return vrai;
}

function verifierA4a(): boolean {
  console.log('\n━━ A4a — CRÉER UN PORTEUR DE RÔLE EXIGE VILLE ET PAYS, ET LE MARQUE ━━');
  let vrai = true;
  const porteurs = recenser();
  console.log(`  RECENSEMENT — ${porteurs.length} fichiers montent PersonSelector, EntityForm ou BlocAdresse`);
  for (const f of porteurs.filter((p) => !FORMULAIRES.has(p))) vrai = dire(false, `NON RECENSÉ : ${f} — déclare son genre, ses exigences et son refus ici`) && vrai;
  vrai = lireLesFormulaires('création', porteurs) && vrai;

  // ── LE GENRE `offre` — OFFRIR N'EST PAS IMPOSER (décision de Dom, 2026-09-15) ──
  console.log('  OFFRE — les formulaires qui montrent les six champs sans rien exiger');
  vrai = lireLesFormulaires('offre', porteurs) && vrai;
  try {
    // ⛔ LES SIX LIBELLÉS D'ADRESSE, ET LA PROVINCE SOUS SES DEUX NOMS. BlocAdresse
    //    rend `stateRegion` tant que le pays n'est pas 'CA' — et une fixture vierge
    //    n'a pas de pays. Ne filtrer que sur `province` laisserait passer un
    //    astérisque posé sur la branche étrangère.
    // ⛔ LES SIX LIBELLÉS, ET CHACUN SOUS TOUTES SES FORMES. La province se rend
    //    `stateRegion` tant que le pays n'est pas 'CA' — et une fixture vierge n'a
    //    pas de pays. La ligne 1 est une PROP de BlocAdresse : l'étape 5 lui passe
    //    « Adresse du domicile » sur sa branche personne et « Adresse » sur sa
    //    branche société. Ne filtrer que sur une forme laisserait passer un
    //    astérisque posé sur l'autre.
    const adressePersonne = new Set<string>([
      ...CHAMPS.map((c) => libelle(LIBELLE_PERSONNE, c)),
      messages.people.stateRegion,
      messages.shareholders.address,
    ]);
    // ⚠️ LA NATURE DU DÉTENTEUR EST UN ÉTAT INTERNE, ET UN MONTAGE NE CLIQUE PAS.
    //    `initialShareholders` est la seule porte qui permette de monter la branche
    //    SOCIÉTÉ — sans elle, cette garde ne verrait jamais que la branche personne
    //    et se croirait complète. Même angle mort que la forme 5 de check:dates,
    //    contourné ici parce que la prop existe.
    const ligneEntite = {
      nature: 'entity' as const,
      fullName: '',
      numberOfShares: 100,
      pricePerShare: '1',
      issueDate: '',
      adresse: { ...ADRESSE_VIERGE },
      entite: { ...VALEUR_ENTITE_VIDE },
    };
    const offres: [string, React.ReactElement][] = [
      ['StepDirectors (étape 4)', el(StepDirectors, {
        locale: 'fr', userFullName: 'Ana Martin', residencyApplies: true, onContinue: accepte, onSkip: rien,
      })],
      ['StepShareholders (étape 5, branche personne)', el(StepShareholders, {
        locale: 'fr', directors: [], onContinue: accepte, onSkip: rien,
      })],
      ['StepShareholders (étape 5, branche société)', el(StepShareholders, {
        locale: 'fr', directors: [], initialShareholders: [ligneEntite], onContinue: accepte, onSkip: rien,
      })],
      // ⚠️ MÊME RAISON QU'À L'ÉTAPE 5 : « une autre personne » est un état interne, et
      //    un montage ne clique pas. `initialOfficers` est la seule porte qui ouvre la
      //    branche de SAISIE ; sans elle la garde ne verrait que les trois listes et se
      //    croirait complète.
      ['StepOfficers (étape 6, dirigeant saisi)', el(StepOfficers, {
        locale: 'fr', directors: [], shareholders: [], incorporationDate: '2024-05-06',
        initialOfficers: {
          president: { nomChoisi: '', nomSaisi: 'Chantal Nadeau', nouvelle: true, adresse: { ...ADRESSE_VIERGE } },
          secretary: { ...DIRIGEANT_VIDE },
          treasurer: { ...DIRIGEANT_VIDE },
        },
        onContinue: accepte, onSkip: rien,
      })],
    ];
    for (const [quoi, element] of offres) {
      const marques = libellesMarques(rendre(element)).filter((l) => adressePersonne.has(l));
      vrai = dire(marques.length === 0, `${quoi} — aucun astérisque sur les six champs d'adresse${marques.length ? ` : [${marques.join(', ')}] EN PORTENT UN` : ''}`) && vrai;
    }
  } catch (err) {
    vrai = dire(false, `MONTAGE IMPOSSIBLE — la garde ne peut pas conclure : ${(err as Error).message}`);
  }

  console.log('  MONTAGES — astérisques rendus contre la déclaration');
  const portees: PorteeExigence[] = ['director', 'officer', 'shareholder', 'entity_signatory', HORS_ROLE_AUCUNE_EXIGENCE, ['director', 'shareholder']];
  try {
    for (const portee of portees) {
      const html = rendre(el(PersonSelector, { companyId: 'c1', value: null, onChange: rien, exigences: portee, residencyApplies: true, lockToNewMode: true }));
      const attendus = marquesDeclarees(portee);
      const rendus = libellesMarques(html);
      vrai = dire(memes(rendus, attendus), `PersonSelector, portée ${JSON.stringify(portee)} — astérisques [${rendus.join(', ')}]${memes(rendus, attendus) ? '' : ` ≠ déclarés [${attendus.join(', ')}]`}`) && vrai;
    }
    const adresses = new Set(Object.values(LIBELLE_ENTITE));
    const rendusEntite = libellesMarques(rendre(el(EntityForm, { value: VALEUR_ENTITE_VIDE, onChange: rien }))).filter((l) => adresses.has(l));
    const attendusEntite = CHAMPS_REQUIS_ENTITE.map((c) => libelle(LIBELLE_ENTITE, c)).sort();
    vrai = dire(memes(rendusEntite, attendusEntite), `EntityForm — astérisques d'adresse [${rendusEntite.join(', ')}]${memes(rendusEntite, attendusEntite) ? '' : ` ≠ déclarés [${attendusEntite.join(', ')}]`}`) && vrai;
  } catch (err) {
    vrai = dire(false, `MONTAGE IMPOSSIBLE — la garde ne peut pas conclure : ${(err as Error).message}`);
  }
  return dire(vrai, `A4a ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

function verifierA4b(): boolean {
  console.log("\n━━ A4b — CORRIGER REFUSE DE VIDER CE QU'UN RÔLE EXIGE, ET LAISSE PASSER UNE FICHE DÉJÀ INCOMPLÈTE ━━");
  let vrai = lireLesFormulaires('correction', recenser());

  // ① LA RÈGLE — sur des cas écrits, puisqu'un montage ne vide rien
  console.log('  LA RÈGLE — champsVidesParLaCorrection, contre la fiche enregistrée');
  const ville = valeurDeTest('address_city');
  const exiges = ['address_city', 'address_country'] as const;
  const regles: [string, Record<string, unknown>, Record<string, unknown>, string][] = [
    ['ville enregistrée vidée, pays déjà vide', { address_city: ville, address_country: null }, { address_city: '', address_country: '' }, '["address_city"]'],
    ["ville enregistrée remplacée par des espaces", { address_city: ville, address_country: null }, { address_city: '   ', address_country: '' }, '["address_city"]'],
    ['ville enregistrée conservée, pays déjà vide', { address_city: ville, address_country: null }, { address_city: ville, address_country: '' }, '[]'],
    ['fiche déjà sans ville ni pays, laissée telle quelle', { address_city: null, address_country: null }, { address_city: '', address_country: '' }, '[]'],
  ];
  for (const [quoi, enregistree, saisie, attendu] of regles) {
    const rendu = JSON.stringify(champsVidesParLaCorrection(exiges, enregistree, saisie));
    vrai = dire(rendu === attendu, `${quoi} → ${rendu}${rendu === attendu ? '' : ` ≠ ${attendu}`}`) && vrai;
  }

  // ② LES MONTAGES — la fiche telle qu'enregistrée : la correction passe, l'astérisque reste
  console.log("  MONTAGES — une fiche sans ville ni pays, telle qu'enregistrée");
  try {
    const cas: [ExigenceDeCorrection, boolean, string][] = [
      [['director'], false, 'rôle actif (administrateur)'],
      [['director', 'shareholder'], false, 'deux rôles actifs'],
      [HORS_ROLE_AUCUNE_EXIGENCE, false, 'aucun rôle actif — hors rôle, par décision'],
      ['lecture', true, 'rôles pas encore lus'],
      ['echec', true, 'lecture des rôles échouée'],
    ];
    for (const [exigence, refuse, quoi] of cas) {
      const html = rendre(el(CorrectionIdentite, { person: PERSONNE_SANS_ADRESSE, companyId: 'c1', residencyApplies: true, onClose: rien, onSuccess: rien, exigence }));
      const d = boutonDesactive(html, messages.common.save);
      const rendus = libellesMarques(html);
      const attendus = exigence === 'lecture' || exigence === 'echec' ? [] : marquesDeclarees(exigence);
      vrai = dire(d === refuse && memes(rendus, attendus), `CorrectionIdentite, ${quoi} → bouton ${d === null ? 'INTROUVABLE' : d ? 'désactivé' : 'actif'}${d === refuse ? '' : ` — attendu ${refuse ? 'désactivé' : 'actif'}`} · astérisques [${rendus.join(', ')}]${memes(rendus, attendus) ? '' : ` ≠ déclarés [${attendus.join(', ')}]`}`) && vrai;
    }
    const htmlEntite = rendre(el(EditEntityModal, { entity: ENTITE_SANS_ADRESSE, companyId: 'c1', onClose: rien, onSuccess: rien }));
    const entite = boutonDesactive(htmlEntite, messages.shareholders.save);
    const adresses = new Set(Object.values(LIBELLE_ENTITE));
    const rendusEntite = libellesMarques(htmlEntite).filter((l) => adresses.has(l));
    const attendusEntite = CHAMPS_REQUIS_ENTITE.map((c) => libelle(LIBELLE_ENTITE, c)).sort();
    vrai = dire(entite === false && memes(rendusEntite, attendusEntite), `EditEntityModal, entité sans ville ni pays → bouton ${entite === null ? 'INTROUVABLE' : entite ? 'DÉSACTIVÉ — attendu actif' : 'actif'} · astérisques d'adresse [${rendusEntite.join(', ')}]${memes(rendusEntite, attendusEntite) ? '' : ` ≠ déclarés [${attendusEntite.join(', ')}]`}`) && vrai;
  } catch (err) {
    vrai = dire(false, `MONTAGE IMPOSSIBLE — la garde ne peut pas conclure : ${(err as Error).message}`);
  }

  // ③ LA DÉRIVATION — la portée d'une correction vient des rôles ACTIFS, par la fonction de la liste des trous
  const actif = { deleted_at: null, is_active: true };
  const clos = { deleted_at: null, is_active: false };
  const derivations: [PersonneAvecRoles, string][] = [
    [{ director_mandates: [actif] }, '["director"]'],
    [{ director_mandates: [clos] }, JSON.stringify(HORS_ROLE_AUCUNE_EXIGENCE)],
    [{ director_mandates: [clos], shareholding_holders: [{ shareholdings: { end_date: null } }] }, '["shareholder"]'],
    [{ director_mandates: [{ deleted_at: '2025-01-01', is_active: true }] }, JSON.stringify(HORS_ROLE_AUCUNE_EXIGENCE)],
    [{ director_mandates: [actif], officer_appointments: [actif] }, '["director","officer"]'],
  ];
  for (const [roles, attendue] of derivations) {
    const rendue = JSON.stringify(porteeDeLaPersonne(roles, 'actif'));
    vrai = dire(rendue === attendue, `porteeDeLaPersonne(${JSON.stringify(roles)}, 'actif') → ${rendue}${rendue === attendue ? '' : ` ≠ ${attendue}`}`) && vrai;
  }
  return dire(vrai, `A4b ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. A5 — LE SIÈGE : schéma, écritures, impression
   ═══════════════════════════════════════════════════════════════════════════ */

function verifierA5(schema: Schema): boolean {
  console.log('\n━━ A5 — LA SOCIÉTÉ A UN SIÈGE ━━');
  let vrai = true;
  const absentes = CHAMPS.filter((c) => schema.colonnes.get(`companies.${c}`) !== 'ajout');
  vrai = dire(absentes.length === 0, `schéma déclaré : companies porte les six colonnes${absentes.length ? ` — MANQUENT ${absentes.join(', ')}` : ''}`) && vrai;

  const types = analyser('lib/types.ts', readFileSync(join(RACINE, 'lib/types.ts'), 'utf8'));
  const membres = new Set<string>();
  parcourir(types, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === 'Company') {
      for (const m of n.members) if (m.name) { const c = nomDeCle(m.name); if (c) membres.add(c); }
    }
  });
  const nonTypees = CHAMPS.filter((c) => !membres.has(c));
  vrai = dire(nonTypees.length === 0, `lib/types.ts : Company type les six colonnes${nonTypees.length ? ` — MANQUENT ${nonTypees.join(', ')}` : ''}`) && vrai;

  const marques = Object.fromEntries(CHAMPS.map((c) => [c, valeurDeTest(c)])) as AdresseSaisie;
  const charge = chargeAdresse(marques);
  const vide = chargeAdresse(ADRESSE_VIERGE);
  vrai = dire(CHAMPS.every((c) => charge[c] === valeurDeTest(c)) && CHAMPS.every((c) => vide[c] === null),
    'chargeAdresse : une saisie arrive telle quelle, une saisie vide s\'écrit null') && vrai;
  vrai = dire(champsManquantsSiege(marques).length === 0 && champsManquantsSiege(ADRESSE_VIERGE).length === CHAMPS_REQUIS_SIEGE.length,
    `champsManquantsSiege : complète → rien ; vierge → les ${CHAMPS_REQUIS_SIEGE.length} champs déclarés`) && vrai;

  const ecritures: [string, RegExp[], string][] = [
    ['components/dashboard/SettingsClient.tsx', [/Object\.assign\(\s*updates\s*,\s*chargeAdresse\(siege\)\s*\)/, /\.from\('companies'\)\s*\.update\(updates\)/], 'Paramètres'],
    ['components/onboarding/OnboardingFlow.tsx', [/\.\.\.chargeAdresse\(data\.company\.siege\)/, /\.from\('companies'\)\.(update|insert)\(companyPayload\)/], 'inscription'],
  ];
  for (const [chemin, motifs, surface] of ecritures) {
    const texte = readFileSync(join(RACINE, chemin), 'utf8');
    const ok = motifs.every((m) => m.test(texte));
    vrai = dire(ok, `${surface} (${chemin}) : la charge de companies passe par chargeAdresse — lu, pas cliqué`) && vrai;
  }

  const route = readFileSync(join(RACINE, 'app/api/due-diligence/export/route.ts'), 'latin1');
  const selects = Array.from(route.matchAll(/\.select\(\s*'([^']*)'/g)).map((m) => m[1]);
  const lue = selects.some((s) => CHAMPS.every((c) => new RegExp(`\\b${c}\\b`).test(s)));
  vrai = dire(lue && /adresseRegistre\(company\)/.test(route), "export : la société est lue avec ses six colonnes et composée par adresseRegistre") && vrai;
  const html = coverPageHTML({
    companyName: 'Société du jeu', siege: adresseRegistre(marques), title: 'Titre', preparedDate: '2026-09-13',
    language: 'fr', confidentialLabel: 'Confidentiel',
  });
  const imprimees = CHAMPS.filter((c) => html.includes(valeurDeTest(c)));
  vrai = dire(imprimees.length === CHAMPS.length, `page de garde : ${imprimees.length}/${CHAMPS.length} valeurs de test imprimées`) && vrai;
  return dire(vrai, `A5 ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. A6 — RIEN QUE DES PAYS
   ═══════════════════════════════════════════════════════════════════════════ */

function verifierA6(): boolean {
  console.log('\n━━ A6 — LA LISTE DES PAYS NE CONTIENT QUE DES PAYS ━━');
  let vrai = true;
  const icu = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const connues: string[] = [];
  const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of lettres) for (const b of lettres) {
    try {
      if (icu.of(a + b)) connues.push(a + b);
    } catch {
      /* un code que l'ICU refuse n'est pas une région */
    }
  }
  const pays: string[] = [...COUNTRY_CODES];
  const exclues: string[] = Object.values(REGIONS_EXCLUES).flat();
  console.log(`  ICU ${process.versions.icu} : ${connues.length} régions connues · ${pays.length} pays · ${exclues.length} exclues`);
  const doublons = pays.filter((c, i) => pays.indexOf(c) !== i);
  const inconnus = pays.filter((c) => !connues.includes(c));
  const lesDeux = pays.filter((c) => exclues.includes(c));
  const nonClassees = connues.filter((c) => !pays.includes(c) && !exclues.includes(c));
  vrai = dire(doublons.length === 0, `aucun code en double${doublons.length ? ` — ${doublons.join(', ')}` : ''}`) && vrai;
  vrai = dire(inconnus.length === 0, `aucun code inconnu d'ICU${inconnus.length ? ` — ${inconnus.join(', ')}` : ''}`) && vrai;
  vrai = dire(lesDeux.length === 0, `aucun code à la fois pays et exclu${lesDeux.length ? ` — ${lesDeux.join(', ')}` : ''}`) && vrai;
  vrai = dire(nonClassees.length === 0, `chaque région connue est classée${nonClassees.length ? ` — NON CLASSÉES : ${nonClassees.join(', ')}` : ''}`) && vrai;
  for (const locale of ['fr', 'en']) {
    const noms = new Intl.DisplayNames([locale], { type: 'region' });
    const libelles = pays.map((c) => noms.of(c) ?? c);
    const memeNom = libelles.filter((l, i) => libelles.indexOf(l) !== i);
    vrai = dire(memeNom.length === 0, `${locale} : aucun libellé en double${memeNom.length ? ` — ${memeNom.join(', ')}` : ''}`) && vrai;
  }
  console.log(`  ⚪ XK ${pays.includes('XK') ? 'présent' : 'absent'} — conservé par décision (lib/countries.ts), pas un défaut`);
  return dire(vrai, `A6 ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. A7 — LA PROVINCE N'EXISTE PLUS QUE DANS LE SIÈGE
   ═══════════════════════════════════════════════════════════════════════════ */

function verifierA7(code: { chemin: string; sf: ts.SourceFile }[], schema: Schema): boolean {
  console.log("\n━━ A7 — LA PROVINCE DE LA SOCIÉTÉ N'EXISTE QU'À L'INTÉRIEUR DU SIÈGE ━━");
  let vrai = true;
  const etat = schema.colonnes.get('companies.province');
  vrai = dire(etat === 'retrait', `schéma déclaré : companies.province ${etat === 'retrait' ? 'retirée' : etat === 'ajout' ? 'PRÉSENTE' : 'jamais retirée par une migration'}`) && vrai;
  vrai = dire((CHAMPS_REQUIS_SIEGE as readonly string[]).includes('address_province'), 'CHAMPS_REQUIS_SIEGE porte address_province : la province vit dans le siège') && vrai;
  const traces: string[] = [];
  for (const { chemin, sf } of code) {
    parcourir(sf, (n) => {
      if ((ts.isPropertySignature(n) || ts.isPropertyDeclaration(n) || ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && nomDeCle(n.name) === 'province') {
        traces.push(`${chemin}:${ligneDe(sf, n)}  ${n.getText(sf).replace(/\s+/g, ' ').slice(0, 80)}`);
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'select') {
        for (const a of n.arguments) {
          if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && /(^|[\s,(])province([\s,)]|$)/.test(a.text)) {
            traces.push(`${chemin}:${ligneDe(sf, n)}  select(… province …)`);
          }
        }
      }
    });
  }
  for (const t of traces) vrai = dire(false, `UNE PROVINCE HORS DU SIÈGE : ${t}`) && vrai;
  if (traces.length === 0) dire(true, 'aucune clé, signature ni select `province` dans app/, components/, lib/');
  return dire(vrai, `A7 ${vrai ? 'VRAIE' : 'FAUSSE'}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. L'AUTO-TEST — ce script a-t-il le droit de conclure ?
   ═══════════════════════════════════════════════════════════════════════════ */

async function autoTest(): Promise<boolean> {
  let ok = true;
  const test = (bon: boolean, quoi: string) => {
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };
  const src = (texte: string) => analyser('essai.tsx', texte);

  // A1
  test(compositions(src('const x = `${p.address_city}, ${p.address_province}`;')).length === 1, 'A1 gabarit à deux champs                 → vu');
  test(compositions(src("const x = <p>{p.address_city}{p.address_province ? ', ' + p.address_province : ''}</p>;")).length === 1, 'A1 JSX ville + province, écrit à la main   → vu, UNE fois');
  test(compositions(src("const x = [p.address_line1, p.address_city].filter(Boolean).join(', ');")).length === 1, 'A1 tableau joint                          → vu');
  test(compositions(src("const x = p.address_city + ', ' + p.address_country;")).length === 1, 'A1 concaténation                         → vu');
  test(compositions(src('const x = <div><input value={f.addressCity} /><input value={f.addressCountry} /></div>;')).length === 0, 'A1 deux champs de formulaire             → pas une composition');
  test(compositions(src("const x = { address_city: v.addressCity, address_country: v.addressCountry };")).length === 0, 'A1 une charge d\'écriture                  → pas une composition');

  // A2
  const lits = (t: string) => litterauxAffectes(src(t)).length;
  test(lits("const r = { address_country: 'CA' };") === 1, "A2 { address_country: 'CA' }              → vu");
  test(lits("const r = { addressProvince: 'QC' };") === 1, "A2 { addressProvince: 'QC' }               → vu");
  test(lits("r.address_country = 'CA';") === 1, "A2 r.address_country = 'CA'                → vu");
  test(lits("const c = v.addressCountry || 'CA';") === 1, "A2 v.addressCountry || 'CA'                → vu");
  test(lits("const [province, setProvince] = useState('QC');") === 1, "A2 useState('QC') sur province            → vu");
  test(lits("maj('addressCountry', 'CA');") === 1, "A2 maj('addressCountry', 'CA')             → vu");
  test(lits("function f({ address_country = 'CA' }) {}") === 1, "A2 défaut de paramètre                    → vu");
  test(lits("const r = { address_country: null, address_city: '' };") === 0, 'A2 null et chaîne vide                    → absence, pas fabrication');
  test(lits("const r = { address_city: 'entityAddressFields.address_city' };") === 0, 'A2 clé du catalogue                       → un libellé, pas une adresse');
  const essai = rejouerMigrations([
    { nom: '1', sql: "create table if not exists t (id uuid primary key, address_country text default 'CA', nom text);" },
    { nom: '2', sql: "ALTER TABLE public.t ADD COLUMN address_city text DEFAULT 'Montréal', add column province text;" },
    { nom: '3', sql: "alter table t alter column address_country drop default; -- DEFAULT 'CA' raconté en commentaire\nalter table t drop column province;" },
    { nom: '4', sql: "create or replace function f(p jsonb) returns void as $$ begin insert into t values (coalesce(nullif(p ->> 'address_country', ''), 'CA')); end; $$ language plpgsql;" },
    { nom: '5', sql: "create or replace function g(p jsonb) returns void as $body$ begin perform nullif(p ->> 'address_country', ''); -- coalesce(…, 'CA') retiré\n end; $body$ language plpgsql;" },
  ]);
  test(!essai.defauts.has('t.address_country'), 'A2 DEFAULT posé puis retiré               → plus en vigueur');
  test(essai.defauts.has('t.address_city'), 'A2 ADD COLUMN … DEFAULT                   → en vigueur');
  test(essai.colonnes.get('t.province') === 'retrait', 'A7 DROP COLUMN                            → retrait');
  test(coalesceFabrique(essai.fonctions.get('f') ?? ''), "A2 coalesce(…, 'CA')                      → vu");
  test(!coalesceFabrique(essai.fonctions.get('g') ?? 'x'), 'A2 coalesce en commentaire                → ignoré');

  // A3
  const arbre = analyserSelect('*, a(b, c), x:y(*)');
  test(arbre.length === 3 && arbre[1].table === 'a' && arbre[2].alias === 'x' && arbre[2].table === 'y', 'A3 select : colonnes, embarqué, alias     → lus');
  const petit: Base = { company_people: [{ id: 'p', company_id: 's', full_name: 'X' }], director_mandates: [{ id: 'm', person_id: 'p', is_active: false }] };
  const lu = await fauxClient(petit).from('company_people').select('full_name, director_mandates(is_active)').eq('company_id', 's');
  test(JSON.stringify(lu.data) === '[{"full_name":"X","director_mandates":[{"is_active":false}]}]', 'A3 faux client : projection et embarqué  → exacts');
  const absente = await fauxClient(petit).from('company_people').select('address_city').eq('company_id', 's').then(() => 'rendu', () => 'levé');
  test(absente === 'levé', 'A3 faux client : colonne absente du jeu    → lève');

  // A4
  const refusVu = lireFormulaire(src("const m = champsManquants('director', {}); const inc = m.length > 0; const b = <button disabled={saving || inc} />;"));
  const refusMuet = lireFormulaire(src("const m = champsManquants('director', {}); const b = <button disabled={saving} />;"));
  test(refusVu.refus.has('champsManquants'), 'A4a disabled → variable → champsManquants → atteint');
  test(!refusMuet.refus.has('champsManquants'), 'A4a disabled sans la déclaration         → non atteint');
  test(memes(libellesMarques('<label class="a">Ville <span class="text-red-500">*</span></label><label>Pays</label>'), ['Ville']), 'A4a astérisque lu sur son libellé         → exact');
  test(boutonDesactive('<button disabled="">Enregistrer</button>', 'Enregistrer') === true && boutonDesactive('<button>Enregistrer</button>', 'Enregistrer') === false, 'A4a bouton désactivé / actif              → lus');
  const ficheLue = lireFormulaire(src('const v = champsVidesParLaCorrection(exiges, person, saisie); const b = <button disabled={v.length > 0} />;'));
  const ficheFausse = lireFormulaire(src('const v = champsVidesParLaCorrection(exiges, saisie, saisie); const b = <button disabled={v.length > 0} />;'));
  test(ficheLue.refus.has('champsVidesParLaCorrection') && memes(Array.from(ficheLue.fiches), ['person']), 'A4b disabled → champsVidesParLaCorrection → atteint, fiche « person » lue');
  test(memes(Array.from(ficheFausse.fiches), ['saisie']), 'A4b la saisie comparée à elle-même        → vue');
  return ok;
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. L'ORDRE
   ═══════════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  console.log('AUTO-TEST — ce script a-t-il le droit de conclure ?');
  const sain = await autoTest();
  console.log(sain ? "  → l'outil est vérifié ; il a le droit de conclure." : "  → ⛔ L'OUTIL EST CASSÉ. Sa conclusion ne vaudrait rien ; il se tait.");
  if (!sain) {
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--self-test')) {
    console.log("--self-test : l'outil est vérifié, le dépôt n'est pas lu.");
    return;
  }

  const code = lireArbres(['app', 'components', 'lib']);
  const scripts = lireArbres(['scripts']);
  const migrations = lireMigrations();
  const schema = rejouerMigrations(migrations);
  const verdicts: [string, boolean][] = [
    ['A1', verifierA1(code)],
    ['A2', verifierA2([...code, ...scripts], schema, migrations.length)],
    ['A3', await verifierA3()],
    ['A4a', verifierA4a()],
    ['A4b', verifierA4b()],
    ['A5', verifierA5(schema)],
    ['A6', verifierA6()],
    ['A7', verifierA7(code, schema)],
  ];
  console.log(`\n  ${verdicts.map(([a, v]) => `${v ? '✔' : '⛔'} ${a}`).join(' · ')}`);
  if (verdicts.some(([, v]) => !v)) {
    console.log("  ⛔ LA FAMILLE « ADRESSES » N'EST PAS FERMÉE.");
    process.exitCode = 1;
    return;
  }
  console.log('  ✔ LES HUIT ASSERTIONS TIENNENT.');
  console.log("    ⛔ Elles tiennent sur ce que ce script voit — lis ses angles morts, dans l'en-tête, avant de conclure.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
