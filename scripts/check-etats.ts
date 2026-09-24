/**
 * LES CINQ ÉTATS AFFICHÉS — LA SOURCE UNIQUE ET SES DEUX CATALOGUES (lot V1).
 *
 * Run via:
 *   npm run check:etats   → rc=1 à la première garde qui tombe
 *
 * ★ TROIS GARDES, UNE PAR FAÇON DE MENTIR :
 *   a) displayStateOf / displayStateLabelKey, par une table de cas — dont un
 *      cas NÉGATIF : un brouillon sur une fenêtre fermée reste « draft ».
 *   b) la famille `documentState` existe en FR ET en EN, non vide, et ses
 *      formes de compte rendent 0, 1 et 2 avec le vrai moteur ICU de next-intl.
 *   c) les anciens libellés d'état ont quitté les catalogues : en valeur EXACTE
 *      partout, et trois fragments en SOUS-CHAÎNE hors liste blanche nommée.
 * ⚠️ tsc ne voit rien de tout ça : une valeur de catalogue n'est pas un type.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { displayStateOf, displayStateLabelKey } from '@/lib/minute-book/display-state';

const RACINE = process.cwd();
let echecs = 0;
function dire(ok: boolean, quoi: string) {
  console.log(`  ${ok ? '✔' : '⛔'} ${quoi}`);
  if (!ok) echecs++;
}

type Arbre = { [k: string]: string | Arbre };
function aplatir(d: Arbre, p = ''): [string, string][] {
  return Object.entries(d).flatMap(([k, v]) =>
    typeof v === 'string' ? [[p ? `${p}.${k}` : k, v] as [string, string]] : aplatir(v, p ? `${p}.${k}` : k),
  );
}
const CATALOGUES = {
  fr: JSON.parse(readFileSync(join(RACINE, 'messages/fr.json'), 'utf8')) as Arbre,
  en: JSON.parse(readFileSync(join(RACINE, 'messages/en.json'), 'utf8')) as Arbre,
};

/* ── a) LA TABLE DE CAS ─────────────────────────────────────────────────── */
console.log('a) displayStateOf — table de cas');
const CAS: { quoi: string; entree: Parameters<typeof displayStateOf>[0]; attendu: string }[] = [
  { quoi: 'téléversé certifié → final', entree: { documentState: 'téléversé' }, attendu: 'final' },
  { quoi: 'téléversé NON certifié (state.ts le range en généré) → draft', entree: { documentState: 'généré' }, attendu: 'draft' },
  { quoi: 'généré → draft', entree: { documentState: 'généré', availability: 'open' }, attendu: 'draft' },
  { quoi: 'manquant, fenêtre ouverte → missing', entree: { documentState: 'missing', availability: 'open' }, attendu: 'missing' },
  { quoi: 'manquant, sans fenêtre (un acte) → missing', entree: { documentState: 'missing' }, attendu: 'missing' },
  { quoi: 'manquant + fenêtre fermée → upcoming', entree: { documentState: 'missing', availability: 'upcoming' }, attendu: 'upcoming' },
  { quoi: 'archive, même finale → archived', entree: { documentState: 'téléversé', isArchived: true }, attendu: 'archived' },
];
for (const c of CAS) {
  const obtenu = displayStateOf(c.entree);
  dire(obtenu === c.attendu, `${c.quoi} (obtenu : ${obtenu})`);
}
// ⛔ LE CAS NÉGATIF : la fenêtre ne décide QUE pour un manquant (CompletenessPage:266-267).
dire(
  displayStateOf({ documentState: 'généré', availability: 'upcoming' }) !== 'upcoming',
  'un brouillon sur une fenêtre fermée N\'EST PAS « upcoming »',
);
dire(displayStateLabelKey('archived', { certified: true }) === 'archivedCertified', 'archive certifiée → libellé archivedCertified');
dire(displayStateLabelKey('archived') === 'archived', 'archive non certifiée → libellé archived');
dire(displayStateLabelKey('final', { certified: true }) === 'final', 'la certification ne nuance QUE l\'archive');

