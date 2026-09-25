/**
 * LES GRIS DE TEXTE, EN CLAIR — ET LE SOMBRE QUI NE BOUGE PAS (lot V7a).
 *
 * Run via:
 *   npm run check:contrastes   → rc=1 à la première garde qui tombe
 *
 * ★ Lit app/globals.css et résout les var() du thème CLAIR par-dessus :root :
 *   a) --text-muted vaut #6F6A60 en clair, et ses 5 alias pointent vers lui ;
 *   b) les deux alias de rôle (--text-meta, --nontext-muted) valent var(--text-muted)
 *      dans :root — donc, en sombre, exactement l'ancien gris — et le bloc clair
 *      les redirige vers des valeurs EXISTANTES ;
 *   c) chaque couleur de texte des trois pages (Complétude, Documents, Livre),
 *      relevée dans le source, tient 4,5:1 sur la carte, la page et le survol ;
 *      le gris non-texte tient 3:1. Les exceptions sont NOMMÉES, avec leur raison ;
 *   d) les règles [data-theme="dark"] sont identiques, à l'octet, à 01042a9.
 * ⚠️ Décision de Dom : V7 = mode CLAIR seulement. Le sombre sera réévalué par Aria.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const RACINE = process.cwd();
let echecs = 0;
function dire(ok: boolean, quoi: string) {
  console.log(`  ${ok ? '✔' : '⛔'} ${quoi}`);
  if (!ok) echecs++;
}

const CSS = readFileSync(join(RACINE, 'app/globals.css'), 'utf8');

/** Le premier bloc dont le sélecteur est exactement `sel`. */
function bloc(sel: string): Record<string, string> {
  const i = CSS.indexOf(`${sel} {`);
  if (i < 0) return {};
  const corps = CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i));
  const out: Record<string, string> = {};
  for (const m of Array.from(corps.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))) out[m[1]] = m[2].trim();
  return out;
}
const ROOT = bloc(':root');
const CLAIR = bloc('[data-theme="light"]');

/** Valeur résolue en CLAIR : le bloc clair l'emporte sur :root (même spécificité, placé après). */
function resoudre(nom: string, vus: string[] = []): string | null {
  if (vus.includes(nom)) return null;
  const v = CLAIR[nom] ?? ROOT[nom];
  if (!v) return null;
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return m ? resoudre(m[1], [...vus, nom]) : v.toUpperCase();
}

