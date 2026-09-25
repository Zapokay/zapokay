import { getFiscalYearLabel } from '@/lib/fiscal-year-label';

/**
 * LA PORTÉE DU COFFRE ET L'EN-TÊTE DE SA LISTE — une seule source (lot V3, 2026-09-24).
 *
 * ★ Pur : ni React, ni supabase. DocumentsClient l'appelle pour FILTRER et pour
 * TITRER ; check:documents l'appelle avec le vrai catalogue. Les deux lisent donc
 * le même code, jamais une copie.
 *
 * ⚖️ DÉCISION DE DOM (P2) : la PORTÉE est ce que désigne le filtre d'exercice —
 * tout le coffre, un exercice, ou « Hors exercice ». M = documents dans la portée ;
 * N = affichés après recherche, type et langue. N = M → « M documents » ;
 * N < M → « N sur M documents ». Un exercice vide dit « 0 document » (forme =0).
 * ⚠️ Un document d'une année d'ARCHIVE compte dans « Tous » et aucune option ne le
 * filtre (connu, 0 cas au 2026-09-24) : Documents ignore les années d'archive.
 */

export type PorteeExercice =
  | { kind: 'all' }
  | { kind: 'nofiscalyear' }
  | { kind: 'year'; year: number };

/**
 * `?year=` → portée. ⚠️ LES DEUX ANCIENNES VALEURS D'URL RESTENT ACCEPTÉES
 * (`unclassified`, `foundational`) : un signet ne doit jamais retomber en silence
 * sur « Tous les exercices ». Un nombre illisible (NaN, 0) affichait DÉJÀ tout
 * (`!activeYear` à l'ancienne ligne de filtre) : il reste « tout », et le dit.
 */
export function porteeDepuisParametre(yearParam: string | null): PorteeExercice {
  if (yearParam === null || yearParam === 'all') return { kind: 'all' };
  if (yearParam === 'unclassified' || yearParam === 'foundational') return { kind: 'nofiscalyear' };
  const year = parseInt(yearParam, 10);
  return year ? { kind: 'year', year } : { kind: 'all' };
}

/** Un document est-il dans la portée ? Même prédicat qu'avant, déplacé. */
export function dansLaPortee(documentYear: number | null, portee: PorteeExercice): boolean {
  if (portee.kind === 'all') return true;
  if (portee.kind === 'nofiscalyear') return documentYear === null;
  return documentYear === portee.year;
}

/** Le traducteur du namespace `documents`, tel que useTranslations ou createTranslator le donnent. */
type TraducteurDocuments = (cle: string, valeurs?: Record<string, number>) => string;

export interface ResumeDeLaListe {
  titre: string;
  compte: string;
  /** null = la liste a des lignes ; sinon, laquelle des deux phrases vides. */
  vide: null | 'coffreVide' | 'aucunResultat';
}

export function resumeDeLaListe(entree: {
  portee: PorteeExercice;
  /** Tout le coffre, sans aucun filtre. */
  totalCoffre: number;
  /** M — dans la portée d'exercice. */
  totalPortee: number;
  /** N — affichés après recherche, type et langue. */
  affiches: number;
  locale: string;
  t: TraducteurDocuments;
}): ResumeDeLaListe {
  const { portee, totalCoffre, totalPortee, affiches, locale, t } = entree;
  const titre =
    portee.kind === 'all'
      ? t('filterAllYears')
      : portee.kind === 'nofiscalyear'
        ? t('filterNoFiscalYear')
        : getFiscalYearLabel(portee.year, locale);
  const compte =
    affiches === totalPortee
      ? t('documentCountAll', { count: totalPortee })
      : t('documentCountOf', { shown: affiches, total: totalPortee });
  // ⚖️ D6 : le COFFRE vide invite à déposer ; tout autre vide dit « aucun résultat »,
  // exercice compris — l'ancienne condition oubliait le filtre d'exercice.
  const vide = affiches > 0 ? null : totalCoffre === 0 ? 'coffreVide' : 'aucunResultat';
  return { titre, compte, vide };
}
