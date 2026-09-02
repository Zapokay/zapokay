/**
 * The nine shelves of the Livre, and how a document finds its shelf.
 *
 * WHY THIS MODULE EXISTS. `resolveMinuteBookSection` used to be private to
 * lib/upload-document.ts, so the import modal could not show the user the
 * section its upload would land in. Measured 2026-08-20: twelve user documents
 * had been filed into `resolutions` by a fallback table nobody had ever seen,
 * and no surface in the product filters or displays the section at all.
 *
 * Same problem, same fix, same shape as lib/requirement-doctype.ts — a table
 * pulled out of a server module so two callers share one truth instead of
 * writing the rule twice. Moving the WHOLE function (not just the table) is
 * deliberate: the modal's prefill IS the precedence rule, so leaving the rule
 * behind would only move the divergence one notch.
 *
 * ⚠️ CE FICHIER EST LA SEULE SOURCE. Le duplicata que ce commentaire annonçait
 * — le `SECTIONS` de app/api/minute-book/binder/route.ts, et le
 * `DOC_TYPE_SECTION_MAP` qui l'accompagnait — n'existe plus : la route importe
 * d'ici. Le type `SectionKey` de BinderView, lui aussi retapé à la main, DÉRIVE
 * désormais de `MinuteBookSection`. Ajouter une clé à la liste ci-dessous élargit
 * donc mécaniquement le type ; avant, rien n'échouait à la compilation pour le
 * rappeler, et son propre commentaire l'avouait.
 * ⚠️ Ne redéclare pas cette liste ailleurs. Importe-la.
 *
 * ⚠️ READ THIS BEFORE CHANGING THE PRECEDENCE. Since A2c the import form sends
 * the section it computed with THIS function, and the upload helper honours an
 * explicit value over deriving one. So on the upload path the server-side call
 * is now a GUARD — for a request that omits the field — and no longer the
 * reference computation. The client is what the user saw; the server checks it
 * is one of the nine. Both sides must still agree, which is why every input the
 * rule needs is a parameter rather than something one side happens to know.
 */

import type { ChecklistItem } from '@/app/api/minute-book/completeness/route';

/**
 * The nine sections, in the order the Livre displays them. Matches the
 * `documents_minute_book_section_check` constraint exactly, and the route's
 * `SECTIONS` order (see the duplicate note above).
 *
 * Labels are NOT here: they live in `minuteBook.binder.sections.<key>` in both
 * locales, so the import form can show the user the very tab name their piece
 * will land under.
 */
export const MINUTE_BOOK_SECTIONS = [
  'statuts',
  'avis',
  'reglements',
  'resolutions',
  'administrateurs',
  'dirigeants',
  'actionnaires',
  'registres',
  'autres',
] as const;

export type MinuteBookSection = (typeof MINUTE_BOOK_SECTIONS)[number];

/**
 * Guard for values arriving from the wire. The column carries a CHECK over
 * exactly these nine, so an unrecognized value must never reach the insert —
 * the caller falls back to resolving one instead.
 */
export function isMinuteBookSection(value: unknown): value is MinuteBookSection {
  return (
    typeof value === 'string' &&
    (MINUTE_BOOK_SECTIONS as readonly string[]).includes(value)
  );
}

/**
 * Last-resort shelf, by document type. Six of the nine sections are reachable
 * this way; `administrateurs`, `dirigeants` and `actionnaires` are not — only a
 * catalog requirement (or, now, an explicit choice) can reach those.
 */
export const DOC_TYPE_FALLBACK: Record<string, MinuteBookSection> = {
  statuts: 'statuts',
  resolution: 'resolutions',
  pv: 'resolutions',
  registre: 'registres',
  rapport: 'avis',
  autre: 'autres',
};

/**
 * Derive the section, in two steps, most specific first:
 *   1. the chosen requirement's own section;
 *   2. the document type's fallback shelf.
 *
 * ⚠️ IL Y AVAIT UNE TROISIÈME ÉTAPE, ENTRE LES DEUX, ET ELLE ÉTAIT FAUSSE.
 * « Documents fondateurs » — aucun exercice — classait le document à `statuts`.
 * Retirée : l'absence d'exercice est une propriété de l'ANNÉE, jamais une
 * affirmation sur la nature juridique de la pièce. Le raisonnement complet est
 * dans le corps de la fonction, à l'endroit exact où la branche vivait.
 *
 * ⚠️ `noFiscalYear` RESTE DANS LA SIGNATURE ET N'EST PLUS LU ICI.
 * Le champ voyage toujours sur le fil, et c'est correct : UploadDocumentModal
 * l'émet parce que ses trois états d'année — '' (rien de choisi), un nombre, et
 * 'none' — ne peuvent pas tenir sur `docYear` seul, où String('none') deviendrait
 * NaN puis null par accident. Ce mécanisme reste juste ; c'est son EFFET sur le
 * classement qui était faux. Le paramètre est gardé pour que son retrait chez
 * les trois appelants soit un lot à lui seul, décidé et mesuré.
 * ⚠️ Ne le rebranche pas sur le classement : c'est exactement le défaut qu'on
 * vient de retirer. Une année absente ne désigne aucune étagère.
 *
 * ⚠️ The requirement lookup matches on `requirement_key` ALONE, not on the year.
 * That is safe because `section` is a catalog property shared by every instance
 * of a key, but it is the only key lookup in the repo that omits the year.
 */
export function resolveMinuteBookSection(
  requirementKey: string | null,
  docType: string,
  requirements: ChecklistItem[],
  noFiscalYear: boolean,
): string | null {
  if (requirementKey) {
    const req = requirements.find((r) => r.requirement_key === requirementKey);
    if (req?.section) return req.section;
  }
  // ⚠️ ICI VIVAIT `if (noFiscalYear) return 'statuts';`. RETIRÉ, ET VOICI POURQUOI.
  // Le champ d'exercice décide de l'ANNÉE du document, pas de son classement au
  // Livre. « Ce document n'appartient à aucun exercice » ne dit rien sur le fait
  // qu'il soit un acte constitutif : un bail, une police d'assurance ou une fiche
  // technique n'ont pas davantage d'exercice, et n'ont rien à faire dans « Statuts
  // et actes constitutifs », qui est une étagère du livre officiel d'une société.
  // Le classement vient de l'EXIGENCE cochée, sinon du TYPE de document.
  // ★ Un document sans exercice ET portant une exigence fondationnelle continue
  // d'aller dans 'statuts' — parce que c'est l'exigence qui le dit, à la première
  // branche ci-dessus, jamais l'absence d'année.
  return DOC_TYPE_FALLBACK[docType] ?? null;
}
