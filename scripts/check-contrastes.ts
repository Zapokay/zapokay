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
  // V7b : --input-placeholder et --row-state-archive-certified ne sont plus des exceptions (Aria ⑥ et ⑨).
  '--mot-inactif-texte': 'mot DÉSACTIVÉ (composant inactif, WCAG 1.4.3) — Aria, V7b',
  '--cta-text': 'texte sur fond coloré (bouton ambre) — pas sur la carte ni la page',
  '--neutral-0': 'texte sur fond coloré (blanc sur fond foncé) — pas sur la carte ni la page',
  '--card-bg': 'texte sur fond coloré (couleur de carte sur fond foncé) — pas sur la carte ni la page',
};
const NON_TEXTE = new Set(['--nontext-muted', '--row-state-archive', '--sens-final', '--sens-brouillon', '--sens-manquant', '--archive-certifiee-icone', '--registre-actif']);
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

/* ── e) LES ICÔNES DE LIGNE (V7c) — les 5 états d'Aria, en clair ─────────── */
console.log('e) les icônes de ligne');
{
  // Les alias : dans :root, la valeur d'AUJOURD'HUI (le sombre garde ses couleurs) ; dans le clair, Aria.
  const ALIAS: [string, string, string][] = [
    ['--icone-opacite-repos', '0.5', '0.65'],
    ['--icone-survol', 'var(--text-body)', 'var(--navy-900)'],
    ['--icone-survol-fond', 'var(--page-bg)', 'var(--card-bg)'],
    ['--icone-survol-filet', 'transparent', 'var(--card-border)'],
    ['--icone-danger-filet', 'transparent', 'var(--error-border)'],
    ['--focus-ring', 'var(--amber-400)', 'var(--navy-900)'],
  ];
  for (const [a, racine, clair] of ALIAS) {
    dire(ROOT[a] === racine && CLAIR[a] === clair, `${a} : :root ${racine} (sombre inchangé), clair ${clair} (lu : ${ROOT[a]} / ${CLAIR[a]})`);
  }
  const ic = resoudre('--nontext-muted');
  const survol = resoudre('--icone-survol'); const fondSurvol = resoudre('--icone-survol-fond');
  const danger = resoudre('--error-text'); const fondDanger = resoudre('--error-bg');
  const anneau = resoudre('--focus-ring');
  const ok = (v: string | null): v is string => !!v && /^#[0-9A-F]{6}$/.test(v);
  if (ok(ic)) dire(contraste(ic, FONDS.survol) >= 3, `état 2 : ${ic} sur la ligne survolée ${FONDS.survol} ≥ 3:1 (${contraste(ic, FONDS.survol).toFixed(2)})`);
  else dire(false, 'état 2 : --nontext-muted introuvable');
  dire(ok(survol) && ok(fondSurvol) && contraste(survol, fondSurvol) >= 3,
    `état 3 neutre : ${survol} sur son carré ${fondSurvol} ≥ 3:1 (${ok(survol) && ok(fondSurvol) ? contraste(survol, fondSurvol).toFixed(2) : '—'})`);
  dire(ok(danger) && ok(fondDanger) && contraste(danger, fondDanger) >= 3,
    `état 3 danger : ${danger} sur ${fondDanger} ≥ 3:1 (${ok(danger) && ok(fondDanger) ? contraste(danger, fondDanger).toFixed(2) : '—'})`);
  const r = ok(anneau) ? Object.values(FONDS).map((f) => contraste(anneau, f)) : [];
  dire(r.length === 3 && r.every((x) => x >= 3), `état 4 : contour de focus ${anneau} ≥ 3:1 sur carte / page / survol (${r.map((x) => x.toFixed(2)).join(' / ')})`);
  // ⚖️ EXCEPTION NOMMÉE (Dom, dévoilement) : l'état 1 est volontairement sous 3:1 — compensé par le
  //    dévoilement au survol, au focus clavier (group-focus-within) et sur les appareils sans survol.
  const op = Number(CLAIR['--icone-opacite-repos']);
  if (ok(ic) && op > 0) {
    const h = (x: string, i: number) => parseInt(x.slice(i, i + 2), 16);
    const melange = '#' + [1, 3, 5].map((i) => Math.round(h(ic, i) * op + h(FONDS.carte, i) * (1 - op)).toString(16).padStart(2, '0')).join('').toUpperCase();
    console.log(`  · EXCEPTION NOMMÉE (Dom, dévoilement) : état 1 = ${ic} à ${op} → ${melange}, ${contraste(melange, FONDS.carte).toFixed(2)}:1 sur la carte`);
  }
  // La règle globale et l'en-tête des sections lisent le jeton.
  dire((CSS.match(/outline: 2px solid var\(--focus-ring\)/g) ?? []).length === 2 && !/outline: 2px solid var\(--amber-400\)/.test(CSS),
    'globals.css : les deux règles :focus-visible lisent var(--focus-ring)');
  dire(readFileSync(join(RACINE, 'components/minute-book/SectionCard.tsx'), 'utf8').includes('focus-visible:after:outline-[var(--focus-ring)]'),
    'SectionCard : l\'en-tête des sections lit var(--focus-ring)');
  dire(!/--icone-|--focus-ring/.test(SOMBRE), 'le sombre ne définit aucun de ces alias : ils y valent leur valeur :root');
  // ⚖️ EXCEPTION SOMBRE ACCEPTÉE (Max, V7c) : couleurs identiques ; le COMPORTEMENT change.
  console.log('  · EXCEPTION ACCEPTÉE (V7c) en sombre : dévoilement sur Complétude et le Livre ; focus dans la ligne dévoile sur Documents ;');
  console.log('    désactivé = état 1 partout ; rayon du carré 7 → 8 px. Couleurs sombres identiques.');
}

