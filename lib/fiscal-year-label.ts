/**
 * Canonical fiscal-year display label.
 *
 * Returns the user-facing label for a fiscal year, locale-aware.
 *   FR: "Exercice 2026"
 *   EN: "Fiscal Year 2026"  (capital Y per CLAUDE.md §2 / FY-CAP-1, locked 2026-05-04)
 *
 * Usage:
 *   import { getFiscalYearLabel } from '@/lib/fiscal-year-label';
 *   const label = getFiscalYearLabel(2026, locale);
 *
 * Why this lives in lib/ (not in messages/*.json):
 *   The label is constructed from a runtime numeric `year` parameter.
 *   ICU MessageFormat with {year} also works (see messages/*.json yearSuffix
 *   for the parenthesized variant), but the bare label is short, used in
 *   many TSX call sites that don't already pull useTranslations(), and
 *   sufficiently uniform across surfaces that a 5-line helper is leaner
 *   than wiring useTranslations() into each.
 *
 * If you need the parenthesized "(Fiscal Year 2026)" wrapper used by Livre
 * row titles, use the `documents.yearSuffix` ICU key from messages/*.json
 * instead — that variant is already i18n-correct.
 */
export function getFiscalYearLabel(year: number, locale: string): string {
  return locale === 'fr' ? `Exercice ${year}` : `Fiscal Year ${year}`;
}