function contraste(a: string, b: string): number {
  const L = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Carte, page, survol de ligne — les fonds ACTUELS (les fonds chauds viendront après V7). */
const FONDS = { carte: '#FEFEFE', page: '#F5F4F0', survol: '#F2F0EA' };

/* ── a) LE GRIS DE TEXTE ET SES ALIAS ───────────────────────────────────── */
console.log('a) --text-muted en clair');
dire(CLAIR['--text-muted']?.toUpperCase() === '#6F6A60', `--text-muted clair = #6F6A60 (lu : ${CLAIR['--text-muted']})`);
for (const a of ['--sb-group-label', '--ob-circle-todo-text', '--ob-label-done', '--sb-co-label', '--sb-user-role']) {
  dire(CLAIR[a] === 'var(--text-muted)', `${a} clair = var(--text-muted) (lu : ${CLAIR[a]})`);
}

/* ── b) LES DEUX ALIAS DE RÔLE ──────────────────────────────────────────── */
console.log('b) les alias de rôle');
for (const a of ['--text-meta', '--nontext-muted']) {
  dire(ROOT[a] === 'var(--text-muted)', `${a} dans :root = var(--text-muted) — en sombre, l'ancien gris (lu : ${ROOT[a]})`);
}
dire(CLAIR['--text-meta'] === 'var(--text-body)' && resoudre('--text-meta') === '#5C5850',
  `--text-meta clair → --text-body #5C5850, valeur existante (résolu : ${resoudre('--text-meta')})`);
dire(CLAIR['--nontext-muted'] === 'var(--row-state-archive)' && resoudre('--nontext-muted') === '#8A857B',
  `--nontext-muted clair → --row-state-archive #8A857B, valeur existante (résolu : ${resoudre('--nontext-muted')})`);

/* ── c) LES COULEURS DE TEXTE DES TROIS PAGES ───────────────────────────── */
console.log('c) contrastes des trois pages, en clair');
const DOSSIERS = ['components/minute-book', 'components/documents', 'app/[locale]/dashboard/minute-book'];
function fichiers(d: string): string[] {
  return readdirSync(join(RACINE, d)).flatMap((f) => {
    const p = join(d, f);
    return statSync(join(RACINE, p)).isDirectory() ? fichiers(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
const jetons = new Set<string>();
for (const f of DOSSIERS.flatMap(fichiers)) {
  const src = readFileSync(join(RACINE, f), 'utf8');
  for (const m of Array.from(src.matchAll(/(?:^|[\s"'`{])(?:[a-z-]+:)*text-\[var\((--[a-z0-9-]+)\)\]/g))) jetons.add(m[1]);
  for (const m of Array.from(src.matchAll(/\bcolor\s*:\s*['"`]?var\((--[a-z0-9-]+)/g))) jetons.add(m[1]);
}
/** Exceptions NOMMÉES (ARRÊT 1 de V7a). Chacune dit pourquoi, et qui la lèvera. */
const EXCEPTIONS: Record<string, string> = {
  '--input-placeholder': 'question posée à Aria, V7b',
  '--row-state-archive-certified': 'couleur de sens, V7b',
  '--cta-text': 'texte sur fond coloré (bouton ambre) — pas sur la carte ni la page',
  '--neutral-0': 'texte sur fond coloré (blanc sur fond foncé) — pas sur la carte ni la page',
  '--card-bg': 'texte sur fond coloré (couleur de carte sur fond foncé) — pas sur la carte ni la page',
};
const NON_TEXTE = new Set(['--nontext-muted', '--row-state-archive']);
dire(jetons.has('--text-muted') && jetons.has('--text-body'), `relevé du source : ${jetons.size} jetons de couleur de texte`);
for (const j of Array.from(jetons).sort()) {
  if (EXCEPTIONS[j]) { console.log(`  · ${j} — EXCEPTION : ${EXCEPTIONS[j]}`); continue; }
  const v = resoudre(j);
  if (!v || !/^#[0-9A-F]{6}$/.test(v)) { dire(false, `${j} : valeur claire introuvable ou non hexadécimale (${v})`); continue; }
  const seuil = NON_TEXTE.has(j) ? 3 : 4.5;
  const r = Object.values(FONDS).map((f) => contraste(v, f));
  dire(r.every((x) => x >= seuil), `${j} ${v} ≥ ${seuil}:1 sur carte / page / survol : ${r.map((x) => x.toFixed(2)).join(' / ')}`);
}

/* ── d) LE SOMBRE NE BOUGE PAS ──────────────────────────────────────────── */
console.log('d) le sombre, identique à 01042a9');
const SOMBRE = Array.from(CSS.matchAll(/\[data-theme="dark"\][^{]*\{[^}]*\}/g)).map((m) => m[0]).join('');
const EMPREINTE = createHash('sha256').update(SOMBRE).digest('hex');
dire(EMPREINTE === '190cc5e075dd4d7ddc3f2109a5af437bd560fb9a269c915e487e215082be189b',
  `règles [data-theme="dark"] : sha256 ${EMPREINTE.slice(0, 16)}…, ${Buffer.byteLength(SOMBRE)} octets (attendu 190cc5e0…, 5589)`);
dire(!/--text-meta|--nontext-muted/.test(SOMBRE), 'le sombre ne définit pas les alias : ils y valent var(--text-muted) (:root)');
// ⚖️ EXCEPTION ACCEPTÉE (Dom, option A) : le titre de ligne est posé par ListRow seul, en --text-heading.
//    En sombre, les titres de Complétude passent de .60 (--text-body) à .80, comme Documents et le Livre.
//    Aucune valeur nouvelle : le bloc sombre ne bouge pas, c'est le JETON lu par ces titres qui change.
console.log('  · EXCEPTION ACCEPTÉE (Dom, option A) : titres de Complétude en sombre .60 → .80 (--text-heading), par ListRow');
{
  const lr = readFileSync(join(RACINE, 'components/minute-book/ListRow.tsx'), 'utf8');
  const titres = Array.from(lr.matchAll(/const TITRE(?:_ATTENUE)? = '[^']*var\((--[a-z-]+)\)/g)).map((m) => m[1]);
  dire(titres.join(',') === '--text-heading,--text-muted' && titres.every((t) => SOMBRE.includes(`${t}:`)),
    `les deux titres de ListRow lisent des jetons que le sombre définit déjà (${titres.join(', ')})`);
}

console.log(echecs === 0 ? '\n✔ check:contrastes — tout tient.' : `\n⛔ check:contrastes — ${echecs} garde(s) tombée(s).`);
process.exit(echecs === 0 ? 0 : 1);