/* ── b) LA FAMILLE, DANS LES DEUX LANGUES ───────────────────────────────── */
console.log('b) documentState — FR et EN');
const LIBELLES = ['final', 'draft', 'missing', 'upcoming', 'archived', 'archivedCertified'];
const COMPTES = ['final', 'draft', 'missing', 'upcoming', 'archived'] as const;
for (const loc of ['fr', 'en'] as const) {
  const plat = new Map(aplatir(CATALOGUES[loc]));
  for (const k of LIBELLES) {
    const v = plat.get(`documentState.${k}`);
    dire(typeof v === 'string' && v.trim() !== '', `${loc} documentState.${k} = « ${v ?? 'ABSENTE'} »`);
  }
}
const ATTENDUS: Record<'fr' | 'en', Record<(typeof COMPTES)[number], [string, string, string]>> = {
  fr: {
    final: ['0 Final', '1 Final', '2 Finaux'],
    draft: ['0 À finaliser', '1 À finaliser', '2 À finaliser'],
    missing: ['0 Manquant', '1 Manquant', '2 Manquants'],
    upcoming: ['0 À venir', '1 À venir', '2 À venir'],
    archived: ['0 Archivé', '1 Archivé', '2 Archivés'],
  },
  en: {
    final: ['0 Final', '1 Final', '2 Final'],
    draft: ['0 Pending', '1 Pending', '2 Pending'],
    missing: ['0 Missing', '1 Missing', '2 Missing'],
    upcoming: ['0 Upcoming', '1 Upcoming', '2 Upcoming'],
    archived: ['0 Archived', '1 Archived', '2 Archived'],
  },
};
for (const loc of ['fr', 'en'] as const) {
  const t = createTranslator({ locale: loc, messages: CATALOGUES[loc] as never, namespace: 'documentState' as never }) as unknown as
    (cle: string, v: { count: number }) => string;
  for (const k of COMPTES) {
    [0, 1, 2].forEach((n) => {
      let rendu: string;
      try { rendu = t(`count.${k}`, { count: n }); } catch (e) { rendu = `ERREUR ${String(e)}`; }
      dire(rendu === ATTENDUS[loc][k][n], `${loc} count.${k}(${n}) = « ${rendu} »`);
    });
  }
}

/* ── c) LES ANCIENS LIBELLÉS SONT SORTIS ────────────────────────────────── */
console.log('c) anciens libellés d\'état');
// ⛔ EN VALEUR EXACTE, jamais en sous-chaîne : « Back to sign in » et « un modèle à signer »
//    (auth.*.backToLogin, documents.upload.replaceWarningBody) sont de la prose et doivent rester.
const INTERDITS_EXACTS = [
  'À signer', 'To sign', 'à signer', 'to sign', 'À générer ou à téléverser',
  'Classé aux archives', 'Final (Signé et téléversé)', 'Archivée', 'Archivée · certifiée',
];
const INTERDITS_FRAGMENTS = ['Catch up', 'unfiled', 'No fiscal year'];
// ★ LA LISTE BLANCHE, CLÉ PAR CLÉ (décision C, 2026-09-24) : des phrases où « catch up » est un verbe.
const LISTE_BLANCHE = new Set([
  'en:dashboard.statusVerdict.attention.support',
  'en:minuteBook.completeness.noDocumentsForYear',
  'en:minuteBook.bulkCatchUp.button.label',
  'en:minuteBook.bulkCatchUp.button.overCapTooltip',
  'en:minuteBook.bulkCatchUp.modal.title',
  'en:minuteBook.bulkCatchUp.modal.success.title',
  'en:minuteBook.bulkCatchUp.modal.success.partialTitle',
  'en:minuteBook.bulkCatchUp.modal.success.partialRetryHelper',
  'en:minuteBook.bulkCatchUp.modal.success.failureBody',
]);
let exacts = 0;
let fragments = 0;
for (const loc of ['fr', 'en'] as const) {
  for (const [k, v] of aplatir(CATALOGUES[loc])) {
    if (INTERDITS_EXACTS.includes(v)) {
      exacts++;
      dire(false, `${loc} ${k} vaut encore « ${v} » (valeur exacte interdite)`);
    }
    const f = INTERDITS_FRAGMENTS.find((x) => v.includes(x));
    if (f && !LISTE_BLANCHE.has(`${loc}:${k}`)) {
      fragments++;
      dire(false, `${loc} ${k} contient « ${f} » hors liste blanche : « ${v.slice(0, 80)} »`);
    }
  }
}
if (exacts === 0) dire(true, `aucune valeur exacte interdite (${INTERDITS_EXACTS.length} cherchées)`);
if (fragments === 0) dire(true, `aucun fragment interdit hors liste blanche (${LISTE_BLANCHE.size} clés blanchies)`);
// ★ CONTRÔLE POSITIF : la liste blanche doit encore TROUVER ce qu'elle excuse, sinon elle ne prouve rien.
const trouveBlanche = aplatir(CATALOGUES.en).some(
  ([k, v]) => LISTE_BLANCHE.has(`en:${k}`) && INTERDITS_FRAGMENTS.some((x) => v.includes(x)),
);
dire(trouveBlanche, 'contrôle positif : le balayage des fragments voit bien « Catch up » dans une clé blanchie');

console.log(echecs === 0 ? '\n✔ check:etats — tout tient.' : `\n⛔ check:etats — ${echecs} garde(s) tombée(s).`);
process.exit(echecs === 0 ? 0 : 1);
