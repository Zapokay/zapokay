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
 * Derive the section either from the chosen requirement (preferred) or from the
 * document type. Moved verbatim from lib/upload-document.ts — same signature,
 * same precedence, same `string | null` return.
 *
 * ⚠️ The requirement lookup matches on `requirement_key` ALONE, not on the year.
 * That is safe because `section` is a catalog property shared by every instance
 * of a key, but it is the only key lookup in the repo that omits the year.
 */
export function resolveMinuteBookSection(
  requirementKey: string | null,
  docType: string,
  requirements: ChecklistItem[],
): string | null {
  if (requirementKey) {
    const req = requirements.find((r) => r.requirement_key === requirementKey);
    if (req?.section) return req.section;
  }
  return DOC_TYPE_FALLBACK[docType] ?? null;
}
