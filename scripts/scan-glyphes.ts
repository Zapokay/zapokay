/**
 * BALAYAGE DE GLYPHES — quel caractère de l'export le conteneur de production
 * sait-il DESSINER ?
 *
 * Run via:
 *   npm run check:glyphs                 → balaie, rc=1 s'il trouve un muet
 *   npm run check:glyphs -- --self-test  → vérifie l'OUTIL, ne balaie pas
 *
 * ⛔ Volontairement PAS un crochet git : un crochet surprend celui qui pousse et
 *    n'existe pas sur toutes les machines. La garde est une discipline
 *    explicite, à poser à côté de `tsc` dans une garde avant-poussée.
 *
 * ── POURQUOI ────────────────────────────────────────────────────────────────
 * Le conteneur de production (`@sparticuz/chromium`) n'embarque qu'une famille
 * de polices : Open Sans. Un caractère absent de sa table cmap ne produit ni
 * erreur ni carré — il produit du VIDE. Une valeur absente d'un document
 * juridique se lit comme une réponse : la colonne « Actif » du registre rendait
 * U+2713 / U+2717 et n'affichait RIEN en production.
 *
 * ★ CE DÉFAUT EST INVISIBLE HORS PRODUCTION, PAR CONSTRUCTION. En local, Chrome
 *   se sert des polices de macOS, qui portent ces caractères — le PDF est
 *   parfait en développement. Aucune passe caméra locale ne peut le trouver.
 *   D'où ce script : il lit la police DU CONTENEUR, pas celles de la machine.
 *
 * ── LE PIÈGE CONNU, ET QUI SE TROMPERA ──────────────────────────────────────
 * ⚠️ Il faut DÉPOUILLER avant de balayer : les blocs `<style>`, les `/* … *​/`
 * et les `//`. Sinon les symboles qui vivent dans des commentaires CSS ou dans
 * la prose française des en-têtes donnent des faux positifs — ils ne partent
 * jamais au PDF.
 *
 * ⚠️ ET C'EST LE DÉPOUILLEUR QUI SE TROMPERA le jour où un gabarit change de
 * forme, PAS le balayage. Le balayage est arithmétique : un codepoint est dans
 * la cmap ou il n'y est pas. Le dépouilleur, lui, devine où finit une chaîne.
 * Il suit l'état (chaîne '…' "…" `…`, échappements) précisément pour qu'une
 * URL `https://…` ne soit pas tronquée par la règle des `//`. Une syntaxe qu'il
 * n'a pas prévue lui fera dépouiller trop — et un vrai défaut passera. Quand ce
 * script dit « zéro », c'est le dépouilleur qu'il faut relire d'abord.
 *
 * ★ C'EST POURQUOI `--self-test` l'exerce sur sept cas (bloc C), dont les deux
 *   qui piègent naïvement : une URL `https://` et un `//` vivant dans une
 *   chaîne. Ajouter une forme de gabarit sans ajouter son cas ici, c'est
 *   retirer au « zéro » sa valeur sans que personne le remarque.
 *
 * ── CE QU'IL NE VOIT PAS ────────────────────────────────────────────────────
 * ⛔ Les DONNÉES. Un nom de personne, un `register_title_fr`, une raison
 * sociale viennent de la base et partent au PDF sans passer par ici. Ce script
 * couvre ce que le DÉPÔT écrit : les littéraux de source et les valeurs de
 * catalogue. C'est la moitié qu'on peut tenir.
 */

import { brotliDecompressSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = process.cwd();
const FONTS_BR = join(RACINE, 'node_modules/@sparticuz/chromium/bin/fonts.tar.br');

/* ═══════════════════════════════════════════════════════════════════════════
   1. LA POLICE DU CONTENEUR — tar brotli → fichiers TTF
   ═══════════════════════════════════════════════════════════════════════════ */

interface EntreeTar { nom: string; donnees: Buffer }

/** Déroule un tar POSIX : entêtes de 512 octets, données arrondies à 512. */
function lireTar(tar: Buffer): EntreeTar[] {
  const sorties: EntreeTar[] = [];
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const entete = tar.subarray(pos, pos + 512);
    // Un bloc entièrement nul marque la fin de l'archive.
    if (entete.every((o) => o === 0)) break;
    const nom = entete.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const tailleOctale = entete.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const taille = parseInt(tailleOctale, 8) || 0;
    const typeflag = String.fromCharCode(entete[156]);
    pos += 512;
    if (typeflag === '0' || typeflag === '\0') {
      sorties.push({ nom, donnees: tar.subarray(pos, pos + taille) });
    }
    pos += Math.ceil(taille / 512) * 512;
  }
  return sorties;
}

/* ── Parseur cmap TrueType ──────────────────────────────────────────────────
   On ne dépend d'aucune bibliothèque de polices : le dépôt n'en a pas, et la
   cmap est un format court. Formats 4 (BMP) et 12 (plan complet) suffisent —
   ce sont les seuls qu'une police de texte moderne publie. */

function codepointsDeLaPolice(ttf: Buffer): Set<number> {
  const couverts = new Set<number>();
  const numTables = ttf.readUInt16BE(4);
  let offsetCmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (ttf.subarray(rec, rec + 4).toString('ascii') === 'cmap') {
      offsetCmap = ttf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (offsetCmap < 0) return couverts;

  const nbSous = ttf.readUInt16BE(offsetCmap + 2);
  for (let i = 0; i < nbSous; i++) {
    const rec = offsetCmap + 4 + i * 8;
    const sous = offsetCmap + ttf.readUInt32BE(rec + 4);
    const format = ttf.readUInt16BE(sous);

    if (format === 4) {
      const segCount = ttf.readUInt16BE(sous + 6) / 2;
      const fins = sous + 14;
      const debuts = fins + segCount * 2 + 2;
      const deltas = debuts + segCount * 2;
      const rangeOffsets = deltas + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const fin = ttf.readUInt16BE(fins + s * 2);
        const debut = ttf.readUInt16BE(debuts + s * 2);
        if (debut === 0xffff) continue;
        const delta = ttf.readInt16BE(deltas + s * 2);
        const ro = ttf.readUInt16BE(rangeOffsets + s * 2);
        for (let c = debut; c <= fin && c !== 0x10000; c++) {
          let gid: number;
          if (ro === 0) {
            gid = (c + delta) & 0xffff;
          } else {
            const adr = rangeOffsets + s * 2 + ro + (c - debut) * 2;
            if (adr + 2 > ttf.length) continue;
            gid = ttf.readUInt16BE(adr);
            if (gid !== 0) gid = (gid + delta) & 0xffff;
          }
          if (gid !== 0) couverts.add(c);
        }
      }
    } else if (format === 12) {
      const nGroups = ttf.readUInt32BE(sous + 12);
      for (let g = 0; g < nGroups; g++) {
        const grp = sous + 16 + g * 12;
        const debut = ttf.readUInt32BE(grp);
        const fin = ttf.readUInt32BE(grp + 4);
        const gidDebut = ttf.readUInt32BE(grp + 8);
        if (gidDebut === 0) continue;
        for (let c = debut; c <= fin; c++) couverts.add(c);
      }
    }
  }
  return couverts;
}

