/**
 * LE COFFRE : SA PORTÉE, SON EN-TÊTE, SES DEUX VIDES (lot V3).
 *
 * Run via:
 *   npm run check:documents   → rc=1 à la première garde qui tombe
 *
 * ★ La vraie fonction (lib/documents/list-summary.ts), le vrai catalogue, le vrai
 * moteur ICU de next-intl — en FR ET en EN. Les chiffres sont ceux d'ACME mesurés
 * le 2026-09-24 (47 au coffre ; 2024 = 12 ; 2021 = 0 ; hors exercice = 9).
 * ⭐ LE CAS QUI A FAIT NAÎTRE CETTE PORTE : un exercice vide, coffre NON vide. L'ancienne
 * condition ne regardait que recherche, type et langue, et disait « Commencez par
 * déposer un fichier » à un coffre qui en contenait 47.
 * ⚠️ Ce script ne voit pas l'écran : la caméra de Dom reste la preuve du rendu.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import {
  porteeDepuisParametre,
  dansLaPortee,
  resumeDeLaListe,
  type PorteeExercice,
} from '@/lib/documents/list-summary';

const RACINE = process.cwd();
let echecs = 0;
function dire(ok: boolean, quoi: string) {
  console.log(`  ${ok ? '✔' : '⛔'} ${quoi}`);
  if (!ok) echecs++;
}

const CATALOGUES = {
  fr: JSON.parse(readFileSync(join(RACINE, 'messages/fr.json'), 'utf8')),
  en: JSON.parse(readFileSync(join(RACINE, 'messages/en.json'), 'utf8')),
};
const traducteur = (loc: 'fr' | 'en') =>
  createTranslator({ locale: loc, messages: CATALOGUES[loc] as never, namespace: 'documents' as never }) as unknown as
    (cle: string, valeurs?: Record<string, number>) => string;

/* ── a) ?year= → portée ─────────────────────────────────────────────────── */
console.log('a) la portée lue dans l’URL');
const PARAMETRES: [string | null, string][] = [
  [null, 'all'], ['all', 'all'], ['2024', 'year:2024'], ['unclassified', 'nofiscalyear'],
  ['foundational', 'nofiscalyear'], ['abc', 'all'], ['0', 'all'],
];
const dePortee = (p: PorteeExercice) => (p.kind === 'year' ? `year:${p.year}` : p.kind);
for (const [param, attendu] of PARAMETRES) {
  const obtenu = dePortee(porteeDepuisParametre(param));
  dire(obtenu === attendu, `?year=${param ?? '(absent)'} → ${obtenu}`);
}
dire(dansLaPortee(null, { kind: 'nofiscalyear' }) && !dansLaPortee(2024, { kind: 'nofiscalyear' }),
  '« Hors exercice » = document_year null, et seulement lui');
dire(dansLaPortee(2024, { kind: 'year', year: 2024 }) && !dansLaPortee(2023, { kind: 'year', year: 2024 }),
  'un exercice = son année, et seulement elle');
dire(dansLaPortee(null, { kind: 'all' }) && dansLaPortee(2024, { kind: 'all' }), '« Tous » = tout');

/* ── b) l'en-tête et le vide, FR et EN ──────────────────────────────────── */
console.log('b) en-tête et vide, avec le vrai catalogue');
type Cas = {
  quoi: string; portee: PorteeExercice; coffre: number; portee_: number; affiches: number;
  fr: [string, string]; en: [string, string]; vide: null | 'coffreVide' | 'aucunResultat';
};
const CAS: Cas[] = [
  { quoi: 'Tous, sans filtre', portee: { kind: 'all' }, coffre: 47, portee_: 47, affiches: 47,
    fr: ['Tous les exercices', '47 documents'], en: ['All fiscal years', '47 documents'], vide: null },
  { quoi: 'un exercice seul', portee: { kind: 'year', year: 2024 }, coffre: 47, portee_: 12, affiches: 12,
    fr: ['Exercice 2024', '12 documents'], en: ['Fiscal Year 2024', '12 documents'], vide: null },
  { quoi: 'exercice + type (N < M)', portee: { kind: 'year', year: 2024 }, coffre: 47, portee_: 12, affiches: 5,
    fr: ['Exercice 2024', '5 sur 12 documents'], en: ['Fiscal Year 2024', '5 of 12 documents'], vide: null },
  { quoi: '⭐ exercice VIDE, coffre non vide', portee: { kind: 'year', year: 2021 }, coffre: 47, portee_: 0, affiches: 0,
    fr: ['Exercice 2021', '0 document'], en: ['Fiscal Year 2021', '0 documents'], vide: 'aucunResultat' },
  { quoi: 'coffre vide', portee: { kind: 'all' }, coffre: 0, portee_: 0, affiches: 0,
    fr: ['Tous les exercices', '0 document'], en: ['All fiscal years', '0 documents'], vide: 'coffreVide' },
  { quoi: 'Hors exercice', portee: { kind: 'nofiscalyear' }, coffre: 47, portee_: 9, affiches: 9,
    fr: ['Hors exercice', '9 documents'], en: ['Outside fiscal years', '9 documents'], vide: null },
  { quoi: 'recherche sans résultat dans un exercice d’UN document', portee: { kind: 'year', year: 2019 }, coffre: 47, portee_: 1, affiches: 0,
    fr: ['Exercice 2019', '0 sur 1 document'], en: ['Fiscal Year 2019', '0 of 1 document'], vide: 'aucunResultat' },
  { quoi: '?year= illisible → Tous', portee: porteeDepuisParametre('abc'), coffre: 47, portee_: 47, affiches: 47,
    fr: ['Tous les exercices', '47 documents'], en: ['All fiscal years', '47 documents'], vide: null },
];
for (const c of CAS) {
  for (const loc of ['fr', 'en'] as const) {
    const r = resumeDeLaListe({
      portee: c.portee, totalCoffre: c.coffre, totalPortee: c.portee_, affiches: c.affiches,
      locale: loc, t: traducteur(loc),
    });
    const [titre, compte] = c[loc];
    dire(r.titre === titre && r.compte === compte && r.vide === c.vide,
      `${loc} ${c.quoi} → « ${r.titre} · ${r.compte} », vide=${r.vide}`);
  }
}

/* ── c) LE COMPOSANT LIT CETTE SOURCE, PAS UNE COPIE ────────────────────── */
console.log('c) DocumentsClient appelle la source');
const src = readFileSync(join(RACINE, 'app/[locale]/dashboard/minute-book/documents/DocumentsClient.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
dire(/resumeDeLaListe\(/.test(src), 'resumeDeLaListe( est appelé');
dire(/dansLaPortee\(/.test(src) && /porteeDepuisParametre\(/.test(src), 'dansLaPortee( et porteeDepuisParametre( sont appelés');
dire(!/document\$\{/.test(src), '⛔ plus de pluriel anglais codé en dur (`document${…}`)');
dire(!/search \|\| typeFilter \|\| langFilter/.test(src), '⛔ plus de l’ancienne condition du vide');

console.log(echecs === 0 ? '\n✔ check:documents — tout tient.' : `\n⛔ check:documents — ${echecs} garde(s) tombée(s).`);
process.exit(echecs === 0 ? 0 : 1);
