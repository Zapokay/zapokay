import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date string from the DB into a JavaScript Date with the
 * intended local calendar components.
 *
 * ECMAScript 2024 §21.4.3.2 (Date Time String Format) treats the
 * date-only form YYYY-MM-DD as UTC midnight; in UTC-negative zones
 * (entire Canadian + US footprint) toLocaleDateString and local
 * component getters then shift to the previous calendar day. This
 * helper detects ISO DATE shape and appends 'T00:00:00' (no zone
 * designator), which flips the spec branch to local-time parsing.
 *
 * TIMESTAMPTZ strings (e.g. "2026-04-22T14:32:11+00:00") and other
 * inputs fall through to bare new Date() — zone info present means
 * the parse is already unambiguous.
 *
 * Returns a Date whose local components match the calendar date the
 * DB recorded. Use this anywhere a DB DATE string is parsed —
 * display via formatDate, arithmetic via local-component getters.
 */
export function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

/**
 * Format a date string for display, locale-aware (fr-CA / en-CA).
 * Parses safely via parseLocalDate. Accepts Intl.DateTimeFormatOptions
 * for per-surface format control; defaults to year-numeric /
 * month-long / day-numeric.
 */
export function formatDate(
  dateString: string,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return parseLocalDate(dateString).toLocaleDateString(
    locale === 'fr' ? 'fr-CA' : 'en-CA',
    options ?? { year: 'numeric', month: 'long', day: 'numeric' },
  );
}

export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