function chargerPolicesDuConteneur(): { noms: string[]; couverts: Set<number> } {
  if (!existsSync(FONTS_BR)) {
    throw new Error(`Police du conteneur introuvable : ${FONTS_BR}`);
  }
  const entrees = lireTar(brotliDecompressSync(readFileSync(FONTS_BR)));
  const polices = entrees.filter((e) => /\.(ttf|otf)$/i.test(e.nom));
  const couverts = new Set<number>();
  for (const p of polices) {
    // Array.from : le tsconfig du dépôt ne pose pas downlevelIteration.
    for (const c of Array.from(codepointsDeLaPolice(p.donnees))) couverts.add(c);
  }
  return { noms: polices.map((p) => p.nom), couverts };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. LE DÉPOUILLEUR — ce qui part au PDF, débarrassé de ce qui n'y part pas
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Retire commentaires de ligne, de bloc, et blocs `<style>` — SANS toucher à
 * ce qui vit dans une chaîne. L'automate suit l'état ; c'est ce qui empêche
 * `'https://fonts.googleapis.com'` d'être coupé par la règle des `//`.
 *
 * Les caractères retirés sont remplacés par des espaces : les offsets restent
 * justes, donc les numéros de ligne rapportés sont les VRAIS.
 */
function depouiller(src: string): string {
  const out = src.split('');
  const blanchir = (a: number, b: number) => {
    for (let i = a; i < b && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  let etat: 'code' | "'" | '"' | '`' = 'code';
  while (i < src.length) {
    const c = src[i];
    if (etat === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        let j = i;
        while (j < src.length && src[j] !== '\n') j++;
        blanchir(i, j);
        i = j;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const j = src.indexOf('*/', i + 2);
        const fin = j === -1 ? src.length : j + 2;
        blanchir(i, fin);
        i = fin;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { etat = c; i++; continue; }
      i++;
      continue;
    }
    // Dans une chaîne : seul l'échappement et le délimiteur comptent.
    if (c === '\\') { i += 2; continue; }
    if (c === etat) { etat = 'code'; i++; continue; }
    i++;
  }
  // Les blocs <style> vivent dans des littéraux de gabarit ; ils sont donc
  // encore là après le passage ci-dessus. Le CSS ne part jamais comme TEXTE.
  return out.join('').replace(/<style>[\s\S]*?<\/style>/g, (m) => ' '.repeat(m.length));
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. LA CHAÎNE D'EXPORT — les sources et les valeurs de catalogue
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tout ce qui compose un PDF de l'export du livre. */
const SOURCES = [
  'app/api/due-diligence/export/route.ts',
  'lib/pdf-templates/base-layout.ts',
  'lib/pdf-templates/binder-registers.ts',
  'lib/pdf-templates/binder-index.ts',
  'lib/pdf-templates/cover-page.ts',
  'lib/pdf-templates/resolution-board.ts',
  'lib/pdf-templates/resolution-shareholder.ts',
  'lib/pdf-templates/signature-blocks.ts',
  'lib/pdf/generatePDF.ts',
  'lib/pdf/pdf-safe-text.ts',
  'lib/i18n/export-labels.ts',
  'lib/i18n/section-labels.ts',
];

/** Les sous-arbres du catalogue dont les valeurs partent au PDF. */
const SOUS_ARBRES = [
  'minuteBook.registers',
  'minuteBook.binderExport',
  'minuteBook.binder.sections',
  'minuteBook.binder.documentCount',
  'minuteBook.binder.registerCount',
];

function descendre(noeud: unknown, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>(
    (n, part) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[part] : undefined),
    noeud,
  );
}

/** Aplatit un sous-arbre en paires (chemin complet, valeur). */
function feuilles(noeud: unknown, prefixe: string, out: [string, string][]): void {
  if (typeof noeud === 'string') { out.push([prefixe, noeud]); return; }
  if (noeud && typeof noeud === 'object') {
    for (const [k, v] of Object.entries(noeud as Record<string, unknown>)) {
      feuilles(v, `${prefixe}.${k}`, out);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. LE BALAYAGE
   ═══════════════════════════════════════════════════════════════════════════ */

interface Muet { ou: string; cp: number; extrait: string }

const U = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/** Ignore l'ASCII imprimable et les blancs — jamais en cause, et bruyants. */
function estAScanner(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return false;
  return cp > 0x7e || cp < 0x20 ? true : false;
}

function balayerTexte(texte: string, ou: string, couverts: Set<number>, muets: Muet[]): void {
  let ligne = 1;
  for (const ch of texte) {
    const cp = ch.codePointAt(0)!;
    if (ch === '\n') { ligne++; continue; }
    if (!estAScanner(cp)) continue;
    if (couverts.has(cp)) continue;
    muets.push({ ou: `${ou}:${ligne}`, cp, extrait: ch });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. L'AUTO-TEST — ce script a-t-il encore le droit de dire « zéro » ?
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Trois familles de contrôles, dans l'ordre de ce qui peut se casser.
 *
 *   A. LA POLICE est-elle vraiment lue ? Un parseur de cmap qui échoue rendrait
 *      un ensemble vide — et un ensemble TROP PLEIN ferait dire « zéro » à un
 *      dépôt fautif. On exige donc 'A' PRÉSENT *et* ✓ ABSENT : les deux sens.
 *   B. LE BALAYAGE voit-il un caractère muet, et se tait-il sur une valeur saine ?
 *   C. LE DÉPOUILLEUR — LA PIÈCE FRAGILE, celle qui se trompera le jour où un
 *      gabarit change de forme. Il doit voir ce qui part au PDF et IGNORER ce
 *      qui n'en part pas. Sept cas, dont les deux qui l'ont déjà mis en défaut
 *      ailleurs : une URL `https://` et un `//` vivant dans une chaîne.
 */
function autoTest(couverts: Set<number>): boolean {
  let ok = true;
  const dire = (bon: boolean, quoi: string) => {
    if (!bon) ok = false;
    console.log(`  ${bon ? '✔' : '⛔'} ${quoi}`);
  };

  console.log('  A. LA POLICE EST-ELLE VRAIMENT LUE ?');
  dire(couverts.size > 200, `${couverts.size} codepoints couverts (attendu : des centaines)`);
  dire(couverts.has(0x41), "'A' U+0041 PRÉSENT — une cmap vide dirait le contraire");
  dire(!couverts.has(0x2713), "✓ U+2713 ABSENT — une cmap trop permissive dirait le contraire");

  console.log('  B. LE BALAYAGE');
  const vu: Muet[] = [];
  balayerTexte('Actif ✓ / Inactif ✗', 'auto-test', couverts, vu);
  dire(vu.length === 2, `témoin muet « Actif ✓ / Inactif ✗ » → ${vu.length} vu(s), attendu 2`);
  const rien: Muet[] = [];
  balayerTexte('Actif Oui / Inactif Non — 1 000,00 $', 'auto-test', couverts, rien);
  dire(rien.length === 0, `témoin sain « Actif Oui / Inactif Non — … » → ${rien.length} vu(s), attendu 0`);

  console.log('  C. LE DÉPOUILLEUR');
  const cas: [string, string, number][] = [
    ['littéral simple', "const a = '✓';", 1],
    ['littéral gabarit', 'const a = `✓`;', 1],
    ['commentaire de ligne', '// ✓ ne part jamais au PDF', 0],
    ['commentaire de bloc', '/* ✓ ne part jamais au PDF */', 0],
    ['bloc <style>', '`<style>/* ✓ */ .a{}</style>`', 0],
    ['URL puis littéral', "const u = 'https://x.test'; const a = '✓';", 1],
    ['« // » dans une chaîne', "const u = 'a//b'; const a = '✓';", 1],
  ];
  for (const [nom, src, attendu] of cas) {
    const vus: Muet[] = [];
    balayerTexte(depouiller(src), 'auto-test', couverts, vus);
    dire(vus.length === attendu, `${nom.padEnd(22)} → ${vus.length} vu(s), attendu ${attendu}`);
  }
  return ok;
}

function main(): void {
  const selfTest = process.argv.includes('--self-test');

  const { noms, couverts } = chargerPolicesDuConteneur();
  console.log('POLICES DU CONTENEUR (@sparticuz/chromium/bin/fonts.tar.br)');
  for (const n of noms) console.log(`  · ${n}`);
  console.log(`  → ${couverts.size} codepoints couverts, toutes polices confondues\n`);

  // Les trois caractères qui ont motivé ce script — leur statut, nommément.
  console.log('CARACTÈRES SOUS SURVEILLANCE');
  for (const [cp, quoi] of [
    [0x2713, '✓ CHECK MARK'],
    [0x2717, '✗ BALLOT X'],
    [0x202f, 'ESPACE FINE INSÉCABLE (Intl.NumberFormat fr)'],
    [0x00a0, 'ESPACE INSÉCABLE (le remplaçant)'],
    [0x2009, 'ESPACE FINE ORDINAIRE'],
    [0x2014, '— TIRET CADRATIN (valeur vide des registres)'],
    [0x2019, '’ APOSTROPHE TYPOGRAPHIQUE'],
    [0x00e9, 'é E ACCENT AIGU'],
  ] as [number, string][]) {
    console.log(`  ${couverts.has(cp) ? 'PRÉSENT ' : 'ABSENT  '} ${U(cp)}  ${quoi}`);
  }
  console.log('');

  // L'OUTIL SE VÉRIFIE AVANT DE SERVIR. Un balayage cassé ne dit pas « erreur »,
  // il dit « zéro » — le même mot qu'un dépôt sain. D'où ce passage obligé.
  console.log('AUTO-TEST — ce script a-t-il encore le droit de dire « zéro » ?');
  const sain = autoTest(couverts);
  console.log(sain
    ? '  → l\'outil est vérifié ; il a le droit de conclure.\n'
    : '  → ⛔ L\'OUTIL EST CASSÉ. Sa conclusion ne vaudrait rien ; il se tait.\n');
  if (!sain) { process.exitCode = 1; return; }
  if (selfTest) {
    console.log('--self-test : l\'outil est vérifié, le balayage réel n\'est pas lancé.');
    return;
  }

  const muets: Muet[] = [];

  for (const rel of SOURCES) {
    const chemin = join(RACINE, rel);
    if (!existsSync(chemin)) { console.log(`  ⚠️  source absente : ${rel}`); continue; }
    balayerTexte(depouiller(readFileSync(chemin, 'utf8')), rel, couverts, muets);
  }

  for (const loc of ['fr', 'en'] as const) {
    const catalogue = JSON.parse(readFileSync(join(RACINE, `messages/${loc}.json`), 'utf8'));
    for (const arbre of SOUS_ARBRES) {
      const paires: [string, string][] = [];
      feuilles(descendre(catalogue, arbre), arbre, paires);
      for (const [cle, valeur] of paires) {
        balayerTexte(valeur, `messages/${loc}.json ${cle}`, couverts, muets);
      }
    }
  }

  console.log(`BALAYAGE — ${SOURCES.length} sources + ${SOUS_ARBRES.length} sous-arbres × 2 locales`);
  if (muets.length === 0) {
    console.log('  ✔ ZÉRO CARACTÈRE MUET. Tout ce que le dépôt écrit, le conteneur sait le dessiner.');
    return;
  }
  const parCp = new Map<number, Muet[]>();
  for (const m of muets) {
    if (!parCp.has(m.cp)) parCp.set(m.cp, []);
    parCp.get(m.cp)!.push(m);
  }
  console.log(`  ⛔ ${muets.length} occurrence(s), ${parCp.size} caractère(s) distinct(s) :`);
  for (const [cp, liste] of Array.from(parCp).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${U(cp)} « ${liste[0].extrait} » — ${liste.length} occurrence(s)`);
    for (const m of liste.slice(0, 12)) console.log(`      ${m.ou}`);
    if (liste.length > 12) console.log(`      … et ${liste.length - 12} de plus`);
  }
  process.exitCode = 1;
}

main();
