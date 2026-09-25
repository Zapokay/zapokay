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
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
/** `jsx: preserve` : tsx retombe sur `React.createElement` — même raison que check-inscription. */
Object.assign(globalThis, { React });
import { displayStateOf, displayStateLabelKey, titreAttenue } from '@/lib/minute-book/display-state';

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
  // V4 (point 8) : en minuscule dans la phrase — « 29 finaux », pas « 29 Finaux ».
  fr: {
    final: ['0 final', '1 final', '2 finaux'],
    draft: ['0 à finaliser', '1 à finaliser', '2 à finaliser'],
    missing: ['0 manquant', '1 manquant', '2 manquants'],
    upcoming: ['0 à venir', '1 à venir', '2 à venir'],
    archived: ['0 archivé', '1 archivé', '2 archivés'],
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

// ★ V2 — la métrique des sections du Livre (fini le ternaire codé en dur de BinderSection).
const SECTION_LIVRE: Record<'fr' | 'en', [string, string, string]> = {
  fr: ['0 document', '1 document', '2 documents'],
  en: ['0 documents', '1 document', '2 documents'],
};
for (const loc of ['fr', 'en'] as const) {
  const t = createTranslator({ locale: loc, messages: CATALOGUES[loc] as never, namespace: 'minuteBook.binder' as never }) as unknown as
    (cle: string, v: { count: number }) => string;
  [0, 1, 2].forEach((n) => {
    let rendu: string;
    try { rendu = t('sectionDocumentCount', { count: n }); } catch (e) { rendu = `ERREUR ${String(e)}`; }
    dire(rendu === SECTION_LIVRE[loc][n], `${loc} binder.sectionDocumentCount(${n}) = « ${rendu} »`);
  });
}

// ★ V4 (point 8) — le total de la ligne d'inventaire : « Total : 73 » (espace insécable) / « Total: 73 ».
const TOTAL: Record<'fr' | 'en', string> = { fr: 'Total : 73', en: 'Total: 73' };
for (const loc of ['fr', 'en'] as const) {
  const t = createTranslator({ locale: loc, messages: CATALOGUES[loc] as never, namespace: 'minuteBook.completeness' as never }) as unknown as
    (cle: string, v: { count: number }) => string;
  let rendu: string;
  try { rendu = t('totalCount', { count: 73 }); } catch (e) { rendu = `ERREUR ${String(e)}`; }
  dire(rendu === TOTAL[loc], `${loc} completeness.totalCount(73) = « ${rendu} »`);
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

/* ── d) UNE LIGNE « À FINALISER » N'EST JAMAIS ATTÉNUÉE (V4, point 9) ─────── */
console.log('d) atténuation du titre');
// ⚖️ Règle complète (V4, arrêt 2 ter) : atténuée = (final ET aucune déclaration due) OU à venir.
const attenue = titreAttenue as unknown as (s: string, o?: { declarationDue?: boolean }) => boolean;
dire(attenue('final', { declarationDue: false }) === true, 'final, rien à déclarer → titre atténué');
dire(attenue('final', { declarationDue: true }) === false, '⭐ final MAIS déclaration due → titre NON atténué');
dire(attenue('upcoming') === true, '⭐ à venir → titre atténué');
for (const s of ['draft', 'missing', 'archived'] as const) {
  dire(attenue(s) === false, `${s} → titre NON atténué`);
}
// ⛔ Et les deux lignes de Complétude en décident PAR ELLE, plus par `satisfied`.
for (const f of ['components/minute-book/RequirementRow.tsx', 'components/minute-book/EventActRow.tsx']) {
  const src = readFileSync(join(RACINE, f), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  dire(/attenue=\{titreAttenue\(displayState[,)]/.test(src), `${f} : le titre s'atténue par attenue={titreAttenue(displayState)}`);
  dire(!/attenue=\{[^}]*satisfied/.test(src), `${f} : ⛔ plus d'atténuation décidée par satisfied`);
}
// ⛔ V7a — ListRow est le SEUL à décider du titre : aucune page ne lui passe de classe de titre.
{
  const pages = ['components/documents/DocumentRow.tsx', 'components/minute-book/RequirementRow.tsx',
    'components/minute-book/EventActRow.tsx', 'components/minute-book/ArchiveDocRow.tsx', 'components/minute-book/BinderSection.tsx'];
  for (const f of pages) {
    dire(!/titleClassName/.test(readFileSync(join(RACINE, f), 'utf8')), `${f} : ⛔ aucune classe de titre passée à ListRow`);
  }
  const lr = readFileSync(join(RACINE, 'components/minute-book/ListRow.tsx'), 'utf8');
  dire(!/titleClassName/.test(lr), 'ListRow : la prop titleClassName n\'existe plus');
  dire(lr.includes("'text-[14.5px] font-medium text-[var(--text-heading)]'") && lr.includes("'text-[14.5px] font-medium text-[var(--text-muted)]'"),
    'ListRow : un titre (--text-heading) et UNE variante atténuée (--text-muted), même taille, même graisse');
  dire(/^\s*attenue\s*$/m.test(readFileSync(join(RACINE, 'components/minute-book/ArchiveDocRow.tsx'), 'utf8')),
    'ArchiveDocRow : attenue toujours vrai');
}

/* ── e) LA LIGNE DU LIVRE (V5) — par RENDU RÉEL, document fictif en mémoire ── */
console.log('e) la ligne du Livre');
// ⚠️ CHARGÉ ICI, PAS EN TÊTE : BinderSection et DownloadButton portent du JSX au niveau du module ;
// `React` doit être global AVANT leur évaluation (même raison que check-inscription).
const BinderSection = (require('../components/minute-book/BinderSection') as { default: unknown }).default;
const PIECES = [
  { id: '00000000-0000-4000-8000-0000000000a1', title: 'Pièce fictive A', document_type: 'pv',
    created_at: '2024-06-15T12:00:00Z', document_year: 2024, language: 'fr', file_url: 'x' },
  { id: '00000000-0000-4000-8000-0000000000a2', title: 'Pièce fictive B', document_type: 'autre',
    created_at: '2024-06-15T12:00:00Z', document_year: null, language: 'en', file_url: 'x' },
];
const MOTS: Record<'fr' | 'en', { pv: string; autre: string }> = {
  fr: { pv: 'Procès-verbal', autre: 'Autre' },
  en: { pv: 'Minutes', autre: 'Other' },
};
for (const loc of ['fr', 'en'] as const) {
  const html = renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: loc, messages: CATALOGUES[loc] as never, timeZone: 'America/Toronto',
      children: React.createElement(BinderSection as never, { index: 5, title: 'Section', documents: PIECES } as never),
    }),
  );
  dire(html.includes(`>${MOTS[loc].pv}<`) && html.includes(`>${MOTS[loc].autre}<`),
    `${loc} : la boîte de type emploie documents.types.* (« ${MOTS[loc].pv} », « ${MOTS[loc].autre} »)`);
  dire(!html.includes('>Document<') && !html.includes('>PV<'), `${loc} : ⛔ plus les mots de binder.typeLabels (« PV », « Document »)`);
  dire(html.includes('>FR<') && html.includes('>EN<'), `${loc} : le code de langue en texte (FR, EN)`);
  dire((html.match(/<span class="flex h-4 w-4 flex-shrink-0 items-center justify-center"><\/span>/g) ?? []).length === PIECES.length,
    `${loc} : la case de 16 px est RÉSERVÉE et VIDE sur chaque ligne (aucune pastille)`);
  dire(!html.includes('bg-[var(--warning-bg)]'), `${loc} : aucun badge d'état`);
  const classesTitre = Array.from(html.matchAll(/<span title="Pièce fictive [AB][^"]*" class="([^"]*)"/g)).map((m) => m[1]);
  dire(classesTitre.length === PIECES.length && classesTitre.every((c) => !c.includes('--text-muted')),
    `${loc} : aucun titre atténué`);
  dire(html.includes('2024-06-15'), `${loc} : la date garde son format (règle A) : « 2024-06-15 »`);
}

/* ── f) LA BARRE DE COMPLÉTUDE (V6) — par RENDU RÉEL, segments fictifs ──── */
console.log('f) la barre de Complétude');
// ⚠️ Chargé ici, pas en tête : même raison que BinderSection ci-dessus.
const CompletionBar = (require('../components/minute-book/CompletionBar') as { default: unknown }).default;
const FINAL = { satisfied: true, source: 'uploaded', document_is_finalized: true };
const BROUILLON = { satisfied: true, source: 'generated', document_is_finalized: false };
const MANQUANT = { satisfied: false, source: null, availability: 'open' };
const A_VENIR = { satisfied: false, source: null, availability: 'upcoming' };
const serie = (n: number, x: object) => Array.from({ length: n }, () => x);
function barre(loc: 'fr' | 'en', items: object[]) {
  return renderToStaticMarkup(
    React.createElement(NextIntlClientProvider, {
      locale: loc, messages: CATALOGUES[loc] as never, timeZone: 'America/Toronto',
      children: React.createElement(CompletionBar as never, { items } as never),
    }),
  );
}
const TREIZE = [...serie(4, FINAL), ...serie(7, BROUILLON), ...serie(2, MANQUANT)];
const NOM: Record<'fr' | 'en', string> = { fr: '4 documents finaux sur 13', en: '4 final documents of 13' };
for (const loc of ['fr', 'en'] as const) {
  const h = barre(loc, TREIZE);
  dire(h.includes('>4/13<'), `${loc} : le compteur compte les FINAUX seuls — 4 finaux, 7 brouillons, 2 manquants → « 4/13 »`);
  dire(h.includes(`>${NOM[loc]}<`) && h.includes('sr-only'), `${loc} : nom accessible « ${NOM[loc]} »`);
}
{
  const h = barre('fr', [FINAL, MANQUANT, A_VENIR]);
  dire((h.match(/border-\[var\(--error-text\)\]/g) ?? []).length === 1, 'à venir n\'est PAS rouge : un seul segment en --error-text (le manquant)');
  dire((h.match(/border-dashed border-\[var\(--nontext-muted\)\]/g) ?? []).length === 1, 'à venir : tirets gris (--nontext-muted, V7a)');
  dire(h.includes('>1/3<'), 'à venir hors du compte : « 1/3 »');
}
{
  const douze = barre('fr', serie(12, FINAL));
  dire((douze.match(/width:11px;height:11px/g) ?? []).length === 12 && !douze.includes('width:154px'),
    '12 lignes → 12 carrés de 11 px, pas de barre continue');
  const h = barre('fr', TREIZE);
  dire(!h.includes('width:11px') && (h.match(/width:154px/g) ?? []).length === 1,
    '13 lignes → UNE barre continue de 154 px (la largeur de 12 carrés), aucun carré');
  const parts = Array.from(h.matchAll(/<div class="([^"]*)" style="width:([0-9.]+)%/g)).map((m) => ({ c: m[1], w: Number(m[2]) }));
  const attendu = [['bg-emerald-600', 4], ['bg-amber-500', 7], ['--error-text', 2]] as const;
  dire(parts.length === 3 && attendu.every(([c, n], i) => parts[i].c.includes(c) && Math.abs(parts[i].w - (n / 13) * 100) < 1e-6),
    'parts proportionnelles, dans l\'ordre final · brouillon · (à venir absent : 0) · manquant');
  const h2 = barre('fr', [...serie(2, FINAL), ...serie(3, MANQUANT), ...serie(4, A_VENIR), ...serie(4, BROUILLON)]);
  const ordre = Array.from(h2.matchAll(/<div class="([^"]*)" style="width:[0-9.]+%/g)).map((m) => m[1]);
  dire(ordre.length === 4 && ordre[0].includes('emerald') && ordre[1].includes('amber') && ordre[2].includes('--nontext-muted') && ordre[3].includes('--error-text'),
    'ordre des parts : final · brouillon · à venir · manquant, quel que soit l\'ordre des lignes');
}

