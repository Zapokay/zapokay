/**
 * The ONE display-name format for row labels across surfaces (A3 board,
 * Complétude, Documents/Vault, Livre/Binder): {title} · {person} · {year} —
 * middot-joined, each segment appended ONLY when present. Every caller composes
 * through this so a separator change is one edit. Neutral module (no obligations
 * / minute-book / event coupling) so any surface can import it.
 */
export function composeDisplayName(
  title: string,
  person?: string | null,
  year?: number | null,
): string {
  const parts = [title];
  if (person != null) parts.push(person);
  if (year != null) parts.push(String(year));
  return parts.join(' · ');
}
