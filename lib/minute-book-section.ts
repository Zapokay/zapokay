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
 * ⚠️ THE ROUTE CARRIES A DUPLICATE OF THE NINE, AND IT IS KNOWN.
 * app/api/minute-book/binder/route.ts declares its own `SECTIONS` constant with
 * the same nine keys in the same order, and does NOT import them from here.
 * That is a scoping decision, not an oversight: touching a route inside an
 * interface batch is what makes a visual gate say nothing. Filed as "la route
 * binder redéclare l'ordre des neuf sections". A divergence that is written
 * down gets fixed; a silent one gets found by breaking it.
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
const DOC_TYPE_FALLBACK: Record<string, MinuteBookSection> = {
  statuts: 'statuts',
  resolution: 'resolutions',
  pv: 'resolutions',
  registre: 'registres',
  rapport: 'avis',
  autre: 'autres',
};

/**
 * Derive the section, in three steps, most specific first:
 *   1. the chosen requirement's own section;
 *   2. "Documents fondateurs" — no fiscal year at all — which files to `statuts`;
 *   3. the document type's fallback shelf.
 *
 * Step 2 sits between the other two on purpose. A chosen requirement is a
 * stronger statement than "this belongs to no year", so it must still win; and
 * "no year" is a stronger statement than a type default, which knows nothing
 * about the document beyond its shape.
 *
 * ⚠️ WHY `noFiscalYear` IS ITS OWN BOOLEAN AND NOT `docYear === 'none'`.
 * The form has three year states — '' (nothing picked), a number, and 'none'
 * (founding documents) — but only a number travels. UploadDocumentModal says so
 * where it builds the request: "'' and 'none' both mean 'no fiscal year': omit
 * the field rather than let String('none') reach the route, where numOrNull
 * would coerce it to NaN and answer null by accident." That comment is right and
 * stays. So the third state needs its own field on the wire; overloading
 * `docYear` to carry it is exactly the accident that comment prevents.
 *
 * ⚠️ The requirement lookup matches on `requirement_key` ALONE, not on the year.
 * That is safe because `section` is a catalog property shared by every instance
 * of a key, but it is the only key lookup in the repo that omits the year.
 *
 * `noFiscalYear` has NO default, deliberately: a caller that forgot it would
 * silently get `false`, which is the silent asymmetry this module exists to
 * prevent. tsc makes both callers decide.
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
  if (noFiscalYear) return 'statuts';
  return DOC_TYPE_FALLBACK[docType] ?? null;
}