/* ── g) LA LIGNE D'ARCHIVE (V6) — sur ListRow, document fictif en mémoire ─── */
console.log('g) la ligne d\'archive');
const ArchiveDocRow = (require('../components/minute-book/ArchiveDocRow') as { default: unknown }).default;
const ETIQ: Record<'fr' | 'en', { oui: string; non: string; voir: string; remplacer: string; autre: string }> = {
  fr: { oui: 'Archivé · certifié', non: 'Archivé', voir: 'Voir', remplacer: 'Remplacer', autre: 'Autre' },
  en: { oui: 'Archived · certified', non: 'Archived', voir: 'View', remplacer: 'Replace', autre: 'Other' },
};
for (const loc of ['fr', 'en'] as const) {
  for (const certifie of [true, false]) {
    const doc = { id: '00000000-0000-4000-8000-0000000000b1', title: 'Constat fictif', document_type: 'autre', language: 'fr',
      document_year: 2018, created_at: '2018-05-10T12:00:00Z', source: 'uploaded', is_finalized: certifie, file_url: 'x' };
    const h = renderToStaticMarkup(
      React.createElement(NextIntlClientProvider, {
        locale: loc, messages: CATALOGUES[loc] as never, timeZone: 'America/Toronto',
        children: React.createElement(ArchiveDocRow as never, { doc, onReplace: () => {} } as never),
      }),
    );
    const q = `${loc} ${certifie ? 'certifiée' : 'non certifiée'}`;
    dire(h.includes('h-[72px]') && h.includes('pl-[26px]'), `${q} : la ligne est sur ListRow (deux bandes)`);
    dire(h.includes(`>${certifie ? ETIQ[loc].oui : ETIQ[loc].non}<`), `${q} : état « ${certifie ? ETIQ[loc].oui : ETIQ[loc].non} »`);
    dire(h.includes(`title="Constat fictif"`), `${q} : titre avec title=`);
    dire(h.includes(`>${ETIQ[loc].autre}<`) && h.includes('>FR<'), `${q} : boîte d'identité « ${ETIQ[loc].autre} | FR »`);
    dire(h.includes(`aria-label="${ETIQ[loc].voir}"`) && h.includes(`${ETIQ[loc].remplacer}<`), `${q} : Voir en œil, mot « ${ETIQ[loc].remplacer} »`);
    dire((h.match(/<span aria-hidden="true" class="invisible h-\[26px\] w-\[26px\]"><\/span>/g) ?? []).length === 2,
      `${q} : colonne d'icônes de Complétude — téléchargement et « ··· » réservés, invisibles`);
    dire(!h.includes('2018-05-10') && !h.includes('/api/documents/00000000-0000-4000-8000-0000000000b1/download"'),
      `${q} : aucune date (règle A), aucun téléchargement ajouté`);
  }
}

console.log(echecs === 0 ? '\n✔ check:etats — tout tient.' : `\n⛔ check:etats — ${echecs} garde(s) tombée(s).`);
process.exit(echecs === 0 ? 0 : 1);
