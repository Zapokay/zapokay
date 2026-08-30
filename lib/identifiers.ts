// Company identifiers — ONE canonical form, so that the value VALIDATED, the value
// WRITTEN and the value COMPARED are the same string.
//
// Origin: the identifier investigation of 2026-08-30, measured against the live park.
// Three sites disagreed about what "the NEQ" was. StepCompany masked keystrokes with
// `replace(/\D/g,'').slice(0,10)` but validated only emptiness; OnboardingFlow wrote
// `incorporationNumber || null` with NO trim; SettingsClient wrote `.trim()`; and
// /api/onboarding/check-identifier compared `value.trim()` through `.eq()`. So the
// string the form checked for duplicates was not always the string it stored.
//
// ⚠️ THE ASYMMETRY BETWEEN THE TWO IDENTIFIERS IS DELIBERATE, NOT AN OVERSIGHT.
// The NEQ gets a format guard; the federal corporation number gets NONE. Measured
// against the park before the guard was posed — a rule written without looking at the
// data rejects legitimate rows, which is what killed the "obvious" key of 4450f12:
//   · neq: 12 rows out of 12, every one EXACTLY ten digits. A strict guard rejects
//     ZERO existing rows. 12 distinct raw, 12 distinct normalized — normalizing
//     creates no collision.
//   · corporation_number: 5 non-null values in TWO shapes — three like `1709431-1`
//     (seven digits, hyphen, check digit) and two twelve-digit strings. No format is
//     settled, older numbers are an open question with Harvey, and the cost asymmetry
//     runs the other way: a malformed number is repairable in Settings, a REJECTED
//     legitimate one loses a customer at signup. See the sourced comment above the
//     field in StepCompany.tsx.

/** The NEQ is exactly ten digits. Measured: true of 12 park rows out of 12. */
const NEQ_LENGTH = 10;

/**
 * Canonical form of a Québec NEQ.
 * - Keeps digits only (a pasted `1234-567-890` becomes `1234567890`)
 * - Truncates to ten digits
 * - Never returns null/undefined; an absent value becomes the empty string
 *
 * This is the keystroke mask that already lived in StepCompany and SettingsClient,
 * extracted so the same rule applies to values that never pass through a keystroke —
 * a session draft, a row read back from the database, a paste.
 *
 * Examples:
 *   "1234567890"    → "1234567890"
 *   " 1234 567 890" → "1234567890"
 *   "12345678901"   → "1234567890"   (truncated)
 */
export function normalizeNeq(input: string | null | undefined): string {
  return (input ?? '').replace(/\D/g, '').slice(0, NEQ_LENGTH);
}

/**
 * Is this a well-formed NEQ? Exactly ten digits, nothing else.
 * The empty string is NOT valid here — emptiness is a separate message
 * (`common.neqRequired`), so callers must test emptiness first.
 */
export function isValidNeq(input: string | null | undefined): boolean {
  return /^[0-9]{10}$/.test(input ?? '');
}

/**
 * Canonical form of a federal corporation number.
 * - Trims surrounding whitespace, and NOTHING ELSE
 *
 * ⚠️ IT DOES NOT STRIP THE HYPHEN, AND THAT IS THE POINT. The hyphen is presentation
 * — Corporations Canada prints `1709431-1` on the certificate and `17094311` in the
 * online registry for the same corporation — but stripping it here would rewrite what
 * the user typed and would disagree with the three park rows already stored WITH it.
 * Reconciling the two spellings needs the unique index rebuilt on a normalized form
 * plus a backfill, i.e. a migration. That is a separate lot; this function exists so
 * that today, at least, the value compared is the value stored.
 *
 * ⚠️ AND THERE IS NO isValidCorporationNumber(). Deliberately. No format is settled.
 */
export function normalizeCorporationNumber(input: string | null | undefined): string {
  return (input ?? '').trim();
}
