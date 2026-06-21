// #137 — locale-aware share-class label for document rendering.
//
// EN-language documents render `name_en` when set, falling back to the FR `name`
// (NULL name_en → no regression on data captured before #137). The final `?? 'A'`
// default sits OUTSIDE the locale branch so it catches a null from EITHER side
// (i.e. a missing share class entirely), preserving the prior fallback behaviour.
export function pickShareClassName(
  raw: unknown,
  language: 'fr' | 'en',
): string {
  const sc = raw as { name: string; name_en: string | null } | null;
  return (language === 'en' ? (sc?.name_en ?? sc?.name) : sc?.name) ?? 'A';
}