/* ── f) LES COULEURS DE SENS (V7b) — Aria, en clair ; le sombre ne bouge pas ─ */
console.log('f) les couleurs de sens');
{
  const ALIAS: [string, string, string][] = [
    ['--sens-final', '#059669', '#4A7A40'],
    ['--sens-brouillon', '#F59E0B', 'var(--st-final)'],
    ['--sens-manquant', 'var(--error-text)', 'var(--nontext-muted)'],
    ['--sens-manquant-trait', 'dashed', 'dotted'],
    ['--sens-a-venir-fond', 'transparent', 'var(--card-border)'],
    ['--sens-a-venir-filet', 'var(--nontext-muted)', 'transparent'],
    ['--sens-a-venir-trait', 'dashed', 'solid'],
    ['--formalite-echue-texte', 'var(--warning-text)', 'var(--error-text)'],
    ['--formalite-echue-fond', 'var(--warning-bg)', 'var(--error-bg)'],
    ['--formalite-echue-filet', 'var(--warning-border)', 'var(--error-border)'],
    ['--formalite-a-venir-texte', 'var(--warning-text)', 'var(--info-text)'],
    ['--formalite-a-venir-fond', 'var(--warning-bg)', 'var(--info-bg)'],
    ['--formalite-a-venir-filet', 'var(--warning-border)', 'var(--info-border)'],
    ['--mot-inactif-texte', 'var(--text-body)', '#B3AFA9'],
    ['--mot-inactif-opacite', '0.6', '1'],
    ['--archive-certifiee-texte', 'var(--row-state-archive-certified)', 'var(--text-muted)'],
    ['--archive-certifiee-icone', 'var(--row-state-archive-certified)', 'var(--nontext-muted)'],
    ['--formalite-echue-survol', 'var(--amber-400)', 'var(--formalite-echue-texte)'],
    ['--formalite-a-venir-survol', 'var(--amber-400)', 'var(--formalite-a-venir-texte)'],
    ['--registre-actif', '#16A34A', 'var(--sens-final)'],
    ['--registre-avertissement', '#D97706', 'var(--warning-text)'],
  ];
  for (const [a, racine, clair] of ALIAS) {
    dire(ROOT[a] === racine && (CLAIR[a] ?? '').toUpperCase() === clair.toUpperCase(),
      `${a} : :root ${racine} (sombre d'aujourd'hui), clair ${clair} (lu : ${ROOT[a]} / ${CLAIR[a]})`);
  }
  dire(CLAIR['--input-placeholder'] === 'var(--text-muted)' && CLAIR['--text-placeholder'] === 'var(--text-muted)',
    `placeholders en clair : var(--text-muted) (lu : ${CLAIR['--input-placeholder']} / ${CLAIR['--text-placeholder']})`);
  const ok = (v: string | null): v is string => !!v && /^#[0-9A-F]{6}$/.test(v);
  const mesure = (j: string, fonds: string[], seuil: number, quoi: string) => {
    const v = resoudre(j); const r = ok(v) ? fonds.map((f) => contraste(v, f)) : [];
    dire(r.length === fonds.length && r.every((x) => x >= seuil), `${quoi} : ${j} ${v} ≥ ${seuil}:1 (${r.map((x) => x.toFixed(2)).join(' / ')})`);
  };
  const TROIS = Object.values(FONDS);
  mesure('--sens-final', TROIS, 3, 'part et marqueur « final » (non-texte)');
  mesure('--sens-brouillon', TROIS, 3, 'part et marqueur « à finaliser » (non-texte)');
  mesure('--sens-manquant', TROIS, 3, 'pointillé « manquant » (non-texte)');
  mesure('--input-placeholder', ['#FEFEFE'], 4.5, 'texte indicatif sur le fond de champ');
  mesure('--archive-certifiee-texte', ['#F7F5F1', FONDS.survol], 4.5, 'mention « archivé · certifié » sur le fond d\'archive et au survol');
  mesure('--archive-certifiee-icone', ['#F7F5F1', FONDS.survol], 3, 'icône d\'archive certifiée (non-texte)');
  mesure('--registre-actif', TROIS, 3, '✓ « actif » des registres du Livre (glyphe d\'état, non-texte)');
  mesure('--registre-avertissement', TROIS, 4.5, 'note ambre des registres du Livre (texte)');
  for (const e of ['echue', 'a-venir']) {
    const t = resoudre(`--formalite-${e}-texte`); const f = resoudre(`--formalite-${e}-fond`);
    dire(ok(t) && ok(f) && contraste(t, f) >= 4.5, `formalité ${e} : ${t} sur ${f} ≥ 4,5:1 (${ok(t) && ok(f) ? contraste(t, f).toFixed(2) : '—'})`);
  }
  // ⚖️ EXCEPTIONS NOMMÉES.
  const av = resoudre('--sens-a-venir-fond');
  if (ok(av)) console.log(`  · EXCEPTION NOMMÉE (Aria, à l'essai — Max) : aplat « à venir » ${av}, ${TROIS.map((f) => contraste(av, f).toFixed(2)).join(' / ')}:1, voulu, jugé à la caméra`);
  const mi = resoudre('--mot-inactif-texte');
  if (ok(mi)) console.log(`  · EXCEPTION NOMMÉE (WCAG 1.4.3, composant inactif) : mot désactivé ${mi}, ${TROIS.map((f) => contraste(mi, f).toFixed(2)).join(' / ')}:1`);
  for (const e of ['echue', 'a-venir']) {
    const s2 = resoudre(`--formalite-${e}-survol`); const f = resoudre(`--formalite-${e}-fond`);
    dire(ok(s2) && ok(f) && contraste(s2, f) >= 3, `contour de survol de la formalité ${e} : ${s2} sur ${f} ≥ 3:1 (${ok(s2) && ok(f) ? contraste(s2, f).toFixed(2) : '—'})`);
  }
  // ⚖️ EXCEPTION SOMBRE NOMMÉE (V7b, acceptée) : deux changements valent aussi en sombre.
  console.log('  · EXCEPTION ACCEPTÉE (V7b) en sombre : (a) fenêtre de téléversement, « manquant » : croix rouge → cercle pointillé');
  console.log('    (StateMarker, décision de Dom en V4) ; (b) mots désactivés : survol figé et curseur normal. Couleurs sombres identiques.');
  dire(!/--sens-|--formalite-|--mot-inactif-|--archive-certifiee-|--registre-/.test(SOMBRE), 'le sombre ne définit aucun alias de sens : ils y valent leur valeur :root (le sombre ne bouge pas)');
}

console.log(echecs === 0 ? '\n✔ check:contrastes — tout tient.' : `\n⛔ check:contrastes — ${echecs} garde(s) tombée(s).`);
process.exit(echecs === 0 ? 0 : 1);
